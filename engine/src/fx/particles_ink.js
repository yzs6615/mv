import * as THREE from 'three';
import { GLSL_COMMON, blending, noiseTexture, setU, P, shared } from './particles_core.js';
import { paperTexture } from './art.js';

// ============================================================================================================
//  InkBleed — ink spreading through water or into paper, as a shader on a plane.
//  An organic front grows from point sources and/or the plane's edges (growth 0..1); a baked tileable fbm
//  texture provides domain warping, a ragged boundary and the tendrils (ridged filaments that run ahead of
//  the body). Two looks:
//    'water' — soft, cloudy, slowly curling plumes with wispy tendrils and a faint sheen on the front (3.1)
//    'paper' — capillary feathering, a darker drying rim (coffee-ring effect), fibrous edge (pages, 3.7–3.8)
//  The plane is built in local XY (faces +Z): rotate it flat for water (rotation.x = −π/2).
//  Premultiplied blending: darkens what is behind and erases the colour-keep mask by its density.
// ============================================================================================================

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const FRAG = /* glsl */`
uniform sampler2D uNoise, uFibre;
uniform vec4 uSrc[6]; uniform float uNSrc, uFibreScale;
uniform float uGrowth, uEdges, uMode, uTime, uScale, uSeed, uOpacity, uReach, uTendrils, uSheen, uFeather;
uniform vec2 uAspect; uniform vec3 uInk, uSheenCol;
varying vec2 vUv;
// every fetch returns four independent fbm fields (r,g,b,a) — 4–5 fetches per pixel in total
void main(){
  vec2 p = (vUv - 0.5) * uAspect;               // metric coords, longest side = 1
  vec2 q = vUv * uAspect * uScale + uSeed;
  bool water = uMode < 0.5;
  float drift = water ? uTime * 0.012 : 0.;
  vec4 f1 = texture2D(uNoise, q * 0.35 + vec2(drift, -drift * 0.7));
  vec2 w = f1.gb - 0.5;
  vec4 f2 = texture2D(uNoise, q * 0.9 + w * 0.8);
  vec2 w2 = f2.ra - 0.5;
  vec2 pw = p + (w * 0.3 + w2 * 0.12) * (water ? 1. : 0.32);
  // reach of the ink: max over sources (and the plane edges) of growth·reach·strength − distance
  float reach = -10.;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uNSrc) break;
    vec4 s = uSrc[i];
    vec2 c = (s.xy - 0.5) * uAspect;
    reach = max(reach, uGrowth * uReach * s.z - length((pw - c) / vec2(1., max(s.w, 0.05))));
  }
  if (uEdges > 0.) {
    vec2 h = 0.5 * uAspect;
    float de = min(h.x - abs(pw.x), h.y - abs(pw.y));
    reach = max(reach, uGrowth * uReach * 0.55 * uEdges - de);
  }
  float n1 = f1.r - 0.5;
  // far from any ink: nothing to draw (saves the remaining fetches on most of the plane)
  if (reach + n1 * 0.09 < -0.26) discard;
  float D;
  vec3 add = vec3(0.);
  if (water) {
    vec4 f3 = texture2D(uNoise, q * 1.9 + w * 2.2);
    float field = reach + n1 * 0.09 + (f3.a - 0.5) * 0.045;
    // WATER: soft cloudy body, curling filaments ahead of it, darker veins inside
    float body = smoothstep(-0.03 - uFeather, 0.05, field);
    float cloud = 0.62 + 0.38 * f2.g;
    float ridge = pow(1. - abs(f3.r * 2. - 1.), 7.);
    float ridge2 = pow(1. - abs(f3.b * 2. - 1.), 11.);
    float zone = smoothstep(-0.2, -0.01, field) * (1. - body);
    float tendr = (ridge * 0.9 + ridge2 * 0.6) * zone * uTendrils;
    float veins = pow(1. - abs(f3.g * 2. - 1.), 10.) * body * 0.25;
    D = sat(body * cloud + tendr + veins);
    float front = exp(-abs(field) / 0.03) * (1. - body * 0.5);
    add = uSheenCol * front * uSheen * 0.5;
  } else {
    // PAPER: the pool is dense, its drying edge darker (coffee-ring), the boundary fibrous; capillary fingers
    // creep a few millimetres ahead along the paper grain
    vec4 f3 = texture2D(uNoise, q * 4.3 + w2);
    vec4 f4 = texture2D(uNoise, q * vec2(9., 2.6) + w * 4.);
    float fib = texture2D(uFibre, vUv * uFibreScale).r - 0.5;
    float field = reach + (n1 * 0.09 + (f3.a - 0.5) * 0.045) * 0.45 + (f4.r - 0.5) * 0.012;
    float f = field + (f3.g - 0.5) * 0.025 + fib * 0.035;
    float body = smoothstep(-uFeather, uFeather, f);
    float rim = exp(-max(f, 0.) / 0.018) * body;
    float inner = smoothstep(0.0, 0.25, f);
    float fingers = pow(1. - abs(f4.b * 2. - 1.), 12.) * smoothstep(-0.035, -0.003, f) * (1. - body) * uTendrils;
    float tide = smoothstep(-0.022, 0., f) * (1. - body) * 0.16;   // faint grey tide-line just ahead of the edge
    D = sat(body * (0.9 - 0.16 * inner + 0.08 * f3.r) + rim * 0.22 + fingers * 0.55 + tide);
  }
  // never let the plane's border show: ink thins out over the last few percent of the plane
  vec2 eb = min(vUv, 1. - vUv);
  float border = smoothstep(0., 0.06, min(eb.x, eb.y));
  // point sources only: a soft round limit so a fully grown pool never takes the plane's square shape
  border *= uEdges > 0. ? 1. : 1. - smoothstep(0.78, 0.98, length((vUv - 0.5) * 2.));
  D *= uOpacity * border;
  if (D < 0.002 && dot(add, vec3(1.)) < 1e-4) discard;
  gl_FragColor = vec4(uInk * D + add, D);
}`;

