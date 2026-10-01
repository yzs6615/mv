import * as THREE from 'three';
import { Typography, STYLES } from '../core/typography.js';
import { rng } from '../core/math.js';
import { GLYPHS, OPUS_SETTING } from './ident_glyphs.js';
import { GLSL_COMMON, GLSL_VERT, blending, pointsGeometry } from './particles_core.js';

// ============================================================================================================
//  OPUS 5.5 — the constellation ident (shot P2, 9.91–17.97 s; lines fade during P3's tilt-down)
// ============================================================================================================
//
//  1. DISSOLVE  The last typed card (Courier Prime, centred) crumbles left→right into luminous dust. Start
//               positions are the glyph pixels of the very same card, drawn offscreen with the engine's own
//               Typography class, so the dust is born exactly where the overlay letters were.
//  2. RISE      The dust lifts (Bezier that leaves vertically), curls, and settles as a faint nebula of
//               hovering motes around the star each grain belongs to (a few grains just fade, like ash).
//  3. DRAW      One stroke per eighth note (13 strokes at 9.91 + 0.252078·i s): a hot head zips from star to
//               star; each star condenses out of its own dust cloud the instant the line reaches it.
//  4. FLARE     At 13.94 s the figure flares left→right and a pulse runs along every stroke.
//  5. SETTLE    Lines fade (default 17.6–19.6 s) while the stars stay fixed on the sky for the tilt-down.
//
//  The figure lives on the celestial sphere: stars are laid out on a gnomonic (tangent-plane) chart centred at
//  azimuth/elevation and projected to a sphere of `radius` around the group origin. Call update() with the
//  camera every frame and the group follows the camera position (like the Sky dome), so directions are exact.
//
//  const ident = new ConstellationIdent(e);          // defaults = the real film timings
//  await ident.prepare();                            // optional (fonts) — e.g. from buildFilm's warm()
//  set.scene.add(ident.object);
//  ident.place({ az: 0, el: 34, width: 44 });        // deg; width = angular width of the whole word
//  ident.update(t, { camera });                      // every frame (pure function of t)
//  grade.bloom += 0.35 * ident.flare(t);             // optional: feed the completion flare into the grade
//
//  Everything writes alpha 0 (world light). renderOrder 104–106 (after paper layers, depth-tested).
// ============================================================================================================

/** the last typed card of P1 (copy of film.js card B) — the text that dissolves into the stars */
export const IDENT_CARD = {
  t0: 6.85, t1: 9.75, fadeIn: 0.01, fadeOut: 0.5, anchor: [0.5, 0.5], valign: 0.5, lines: [
    { text: 'It has always ended the same way.', style: 'mono', size: 40, type: { dur: 1.7 }, delay: 0.1 },
    { text: '结局，从未改变。', style: 'cn', size: 32, gap: 22, delay: 1.9, fadeIn: 0.7 },
  ],
};

export const IDENT_TIMING = {
  connections: Array.from({ length: 13 }, (_, i) => 9.91 + 0.252078 * i), // stroke onsets (eighth notes)
  draw: 0.2,             // seconds for a stroke to zip from its first to its last star
  flare: 13.94,          // completion flare
  dissolve: 9.2,         // first (leftmost) letters crumble…
  dissolveSpread: 0.42,  // …and the sweep reaches the right end this much later
  dissolveErode: 0.3,    // per-grain random delay (letters erode grain by grain)
  flightMax: 2.6,        // longest rise of a dust grain to its proto-star clump
  linesFade: [17.6, 19.6],
  fieldIn: [10.35, 13.5],
};

const STAR_COLORS = [[0.74, 0.84, 1.0], [0.86, 0.91, 1.0], [1.0, 0.97, 0.93], [1.0, 0.93, 0.8], [1.0, 0.84, 0.66]];

const SKY_GLSL = /* glsl */`
uniform vec3 uDir, uRight, uUp; uniform float uK, uRadius;
vec3 skyLocal(vec2 xy){ return normalize(uDir + (xy.x * uRight + xy.y * uUp) * uK) * uRadius; }
`;

