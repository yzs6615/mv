import * as THREE from 'three';
import { rng } from '../core/math.js';
import { GLSL_COMMON, GLSL_VERT, GLSL_RIBBON, PALETTE, blending, pointsGeometry, quadGeometry, ribbonGeometry, randoms, setU, P } from './particles_core.js';

// ============================================================================================================
//  Light-drawing FX: Trail · RingOfLight · Shockwave · LightVine · Lightning
//  Same contract as particles.js: `.object`, `update(t, params)`, stateless (params not passed revert to defaults).
//  Lines are screen-space ribbons (constant pixel width floor, perspective world width above it), so they stay
//  crisp at any distance. FX that belong to the lovers (Trail, RingOfLight, LightVine) write the colour-keep mask
//  by default (keep: true); world FX (Shockwave, Lightning) write alpha 0.
// ============================================================================================================

const TAU = Math.PI * 2;
const vmat = (vert, frag, uniforms, blend, extra = {}) => new THREE.ShaderMaterial({
  vertexShader: GLSL_COMMON + GLSL_VERT + GLSL_RIBBON + vert, fragmentShader: GLSL_COMMON + frag,
  uniforms, depthTest: true, side: THREE.DoubleSide, fog: false, ...blending(blend), ...extra,
});
const fin = (o, order) => { o.frustumCulled = false; o.renderOrder = order; return o; };
const common = (e) => ({ uTime: { value: 0 }, uPx: { value: e.px }, uRes: { value: new THREE.Vector2(e.W, e.H) } });
const tick = (self, t) => { const u = self.u; u.uTime.value = t; u.uPx.value = self.e.px; u.uRes.value.set(self.e.W, self.e.H); };

// soft glowing sprite (head of a trail, sparkles, glints)
const GLOW_SPRITE_FRAG = /* glsl */`
uniform float uKeep;
varying vec3 vCol; varying float vI, vStar;
void main(){
  vec2 p = gl_PointCoord - .5; float r = length(p) * 2.;
  if (r > 1.) discard;
  float a = exp(-r * r * 14.) * 1.4 + exp(-r * 5.) * 0.32 * (1. - r);
  if (vStar > 0.) { // 4-point glint
    float th = 0.035;
    a += vStar * (exp(-abs(p.y) / th) * pow(1. - min(abs(p.x) * 2., 1.), 3.) + exp(-abs(p.x) / th) * pow(1. - min(abs(p.y) * 2., 1.), 3.));
  }
  gl_FragColor = vec4(vCol * vI * a, uKeep * sat(vI * a));
}`;

