import * as THREE from 'three';

// Shaders and materials for the interior sets (ballroom, chamber).
// Lighting model: a shared rig of NL point lights (candle chandeliers + extra lights for the lovers),
// evaluated PER VERTEX (cards are tessellated) for diffuse, edge light and analytic haze in-scattering
// (closed-form integral of a point light along the view ray), then combined per fragment with the
// paper-cut texture. Rim light is derived per fragment from the silhouette's alpha gradient and the
// in-plane direction toward the lights, so cut edges facing a chandelier glow.

export const NL = 8;

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C3 = (r, g, b) => new THREE.Color(r, g, b);

/** shared uniforms (every interior material references these same objects) */
export function createRig() {
  return {
    uLP: { value: Array.from({ length: NL }, () => V3(0, -999, 0)) },
    uLC: { value: Array.from({ length: NL }, () => V3(0, 0, 0)) },
    uLR2: { value: 1.2 },
    uAmb: { value: C3(0.006, 0.0055, 0.0055) },
    uFogC: { value: C3(0.004, 0.0035, 0.0035) },
    uFogD: { value: 0.012 }, uScat: { value: 0.0003 }, uScatT: { value: 0.01 }, uHazeMax: { value: 90 },
    uMoonDir: { value: V3(0.1, 0.38, -0.92).normalize() }, uMoonCol: { value: C3(0.16, 0.2, 0.32) }, uMoonOn: { value: 1 }, uWinZ: { value: -41 },
    uWin: { value: new THREE.Vector4(3.2, 3.2, 13.0, 1.12) }, uWin2: { value: new THREE.Vector4(4.32, 1.07, 0.07, 8.5) }, uRose: { value: new THREE.Vector2(15.15, 1.42) },
    uWinTex: { value: null }, uWinMode: { value: 0 }, uWinRect: { value: new THREE.Vector4(-1, 1, 2, 3) }, uWinBias: { value: 1.0 },
    uBleed: { value: 0 }, uBleedO: { value: V3(0, 0, -14) }, uBleedR: { value: 40 },
    uTime: { value: 0 }, uRefl: { value: 0 }, uPx: { value: 1 }, uFloorY: { value: 0 },
  };
}

export const RIG_GLSL = /* glsl */`
#define NL ${NL}
uniform vec3 uLP[NL];
uniform vec3 uLC[NL];
uniform float uLR2;
uniform vec3 uAmb, uFogC, uMoonDir, uMoonCol, uBleedO;
uniform float uFogD, uScat, uScatT, uHazeMax, uMoonOn, uWinZ, uBleed, uBleedR, uTime, uRefl, uPx, uFloorY;
uniform vec4 uWin, uWin2, uWinRect;
uniform vec2 uRose;
uniform sampler2D uWinTex;
uniform int uWinMode;
uniform float uWinBias;
float hsh(float n){ return fract(sin(n) * 43758.5453123); }
float hsh2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// wrapped diffuse, edge light (irradiance without cosine) and intensity-weighted light direction
void hallLightN(vec3 P, vec3 N, float wrap, float nearSoft, out vec3 diff, out vec3 edge, out vec3 ldir) {
  diff = vec3(0.); edge = vec3(0.); ldir = vec3(0.);
  for (int i = 0; i < NL; i++) {
    vec3 c = uLC[i];
    if (c.r + c.g + c.b <= 0.) continue;
    vec3 L = uLP[i] - P;
    float d2 = dot(L, L);
    vec3 l = L * inversesqrt(d2 + 1e-6);
    vec3 e = c / (d2 + uLR2 + nearSoft);
    diff += e * max(0., (dot(N, l) + wrap) / (1. + wrap));
    edge += e;
    ldir += l * (e.r + e.g + e.b);
  }
}
void hallLight(vec3 P, vec3 N, float wrap, out vec3 diff, out vec3 edge, out vec3 ldir) { hallLightN(P, N, wrap, 0., diff, edge, ldir); }
// haze along the view ray to P: rgb = in-scattered candle light + ambient fog, a = transmittance.
// In the reflection pass the ray starts where the mirrored ray crosses the floor.
vec4 hallHaze(vec3 P) {
  vec3 o = cameraPosition;
  vec3 V = P - o;
  float s = length(V);
  vec3 v = V / max(s, 1e-4);
  if (uRefl > 0.5 && v.y > 1e-4) { float t0 = (uFloorY - o.y) / v.y; o += v * t0; s = max(0., s - t0); }
  float sh = min(s, uHazeMax);
  float T = exp(-uFogD * sh);
  vec3 acc = vec3(0.);
  for (int i = 0; i < NL; i++) {
    vec3 c = uLC[i];
    if (c.r + c.g + c.b <= 0.) continue;
    vec3 q = uLP[i] - o;
    float b = dot(q, v);
    float h2 = max(dot(q, q) - b * b, 0.) + uLR2;
    float h = sqrt(h2);
    float x1 = sh - b, x0 = -b;
    float A1 = atan(x1 / h), A0 = atan(x0 / h);
    // broad 1/r^2 airlight + tight 1/r^4 glow (both closed-form along the ray)
    float broad = (A1 - A0) / h;
    float tight = (x1 / (h2 + x1 * x1) - x0 / (h2 + x0 * x0)) / (2. * h2) + (A1 - A0) / (2. * h2 * h);
    acc += c * (broad * uScat + tight * uScatT);
  }
  return vec4(acc + uFogC * (1. - T), T);
}
float bleedAt(vec3 P) { float r = uBleed * (uBleedR + 8.); return smoothstep(0., 8., r - length(P.xz - uBleedO.xz)); }
// the great window's opening (pointed arch, mullions, transom, rose ring) in wall coordinates
float winMask(vec2 h, float soft) {
  float ax = abs(h.x);
  float m = smoothstep(-soft, soft, uWin.x - ax) * smoothstep(-soft, soft, h.y - uWin.y);
  if (h.y > uWin.z) m *= smoothstep(-soft, soft, uWin2.x - length(vec2(ax + uWin.w, h.y - uWin.z)));
  m *= mix(1., smoothstep(uWin2.z - soft, uWin2.z + soft, abs(ax - uWin2.y)), step(h.y, uWin.z + 0.9));
  m *= smoothstep(0.06 - soft, 0.06 + soft, abs(h.y - uWin2.w));
  float rd = length(vec2(h.x, h.y - uRose.x));
  m *= smoothstep(0.1 - soft, 0.1 + soft, abs(rd - uRose.y));
  m *= mix(1., 0.15, step(rd, uRose.y) * smoothstep(0.35, 0.2, abs(fract(atan(h.y - uRose.x, h.x) * 0.9549) - 0.5)) * step(0.25, rd));
  return m;
}
// moonlight reaching P through the window (0..1)
float moonPool(vec3 P) {
  if (uMoonOn <= 0.) return 0.;
  float t = (uWinZ - P.z) / uMoonDir.z;
  if (t <= 0.) return 0.;
  vec3 H = P + uMoonDir * t;
  if (uWinMode == 1) { // a paper-cut window texture (alpha = frame / leading) seen along the moon direction
    vec2 q = (H.xy - uWinRect.xy) / uWinRect.zw;
    if (q.x < 0. || q.x > 1. || q.y < 0. || q.y > 1.) return 0.;
    return (1. - textureLod(uWinTex, q, uWinBias + log2(1. + t * 3.)).a) * uMoonOn;
  }
  return winMask(H.xy, 0.05 + 0.014 * t) * uMoonOn;
}
`;

