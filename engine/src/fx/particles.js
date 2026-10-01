import * as THREE from 'three';
import { rng } from '../core/math.js';
import { GLSL_COMMON, GLSL_VERT, PALETTE, blending, pointsGeometry, quadGeometry, randoms, setU, P } from './particles_core.js';

// ============================================================================================================
//  Deterministic, analytic GPU particle systems. Every class exposes `.object` (add it to a scene) and
//  `update(t, params)` (call every frame; params not passed revert to the constructor defaults, so shots that
//  share a set never inherit each other's settings). Positions are closed-form functions of (seed, t) in the
//  vertex shader — any frame can be rendered in any order.
//
//  Common options (where relevant)
//    count            particles (fixed at construction)
//    box: { center:[x,y,z], size:[x,y,z] }   emission volume (world, metres)
//    follow           true → the box rides with the camera (center becomes an offset from camera + ahead·forward)
//    ahead            metres in front of the camera for a following box
//    size, minPx      world size (m) of a particle and the minimum on-screen size (px @1080p; smaller = dimmer)
//    color, intensity linear HDR colour and gain
//    focus, aperture  depth-of-field bokeh: CoC(px@1080) = aperture·|1 − focus/depth| (aperture 0 = off)
//    keep             write the colour-keep mask (only for the lovers' light)
//
//  Light (motes, fireflies, petals, lanterns, snow) is additive; ink (rain) is premultiplied (darkens, erases
//  the keep mask); InkToLight switches from ink to light per particle inside one premultiplied material.
//  Systems: LightMotes · Fireflies · Snow · Petals · Lanterns · InkRain · InkToLight
//  (Trail, RingOfLight, Shockwave, LightVine, Lightning → particles_light.js; InkBleed → particles_ink.js)
// ============================================================================================================

export { PALETTE };

const BOX_GLSL = /* glsl */`
uniform vec3 uBoxC, uBoxS; uniform float uFollow, uAhead;
vec3 boxCenter(){ return uFollow > 0.5 ? cameraPosition + camForward() * uAhead + uBoxC : uBoxC; }
vec3 wrapBox(vec3 p, vec3 c, vec3 s){ vec3 o = c - 0.5 * s; return o + mod(p - o, s); }
float boxFade(vec3 p, vec3 c, vec3 s, vec3 edge){ vec3 d = (0.5 * s - abs(p - c)) / edge; return sat(min(d.x, min(d.y, d.z))); }
`;

const DOF_GLSL = /* glsl */`
uniform float uFocus, uAperture, uMaxCoc, uBokehK;
// -> (size px, intensity factor, bokeh amount 0..1)
vec3 dofSize(float basePx, float depth, float px){
  float coc = min(uAperture * px * abs(1. - uFocus / max(depth, 0.05)), uMaxCoc * px);
  float sz = sqrt(basePx * basePx + coc * coc);
  return vec3(sz, pow(basePx / sz, uBokehK), sat(coc / sz));
}
`;

// shared sprite fragment: gaussian core (+ optional halo) that becomes a flat, rim-lit bokeh disc when defocused
const SPRITE_FRAG = /* glsl */`
uniform float uKeep, uSoft;
varying vec3 vCol; varying float vI, vBokeh, vHalo, vCoreF;
void main(){
  vec2 p = gl_PointCoord - .5; float r = length(p) * 2.;
  if (r > 1.) discard;
  // vCoreF = core radius as a fraction of the sprite radius (the rest of the sprite is halo)
  float rc = r / max(vCoreF, 1e-3);
  float core = exp(-rc * rc * 2.2) + vHalo * exp(-rc * 0.9) * (1. - r) * (1. - r) * 0.5;
  float disc = mix((1. - smoothstep(0.8, 1., r)) * (0.78 + 0.35 * smoothstep(0.5, 0.95, r)), exp(-r * r * 3.5) * (1. - r * r), uSoft);
  float a = mix(core, disc, vBokeh);
  gl_FragColor = vec4(vCol * vI * a, uKeep * sat(vI * a));
}`;

function baseUniforms(e, o) {
  return {
    uTime: { value: 0 }, uPx: { value: e.px }, uRes: { value: new THREE.Vector2(e.W, e.H) },
    uBoxC: { value: new THREE.Vector3(...(o.box?.center || [0, 0, 0])) }, uBoxS: { value: new THREE.Vector3(...(o.box?.size || [20, 10, 20])) },
    uFollow: { value: o.follow ? 1 : 0 }, uAhead: { value: o.ahead ?? 0 },
    uFocus: { value: o.focus ?? 10 }, uAperture: { value: o.aperture ?? 0 }, uMaxCoc: { value: o.maxCoc ?? 70 }, uBokehK: { value: o.bokehK ?? 1.25 },
    uKeep: { value: o.keep ? 1 : 0 }, uSoft: { value: o.soft ?? 0 },
  };
}

/** apply the common params (box/follow/dof/time) */
function applyCommon(self, t, p) {
  const u = self.u;
  u.uTime.value = t; u.uPx.value = self.e.px; u.uRes.value.set(self.e.W, self.e.H);
  if (p.box) { if (p.box.center) u.uBoxC.value.fromArray(p.box.center); if (p.box.size) u.uBoxS.value.fromArray(p.box.size); }
  setU(u, 'uFollow', p.follow ? 1 : 0); setU(u, 'uAhead', p.ahead ?? 0);
  setU(u, 'uFocus', p.focus); setU(u, 'uAperture', p.aperture); setU(u, 'uMaxCoc', p.maxCoc); setU(u, 'uBokehK', p.bokehK);
  setU(u, 'uKeep', p.keep ? 1 : 0); setU(u, 'uSoft', p.soft ?? 0);
  self.object.visible = p.visible !== false && (p.intensity ?? 1) > 0;
}

function material(vert, frag, uniforms, blend, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: GLSL_COMMON + GLSL_VERT + BOX_GLSL + DOF_GLSL + vert, fragmentShader: GLSL_COMMON + frag,
    uniforms, depthTest: true, side: THREE.DoubleSide, fog: false, ...blending(blend), ...extra,
  });
}

function finish(obj, order = 120) { obj.frustumCulled = false; obj.renderOrder = order; return obj; }