// ------------------------------------------------------------------------------------------------------------
//  Trail — a glowing ribbon that follows any path f(t) → [x,y,z], fading over a time window, shedding sparkles
// ------------------------------------------------------------------------------------------------------------
const TRAIL_VERT = /* glsl */`
attribute vec3 aPrev, aNext; attribute float aSide, aU;
uniform float uPx, uWidth, uMinPx, uGlowPx, uTaper, uFadePow, uIntensity;
varying float vSide, vHalf, vCoreS, vI, vU;
void main(){
  vU = aU;
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  float depth = max(-mv.z, 0.01);
  float wpx = uWidth * pxPerUnit(depth, uRes.y) * mix(uTaper, 1., aU);
  float corePx = max(wpx, uMinPx * uPx * mix(0.6, 1., aU));
  float hw = corePx * 0.5 + uGlowPx * uPx;
  gl_Position = ribbonClip(position, aPrev, aNext, aSide, hw);
  vSide = aSide; vHalf = hw; vCoreS = corePx * 0.45;
  vI = uIntensity * pow(aU, uFadePow) * sat(wpx / (uMinPx * uPx) * 0.7 + 0.45);
}`;
const TRAIL_FRAG = /* glsl */`
uniform float uKeep, uPx, uGlowPx, uHotLen; uniform vec3 uColor, uHot;
varying float vSide, vHalf, vCoreS, vI, vU;
void main(){
  float d = abs(vSide) * vHalf;
  float core = exp(-d * d / (2. * vCoreS * vCoreS));
  float glow = exp(-d / max(uGlowPx * uPx * 0.4, 0.5)) * 0.42;
  // white-hot only where the light is now; the painted stroke cools to the lover's colour
  float hot = smoothstep(1. - uHotLen, 1., vU);
  vec3 c = (uHot * core * (0.25 + 0.75 * hot) + uColor * (core * 0.85 + glow)) * vI;
  gl_FragColor = vec4(c, uKeep * sat((core + glow) * vI));
}`;
const SPARK_VERT = /* glsl */`
attribute float aI, aSize, aStar;
uniform float uPx; uniform vec3 uColor, uHot;
varying vec3 vCol; varying float vI, vStar;
void main(){
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  gl_PointSize = aSize * uPx;
  vI = aI; vStar = aStar; vCol = mix(uColor, uHot, 0.35 + 0.3 * aStar);
  if (aI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;

export class Trail {
  /**
   * opts: path(t) → [x,y,z] (film time), window(1.4 s of trail), start(-Infinity: no trail before), samples(96),
   *   width(0.05 m world), minPx(1.6), glowPx(9), taper(0.35 width at the tail), fadePow(1.5),
   *   color (Romeo), hot (white-hot core), intensity(1), keep(true),
   *   sparkles(140), sparkleLife(1.8 s), sparkleRise(0.3 m/s), sparkleSpread(0.25 m/s), sparklePx(3), head(1), headPx(30)
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { window: 1.4, start: -Infinity, width: 0.05, minPx: 1.6, glowPx: 10, taper: 0.35, fadePow: 1.2, hotLen: 0.15, color: PALETTE.romeo, hot: [3.2, 2.8, 2.3],
      intensity: 1, keep: true, sparkleLife: 1.8, sparkleRise: 0.3, sparkleSpread: 0.25, sparklePx: 3, head: 1, headPx: 30, ...opts };
    this.path = opts.path || ((t) => [Math.cos(t), 1, Math.sin(t)]);
    const N = this.N = opts.samples ?? 96;
    const pts = Array.from({ length: N }, () => [0, 0, 0]);
    this.geo = ribbonGeometry([{ pts }]);
    this.pos = this.geo.attributes.position; this.prev = this.geo.attributes.aPrev; this.next = this.geo.attributes.aNext;
    const au = this.geo.attributes.aU.array; // 0 = tail … 1 = head (by sample index: the samples are uniform in time)
    for (let i = 0; i < N; i++) au[i * 2] = au[i * 2 + 1] = i / (N - 1);
    for (const a of [this.pos, this.prev, this.next]) a.setUsage(THREE.DynamicDrawUsage);
    this.u = { ...common(e), uWidth: { value: 0.05 }, uMinPx: { value: 1 }, uGlowPx: { value: 9 }, uTaper: { value: 0.3 }, uFadePow: { value: 1.5 }, uHotLen: { value: 0.15 },
      uIntensity: { value: 1 }, uColor: { value: new THREE.Vector3() }, uHot: { value: new THREE.Vector3() }, uKeep: { value: 1 } };
    const blend = 'keep';
    this.ribbon = fin(new THREE.Mesh(this.geo, vmat(TRAIL_VERT, TRAIL_FRAG, this.u, blend)), opts.renderOrder ?? 130);
    // sparkles (+ the head glow as point 0)
    const M = this.M = (opts.sparkles ?? 140) + 1;
    this.sp = { pos: new Float32Array(M * 3), I: new Float32Array(M), size: new Float32Array(M), star: new Float32Array(M) };
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sp.pos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aI', new THREE.BufferAttribute(this.sp.I, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aSize', new THREE.BufferAttribute(this.sp.size, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aStar', new THREE.BufferAttribute(this.sp.star, 1).setUsage(THREE.DynamicDrawUsage));
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.seeds = randoms(M, 6, opts.seed ?? 808);
    this.sparks = fin(new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: GLSL_COMMON + SPARK_VERT, fragmentShader: GLSL_COMMON + GLOW_SPRITE_FRAG,
      uniforms: this.u, depthTest: true, ...blending(blend) })), (opts.renderOrder ?? 130) + 1);
    this.object = new THREE.Group();
    this.object.add(this.ribbon, this.sparks);
  }
  update(t, params) {
    const p = P(this.defaults, params);
    const path = p.path || this.path;
    tick(this, t);
    const u = this.u;
    for (const [k, v] of [['uWidth', p.width], ['uMinPx', p.minPx], ['uGlowPx', p.glowPx], ['uTaper', p.taper], ['uFadePow', p.fadePow], ['uHotLen', p.hotLen],
      ['uIntensity', p.intensity], ['uColor', p.color], ['uHot', p.hot], ['uKeep', p.keep ? 1 : 0]]) setU(u, k, v);
    const t0 = Math.max(t - p.window, p.start), span = t - t0;
    this.object.visible = p.visible !== false && span > 1e-3 && p.intensity > 0;
    if (!this.object.visible) return this;
    // ribbon samples (tail → head); prev/next duplicate the end points' neighbours
    const N = this.N, P3 = [];
    for (let i = 0; i < N; i++) P3.push(path(t0 + (span * i) / (N - 1)));
    const pa = this.pos.array, pr = this.prev.array, nx = this.next.array;
    for (let i = 0; i < N; i++) {
      const c = P3[i];
      const a = i > 0 ? P3[i - 1] : [2 * c[0] - P3[1][0], 2 * c[1] - P3[1][1], 2 * c[2] - P3[1][2]];
      const b = i < N - 1 ? P3[i + 1] : [2 * c[0] - P3[N - 2][0], 2 * c[1] - P3[N - 2][1], 2 * c[2] - P3[N - 2][2]];
      for (let s = 0; s < 2; s++) { const v = (i * 2 + s) * 3; pa.set(c, v); pr.set(a, v); nx.set(b, v); }
    }
    this.pos.needsUpdate = this.prev.needsUpdate = this.next.needsUpdate = true;
    // head + sparkles: each sparkle re-spawns every `life` seconds at the path position of its birth, then drifts up
    const sp = this.sp, M = this.M, L = p.sparkleLife, S = this.seeds;
    const head = P3[N - 1];
    sp.pos.set(head, 0); sp.I[0] = p.head * p.intensity * 1.6; sp.size[0] = p.headPx; sp.star[0] = 0.35 * p.head;
    for (let i = 1; i < M; i++) {
      const ph = S[i * 6], age = ((t - ph * L) % L + L) % L, tb = t - age;
      if (tb < p.start || tb < t - p.window * 1.5) { sp.I[i] = 0; continue; }
      const c = path(tb), k = age / L;
      const dx = (S[i * 6 + 1] - 0.5) * 2, dz = (S[i * 6 + 2] - 0.5) * 2;
      sp.pos[i * 3] = c[0] + dx * p.sparkleSpread * age;
      sp.pos[i * 3 + 1] = c[1] + p.sparkleRise * (0.4 + S[i * 6 + 3]) * age;
      sp.pos[i * 3 + 2] = c[2] + dz * p.sparkleSpread * age;
      const tw = 0.6 + 0.4 * Math.sin(t * (9 + 8 * S[i * 6 + 4]) + S[i * 6 + 5] * TAU);
      sp.I[i] = p.intensity * (1 - k) * (1 - k) * Math.min(1, age * 12) * tw * (0.5 + S[i * 6 + 3]);
      sp.size[i] = p.sparklePx * (0.6 + 0.8 * S[i * 6 + 4]);
      sp.star[i] = S[i * 6 + 5] > 0.9 ? 0.6 : 0;
    }
    const g = this.sparks.geometry.attributes;
    g.position.needsUpdate = g.aI.needsUpdate = g.aSize.needsUpdate = g.aStar.needsUpdate = true;
    return this;
  }
}

/** ∞ path helper (lemniscate of Gerono/Bernoulli-like), centre [x,y,z], size [a,b] metres, period s, plane 'xy'|'xz' */
export function lemniscate(center = [0, 0, 0], size = [3, 1.4], period = 4, plane = 'xz', phase = 0) {
  return (t) => {
    const a = TAU * t / period + phase;
    const s = Math.sin(a), c = Math.cos(a), d = 1 + s * s;
    const x = size[0] * c / d, y = size[1] * 2 * s * c / d;
    return plane === 'xy' ? [center[0] + x, center[1] + y, center[2]] : [center[0] + x, center[1], center[2] + y];
  };
}

// ------------------------------------------------------------------------------------------------------------
//  RingOfLight — the proposal ring: a fine circle of light with orbiting sparks, a travelling glint and a halo;
//  `radius` can grow from centimetres to a city-sized halo
// ------------------------------------------------------------------------------------------------------------
const RING_VERT = /* glsl */`
attribute vec3 aPrev, aNext; attribute float aSide, aU;
uniform float uPx, uRadius, uThick, uMinPx, uGlowPx, uIntensity, uTime, uShimmer;
varying float vSide, vHalf, vCoreS, vI, vU;
void main(){
  vU = 1.;
  vec3 pos = position * uRadius, pv = aPrev * uRadius, nx = aNext * uRadius;
  vec4 mv = modelViewMatrix * vec4(pos, 1.);
  float depth = max(-mv.z, 0.01);
  float wpx = uThick * pxPerUnit(depth, uRes.y);
  float corePx = max(wpx, uMinPx * uPx);
  float hw = corePx * 0.5 + uGlowPx * uPx;
  gl_Position = ribbonClip(pos, pv, nx, aSide, hw);
  vSide = aSide; vHalf = hw; vCoreS = corePx * 0.45;
  vI = uIntensity * (1. + uShimmer * (0.5 * sin(aU * TAU * 3. - uTime * 3.1) + 0.5 * sin(aU * TAU * 7. + uTime * 4.7)));
}`;
const RING_SPARK_VERT = /* glsl */`
attribute vec4 aSeed;
uniform float uTime, uPx, uRadius, uIntensity, uSparkSpeed, uSparkPx;
uniform vec3 uColor, uHot;
varying vec3 vCol; varying float vI, vStar;
void main(){
  float dir = aSeed.w < 0.5 ? -1. : 1.;
  float ang = aSeed.x * TAU + dir * uTime * uSparkSpeed * (0.4 + aSeed.y);
  float rr = uRadius * (1. + (aSeed.z - 0.5) * 0.16);
  vec3 p = vec3(cos(ang) * rr, sin(ang) * rr, (aSeed.y - 0.5) * 0.12 * uRadius);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  gl_PointSize = uSparkPx * uPx * (0.5 + aSeed.z);
  float tw = pow(0.5 + 0.5 * sin(uTime * (5. + 7. * aSeed.z) + aSeed.y * TAU), 3.);
  vI = uIntensity * 0.9 * tw; vStar = 0.; vCol = mix(uColor, uHot, 0.5);
}`;
const RING_GLINT_VERT = /* glsl */`
attribute float aKind;
uniform float uTime, uPx, uRadius, uIntensity, uGlint, uGlintSpin, uHalo;
uniform vec3 uColor, uHot; uniform vec2 uRes;
varying vec3 vCol; varying float vI, vStar;
void main(){
  vec3 p = vec3(0.);
  if (aKind < 0.5) { float a = uTime * uGlintSpin + 0.6; p = vec3(cos(a), sin(a), 0.) * uRadius; }
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float ppu = pxPerUnit(max(-mv.z, 0.01), uRes.y);
  if (aKind < 0.5) { gl_PointSize = 70. * uPx; vI = uIntensity * uGlint * (0.75 + 0.25 * sin(uTime * 2.3)); vStar = 1.; vCol = uHot; }
  else { float s = uRadius * 5.5 * ppu; gl_PointSize = min(s, 1000.); vI = uIntensity * uHalo * 0.22 * (1. - smoothstep(700., 1000., s)); vStar = 0.; vCol = uColor; }
  if (vI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;

export class RingOfLight {
  /**
   * The ring lies in its local XY plane (face +Z): position/orient `ring.object` (e.g. lookAt the camera, tilt it).
   * opts: radius(0.055 m), thick(0.0035 m), minPx(1.5), glowPx(5), color [1.6,1.3,0.95] (white-gold, ~half the union value so
   *   it stays a fine line under bloom), hot, intensity(1), keep(true), sparkles(44), sparkSpeed(1.1 rad/s), sparkPx(4),
   *   glint(0.6), glintSpin(0.7 rad/s), halo(0.12: soft glow sprite, small rings only), shimmer(0.25), segments(200)
   * update(t, { radius, thick, glowPx, intensity, glint, halo, ... }) — animate radius to expand into a huge halo.
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { radius: 0.055, thick: 0.0035, minPx: 1.5, glowPx: 5, color: [1.6, 1.3, 0.95], hot: [2.0, 1.8, 1.55], intensity: 1, keep: true,
      sparkSpeed: 1.1, sparkPx: 4, glint: 0.6, glintSpin: 0.7, halo: 0.12, shimmer: 0.25, ...opts };
    const S = opts.segments ?? 200;
    const pts = [];
    for (let i = 0; i <= S; i++) { const a = (i / S) * TAU; pts.push([Math.cos(a), Math.sin(a), 0]); }
    const geo = ribbonGeometry([{ pts }]);
    // close the loop: first/last vertices see their true neighbours
    const pr = geo.attributes.aPrev.array, nx = geo.attributes.aNext.array;
    const a1 = (1 / S) * TAU, aL = ((S - 1) / S) * TAU;
    for (let s = 0; s < 2; s++) { pr.set([Math.cos(aL), Math.sin(aL), 0], s * 3); nx.set([Math.cos(a1), Math.sin(a1), 0], (S * 2 + s) * 3); }
    this.u = { ...common(e), uRadius: { value: 0.05 }, uThick: { value: 0.004 }, uMinPx: { value: 1.5 }, uGlowPx: { value: 10 }, uIntensity: { value: 1 }, uHotLen: { value: 1 },
      uShimmer: { value: 0.25 }, uColor: { value: new THREE.Vector3() }, uHot: { value: new THREE.Vector3() }, uKeep: { value: 1 },
      uSparkSpeed: { value: 1 }, uSparkPx: { value: 4 }, uGlint: { value: 1 }, uGlintSpin: { value: 0.7 }, uHalo: { value: 1 } };
    const blend = 'keep';
    this.ring = fin(new THREE.Mesh(geo, vmat(RING_VERT, TRAIL_FRAG, this.u, blend)), opts.renderOrder ?? 132);
    const ns = opts.sparkles ?? 44;
    this.sparks = fin(new THREE.Points(pointsGeometry(ns, { aSeed: [randoms(ns, 4, opts.seed ?? 909), 4] }), new THREE.ShaderMaterial({
      vertexShader: GLSL_COMMON + RING_SPARK_VERT, fragmentShader: GLSL_COMMON + GLOW_SPRITE_FRAG, uniforms: this.u, depthTest: true, ...blending(blend) })), (opts.renderOrder ?? 132) + 1);
    this.glint = fin(new THREE.Points(pointsGeometry(2, { aKind: [new Float32Array([0, 1]), 1] }), new THREE.ShaderMaterial({
      vertexShader: GLSL_COMMON + GLSL_VERT + RING_GLINT_VERT, fragmentShader: GLSL_COMMON + GLOW_SPRITE_FRAG, uniforms: this.u, depthTest: true, ...blending(blend) })), (opts.renderOrder ?? 132) + 2);
    this.object = new THREE.Group();
    this.object.add(this.ring, this.sparks, this.glint);
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    tick(this, t);
    for (const [k, v] of [['uRadius', p.radius], ['uThick', p.thick], ['uMinPx', p.minPx], ['uGlowPx', p.glowPx], ['uIntensity', p.intensity], ['uShimmer', p.shimmer],
      ['uColor', p.color], ['uHot', p.hot], ['uKeep', p.keep ? 1 : 0], ['uSparkSpeed', p.sparkSpeed], ['uSparkPx', p.sparkPx], ['uGlint', p.glint],
      ['uGlintSpin', p.glintSpin], ['uHalo', p.halo]]) setU(u, k, v);
    this.object.visible = p.visible !== false && p.intensity > 0;
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  Shockwave — a ring of light racing across a ground plane, with a rising curtain at the front and a warm wash
//  left behind (4.3 "the colour shockwave sweeps the city"). radius(t) = speed·(t − t0) unless `radius` is given.
// ------------------------------------------------------------------------------------------------------------
const WAVE_DISC_VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WAVE_DISC_FRAG = /* glsl */`
uniform vec3 uCenter, uRingCol, uWashCol; uniform float uR, uWidth, uIntensity, uWash, uTrail, uResidual, uTime, uMaxR, uKeep, uWobble;
varying vec3 vW;
void main(){
  vec2 d = vW.xz - uCenter.xz; float r = length(d);
  if (r > uR * (1. + uWobble) + uWidth * 8.) discard;             // ahead of the front: nothing (cheap early out)
  float R = uR;
  if (abs(r - uR) < uR * uWobble + uWidth * 8.) {   // the wobbly front only matters near the ring
    float th = atan(d.y, d.x);
    R = uR * (1. + uWobble * (vnoise(th * 9. + uTime * 0.3) - 0.5) + 0.5 * uWobble * (vnoise(th * 23. - uTime * 0.5) - 0.5));
  }
  float x = (r - R) / uWidth;
  float ring = exp(-x * x) + 0.35 * exp(-max(x, 0.) * 0.6) * step(0., x) * exp(-x * 0.2) * 0.;
  float ahead = exp(-max(x, 0.) * 1.4) * step(0., x) * 0.25;
  float behind = (1. - smoothstep(-1.2, 0., x)) ;
  float wash = behind * (uWash * exp(-(R - r) / max(uTrail, 1e-3)) + uResidual);
  float edge = 1. - smoothstep(uMaxR * 0.8, uMaxR, r);
  vec3 c = (uRingCol * (ring + ahead) + uWashCol * wash) * uIntensity * edge;
  if (dot(c, vec3(1.)) < 1e-5) discard;
  gl_FragColor = vec4(c, uKeep * sat((ring + wash) * uIntensity * edge));
}`;
const WAVE_CURTAIN_VERT = /* glsl */`
uniform float uR, uH; uniform vec3 uCenter;
varying float vY, vTh; varying vec3 vW;
void main(){
  vec3 p = vec3(position.x * uR, position.y * uH, position.z * uR) + uCenter;
  vY = position.y; vTh = atan(position.z, position.x); vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`;
const WAVE_CURTAIN_FRAG = /* glsl */`
uniform vec3 uRingCol; uniform float uIntensity, uCurtain, uTime, uKeep, uFadeR;
varying float vY, vTh; varying vec3 vW;
void main(){
  // a thin veil of vertical rays riding the front, brightest at the ground (geometry spans the lower 55%)
  float n = vnoise(vTh * 90. + uTime * 0.5);
  float rays = 0.3 + 1.4 * n * n;
  float y = vY * 0.55;
  float v = exp(-y * 4.5) * (1. - vY) * smoothstep(0., 0.02, y);
  float a = v * rays * uCurtain * uIntensity * uFadeR * 0.6;
  gl_FragColor = vec4(uRingCol * a, uKeep * sat(a));
}`;

export class Shockwave {
  /**
   * opts: center [x,y,z] (ground height = y), t0 (start, film s), speed (m/s), maxRadius(1500), width(6 m ring),
   *   ringColor [3.0,2.4,1.7], washColor [1.1,0.55,0.22] (warm left behind), wash(0.35), trail(120 m), residual(0.04),
   *   curtain(0.9: height of the light wall relative), curtainHeight(60 m), intensity(1), wobble(0.06), keep(false)
   * update(t, { radius? (overrides speed·(t−t0)), camera? (lets it draw only the wall side facing the camera: cheaper), ... });
   * radiusAt(t); arrival(x, z) → film time the front reaches (x,z).
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { center: [0, 0, 0], t0: 0, speed: 120, maxRadius: 1500, width: 6, ringColor: [3.0, 2.4, 1.7], washColor: [1.1, 0.55, 0.22],
      wash: 0.35, trail: 120, residual: 0.04, curtain: 0.6, curtainHeight: 50, intensity: 1, wobble: 0.06, keep: false, ...opts };
    this.u = { ...common(e), uCenter: { value: new THREE.Vector3() }, uRingCol: { value: new THREE.Vector3() }, uWashCol: { value: new THREE.Vector3() },
      uR: { value: 0 }, uWidth: { value: 5 }, uIntensity: { value: 1 }, uWash: { value: 0.5 }, uTrail: { value: 100 }, uResidual: { value: 0 },
      uMaxR: { value: 1000 }, uKeep: { value: 0 }, uWobble: { value: 0.05 }, uH: { value: 50 }, uCurtain: { value: 1 }, uFadeR: { value: 1 } };
    const blend = 'keep';
    const disc = new THREE.PlaneGeometry(2, 2, 1, 1); disc.rotateX(-Math.PI / 2);
    this.disc = fin(new THREE.Mesh(disc, new THREE.ShaderMaterial({ vertexShader: GLSL_COMMON + WAVE_DISC_VERT, fragmentShader: GLSL_COMMON + WAVE_DISC_FRAG,
      uniforms: this.u, depthTest: true, side: THREE.DoubleSide, ...blending(blend) })), opts.renderOrder ?? 115);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 160, 1, true); cyl.translate(0, 0.5, 0);
    this.curtain = fin(new THREE.Mesh(cyl, new THREE.ShaderMaterial({ vertexShader: GLSL_COMMON + WAVE_CURTAIN_VERT, fragmentShader: GLSL_COMMON + WAVE_CURTAIN_FRAG,
      uniforms: this.u, depthTest: true, side: THREE.DoubleSide, ...blending(blend) })), (opts.renderOrder ?? 115) + 1);
    this.object = new THREE.Group();
    this.object.add(this.disc, this.curtain);
    this.update(0);
  }
  radiusAt(t, params) { const p = P(this.defaults, params); return p.radius ?? Math.max(0, (t - p.t0) * p.speed); }
  arrival(x, z, params) { const p = P(this.defaults, params); return p.t0 + Math.hypot(x - p.center[0], z - p.center[2]) / p.speed; }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    tick(this, t);
    const R = this.radiusAt(t, params);
    u.uR.value = R; u.uCenter.value.fromArray(p.center);
    for (const [k, v] of [['uRingCol', p.ringColor], ['uWashCol', p.washColor], ['uWidth', p.width], ['uIntensity', p.intensity], ['uWash', p.wash],
      ['uTrail', p.trail], ['uResidual', p.residual], ['uMaxR', p.maxRadius], ['uKeep', p.keep ? 1 : 0], ['uWobble', p.wobble],
      ['uCurtain', p.curtain]]) setU(u, k, v);
    u.uFadeR.value = 1 / Math.sqrt(1 + R / 150) * (1 - Math.min(1, Math.max(0, (R - p.maxRadius * 0.75) / (p.maxRadius * 0.25))));
    u.uH.value = 0.55 * Math.min(p.curtainHeight, 4 + R * 0.35);   // the light wall grows with the ring (lower 55% drawn)
    // only the side of the wall facing the camera: outside → near face, inside → the wall around us
    const cam = p.camera && p.camera.position;
    const inside = cam ? Math.hypot(cam.x - p.center[0], cam.z - p.center[2]) < R : false;
    this.curtain.material.side = cam ? (inside ? THREE.BackSide : THREE.FrontSide) : THREE.DoubleSide;
    const s = Math.min(R * (1 + p.wobble) + p.width * 9, p.maxRadius * 1.05);
    this.disc.position.set(p.center[0], p.center[1] + 0.05, p.center[2]); this.disc.scale.set(s, 1, s);
    this.curtain.visible = R > 0.5 && p.curtain > 0;
    this.object.visible = p.visible !== false && R > 0 && p.intensity > 0;
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  LightVine — a vine of light growing up a wall: meandering stem, branches that end in curling tendrils,
//  twigs, unfurling leaves, tiny blossoms, sparkles at the growing tips. growth 0..1.
//  Built in the local XY plane (x right, y up, metres; faces +Z) — place `vine.object` against the wall.
// ------------------------------------------------------------------------------------------------------------
function growVine(o) {
  const r = rng(o.seed ?? 12);
  const H = o.height, Wd = o.width;
  const curves = [], leaves = [], blossoms = [];
  // main stem
  const N = 150, ph1 = r() * TAU, ph2 = r() * TAU;
  const stem = [];
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    stem.push([Wd * (0.16 * Math.sin(s * 4.6 + ph1) + 0.06 * Math.sin(s * 12.5 + ph2)) * (0.4 + 0.6 * s), H * s]);
  }
  const arc = (pts, b0, speed) => { const b = [b0]; for (let i = 1; i < pts.length; i++) b.push(b[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / speed); return b; };
  const stemB = arc(stem, 0, 1);
  curves.push({ pts: stem, birth: stemB, w0: o.stemWidth, w1: o.stemWidth * 0.35, kind: 0 });
  // a branch: heads out sideways, bends upward, ends in a spiral tendril
  const branch = (x, y, ang, len, side, b0, depth) => {
    const pts = [[x, y]], n = Math.max(12, Math.round(len / 0.03));
    let a = ang, px = x, py = y;
    const curlAt = 0.6 + 0.12 * r(), curlK = (10 + 8 * r()) / len;
    for (let i = 1; i <= n; i++) {
      const u = i / n, ds = len / n;
      const k = u < curlAt ? -side * (0.9 / len) * (1 + 0.3 * Math.sin(u * 9 + ang)) : -side * curlK * ((u - curlAt) / (1 - curlAt)) * 1.6;
      a += k * ds;
      px += Math.sin(a) * ds; py += Math.cos(a) * ds;
      pts.push([px, py]);
    }
    const b = arc(pts, b0, 0.75);
    curves.push({ pts, birth: b, w0: o.stemWidth * (depth ? 0.32 : 0.55), w1: o.stemWidth * 0.12, kind: depth ? 2 : 1 });
    // leaves along the straight part, alternating
    const leafEvery = Math.max(2, Math.round(0.2 / (len / n)));
    for (let i = leafEvery; i < Math.floor(n * curlAt); i += leafEvery) {
      const [qx, qy] = pts[i], [rx, ry] = pts[i + 1];
      const tg = Math.atan2(rx - qx, ry - qy);
      const sd = (i / leafEvery) % 2 ? 1 : -1;
      leaves.push({ x: qx, y: qy, ang: tg + sd * (0.75 + 0.3 * r()), size: o.leafSize * (0.6 + 0.5 * r()) * (depth ? 0.7 : 1), birth: b[i] + 0.06, seed: r() });
    }
    return { pts, b, curlAt, n };
  };
  // branches along the stem
  const nb = o.branches;
  for (let i = 0; i < nb; i++) {
    const s = 0.1 + 0.82 * (i + 0.2 + 0.6 * r()) / nb;
    const idx = Math.min(N - 2, Math.round(s * (N - 1)));
    const side = i % 2 ? 1 : -1;
    const [x, y] = stem[idx];
    const len = H * (0.17 + 0.14 * r()) * (1 - 0.35 * s);
    const br = branch(x, y, side * (0.85 + 0.45 * r()), len, side, stemB[idx] + 0.05, 0);
    // a twig or two from the branch, the other way, ending in a blossom
    const twigs = r() < 0.75 ? (r() < 0.4 ? 2 : 1) : 0;
    for (let k = 0; k < twigs; k++) {
      const j = Math.round(br.n * (0.25 + 0.3 * r()));
      const [tx, ty] = br.pts[j], [ux, uy] = br.pts[j + 1];
      const tg = Math.atan2(ux - tx, uy - ty);
      const tw = branch(tx, ty, tg - side * (0.7 + 0.4 * r()), len * (0.28 + 0.15 * r()), -side, br.b[j] + 0.02, 1);
      const tip = Math.max(1, Math.floor(tw.n * tw.curlAt));
      blossoms.push({ x: tw.pts[tip][0], y: tw.pts[tip][1], size: o.blossomSize * (0.75 + 0.5 * r()), birth: tw.b[tip] + 0.15, seed: r() });
    }
    if (r() < 0.45) { const tip = Math.floor(br.n * br.curlAt); blossoms.push({ x: br.pts[tip][0], y: br.pts[tip][1], size: o.blossomSize * (0.8 + 0.5 * r()), birth: br.b[tip] + 0.25, seed: r() }); }
  }
  // stem leaves
  for (let i = 6; i < N - 3; i += 5) {
    const [qx, qy] = stem[i], [rx, ry] = stem[i + 1];
    const tg = Math.atan2(rx - qx, ry - qy);
    const sd = (i / 5) % 2 ? 1 : -1;
    leaves.push({ x: qx, y: qy, ang: tg + sd * (0.7 + 0.3 * r()), size: o.leafSize * (0.8 + 0.5 * r()), birth: stemB[i] + 0.08, seed: r() });
  }
  blossoms.push({ x: stem[N - 1][0], y: stem[N - 1][1], size: o.blossomSize * 1.3, birth: stemB[N - 1] + 0.2, seed: r() });
  let maxB = 0;
  for (const c of curves) maxB = Math.max(maxB, c.birth[c.birth.length - 1]);
  for (const l of leaves) maxB = Math.max(maxB, l.birth + 0.3);
  for (const b of blossoms) maxB = Math.max(maxB, b.birth + 0.4);
  return { curves, leaves, blossoms, maxB };
}

const VINE_VERT = /* glsl */`
attribute vec3 aPrev, aNext; attribute float aSide, aU, aBirth, aW;
uniform float uPx, uMinPx, uGlowPx, uGrowT, uTipLen, uIntensity;
varying float vSide, vHalf, vCoreS, vI, vBirth;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  float depth = max(-mv.z, 0.01);
  float age = uGrowT - aBirth;
  float taper = smoothstep(0., uTipLen, age);
  float wpx = aW * pxPerUnit(depth, uRes.y) * mix(0.25, 1., taper);
  float corePx = max(wpx, uMinPx * uPx);
  float hw = corePx * 0.5 + uGlowPx * uPx;
  gl_Position = ribbonClip(position, aPrev, aNext, aSide, hw);
  vSide = aSide; vHalf = hw; vCoreS = corePx * 0.42; vBirth = aBirth;
  vI = uIntensity * (0.85 + 2.6 * exp(-max(age, 0.) / max(uTipLen * 0.6, 1e-3))) * sat(wpx / (uMinPx * uPx) * 0.6 + 0.5);
}`;
const VINE_FRAG = /* glsl */`
uniform float uKeep, uPx, uGlowPx, uGrowT; uniform vec3 uColor, uHot;
varying float vSide, vHalf, vCoreS, vI, vBirth;
void main(){
  if (vBirth > uGrowT) discard;
  float d = abs(vSide) * vHalf;
  float core = exp(-d * d / (2. * vCoreS * vCoreS));
  float glow = exp(-d / max(uGlowPx * uPx * 0.4, 0.5)) * 0.3;
  vec3 c = (uHot * core * 0.55 + uColor * (core * 0.7 + glow)) * vI;
  gl_FragColor = vec4(c, uKeep * sat((core + glow) * vI));
}`;
const LEAF_VERT = /* glsl */`
attribute vec2 aCorner; attribute vec4 aLeaf; attribute vec2 aInfo; // aLeaf: x, y, angle, size; aInfo: birth, seed
uniform float uGrowT, uIntensity, uKind, uTime; uniform vec2 uRes;
varying vec2 vUv; varying float vI, vOpen, vSeed;
void main(){
  float age = uGrowT - aInfo.x;
  float g = sat(age / (uKind > 0.5 ? 0.55 : 0.32));
  float s = g < 1. ? 1. + 2.70158 * pow(g - 1., 3.) + 1.70158 * pow(g - 1., 2.) : 1.;   // outBack unfurl
  vOpen = g; vSeed = aInfo.y; vUv = aCorner;
  float a = aLeaf.z + (uKind > 0.5 ? aInfo.y * TAU + uTime * 0.15 : 0.);
  vec2 local = uKind > 0.5 ? aCorner * aLeaf.w * 0.5 * s : vec2(aCorner.x * 0.42, aCorner.y) * aLeaf.w * s;
  vec2 rot = vec2(local.x * cos(a) + local.y * sin(a), -local.x * sin(a) + local.y * cos(a));
  vec3 p = vec3(aLeaf.xy + rot, 0.002 * aInfo.y + 0.003 * uKind);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  vI = uIntensity * step(0., age) * (0.75 + 0.25 * sin(uTime * 1.7 + aInfo.y * 40.));
  if (age < 0.) gl_Position = vec4(0., 0., 2., 1.);
}`;
const LEAF_FRAG = /* glsl */`
uniform float uKeep, uKind; uniform vec3 uColor, uColor2, uHot;
varying vec2 vUv; varying float vI, vOpen, vSeed;
void main(){
  float a;
  vec3 c;
  if (uKind < 0.5) {
    // leaf: pointed ellipse, bright rim + midrib
    float y = vUv.y, x = vUv.x;
    float w = pow(sin(PI * sat(y)), 0.8) * (1. - 0.25 * y);
    float e = abs(x) / max(w, 1e-3);
    float inside = 1. - smoothstep(0.8, 1., e);
    float rim = smoothstep(0.55, 0.95, e);
    float rib = exp(-x * x * 300.) * (1. - y) * 0.8;
    a = inside * (0.22 + 0.9 * rim + rib) * smoothstep(0., 0.05, y);
    c = mix(uColor, uHot, rib * 0.5);
  } else {
    // blossom: five petals opening, white-gold heart
    vec2 p = vUv; float r = length(p); float th = atan(p.y, p.x);
    float petal = 0.42 + 0.58 * pow(abs(cos(2.5 * th)), 0.7);
    float open = smoothstep(0., 1., vOpen);
    float edge = r / max(petal * open, 1e-3);
    float inside = 1. - smoothstep(0.82, 1., edge);
    float rim = smoothstep(0.5, 0.95, edge);
    float heart = exp(-r * r * 90.) * 2.5;
    a = inside * (0.35 + 0.8 * rim) + heart * open;
    c = mix(uColor2, uHot, sat(heart * 0.4));
  }
  if (a < 0.002) discard;
  gl_FragColor = vec4(c * vI * a, uKeep * sat(vI * a));
}`;
const VINE_SPARK_VERT = /* glsl */`
attribute vec4 aSp; // x, y, birth, seed
uniform float uGrowT, uTime, uPx, uIntensity, uSparkLen; uniform vec3 uHot, uColor;
varying vec3 vCol; varying float vI, vStar;
void main(){
  float age = uGrowT - aSp.z;
  float k = age / uSparkLen;
  float on = step(0., age) * step(age, uSparkLen);
  vec3 p = vec3(aSp.x + (hash11(aSp.w * 91.) - 0.5) * 0.5 * k, aSp.y + 0.6 * k + 0.05 * sin(uTime * 3. + aSp.w * 20.), 0.02 + 0.2 * hash11(aSp.w * 13.) * k);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  gl_PointSize = (2. + 3. * hash11(aSp.w * 7.)) * uPx;
  float tw = 0.5 + 0.5 * sin(uTime * (8. + 9. * aSp.w) + aSp.w * 50.);
  vI = uIntensity * on * (1. - k) * tw * 1.4; vStar = 0.; vCol = mix(uColor, uHot, 0.5);
  if (vI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;

export class LightVine {
  /**
   * opts: height(6 m), width(2.6 m spread), seed, branches(9), stemWidth(0.035 m), leafSize(0.2 m), blossomSize(0.12 m),
   *   minPx(1.2), glowPx(6), tipLen(0.35 m of bright growing tip), color [2.3,1.35,0.5] (gold), hot [3,2.6,2],
   *   leafColor [1.35,1.4,0.5], blossomColor (Juliet rose), intensity(1), keep(true), sparkles(260)
   * update(t, { growth: 0..1, intensity, ... })
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { height: 6, width: 2.6, branches: 9, stemWidth: 0.035, leafSize: 0.2, blossomSize: 0.12, minPx: 1.2, glowPx: 6, tipLen: 0.35,
      color: [2.3, 1.35, 0.5], hot: [3.0, 2.6, 2.0], leafColor: [1.35, 1.4, 0.5], blossomColor: [2.4, 1.2, 1.45], intensity: 1, keep: true, growth: 1, ...opts };
    const d = this.defaults;
    const V = this.vine = growVine(d);
    this.u = { ...common(e), uMinPx: { value: 1 }, uGlowPx: { value: 6 }, uGrowT: { value: 0 }, uTipLen: { value: 0.3 }, uIntensity: { value: 1 },
      uColor: { value: new THREE.Vector3() }, uHot: { value: new THREE.Vector3() }, uColor2: { value: new THREE.Vector3() }, uKeep: { value: 1 },
      uKind: { value: 0 }, uSparkLen: { value: 0.6 } };
    const blend = 'keep';
    const lines = V.curves.map((c) => ({ pts: c.pts.map(([x, y]) => [x, y, 0]),
      attrs: { aBirth: c.birth, aW: c.pts.map((_, i) => c.w0 + (c.w1 - c.w0) * (i / (c.pts.length - 1))) } }));
    this.stems = fin(new THREE.Mesh(ribbonGeometry(lines, { aBirth: 1, aW: 1 }), vmat(VINE_VERT, VINE_FRAG, this.u, blend)), opts.renderOrder ?? 128);
    // leaves & blossoms (separate uniform views for colour/kind)
    const mkFlat = (list, kind) => {
      const n = list.length;
      const L = new Float32Array(n * 4), I = new Float32Array(n * 2);
      list.forEach((l, i) => { L.set([l.x, l.y, l.ang ?? 0, l.size], i * 4); I.set([l.birth, l.seed], i * 2); });
      const corners = kind ? [-1, -1, 1, -1, -1, 1, 1, 1] : [-1, 0, 1, 0, -1, 1, 1, 1];
      const uu = { ...this.u, uKind: { value: kind }, uColor: kind ? this.u.uColor2 : { value: new THREE.Vector3() } };
      const m = fin(new THREE.Mesh(quadGeometry(n, { aLeaf: [L, 4], aInfo: [I, 2] }, corners), new THREE.ShaderMaterial({
        vertexShader: GLSL_COMMON + GLSL_VERT + LEAF_VERT, fragmentShader: GLSL_COMMON + LEAF_FRAG, uniforms: uu, depthTest: true, side: THREE.DoubleSide, ...blending(blend) })),
        (opts.renderOrder ?? 128) + 1 + kind);
      return { m, uu };
    };
    const lf = mkFlat(V.leaves, 0); this.leaves = lf.m; this.leafU = lf.uu;
    const bl = mkFlat(V.blossoms, 1); this.blossoms = bl.m;
    // sparkles at the growing tips
    const ns = opts.sparkles ?? 260, r = rng((d.seed ?? 12) + 99);
    const all = [];
    for (const c of V.curves) for (let i = 0; i < c.pts.length; i++) all.push([c.pts[i][0], c.pts[i][1], c.birth[i]]);
    const SP = new Float32Array(ns * 4);
    for (let i = 0; i < ns; i++) { const q = all[Math.floor(r() * all.length)]; SP.set([q[0], q[1], q[2], r()], i * 4); }
    this.sparks = fin(new THREE.Points(pointsGeometry(ns, { aSp: [SP, 4] }), new THREE.ShaderMaterial({
      vertexShader: GLSL_COMMON + VINE_SPARK_VERT, fragmentShader: GLSL_COMMON + GLOW_SPRITE_FRAG, uniforms: this.u, depthTest: true, ...blending(blend) })), (opts.renderOrder ?? 128) + 3);
    this.object = new THREE.Group();
    this.object.add(this.stems, this.leaves, this.blossoms, this.sparks);
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    tick(this, t);
    u.uGrowT.value = Math.max(0, Math.min(1, p.growth)) * (this.vine.maxB + 0.05) - (p.growth <= 0 ? 1 : 0);
    for (const [k, v] of [['uMinPx', p.minPx], ['uGlowPx', p.glowPx], ['uTipLen', p.tipLen], ['uIntensity', p.intensity], ['uColor', p.color],
      ['uHot', p.hot], ['uColor2', p.blossomColor], ['uKeep', p.keep ? 1 : 0]]) setU(u, k, v);
    this.leafU.uColor.value.fromArray(p.leafColor);
    this.object.visible = p.visible !== false && p.growth > 0 && p.intensity > 0;
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  Lightning — branching bolts with a stepped leader, return strokes and flicker; flash(t) feeds the grade/sky
// ------------------------------------------------------------------------------------------------------------
const MAXS = 12;
// envelope of one strike (seconds since it started): stepped leader (dim) then flickering return strokes
function strikeEnv(tau, k = 1) {
  if (tau < 0) return 0;
  const st = (t0, a, d) => (tau >= t0 ? a * Math.exp(-(tau - t0) / d) : 0);
  return Math.min(1.25, st(0.07, 1, 0.045) + st(0.15 + 0.02 * k, 0.75, 0.04) + st(0.24 + 0.03 * k, 0.55, 0.06) + st(0.38 + 0.04 * k, 0.32, 0.1));
}
const BOLT_GLSL = /* glsl */`
uniform vec4 uStrikes[${MAXS}]; // t0, strength, k, unused
float strikeEnv(float tau, float k){
  if (tau < 0.) return 0.;
  float e = 0.;
  e += step(0.07, tau) * exp(-(tau - 0.07) / 0.045);
  e += step(0.15 + 0.02 * k, tau) * 0.75 * exp(-(tau - 0.15 - 0.02 * k) / 0.04);
  e += step(0.24 + 0.03 * k, tau) * 0.55 * exp(-(tau - 0.24 - 0.03 * k) / 0.06);
  e += step(0.38 + 0.04 * k, tau) * 0.32 * exp(-(tau - 0.38 - 0.04 * k) / 0.1);
  return min(e, 1.25);
}
vec4 strikeOf(float idx){ vec4 s = vec4(-1e4, 0., 0., 0.); for (int i = 0; i < ${MAXS}; i++) if (float(i) == idx) s = uStrikes[i]; return s; }
`;
const BOLT_VERT = /* glsl */`
attribute vec3 aPrev, aNext; attribute float aSide, aU, aStrike, aProg, aLevel;
uniform float uTime, uPx, uWidth, uMinPx, uGlowPx, uIntensity;
varying float vSide, vHalf, vCoreS, vI, vLevel;
void main(){
  vec4 s = strikeOf(aStrike);
  float tau = uTime - s.x;
  float lead = sat(tau / 0.07);
  float stepped = floor(lead * 14.) / 14.;
  float env = strikeEnv(tau, s.z);
  float levelK = aLevel < 0.5 ? 1. : (aLevel < 1.5 ? 0.55 : 0.3);
  // during the leader: only the part above the front glows, dimly; branches die faster after the first stroke
  float vis = tau < 0.07 ? step(aProg, stepped + 0.02) * 0.16 : env * (aLevel < 0.5 ? 1. : exp(-max(tau - 0.07, 0.) / (0.05 + 0.08 / (1. + aLevel))));
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  float depth = max(-mv.z, 0.01);
  float wpx = uWidth * levelK * pxPerUnit(depth, uRes.y);
  float corePx = max(wpx, uMinPx * uPx * mix(1., 0.6, aLevel * 0.5));
  float hw = corePx * 0.5 + uGlowPx * uPx * (0.6 + 0.4 * levelK);
  gl_Position = ribbonClip(position, aPrev, aNext, aSide, hw);
  vSide = aSide; vHalf = hw; vCoreS = corePx * 0.42; vLevel = aLevel;
  vI = uIntensity * s.y * vis * levelK * (tau >= 0. && tau < 1.2 ? 1. : 0.);
  if (vI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;
const BOLT_FRAG = /* glsl */`
uniform float uPx, uGlowPx; uniform vec3 uCore, uGlow;
varying float vSide, vHalf, vCoreS, vI, vLevel;
void main(){
  float d = abs(vSide) * vHalf;
  float core = exp(-d * d / (2. * vCoreS * vCoreS));
  float glow = exp(-d / max(uGlowPx * uPx * 0.35, 0.5)) * 0.35;
  gl_FragColor = vec4((uCore * core + uGlow * glow) * vI, 0.);
}`;
const CLOUD_VERT = /* glsl */`
attribute vec2 aCorner; attribute vec4 aC; // centre xyz, strike index
uniform float uTime, uCloudSize, uCloudGlow;
varying vec2 vUv; varying float vI;
void main(){
  vec4 s = strikeOf(aC.w);
  float tau = uTime - s.x;
  float env = strikeEnv(tau, s.z) + (tau > 0. && tau < 0.07 ? 0.15 : 0.);
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = aC.xyz + (cr * aCorner.x + cu * aCorner.y) * uCloudSize;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
  vUv = aCorner; vI = env * s.y * uCloudGlow;
  if (vI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;
const CLOUD_FRAG = /* glsl */`
uniform vec3 uGlow; varying vec2 vUv; varying float vI;
void main(){ float r2 = dot(vUv, vUv); float a = exp(-r2 * 4.5) * (1. - smoothstep(0.8, 1., r2)); gl_FragColor = vec4(uGlow * vI * a, 0.); }`;

function boltPolyline(a, b, r, rough, depth) {
  let pts = [a, b];
  let amp = rough;
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const dir = [(q[0] - p[0]) / L, (q[1] - p[1]) / L, (q[2] - p[2]) / L];
      let v = [r() - 0.5, r() - 0.5, r() - 0.5];
      const dt = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
      v = [v[0] - dt * dir[0], v[1] - dt * dir[1], v[2] - dt * dir[2]];
      const vl = Math.hypot(...v) || 1;
      const off = (r() - 0.5) * 2 * amp * L;
      out.push([(p[0] + q[0]) / 2 + v[0] / vl * off, (p[1] + q[1]) / 2 + v[1] / vl * off, (p[2] + q[2]) / 2 + v[2] / vl * off], q);
    }
    pts = out; amp *= 0.62;
  }
  return pts;
}

export class Lightning {
  /**
   * opts: strikes: [{ t, from:[x,y,z], to:[x,y,z], seed?, strength?(1), branches?(5) }] (max 12; geometry built once)
   *   width(0.9 m channel), minPx(1.4), glowPx(14), core [3.4,3.6,4.2], glow [0.55,0.65,1.0], intensity(1),
   *   cloudGlow(1.2) + cloudSize(0.45 × bolt length): the cloud lighting up around the bolt's origin
   *   sheets: [{ t, strength }] distant flashes without a visible bolt (only in flash())
   * flash(t) → 0..~1.2 sky/grade flash (sum of strike envelopes × strength + sheets)
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { width: 0.9, minPx: 1.4, glowPx: 14, core: [3.4, 3.6, 4.2], glow: [0.55, 0.65, 1.0], intensity: 1, cloudGlow: 1.2, sheets: [], ...opts };
    this.strikes = (opts.strikes || []).slice(0, MAXS).map((s, i) => ({ seed: 31 + i * 17, strength: 1, branches: 5, ...s }));
    const lines = [];
    let maxLen = 1;
    this.strikes.forEach((s, si) => {
      const r = rng(s.seed);
      const total = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]);
      maxLen = Math.max(maxLen, total);
      const main = boltPolyline(s.from, s.to, r, 0.22, 7);
      const prog = main.map((_, i) => i / (main.length - 1));
      lines.push({ pts: main, attrs: { aStrike: si, aProg: prog, aLevel: 0 } });
      for (let b = 0; b < s.branches; b++) {
        const i0 = Math.floor(main.length * (0.08 + 0.6 * r()));
        const p0 = main[i0], pg = prog[i0];
        const dir = [s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]].map((v) => v / total);
        const ang = (r() < 0.5 ? -1 : 1) * (0.35 + 0.6 * r());
        const len = total * (0.12 + 0.28 * r()) * (1 - pg * 0.6);
        // rotate the main direction around a random horizontal-ish axis
        const side = [dir[2], 0, -dir[0]]; const sl = Math.hypot(...side) || 1;
        const d2 = [dir[0] * Math.cos(ang) + side[0] / sl * Math.sin(ang) * 1.2, dir[1] * Math.cos(ang), dir[2] * Math.cos(ang) + side[2] / sl * Math.sin(ang) * 1.2 + (r() - 0.5) * 0.6];
        const p1 = [p0[0] + d2[0] * len, p0[1] + d2[1] * len, p0[2] + d2[2] * len];
        const bp = boltPolyline(p0, p1, r, 0.25, 5);
        lines.push({ pts: bp, attrs: { aStrike: si, aProg: bp.map((_, i) => pg + (i / (bp.length - 1)) * (len / total)), aLevel: 1 } });
        if (r() < 0.6) { // a twig
          const j = Math.floor(bp.length * (0.3 + 0.4 * r()));
          const q0 = bp[j], tl = len * (0.25 + 0.3 * r());
          const q1 = [q0[0] + (d2[0] + (r() - 0.5)) * tl, q0[1] + d2[1] * tl, q0[2] + (d2[2] + (r() - 0.5)) * tl];
          const tp = boltPolyline(q0, q1, r, 0.3, 4);
          const pg2 = pg + (j / (bp.length - 1)) * (len / total);
          lines.push({ pts: tp, attrs: { aStrike: si, aProg: tp.map((_, i) => pg2 + (i / (tp.length - 1)) * (tl / total)), aLevel: 2 } });
        }
      }
    });
    this.u = { ...common(e), uStrikes: { value: Array.from({ length: MAXS }, () => new THREE.Vector4(-1e4, 0, 0, 0)) },
      uWidth: { value: 1 }, uMinPx: { value: 1 }, uGlowPx: { value: 14 }, uIntensity: { value: 1 }, uCore: { value: new THREE.Vector3() }, uGlow: { value: new THREE.Vector3() },
      uCloudSize: { value: maxLen * 0.45 }, uCloudGlow: { value: 1 } };
    this.object = new THREE.Group();
    if (lines.length) {
      this.bolts = fin(new THREE.Mesh(ribbonGeometry(lines, { aStrike: 1, aProg: 1, aLevel: 1 }), new THREE.ShaderMaterial({
        vertexShader: GLSL_COMMON + GLSL_VERT + GLSL_RIBBON + BOLT_GLSL + BOLT_VERT, fragmentShader: GLSL_COMMON + BOLT_FRAG,
        uniforms: this.u, depthTest: true, side: THREE.DoubleSide, ...blending('add') })), opts.renderOrder ?? 112);
      const n = this.strikes.length, C = new Float32Array(n * 4);
      this.strikes.forEach((s, i) => C.set([s.from[0], s.from[1] + maxLen * 0.05, s.from[2], i], i * 4));
      this.clouds = fin(new THREE.Mesh(quadGeometry(n, { aC: [C, 4] }, [-1, -1, 1, -1, -1, 1, 1, 1]), new THREE.ShaderMaterial({
        vertexShader: GLSL_COMMON + BOLT_GLSL + CLOUD_VERT, fragmentShader: GLSL_COMMON + CLOUD_FRAG,
        uniforms: this.u, depthTest: true, side: THREE.DoubleSide, ...blending('add') })), (opts.renderOrder ?? 112) - 1);
      this.object.add(this.clouds, this.bolts);
    }
    this.update(0);
  }
  /** brighten a Sky (fx/sky.js) by a flash value — call after sky.apply(); stateless */
  static skyFlash(sky, f, tint = [0.24, 0.26, 0.32]) {
    if (!(f > 0)) return;
    const u = sky.uniforms;
    for (const [k, m] of [['uZenith', 1], ['uHorizon', 1.15], ['uCloudColor', 2.2]]) { const c = u[k].value; c.r += tint[0] * f * m; c.g += tint[1] * f * m; c.b += tint[2] * f * m; }
  }
  /** sky / grade flash value at film time t */
  flash(t, params) {
    const p = P(this.defaults, params);
    let f = 0;
    this.strikes.forEach((s, i) => { f += strikeEnv(t - (p.times?.[i] ?? s.t), i % 3) * s.strength; });
    for (const s of p.sheets) f += strikeEnv(t - s.t, 2) * (s.strength ?? 0.5) * 0.8;
    return Math.min(1.5, f);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    tick(this, t);
    this.strikes.forEach((s, i) => u.uStrikes.value[i].set(p.times?.[i] ?? s.t, s.strength, i % 3, 0));
    for (const [k, v] of [['uWidth', p.width], ['uMinPx', p.minPx], ['uGlowPx', p.glowPx], ['uIntensity', p.intensity], ['uCore', p.core], ['uGlow', p.glow],
      ['uCloudGlow', p.cloudGlow]]) setU(u, k, v);
    let any = false;
    this.strikes.forEach((s, i) => { const tau = t - (p.times?.[i] ?? s.t); if (tau > -0.01 && tau < 1.2) any = true; });
    this.object.visible = p.visible !== false && any && p.intensity > 0;
    return this;
  }
}
