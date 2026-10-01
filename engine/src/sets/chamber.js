import * as THREE from 'three';
import { cached, paper } from './verona.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import * as A from './ballroom_art.js';
import * as F from './ballroom_fx.js';
import * as C from './chamber_art.js';

// =====================================================================================================
// JULIET'S CHAMBER — shot 3.6, WAITING: one locked-off frame that time-lapses through a year.
// A deep window niche with a leaded casement; a candle on the window seat burns down; outside, a tree
// loses its leaves (ink falls), carries snow, then blossoms; the moon crosses again and again through
// its phases. Everything is driven by `season` (0..1) and `candle` (0..1). Palette: Act III grey-blue,
// the candle is the only warm colour. Juliet (a figure of light, built elsewhere) sits on the ledge.
// World: metres, y up; the room wall is the plane z = 0 facing +z (camera side); window at z = -0.95.
// =====================================================================================================

const R = C.ROOM;
export const CHAMBER = {
  floorY: 0,
  seat: { x0: -R.niche.hw, x1: R.niche.hw, y: R.seatY, zFront: 0.06, zBack: -R.niche.depth },
  ledge: { pos: [-0.62, R.seatY, -0.42], facing: [0.42, 0, -0.91] },   // Juliet sits here, looking out
  candleBase: [0.92, R.seatY, -0.5],
  candleHeight: 0.3,
  window: { z: -R.niche.depth, hw: R.win.hw, y0: R.win.y0, spring: R.win.spring, top: R.win.spring + R.win.hw },
  camera: { pos: [0, 1.74, 4.7], look: [0, 2.36, -1.0], fov: 42 },
};