// ------------------------------------------------------------------------------------------------------------
//  LightMotes — gold dust drifting upward (ballroom air, candle-lit desk, the lovers' aura)
// ------------------------------------------------------------------------------------------------------------
const MOTES_VERT = /* glsl */`
attribute vec4 aSeed, aSeed2;
uniform float uTime, uPx, uRise, uWander, uWanderSpeed, uSize, uMinPx, uIntensity, uGlint, uTwinkle, uFadeEdge, uFar;
uniform vec3 uColor, uColor2; uniform vec2 uRes;
varying vec3 vCol; varying float vI, vBokeh, vHalo, vCoreF;
void main(){
  vec3 c = boxCenter(), S = uBoxS;
  vec3 p = aSeed.xyz * S;
  p.y += uRise * (0.45 + 0.55 * aSeed2.x) * uTime;
  p += wander3(aSeed2, uTime * uWanderSpeed) * uWander * (0.5 + aSeed.w);
  p = wrapBox(p, c, S);
  float fade = boxFade(p, c, S, max(S * uFadeEdge, vec3(1e-3)));
  vec4 mv = viewMatrix * vec4(p, 1.);
  float depth = -mv.z;
  gl_Position = projectionMatrix * mv;
  float ppu = pxPerUnit(depth, uRes.y);
  float wpx = uSize * (0.45 + 1.1 * aSeed2.w * aSeed2.w) * ppu;
  float basePx = max(wpx, uMinPx * uPx);
  float cover = sat(wpx / (uMinPx * uPx));
  vec3 d = dofSize(basePx, depth, uPx);
  gl_PointSize = d.x;
  vBokeh = d.z; vHalo = 0.; vCoreF = 0.5;
  float tw = 1. - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (1.3 + 3.1 * aSeed2.y) + aSeed2.z * TAU));
  float glint = uGlint * pow(max(0., sin(uTime * (0.35 + 0.9 * aSeed2.z) + aSeed.w * TAU)), 40.);
  vI = uIntensity * (0.35 + 0.65 * aSeed2.y) * (tw + glint) * fade * d.y * pow(cover, 1.5) * exp(-depth / uFar);
  vCol = mix(uColor, uColor2, aSeed2.z);
  if (vI < 1e-4 || depth < 0.05) gl_Position = vec4(0., 0., 2., 1.);
}`;

