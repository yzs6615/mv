import * as THREE from 'three';
import { rng } from '../core/math.js';

// Shared infrastructure for the deterministic GPU particle / light FX library.
//
//  * Every system is a pure function of film time: per-particle seeds are baked at construction with rng(seed),
//    positions are evaluated analytically in the vertex shader from (seed, uTime). No state is carried
//    between frames, so frames may be rendered in any order.
//  * Blending conventions (see docs/ENGINE.md §4):
//      'add'  — world light: additive colour, alpha (colour-keep mask) untouched
//      'keep' — additive colour AND additive alpha. Every additive FX material uses this mode and writes
//               alpha = uKeep · coverage, so `keep: true|false` (the lovers' light keeps its colour in the grade;
//               world FX write 0) can be switched per update() without rebuilding the material.
//      'ink'  — premultiplied: rgb_out = src.rgb + dst.rgb·(1−a). Dark ink darkens what is behind it and erases the
//               keep-mask by its coverage; the same material can also ADD light (rgb > 0 with a = 0), which is how
//               InkToLight turns ink into light without switching materials.
//  * Sizes in pixels are multiplied by e.px (output height / 1080) so half-res previews frame like the final.

export const PALETTE = {
  romeo: [2.6, 1.45, 0.55], romeoHalo: [1.0, 0.55, 0.18],
  juliet: [2.4, 1.2, 1.45], julietHalo: [0.95, 0.42, 0.55],
  union: [3.0, 2.5, 1.9],
  gold: [2.2, 1.35, 0.55],
  ink: [0.003, 0.004, 0.009], inkPaper: [0.02, 0.017, 0.015],
  candle: [6, 3.2, 1.1], window: [3.6, 1.75, 0.55],
};