const SKY_VERT = /* glsl */`varying vec3 vD; uniform vec3 uCenter; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vD = normalize(wp.xyz - uCenter); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SKY_FRAG = /* glsl */`
uniform vec3 uZen, uHor, uMoonC, uMoonD, uCloudC, uCloudS;
uniform float uStars, uMoonR, uPhase, uTime, uCloud, uCloudOff, uStarRot, uOvercast;
uniform sampler2D noiseTex;
varying vec3 vD;
float h3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vD);
  vec3 col = mix(uHor, uZen, pow(clamp(d.y * 1.6 + 0.12, 0., 1.), 0.7));
  // stars wheel slowly about a tilted pole (time-lapse)
  float ca = cos(uStarRot), sa = sin(uStarRot);
  vec3 sd = vec3(d.x * ca - d.z * sa, d.y, d.x * sa + d.z * ca);
  vec3 p = sd * 210.; vec3 c = floor(p); float r = h3(c);
  if (r < 0.05) { vec3 sp = normalize(c + 0.5); float a = acos(clamp(dot(sd, sp), -1., 1.)) * 210.; col += vec3(0.78, 0.84, 1.) * exp(-a * a * 30.) * pow(h3(c + 3.), 5.) * 3.2 * uStars * (0.75 + 0.25 * sin(uTime * 3. + r * 300.)); }
  // moon: correct phase terminator (phase 0 new, 0.5 full), faint earthshine, halo
  vec3 right = normalize(cross(uMoonD, vec3(0., 1., 0.))), up = cross(right, uMoonD);
  vec2 q = vec2(dot(d - uMoonD, right), dot(d - uMoonD, up)) / uMoonR;
  float r2 = dot(q, q);
  float disc = 1. - smoothstep(0.9, 1.0, sqrt(r2));
  float illum = 0.5 - 0.5 * cos(uPhase * 6.2831853);
  vec3 cl = vec3(0.);
  if (disc > 0.) {
    vec3 n = vec3(q, sqrt(max(0., 1. - r2)));
    float ph = uPhase * 6.2831853;
    vec3 sun = vec3(-sin(ph), 0., -cos(ph));
    float lit = smoothstep(-0.06, 0.06, dot(n, sun));
    float mare = 0.8 + 0.2 * texture2D(noiseTex, q * 0.35 + 0.5).r;
    cl = uMoonC * mare * mix(0.025, 1., lit) * disc;
  }
  float md = length(q) * uMoonR;
  vec3 halo = uMoonC * (0.07 * exp(-md / (uMoonR * 2.2)) + 0.025 * exp(-md / (uMoonR * 9.))) * illum;
  // time-lapse clouds racing across, lit from the moon side
  vec2 cp = d.xz / (d.y + 0.25) * 1.3 + vec2(uCloudOff, uCloudOff * 0.3);
  float cn = texture2D(noiseTex, cp * 0.35).r * 0.65 + texture2D(noiseTex, cp * 0.9 + 3.1).g * 0.35;
  float cov = smoothstep(1. - uCloud, 1.25 - uCloud * 0.6, cn) * smoothstep(-0.05, 0.15, d.y);
  cov = max(cov, uOvercast * smoothstep(-0.1, 0.3, d.y) * (0.6 + 0.4 * cn));
  float toMoon = max(0., dot(d, uMoonD));
  vec3 cc = mix(uCloudS, uCloudC, 0.4 + 0.6 * pow(toMoon, 8.)) * (0.4 + 0.6 * illum);
  col = col + halo;
  col = mix(col + cl, cc + cl * 0.15 + halo * 1.5, cov);
  gl_FragColor = vec4(col, 0.);
}`;

// leaves (ink falls), blossoms and their petals (light rises), snow: analytic in season / time
const LEAF_VERT = /* glsl */`
attribute vec4 aL;   // detach season, fall speed, seed, size
uniform float uSeason, uTime, uPx, uMode, uGrow, uWind;
varying float vA; varying float vSpin; varying float vSeed; varying float vShow;
void main(){
  vec3 p = position;
  float sd = aL.z;
  float show = 1.;
  if (uMode < 0.5) {            // autumn leaves: hang, flutter, then fall and tumble
    float u = (uSeason - aL.x) / 0.16;
    if (u > 0.) {
      float fall = u * u * 0.6 + u * 2.2;
      p.y -= fall * (2.2 + aL.y);
      p.x += uWind * (fall * 0.9 + sin(uTime * 2.1 + sd * 30.) * 0.35 * min(u, 1.));
      p.z += sin(uTime * 1.7 + sd * 13.) * 0.3 * min(u, 1.);
    } else { p.x += sin(uTime * 1.3 + sd * 20.) * 0.015; p.y += sin(uTime * 1.7 + sd * 11.) * 0.01; }
    show = step(uSeason, aL.x + 0.6) * step(p.y, 20.);
    vSpin = u > 0. ? uTime * (3. + 4. * sd) + sd * 10. : sd * 6.;
  } else {                      // spring blossom: buds grow and open; some petals drift up and away
    float g = clamp((uGrow - aL.x) / 0.25, 0., 1.);
    show = g;
    float dr = clamp((uGrow - 0.55 - aL.y * 0.4) / 0.4, 0., 1.) * step(0.72, sd);
    p.y += dr * dr * 2.2; p.x += dr * (1.4 + sin(uTime + sd * 9.) * 0.4) * uWind;
    vSpin = sd * 6. + uTime * dr * 3.;
  }
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.);
  vShow = show; vSeed = sd;
  vA = show;
  gl_PointSize = show > 0. ? aL.w * 540. * uPx * projectionMatrix[1][1] / max(0.3, -mv.z) : 0.;
  gl_Position = projectionMatrix * mv;
}`;
const LEAF_FRAG = /* glsl */`
uniform vec3 uInk, uRim, uBloom; uniform float uMode;
varying float vA; varying float vSpin; varying float vSeed; varying float vShow;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float cs = cos(vSpin), sn = sin(vSpin);
  vec2 q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  if (uMode < 0.5) {
    q.x /= max(0.25, abs(cos(vSpin * 0.7)));      // tumbling leaf
    float leaf = length(vec2(q.x * 1.9, q.y)) + abs(q.x) * 0.6 * (1. - abs(q.y));
    float a = 1. - smoothstep(0.75, 0.9, leaf);
    if (a < 0.02) discard;
    vec3 col = uInk + uRim * smoothstep(0.55, 0.85, leaf) * (0.5 + 0.5 * sin(vSeed * 40.));
    gl_FragColor = vec4(col, a * vA);
  } else {
    float ang = atan(q.y, q.x);
    float r = length(q) / (0.72 + 0.28 * abs(cos(ang * 2.5)));
    float a = 1. - smoothstep(0.62, 0.9, r);
    if (a < 0.02) discard;
    vec3 col = uBloom * (0.75 + 0.45 * smoothstep(0.9, 0.2, r)) * (0.55 + 0.45 * smoothstep(0.08, 0.3, length(q)));
    gl_FragColor = vec4(col, a * vA * 0.85);
  }
}`;
const SNOW_VERT = /* glsl */`
attribute vec4 aS;
uniform float uTime, uPx, uSnow, uWind;
varying float vI;
void main(){
  float H = 14.;
  float spd = 1.6 + aS.w * 1.4;
  float y = 9. - mod(aS.y * H + uTime * spd, H);
  vec3 p = vec3(aS.x * 9. - 4.5 + sin(uTime * 0.9 + aS.w * 30.) * 0.25 + uWind * (9. - y) * 0.12, y, -1.4 - aS.z * 11.);
  vec4 mv = viewMatrix * vec4(p, 1.);
  vI = step(aS.w, uSnow) * (0.55 + 0.45 * aS.z);
  gl_PointSize = vI > 0. ? max(1.2 * uPx, 0.035 * 540. * uPx * projectionMatrix[1][1] / max(0.3, -mv.z)) : 0.;
  gl_Position = projectionMatrix * mv;
}`;
const SNOW_FRAG = /* glsl */`
uniform vec3 uCol; varying float vI;
void main(){ vec2 c = gl_PointCoord * 2. - 1.; c.y *= 0.6; float a = exp(-dot(c, c) * 3.5); gl_FragColor = vec4(uCol * vI, a * vI * 0.9); }`;

// the outside tree card: ink silhouette, moon rim, snow settling on upper edges
const TREE_FRAG = /* glsl */`
uniform sampler2D map; uniform vec2 uTexel; uniform vec3 uInk, uRim, uSnowC, uMoonDirT; uniform float uSnow;
varying vec2 vUv;
void main(){
  vec4 m = texture2D(map, vUv);
  if (m.a < 0.3) discard;
  float s = 2. + uSnow * 5.;
  float above = texture2D(map, vUv + vec2(0., uTexel.y * s)).a;
  float side = texture2D(map, vUv + vec2(uTexel.x * 2.5 * sign(uMoonDirT.x), uTexel.y * 2.)).a;
  float snow = clamp((m.a - above) * 1.6, 0., 1.) * smoothstep(0.02, 0.25, uSnow);
  float rim = clamp((m.a - side) * 1.5, 0., 1.);
  vec3 col = uInk + uRim * rim;
  col = mix(col, uSnowC, snow);
  gl_FragColor = vec4(col, smoothstep(0.3, 0.6, m.a));
}`;

export class ChamberSet {
  constructor(e) {
    this.e = e;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CHAMBER.camera.fov, e.W / e.H, 0.05, 2000);
    this.anchors = CHAMBER;
    const rig = this.rig = F.createRig();
    rig.uPx.value = e.px; rig.uLR2.value = 0.004; rig.uMoonOn.value = 1; rig.uWinZ.value = -R.niche.depth + 0.02;
    rig.uWinMode.value = 1; rig.uScat.value = 0.0; rig.uScatT.value = 0.0; rig.uFogD.value = 0.0; rig.uFogC.value.setRGB(0, 0, 0);
    rig.uAmb.value.setRGB(0.012, 0.014, 0.022);
    const P = paper(e), N = cached(e, 'int.noise', () => A.noiseTex());
    this.noise = N;
    const T = (k, f) => cached(e, k, f);
    const tex = { wall: T('ch.wall', () => C.roomWallArt()), curtain: T('ch.curtain', () => C.curtainArt()), win: T('ch.window', () => C.windowArt()),
      tree: T('ch.tree', () => C.treeArt()), roofs: T('ch.roofs', () => C.roofsArt()), plain: T('ch.plain', () => F.plainTex()) };
    this.tex = tex;
    rig.uWinTex.value = tex.win;
    const n = R.niche, wa = tex.win.userData;
    rig.uWinRect.value.set(-n.hw, R.seatY, wa.wm, wa.hm);
    const ink = [0.026, 0.027, 0.033], inkTop = [0.02, 0.021, 0.027];
    const mats = this.mats = [];
    const card = (t, o) => { const m = F.cardMaterial(rig, t, P, N, { ink, inkTop, inkB: ink, rim: [1.0, 0.8, 0.6], perFragment: true, height: 6, ...o }); mats.push(m); return m; };

    // ---- night sky ------------------------------------------------------------------------------------
    this.skyU = { uCenter: { value: new THREE.Vector3() }, uZen: { value: new THREE.Color(0.006, 0.01, 0.024) }, uHor: { value: new THREE.Color(0.03, 0.04, 0.065) },
      uMoonC: { value: new THREE.Color(1.3, 1.32, 1.38) }, uMoonD: { value: new THREE.Vector3(0, 0.2, -1).normalize() }, uCloudC: { value: new THREE.Color(0.11, 0.12, 0.16) }, uCloudS: { value: new THREE.Color(0.02, 0.025, 0.04) },
      uStars: { value: 1 }, uMoonR: { value: 0.013 }, uPhase: { value: 0.5 }, uTime: { value: 0 }, uCloud: { value: 0.3 }, uCloudOff: { value: 0 }, uStarRot: { value: 0 }, uOvercast: { value: 0 }, noiseTex: { value: N } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: false }));
    this.sky.renderOrder = -1000; this.sky.frustumCulled = false;
    this.sky.onBeforeRender = (r, s, cam) => { this.sky.position.copy(cam.position); this.sky.updateMatrixWorld(); this.skyU.uCenter.value.copy(cam.position); };
    this.scene.add(this.sky);

    // ---- distant rooftops (time-lapse windows) ------------------------------------------------------------
    this.roofMat = card(tex.roofs, { rimPx: 1.5, albedo: 0.0, glowK: 0.9, flicker: 0.6, glow: [2.2, 1.2, 0.5], perFragment: false });
    this.roofMat.uniforms.uInk.value.setRGB(0.012, 0.015, 0.024); this.roofMat.uniforms.uInkTop.value.setRGB(0.016, 0.02, 0.032);
    const rg = new THREE.PlaneGeometry(120, 22); rg.translate(0, 11, 0);
    this.roofs = new THREE.Mesh(rg, this.roofMat); this.roofs.position.set(14, -46, -150); this.roofs.renderOrder = -50; this.roofs.frustumCulled = false;
    this.scene.add(this.roofs);

    // ---- the tree outside -----------------------------------------------------------------------------------
    const tr = tex.tree, TR = R.tree;
    this.treeU = { map: { value: tr.tex }, uTexel: { value: new THREE.Vector2(1 / tr.tex.userData.w, 1 / tr.tex.userData.h) }, uInk: { value: new THREE.Color(0.005, 0.006, 0.01) },
      uRim: { value: new THREE.Color(0.08, 0.09, 0.13) }, uSnowC: { value: new THREE.Color(0.32, 0.34, 0.4) }, uMoonDirT: { value: new THREE.Vector3(1, 0, 0) }, uSnow: { value: 0 } };
    const tg = new THREE.PlaneGeometry(TR.w, TR.h); tg.translate(TR.w / 2, TR.h / 2, 0);
    this.tree = new THREE.Mesh(tg, new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: TREE_FRAG, uniforms: this.treeU, transparent: true, depthWrite: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }));
    this.tree.position.set(TR.x - 5.7, TR.y - 1.4, TR.z); this.tree.renderOrder = -40; this.tree.frustumCulled = false;
    this.scene.add(this.tree);
    // leaves + blossoms at the twig anchors
    const twigs = tr.twigs, rl = rng(5353);
    const mkPts = (perTwig, mode) => {
      const pos = [], at = [];
      for (const [x, y, s] of twigs) for (let k = 0; k < perTwig; k++) {
        const ox = (rl() - 0.5) * 0.62 * s, oy = (rl() - 0.5) * 0.5 * s;
        pos.push(this.tree.position.x + x + ox, this.tree.position.y + y + oy, TR.z + (rl() - 0.5) * 0.6);
        if (mode === 0) at.push(0.03 + Math.pow(rl(), 0.8) * 0.3, rl(), rl(), 0.17 + rl() * 0.12);
        else at.push(rl() * 0.5, rl(), rl(), 0.08 + rl() * 0.07);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aL', new THREE.Float32BufferAttribute(at, 4));
      const m = new THREE.ShaderMaterial({ vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, transparent: true, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        uniforms: { uSeason: { value: 0 }, uTime: { value: 0 }, uPx: rig.uPx, uMode: { value: mode }, uGrow: { value: 0 }, uWind: { value: 1 },
          uInk: { value: new THREE.Color(0.006, 0.0065, 0.009) }, uRim: { value: new THREE.Color(0.05, 0.055, 0.075) }, uBloom: { value: new THREE.Color(0.26, 0.2, 0.235) } } });
      const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -30;
      this.scene.add(p);
      return p;
    };
    this.leaves = mkPts(9, 0);
    this.blossom = mkPts(2, 1);
    // snow
    {
      const n2 = 2600, a = new Float32Array(n2 * 4), rs = rng(808);
      for (let i = 0; i < a.length; i++) a[i] = rs();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n2 * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(a, 4));
      this.snowU = { uTime: { value: 0 }, uPx: rig.uPx, uSnow: { value: 0 }, uWind: { value: 1 }, uCol: { value: new THREE.Color(0.32, 0.34, 0.4) } };
      this.snow = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, uniforms: this.snowU, transparent: true, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
      this.snow.frustumCulled = false; this.snow.renderOrder = -20; this.scene.add(this.snow);
    }
    // snow building up on the outer sill (seen through the glass)
    this.sillSnowU = { uSnow: { value: 0 }, uCol: { value: new THREE.Color(0.26, 0.28, 0.34) }, noiseTex: { value: N } };
    const ssg = new THREE.PlaneGeometry(2 * R.win.hw, 0.3); ssg.translate(0, 0.15, 0);
    this.sillSnow = new THREE.Mesh(ssg, new THREE.ShaderMaterial({ uniforms: this.sillSnowU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform float uSnow; uniform vec3 uCol; uniform sampler2D noiseTex; varying vec2 vUv; void main(){ float h = uSnow * (0.45 + 0.3 * texture2D(noiseTex, vec2(vUv.x * 2., 0.3)).r); float a = 1. - smoothstep(h - 0.05, h, vUv.y); if (a < 0.01) discard; gl_FragColor = vec4(uCol * (0.7 + 0.5 * vUv.y / max(h, 0.01)), a); }' }));
    this.sillSnow.position.set(0, R.win.y0 - 0.02, -R.niche.depth - 0.12); this.sillSnow.renderOrder = -10; this.scene.add(this.sillSnow);

    // ---- the room ---------------------------------------------------------------------------------------------
    const W = R.wall;
    const wg = new THREE.PlaneGeometry(W.w, W.h, 48, 24); wg.translate(0, W.h / 2, 0);
    this.wall = new THREE.Mesh(wg, card(tex.wall, { rimPx: 2, albedo: 0.55, giltK: 0.6, size: [W.w, W.h], toneK: 2.4 }));
    this.wall.renderOrder = 20; this.wall.frustumCulled = false; this.scene.add(this.wall);
    const cg = new THREE.PlaneGeometry(1.6, 4.6, 8, 16); cg.translate(0.8, 2.3, 0);
    this.curtain = new THREE.Mesh(cg, card(tex.curtain, { rimPx: 2, albedo: 0.7, toneK: 2.0, size: [1.6, 4.6], wrap: 0.5 }));
    this.curtain.position.set(-n.hw - 0.95, 0.0, 0.12); this.curtain.renderOrder = 25; this.curtain.frustumCulled = false; this.scene.add(this.curtain);
    // casement window at the back of the niche
    const wg2 = new THREE.PlaneGeometry(wa.wm, wa.hm, 16, 20); wg2.translate(0, wa.hm / 2, 0);
    this.window = new THREE.Mesh(wg2, card(tex.win, { rimPx: 1.5, albedo: 0.8, size: [wa.wm, wa.hm], rimAll: 0.1 }));
    this.window.position.set(0, R.seatY, -R.niche.depth); this.window.renderOrder = 15; this.window.frustumCulled = false; this.scene.add(this.window);
    // reveals, soffit, seat (plain paper, lighter: plaster / stone)
    const plain = (o) => card(tex.plain, { albedo: 1.0, rimK: 0, ink: [0.05, 0.05, 0.056], inkTop: [0.05, 0.05, 0.056], paper: 0.6, ...o });
    const revealMat = plain({ size: [1, 3] }), seatMat = plain({ size: [2.7, 1], ink: [0.06, 0.058, 0.06], inkTop: [0.06, 0.058, 0.06] });
    for (const s of [-1, 1]) { // straight reveals (normals are flipped toward the camera by the shader)
      const g = new THREE.PlaneGeometry(R.niche.depth, n.spring - R.seatY, 6, 16); g.translate(R.niche.depth / 2, (n.spring - R.seatY) / 2, 0);
      const m = new THREE.Mesh(g, revealMat); m.rotation.y = Math.PI / 2; m.position.set(s * n.hw, R.seatY, 0);
      m.renderOrder = 18; m.frustumCulled = false; this.scene.add(m);
    }
    { // arch soffit
      const seg = 24, pos = [], uvs = [], nor = [];
      for (let i = 0; i < seg; i++) {
        const a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg;
        const P0 = [n.hw * Math.cos(a0), n.spring + n.hw * Math.sin(a0)], P1 = [n.hw * Math.cos(a1), n.spring + n.hw * Math.sin(a1)];
        const v = (p, z) => [p[0], p[1], z];
        const A0 = v(P0, 0), B0 = v(P0, -R.niche.depth), A1 = v(P1, 0), B1 = v(P1, -R.niche.depth);
        pos.push(...A0, ...B0, ...B1, ...A0, ...B1, ...A1);
        const nn0 = [-Math.cos(a0), -Math.sin(a0), 0], nn1 = [-Math.cos(a1), -Math.sin(a1), 0];
        nor.push(...nn0, ...nn0, ...nn1, ...nn0, ...nn1, ...nn1);
        uvs.push(0, i / seg, 1, i / seg, 1, (i + 1) / seg, 0, i / seg, 1, (i + 1) / seg, 0, (i + 1) / seg);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const m = new THREE.Mesh(g, revealMat); m.renderOrder = 18; m.frustumCulled = false; this.scene.add(m);
    }
    const sg = new THREE.PlaneGeometry(2 * n.hw, R.niche.depth + 0.06, 24, 10); sg.rotateX(-Math.PI / 2); sg.translate(0, R.seatY, -(R.niche.depth - 0.06) / 2);
    this.seat = new THREE.Mesh(sg, seatMat); this.seat.renderOrder = 18; this.seat.frustumCulled = false; this.scene.add(this.seat);
    // frost on the glass (winter): a transparent pane just behind the casement
    this.frostU = { uFrost: { value: 0 }, noiseTex: { value: N }, uCol: { value: new THREE.Color(0.18, 0.2, 0.25) }, uWin: { value: tex.win } };
    const fg = new THREE.PlaneGeometry(wa.wm, wa.hm); fg.translate(0, wa.hm / 2, 0);
    this.frost = new THREE.Mesh(fg, new THREE.ShaderMaterial({ uniforms: this.frostU, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform float uFrost; uniform vec3 uCol; uniform sampler2D noiseTex, uWin; varying vec2 vUv; void main(){ float lead = textureLod(uWin, vUv, 3.2).a; float n = texture2D(noiseTex, vUv * vec2(3.0, 4.0)).g * 0.6 + texture2D(noiseTex, vUv * 11.).r * 0.4; float f = smoothstep(0.82 - uFrost * 0.3, 1.02 - uFrost * 0.25, lead * 1.1 + n * 0.45 + (1. - vUv.y) * 0.18); if (f * uFrost < 0.01) discard; gl_FragColor = vec4(uCol * (0.8 + 0.4 * n), f * uFrost * 0.42); }' }));
    this.frost.position.set(0, R.seatY, -R.niche.depth - 0.03); this.frost.renderOrder = 14; this.scene.add(this.frost);

    // ---- the candle -----------------------------------------------------------------------------------------
    this.buildCandle();
    // dust in the candle and moon light
    {
      const n3 = 260, r3 = rng(77), seeds = new Float32Array(n3 * 4);
      for (let i = 0; i < seeds.length; i++) seeds[i] = r3();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n3 * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
      this.dustMat = F.dustMaterial(rig, { min: [-1.3, R.seatY, -0.9], size: [2.6, 2.8, 1.8], pt: 0.004, rise: 0.03, gain: 0.6, col: [1.0, 0.8, 0.6] });
      this.dust = new THREE.Points(g, this.dustMat); this.dust.frustumCulled = false; this.dust.renderOrder = 110; this.scene.add(this.dust);
    }
    this._v = new THREE.Vector3();
  }

  buildCandle() {
    const rig = this.rig, cb = CHAMBER.candleBase;
    this.candleGroup = new THREE.Group(); this.candleGroup.position.set(...cb); this.scene.add(this.candleGroup);
    // holder: dish + ring handle (ink metal, lit by the flame)
    const metal = F.solidMaterial(rig, paper(this.e), { albedo: 0.6, fresK: 0.6, ink: [0.03, 0.028, 0.026], inkB: [0.03, 0.028, 0.026], wrap: 0.3 });
    const dish = F.withCol(new THREE.CylinderGeometry(0.075, 0.06, 0.018, 20, 1).toNonIndexed(), [1, 1, 1]); dish.translate(0, 0.009, 0); dish.computeVertexNormals();
    const ring = F.withCol(new THREE.TorusGeometry(0.03, 0.006, 6, 16).toNonIndexed(), [1, 1, 1]); ring.rotateY(Math.PI / 2); ring.translate(0.085, 0.012, 0); ring.computeVertexNormals();
    this.candleGroup.add(new THREE.Mesh(dish, metal), new THREE.Mesh(ring, metal));
    // wax: unit cylinder scaled to the current height; glows from within near the flame
    this.waxU = { ...rig, uH: { value: 0.3 }, uWax: { value: new THREE.Color(0.55, 0.47, 0.36) }, uGlow: { value: new THREE.Color(1.6, 0.7, 0.22) }, uLit: { value: 1 } };
    const wg = new THREE.CylinderGeometry(0.019, 0.021, 1, 16, 8); wg.translate(0, 0.5, 0);
    this.wax = new THREE.Mesh(wg, new THREE.ShaderMaterial({ uniforms: this.waxU,
      vertexShader: `${F.RIG_GLSL}\nuniform float uH; varying vec3 vW; varying vec3 vN; varying float vY; void main(){ vec3 p = position; p.y *= uH; vY = p.y; vec4 wp = modelMatrix * vec4(p, 1.); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${F.RIG_GLSL}\nuniform float uH, uLit; uniform vec3 uWax, uGlow; varying vec3 vW; varying vec3 vN; varying float vY; void main(){ vec3 N = normalize(vN); vec3 d, e, l; hallLight(vW, N, 0.6, d, e, l); float top = uH - vY; float sss = exp(-top * 28.) * uLit; vec3 col = uWax * (d * 0.35 + uAmb * 8. + uMoonCol * moonPool(vW) * max(0., dot(N, uMoonDir)) * 1.5) + uGlow * sss * 0.9; gl_FragColor = vec4(col, 1.); }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor }));
    this.wax.position.y = 0.018; this.candleGroup.add(this.wax);
    // wax pool / drips on the dish (grows as it burns)
    this.pool = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.008, 18, 1), this.wax.material);
    this.pool.position.y = 0.02; this.candleGroup.add(this.pool);
    // flame + halo (points), smoke wisp after it gutters out
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)); fg.setAttribute('aSeed', new THREE.Float32BufferAttribute([0.37], 1));
    this.flameMat = F.flameMaterial(rig, { size: 0.085, core: [6, 3.2, 1.1], halo: [1.4, 0.6, 0.18] });
    this.flame = new THREE.Points(fg, this.flameMat); this.flame.frustumCulled = false; this.flame.renderOrder = 120; this.candleGroup.add(this.flame);
    // the flame's reflection in the window glass
    const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)); rgeo.setAttribute('aSeed', new THREE.Float32BufferAttribute([0.61], 1));
    this.reflMat = F.flameMaterial(rig, { size: 0.06, core: [1.2, 0.62, 0.22], halo: [0.35, 0.15, 0.05] });
    this.refl = new THREE.Points(rgeo, this.reflMat); this.refl.frustumCulled = false; this.refl.renderOrder = 119; this.scene.add(this.refl);
    // smoke: points along a curling rising path
    const sn = 90, sp = new Float32Array(sn * 3), ss = new Float32Array(sn);
    for (let i = 0; i < sn; i++) ss[i] = i / sn;
    const sgm = new THREE.BufferGeometry(); sgm.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sgm.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
    this.smokeU = { uTime: { value: 0 }, uPx: rig.uPx, uOn: { value: 0 }, uAge: { value: 0 } };
    this.smoke = new THREE.Points(sgm, new THREE.ShaderMaterial({ uniforms: this.smokeU, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: `attribute float aSeed; uniform float uTime, uPx, uOn, uAge; varying float vA; void main(){ float u = aSeed; float h = u * 0.9 * min(1., uAge * 1.5 + 0.2); vec3 p = position + vec3(sin(h * 9. - uTime * 2.) * 0.03 * h * 4., h, cos(h * 7. - uTime * 1.6) * 0.02 * h * 4.); vec4 mv = modelViewMatrix * vec4(p, 1.); vA = uOn * (1. - u) * smoothstep(0., 0.05, u) * 0.5; gl_PointSize = (0.01 + 0.05 * u) * 540. * uPx * projectionMatrix[1][1] / max(0.2, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord * 2. - 1.; float a = exp(-dot(c, c) * 3.) * vA; gl_FragColor = vec4(vec3(0.12, 0.125, 0.14), a); }' }));
    this.smoke.frustumCulled = false; this.smoke.renderOrder = 121; this.candleGroup.add(this.smoke);
  }

  /** flame (wick) position for a given burn amount: useful for the figure engineer's lighting */
  candleFlame(burn) {
    const h = CHAMBER.candleHeight * (1 - 0.9 * clamp(burn));
    const b = CHAMBER.candleBase;
    return [b[0], b[1] + 0.018 + h + 0.03, b[2]];
  }

  /**
   * update(t, params) — params:
   *   season   0..1  the year: 0-0.32 autumn (leaves fall), 0.32-0.66 winter (snow, frost), 0.66-1 spring (blossom)
   *   candle   0..1  burn (0 = new taper, ~0.93 guttering, 1 = out, smoke)
   *   light    overall multiplier (fades);  moonCrossings (default 4); moonCycles (phase cycles, default 1.5)
   *   wind     drift multiplier (default 1); stars (default 1); extraLights [{pos, color, intensity}] (Juliet's glow)
   */
  update(t, p = {}) {
    const rig = this.rig, e = this.e;
    const s = clamp(p.season ?? 0), burn = clamp(p.candle ?? 0), light = p.light ?? 1, wind = p.wind ?? 1;
    rig.uTime.value = t; rig.uPx.value = e.px;
    // ---- seasons ---------------------------------------------------------------------------------------
    const autumn = 1 - smoothstep(0.26, 0.36, s), winter = smoothstep(0.3, 0.4, s) * (1 - smoothstep(0.6, 0.7, s)), spring = smoothstep(0.64, 0.8, s);
    this.leaves.material.uniforms.uSeason.value = s; this.leaves.material.uniforms.uTime.value = t; this.leaves.material.uniforms.uWind.value = wind;
    this.leaves.visible = s < 0.6;
    this.blossom.material.uniforms.uGrow.value = smoothstep(0.66, 0.98, s); this.blossom.material.uniforms.uTime.value = t; this.blossom.material.uniforms.uWind.value = wind;
    this.blossom.visible = s > 0.66;
    this.snowU.uSnow.value = winter; this.snowU.uTime.value = t; this.snowU.uWind.value = wind; this.snow.visible = winter > 0.01;
    const settle = smoothstep(0.34, 0.55, s) * (1 - smoothstep(0.62, 0.72, s));
    this.treeU.uSnow.value = settle; this.sillSnowU.uSnow.value = settle; this.sillSnow.visible = settle > 0.01;
    this.frostU.uFrost.value = smoothstep(0.36, 0.5, s) * (1 - smoothstep(0.6, 0.7, s));
    // ---- moon: crossing the window again and again, cycling through its phases ---------------------------
    const nC = p.moonCrossings ?? 4, cyc = p.moonCycles ?? 1.5;
    const k = s * nC, f = k - Math.floor(k);
    const az = lerp(0.3, -0.3, f), el = 0.03 + 0.24 * Math.sin(Math.PI * f);
    const md = this._v.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    const phase = ((s * cyc + 0.5) % 1 + 1) % 1;               // 0.5 = full
    const illum = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    this.skyU.uMoonD.value.copy(md); this.skyU.uPhase.value = phase; this.skyU.uTime.value = t;
    this.skyU.uStarRot.value = s * 0.6; this.skyU.uCloudOff.value = s * 7.0;
    this.skyU.uCloud.value = 0.28 + 0.25 * winter - 0.12 * spring; this.skyU.uOvercast.value = 0.25 * winter;
    this.skyU.uStars.value = (p.stars ?? 1) * (1 - 0.4 * winter);
    this.skyU.uZen.value.setRGB(0.006, 0.01, 0.024).lerp(new THREE.Color(0.016, 0.018, 0.026), winter);
    this.skyU.uHor.value.setRGB(0.03, 0.04, 0.065).lerp(new THREE.Color(0.06, 0.065, 0.08), winter);
    rig.uMoonDir.value.copy(md);
    const moonUp = smoothstep(0.0, 0.06, el);
    rig.uMoonCol.value.setRGB(0.1, 0.115, 0.17).multiplyScalar(light * (0.25 + 0.75 * illum) * moonUp * (1 + 0.6 * winter));
    this.treeU.uMoonDirT.value.copy(md);
    this.treeU.uRim.value.setRGB(0.07, 0.08, 0.115).multiplyScalar(0.3 + 0.7 * illum);
    // ---- candle -------------------------------------------------------------------------------------------
    const h = CHAMBER.candleHeight * (1 - 0.9 * burn);
    const out = smoothstep(0.93, 0.985, burn);
    const gutter = smoothstep(0.85, 0.95, burn) * (1 - out);
    this.waxU.uH.value = h; this.waxU.uLit.value = 1 - out;
    this.pool.scale.set(1 + burn * 0.4, 1 + burn * 3, 1 + burn * 0.4);
    const fy = 0.018 + h + 0.032;
    this.flame.position.set(0, fy, 0);
    const flick = 1 - gutter * 0.5 * (0.5 + 0.5 * Math.sin(t * 13.0) * Math.sin(t * 5.3));
    this.flameMat.uniforms.uGain.value = (1 - out) * flick * light;
    this.flame.visible = out < 0.999;
    const cpos = this.candleFlame(burn);
    rig.uLP.value[0].set(cpos[0], cpos[1] + 0.01, cpos[2]);
    const cf = 1 + 0.06 * Math.sin(t * 9.1) * Math.sin(t * 4.3 + 1.0) + 0.03 * Math.sin(t * 23.0);
    rig.uLC.value[0].set(1.0, 0.56, 0.22).multiplyScalar(1.5 * (1 - out) * flick * cf * light);
    // reflection of the flame in the glass (mirror about the window plane)
    const zw = -R.niche.depth - 0.03;
    this.refl.position.set(cpos[0], cpos[1], 2 * zw - cpos[2]);
    this.reflMat.uniforms.uGain.value = (1 - out) * flick * light * 0.8;
    this.smokeU.uOn.value = out; this.smokeU.uTime.value = t; this.smokeU.uAge.value = clamp((burn - 0.95) / 0.05);
    this.smoke.position.set(0, fy - 0.02, 0); this.smoke.visible = out > 0.01;
    // extra lights (Juliet's glow)
    for (let i = 0; i < 3; i++) {
      const L = (p.extraLights || [])[i];
      if (L) { rig.uLP.value[1 + i].set(...L.pos); rig.uLC.value[1 + i].set(...L.color).multiplyScalar(L.intensity ?? 1); }
      else rig.uLC.value[1 + i].set(0, 0, 0);
    }
    for (let i = 4; i < F.NL; i++) rig.uLC.value[i].set(0, 0, 0);
    rig.uAmb.value.setRGB(0.03, 0.034, 0.05).multiplyScalar(light * (0.55 + 0.45 * illum * moonUp) * (1 + 0.5 * winter));
    // distant windows blink on and off as nights pass (time-lapse)
    this.roofMat.uniforms.uFlicker.value = 0.95; this.roofMat.uniforms.uTime.value = 40 + s * 260;
    this.roofMat.uniforms.uGlowK.value = 0.45 * light;
    for (const m of this.mats) m.uniforms.uTime.value = t;
    this.dustMat.uniforms.uGain.value = 0.5 * light;
  }

  /** the locked-off composition for 3.6 */
  frameDefault(camera = this.camera) {
    const c = CHAMBER.camera;
    camera.fov = c.fov; camera.updateProjectionMatrix();
    camera.position.set(...c.pos); camera.lookAt(...c.look);
    return camera;
  }
}