// colour blending: paper erases the lovers' colour-keep mask behind it
const PAPER_BLEND = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
// additive light that is NOT the lovers: leaves the alpha (keep mask) untouched
export const ADD_BLEND = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };

// ------------------------------------------------------------------------------------------------
// CARD: paper-cut layer (walls, ceiling, banners) — RGBA Cut texture: R gilt, G glow, B tone, A sil
// ------------------------------------------------------------------------------------------------
const CARD_VERT = /* glsl */`
${RIG_GLSL}
uniform vec2 uUvScale, uUvOff, uCardSize;
uniform float uWrap, uSway, uSwayPhase, uHeight;
varying vec2 vLocal;
varying vec2 vUv; varying vec3 vW; varying vec3 vDiff; varying vec3 vEdge; varying vec2 vLd; varying vec4 vHaze; varying float vBleed; varying float vH; varying float vMoon;
#ifdef PERFRAG
varying vec3 vN; varying vec3 vT; varying vec3 vB;
#endif
void main(){
  vUv = uv * uUvScale + uUvOff;
  vLocal = uv * uCardSize;
  vec3 pos = position;
  if (uSway > 0.) { // hanging cloth: sway grows toward the free end (uv.y = 0)
    float k = 1. - uv.y;
    pos.z += uSway * k * k * (sin(uTime * 1.1 + uSwayPhase + uv.y * 2.3) + 0.4 * sin(uTime * 2.3 + uSwayPhase * 1.7));
    pos.x += uSway * 0.25 * k * k * sin(uTime * 0.8 + uSwayPhase * 2.1);
  }
  vec4 wp = modelMatrix * vec4(pos, 1.);
  vW = wp.xyz;
  mat3 m3 = mat3(modelMatrix);
  vec3 N = normalize(m3 * normal);
  if (dot(N, cameraPosition - wp.xyz) < 0.) N = -N;
  vec3 ld;
  hallLight(vW, N, uWrap, vDiff, vEdge, ld);
  vec3 T = normalize(m3 * vec3(1., 0., 0.)), B = normalize(m3 * vec3(0., 1., 0.));
  vLd = vec2(dot(ld, T), dot(ld, B)) / max(1e-5, length(ld));
  vHaze = hallHaze(vW);
  vBleed = bleedAt(vW);
  vH = clamp(wp.y / max(uHeight, 0.01), 0., 1.);
  vMoon = moonPool(vW) * max(0., dot(N, uMoonDir));
#ifdef PERFRAG
  vN = N; vT = T; vB = B;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const CARD_FRAG = /* glsl */`