export class InkBleed {
  /**
   * opts: width(10 m), height(10 m), mode 'water'|'paper', sources [[u,v,strength,squash], …] (uv of the plane; ≤6),
   *   edges(0: 1 = ink also creeps in from the plane's edges), reach(1.15: how far growth=1 spreads, plane units),
   *   ink [0.004,0.005,0.01] (water) / PALETTE inkPaper (paper), opacity(0.96), scale(2.2 noise scale), seed,
   *   tendrils(1), sheen(0.6: light on the water front), sheenColor [0.12,0.14,0.2], feather(0.02 water / 0.006 paper),
   *   fibreScale(6: paper-grain repeats across the plane, paper mode)
   * update(t, { growth: 0..1, … })   — growth is the only thing that must change over a shot
   */
  constructor(e, opts = {}) {
    this.e = e;
    const paper = opts.mode === 'paper';
    this.defaults = { width: 10, height: 10, mode: 'water', sources: [[0.5, 0.5, 1, 1]], edges: 0, reach: 1.15, ink: paper ? [0.02, 0.017, 0.015] : [0.004, 0.005, 0.01],
      opacity: 0.96, scale: 2.2, seed: 0, tendrils: 1, sheen: 0.6, sheenColor: [0.12, 0.14, 0.2], feather: paper ? 0.006 : 0.02, growth: 0.5, ...opts };
    const d = this.defaults;
    const tex = shared(e, 'fx.noise256', () => noiseTexture(256, 5));
    const L = Math.max(d.width, d.height);
    this.u = { uNoise: { value: tex }, uFibre: { value: shared(e, 'paperTex', () => paperTexture()) }, uFibreScale: { value: (opts.fibreScale ?? 6) },
      uSrc: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uNSrc: { value: 0 },
      uGrowth: { value: 0 }, uEdges: { value: 0 }, uMode: { value: paper ? 1 : 0 }, uTime: { value: 0 }, uScale: { value: 2 }, uSeed: { value: 0 },
      uOpacity: { value: 1 }, uReach: { value: 1 }, uTendrils: { value: 1 }, uSheen: { value: 0 }, uFeather: { value: 0.02 },
      uAspect: { value: new THREE.Vector2(d.width / L, d.height / L) }, uInk: { value: new THREE.Vector3() }, uSheenCol: { value: new THREE.Vector3() } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: GLSL_COMMON + FRAG, uniforms: this.u, depthTest: true, side: THREE.DoubleSide, ...blending('ink') });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(d.width, d.height), this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = opts.renderOrder ?? 0;
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    u.uTime.value = t;
    const src = p.sources || [];
    u.uNSrc.value = Math.min(6, src.length);
    for (let i = 0; i < 6; i++) { const s = src[i] || [0, 0, 0, 1]; u.uSrc.value[i].set(s[0], s[1], s[2] ?? 1, s[3] ?? 1); }
    u.uMode.value = p.mode === 'paper' ? 1 : 0;
    for (const [k, v] of [['uGrowth', p.growth], ['uEdges', p.edges], ['uScale', p.scale], ['uSeed', p.seed], ['uOpacity', p.opacity], ['uReach', p.reach],
      ['uTendrils', p.tendrils], ['uSheen', p.sheen], ['uFeather', p.feather], ['uInk', p.ink], ['uSheenCol', p.sheenColor]]) setU(u, k, v);
    this.object.visible = p.visible !== false && p.growth > 0;
    return this;
  }
}