export function blending(mode = 'add') {
  const base = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation };
  if (mode === 'keep') return { ...base, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };
  if (mode === 'ink') return { ...base, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  return { ...base, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
}

/** GLSL shared by every FX shader (hashes, smooth noise, ease, colour helpers). */
export const GLSL_COMMON = /* glsl */`
#define PI 3.14159265
#define TAU 6.28318531
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash31(float p){ vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float vnoise(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(hash11(i), hash11(i + 1.), f); }
float vnoise2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), f.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), f.x), f.y); }
float sat(float x){ return clamp(x, 0., 1.); }
float easeOut3(float x){ x = sat(x); return 1. - (1. - x) * (1. - x) * (1. - x); }
float easeInOut(float x){ x = sat(x); return x * x * (3. - 2. * x); }
// smooth multi-sine wander with unit-ish amplitude; s = per-particle seeds
vec3 wander3(vec4 s, float t){
  return vec3(sin(t * (0.37 + 0.31 * s.x) + TAU * s.y) + 0.5 * sin(t * (0.91 + 0.5 * s.z) + TAU * s.w),
              sin(t * (0.29 + 0.27 * s.z) + TAU * s.x) + 0.5 * sin(t * (0.77 + 0.4 * s.w) + TAU * s.y),
              sin(t * (0.33 + 0.29 * s.w) + TAU * s.z) + 0.5 * sin(t * (0.83 + 0.45 * s.x) + TAU * s.w)) * 0.67;
}
`;

/** vertex-shader-only helpers (need projectionMatrix) */
export const GLSL_VERT = /* glsl */`
// world -> pixels-per-unit at view depth (positive)
float pxPerUnit(float depth, float resY){ return projectionMatrix[1][1] * resY * 0.5 / max(depth, 1e-3); }
// camera basis (world) from the view matrix
vec3 camRight(){ return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camUp(){ return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
vec3 camForward(){ return -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); }
`;

/**
 * Screen-space ribbon expansion: the vertex `position` lies on a polyline, aPrev/aNext are its neighbours.
 * Returns the clip position pushed sideways by `halfPx` pixels (miter-limited). `outLenPx` gets |next-prev| (px).
 */
export const GLSL_RIBBON = /* glsl */`
uniform vec2 uRes;
vec4 ribbonClip(vec3 pos, vec3 prev, vec3 next, float side, float halfPx){
  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec4 c = mvp * vec4(pos, 1.), cp = mvp * vec4(prev, 1.), cn = mvp * vec4(next, 1.);
  if (c.w < 1e-3) return vec4(0., 0., 2., 1.);
  cp.w = max(cp.w, 1e-3); cn.w = max(cn.w, 1e-3);
  vec2 hs = uRes * 0.5;
  vec2 s = c.xy / c.w * hs, sp = cp.xy / cp.w * hs, sn = cn.xy / cn.w * hs;
  vec2 d1 = s - sp, d2 = sn - s;
  float l1 = length(d1), l2 = length(d2);
  d1 = l1 > 1e-4 ? d1 / l1 : (l2 > 1e-4 ? d2 / l2 : vec2(1., 0.));
  d2 = l2 > 1e-4 ? d2 / l2 : d1;
  vec2 tg = d1 + d2; float lt = length(tg); tg = lt > 1e-4 ? tg / lt : d1;
  vec2 n = vec2(-tg.y, tg.x);
  float miter = 1. / max(dot(n, vec2(-d1.y, d1.x)), 0.4);
  c.xy += n * side * halfPx * miter / hs * c.w;
  return c;
}
`;

/** a deterministic Float32Array of `n*k` uniform randoms */
export function randoms(n, k, seed) {
  const r = rng(seed), a = new Float32Array(n * k);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}

/** Points geometry with arbitrary float attributes: attrs = { name: [Float32Array, itemSize] } */
export function pointsGeometry(n, attrs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (const [k, [arr, size]] of Object.entries(attrs)) g.setAttribute(k, new THREE.BufferAttribute(arr, size));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
}

/**
 * A batch of quads, one per particle: per-vertex `aCorner` (vec2, default {-1,1} x {0,1}) plus the particle's
 * attributes copied onto its 4 vertices. The vertex shader places the corners itself (billboards, streaks,
 * oriented petals...). Deliberately NOT instanced: SwiftShader pays ~20 µs per instance, which made 16k
 * instanced rain streaks cost ~400 ms; a plain indexed batch of the same quads is ~10× cheaper.
 */
export function quadGeometry(n, attrs, corners = [-1, 0, 1, 0, -1, 1, 1, 1]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
  const C = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) C.set(corners, i * 8);
  g.setAttribute('aCorner', new THREE.BufferAttribute(C, 2));
  for (const [k, [arr, size]] of Object.entries(attrs)) {
    const a = new Float32Array(n * 4 * size);
    for (let i = 0; i < n; i++) for (let v = 0; v < 4; v++) for (let c = 0; c < size; c++) a[(i * 4 + v) * size + c] = arr[i * size + c];
    g.setAttribute(k, new THREE.BufferAttribute(a, size));
  }
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) { const b = i * 4; idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6); }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
}

/**
 * Ribbon (screen-space line strip) geometry from polylines.
 * lines: [{ pts: [[x,y,z],...], attrs?: { name: number[] | number[][] (per point) } }]
 * Emits: position, aPrev, aNext, aSide (-1/+1), aU (0..1 along the polyline), and each extra attribute.
 * extraSizes: { name: itemSize } for the extra attributes (default 1).
 */