${RIG_GLSL}
uniform sampler2D map, paperTex, noiseTex;
uniform vec2 uTexel;
uniform float uRimPx, uAlbedo, uRimK, uRimAll, uGiltK, uGlowK, uToneK, uPaper, uBurn, uBurnSeed, uOpacity, uCloth, uFlicker, uAlphaCut, uSconce;
uniform vec3 uInk, uInkTop, uInkB, uRimC, uGiltC, uGlowC, uCloth0, uCloth1, uBurnC;
varying vec2 vLocal;
varying vec2 vUv; varying vec3 vW; varying vec3 vDiff; varying vec3 vEdge; varying vec2 vLd; varying vec4 vHaze; varying float vBleed; varying float vH; varying float vMoon;
#ifdef PERFRAG
varying vec3 vN; varying vec3 vT; varying vec3 vB;
uniform float uWrap;
#endif
void main(){
  vec3 dif = vDiff, edgeL = vEdge; vec2 ldv = vLd; float moonL = vMoon;
#ifdef PERFRAG
  { vec3 N = normalize(vN), ld3; hallLight(vW, N, uWrap, dif, edgeL, ld3); ldv = vec2(dot(ld3, vT), dot(ld3, vB)) / max(1e-5, length(ld3)); moonL = moonPool(vW) * max(0., dot(N, uMoonDir)); }
#endif
  vec4 m = texture2D(map, vUv);
  if (m.a < uAlphaCut) discard;
  float burnEdge = 0.;
  if (uBurn > 0.) {
    float n = texture2D(noiseTex, vLocal * 0.045 + uBurnSeed).r * 0.8 + texture2D(noiseTex, vLocal * 0.21 + uBurnSeed).g * 0.2;
    float th = uBurn * 1.2 - 0.1;
    if (n < th) discard;
    burnEdge = 1. - smoothstep(0., 0.05, n - th);
  }
  vec2 d = uTexel * uRimPx;
  float l = texture2D(map, vUv - vec2(d.x, 0.)).a, r = texture2D(map, vUv + vec2(d.x, 0.)).a;
  float b = texture2D(map, vUv - vec2(0., d.y)).a, t = texture2D(map, vUv + vec2(0., d.y)).a;
  vec2 g = vec2(l - r, b - t);
  float gl = length(g);
  float edge = clamp(gl * 1.6, 0., 1.);
  float facing = gl > 1e-3 ? max(0., dot(g / gl, normalize(ldv + 1e-5))) * length(ldv) : 0.;
  float rim = edge * (facing + uRimAll);
  float pf = texture2D(paperTex, vW.xy * 0.035 + vW.zy * 0.035).r;
  vec3 ink = mix(uInk, uInkTop, vH);
  ink = mix(ink, uInkB, vBleed);
  ink = mix(ink, mix(uCloth0, uCloth1, vBleed), uCloth);
  ink *= (1. + (pf - 0.5) * uPaper) * (1. + uToneK * m.b);
  vec3 col = ink * (uAmb * 6. + dif * uAlbedo + uMoonCol * moonL);
  col += uRimC * edgeL * rim * uRimK * (1. + 0.6 * vBleed) + uMoonCol * moonL * rim * uRimK * 4.;
  vec3 Vd = normalize(cameraPosition - vW);
  float spark = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * 1.3 + dot(vW, vec3(2.1, 1.3, 1.7)) + dot(Vd, vec3(9., 5., 7.))), 3.);
  col += uGiltC * m.r * (edgeL * 0.4 + dif) * uGiltK * spark * (1. + 0.8 * vBleed);
  float fl = 1. - uFlicker * (0.5 + 0.5 * sin(uTime * 9. + hsh2(floor(vW.xz * 0.4 + vW.y * 0.1)) * 40.)) * (0.5 + 0.5 * sin(uTime * 3.7 + hsh2(floor(vW.xz * 0.4)) * 13.));
  col += uGlowC * m.g * uGlowK * fl;
  if (uSconce > 0.) { // warm pools thrown on the wall by the candle sconces (2 per 6 m bay at x = 1.05, 4.95; y = 3.95)
    float bx = fract(vUv.x) * 6.;
    vec2 d1 = vec2(bx - 1.05, vLocal.y - 4.0), d2 = vec2(bx - 4.95, vLocal.y - 4.0);
    float bay = floor(vUv.x);
    float f1 = 0.85 + 0.15 * sin(uTime * 7.3 + bay * 3.1) * sin(uTime * 2.9 + bay);
    float f2 = 0.85 + 0.15 * sin(uTime * 6.1 + bay * 1.7) * sin(uTime * 3.3 + bay * 2.);
    float pool = (exp(-dot(d1 * vec2(1., 0.75), d1 * vec2(1., 0.75)) * 0.55) * f1 + exp(-dot(d2 * vec2(1., 0.75), d2 * vec2(1., 0.75)) * 0.55) * f2);
    col += ink * uGlowC * pool * uSconce * (0.6 + 0.8 * m.b) + uGlowC * pool * uSconce * 0.004;
  }
  col += uBurnC * burnEdge;
  col = col * vHaze.a + vHaze.rgb;
  gl_FragColor = vec4(col, smoothstep(uAlphaCut, uAlphaCut + 0.3, m.a) * uOpacity);
}`;

export function cardMaterial(rig, tex, paperTex, noiseTex, o = {}) {
  const u = {
    ...rig,
    map: { value: tex }, paperTex: { value: paperTex }, noiseTex: { value: noiseTex },
    uTexel: { value: new THREE.Vector2(1 / tex.userData.w, 1 / tex.userData.h) },
    uUvScale: { value: new THREE.Vector2(...(o.uvScale || [1, 1])) }, uUvOff: { value: new THREE.Vector2(...(o.uvOff || [0, 0])) }, uCardSize: { value: new THREE.Vector2(...(o.size || [10, 10])) },
    uRimPx: { value: o.rimPx ?? 3 }, uAlbedo: { value: o.albedo ?? 0.09 }, uRimK: { value: (o.rimK ?? 1.0) * 0.14 }, uRimAll: { value: o.rimAll ?? 0.03 },
    uGiltK: { value: (o.giltK ?? 1.0) * 0.28 }, uGlowK: { value: o.glowK ?? 1 }, uToneK: { value: o.toneK ?? 1.2 }, uPaper: { value: o.paper ?? 0.35 },
    uBurn: { value: 0 }, uBurnSeed: { value: o.burnSeed ?? 0 }, uOpacity: { value: 1 }, uCloth: { value: o.cloth ? 1 : 0 }, uFlicker: { value: o.flicker ?? 0.12 },
    uAlphaCut: { value: o.alphaCut ?? 0.3 }, uSconce: { value: o.sconce ?? 0 }, uWrap: { value: o.wrap ?? 0.35 }, uSway: { value: o.sway ?? 0 }, uSwayPhase: { value: o.swayPhase ?? 0 }, uHeight: { value: o.height ?? 18.5 },
    uInk: { value: C3(...(o.ink || [0.012, 0.0105, 0.0105])) }, uInkTop: { value: C3(...(o.inkTop || o.ink || [0.016, 0.0135, 0.013])) },
    uInkB: { value: C3(...(o.inkB || [0.04, 0.018, 0.011])) },
    uRimC: { value: C3(...(o.rim || [1.0, 0.78, 0.5])) }, uGiltC: { value: C3(...(o.gilt || [1.0, 0.68, 0.3])) },
    uGlowC: { value: C3(...(o.glow || [3.2, 1.55, 0.5])) },
    uCloth0: { value: C3(...(o.cloth0 || [0.03, 0.009, 0.01])) }, uCloth1: { value: C3(...(o.cloth1 || [0.32, 0.025, 0.035])) },
    uBurnC: { value: C3(...(o.burnC || [4.0, 2.4, 1.0])) },
  };
  return new THREE.ShaderMaterial({ vertexShader: CARD_VERT, fragmentShader: CARD_FRAG, uniforms: u, transparent: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide, ...PAPER_BLEND,
    defines: o.perFragment ? { PERFRAG: 1 } : {} });
}
/** 4x4 opaque texture so plain surfaces (reveals, seats) can use the card shader */
export function plainTex() {
  const d = new Uint8Array(4 * 4 * 4); for (let i = 0; i < 16; i++) { d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, 4, 4, THREE.RGBAFormat); t.needsUpdate = true; t.userData = { wm: 1, hm: 1, w: 4, h: 4 }; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; return t;
}

// ------------------------------------------------------------------------------------------------
// SOLID: folded-paper 3D pieces (columns, beams, soffits, chandelier frames) with real normals
// ------------------------------------------------------------------------------------------------
const SOLID_VERT = /* glsl */`
${RIG_GLSL}
attribute vec3 aCol;
uniform float uWrap, uFresK, uNear;
varying vec3 vW; varying vec3 vC; varying vec4 vHaze; varying float vBleed; varying vec3 vCol;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vW = wp.xyz;
  vec3 N = normalize(mat3(modelMatrix) * normal);
  vec3 diff, edge, ld;
  hallLightN(vW, N, uWrap, uNear, diff, edge, ld);
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(1. - abs(dot(N, V)), 3.);
  // rim when lights sit behind the surface relative to the viewer
  float back = max(0., dot(normalize(ld + 1e-5), -V)) * 0.6 + 0.4;
  vC = diff + edge * fr * uFresK * back + uMoonCol * moonPool(vW) * max(0., dot(N, uMoonDir));
  vHaze = hallHaze(vW);
  vBleed = bleedAt(vW);
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SOLID_FRAG = /* glsl */`
${RIG_GLSL}
uniform sampler2D paperTex;
uniform vec3 uInk, uInkB; uniform float uAlbedo, uPaper, uOpacity, uEmis;
varying vec3 vW; varying vec3 vC; varying vec4 vHaze; varying float vBleed; varying vec3 vCol;
void main(){
  float pf = texture2D(paperTex, vW.xy * 0.05 + vW.zy * 0.05).r;
  vec3 ink = mix(uInk, uInkB, vBleed) * vCol * (1. + (pf - 0.5) * uPaper);
  vec3 col = ink * (uAmb * 6. + vC * uAlbedo) + vCol * uEmis * step(1.5, vCol.r);
  col = col * vHaze.a + vHaze.rgb;
  gl_FragColor = vec4(col, uOpacity);
}`;
export function solidMaterial(rig, paperTex, o = {}) {
  const u = {
    ...rig, paperTex: { value: paperTex },
    uInk: { value: C3(...(o.ink || [0.016, 0.0135, 0.013])) }, uInkB: { value: C3(...(o.inkB || [0.05, 0.022, 0.012])) },
    uAlbedo: { value: o.albedo ?? 0.25 }, uPaper: { value: o.paper ?? 0.3 }, uOpacity: { value: 1 }, uWrap: { value: o.wrap ?? 0.15 }, uFresK: { value: o.fresK ?? 0.5 }, uEmis: { value: o.emis ?? 0 }, uNear: { value: o.near ?? 0 },
  };
  const m = new THREE.ShaderMaterial({ vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, uniforms: u, side: o.side ?? THREE.FrontSide, ...PAPER_BLEND, transparent: !!o.transparent });
  return m;
}
/** ensure a geometry has the aCol attribute (white) */
export function withCol(geo, col = [1, 1, 1]) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col[0]; a[i * 3 + 1] = col[1]; a[i * 3 + 2] = col[2]; }
  geo.setAttribute('aCol', new THREE.BufferAttribute(a, 3));
  return geo;
}

