import * as THREE from 'three';
import { rng, clamp, smoothstep } from '../core/math.js';
import { cached } from './verona.js';
import { ADD_BLEND } from './ballroom_fx.js';

// The dance floor as a floating island above a moonlit sea of clouds, Verona's lights far below
// (ballroom shots 1.9 - 1.10). The island's underside is a stack of torn paper strata with gilt edges;
// clouds are baked soft-puff billboards (sorted per frame), the city a field of warm points.

const ISLAND_R = 11.5, CLOUD_Y = -46, CITY_Y = -300;
export const CITY = { x: 260, z: -1400, hole: [140, -560, 360] }; // relative to the hall centre

// ---- baked cloud puffs: atlas of 4 variants (R density, G top light) -----------------------------
function cloudAtlas() {
  const W = 1024, H = 512, cw = 512, ch = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const r = rng(616);
  const dens = new Float32Array(W * H);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * cw, oy = Math.floor(v / 2) * ch;
    g.clearRect(0, 0, W, H);
    // a cumulus: base row of large puffs + smaller billows on top
    const blobs = [];
    const n = 9 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; blobs.push([cw * (0.12 + 0.76 * u + (r() - 0.5) * 0.06), ch * (0.66 - 0.18 * Math.sin(u * Math.PI) - r() * 0.06), cw * (0.07 + 0.07 * Math.sin(u * Math.PI) + r() * 0.03)]); }
    for (let i = 0; i < 14; i++) { const u = 0.15 + 0.7 * r(); blobs.push([cw * u, ch * (0.5 - 0.3 * Math.sin(u * Math.PI) * r()), cw * (0.035 + 0.05 * r())]); }
    for (const [x, y, rad] of blobs) {
      const gr = g.createRadialGradient(ox + x, oy + y, 0, ox + x, oy + y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(ox + x, oy + y, rad, 0, Math.PI * 2); g.fill();
    }
    // flat-ish base
    const base = g.createLinearGradient(0, oy + ch * 0.55, 0, oy + ch * 0.8);
    base.addColorStop(0, 'rgba(255,255,255,0.0)'); base.addColorStop(0.4, 'rgba(255,255,255,0.25)'); base.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = base; g.beginPath(); g.ellipse(ox + cw * 0.5, oy + ch * 0.68, cw * 0.42, ch * 0.1, 0, 0, Math.PI * 2); g.fill();
    const d = g.getImageData(ox, oy, cw, ch).data;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) dens[(oy + y) * W + ox + x] = d[(y * cw + x) * 4 + 3] / 255;
  }
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    // light from above: how much density lies above this texel (short march)
    let occ = 0; for (let k = 1; k <= 10; k++) { const yy = y - k * 5; if (yy < 0 || Math.floor(yy / 256) !== Math.floor(y / 256)) break; occ += dens[yy * W + x]; }
    const lit = Math.exp(-occ * 0.9);
    const dst = ((H - 1 - y) * W + x) * 4;
    out[dst] = Math.round(Math.min(1, dens[i] * 1.6) * 255); out[dst + 1] = Math.round(lit * 255); out[dst + 2] = 0; out[dst + 3] = 255;
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