export function ribbonGeometry(lines, extraSizes = {}) {
  let nv = 0, ni = 0;
  for (const l of lines) { nv += l.pts.length * 2; ni += (l.pts.length - 1) * 6; }
  const P = new Float32Array(nv * 3), PR = new Float32Array(nv * 3), NX = new Float32Array(nv * 3);
  const S = new Float32Array(nv), U = new Float32Array(nv);
  const extra = {};
  for (const [k, sz] of Object.entries(extraSizes)) extra[k] = { sz, a: new Float32Array(nv * sz) };
  const idx = new Uint32Array(ni);
  let v = 0, ii = 0;
  for (const l of lines) {
    const pts = l.pts, m = pts.length;
    // cumulative length for aU
    const cum = [0];
    for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const L = cum[m - 1] || 1;
    for (let i = 0; i < m; i++) {
      const p = pts[i];
      const pr = i > 0 ? pts[i - 1] : [2 * p[0] - pts[1][0], 2 * p[1] - pts[1][1], 2 * p[2] - pts[1][2]];
      const nx = i < m - 1 ? pts[i + 1] : [2 * p[0] - pts[m - 2][0], 2 * p[1] - pts[m - 2][1], 2 * p[2] - pts[m - 2][2]];
      for (let s = 0; s < 2; s++) {
        P.set(p, v * 3); PR.set(pr, v * 3); NX.set(nx, v * 3);
        S[v] = s ? 1 : -1; U[v] = cum[i] / L;
        for (const [k, { sz, a }] of Object.entries(extra)) {
          const src = l.attrs && l.attrs[k];
          const val = src === undefined ? 0 : (Array.isArray(src) ? src[i] : src);
          if (sz === 1) a[v] = typeof val === 'number' ? val : val[0]; else a.set(val, v * sz);
        }
        v++;
      }
      if (i < m - 1) { const b = v - 2; idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], ii); ii += 6; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aPrev', new THREE.BufferAttribute(PR, 3));
  g.setAttribute('aNext', new THREE.BufferAttribute(NX, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(S, 1));
  g.setAttribute('aU', new THREE.BufferAttribute(U, 1));
  for (const [k, { sz, a }] of Object.entries(extra)) g.setAttribute(k, new THREE.BufferAttribute(a, sz));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
}

/** ShaderMaterial with the common chunks prepended and the chosen blending */
export function fxMaterial({ vertex, fragment, uniforms, blend = 'add', side = THREE.DoubleSide, depthTest = true, ribbon = false }) {
  return new THREE.ShaderMaterial({
    vertexShader: GLSL_COMMON + GLSL_VERT + (ribbon ? GLSL_RIBBON : '') + vertex,
    fragmentShader: GLSL_COMMON + fragment,
    uniforms, side, depthTest, fog: false,
    ...blending(blend),
  });
}

export const v3 = (a) => new THREE.Vector3(...a);
export const col = (a) => new THREE.Vector3(...a); // linear HDR colours are stored as vec3 (no colour management)

/** set a uniform from a param value (numbers, arrays -> vec2/3/4, Vector/Color copy) */
export function setU(u, key, val) {
  if (val === undefined || !u[key]) return;
  const cur = u[key].value;
  if (typeof val === 'number' || typeof val === 'boolean') u[key].value = +val;
  else if (Array.isArray(val) && cur && cur.fromArray) cur.fromArray(val);
  else if (val && val.isVector3 && cur && cur.copy) cur.copy(val);
  else u[key].value = val;
}

/** merge defaults with per-frame params (stateless update: anything not passed reverts to the default) */
export const P = (defaults, params) => ({ ...defaults, ...(params || {}) });

/** tileable value-noise fbm texture (R,G,B,A = four independent fields), baked once on the CPU */
export function noiseTexture(size = 256, seed = 5) {
  const data = new Uint8Array(size * size * 4);
  for (let ch = 0; ch < 4; ch++) {
    const r = rng(seed * 31 + ch * 7 + 1);
    const grids = [4, 8, 16, 32, 64].map((n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = r(); return [n, g]; });
    const val = (n, g, x, y) => {
      const gx = x * n, gy = y * n, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
      const i0 = ((i % n) + n) % n, j0 = ((j % n) + n) % n, i1 = (i0 + 1) % n, j1 = (j0 + 1) % n;
      const a = g[j0 * n + i0], b = g[j0 * n + i1], c = g[j1 * n + i0], d = g[j1 * n + i1];
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0, amp = 0.5, tot = 0;
      for (const [n, g] of grids) { s += amp * val(n, g, x / size, y / size); tot += amp; amp *= 0.5; }
      data[(y * size + x) * 4 + ch] = Math.round(Math.min(1, Math.max(0, (s / tot - 0.5) * 1.6 + 0.5)) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // bilinear + nearest mip: half the texel reads of trilinear (SwiftShader samples are expensive), no shimmer
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapNearestFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

/** shared cache per engine (textures etc.) */
export function shared(e, key, fn) {
  if (!e.cache) e.cache = new Map();
  if (!e.cache.has(key)) e.cache.set(key, fn());
  return e.cache.get(key);
}