// ------------------------------------------------------------------------------------------------
// FLOOR: dark polished marble with inlay, candle pools, moonlit window pattern, planar reflection
// ------------------------------------------------------------------------------------------------
const FLOOR_VERT = /* glsl */`
${RIG_GLSL}
uniform mat4 uTexMat;
varying vec3 vW; varying vec3 vDiff; varying vec3 vEdge; varying vec4 vHaze; varying vec4 vRC; varying float vBleed;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vW = wp.xyz;
  vec3 ld;
  hallLight(vW, vec3(0., 1., 0.), 0., vDiff, vEdge, ld);
  vHaze = hallHaze(vW);
  vBleed = bleedAt(vW);
  vRC = uTexMat * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FLOOR_FRAG = /* glsl */`
${RIG_GLSL}
uniform sampler2D tRefl, marbleTex, noiseTex;
uniform vec2 uReflTexel;
uniform float uReflK, uIsland, uIslandR, uNaveX, uOuterX, uZc, uZ0, uZ1, uBurnIsland, uMedR;
uniform vec3 uMarA, uMarB, uMarBleed, uGiltC, uBurnC;
varying vec3 vW; varying vec3 vDiff; varying vec3 vEdge; varying vec4 vHaze; varying vec4 vRC; varying float vBleed;
float lineAA(float d, float w){ float fw = fwidth(d) + 1e-4; return 1. - smoothstep(w - fw, w + fw, abs(d)); }
void main(){
  vec2 p = vW.xz;
  // floating island: everything outside a soft-edged disc burns away into light
  float burnEdge = 0.;
  float rr = length(vec2(p.x, p.y - uZc));
  if (uIsland > 0.) {
    float n = texture2D(noiseTex, p * 0.035).r;
    float R = mix(80., uIslandR, uIsland) + (n - 0.5) * 3.0 * (1. - uIsland * 0.85);
    if (rr > R) discard;
    burnEdge = (1. - smoothstep(0., 0.6, R - rr)) * step(0.001, 1. - uIsland) ;
  }
  if (abs(p.x) > uOuterX || p.y > uZ0 || p.y < uZ1) discard;
  vec4 mt = texture2D(marbleTex, p * 0.09);
  vec4 mt2 = texture2D(marbleTex, p * 0.023 + 0.31);
  float nave = step(abs(p.x), uNaveX);
  // nave: large lozenges (diamond grid) alternating two marbles; aisles: square slabs
  vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071 / 2.4;
  vec2 cq = floor(q);
  float alt = mod(cq.x + cq.y, 2.);
  vec2 sq = floor(p / 2.0);
  float altA = mod(sq.x + sq.y, 2.);
  float a = mix(altA * 0.5, alt, nave) * (1. - 0.6 * uIsland);
  vec3 base = mix(uMarA, uMarB, a) * (0.75 + 0.5 * mt.r) * (0.85 + 0.3 * mt2.b);
  base += vec3(0.05, 0.045, 0.04) * mt.g * (0.4 + 0.6 * mt2.r) * 0.35;
  // inlay: thin gilt lines on lozenge seams, border bands at the arcade lines, central medallion
  vec2 fq = fract(q) - 0.5;
  float seam = nave * max(lineAA(fq.x * 2.4 * 1.4142, 0.012), lineAA(fq.y * 2.4 * 1.4142, 0.012));
  vec2 fs = fract(p / 2.0) - 0.5;
  seam = max(seam, (1. - nave) * max(lineAA(fs.x * 2., 0.01), lineAA(fs.y * 2., 0.01)) * 0.6);
  float band = lineAA(abs(p.x) - uNaveX + 0.55, 0.32);
  float gl = lineAA(abs(p.x) - uNaveX + 0.95, 0.025) + lineAA(abs(p.x) - uNaveX + 0.15, 0.025);
  float r = rr;
  float med = 1. - smoothstep(uMedR - 0.02, uMedR + 0.02, r);
  float ang = atan(p.x, p.y - uZc);
  float star = abs(fract(ang * 16. / 6.2831853) - 0.5) * 2.;
  float starR = mix(uMedR * 0.45, uMedR * 0.9, star);
  float starM = 1. - smoothstep(starR - 0.03, starR + 0.03, r);
  base = mix(base, mix(uMarA, uMarB, 0.35) * (0.7 + 0.6 * mt.r), med * 0.85);
  base = mix(base, uMarB * 1.25 * (0.8 + 0.4 * mt.r), starM * 0.55);
  base = mix(base, uMarA * 0.6, band * 0.8);
  float giltM = (seam * 0.16 + gl * 0.5) * (1. - uIsland * 0.85) + (lineAA(r - uMedR, 0.03) + lineAA(r - uMedR * 0.93, 0.012) + starM * lineAA(starR - r, 0.015)) * 0.3;
  base = mix(base, uMarBleed * (0.7 + 0.6 * mt.r), vBleed * 0.8);
  vec3 col = base * (uAmb * 4. + vDiff);
  col += uGiltC * giltM * (vDiff * 0.9 + uAmb * 2.) * (1. + vBleed);
  col += base * uMoonCol * 2.5 * moonPool(vW);
  // reflection (low-res mirror render): soft anisotropic blur, fresnel, polished but worn
  vec2 ruv = vRC.xy / vRC.w;
  float rough = 0.6 + 0.8 * mt.r;
  vec2 tx = uReflTexel;
  vec3 refl = texture2D(tRefl, ruv).rgb * 0.28
    + (texture2D(tRefl, ruv + vec2(tx.x, 0.) * 1.2 * rough).rgb + texture2D(tRefl, ruv - vec2(tx.x, 0.) * 1.2 * rough).rgb) * 0.14
    + (texture2D(tRefl, ruv + vec2(0., tx.y) * 2.2 * rough).rgb + texture2D(tRefl, ruv - vec2(0., tx.y) * 2.2 * rough).rgb) * 0.14
    + (texture2D(tRefl, ruv + vec2(0., tx.y) * 5.0 * rough).rgb + texture2D(tRefl, ruv - vec2(0., tx.y) * 5.0 * rough).rgb) * 0.08
    + texture2D(tRefl, ruv - vec2(0., tx.y) * 9.0 * rough).rgb * 0.06;
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.08 + 0.92 * pow(1. - max(V.y, 0.), 4.);
  col += refl * fres * uReflK * (0.85 + 0.3 * mt.g) * mix(1., 1.25, giltM);
  col += uBurnC * burnEdge;
  col = col * vHaze.a + vHaze.rgb;
  gl_FragColor = vec4(col, 1.);
}`;
export function floorMaterial(rig, marble, noise, o = {}) {
  const u = {
    ...rig, tRefl: { value: null }, marbleTex: { value: marble }, noiseTex: { value: noise },
    uTexMat: { value: new THREE.Matrix4() }, uReflTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) }, uReflK: { value: o.reflK ?? 0.85 },
    uIsland: { value: 0 }, uIslandR: { value: 11 }, uNaveX: { value: 7.5 }, uOuterX: { value: 14 }, uZc: { value: -14 }, uZ0: { value: 13 }, uZ1: { value: -41 }, uBurnIsland: { value: 0 }, uMedR: { value: 4.2 },
    uMarA: { value: C3(...(o.marA || [0.012, 0.011, 0.011])) }, uMarB: { value: C3(...(o.marB || [0.03, 0.026, 0.024])) }, uMarBleed: { value: C3(0.07, 0.03, 0.022) },
    uGiltC: { value: C3(...(o.gilt || [0.9, 0.6, 0.26])) }, uBurnC: { value: C3(4.0, 2.4, 1.0) },
  };
  return new THREE.ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: u, ...PAPER_BLEND, transparent: false });
}

/** planar mirror: renders the scene from the mirrored camera into a low-res HDR target before the floor draws */
export class PlanarReflection {
  constructor(e, mesh, mat, rig, { scale = 1 / 3, y = 0 } = {}) {
    this.e = e; this.mesh = mesh; this.mat = mat; this.rig = rig; this.scale = scale;
    const w = Math.max(64, Math.round(e.W * scale)), h = Math.max(36, Math.round(e.H * scale));
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: e.rtType, format: THREE.RGBAFormat, depthBuffer: true, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    mat.uniforms.tRefl.value = this.rt.texture;
    mat.uniforms.uReflTexel.value.set(1 / w, 1 / h);
    this.cam = new THREE.PerspectiveCamera();
    this.y = y; this.enabled = true; this.hide = [];
    const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
    const tm = mat.uniforms.uTexMat.value;
    const tmp = new THREE.Vector3(), target = new THREE.Vector3(), dir = new THREE.Vector3();
    mesh.onBeforeRender = (renderer, scene, camera) => {
      if (!this.enabled || this.busy) return;
      const vc = this.cam;
      // mirror camera about y = this.y
      camera.updateMatrixWorld();
      vc.copy(camera, false);
      vc.position.copy(camera.position); vc.position.y = 2 * this.y - camera.position.y;
      camera.getWorldDirection(dir);
      target.copy(camera.position).add(dir); target.y = 2 * this.y - target.y;
      tmp.copy(camera.up).applyQuaternion(camera.quaternion); tmp.y = -tmp.y;
      vc.up.copy(tmp);
      vc.lookAt(target);
      vc.updateMatrixWorld();
      vc.projectionMatrix.copy(camera.projectionMatrix);
      vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      tm.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
      // oblique near plane = the floor (clip everything below it)
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, this.y, 0));
      plane.applyMatrix4(vc.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const P = vc.projectionMatrix.elements;
      q.x = (Math.sign(clip.x) + P[8]) / P[0]; q.y = (Math.sign(clip.y) + P[9]) / P[5]; q.z = -1; q.w = (1 + P[10]) / P[14];
      clip.multiplyScalar(2 / clip.dot(q));
      P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1 - 0.003; P[14] = clip.w;
      // render
      this.busy = true;
      const hidden = [mesh, ...this.hide].filter((o) => o.visible);
      hidden.forEach((o) => { o.visible = false; });
      const prevRT = renderer.getRenderTarget();
      const px = this.rig.uPx.value;
      this.rig.uRefl.value = 1; this.rig.uPx.value = px * this.scale;
      renderer.setRenderTarget(this.rt);
      renderer.clear(true, true, true);
      renderer.render(scene, vc);
      renderer.setRenderTarget(prevRT);
      this.rig.uRefl.value = 0; this.rig.uPx.value = px;
      hidden.forEach((o) => { o.visible = true; });
      this.busy = false;
    };
  }
}

// ------------------------------------------------------------------------------------------------
// DANCERS: instanced paper puppets (pose per instance computed on the CPU each frame)
//   aPose = (x, z, spin angle, scale)   aInfo = (variant, mirror, seed, dissolve)   aCol = gown/coat palette ids
// ------------------------------------------------------------------------------------------------
const DANCER_VERT = /* glsl */`
${RIG_GLSL}
attribute vec4 aPose; attribute vec4 aInfo; attribute vec2 aPal;
uniform vec2 uCell; uniform float uCurl;
varying vec2 vUv; varying vec3 vW; varying vec3 vDiff; varying vec3 vEdge; varying vec2 vLd; varying vec4 vHaze; varying float vBleed; varying vec4 vInfo; varying vec2 vPal; varying float vMoon; varying vec2 vLocal;
void main(){
  float s = aPose.w;
  vec3 p = position * s;
  float hx = p.x / (uCell.x * 0.5 * s);
  p.z += uCurl * s * (hx * hx - 0.35);
  float ca = cos(aPose.z), sa = sin(aPose.z);
  vec3 wp = vec3(aPose.x + p.x * ca + p.z * sa, p.y + uFloorY, aPose.y - p.x * sa + p.z * ca);
  vW = wp;
  vec3 N = vec3(sa, 0., ca);
  if (dot(N, cameraPosition - wp) < 0.) N = -N;
  vec3 ld;
  hallLight(wp, N, 0.5, vDiff, vEdge, ld);
  vec3 T = vec3(ca, 0., -sa);
  vLd = vec2(dot(ld, T), ld.y) / max(1e-5, length(ld));
  vHaze = hallHaze(wp);
  vBleed = bleedAt(wp);
  vMoon = moonPool(wp + vec3(0., 0.5, 0.)) * (0.4 + 0.6 * abs(dot(N, uMoonDir)));
  float vi = aInfo.x;
  vec2 cell = vec2(mod(vi, 4.), floor(vi / 4.));
  vec2 luv = vec2(aInfo.y < 0. ? 1. - uv.x : uv.x, uv.y);
  vLocal = luv;
  vUv = (cell + luv) / vec2(4., 2.);
  vInfo = aInfo; vPal = aPal;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;
const DANCER_FRAG = /* glsl */`
${RIG_GLSL}
uniform sampler2D map, noiseTex;
uniform vec2 uTexel;
uniform vec3 uInk, uRimC, uGiltC, uBurnC;
uniform vec3 uGown[8]; uniform vec3 uCoat[4];
uniform float uRimK, uAlbedo, uOpacity;
varying vec2 vUv; varying vec3 vW; varying vec3 vDiff; varying vec3 vEdge; varying vec2 vLd; varying vec4 vHaze; varying float vBleed; varying vec4 vInfo; varying vec2 vPal; varying float vMoon; varying vec2 vLocal;
void main(){
  vec4 m = texture2D(map, vUv);
  if (m.a < 0.3) discard;
  float burnEdge = 0.;
  float ld = vInfo.w;
  if (ld > 0.) {
    float n = texture2D(noiseTex, vLocal * vec2(0.9, 1.1) + vInfo.z * 3.7).r * 0.75 + (1. - vLocal.y) * 0.25;
    float th = ld * 1.25 - 0.12;
    if (n < th) discard;
    burnEdge = 1. - smoothstep(0., 0.08, n - th);
  }
  vec2 d = uTexel * 2.5;
  float l = texture2D(map, vUv - vec2(d.x, 0.)).a, r = texture2D(map, vUv + vec2(d.x, 0.)).a;
  float b = texture2D(map, vUv - vec2(0., d.y)).a, t = texture2D(map, vUv + vec2(0., d.y)).a;
  vec2 g = vec2(l - r, b - t) * vec2(vInfo.y < 0. ? -1. : 1., 1.);
  float gl = length(g);
  float edge = clamp(gl * 1.6, 0., 1.);
  float facing = gl > 1e-3 ? max(0., dot(g / gl, normalize(vLd + 1e-5))) * length(vLd) : 0.;
  float rim = edge * (facing + 0.03);
  // colour bleed: the lady's gown (G mask) and the gentleman's coat take jewel tones
  vec3 gown = uGown[int(vPal.x)], coat = uCoat[int(vPal.y)];
  vec3 cloth = mix(coat, gown, m.g);
  vec3 ink = mix(uInk, cloth, vBleed) * (1. + 0.9 * m.b);
  vec3 col = ink * (uAmb * 6. + vDiff * mix(uAlbedo, 0.9, vBleed) + uMoonCol * vMoon * 1.5);
  col += uRimC * vEdge * rim * uRimK + uMoonCol * vMoon * rim * 3.;
  col += uGiltC * m.r * (vEdge * 0.3 + vDiff) * 0.35 * (0.5 + 0.5 * pow(0.5 + 0.5 * sin(uTime * 2.3 + vInfo.z * 40.), 4.));
  col += uBurnC * burnEdge * 1.5;
  col = col * vHaze.a + vHaze.rgb;
  gl_FragColor = vec4(col, smoothstep(0.3, 0.6, m.a) * uOpacity);
}`;
export function dancerMaterial(rig, atlasTex, noiseTex, o = {}) {
  const u = {
    ...rig, map: { value: atlasTex }, noiseTex: { value: noiseTex },
    uTexel: { value: new THREE.Vector2(1 / atlasTex.userData.w, 1 / atlasTex.userData.h) }, uCell: { value: new THREE.Vector2(2.4, 2.6) }, uCurl: { value: 0.07 },
    uInk: { value: C3(0.01, 0.009, 0.009) }, uRimC: { value: C3(1.0, 0.78, 0.5) }, uGiltC: { value: C3(1.1, 0.75, 0.32) }, uBurnC: { value: C3(4.2, 2.6, 1.2) },
    uGown: { value: [[0.3, 0.035, 0.07], [0.03, 0.14, 0.09], [0.035, 0.06, 0.26], [0.34, 0.2, 0.05], [0.22, 0.02, 0.05], [0.38, 0.32, 0.26], [0.14, 0.04, 0.24], [0.42, 0.12, 0.16]].map((c) => C3(...c)) },
    uCoat: { value: [[0.02, 0.025, 0.06], [0.07, 0.012, 0.018], [0.02, 0.05, 0.025], [0.045, 0.04, 0.035]].map((c) => C3(...c)) },
    uRimK: { value: (o.rimK ?? 1.0) * 0.16 }, uAlbedo: { value: 0.08 }, uOpacity: { value: 1 },
  };
  return new THREE.ShaderMaterial({ vertexShader: DANCER_VERT, fragmentShader: DANCER_FRAG, uniforms: u, transparent: true, depthWrite: true, side: THREE.DoubleSide, ...PAPER_BLEND });
}

// ------------------------------------------------------------------------------------------------
// POINT SPRITES (additive light): flames, crystal glints, dust motes, petals
// ------------------------------------------------------------------------------------------------
const FLAME_VERT = /* glsl */`
${RIG_GLSL}
attribute float aSeed;
uniform float uSize, uGain, uFlick;
varying float vI; varying float vSeed; varying float vT;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vec4 mv = viewMatrix * wp;
  float f = 0.82 + 0.18 * sin(uTime * (8. + 5. * aSeed) + aSeed * 61.) * sin(uTime * (3.1 + 2. * aSeed) + aSeed * 17.);
  vI = mix(1., f, uFlick) * uGain;
  vSeed = aSeed;
  vT = exp(-0.006 * length(mv.xyz));
  gl_PointSize = uSize * 540. * uPx * projectionMatrix[1][1] * (0.85 + 0.3 * f) / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FRAG = /* glsl */`
uniform vec3 uCore, uHalo;
varying float vI; varying float vSeed; varying float vT;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.; c.y = -c.y;
  // teardrop flame: narrow, tall core + soft halo
  vec2 q = vec2(c.x * 2.6, (c.y + 0.25) * 1.25);
  float tear = length(vec2(q.x / (1. - 0.45 * clamp(q.y, 0., 1.)), q.y));
  float core = smoothstep(0.55, 0.0, tear);
  float halo = exp(-dot(c, c) * 5.5);
  vec3 col = (uCore * core * 1.4 + uHalo * halo * 0.35) * vI * vT;
  gl_FragColor = vec4(col, 0.);
}`;
export function flameMaterial(rig, o = {}) {
  const u = { ...rig, uSize: { value: o.size ?? 26 }, uGain: { value: 1 }, uFlick: { value: 1 }, uCore: { value: C3(...(o.core || [6, 3.2, 1.1])) }, uHalo: { value: C3(...(o.halo || [1.6, 0.7, 0.22])) } };
  return new THREE.ShaderMaterial({ vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: u, transparent: true, depthWrite: false, depthTest: true, ...ADD_BLEND });
}

const GLINT_VERT = /* glsl */`
${RIG_GLSL}
attribute float aSeed;
uniform float uSize, uGain;
varying vec3 vC;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vec4 mv = viewMatrix * wp;
  vec3 V = normalize(cameraPosition - wp.xyz);
  // each crystal has a facet normal; it flashes when it mirrors a nearby flame toward the camera
  float a = aSeed * 6.2831 + uTime * (0.15 + 0.2 * fract(aSeed * 7.));
  vec3 n = normalize(vec3(cos(a), sin(aSeed * 13.) * 0.8, sin(a)));
  float g = pow(max(0., dot(reflect(-V, n), normalize(vec3(0., 1., 0.) + n * 0.3))), 24.);
  float tw = pow(0.5 + 0.5 * sin(uTime * (2. + 3. * fract(aSeed * 3.1)) + aSeed * 50.), 12.);
  vec3 prism = 0.5 + 0.5 * cos(6.2831 * (fract(aSeed * 5.3) + vec3(0., 0.33, 0.67)));
  vC = mix(vec3(1.0, 0.85, 0.65), prism, 0.35) * (g * 3. + tw * 1.2 + 0.08) * uGain;
  gl_PointSize = uSize * 540. * uPx * projectionMatrix[1][1] * (0.5 + 0.8 * (g + tw)) / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const GLINT_FRAG = /* glsl */`
varying vec3 vC;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float star = exp(-dot(c, c) * 9.) + exp(-abs(c.x) * 28. - abs(c.y) * 3.) * 0.6 + exp(-abs(c.y) * 28. - abs(c.x) * 3.) * 0.6;
  gl_FragColor = vec4(vC * star, 0.);
}`;
export function glintMaterial(rig, o = {}) {
  const u = { ...rig, uSize: { value: o.size ?? 22 }, uGain: { value: 1 } };
  return new THREE.ShaderMaterial({ vertexShader: GLINT_VERT, fragmentShader: GLINT_FRAG, uniforms: u, transparent: true, depthWrite: false, ...ADD_BLEND });
}