export class LightMotes {
  /** opts: count(1500), box, follow, ahead, rise(0.12 m/s), wander(0.35 m), wanderSpeed(1), size(0.012 m), minPx(1.2),
   *  color (gold), color2 (pale champagne), intensity(1), glint(4: brief sparkles), twinkle(0.4), far(80 m), focus/aperture */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { rise: 0.12, wander: 0.35, wanderSpeed: 1, size: 0.012, minPx: 1.2, color: [2.2, 1.35, 0.55], color2: [2.0, 1.75, 1.2],
      intensity: 1, glint: 4, twinkle: 0.4, far: 80, fadeEdge: 0.12, ...opts };
    const n = opts.count ?? 1500;
    this.u = { ...baseUniforms(e, this.defaults), uRise: { value: 0 }, uWander: { value: 0 }, uWanderSpeed: { value: 1 }, uSize: { value: 0 }, uMinPx: { value: 1 },
      uIntensity: { value: 1 }, uGlint: { value: 0 }, uTwinkle: { value: 0 }, uFadeEdge: { value: 0.1 }, uFar: { value: 80 },
      uColor: { value: new THREE.Vector3() }, uColor2: { value: new THREE.Vector3() } };
    const geo = pointsGeometry(n, { aSeed: [randoms(n, 4, opts.seed ?? 101), 4], aSeed2: [randoms(n, 4, (opts.seed ?? 101) + 1), 4] });
    this.object = finish(new THREE.Points(geo, material(MOTES_VERT, SPRITE_FRAG, this.u, 'keep')), opts.renderOrder ?? 120);
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    applyCommon(this, t, p);
    for (const [k, v] of [['uRise', p.rise], ['uWander', p.wander], ['uWanderSpeed', p.wanderSpeed], ['uSize', p.size], ['uMinPx', p.minPx],
      ['uIntensity', p.intensity], ['uGlint', p.glint], ['uTwinkle', p.twinkle], ['uFadeEdge', p.fadeEdge], ['uFar', p.far], ['uColor', p.color], ['uColor2', p.color2]]) setU(u, k, v);
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  Fireflies — wandering, rising, blinking (Act II garden / balcony)
// ------------------------------------------------------------------------------------------------------------
const FIRE_VERT = /* glsl */`
attribute vec4 aSeed, aSeed2;
uniform float uTime, uPx, uRise, uWander, uSpeed, uSize, uMinPx, uIntensity, uPeriod, uFlash, uBase, uHalo, uFar, uFadeEdge;
uniform vec3 uColor, uColor2; uniform vec2 uRes;
varying vec3 vCol; varying float vI, vBokeh, vHalo, vCoreF;
void main(){
  vec3 c = boxCenter(), S = uBoxS;
  float t = uTime * uSpeed;
  vec3 p = aSeed.xyz * S;
  p.y += uRise * (0.4 + 0.6 * aSeed2.x) * uTime;
  // lazy looping flight: two incommensurate orbits + a slow drift
  vec3 w = wander3(aSeed2, t * 0.55) * uWander + wander3(aSeed.wzyx, t * 1.7) * uWander * 0.18;
  p += w;
  p = wrapBox(p, c, S);
  float fade = boxFade(p, c, S, max(S * uFadeEdge, vec3(1e-3)));
  vec4 mv = viewMatrix * vec4(p, 1.);
  float depth = -mv.z;
  gl_Position = projectionMatrix * mv;
  // blink: quick swell, slower decay, once per period (each insect its own rhythm)
  float per = uPeriod * (0.65 + 0.7 * aSeed2.y);
  float ph = fract(uTime / per + aSeed2.z);
  float fl = uFlash / per;
  float blink = ph < fl ? pow(sin(PI * ph / fl), 2.) : 0.;
  float glow = uBase + (1. - uBase) * blink;
  float ppu = pxPerUnit(depth, uRes.y);
  float wpx = uSize * (0.7 + 0.6 * aSeed2.w) * ppu;
  float corePx = max(wpx, uMinPx * uPx);
  float basePx = corePx * (1. + uHalo * 7.);
  float cover = sat(wpx / (uMinPx * uPx));
  vec3 d = dofSize(basePx, depth, uPx);
  gl_PointSize = d.x;
  vBokeh = d.z; vHalo = uHalo; vCoreF = corePx / basePx;
  vI = uIntensity * glow * fade * d.y * pow(cover, 1.2) * exp(-depth / uFar);
  vCol = mix(uColor, uColor2, aSeed.w);
  if (vI < 1e-4 || depth < 0.05) gl_Position = vec4(0., 0., 2., 1.);
}`;

export class Fireflies {
  /** opts: count(160), box, follow, rise(0.04), wander(0.9 m), speed(1), size(0.025 m), minPx(1.8), period(3.2 s), flash(0.9 s),
   *  base(0.1 glow between flashes), halo(0.9: soft glow ≈ 8× the core), color [1.75,1.7,0.42], color2 (warmer), intensity(5), focus/aperture */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { rise: 0.04, wander: 0.9, speed: 1, size: 0.025, minPx: 1.8, period: 3.2, flash: 0.9, base: 0.1, halo: 0.9,
      color: [1.75, 1.7, 0.42], color2: [2.2, 1.5, 0.4], intensity: 5, far: 120, fadeEdge: 0.08, ...opts };
    const n = opts.count ?? 160;
    this.u = { ...baseUniforms(e, this.defaults), uRise: { value: 0 }, uWander: { value: 0 }, uSpeed: { value: 1 }, uSize: { value: 0 }, uMinPx: { value: 1 },
      uIntensity: { value: 1 }, uPeriod: { value: 3 }, uFlash: { value: 0.6 }, uBase: { value: 0 }, uHalo: { value: 0 }, uFar: { value: 100 }, uFadeEdge: { value: 0.1 },
      uColor: { value: new THREE.Vector3() }, uColor2: { value: new THREE.Vector3() } };
    const geo = pointsGeometry(n, { aSeed: [randoms(n, 4, opts.seed ?? 202), 4], aSeed2: [randoms(n, 4, (opts.seed ?? 202) + 1), 4] });
    this.object = finish(new THREE.Points(geo, material(FIRE_VERT, SPRITE_FRAG, this.u, 'keep')), opts.renderOrder ?? 121);
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    applyCommon(this, t, p);
    for (const [k, v] of [['uRise', p.rise], ['uWander', p.wander], ['uSpeed', p.speed], ['uSize', p.size], ['uMinPx', p.minPx], ['uIntensity', p.intensity],
      ['uPeriod', p.period], ['uFlash', p.flash], ['uBase', p.base], ['uHalo', p.halo], ['uFar', p.far], ['uFadeEdge', p.fadeEdge], ['uColor', p.color], ['uColor2', p.color2]]) setU(u, k, v);
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  Snow — soft flakes, swaying fall (the waiting shot 3.6: seasons turn)
// ------------------------------------------------------------------------------------------------------------
const SNOW_VERT = /* glsl */`
attribute vec4 aSeed, aSeed2;
uniform float uTime, uPx, uFall, uSway, uSize, uMinPx, uIntensity, uFar, uFadeEdge;
uniform vec3 uColor, uWind; uniform vec2 uRes;
varying vec3 vCol; varying float vI, vBokeh, vHalo, vCoreF;
void main(){
  vec3 c = boxCenter(), S = uBoxS;
  vec3 p = aSeed.xyz * S;
  float v = uFall * (0.6 + 0.8 * aSeed2.x);
  p.y -= v * uTime;
  p += uWind * uTime * (0.7 + 0.6 * aSeed2.y);
  float om = 0.6 + 1.1 * aSeed2.z;
  p.x += uSway * sin(uTime * om + aSeed2.w * TAU) * (0.5 + aSeed.w);
  p.z += uSway * cos(uTime * om * 0.83 + aSeed2.y * TAU) * (0.5 + aSeed.w);
  p = wrapBox(p, c, S);
  float fade = boxFade(p, c, S, max(S * uFadeEdge, vec3(1e-3)));
  vec4 mv = viewMatrix * vec4(p, 1.);
  float depth = -mv.z;
  gl_Position = projectionMatrix * mv;
  float ppu = pxPerUnit(depth, uRes.y);
  float wpx = uSize * (0.5 + aSeed.w) * ppu;
  float basePx = max(wpx, uMinPx * uPx);
  float cover = sat(wpx / (uMinPx * uPx));
  vec3 d = dofSize(basePx, depth, uPx);
  gl_PointSize = d.x;
  vBokeh = d.z; vHalo = 0.25; vCoreF = 0.5;
  vI = uIntensity * (0.55 + 0.45 * aSeed2.y) * fade * d.y * pow(cover, 1.5) * exp(-depth / uFar);
  vCol = uColor;
  if (vI < 1e-4 || depth < 0.05) gl_Position = vec4(0., 0., 2., 1.);
}`;

export class Snow {
  /** opts: count(6000), box, follow(true), ahead(8), fall(0.9 m/s), sway(0.25 m), wind [0.3,0,0], size(0.022 m), minPx(1.2),
   *  color [0.85,0.9,1.0], intensity(0.9), far(70), focus/aperture, soft(1: defocused flakes are soft blobs, 0 = rim-lit discs) */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { follow: true, ahead: 8, box: { center: [0, 0, 0], size: [30, 16, 30] }, fall: 0.9, sway: 0.25, wind: [0.3, 0, 0],
      size: 0.022, minPx: 1.2, color: [0.85, 0.9, 1.0], intensity: 0.9, far: 70, fadeEdge: 0.08, soft: 1, maxCoc: 40, ...opts };
    const n = opts.count ?? 6000;
    this.u = { ...baseUniforms(e, this.defaults), uFall: { value: 0 }, uSway: { value: 0 }, uSize: { value: 0 }, uMinPx: { value: 1 }, uIntensity: { value: 1 },
      uFar: { value: 60 }, uFadeEdge: { value: 0.08 }, uColor: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3() } };
    const geo = pointsGeometry(n, { aSeed: [randoms(n, 4, opts.seed ?? 303), 4], aSeed2: [randoms(n, 4, (opts.seed ?? 303) + 1), 4] });
    this.object = finish(new THREE.Points(geo, material(SNOW_VERT, SPRITE_FRAG, this.u, 'keep')), opts.renderOrder ?? 119);
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    applyCommon(this, t, p);
    for (const [k, v] of [['uFall', p.fall], ['uSway', p.sway], ['uSize', p.size], ['uMinPx', p.minPx], ['uIntensity', p.intensity],
      ['uFar', p.far], ['uFadeEdge', p.fadeEdge], ['uColor', p.color], ['uWind', p.wind]]) setU(u, k, v);
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  Petals — petals of light spiralling upward around a column (1.9: the ink dancers become rising light)
// ------------------------------------------------------------------------------------------------------------
const PETAL_VERT = /* glsl */`
attribute vec2 aCorner; attribute vec4 aSeed, aSeed2;
uniform float uTime, uPx, uRadius, uHeight, uRise, uSpin, uTumble, uSize, uSpread, uIntensity, uDensity, uFar, uMinPx;
uniform vec3 uCenter, uColor, uColor2; uniform vec2 uRes;
varying vec2 vUv; varying vec3 vCol; varying float vI;
mat3 rotAxis(vec3 a, float ang){ float s = sin(ang), c = cos(ang), oc = 1. - c;
  return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
              oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
              oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }
void main(){
  vUv = aCorner;
  // helix: height wraps over the column, radius opens as petals climb
  float h = fract(aSeed.x + uTime * uRise * (0.6 + 0.4 * aSeed2.x) / uHeight);
  float r = uRadius * (0.25 + 0.75 * sqrt(aSeed.y)) * (1. + uSpread * h);
  float ang = aSeed.z * TAU + uTime * uSpin * (0.55 + 0.45 * aSeed2.y) * (1. - 0.4 * h);
  vec3 p = uCenter + vec3(cos(ang) * r, h * uHeight, sin(ang) * r);
  p += wander3(aSeed2, uTime * 0.6) * 0.15 * uRadius;
  // tumbling orientation
  vec3 ax = normalize(vec3(aSeed2.z - 0.5, aSeed2.w - 0.5, aSeed.w - 0.5) + 1e-3);
  mat3 R = rotAxis(ax, aSeed.w * TAU + uTime * uTumble * (0.5 + aSeed2.x));
  float sz = uSize * (0.6 + 0.8 * aSeed2.y);
  vec3 local = vec3(aCorner.x * 0.5, aCorner.y - 0.15, 0.) * sz;
  vec3 wp = p + R * local;
  vec4 mv = viewMatrix * vec4(wp, 1.);
  gl_Position = projectionMatrix * mv;
  // light: shimmer as the petal turns to face the camera, fade in/out at the column ends
  vec3 nrm = R * vec3(0., 0., 1.);
  vec3 vd = normalize(cameraPosition - p);
  float facing = abs(dot(nrm, vd));
  float ends = smoothstep(0., 0.12, h) * (1. - smoothstep(0.75, 1., h));
  float on = step(aSeed2.w, uDensity);
  float depth = -mv.z;
  float cover = sat(sz * pxPerUnit(depth, uRes.y) / (uMinPx * uPx));
  vI = uIntensity * (0.3 + 0.7 * facing + 1.2 * pow(facing, 24.)) * ends * on * exp(-depth / uFar) * cover;
  vCol = mix(uColor, uColor2, aSeed.y * aSeed2.z);
  if (vI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;
const PETAL_FRAG = /* glsl */`
uniform float uKeep;
varying vec2 vUv; varying vec3 vCol; varying float vI;
void main(){
  // teardrop petal: narrow at the base (y=0), round at the tip (y=1) with a tiny notch
  float y = vUv.y, x = vUv.x;
  float w = sin(PI * pow(sat(y), 0.75)) * 0.95;
  float notch = 0.08 * exp(-x * x * 60.) * smoothstep(0.85, 1., y);
  float edge = abs(x) / max(w, 1e-3);
  float inside = (1. - smoothstep(0.82, 1., edge)) * smoothstep(0., 0.04, y) * (1. - smoothstep(0.96 - notch, 1. - notch, y));
  float rim = smoothstep(0.45, 0.95, edge) * 0.8;
  float vein = exp(-x * x * 900.) * 0.25 * y;
  float a = inside * (0.45 + rim + vein) * (0.7 + 0.3 * y);
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol * vI * a, uKeep * sat(vI * a));
}`;

export class Petals {
  /** opts: count(1400), center [x,y,z] (column base), radius(2.5 m), height(8 m), rise(0.6 m/s), spin(0.45 rad/s), spread(0.6: opening),
   *  tumble(1.2), size(0.08 m), color (rose), color2 (gold), intensity(0.7), density(1: fraction shown), minPx(1.2), far(80) */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { center: [0, 0, 0], radius: 2.5, height: 8, rise: 0.6, spin: 0.45, spread: 0.6, tumble: 1.2, size: 0.08,
      color: [2.0, 1.0, 1.2], color2: [2.2, 1.45, 0.7], intensity: 0.7, density: 1, minPx: 1.2, far: 80, ...opts };
    const n = opts.count ?? 1400;
    this.u = { ...baseUniforms(e, this.defaults), uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uHeight: { value: 1 }, uRise: { value: 0 },
      uSpin: { value: 0 }, uSpread: { value: 0 }, uTumble: { value: 0 }, uSize: { value: 0 }, uIntensity: { value: 1 }, uDensity: { value: 1 }, uFar: { value: 80 },
      uMinPx: { value: 1 }, uColor: { value: new THREE.Vector3() }, uColor2: { value: new THREE.Vector3() } };
    const geo = quadGeometry(n, { aSeed: [randoms(n, 4, opts.seed ?? 404), 4], aSeed2: [randoms(n, 4, (opts.seed ?? 404) + 1), 4] });
    this.object = finish(new THREE.Mesh(geo, material(PETAL_VERT, PETAL_FRAG, this.u, 'keep')), opts.renderOrder ?? 122);
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    applyCommon(this, t, p);
    for (const [k, v] of [['uCenter', p.center], ['uRadius', p.radius], ['uHeight', p.height], ['uRise', p.rise], ['uSpin', p.spin], ['uSpread', p.spread],
      ['uTumble', p.tumble], ['uSize', p.size], ['uIntensity', p.intensity], ['uDensity', p.density], ['uMinPx', p.minPx], ['uFar', p.far],
      ['uColor', p.color], ['uColor2', p.color2]]) setU(u, k, v);
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  Lanterns — thousands of paper sky-lanterns rising from a city footprint (4.4 the dawn crane shot)
// ------------------------------------------------------------------------------------------------------------
const LANTERN_VERT = /* glsl */`
attribute vec2 aCorner; attribute vec4 aSeed, aSeed2; attribute vec3 aHome;
uniform float uTime, uPx, uSpeed, uAccel, uSway, uSize, uMinPx, uIntensity, uFlicker, uDensity, uCeiling, uLife, uFar, uPreGlow;
uniform vec2 uLaunch; uniform vec3 uWind, uColor, uColor2; uniform vec2 uRes;
varying vec2 vUv; varying vec3 vCol; varying float vI, vSmall, vAspect;
void main(){
  float tl = mix(uLaunch.x, uLaunch.y, aSeed.x);
  float age = uTime - tl;
  float on = step(aSeed.y, uDensity) * step(-uPreGlow, age);
  float a = max(age, 0.);
  // smooth lift-off: velocity eases from 0 to speed over ~uAccel seconds
  float spd = uSpeed * (0.7 + 0.6 * aSeed.z);
  float h = spd * (a - uAccel * (1. - exp(-a / uAccel)));
  vec3 p = aHome + vec3(0., h, 0.);
  // wind shear: drift grows with altitude; gentle personal sway
  p += uWind * (a * (0.6 + 0.4 * aSeed2.x)) * (0.3 + 0.7 * sat(h / 40.));
  p.x += uSway * sin(a * (0.5 + 0.4 * aSeed2.y) + aSeed2.z * TAU) * sat(a * 0.5);
  p.z += uSway * cos(a * (0.4 + 0.3 * aSeed2.w) + aSeed2.y * TAU) * sat(a * 0.5);
  // cylindrical billboard (upright)
  vec3 toCam = cameraPosition - p; toCam.y = 0.;
  vec3 right = normalize(vec3(toCam.z, 0., -toCam.x) + 1e-5);
  float sz = uSize * (0.8 + 0.4 * aSeed2.w);
  float depth = max(dot(p - cameraPosition, camForward()), 0.01);
  float ppu = pxPerUnit(depth, uRes.y);
  float hpx = sz * ppu;
  // tiny lanterns become round glows: grow the quad to a min size and switch the shading to a soft dot
  float minH = 2.2 * uMinPx * uPx;
  float g = max(1., minH / max(hpx, 1e-3));
  vSmall = 1. - smoothstep(3. * uPx, 9. * uPx, hpx);
  float qw = sz * 1.5 * g, qh = sz * 2.0 * g;
  vec3 wp = p + right * aCorner.x * qw * 0.5 + vec3(0., 1., 0.) * (aCorner.y - 0.5) * qh;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
  vUv = vec2(aCorner.x, aCorner.y);
  vAspect = qw / qh;
  // light: being lit on the ground (pre-glow), flicker, fade near the ceiling / end of life, energy for tiny ones
  float lit = smoothstep(-uPreGlow, 0., age);
  float fl = 1. - uFlicker * (vnoise(uTime * 7. + aSeed2.x * 50.) * 0.6 + vnoise(uTime * 17. + aSeed2.y * 30.) * 0.4);
  float life = 1. - smoothstep(uLife * 0.75, uLife, a) ;
  float ceil = 1. - smoothstep(uCeiling * 0.8, uCeiling, h);
  vI = uIntensity * on * lit * fl * life * ceil * exp(-depth / uFar) / (g * g) * (0.75 + 0.5 * aSeed.w);
  vCol = mix(uColor, uColor2, aSeed2.w);
  if (vI < 1e-5) gl_Position = vec4(0., 0., 2., 1.);
}`;
const LANTERN_FRAG = /* glsl */`
uniform float uKeep;
varying vec2 vUv; varying vec3 vCol; varying float vI, vSmall, vAspect;
void main(){
  // body coordinates: lantern occupies the middle of the quad (halo margin around it)
  vec2 q = vec2(vUv.x / 0.62, (vUv.y - 0.2) / 0.6);           // x in [-1,1] across the body, y 0 (mouth) .. 1 (top)
  float wAt = mix(0.74, 1.0, sat(q.y));                         // tapers toward the open bottom
  float inX = 1. - smoothstep(wAt - 0.1, wAt, abs(q.x));
  float inY = smoothstep(-0.02, 0.04, q.y) * (1. - smoothstep(0.94, 1.0, q.y));
  float body = inX * inY;
  // translucent paper: brightest low and in the middle (flame inside), ribs, darker crown
  float paper = mix(1.25, 0.42, sat(q.y)) * (0.7 + 0.3 * cos(q.x * 1.4)) * (0.9 + 0.1 * cos(q.x * 9.42));
  float flame = exp(-(q.x * q.x * 22. + (q.y - 0.1) * (q.y - 0.1) * 70.)) * 2.2;
  vec2 hp = vec2(vUv.x * vAspect, vUv.y - 0.45);
  float halo = exp(-length(hp) * 4.2) * 0.35;
  float shaped = body * paper + flame * inX + halo;
  float dot0 = exp(-dot(vec2(vUv.x * vAspect, vUv.y - 0.45), vec2(vUv.x * vAspect, vUv.y - 0.45)) * 30.) * 1.6 + exp(-length(hp) * 6.) * 0.25;
  float a = mix(shaped, dot0, vSmall);
  vec3 c = vCol * mix(vec3(1.), vec3(1.15, 0.95, 0.7), sat(q.y)) ;
  gl_FragColor = vec4(c * vI * a, uKeep * sat(vI * a));
}`;

export class Lanterns {
  /**
   * opts: count(3000), area { x:[x0,x1], z:[z0,z1], y } (city footprint) or homes: [[x,y,z],...], mask(x,z)->bool,
   *   launch [t0,t1] (release window, film s), density(1), speed(2.2 m/s), accel(2.5 s), wind [0.6,0,-0.3], sway(0.35 m),
   *   size(1.0 m tall), minPx(1.3), color [3.4,1.25,0.3], color2 (paler), intensity(3), flicker(0.25),
   *   ceiling(260 m), life(120 s), preGlow(1.2 s lit on the ground before lift-off), far(3000)
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { launch: [0, 10], density: 1, speed: 2.2, accel: 2.5, wind: [0.6, 0, -0.3], sway: 0.35, size: 1.0, minPx: 1.3,
      color: [3.4, 1.25, 0.3], color2: [3.6, 1.8, 0.6], intensity: 3, flicker: 0.25, ceiling: 260, life: 120, preGlow: 1.2, far: 3000, ...opts };
    const n = opts.count ?? 3000;
    const r = rng(opts.seed ?? 505);
    const home = new Float32Array(n * 3);
    const area = opts.area || { x: [-200, 200], z: [-400, -100], y: 0 };
    for (let i = 0; i < n; i++) {
      let x, z, y = area.y ?? 0, k = 0;
      if (opts.homes) { const h = opts.homes[i % opts.homes.length]; x = h[0] + (r() - 0.5) * 2; y = h[1]; z = h[2] + (r() - 0.5) * 2; }
      else do { x = area.x[0] + (area.x[1] - area.x[0]) * r(); z = area.z[0] + (area.z[1] - area.z[0]) * r(); } while (opts.mask && !opts.mask(x, z) && ++k < 30);
      home.set([x, y, z], i * 3);
    }
    this.u = { ...baseUniforms(e, this.defaults), uLaunch: { value: new THREE.Vector2() }, uDensity: { value: 1 }, uSpeed: { value: 1 }, uAccel: { value: 1 },
      uWind: { value: new THREE.Vector3() }, uSway: { value: 0 }, uSize: { value: 1 }, uMinPx: { value: 1 }, uColor: { value: new THREE.Vector3() },
      uColor2: { value: new THREE.Vector3() }, uIntensity: { value: 1 }, uFlicker: { value: 0 }, uCeiling: { value: 100 }, uLife: { value: 100 },
      uPreGlow: { value: 1 }, uFar: { value: 1000 } };
    // launch order: sort by a smooth field so lanterns rise in waves rather than uniformly
    const seeds = randoms(n, 4, (opts.seed ?? 505) + 1);
    const geo = quadGeometry(n, { aSeed: [seeds, 4], aSeed2: [randoms(n, 4, (opts.seed ?? 505) + 2), 4], aHome: [home, 3] }, [-1, 0, 1, 0, -1, 1, 1, 1]);
    this.object = finish(new THREE.Mesh(geo, material(LANTERN_VERT, LANTERN_FRAG, this.u, 'keep')), opts.renderOrder ?? 118);
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    applyCommon(this, t, p);
    u.uLaunch.value.fromArray(p.launch);
    for (const [k, v] of [['uDensity', p.density], ['uSpeed', p.speed], ['uAccel', p.accel], ['uWind', p.wind], ['uSway', p.sway], ['uSize', p.size],
      ['uMinPx', p.minPx], ['uColor', p.color], ['uColor2', p.color2], ['uIntensity', p.intensity], ['uFlicker', p.flicker], ['uCeiling', p.ceiling],
      ['uLife', p.life], ['uPreGlow', p.preGlow], ['uFar', p.far]]) setU(u, k, v);
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  Streak engine shared by InkRain and InkToLight: velocity-aligned, motion-blurred quads
// ------------------------------------------------------------------------------------------------------------
const STREAK_COMMON = /* glsl */`
attribute vec2 aCorner; attribute vec4 aSeed, aSeed2;
uniform float uTime, uPx, uShutter, uWidth, uMinPx, uFar, uNear, uMaxPx; uniform vec2 uRes;
varying vec2 vUv; varying float vCover;
// place the quad between tail (P - V*shutter) and head (P); returns view depth
float streak(vec3 P, vec3 V, float widthScale){
  vec4 cH = projectionMatrix * viewMatrix * vec4(P, 1.);
  vec3 Tw = P - V * uShutter;
  vec4 cT = projectionMatrix * viewMatrix * vec4(Tw, 1.);
  if (cH.w < 0.05) { gl_Position = vec4(0., 0., 2., 1.); return -1.; }
  if (cT.w < 0.05) cT = cH;
  vec2 hs = uRes * .5;
  vec2 sH = cH.xy / cH.w * hs, sT = cT.xy / cT.w * hs;
  vec2 d = sH - sT; float L = length(d);
  vec2 dir = L > 1e-3 ? d / L : vec2(0., 1.); vec2 n = vec2(-dir.y, dir.x);
  float wpx = uWidth * widthScale * pxPerUnit(cH.w, uRes.y);
  float w = clamp(wpx, uMinPx * uPx, uMaxPx * uPx);
  // sub-pixel drops get dimmer instead of thinner; drops grazing the lens are defocused away
  vCover = sat(wpx / (uMinPx * uPx)) * smoothstep(uNear * 0.4, uNear, cH.w) * min(1., uMaxPx * uPx / max(wpx, 1e-3));
  vec2 s = mix(sT - dir * w * 0.5, sH + dir * w * 0.5, aCorner.y) + n * aCorner.x * w * 0.5;
  float ww = mix(cT.w, cH.w, aCorner.y), zz = mix(cT.z, cH.z, aCorner.y);
  gl_Position = vec4(s / hs * ww, zz, ww);
  vUv = vec2(aCorner.x, aCorner.y);
  return cH.w;
}
`;

// ------------------------------------------------------------------------------------------------------------
//  InkRain — dark ink streaks falling through a camera-following volume, gusty wind, splash flecks on the ground
// ------------------------------------------------------------------------------------------------------------
const RAIN_VERT = /* glsl */`
uniform float uSpeed, uOpacity, uFlash, uGust;
uniform vec3 uWind;
varying float vA, vL;
void main(){
  vec3 c = boxCenter(), S = uBoxS;
  float spd = uSpeed * (0.8 + 0.4 * aSeed.w);
  // gusts: analytic displacement G(t) and its derivative
  float gx = uGust * (sin(uTime * 0.71 + 1.3) + 0.5 * sin(uTime * 1.93 + 4.1));
  float gv = uGust * (0.71 * cos(uTime * 0.71 + 1.3) + 0.965 * cos(uTime * 1.93 + 4.1));
  vec3 V = vec3(uWind.x * (1. + gv * 0.3), -spd, uWind.z * (1. + gv * 0.3));
  vec3 p = aSeed.xyz * S + vec3(uWind.x, -spd, uWind.z) * uTime + vec3(uWind.x, 0., uWind.z) * gx * 0.3;
  p = wrapBox(p, c, S);
  float fade = boxFade(p, c, S, max(S * 0.06, vec3(1e-3)));
  float depth = streak(p, V, 0.6 + 0.8 * aSeed2.x);
  vA = uOpacity * fade * (0.45 + 0.55 * aSeed2.y) * exp(-max(depth, 0.) / uFar) * vCover;
  vL = uFlash * (0.6 + 0.4 * aSeed2.z);
}`;
const RAIN_FRAG = /* glsl */`
uniform vec3 uInk, uLight, uSheen;
varying vec2 vUv; varying float vA, vL, vCover;
void main(){
  float across = 1. - vUv.x * vUv.x;
  float along = smoothstep(0., 0.25, vUv.y) * (1. - smoothstep(0.85, 1., vUv.y));
  float a = vA * across * along;
  // premultiplied: a drop occludes (ink) and faintly reflects the sky (sheen) — darker than a pale sky,
  // lighter than dark walls; a lightning flash catches every drop
  gl_FragColor = vec4((uInk + uSheen) * a + uLight * vL * across * along * vA * 2.5, a);
}`;
const SPLASH_VERT = /* glsl */`
attribute vec4 aSeed;
uniform float uTime, uPx, uPeriod, uLife, uGround, uArea, uOpacity, uSize, uMinPx; uniform vec3 uCenter; uniform vec2 uRes;
varying float vA;
void main(){
  // splash slots: every slot fires once per period at a fresh place; K flecks share a slot (aSeed.w = slot)
  float slot = floor(aSeed.w * 4096.);
  float per = uPeriod * (0.7 + 0.6 * hash11(slot * 1.7));
  float ph = (uTime + hash11(slot * 3.1) * per) / per;
  float k = floor(ph);
  float tau = fract(ph) * per;
  vec2 hp = vec2(hash12(vec2(slot, k)), hash12(vec2(k, slot + 7.))) * uArea;
  vec2 o = uCenter.xz - 0.5 * uArea;
  hp = o + mod(hp - o, vec2(uArea));
  // ballistic fleck
  float ang = aSeed.x * TAU, sp = 0.7 + 1.6 * aSeed.y, up = 1.2 + 2.2 * aSeed.z;
  vec3 p = vec3(hp.x, uGround, hp.y) + vec3(cos(ang) * sp, up, sin(ang) * sp) * tau + vec3(0., -4.9 * tau * tau, 0.);
  float live = step(tau, uLife) * step(uGround - 0.01, p.y);
  vec4 mv = viewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float wpx = uSize * pxPerUnit(-mv.z, uRes.y);
  gl_PointSize = max(wpx, uMinPx * uPx);
  vA = uOpacity * live * (1. - tau / uLife) * sat(wpx / (uMinPx * uPx)) * exp(-max(-mv.z, 0.) / 60.);
  if (vA < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;
const SPLASH_FRAG = /* glsl */`
uniform vec3 uInk; varying float vA;
void main(){ vec2 p = gl_PointCoord - .5; float a = vA * (1. - smoothstep(0.25, 0.5, length(p))); gl_FragColor = vec4(uInk * a, a); }`;

export class InkRain {
  /**
   * opts: count(14000), box (default follows the camera: size [70,36,70], ahead 22), speed(9 m/s), wind [2.2,0,0.6], gust(1.2),
   *   width(0.008 m), minPx(1), maxPx(7), near(2.5 m: drops closer than this are defocused away), shutter(0.04 s → streak length),
   *   opacity(0.72), ink [0.003,0.004,0.009], sheen [0.03,0.033,0.04] (sky light on the drops), far(110 m),
   *   flash (0..1 lightning: drops catch the light), light [1.1,1.2,1.45],
   *   splashes(3000 flecks; 0 = none), ground(0 y), splashArea(36 m), splashPeriod(0.5 s), splashLife(0.32 s), splashOpacity(0.55)
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { follow: true, ahead: 22, box: { center: [0, 0, 0], size: [70, 36, 70] }, speed: 9, wind: [2.2, 0, 0.6], gust: 1.2,
      width: 0.008, minPx: 1.0, maxPx: 7, near: 2.5, shutter: 0.04, opacity: 0.72, ink: [0.003, 0.004, 0.009], sheen: [0.03, 0.033, 0.04], far: 110, flash: 0, light: [1.1, 1.2, 1.45],
      ground: 0, splashArea: 36, splashPeriod: 0.5, splashLife: 0.32, splashOpacity: 0.55, intensity: 1, ...opts };
    const n = opts.count ?? 14000;
    this.u = { ...baseUniforms(e, this.defaults), uSpeed: { value: 9 }, uWind: { value: new THREE.Vector3() }, uGust: { value: 0 }, uShutter: { value: 0.03 },
      uWidth: { value: 0.006 }, uMinPx: { value: 1 }, uOpacity: { value: 0.5 }, uFar: { value: 90 }, uFlash: { value: 0 }, uNear: { value: 2.5 }, uMaxPx: { value: 7 },
      uInk: { value: new THREE.Vector3() }, uLight: { value: new THREE.Vector3() }, uSheen: { value: new THREE.Vector3() } };
    const geo = quadGeometry(n, { aSeed: [randoms(n, 4, opts.seed ?? 606), 4], aSeed2: [randoms(n, 4, (opts.seed ?? 606) + 1), 4] });
    this.rain = finish(new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: GLSL_COMMON + GLSL_VERT + BOX_GLSL + STREAK_COMMON + RAIN_VERT, fragmentShader: GLSL_COMMON + RAIN_FRAG,
      uniforms: this.u, depthTest: true, side: THREE.DoubleSide, ...blending('ink') })), opts.renderOrder ?? 125);
    this.object = new THREE.Group();
    this.object.add(this.rain);
    const ns = opts.splashes ?? 3000;
    if (ns > 0) {
      const K = 6;
      const sd = randoms(ns, 4, (opts.seed ?? 606) + 2);
      for (let i = 0; i < ns; i++) sd[i * 4 + 3] = Math.floor(i / K) / 4096;
      this.su = { uTime: this.u.uTime, uPx: this.u.uPx, uRes: this.u.uRes, uPeriod: { value: 0.5 }, uLife: { value: 0.3 }, uGround: { value: 0 },
        uArea: { value: 36 }, uOpacity: { value: 0.5 }, uSize: { value: 0.012 }, uMinPx: { value: 1.3 }, uCenter: { value: new THREE.Vector3() }, uInk: this.u.uInk };
      this.splash = finish(new THREE.Points(pointsGeometry(ns, { aSeed: [sd, 4] }), new THREE.ShaderMaterial({
        vertexShader: GLSL_COMMON + GLSL_VERT + SPLASH_VERT, fragmentShader: GLSL_COMMON + SPLASH_FRAG, uniforms: this.su, depthTest: true, ...blending('ink') })), (opts.renderOrder ?? 125) + 1);
      this.object.add(this.splash);
    }
    this.update(0);
  }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    applyCommon(this, t, p);
    for (const [k, v] of [['uNear', p.near], ['uMaxPx', p.maxPx], ['uSpeed', p.speed], ['uWind', p.wind], ['uGust', p.gust], ['uShutter', p.shutter], ['uWidth', p.width], ['uMinPx', p.minPx],
      ['uOpacity', p.opacity * (p.intensity ?? 1)], ['uFar', p.far], ['uFlash', p.flash], ['uInk', p.ink], ['uLight', p.light], ['uSheen', p.sheen]]) setU(u, k, v);
    if (this.splash) {
      const s = this.su;
      s.uPeriod.value = p.splashPeriod; s.uLife.value = p.splashLife; s.uGround.value = p.ground; s.uArea.value = p.splashArea;
      s.uOpacity.value = p.splashOpacity * (p.intensity ?? 1);
      if (p.camera) s.uCenter.value.copy(p.camera.position); else if (p.splashCenter) s.uCenter.value.fromArray(p.splashCenter);
      this.splash.visible = p.splashOpacity > 0;
    }
    return this;
  }
}

// ------------------------------------------------------------------------------------------------------------
//  InkToLight — the rain inverts (4.1 / 4.4): ink falls, decelerates, ignites into warm light and rises
// ------------------------------------------------------------------------------------------------------------
const INV_VERT = /* glsl */`
uniform float uFall, uRise, uTurn, uTurnDur, uWave, uJitter, uOpacity, uIntensity, uFlashK;
uniform vec3 uOrigin, uWind;
varying float vA, vGlow, vMix;
// integral of smoothstep(0, D, s) ds from 0 to tau
float sInt(float tau, float D){ float u = sat(tau / D); return tau < D ? D * (u * u * u - 0.5 * u * u * u * u) : D * 0.5 + (tau - D); }
void main(){
  vec3 c = boxCenter(), S = uBoxS;
  vec3 base = aSeed.xyz * S;
  float vf = uFall * (0.85 + 0.3 * aSeed.w);
  float vr = uRise * (0.6 + 0.8 * aSeed2.x);
  vec3 wv = vec3(uWind.x, 0., uWind.z);
  // where the drop is (horizontally) decides when the inversion wave reaches it
  vec3 hxz = wrapBox(base + wv * uTime, c, S);
  float Ti = uTurn + length(hxz.xz - uOrigin.xz) / max(uWave, 1e-3) + aSeed2.y * uJitter;
  float t = min(uTime, Ti);
  vec3 p = base + vec3(0., -vf, 0.) * t + wv * uTime;
  vec3 V = vec3(wv.x, -vf, wv.z);
  float tau = uTime - Ti;
  float D = uTurnDur * (0.8 + 0.4 * aSeed2.z);
  // this drop's zero-velocity instant: smoothstep(x) = vf/(vf+vr)  →  x = 0.5 − sin(asin(1 − 2y)/3)
  float x0 = 0.5 - sin(asin(clamp(1. - 2. * vf / (vf + vr), -1., 1.)) / 3.);
  float t0 = x0 * D;
  float ign = 0.;
  if (tau > 0.) {
    // fall position frozen at Ti (wrapped), then the analytic deceleration / rise
    p = wrapBox(p, c, S);
    p.y += -vf * tau + (vf + vr) * sInt(tau, D);
    float sv = smoothstep(0., D, tau);
    V = vec3(wv.x, -vf + (vf + vr) * sv, wv.z);
    ign = smoothstep(t0 - 0.06, t0 + 0.22, tau);
    // risen light sways and keeps rising; re-wrap once fully in the rising phase (new lights enter from below)
    p.x += sin(tau * (0.9 + aSeed2.w) + aSeed.w * TAU) * 0.25 * ign;
    p.z += cos(tau * (0.7 + aSeed2.z) + aSeed2.y * TAU) * 0.25 * ign;
    if (tau > D * 1.5) p = wrapBox(p, c, S);
  } else p = wrapBox(p, c, S);
  float fade = boxFade(p, c, S, max(S * 0.06, vec3(1e-3)));
  float depth = streak(p, V, mix(0.6 + 0.8 * aSeed2.x, 2.6, ign));
  float flash = 1. + uFlashK * exp(-abs(tau - t0) * 9.) * step(0., tau);
  float df = exp(-max(depth, 0.) / uFar) * vCover;
  vA = uOpacity * fade * (0.45 + 0.55 * aSeed2.y) * df * (1. - ign);
  vGlow = uIntensity * fade * df * ign * flash * (0.5 + 0.5 * aSeed2.w);
  vMix = ign;
}`;
const INV_FRAG = /* glsl */`
uniform vec3 uInk, uGold, uGold2;
varying vec2 vUv; varying float vA, vGlow, vMix, vCover;
void main(){
  float across = 1. - vUv.x * vUv.x;
  float along = smoothstep(0., 0.25, vUv.y) * (1. - smoothstep(0.85, 1., vUv.y));
  float ink = vA * across * along;
  // light: soft round glow, hotter core
  float rr = vUv.x * vUv.x;
  float glow = (exp(-rr * 9.) + 0.35 * exp(-rr * 2.5)) * along;
  vec3 lc = mix(uGold, uGold2, vMix * vMix) * vGlow * glow;
  gl_FragColor = vec4(uInk * ink + lc, ink);
}`;

export class InkToLight {
  /**
   * opts: count(14000), box (follows camera by default, [44,26,50], ahead 18), fall(8.5 m/s), rise(2.4 m/s),
   *   turn (film time the inversion starts at `origin`), origin [x,y,z], wave(40 m/s: radial speed of the inversion), jitter(0.5 s),
   *   turnDur(0.9 s deceleration), width(0.008 m), minPx(1), shutter(0.04), opacity(0.65 ink), intensity(2.4 light),
   *   ink, gold [2.6,1.55,0.55], gold2 [3.0,2.4,1.6], flashK(4: ignition flash), wind [1.2,0,0.3], far(90), near(2.5), maxPx(7)
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.defaults = { follow: true, ahead: 18, box: { center: [0, 0, 0], size: [44, 26, 50] }, fall: 8.5, rise: 2.4, turn: 2, origin: [0, 0, 0],
      wave: 40, jitter: 0.5, turnDur: 0.9, width: 0.008, minPx: 1, maxPx: 7, near: 2.5, shutter: 0.04, opacity: 0.65, intensity: 2.4, ink: [0.003, 0.004, 0.009],
      gold: [2.6, 1.55, 0.55], gold2: [3.0, 2.4, 1.6], flashK: 4, wind: [1.2, 0, 0.3], far: 90, ...opts };
    const n = opts.count ?? 14000;
    this.u = { ...baseUniforms(e, this.defaults), uFall: { value: 8 }, uRise: { value: 2 }, uTurn: { value: 0 }, uTurnDur: { value: 1 },
      uWave: { value: 20 }, uJitter: { value: 0.5 }, uOpacity: { value: 0.5 }, uIntensity: { value: 2 }, uFlashK: { value: 3 }, uOrigin: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3() }, uShutter: { value: 0.03 }, uWidth: { value: 0.007 }, uMinPx: { value: 1 }, uFar: { value: 90 }, uNear: { value: 2.5 }, uMaxPx: { value: 7 },
      uInk: { value: new THREE.Vector3() }, uGold: { value: new THREE.Vector3() }, uGold2: { value: new THREE.Vector3() } };
    const geo = quadGeometry(n, { aSeed: [randoms(n, 4, opts.seed ?? 707), 4], aSeed2: [randoms(n, 4, (opts.seed ?? 707) + 1), 4] });
    this.object = finish(new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: GLSL_COMMON + GLSL_VERT + BOX_GLSL + STREAK_COMMON + INV_VERT, fragmentShader: GLSL_COMMON + INV_FRAG,
      uniforms: this.u, depthTest: true, side: THREE.DoubleSide, ...blending('ink') })), opts.renderOrder ?? 126);
    this.update(0);
  }
  /** time the inversion reaches a world point (for syncing other events, e.g. sky/grade) */
  turnAt(x, z, params) { const p = P(this.defaults, params); return p.turn + Math.hypot(x - p.origin[0], z - p.origin[2]) / p.wave; }
  update(t, params) {
    const p = P(this.defaults, params), u = this.u;
    applyCommon(this, t, p);
    for (const [k, v] of [['uNear', p.near], ['uMaxPx', p.maxPx], ['uFall', p.fall], ['uRise', p.rise], ['uTurn', p.turn], ['uTurnDur', p.turnDur], ['uWave', p.wave], ['uJitter', p.jitter],
      ['uOpacity', p.opacity], ['uIntensity', p.intensity], ['uFlashK', p.flashK], ['uOrigin', p.origin], ['uWind', p.wind], ['uShutter', p.shutter],
      ['uWidth', p.width], ['uMinPx', p.minPx], ['uFar', p.far], ['uInk', p.ink], ['uGold', p.gold], ['uGold2', p.gold2]]) setU(u, k, v);
    return this;
  }
}

export * from './particles_light.js';
export * from './particles_ink.js';