const CLOUD_VERT = /* glsl */`
attribute vec4 aC;    // x, y, z, size
attribute vec2 aV;    // variant, seed
uniform float uTime;
varying vec2 vUv; varying float vD; varying vec3 vW; varying float vSeed;
void main(){
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(0., 1., 0.);
  vec3 c = aC.xyz + vec3(uTime * 0.6 * (0.6 + aV.y), 0., uTime * 0.15);
  vec3 wp = c + right * position.x * aC.w + up * position.y * aC.w * 0.5;
  vec2 cell = vec2(mod(aV.x, 2.), floor(aV.x / 2.));
  vUv = (cell + uv) * vec2(0.5, 0.5);
  vW = wp; vSeed = aV.y;
  vec4 mv = viewMatrix * vec4(wp, 1.);
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const CLOUD_FRAG = /* glsl */`
uniform sampler2D map, noiseTex; uniform vec3 uLit, uShade, uFog, uMoonDir, uSilver; uniform float uOpacity, uFogD;
varying vec2 vUv; varying float vD; varying vec3 vW; varying float vSeed;
void main(){
  vec4 m = texture2D(map, vUv);
  float nz = texture2D(noiseTex, vUv * 3.0 + vSeed * 7.).r;
  float dens = clamp(m.r * (0.7 + 0.6 * nz) - 0.06, 0., 1.);
  float a = smoothstep(0.0, 0.7, dens) * 0.8 * uOpacity;
  if (a < 0.004) discard;
  vec3 V = normalize(vW - cameraPosition);
  float fwd = pow(max(0., dot(V, uMoonDir)), 8.);
  float lit = pow(m.g, 1.6) * (0.75 + 0.25 * nz);
  vec3 col = mix(uShade, uLit, lit);
  col += uSilver * fwd * dens * (1. - dens) * 1.4;
  float f = 1. - exp(-uFogD * vD);
  col = mix(col, uFog, f * 0.9);
  gl_FragColor = vec4(col, a);
}`;

const CITY_VERT = /* glsl */`
attribute vec2 aS;
uniform float uTime, uPx, uGain;
varying float vI; varying float vWarm;
void main(){
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.);
  vI = (0.5 + 0.5 * aS.x) * (0.85 + 0.15 * sin(uTime * (1. + 3. * aS.y) + aS.x * 50.)) * uGain;
  vWarm = aS.y;
  gl_PointSize = max(1.5, (2.0 + 3.0 * aS.x) * uPx);
  gl_Position = projectionMatrix * mv;
}`;
const CITY_FRAG = /* glsl */`
varying float vI; varying float vWarm;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float a = exp(-dot(c, c) * 3.);
  vec3 col = mix(vec3(2.6, 1.3, 0.45), vec3(2.2, 1.6, 0.9), step(0.85, vWarm));
  gl_FragColor = vec4(col * vI * a, 0.);
}`;

const STRATA_VERT = /* glsl */`
attribute vec3 aCol;
varying vec3 vN; varying vec3 vW; varying vec3 vCol;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const STRATA_FRAG = /* glsl */`
uniform vec3 uInk, uMoonDir, uMoonC, uGold, uWarmP, uWarmC; uniform float uOpacity;
varying vec3 vN; varying vec3 vW; varying vec3 vCol;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.) N = -N;
  float fr = pow(1. - abs(dot(N, V)), 3.);
  float moon = max(0., dot(N, uMoonDir));
  vec3 L = uWarmP - vW; float d2 = dot(L, L);
  float warm = max(0., dot(N, normalize(L))) * 60. / (d2 + 4.);
  vec3 col = uInk * (1. + moon * 3.) + uMoonC * (moon * 0.12 + fr * 0.25) + uWarmC * warm * 0.04;
  col = mix(col, uGold * (0.18 + 0.4 * warm + moon * 0.35 + fr * 0.2), step(1.5, vCol.r));
  gl_FragColor = vec4(col, uOpacity);
}`;