// golden dust motes rising in the candlelight (light rises): positions are analytic in uTime
const DUST_VERT = /* glsl */`
${RIG_GLSL}
attribute vec4 aSeed;
uniform vec3 uBoxMin, uBoxSize;
uniform float uSize, uGain, uRise, uFocus, uAperture;
varying float vI; varying float vSoft;
void main(){
  float h = uBoxSize.y;
  float y = mod(aSeed.y * h + uTime * uRise * (0.5 + aSeed.w), h);
  vec3 p = uBoxMin + vec3(aSeed.x * uBoxSize.x, y, aSeed.z * uBoxSize.z);
  p.x += sin(uTime * 0.31 + aSeed.w * 20.) * 0.6 + sin(uTime * 0.13 + aSeed.y * 9.) * 0.9;
  p.z += cos(uTime * 0.27 + aSeed.x * 17.) * 0.6;
  vec4 mv = viewMatrix * vec4(p, 1.);
  vec3 diff, edge, ld;
  hallLight(p, vec3(0., 1., 0.), 1., diff, edge, ld);
  float fade = smoothstep(0., 0.1, y / h) * smoothstep(1., 0.8, y / h);
  float tw = 0.6 + 0.4 * sin(uTime * (1. + aSeed.w * 3.) + aSeed.x * 40.);
  float moon = moonPool(p) * 2.5;
  vI = (dot(edge, vec3(0.33)) * 1.8 + moon * 0.6) * fade * tw * uGain;
  float z = -mv.z;
  float coc = abs(z - uFocus) / max(z, 0.1) * uAperture;
  float sz = uSize * 540. * uPx * projectionMatrix[1][1] / max(z, 0.2) + coc * 40. * uPx;
  vSoft = clamp(coc * 4., 0., 1.);
  vI /= 1. + coc * coc * 60.;
  gl_PointSize = clamp(sz, 1., 120. * uPx);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */`
