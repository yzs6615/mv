import * as THREE from 'three';
import { PMAX } from './figure_cloth.js';

// Particle shader for the figures of light. One source, four modes (separate draw calls, no divergence):
//   MODE 0 body   — linear-blend skinned surface + inner volume particles
//   MODE 1 cloth  — guide-texture interpolated gown / hair / cape particles (+ pleats, strands)
//   MODE 2 sparks — hosted on body particles, detach and RISE (ink falls, light rises), trail the motion
//   MODE 3 aura   — few large faint particles just outside the body
// Energy-conserving point sizes (clamped minimum size / depth-of-field bokeh spread the same energy),
// stochastic culling of huge bokeh discs to bound fill rate, rim emphasis for silhouette legibility.
// Output: additive colour, alpha = coverage (the lovers' colour-keep mask).

export const FIG_VERT = /* glsl */`
precision highp float;
uniform mat4 uBones[NB];
uniform sampler2D uCloth;
uniform float uTime, uResY, uSizeW, uMinPx, uMaxPx, uBright, uKeep;
uniform vec3 uCore, uHalo;
uniform float uRimPow, uRimGain, uBack, uFace, uInner, uIrid, uShimmer, uGlint, uHot;
uniform float uDissolve, uDim, uAura, uSparks, uSparkRise;
uniform vec4 uCollapse; uniform float uCollapseR;
uniform float uFocus, uAperture;
uniform vec3 uVel;
uniform vec4 uPulse; uniform vec3 uPulseP;
uniform vec4 uFade;
uniform float uSizeMul, uLift;
attribute vec4 aB;
attribute vec4 aR;
attribute float aE;
varying vec3 vCol; varying float vA; varying float vDisc; varying float vHot;

float h1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }

vec3 clothP(float row, float v, float P){
  float x = v * (P - 1.); float i = floor(x); float f = x - i;
  vec3 a = texelFetch(uCloth, ivec2(int(i), int(row)), 0).xyz;
  vec3 b = texelFetch(uCloth, ivec2(int(min(i + 1., P - 1.)), int(row)), 0).xyz;
  return mix(a, b, f);
}
vec3 clothN(float row, float v, float P){
  float x = v * (P - 1.); float i = floor(x); float f = x - i;
  vec3 a = texelFetch(uCloth, ivec2(int(i) + ${PMAX}, int(row)), 0).xyz;
  vec3 b = texelFetch(uCloth, ivec2(int(min(i + 1., P - 1.)) + ${PMAX}, int(row)), 0).xyz;
  return mix(a, b, f);
}

void cull(){ gl_Position = vec4(0., 0., -2., 1.); gl_PointSize = 0.; vCol = vec3(0.); vA = 0.; vDisc = 0.; vHot = 0.; }

void main(){
  vec3 p, n; float inner = 0.; float tag = aB.w; float gain = 1.; float sizeMul = uSizeMul;
#if MODE == 1
  // ---- cloth: interpolate guides
  float row0 = normal.x, rows = normal.y, P = normal.z; bool wrap = aB.w > 0.5;
  tag = aB.z;
  float u = position.x, v = position.y;
  float ur = wrap ? u * rows : u * (rows - 1.);
  float ra = floor(ur); float fr = ur - ra;
  float rb = wrap ? mod(ra + 1., rows) : min(ra + 1., rows - 1.);
  vec3 pa = clothP(row0 + ra, v, P), pb = clothP(row0 + rb, v, P);
  p = mix(pa, pb, fr);
  n = normalize(mix(clothN(row0 + ra, v, P), clothN(row0 + rb, v, P), fr) + 1e-5);
  vec3 tu = pb - pa; float tl = max(length(tu), 1e-5); tu /= tl;
  if (tag > 1.5 && tag < 2.5) {
    // hair: strands — a gentle wave along each strand, thinner sheet at the tips
    float st = aB.x;
    float w = sin(v * 19. + st * 1.7) * 0.0045 + sin(v * 7. + st * 0.37) * 0.004;
    p += tu * w + n * (position.z + 0.006 * sin(st * 2.3));
    gain = 1.0 - 0.55 * smoothstep(0.75, 1.0, v);
    sizeMul *= 0.62; gain *= 1.7;
  } else {
    // gown/cape folds: pleats around, deeper toward the hem
    float K = aB.x, amp = aB.y * smoothstep(0.04, 0.55, v) * (1. - 0.6 * smoothstep(0.93, 1.0, v));
    float ang = u * K * 6.2831853;
    p += n * (amp * cos(ang) + position.z);
    float ds = wrap ? rows * tl : (rows - 1.) * tl;
    n = normalize(n + tu * (amp * 6.2831853 * K / max(ds, 1e-4)) * sin(ang));
    // fold crests catch the light: vertical lines of light down the gown / cape
    gain *= 1. + 0.55 * cos(ang) * smoothstep(0.08, 0.5, v);
  }
#else
  // ---- skinned
  mat4 B0 = uBones[int(aB.x)]; mat4 B1 = uBones[int(aB.y)];
  vec4 rp = vec4(position, 1.);
  p = (B0 * rp * aB.z + B1 * rp * (1. - aB.z)).xyz;
  vec3 nn = mat3(B0) * normal * aB.z + mat3(B1) * normal * (1. - aB.z);
  float nl = length(nn);
  inner = 1. - step(0.01, nl);
  n = nl > 0.01 ? nn / nl : vec3(0., 0., 1.);
#endif

  // per-particle randoms
  float r0 = aR.x, r1 = aR.y, r2 = aR.z, r3 = aR.w;
  float r4 = h1(r0 * 91.7 + r1 * 13.1), r5 = h1(r2 * 57.3 + r3 * 7.9);

#if MODE == 2
  // ---- sparks: detach from the host point and rise, leave the moving body behind
  if (r3 > uSparks) { cull(); return; }
  float period = mix(1.8, 4.2, r1);
  float ph = fract(uTime / period + r2);
  float age = ph * period;
  vec3 sway = vec3(sin(uTime * 1.3 + r0 * 40.) , 0., cos(uTime * 1.1 + r1 * 40.)) * 0.035 * age;
  p += n * (0.006 + 0.02 * age) + vec3(0., 1., 0.) * uSparkRise * (0.04 * age + 0.07 * age * age) + sway - uVel * age;
  sizeMul *= mix(1.25, 0.7, ph);
  gain *= smoothstep(0.0, 0.12, ph) * (1. - smoothstep(0.3, 1.0, ph)) * 2.4 / (sizeMul * sizeMul);
  inner = 1.;
#endif
#if MODE == 3
  // ---- aura: large, faint, just outside the body
  p += n * (0.03 + 0.06 * r0);
  sizeMul *= mix(10., 22., r1);
  gain *= uAura * 0.6 / (sizeMul * sizeMul);
  inner = 1.;
  if (uAura <= 0.001) { cull(); return; }
#endif

  // ---- dissolve: particles detach upward and fade (from the top down, ragged)
  float fade = 1.;
  if (uDissolve > 0.) {
    float th = r2 * 0.7 + clamp(1. - p.y / 1.9, 0., 1.) * 0.3;
    float dz = clamp((uDissolve * 1.4 - th) / 0.4, 0., 1.);
    p += vec3(sin(r0 * 40. + uTime * 0.9) * 0.18, 1.3 + r1, cos(r1 * 40. + uTime * 0.7) * 0.18) * dz * dz * (0.6 + r4);
    fade *= 1. - smoothstep(0.35, 1., dz);
    gain *= 1. + dz * 1.5 * (1. - dz);
  }
  // ---- collapse: spiral into a bright point / small sphere
  if (uCollapse.w > 0.) {
    float st = r5 * 0.4;
    float k = smoothstep(st, st + 0.6, uCollapse.w);
    vec3 dc = normalize(vec3(r0 - .5, r1 - .5, r4 - .5) + 1e-3);
    vec3 tgt = uCollapse.xyz + dc * uCollapseR * r3 * r3;
    vec3 rel = p - uCollapse.xyz;
    float ang = k * (1. - k) * 5. + k * 1.2;
    float ca = cos(ang), sa = sin(ang);
    rel.xz = vec2(ca * rel.x - sa * rel.z, sa * rel.x + ca * rel.z);
    float e = k * k * (3. - 2. * k);
    p = mix(uCollapse.xyz + rel * (1. - 0.3 * e), tgt, e);
    n = normalize(mix(n, dc, e));
    // energy concentrates: thin the light so the merged point stays a compact star
    gain *= mix(1., 0.035, e * e) * (1. + 1.5 * k * (1. - k));
    sizeMul *= mix(1., 0.6, e);
  }
  // ---- part fade (high-detail arm: dissolve into darkness toward the shoulder)
  if (uFade.w > 0.) fade *= smoothstep(uFade.w * 0.25, uFade.w, length(p - uFade.xyz));
  else if (uFade.w < 0.) fade *= 1. - smoothstep(-uFade.w * 0.55, -uFade.w, length(p - uFade.xyz));
  p.y += uLift * 0.;

  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float z = max(-mv.z, 1e-3);
  float pxu = projectionMatrix[1][1] * uResY * 0.5; // px per unit at depth 1
  float jit = mix(0.75, 1.3, r0 * r0 * r0 * r0);
#if MODE == 0
  if (tag > 4.5) jit *= 2.1;
#endif
  float sPx = uSizeW * jit * sizeMul * pxu / z;
  float coc = uAperture * pxu * abs(1. / z - 1. / max(uFocus, 0.01));
  float sz = max(sqrt(sPx * sPx + coc * coc), uMinPx);
  float energy = (sPx * sPx) / (sz * sz);
  // fill-rate budget: dense surfaces keep a stable random subset of very large discs (energy preserved on
  // average); sparse particles (sparks, aura) just clamp their disc so no lone survivor becomes a blob
#if MODE < 2
  if (sz > uMaxPx) {
    float pk = (uMaxPx * uMaxPx) / (sz * sz);
    if (r5 > pk) { cull(); return; }
    energy /= pk;
  }
#else
  sz = min(sz, uMaxPx * (MODE == 3 ? 3. : 0.6));
#endif
  vDisc = smoothstep(1.5, 5., coc / max(sPx, 0.5));

  // ---- shading
  vec3 nv = normalize(mat3(modelViewMatrix) * n);
  vec3 V = normalize(-mv.xyz);
  float ndv = dot(nv, V);
  float rim = 1. - abs(ndv);
  float lum;
#if MODE == 0
  if (inner > 0.5) lum = uInner;
#else
  if (inner > 0.5) lum = 0.22;
#endif
  else {
    float facing = ndv >= 0. ? 1. : uBack;
    // hair strands glow along their length whatever their facing (anisotropic), still rim-brightened
    float face = (tag > 1.5 && tag < 2.5) ? max(uFace, 0.42) : uFace;
    lum = facing * (face + (1. - face) * pow(rim, uRimPow)) * (1. + uRimGain * pow(rim, 5.));
  }
  float tagB = tag > 2.5 && tag < 3.5 ? 1.9 : (tag > 1.5 && tag < 2.5 ? 1.1 : 1.0);
#if MODE == 0
  // inner volume light: white-hot core, soft and larger
  float core = step(4.5, tag);
#else
  float core = 0.;
#endif
  float sh = 1. + uShimmer * sin(uTime * (1.7 + 4.5 * r1) + r0 * 61.);
  float gl = uGlint * pow(max(0., sin(uTime * (0.6 + 1.3 * r2) + r3 * 77.)), 60.) * step(0.7, r4) * (1. - inner);
  // her light fading: dimmer, sparser, unsteady
  float dim = 1. - uDim * (0.82 + 0.18 * sin(uTime * 7.3 + r1 * 6.) * sin(uTime * 2.9));
  if (uDim > 0. && r4 < uDim * 0.6) dim *= 0.15;
  // pulse (contact ripple running through the figure)
  float pulse = 0.;
  if (uPulse.x > 0. && MODE < 2) {
    float d = length(p - uPulseP); float front = uPulse.x * uPulse.y;
    pulse = exp(-pow((d - front) / uPulse.z, 2.)) * uPulse.w * exp(-uPulse.x * 0.6);
  }
  // colour: hue at the halo, whiter core; pearl iridescence
  float hm = smoothstep(0.15, 1.0, r1) * (0.55 + 0.45 * rim);
  vec3 col = mix(uCore, uHalo * 1.6, hm * 0.55);
  col *= 1. + uIrid * 0.32 * sin(6.2831853 * (r2 + uTime * 0.04 + p.y * 0.35) + vec3(0., 2.1, 4.2));
  // hue toward the edges, white-hot toward the core
  float L0 = dot(uCore, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(L0) * vec3(1.05, 1.0, 0.92), core * 0.6 + (1. - core) * (1. - rim) * 0.18);
  float I = uBright * lum * sh * tagB * gain * fade * dim * aE * (1. + pulse);
  vec3 c = col * I * energy * 4.6;
  float gE = gl * uBright * energy * fade * dim;
  vHot = uHot * I * energy + gE * 1.2 + pulse * uBright * energy;
  vCol = c + col * gE * 1.2;
  // alpha = coverage (colour-keep mask): the sprite footprint times visibility, saturating with intensity
  vA = clamp(uKeep * fade * energy * min(1., (I + gE) * 12. / max(uBright, 1e-3)), 0., 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = sz;
}`;