function strataGeometry() {
  // the floor's edge band + an open dome of radial paper fins (a pop-up filigree) ending in a pendant finial
  const R = ISLAND_R, top = -0.55;
  const P = [], N = [], C = [];
  const quad = (a, b, c, d, n, col) => { for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); C.push(col, col, col); } };
  // edge band (cylinder) with gilt lips
  const seg = 96;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const n = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
    quad(p(a0, R + 0.12, 0.0), p(a1, R + 0.12, 0.0), p(a1, R + 0.12, -0.07), p(a0, R + 0.12, -0.07), n, 2);
    quad(p(a0, R + 0.12, -0.07), p(a1, R + 0.12, -0.07), p(a1, R + 0.06, top + 0.05), p(a0, R + 0.06, top + 0.05), n, 1);
    quad(p(a0, R + 0.06, top + 0.05), p(a1, R + 0.06, top + 0.05), p(a1, R + 0.02, top), p(a0, R + 0.02, top), n, 2);
    // underside of the floor slab
    quad(p(a0, R + 0.02, top), p(a1, R + 0.02, top), p(a1, 0.2, top), p(a0, 0.2, top), [0, -1, 0], 1);
  }
  // pendant finial: stacked cones + rings
  const cone = (y0, y1, r0, r1, col) => { for (let i = 0; i < 16; i++) { const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2; const nn = [Math.cos((a0 + a1) / 2), 0.3, Math.sin((a0 + a1) / 2)];
    quad([Math.cos(a0) * r0, y0, Math.sin(a0) * r0], [Math.cos(a1) * r0, y0, Math.sin(a1) * r0], [Math.cos(a1) * r1, y1, Math.sin(a1) * r1], [Math.cos(a0) * r1, y1, Math.sin(a0) * r1], nn, col); } };
  const yT = top - 1.2;
  cone(yT + 0.4, yT - 0.2, 0.55, 0.35, 1); cone(yT - 0.2, yT - 0.32, 0.35, 0.42, 2); cone(yT - 0.32, yT - 1.6, 0.42, 0.02, 1); cone(yT - 1.6, yT - 2.3, 0.02, 0.0, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

// a curtain of crystal drops hanging under the floor in concentric rings (an upside-down chandelier)
function crystalCurtain() {
  const r = rng(9090), P = [], S = [];
  const rings = [[ISLAND_R - 0.6, 4], [ISLAND_R - 2.4, 7], [ISLAND_R - 4.3, 10], [ISLAND_R - 6.2, 14], [ISLAND_R - 8.0, 18], [ISLAND_R - 9.6, 22]];
  for (const [R, len] of rings) {
    const n = Math.round(R * 2 * Math.PI / 0.85);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R;
      const L = len * (0.75 + 0.5 * r());
      const drops = Math.round(L / 0.32);
      for (let j = 1; j <= drops; j++) { P.push(Math.cos(a) * R, -0.6 - j * 0.32, Math.sin(a) * R); S.push(r(), j / drops); }
    }
  }
  for (let j = 0; j < 40; j++) { P.push(0, -2.0 - j * 0.3, 0); S.push(r(), 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 2));
  return g;
}
const CURTAIN_VERT = /* glsl */`
attribute vec2 aS;
uniform float uTime, uPx, uGain; uniform vec3 uMoonDir, uWarmP;
varying vec3 vC;
void main(){
  vec3 p = position;
  float sw = (-p.y) * 0.012;
  p.x += sin(uTime * 0.6 + aS.x * 6.) * sw; p.z += cos(uTime * 0.5 + aS.x * 5.) * sw;
  vec4 wp = modelMatrix * vec4(p, 1.);
  vec4 mv = viewMatrix * wp;
  vec3 V = normalize(cameraPosition - wp.xyz);
  float a = aS.x * 6.2831 + uTime * (0.2 + 0.3 * fract(aS.x * 7.));
  vec3 n = normalize(vec3(cos(a), sin(aS.x * 13.) * 0.6, sin(a)));
  float gm = pow(max(0., dot(reflect(-V, n), uMoonDir)), 30.);
  vec3 L = normalize(uWarmP - wp.xyz);
  float gw = pow(max(0., dot(reflect(-V, n), L)), 16.);
  float tw = pow(0.5 + 0.5 * sin(uTime * (1.5 + 2. * fract(aS.x * 3.1)) + aS.x * 50.), 10.);
  vec3 prism = 0.5 + 0.5 * cos(6.2831 * (fract(aS.x * 5.3) + vec3(0., 0.33, 0.67)));
  vC = (mix(vec3(0.8, 0.9, 1.2), prism, 0.3) * (gm * 4. + 0.12) + vec3(1.4, 0.8, 0.4) * gw * 2.5 + vec3(0.9, 0.85, 1.) * tw * 0.8) * uGain * (1. - 0.4 * aS.y);
  gl_PointSize = max(1.5 * uPx, 0.12 * 540. * uPx * projectionMatrix[1][1] * (0.6 + gm + tw) / max(0.3, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const CURTAIN_FRAG = /* glsl */`