uniform vec3 uCol;
varying float vI; varying float vSoft;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float r2 = dot(c, c);
  float a = mix(exp(-r2 * 7.), smoothstep(1., 0.75, sqrt(r2)) * 0.6, vSoft);
  gl_FragColor = vec4(uCol * vI * a, 0.);
}`;
export function dustMaterial(rig, o = {}) {
  const u = { ...rig, uBoxMin: { value: V3(...(o.min || [-12, 0, -40])) }, uBoxSize: { value: V3(...(o.size || [24, 17, 52])) },
    uSize: { value: o.pt ?? 0.012 }, uGain: { value: o.gain ?? 1 }, uRise: { value: o.rise ?? 0.12 }, uFocus: { value: 12 }, uAperture: { value: 0.0 }, uCol: { value: C3(...(o.col || [1.0, 0.72, 0.38])) } };
  return new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: u, transparent: true, depthWrite: false, ...ADD_BLEND });
}

// light petals: each belongs to a couple (uniform pose table) and is released when the dissolve front
// passes its origin; petals rise in a widening spiral around the dissolve origin (light rises)
const PETAL_VERT = /* glsl */`
${RIG_GLSL}
attribute vec4 aPet;   // (u, v) on the card, threshold, seed
attribute float aCouple;
uniform vec4 uPose[64]; uniform vec4 uInfo[64];
uniform vec2 uCell; uniform vec3 uSpiralO; uniform float uSize, uGain, uRiseH;
varying float vI; varying float vAng; varying vec3 vC;
void main(){
  int ci = int(aCouple + 0.5);
  vec4 P = uPose[ci]; vec4 I = uInfo[ci];
  float ld = I.w;
  float th = aPet.z;
  float p = clamp((ld * 1.25 - 0.12 - th) / 0.55, 0., 1.);
  float s = P.w;
  float lx = (aPet.x - 0.5) * uCell.x * s * (I.y < 0. ? -1. : 1.), ly = aPet.y * uCell.y * s;
  float ca = cos(P.z), sa = sin(P.z);
  vec3 o = vec3(P.x + lx * ca, ly + uFloorY, P.y - lx * sa);
  // spiral: rotate about the dissolve origin while rising and drifting outward
  float sd = aPet.w;
  vec2 rel = o.xz - uSpiralO.xz;
  float ang = p * (1.4 + sd * 1.2) + sin(uTime * 0.7 + sd * 30.) * 0.08 * p;
  float cs = cos(ang), sn = sin(ang);
  rel = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) * (1. + p * 0.35);
  vec3 wp = vec3(uSpiralO.x + rel.x, o.y + p * p * uRiseH * (0.6 + 0.8 * sd) + sin(uTime * 1.9 + sd * 17.) * 0.15 * p, uSpiralO.z + rel.y);
  wp.x += sin(uTime * 1.3 + sd * 40.) * 0.35 * p;
  vec4 mv = viewMatrix * vec4(wp, 1.);
  float flash = exp(-p * 9.) * 3.;
  vI = step(0.001, p) * (1. + flash) * smoothstep(1., 0.7, p) * uGain;
  vAng = uTime * (1.5 + sd * 2.) + sd * 20.;
  vC = mix(vec3(1.0, 0.72, 0.36), vec3(1.0, 0.62, 0.62), step(0.72, fract(sd * 9.31))) ;
  gl_PointSize = vI > 0. ? uSize * 540. * uPx * projectionMatrix[1][1] * (0.7 + 0.6 * fract(sd * 3.3)) / max(0.3, -mv.z) : 0.;
  gl_Position = projectionMatrix * mv;
}`;
const PETAL_FRAG = /* glsl */`
varying float vI; varying float vAng; varying vec3 vC;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float cs = cos(vAng), sn = sin(vAng);
  vec2 q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  q.x *= 1.9;
  float petal = smoothstep(1., 0.35, length(q)) ;
  float glow = exp(-dot(c, c) * 3.);
  gl_FragColor = vec4(vC * (petal * 1.6 + glow * 0.4) * vI, 0.);
}`;
export function petalMaterial(rig, o = {}) {
  const u = { ...rig, uPose: { value: Array.from({ length: 64 }, () => new THREE.Vector4()) }, uInfo: { value: Array.from({ length: 64 }, () => new THREE.Vector4()) },
    uCell: { value: new THREE.Vector2(2.4, 2.6) }, uSpiralO: { value: V3(0, 0, -14) }, uSize: { value: o.size ?? 40 }, uGain: { value: 1 }, uRiseH: { value: 16 } };
  return new THREE.ShaderMaterial({ vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, uniforms: u, transparent: true, depthWrite: false, ...ADD_BLEND });
}

// ------------------------------------------------------------------------------------------------
// MOON BEAM through the great window: a sheared box; the fragment marches the in-box segment and
// evaluates the window tracery at each sample, so the beam carries the window's pattern
// ------------------------------------------------------------------------------------------------
const BEAM_VERT = /* glsl */`varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BEAM_FRAG = /* glsl */`
${RIG_GLSL}
uniform mat4 uInv; uniform sampler2D noiseTex; uniform float uGain, uLen;
varying vec3 vW;
void main(){
  vec3 ro = (uInv * vec4(cameraPosition, 1.)).xyz;
  vec3 rp = (uInv * vec4(vW, 1.)).xyz;
  vec3 rd = rp - ro;
  // slab intersection with the unit box
  vec3 inv = 1. / (rd + sign(rd) * 1e-6 + vec3(equal(rd, vec3(0.))) * 1e-6);
  vec3 t0 = (vec3(0.) - ro) * inv, t1 = (vec3(1.) - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), max(tmin.z, 0.)), tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tf <= tn) discard;
  float acc = 0.;
  vec3 wa = cameraPosition + (vW - cameraPosition) * tn, wb = cameraPosition + (vW - cameraPosition) * tf;
  for (int i = 0; i < 6; i++) {
    float f = (float(i) + 0.5) / 6.;
    vec3 w = mix(wa, wb, f);
    float t = (uWinZ - w.z) / uMoonDir.z;
    vec3 H = w + uMoonDir * t;
    float m = winMask(H.xy, 0.08 + 0.01 * t);
    float along = clamp(t / uLen, 0., 1.);
    float dust = 0.55 + 0.9 * texture2D(noiseTex, w.xz * 0.08 + vec2(uTime * 0.01, w.y * 0.05)).g;
    acc += m * dust * smoothstep(0., 0.25, w.y) * (1. - along * 0.6);
  }
  float len = length(wb - wa);
  vec3 col = uMoonCol * acc / 6. * len * uGain;
  gl_FragColor = vec4(col, 0.);
}`;
export function beamMaterial(rig, noise) {
  const u = { ...rig, uInv: { value: new THREE.Matrix4() }, noiseTex: { value: noise }, uGain: { value: 0.05 }, uLen: { value: 50 } };
  return new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: u, transparent: true, depthWrite: false, depthTest: true, side: THREE.FrontSide, ...ADD_BLEND });
}