// ---------------- stars ----------------
const STAR_VERT = /* glsl */`
attribute vec2 aXY; attribute vec4 aInfo; attribute vec3 aCol; attribute float aDelay;
uniform float uTime, uPx, uStarI, uFlareT, uFlareGain, uSize, uTwinkle;
varying vec3 vCol; varying float vI, vSize, vSpike, vSig, vPeak;
void main(){
  vec4 mv = modelViewMatrix * vec4(skyLocal(aXY), 1.);
  gl_Position = projectionMatrix * mv;
  float b = aInfo.x, tI = aInfo.y;
  float on, flash = 0.;
  if (aInfo.z < 0.5) {
    on = smoothstep(tI - 0.015, tI + 0.06, uTime);
    float a = uTime - tI;
    flash = a > 0. ? exp(-a * 3.2) * (2.6 - 1.2 * b) : 0.;
  } else on = smoothstep(tI, tI + 1.4, uTime);
  float tf = uTime - (uFlareT + aDelay);
  float fl = tf > 0. ? exp(-tf * 1.5) * smoothstep(0., 0.07, tf) : 0.;
  float tw = 1. + uTwinkle * (vnoise(uTime * 5.3 + aInfo.w * 97.) + vnoise(uTime * 11.7 + aInfo.w * 31.) - 1.);
  vI = uStarI * on * (1. + flash + fl * uFlareGain * (2.2 - 1.4 * b)) * tw;
  vSig = (0.5 + 1.25 * b) * uPx * uSize;
  vPeak = 2.0 + 34. * b * b * b;
  vSpike = b > 0.38 ? (b - 0.38) * (0.5 + 3.0 * fl * uFlareGain + 0.8 * flash) : 0.;
  vSize = (12. + 46. * b + 90. * vSpike) * uPx * uSize;
  gl_PointSize = vSize;
  vCol = aCol;
  if (vI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;
const STAR_FRAG = /* glsl */`
uniform float uPx;
varying vec3 vCol; varying float vI, vSize, vSpike, vSig, vPeak;
void main(){
  vec2 p = (gl_PointCoord - .5) * vSize; float r = length(p); float R = vSize * 0.5;
  float win = sat(1. - r / R); win *= win;
  float core = exp(-r * r / (2. * vSig * vSig)) * vPeak;
  float halo = (exp(-r / (vSig * 2.2)) * (0.35 + 1.4 * vPeak * 0.02) + exp(-r / (vSig * 8.)) * 0.06 * (1. + vPeak * 0.05)) * win;
  float sp = 0.;
  if (vSpike > 0.) {
    float th = 0.5 * uPx;
    sp = (exp(-abs(p.y) / th) * pow(sat(1. - abs(p.x) / R), 2.5) + exp(-abs(p.x) / th) * pow(sat(1. - abs(p.y) / R), 2.5)) * vSpike * 1.4;
  }
  gl_FragColor = vec4(vCol * vI * (core + halo + sp), 0.);
}`;

// ---------------- lines ----------------
const LINE_VERT = /* glsl */`
attribute vec2 aA, aB, aCorner, aGap; attribute vec4 aSeg; attribute vec2 aPath;
uniform float uTime, uPx, uHalf; uniform vec2 uRes;
varying float vAlong, vAcross, vHead, vDrawing, vFrac, vPathG; varying vec2 vE; varying float vTA, vTB, vL;
void main(){
  vec4 cA = projectionMatrix * modelViewMatrix * vec4(skyLocal(aA), 1.);
  vec4 cB = projectionMatrix * modelViewMatrix * vec4(skyLocal(aB), 1.);
  if (cA.w < 1e-3 || cB.w < 1e-3) { gl_Position = vec4(0., 0., 2., 1.); return; }
  vec2 hs = uRes * .5;
  vec2 sA = cA.xy / cA.w * hs, sB = cB.xy / cB.w * hs;
  vec2 d = sB - sA; float L = max(length(d), 1e-3); vec2 dir = d / L; vec2 n = vec2(-dir.y, dir.x);
  float u = sat((uTime - aSeg.x) / aSeg.y);
  float F = 1. - (1. - u) * (1. - u);
  float g = sat((F - aSeg.z) / max(aSeg.w - aSeg.z, 1e-4));
  float head = L * g;
  float e0 = aGap.x * uPx, e1 = min(L - aGap.y * uPx, head);
  float hw = uHalf * uPx;
  float along = mix(e0, max(e1, e0), aCorner.x) + (aCorner.x * 2. - 1.) * hw * 2.;
  vec2 s = sA + dir * along + n * aCorner.y * hw;
  gl_Position = vec4(s / hs, cA.z / cA.w, 1.);
  if (e1 <= e0 + 0.3) gl_Position = vec4(0., 0., 2., 1.);
  vAlong = along; vAcross = aCorner.y * hw; vHead = head; vE = vec2(e0, e1); vL = L;
  vDrawing = (u > 0. && u < 1. && g > 0. && g < 1.) ? 1. : 0.;
  // drawn-time at both ends (for the cooling filament) and the global path coordinate (for the flare pulse)
  vTA = aSeg.x + aSeg.y * (1. - sqrt(sat(1. - aSeg.z)));
  vTB = aSeg.x + aSeg.y * (1. - sqrt(sat(1. - aSeg.w)));
  vFrac = along / L;
  vPathG = aPath.x + mix(aSeg.z, aSeg.w, sat(vFrac));
}`;
const LINE_FRAG = /* glsl */`
uniform float uTime, uPx, uLineI, uGlowI, uFlareT, uFlareGain, uNStrokes; uniform vec3 uLineCol;
varying float vAlong, vAcross, vHead, vDrawing, vFrac, vPathG; varying vec2 vE; varying float vTA, vTB, vL;
void main(){
  float cap = smoothstep(vE.x - 0.5 * uPx, vE.x + 2.5 * uPx, vAlong) * (1. - smoothstep(vE.y - 2.5 * uPx, vE.y + 0.5 * uPx, vAlong));
  float ax = abs(vAcross);
  float sc = 0.45 * uPx;
  float core = exp(-ax * ax / (2. * sc * sc));
  float glow = exp(-ax / (1.8 * uPx));
  float I = core * uLineI + glow * uGlowI;
  // cooling filament: freshly drawn line is hot, relaxes to its steady glow
  float tDrawn = mix(vTA, vTB, sat(vFrac));
  float age = max(uTime - tDrawn, 0.);
  I *= 1. + 2.6 * exp(-age * 2.2);
  // the zipping head
  float hd = vAlong - vHead;
  I += vDrawing * exp(-max(hd, 0.) / (1.5 * uPx) - max(-hd, 0.) / (14. * uPx)) * (core * 9. + glow * 1.5);
  // completion flare: global swell + a pulse running through the strokes in writing order
  float tf = uTime - uFlareT;
  if (tf > 0.) {
    float sw = exp(-tf * 1.4) * smoothstep(0., 0.08, tf);
    float hpos = tf / 0.95 * uNStrokes;
    float pulse = exp(-pow((vPathG - hpos) / 0.55, 2.)) * (1. - smoothstep(0.9, 1.4, tf / 0.95));
    I *= 1. + uFlareGain * (1.2 * sw + 3.5 * pulse);
  }
  gl_FragColor = vec4(uLineCol * I * cap, 0.);
}`;

// ---------------- dust ----------------
const DUST_VERT = /* glsl */`
attribute vec2 aStart, aTarget; attribute vec4 aHover, aTime, aSeed; attribute float aW; attribute vec3 aCol;
uniform float uTime, uPx, uDustI, uTextDist;
varying float vI; varying vec3 vCol;
void main(){
  vec3 C = cameraPosition;
  vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 cf = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float tanX = 1. / projectionMatrix[0][0], tanY = 1. / projectionMatrix[1][1];
  vec3 dS = normalize(cf + aStart.x * tanX * cr + aStart.y * tanY * cu);
  float tRel = aTime.x, tArr = aTime.y, tIgn = aTime.z, kind = aTime.w;
  // hover cloud around the target star: slow swirl, collapses into the star when it ignites
  float collapse = 1. - easeInOut((uTime - (tIgn - 0.24)) / 0.27);
  float ang = aHover.x + aHover.z * (uTime - tRel);
  float rad = aHover.y * (1. + 0.18 * sin(uTime * (0.7 + aSeed.x) + aHover.w * TAU));
  vec2 off = vec2(cos(ang), sin(ang) * 0.75) * rad * collapse;
  vec3 T = (modelMatrix * vec4(skyLocal(aTarget + off), 1.)).xyz;
  vec3 dE = normalize(T - C);
  float u = sat((uTime - tRel) / max(tArr - tRel, 1e-3));
  float ue = u * u * (3. - 2. * u);
  // leave vertically, fan out sideways a little, then glide into the hover clump
  // coherent wisps: fan-out and swirl come from smooth fields over the glyph position (+ a little per-grain jitter)
  float fA = vnoise2(aStart * vec2(5.5, 13.) + 3.1), fB = vnoise2(aStart * vec2(9., 17.) - 7.7), fC = vnoise2(aStart * vec2(3.2, 8.) + 11.);
  float vs = max(dot(dE - dS, cu), 0.);
  vec3 dC = dS + cu * vs * (0.5 + 0.6 * fA + 0.25 * aSeed.x) + cr * ((fB - 0.5) * 1.6 + (aSeed.w - 0.5) * 0.5) * (0.04 + 0.5 * vs);
  vec3 dir = (1. - ue) * (1. - ue) * dS + 2. * ue * (1. - ue) * dC + ue * ue * dE;
  float wob = sin(PI * u);
  float tt = uTime - tRel;
  float ph = fC * TAU * 2.;
  dir += (cr * (sin(tt * 1.9 + ph) + 0.45 * sin(tt * (3.9 + 1.5 * aSeed.z) + ph * 1.7 + aSeed.x * 2.))
        + cu * (cos(tt * 1.5 + ph * 1.3) + 0.45 * cos(tt * (3.3 + 1.6 * aSeed.y) + ph * 0.6 + aSeed.z * 2.))) * (0.006 + 0.008 * (tArr - tRel)) * wob * (0.55 + 0.45 * fA);
  dir = normalize(dir);
  float dist = mix(uTextDist, length(T - C) * 0.995, ue);
  gl_Position = projectionMatrix * viewMatrix * vec4(C + dir * dist, 1.);
  // light: grains ignite as they lift off, cool while rising, glitter faintly in their clump
  float appear = smoothstep(tRel - 0.3, tRel + 0.02, uTime);
  float gone = kind < 1.5 ? 1. - smoothstep(tIgn - 0.07, tIgn + 0.04, uTime) : 1. - smoothstep(tRel + 0.3, tArr, uTime);
  float glint = 1. + 1.6 * exp(-abs(tt - 0.05) * 7.);
  float hover = mix(1., 0.3, smoothstep(0.45, 1., u));
  float tw = 0.62 + 0.38 * sin(uTime * (5. + 9. * aSeed.y) + aSeed.x * TAU);
  vI = uDustI * aW * appear * gone * glint * hover * mix(1., tw, smoothstep(0., 0.4, u));
  vCol = mix(vec3(1.0, 0.93, 0.82), aCol, ue * 0.6);
  gl_PointSize = (1.3 + 0.8 * aSeed.z + 1.3 * smoothstep(0.5, 1., u)) * uPx;
  if (vI < 1e-4) gl_Position = vec4(0., 0., 2., 1.);
}`;
const DUST_FRAG = /* glsl */`
varying float vI; varying vec3 vCol;
void main(){ vec2 p = gl_PointCoord - .5; float a = exp(-dot(p, p) * 10.); gl_FragColor = vec4(vCol * vI * a, 0.); }`;

export class ConstellationIdent {
  /**
   * opts: timing (partial IDENT_TIMING), card (IDENT_CARD), glyphs/setting (override the figure),
   *       fieldStars (count, default 34), dustMax (default 9000), radius (sky sphere radius, default 1500),
   *       lineColor, seed, letterbox (frac used to lay out the card, default from 2.39:1)
   */
  constructor(e, opts = {}) {
    this.e = e;
    this.opts = opts;
    this.timing = { ...IDENT_TIMING, ...(opts.timing || {}) };
    this.card = opts.card || IDENT_CARD;
    this.object = new THREE.Group();
    this.object.name = 'ConstellationIdent';
    this.layout = buildLayout(opts.glyphs || GLYPHS, opts.setting || OPUS_SETTING, this.timing, opts.fieldStars ?? 34, opts.seed ?? 55);
    const L = this.layout;
    // shared sky-mapping uniforms
    this.sky = { uDir: { value: new THREE.Vector3(0, 0, -1) }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
      uK: { value: 0.1 }, uRadius: { value: opts.radius ?? 1500 } };
    const common = { uTime: { value: 0 }, uPx: { value: e.px }, uFlareT: { value: this.timing.flare }, uFlareGain: { value: 1 } };

    // stars
    const n = L.stars.length;
    const aXY = new Float32Array(n * 2), aInfo = new Float32Array(n * 4), aCol = new Float32Array(n * 3), aDelay = new Float32Array(n);
    L.stars.forEach((s, i) => {
      aXY.set([s.x, s.y], i * 2); aInfo.set([s.b, s.ignite, s.kind, s.seed], i * 4); aCol.set(s.col, i * 3);
      aDelay[i] = 0.32 * (s.x - L.minX) / (L.maxX - L.minX);
    });
    this.starU = { ...this.sky, ...common, uStarI: { value: 1 }, uSize: { value: 1 }, uTwinkle: { value: 0.1 } };
    this.starMat = new THREE.ShaderMaterial({ vertexShader: GLSL_COMMON + GLSL_VERT + SKY_GLSL + STAR_VERT, fragmentShader: GLSL_COMMON + STAR_FRAG,
      uniforms: this.starU, depthTest: true, ...blending('add') });
    this.stars = new THREE.Points(pointsGeometry(n, { aXY: [aXY, 2], aInfo: [aInfo, 4], aCol: [aCol, 3], aDelay: [aDelay, 1] }), this.starMat);
    this.stars.frustumCulled = false; this.stars.renderOrder = 106;
    this.object.add(this.stars);

    // lines: one quad per segment
    const segs = L.segs, ns = segs.length;
    const A = new Float32Array(ns * 4 * 2), B = new Float32Array(ns * 4 * 2), Cn = new Float32Array(ns * 4 * 2), G = new Float32Array(ns * 4 * 2),
      S = new Float32Array(ns * 4 * 4), PA = new Float32Array(ns * 4 * 2), idx = [];
    const corners = [[0, -1], [0, 1], [1, -1], [1, 1]];
    segs.forEach((sg, i) => {
      const sa = L.stars[sg.a], sb = L.stars[sg.b];
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        A.set([sa.x, sa.y], v * 2); B.set([sb.x, sb.y], v * 2); Cn.set(corners[k], v * 2);
        G.set([sa.gap, sb.gap], v * 2); S.set([sg.T, sg.D, sg.fA, sg.fB], v * 4); PA.set([sg.stroke, 0], v * 2);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ns * 4 * 3), 3));
    for (const [k, a, sz] of [['aA', A, 2], ['aB', B, 2], ['aCorner', Cn, 2], ['aGap', G, 2], ['aSeg', S, 4], ['aPath', PA, 2]]) lg.setAttribute(k, new THREE.BufferAttribute(a, sz));
    lg.setIndex(idx);
    lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.lineU = { ...this.sky, ...common, uRes: { value: new THREE.Vector2(e.W, e.H) }, uHalf: { value: 6 },
      uLineI: { value: 1.25 }, uGlowI: { value: 0.11 }, uLineCol: { value: new THREE.Vector3(...(opts.lineColor || [1.0, 0.84, 0.6])) },
      uNStrokes: { value: L.nStrokes } };
    this.lineMat = new THREE.ShaderMaterial({ vertexShader: GLSL_COMMON + GLSL_VERT + SKY_GLSL + LINE_VERT, fragmentShader: GLSL_COMMON + LINE_FRAG,
      uniforms: this.lineU, depthTest: true, side: THREE.DoubleSide, ...blending('add') });
    this.lines = new THREE.Mesh(lg, this.lineMat);
    this.lines.frustumCulled = false; this.lines.renderOrder = 105;
    this.object.add(this.lines);

    // dust (built lazily: needs the card's fonts)
    this.dustU = { ...this.sky, ...common, uDustI: { value: 1 }, uTextDist: { value: 6 } };
    this.dust = null;
    this.place();
  }

  /** wait for the card's fonts and build the dust (call from buildFilm/warm; otherwise built on first update) */
  async prepare() {
    const font = (l) => { const st = STYLES[l.style] || STYLES.mono; return `${st.italic ? 'italic ' : ''}${st.weight} ${l.size}px "${st.family}"`; };
    await Promise.all(this.card.lines.map((l) => document.fonts.load(font(l), l.text)));
    this.buildDust();
  }

  /** where the figure sits on the sky. az: deg from −z toward +x; el: deg above horizon; width: angular width (deg) */
  place({ az = 0, el = 34, width = 44, roll = 0, radius = null } = {}) {
    const d2r = Math.PI / 180, a = az * d2r, el2 = el * d2r;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(el2), Math.sin(el2), -Math.cos(a) * Math.cos(el2)).normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    if (roll) { const q = new THREE.Quaternion().setFromAxisAngle(dir, roll * d2r); right.applyQuaternion(q); up.applyQuaternion(q); }
    this.sky.uDir.value.copy(dir); this.sky.uRight.value.copy(right); this.sky.uUp.value.copy(up);
    this.sky.uK.value = 2 * Math.tan(width * d2r / 2) / this.layout.width;
    if (radius) this.sky.uRadius.value = radius;
    this.placement = { az, el, width, roll };
    return this;
  }

  /** world direction (unit vector) of a layout point (x,y) — e.g. to aim the camera at the figure */
  direction(x = 0, y = 0) {
    const s = this.sky;
    return s.uDir.value.clone().addScaledVector(s.uRight.value, x * s.uK.value).addScaledVector(s.uUp.value, y * s.uK.value).normalize();
  }

  /** completion-flare envelope (0..1) for the grade (bloom/streak swell) */
  flare(t) {
    const tf = t - this.timing.flare;
    return tf <= 0 ? 0 : Math.exp(-tf * 1.5) * Math.min(1, tf / 0.07);
  }

  /**
   * params: camera (follow), clock (override the ident's time, e.g. to replay the flare at the end of the film),
   *   intensity (all), stars, lines, dust (multipliers), flareGain (1), size (star sprite scale), twinkle (0.1)
   */
  update(t, params = {}) {
    const p = { intensity: 1, stars: 1, lines: 1, dust: 1, flareGain: 1, size: 1, twinkle: 0.1, follow: true, ...params };
    const time = p.clock ?? t;
    if (!this.dust) this.buildDust();
    if (p.camera && p.follow) { this.object.position.copy(p.camera.position); this.object.updateMatrixWorld(); }
    const [f0, f1] = this.timing.linesFade;
    const lf = 1 - Math.min(1, Math.max(0, (time - f0) / (f1 - f0)));
    const sm = lf * lf * (3 - 2 * lf);
    for (const u of [this.starU, this.lineU, this.dustU]) { u.uTime.value = time; u.uPx.value = this.e.px; u.uFlareGain.value = p.flareGain; }
    this.starU.uStarI.value = p.intensity * p.stars; this.starU.uSize.value = p.size; this.starU.uTwinkle.value = p.twinkle;
    this.lineU.uLineI.value = 0.5 * p.intensity * p.lines * sm; this.lineU.uGlowI.value = 0.045 * p.intensity * p.lines * sm;
    this.lineU.uRes.value.set(this.e.W, this.e.H);
    this.lines.visible = sm > 0.001 && p.lines > 0;
    this.dustU.uDustI.value = p.intensity * p.dust;
    this.dust.visible = time > this.timing.dissolve - 0.6 && time < this.layout.lastIgnite + 0.5;
    return this;
  }

  buildDust() {
    if (this.dust) return;
    const e = this.e, T = this.timing, L = this.layout;
    const samples = sampleCard(e, this.card, this.opts.dustMax ?? 9000, this.opts.letterbox);
    const n = samples.length;
    const r = rng(9091);
    const aStart = new Float32Array(n * 2), aTarget = new Float32Array(n * 2), aHover = new Float32Array(n * 4), aTime = new Float32Array(n * 4),
      aSeed = new Float32Array(n * 4), aW = new Float32Array(n), aCol = new Float32Array(n * 3);
    // weighted CDF over constellation stars ordered by x (brighter stars draw more dust)
    const cs = L.stars.filter((s) => s.kind === 0).sort((a, b) => a.x - b.x);
    const fs = L.stars.filter((s) => s.kind === 1).sort((a, b) => a.x - b.x);
    const cdf = []; let acc = 0;
    for (const s of cs) { acc += 0.35 + s.b; cdf.push(acc); }
    const pick = (q, list, c) => { const v = q * c[c.length - 1]; let i = 0; while (i < c.length - 1 && c[i] < v) i++; return list[i]; };
    const fcdf = fs.map((_, i) => i + 1);
    let minX = Infinity, maxX = -Infinity;
    for (const s of samples) { minX = Math.min(minX, s.nx); maxX = Math.max(maxX, s.nx); }
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const xn = (s.nx - minX) / Math.max(1e-6, maxX - minX);
      const k = r();
      const kind = k < 0.8 ? 0 : k < 0.91 ? 1 : 2;
      const q = Math.min(0.9999, Math.max(0, xn + (r() - 0.5) * 0.14));
      let tx, ty, tIgn, col;
      const tRel = T.dissolve + T.dissolveSpread * xn + T.dissolveErode * Math.pow(r(), 1.3);
      if (kind === 0) { const st = pick(q, cs, cdf); tx = st.x; ty = st.y; tIgn = st.ignite; col = st.col; }
      else if (kind === 1 && fs.length) { const st = pick(q, fs, fcdf); tx = st.x; ty = st.y; tIgn = st.ignite; col = st.col; }
      else { tx = L.minX + (L.maxX - L.minX) * q + (r() - 0.5) * 0.6; ty = 0.5 + (r() - 0.3) * 2.2; tIgn = 1e9; col = [1, 0.93, 0.8]; }
      // arrive a little before the star ignites (proto-star clump), never faster than 0.45 s, never slower than flightMax
      const lead = 0.2 + 0.55 * r();
      const tArr = kind === 2 ? tRel + 1.0 + 0.9 * r() : Math.max(tRel + 0.45, Math.min(tIgn - lead, tRel + T.flightMax * (0.85 + 0.15 * r())));
      aStart.set([s.nx, s.ny], i * 2); aTarget.set([tx, ty], i * 2);
      const hr = kind === 2 ? 0 : (0.015 + 0.11 * Math.pow(r(), 1.6)) * (kind === 1 ? 0.7 : 1);
      aHover.set([r() * Math.PI * 2, hr, (r() < 0.5 ? -1 : 1) * (0.25 + 0.55 * r()), r()], i * 4);
      aTime.set([tRel, tArr, tIgn, kind], i * 4);
      aSeed.set([r(), r(), r(), r()], i * 4);
      aW[i] = 0.9 * s.a; aCol.set(col, i * 3);
    }
    this.dustU.uTextDist.value = 6;
    const mat = new THREE.ShaderMaterial({ vertexShader: GLSL_COMMON + GLSL_VERT + SKY_GLSL + DUST_VERT, fragmentShader: GLSL_COMMON + DUST_FRAG,
      uniforms: this.dustU, depthTest: true, ...blending('add') });
    this.dust = new THREE.Points(pointsGeometry(n, { aStart: [aStart, 2], aTarget: [aTarget, 2], aHover: [aHover, 4], aTime: [aTime, 4], aSeed: [aSeed, 4], aW: [aW, 1], aCol: [aCol, 3] }), mat);
    this.dust.frustumCulled = false; this.dust.renderOrder = 104;
    this.dustCount = n;
    this.object.add(this.dust);
  }
}

/** lay the glyphs out, schedule the strokes, scatter faint field stars */
function buildLayout(glyphs, setting, T, nField, seed) {
  const stars = [], strokes = [];
  let x = 0;
  for (const [key, gap] of setting) {
    x += gap;
    const g = glyphs[key], base = stars.length;
    g.stars.forEach(([sx, sy, mag]) => stars.push({ x: x + sx, y: sy, mag, kind: 0, ignite: 1e9 }));
    for (const st of g.strokes) strokes.push(st.map((i) => base + i));
    x += g.w;
  }
  const width = x, cx = width / 2, cy = 0.5;
  for (const s of stars) { s.x -= cx; s.y -= cy; }
  // stroke schedule
  const times = T.connections;
  const step = times.length > 1 ? times[times.length - 1] - times[times.length - 2] : 0.252078;
  const segs = [];
  strokes.forEach((st, k) => {
    const Tk = k < times.length ? times[k] : times[times.length - 1] + step * (k - times.length + 1);
    const D = T.draw;
    const cum = [0];
    for (let i = 1; i < st.length; i++) cum.push(cum[i - 1] + Math.hypot(stars[st[i]].x - stars[st[i - 1]].x, stars[st[i]].y - stars[st[i - 1]].y));
    const tot = cum[cum.length - 1] || 1;
    st.forEach((si, i) => {
      const f = cum[i] / tot;
      const ti = Tk + D * (1 - Math.sqrt(Math.max(0, 1 - f)));
      stars[si].ignite = Math.min(stars[si].ignite, ti);
    });
    for (let i = 0; i + 1 < st.length; i++) segs.push({ a: st[i], b: st[i + 1], stroke: k, T: Tk, D, fA: cum[i] / tot, fB: cum[i + 1] / tot });
  });
  const lastIgnite = Math.max(...stars.map((s) => s.ignite));
  // field stars: faint, unconnected, kept clear of the figure's stars and lines
  const r = rng(seed);
  const minX = -cx - 0.45, maxX = cx + 0.45;
  const distSeg = (px, py, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
    return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
  };
  const nConst = stars.length;
  let tries = 0;
  while (stars.length < nConst + nField && tries++ < 5000) {
    const fx = minX + (maxX - minX) * r(), fy = -0.95 + 2.75 * r();
    let ok = true;
    for (let i = 0; i < stars.length && ok; i++) if (Math.hypot(stars[i].x - fx, stars[i].y - fy) < (i < nConst ? 0.17 : 0.24)) ok = false;
    for (const s of segs) if (ok && distSeg(fx, fy, stars[s.a], stars[s.b]) < 0.09) ok = false;
    if (!ok) continue;
    stars.push({ x: fx, y: fy, mag: 3.5 + 1.9 * Math.pow(r(), 0.8), kind: 1, ignite: T.fieldIn[0] + (T.fieldIn[1] - T.fieldIn[0]) * r() });
  }
  // brightness, colour, line gaps
  const rc = rng(seed + 7);
  for (const s of stars) {
    s.b = Math.min(1, Math.pow(10, -0.25 * s.mag));
    const k = rc();
    s.col = STAR_COLORS[s.b > 0.5 ? (k < 0.45 ? 1 : k < 0.8 ? 2 : k < 0.92 ? 0 : 3) : Math.floor(rc() * STAR_COLORS.length)];
    s.seed = rc();
    s.gap = 4 + 9 * s.b;
  }
  return { stars, segs, strokes, nStrokes: strokes.length, width, minX: -cx, maxX: cx, lastIgnite };
}

/** draw the card offscreen with the engine's Typography (settled state, no glow) and sample its glyph pixels */
function sampleCard(e, card, maxN, letterbox) {
  const W = e.W, H = e.H;
  const typo = new Typography(W, H);
  const settled = { ...card, t0: 0, t1: 10, fadeIn: 0.001, fadeOut: 0.001, rise: 0, blurIn: false,
    lines: card.lines.map((l) => ({ ...l, type: undefined, delay: 0, fadeIn: 0.001, glow: false, until: undefined })) };
  typo.add(settled);
  const lb = letterbox ?? Math.max(0, (1 - (W / H) / 2.39) / 2);
  typo.render(5, lb);
  const img = typo.ctx.getImageData(0, 0, W, H).data;
  const cand = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = img[(y * W + x) * 4 + 3];
    if (a > 70) cand.push([x, y, a / 255]);
  }
  typo.tex.dispose();
  const keep = Math.min(1, maxN / Math.max(1, cand.length));
  const r = rng(4242);
  const out = [];
  for (const [x, y, a] of cand) {
    if (r() > keep) continue;
    out.push({ nx: ((x + 0.5) / W) * 2 - 1, ny: 1 - ((y + 0.5) / H) * 2, a });
  }
  return out;
}

export { GLYPHS, OPUS_SETTING };