varying vec3 vC;
void main(){ vec2 c = gl_PointCoord * 2. - 1.; float s = exp(-dot(c, c) * 7.) + exp(-abs(c.x) * 24. - abs(c.y) * 3.) * 0.5 + exp(-abs(c.y) * 24. - abs(c.x) * 3.) * 0.5; gl_FragColor = vec4(vC * s, 0.); }`;

export function buildIsland(e, rig, set) {
  const group = new THREE.Group();
  const zc = set.anchors.centre[2];
  // ---- island strata under the floor --------------------------------------------------------------
  const sMat = new THREE.ShaderMaterial({ vertexShader: STRATA_VERT, fragmentShader: STRATA_FRAG, transparent: true, depthWrite: true, side: THREE.DoubleSide,
    uniforms: { uInk: { value: new THREE.Color(0.006, 0.006, 0.01) }, uMoonDir: { value: new THREE.Vector3(0.5, 0.3, -0.8).normalize() }, uMoonC: { value: new THREE.Color(0.12, 0.14, 0.22) },
      uGold: { value: new THREE.Color(1.4, 0.9, 0.4) }, uWarmP: { value: new THREE.Vector3(0, 1, zc) }, uWarmC: { value: new THREE.Color(1.0, 0.6, 0.3) }, uOpacity: { value: 1 } } });
  const strata = new THREE.Mesh(cached(e, 'bal.strata', strataGeometry), sMat);
  strata.position.set(0, -0.02, zc); strata.frustumCulled = false; strata.renderOrder = 3;
  group.add(strata);
  const curMat = new THREE.ShaderMaterial({ vertexShader: CURTAIN_VERT, fragmentShader: CURTAIN_FRAG, transparent: true, depthWrite: false, ...ADD_BLEND,
    uniforms: { uTime: { value: 0 }, uPx: rig.uPx, uGain: { value: 1 }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uWarmP: { value: new THREE.Vector3(0, 1, zc) } } });
  const curtain = new THREE.Points(cached(e, 'bal.curtain', crystalCurtain), curMat);
  curtain.position.set(0, 0, zc); curtain.frustumCulled = false; curtain.renderOrder = 114;
  group.add(curtain);
  // ---- cloud sea ------------------------------------------------------------------------------------
  const r = rng(2468);
  const N = 46, aC = new Float32Array(N * 4), aV = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    let x, z, d;
    void d;
    const a = r() * Math.PI * 2, rr = 26 + Math.pow(r(), 1.1) * 260; x = Math.cos(a) * rr; z = zc + Math.sin(a) * rr; d = rr;
    aC[i * 4] = x; aC[i * 4 + 1] = CLOUD_Y - r() * 26 - d * 0.025; aC[i * 4 + 2] = z; aC[i * 4 + 3] = (30 + r() * 60) * (0.7 + 0.6 * r()) + d * 0.09;
    aV[i * 2] = Math.floor(r() * 4); aV[i * 2 + 1] = r();
  }
  const base = new THREE.PlaneGeometry(1, 1);
  const cg = new THREE.InstancedBufferGeometry();
  cg.index = base.index; cg.attributes.position = base.attributes.position; cg.attributes.uv = base.attributes.uv;
  const cAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), vAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
  cAttr.setUsage(THREE.DynamicDrawUsage); vAttr.setUsage(THREE.DynamicDrawUsage);
  cg.setAttribute('aC', cAttr); cg.setAttribute('aV', vAttr); cg.instanceCount = N;
  const cMat = new THREE.ShaderMaterial({ vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    uniforms: { map: { value: cached(e, 'bal.clouds', cloudAtlas) }, noiseTex: { value: set.noise }, uTime: { value: 0 }, uLit: { value: new THREE.Color(0.17, 0.19, 0.27) }, uShade: { value: new THREE.Color(0.03, 0.037, 0.065) },
      uFog: { value: new THREE.Color(0.03, 0.036, 0.065) }, uMoonDir: { value: new THREE.Vector3(0.5, 0.3, -0.8).normalize() }, uSilver: { value: new THREE.Color(0.3, 0.33, 0.42) }, uOpacity: { value: 1 }, uFogD: { value: 0.0022 } } });
  const clouds = new THREE.Mesh(cg, cMat); clouds.frustumCulled = false; clouds.renderOrder = 4;
  group.add(clouds);
  // rolling cloud-top surfaces: height field from tiling noise, lit by the moon, gaps open onto the city
  const DECK_FRAG = /* glsl */`
  uniform sampler2D noiseTex; uniform vec3 uMoonDir, uLit, uShade, uFog, uSilver, uC, uHole; uniform float uScale, uCover, uTime, uOpacity, uFogD, uSeed;
  varying vec3 vW;
  float hgt(vec2 p){ return texture2D(noiseTex, p).r * 0.6 + texture2D(noiseTex, p * 2.13 + uSeed).r * 0.22 + texture2D(noiseTex, p * 0.37 + 0.21).r * 0.3; }
  void main(){
    vec2 p = (vW.xz - uC.xz) * uScale + vec2(uTime * 0.0011, uTime * 0.0004) + uSeed;
    float e = 0.004;
    float h = hgt(p), hx = hgt(p + vec2(e, 0.)), hz = hgt(p + vec2(0., e));
    vec3 N = normalize(vec3(-(hx - h) / e * 0.05, 1., -(hz - h) / e * 0.05));
    // a clearing above Verona: the clouds part over the city lights
    float hd = length(vW.xz - uHole.xz) / uHole.y;
    float cv = uCover + 0.55 * smoothstep(1.0, 0.35, hd + (h - 0.5) * 0.5);
    float cover = smoothstep(cv, cv + 0.18, h);
    float d = length(vW - cameraPosition);
    float far = smoothstep(500., 2500., d);
    cover = mix(cover, 1., far);
    float lit = clamp(dot(N, uMoonDir) * 1.3 + 0.2, 0., 1.) * smoothstep(uCover - 0.1, uCover + 0.6, h);
    vec3 V = normalize(vW - cameraPosition);
    vec3 col = mix(uShade, uLit, lit);
    float mp = pow(max(0., dot(reflect(V, N), uMoonDir)), 16.);
    col += uSilver * mp * 0.12 * lit;
    float fwd = pow(max(0., dot(V, normalize(vec3(uMoonDir.x, 0., uMoonDir.z)))), 14.);
    float f = 1. - exp(-uFogD * d);
    col = mix(col, uFog + uSilver * fwd * 0.12, f);
    gl_FragColor = vec4(col, cover * uOpacity);
  }`;
  const mkDeck = (y, scale, cover, seed, ro) => {
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      uniforms: { noiseTex: { value: set.noise }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color(0.15, 0.17, 0.25) }, uShade: { value: new THREE.Color(0.01, 0.013, 0.027) },
        uFog: { value: new THREE.Color(0.03, 0.036, 0.065) }, uSilver: { value: new THREE.Color(0.5, 0.52, 0.62) }, uC: { value: new THREE.Vector3(0, 0, zc) },
        uScale: { value: scale }, uCover: { value: cover }, uHole: { value: new THREE.Vector3(CITY.hole[0], CITY.hole[2], zc + CITY.hole[1]) }, uTime: { value: 0 }, uOpacity: { value: 1 }, uFogD: { value: 0.0011 }, uSeed: { value: seed } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: DECK_FRAG });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, y, zc); mesh.renderOrder = ro; mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const deck = mkDeck(CLOUD_Y - 34, 1 / 640, 0.34, 0.0, 2);
  const deck2 = mkDeck(CLOUD_Y - 6, 1 / 330, 0.56, 0.47, 3);
  // ---- Verona's lights far below ------------------------------------------------------------------------
  const M = 7000, cp = new Float32Array(M * 3), cs = new Float32Array(M * 2), rc = rng(777);
  for (let i = 0; i < M; i++) {
    let x, z;
    const k = rc();
    if (k < 0.55) { // the old town inside the river's S-bend
      const a = rc() * Math.PI * 2, rr = Math.sqrt(rc()) * 380; x = Math.cos(a) * rr * 1.3; z = Math.sin(a) * rr;
    } else if (k < 0.8) { // along the Adige banks
      const u = rc() * 2 - 1; const rx = Math.sin(u * 3.0) * 420; x = rx + (rc() < 0.5 ? -1 : 1) * (30 + rc() * 40); z = u * 900;
    } else { const a = rc() * Math.PI * 2, rr = 400 + rc() * 1600; x = Math.cos(a) * rr; z = Math.sin(a) * rr; if (rc() < 0.6) continue; }
    cp[i * 3] = x + CITY.x; cp[i * 3 + 1] = CITY_Y; cp[i * 3 + 2] = zc + z + CITY.z;
    cs[i * 2] = rc(); cs[i * 2 + 1] = rc();
  }
  const cityG = new THREE.BufferGeometry(); cityG.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cityG.setAttribute('aS', new THREE.BufferAttribute(cs, 2));
  const cityMat = new THREE.ShaderMaterial({ vertexShader: CITY_VERT, fragmentShader: CITY_FRAG, transparent: true, depthWrite: false, ...ADD_BLEND,
    uniforms: { uTime: { value: 0 }, uPx: rig.uPx, uGain: { value: 1 } } });
  const city = new THREE.Points(cityG, cityMat); city.frustumCulled = false; city.renderOrder = 1;
  group.add(city);

  const order = new Array(N).fill(0).map((_, i) => i);
  const tmp = new THREE.Vector3();
  return {
    group, strata, clouds, city, deck, deck2,
    hideInReflection: [strata, clouds, city, deck, deck2, curtain],
    update(t, { island = 0, collapse = 0, clouds: cl = 0, city: ci = 0, light = 1 } = {}) {
      strata.visible = island > 0.01; curtain.visible = island > 0.01;
      sMat.uniforms.uOpacity.value = 1;
      strata.scale.set(1, smoothstep(0, 1, island), 1);
      curtain.scale.set(1, smoothstep(0.3, 1, island), 1);
      curMat.uniforms.uTime.value = t; curMat.uniforms.uGain.value = smoothstep(0.3, 1, island) * light;
      curMat.uniforms.uMoonDir.value.copy(set.sky.uniforms.uMoonDir.value); curMat.uniforms.uWarmP.value.copy(rig.uLP.value[5]);
      sMat.uniforms.uMoonDir.value.copy(set.sky.uniforms.uMoonDir.value);
      cMat.uniforms.uMoonDir.value.copy(set.sky.uniforms.uMoonDir.value);
      clouds.visible = cl > 0.001; deck.visible = cl > 0.001; deck2.visible = cl > 0.001; city.visible = ci > 0.001;
      cMat.uniforms.uOpacity.value = clamp(cl);
      for (const dk of [deck, deck2]) { const u = dk.material.uniforms; u.uOpacity.value = clamp(cl); u.uTime.value = t; u.uMoonDir.value.copy(set.sky.uniforms.uMoonDir.value); }
      cMat.uniforms.uTime.value = t; cityMat.uniforms.uTime.value = t; cityMat.uniforms.uGain.value = clamp(ci) * light;
      // warm light of the lovers (extra light 5) on the strata
      const lp = rig.uLP.value[5], lc = rig.uLC.value[5];
      sMat.uniforms.uWarmP.value.copy(lp); sMat.uniforms.uWarmC.value.setRGB(lc.x, lc.y, lc.z).multiplyScalar(0.05);
      void tmp; void collapse;
    },
    /** back-to-front sort of the cloud billboards for the render camera */
    sort(cam) {
      if (clouds.visible) {
        const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
        order.sort((a, b) => ((aC[b * 4] - cx) ** 2 + (aC[b * 4 + 1] - cy) ** 2 + (aC[b * 4 + 2] - cz) ** 2) - ((aC[a * 4] - cx) ** 2 + (aC[a * 4 + 1] - cy) ** 2 + (aC[a * 4 + 2] - cz) ** 2));
        const A = cAttr.array, B = vAttr.array;
        order.forEach((j, k) => { A[k * 4] = aC[j * 4]; A[k * 4 + 1] = aC[j * 4 + 1]; A[k * 4 + 2] = aC[j * 4 + 2]; A[k * 4 + 3] = aC[j * 4 + 3]; B[k * 2] = aV[j * 2]; B[k * 2 + 1] = aV[j * 2 + 1]; });
        cAttr.needsUpdate = true; vAttr.needsUpdate = true;
      }
    },
  };
}