export const FIG_FRAG = /* glsl */`
precision highp float;
varying vec3 vCol; varying float vA; varying float vDisc; varying float vHot;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float r2 = dot(c, c);
  if (r2 > 1.) discard;
  float g = max(exp(-r2 * 3.5) - 0.03, 0.);
  float d = smoothstep(1., 0.78, r2) * (0.55 + 0.45 * r2) * 0.62;
  float prof = mix(g, d, vDisc);
  float core = g * g * g * g * (1. - vDisc);
  gl_FragColor = vec4(vCol * prof + vec3(vHot) * core, vA * prof);
}`;

export function figureUniforms() {
  return {
    uBones: { value: null }, uCloth: { value: null },
    uTime: { value: 0 }, uResY: { value: 1080 }, uSizeW: { value: 0.006 }, uMinPx: { value: 2 }, uMaxPx: { value: 24 }, uBright: { value: 1 }, uKeep: { value: 0.6 },
    uCore: { value: new THREE.Color(2.6, 1.45, 0.55) }, uHalo: { value: new THREE.Color(1.0, 0.55, 0.18) },
    uRimPow: { value: 2.0 }, uRimGain: { value: 1.2 }, uBack: { value: 0.35 }, uFace: { value: 0.22 }, uInner: { value: 0.3 },
    uIrid: { value: 0 }, uShimmer: { value: 0.25 }, uGlint: { value: 1 }, uHot: { value: 0.25 },
    uDissolve: { value: 0 }, uDim: { value: 0 }, uAura: { value: 0.5 }, uSparks: { value: 1 }, uSparkRise: { value: 1 },
    uCollapse: { value: new THREE.Vector4(0, 0, 0, 0) }, uCollapseR: { value: 0.12 },
    uFocus: { value: 5 }, uAperture: { value: 0 },
    uVel: { value: new THREE.Vector3() },
    uPulse: { value: new THREE.Vector4(0, 2, 0.1, 0) }, uPulseP: { value: new THREE.Vector3() },
    uFade: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSizeMul: { value: 1 }, uLift: { value: 0 },
  };
}

export function figureMaterial(uniforms, mode, nb) {
  const m = new THREE.ShaderMaterial({
    vertexShader: FIG_VERT, fragmentShader: FIG_FRAG, uniforms,
    defines: { MODE: mode, NB: nb },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  });
  return m;
}