// ------------------------------------------------------------------------------------------------
// NIGHT BACKDROP behind windows (cheap): gradient + hashed stars + moon glow; the real Sky dome
// takes over when the hall opens
// ------------------------------------------------------------------------------------------------
const BACK_VERT = /* glsl */`varying vec3 vD; uniform vec3 uCenter; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vD = normalize(wp.xyz - uCenter); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BACK_FRAG = /* glsl */`
uniform vec3 uZen, uHor, uMoonC, uMoonD; uniform float uStars, uMoonSize, uTime;
varying vec3 vD;
float h3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vD);
  vec3 col = mix(uHor, uZen, pow(clamp(d.y * 1.4 + 0.1, 0., 1.), 0.6));
  vec3 p = d * 260.; vec3 c = floor(p); float r = h3(c);
  if (r < 0.035) { vec3 sp = normalize(c + 0.5); float a = acos(clamp(dot(d, sp), -1., 1.)) * 260.; col += vec3(0.8, 0.85, 1.) * exp(-a * a * 40.) * pow(h3(c + 3.), 6.) * 3.0 * uStars * (0.7 + 0.3 * sin(uTime * 2. + r * 300.)); }
  float md = acos(clamp(dot(d, uMoonD), -1., 1.));
  col += uMoonC * (smoothstep(uMoonSize, uMoonSize * 0.92, md) * 1.0 + exp(-md / (uMoonSize * 2.5)) * 0.18 + exp(-md / (uMoonSize * 10.)) * 0.05);
  gl_FragColor = vec4(col, 0.);
}`;
export function backdropMaterial(o = {}) {
  const u = { uCenter: { value: V3() }, uZen: { value: C3(...(o.zen || [0.004, 0.007, 0.022])) }, uHor: { value: C3(...(o.hor || [0.03, 0.04, 0.075])) },
    uMoonC: { value: C3(...(o.moon || [1.5, 1.45, 1.35])) }, uMoonD: { value: V3(0.1, 0.38, -0.92).normalize() }, uStars: { value: 1 }, uMoonSize: { value: 0.03 }, uTime: { value: 0 } };
  return new THREE.ShaderMaterial({ vertexShader: BACK_VERT, fragmentShader: BACK_FRAG, uniforms: u, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
}

// ------------------------------------------------------------------------------------------------
// EMBERS: points sampled on a card's paper (mesh-local), released when the burn front reaches them;
// they rise as golden light (ink falls, light rises)
// ------------------------------------------------------------------------------------------------
const EMBER_VERT = /* glsl */`
${RIG_GLSL}
attribute vec2 aUV; attribute vec2 aS;
uniform sampler2D noiseTex; uniform vec2 uCardSize; uniform float uBurn, uBurnSeed, uSize, uGain;
varying float vI; varying float vHot;
void main(){
  vec2 lp = aUV * uCardSize;
  float n = texture(noiseTex, lp * 0.045 + uBurnSeed).r * 0.8 + texture(noiseTex, lp * 0.21 + uBurnSeed).g * 0.2;
  float p = clamp((uBurn * 1.2 - 0.1 - n) / 0.22, 0., 1.);
  vec4 wp = modelMatrix * vec4(position, 1.);
  float sd = aS.x;
  wp.y += p * p * (5. + 9. * sd) + p * 0.6;
  wp.x += sin(uTime * (0.7 + sd) + sd * 40.) * 1.2 * p;
  wp.z += cos(uTime * (0.5 + sd) + sd * 23.) * 1.2 * p;
  vec4 mv = viewMatrix * wp;
  vHot = exp(-p * 6.);
  vI = step(0.0005, p) * smoothstep(1., 0.55, p) * (0.6 + 2.5 * vHot) * uGain * (0.6 + 0.4 * sin(uTime * (3. + 5. * sd) + sd * 70.));
  gl_PointSize = vI > 0. ? max(1.2 * uPx, uSize * (0.5 + aS.y) * 540. * uPx * projectionMatrix[1][1] / max(0.3, -mv.z)) : 0.;
  gl_Position = projectionMatrix * mv;
}`;
const EMBER_FRAG = /* glsl */`
varying float vI; varying float vHot;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float a = exp(-dot(c, c) * 4.);
  vec3 col = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.85, 0.6), vHot);
  gl_FragColor = vec4(col * a * vI, 0.);
}`;
export function emberMaterial(rig, noise, cardSize, o = {}) {
  const u = { ...rig, noiseTex: { value: noise }, uCardSize: { value: new THREE.Vector2(...cardSize) }, uBurn: { value: 0 }, uBurnSeed: { value: 0.37 }, uSize: { value: o.size ?? 0.07 }, uGain: { value: 1 } };
  return new THREE.ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: u, transparent: true, depthWrite: false, ...ADD_BLEND });
}
/** sample n points inside the opaque paper of a packed Cut texture: returns { pos (mesh-local xy), uv } */
export function samplePaper(tex, n, seed, { w, h, uvScale = [1, 1], y0 = 0, x0 = null } = {}) {
  const d = tex.image.data, W = tex.image.width, Hh = tex.image.height;
  let a = seed >>> 0 || 1; const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pos = [], uvs = [];
  let guard = 0;
  while (pos.length < n * 3 && guard++ < n * 40) {
    const u = r(), v = r();
    const tu = (u * uvScale[0]) % 1, tv = (v * uvScale[1]) % 1;
    const px = Math.min(W - 1, Math.floor(tu * W)), py = Math.min(Hh - 1, Math.floor(tv * Hh));
    if (d[(py * W + px) * 4 + 3] < 180) continue;
    pos.push((x0 ?? -w / 2) + u * w, y0 + v * h, 0); uvs.push(u, v);
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uvs) };
}
