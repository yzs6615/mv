import * as THREE from 'three';
import { renderSet } from '../core/director.js';
import { track, ease, clamp, smoothstep, lerp } from '../core/math.js';
import { Art, paperTexture } from '../fx/art.js';
import { LightFigure, waltzPair, holdHands, runPair, embracePair, HandsCloseUp } from '../fx/figure.js';

// Bench film for the figures of light. Render with:
//   node render/render.mjs --params film=./tests/figure_bench.js --times 1,3,5 --sheet fig_a --scale 0.5

const cached = (e, k, f) => { if (!e.cache.has(k)) e.cache.set(k, f()); return e.cache.get(k); };

function rectArt(w, h, ppm = 24) { const a = new Art(w, h, ppm, { rimPx: 0 }); a.rect(0, 0, w, h); return a.pack(); }

// dark paper cyclorama: a seamless cylinder + floor of ink-dark paper (writes depth, erases the colour-keep mask)
const CYC_VERT = /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CYC_FRAG = /* glsl */`
uniform sampler2D paperTex; uniform vec3 uInk, uTop, uFloor, uPool; uniform float uPoolR;
varying vec3 vW;
void main(){
  float pf = texture2D(paperTex, vW.xz * 0.05 + vW.y * 0.04 + vec2(atan(vW.z, vW.x) * 2.0, 0.)).r;
  vec3 col = vW.y > 0.002 ? mix(uInk, uTop, smoothstep(0., 9., vW.y)) : uFloor;
  // soft pool of light on the floor around the origin (studio feel)
  float r = length(vW.xz);
  col += uPool * exp(-r * r / (uPoolR * uPoolR)) * (vW.y > 0.002 ? exp(-vW.y * 0.5) * 0.5 : 1.);
  col *= 0.8 + 0.4 * pf;
  gl_FragColor = vec4(col, 1.);
}`;

class BenchSet {
  constructor(e) {
    this.e = e;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, e.W / e.H, 0.03, 400);
    const P = cached(e, 'paperTex', () => paperTexture());
    this.cycU = { paperTex: { value: P }, uInk: { value: new THREE.Color(0.012, 0.012, 0.018) }, uTop: { value: new THREE.Color(0.004, 0.004, 0.007) },
      uFloor: { value: new THREE.Color(0.01, 0.0095, 0.012) }, uPool: { value: new THREE.Color(0.012, 0.011, 0.014) }, uPoolR: { value: 4 } };
    const mat = new THREE.ShaderMaterial({ vertexShader: CYC_VERT, fragmentShader: CYC_FRAG, uniforms: this.cycU, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 30, 96, 1, true), mat); wall.position.y = 15; wall.renderOrder = 1;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14.5, 96), mat); floor.rotation.x = -Math.PI / 2; floor.renderOrder = 2;
    this.scene.add(wall, floor);
    this.wall = wall;
    this.romeo = new LightFigure(e, { who: 'romeo' });
    this.juliet = new LightFigure(e, { who: 'juliet' });
    this.scene.add(this.romeo.object, this.juliet.object);
    // props: a ring of light (attached to Romeo's 'ringR' site), a window with a ledge (ink-black paper)
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8), transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 8, 40), ringMat); this.ring.renderOrder = 120;
    this.scene.add(this.ring);
    const ink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.006, 0.006, 0.009) });
    ink.blending = THREE.CustomBlending; ink.blendSrc = THREE.OneFactor; ink.blendDst = THREE.ZeroFactor; ink.blendSrcAlpha = THREE.ZeroFactor; ink.blendDstAlpha = THREE.ZeroFactor;
    const W = (this.window = new THREE.Group());
    const box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ink); m.position.set(x, y, z); m.renderOrder = 3; W.add(m); };
    // wall to her right with a tall arched-ish window opening (x = -0.48), seat below
    box(0.12, 0.55, 3.2, -0.5, 0.275, 0);          // wall under the sill
    box(0.12, 1.0, 1.2, -0.5, 2.4, 0);             // above the window
    box(0.12, 2.9, 1.0, -0.5, 1.45, -1.1);         // wall left of the window
    box(0.12, 2.9, 1.0, -0.5, 1.45, 1.1);          // wall right
    box(0.08, 1.35, 0.05, -0.47, 1.22, 0.0);       // mullion
    box(0.08, 0.05, 1.2, -0.47, 1.25, 0.0);        // transom
    box(1.0, 0.5, 1.1, 0.0, 0.25, -0.05);          // window seat
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.07, 0.13) }));
    glow.material.blending = THREE.CustomBlending; glow.material.blendSrc = THREE.OneFactor; glow.material.blendDst = THREE.ZeroFactor; glow.material.blendSrcAlpha = THREE.ZeroFactor; glow.material.blendDstAlpha = THREE.ZeroFactor;
    glow.rotation.y = Math.PI / 2; glow.position.set(-0.56, 1.22, 0); glow.renderOrder = 3; W.add(glow);
    this.scene.add(W);
    const P2 = (this.props2 = new THREE.Group());
    const box2 = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ink); m.position.set(x, y, z); m.renderOrder = 3; P2.add(m); return m; };
    this.wallBox = box2(3.0, 6.0, 0.2, 0, 3.0, 0.42);      // wall to climb (face at z = 0.32)
    this.balcony = box2(1.6, 2.6, 1.2, 0, 1.3, -1.9);      // balcony block (top at y = 2.6)
    this.scene.add(P2);
  }
  reset() {
    for (const f of [this.romeo, this.juliet]) { f.object.position.set(0, 0, 0); f.object.rotation.set(0, 0, 0); f.object.visible = true; }
    this.ring.visible = false; this.window.visible = false; this.wall.visible = true;
    this.wallBox.visible = false; this.balcony.visible = false;
  }
}

class BustSet {
  constructor(e) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, e.W / e.H, 0.02, 100);
    this.romeo = new LightFigure(e, { who: 'romeo', part: 'bust', count: 42000 });
    this.juliet = new LightFigure(e, { who: 'juliet', part: 'bust', count: 42000 });
    this.scene.add(this.romeo.object, this.juliet.object);
  }
}

class HandsSet {
  constructor(e) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, e.W / e.H, 0.02, 100);
    this.hands = new HandsCloseUp(e);
    this.scene.add(this.hands.object);
  }
}

export async function buildFilm(e) {
  const D = e.director;
  const bench = (x) => new BenchSet(x);
  const grade = { bloom: 0.75, bloomThreshold: 0.75, vignette: 0.45, grain: 0.03, contrast: 0.12, aspect: 2.39 };

  // ---- 1. turntable: both figures side by side, rotating slowly
  D.add({
    id: 'turntable', start: 0, end: 8, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t;
      s.reset();
      const yaw = ctx.lt * 0.6;
      s.romeo.object.position.set(-0.55, 0, 0); s.romeo.object.rotation.y = yaw;
      s.juliet.object.position.set(0.55, 0, 0); s.juliet.object.rotation.y = yaw;
      s.romeo.update(t, 'stand', { ground: 0.5 });
      s.juliet.update(t, 'stand', { ground: 0.5 });
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(0, 1.0, 5.4); c.lookAt(0, 0.92, 0);
      renderSet(ctx, target, s, c);
    },
  });

  // ---- 2/3. portraits (anatomy check): one figure, closer, slow turn
  const portrait = (id, start, who) => D.add({
    id, start, end: start + 4, setName: 'bench', setFactory: bench, grade: { ...grade, aspect: 1.78 },
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t;
      s.reset();
      const f = who === 'romeo' ? s.romeo : s.juliet, o = who === 'romeo' ? s.juliet : s.romeo;
      o.object.visible = false;
      f.object.rotation.y = -0.9 + ctx.lt * 0.45 + Math.max(0, ctx.lt - 3) * 1.8;
      f.update(t, 'stand', { ground: 0.5 });
      c.fov = 26; c.updateProjectionMatrix();
      c.position.set(0, 1.1, 4.2); c.lookAt(0, 0.88 * f.height / 1.8, 0);
      renderSet(ctx, target, s, c);
    },
  });
  const grade169 = { ...grade, aspect: 1.78 };
  portrait('portraitR', 8, 'romeo');
  portrait('portraitJ', 12, 'juliet');

  // ---- 4. walk cycles in profile (camera tracks)
  D.add({
    id: 'walk', start: 16, end: 22, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      const vr = 1.3, vj = 1.05;
      s.romeo.object.position.set(-3 + vr * lt, 0, 0.4); s.romeo.object.rotation.y = Math.PI / 2;
      s.juliet.object.position.set(-2.1 + vj * lt, 0, -0.9); s.juliet.object.rotation.y = Math.PI / 2;
      s.romeo.update(t, { preset: 'walk', speed: vr }, { ground: 0.4 });
      s.juliet.update(t, { preset: 'walk', speed: vj }, { ground: 0.4 });
      const cx = -2.55 + 1.17 * lt;
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(cx, 1.0, 6.2); c.lookAt(cx, 0.9, 0);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 5. run in profile
  D.add({
    id: 'run', start: 22, end: 26, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      const vr = 3.6, vj = 3.2;
      s.romeo.object.position.set(-5 + vr * lt, 0, 0.4); s.romeo.object.rotation.y = Math.PI / 2;
      s.juliet.object.position.set(-4.4 + vj * lt, 0, -0.9); s.juliet.object.rotation.y = Math.PI / 2;
      s.romeo.update(t, { preset: 'run', speed: vr }, { ground: 0.4 });
      s.juliet.update(t, { preset: 'run', speed: vj }, { ground: 0.4 });
      const cx = -4.7 + 3.4 * lt;
      c.fov = 32; c.updateProjectionMatrix();
      c.position.set(cx, 1.0, 6.4); c.lookAt(cx, 0.9, 0);
      renderSet(ctx, target, s, c);
    },
  });

  // ---- 6. waltz pair with an orbiting camera
  D.add({
    id: 'waltz', start: 26, end: 34, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      const W = waltzPair(s.romeo, s.juliet, t, { center: [0, 0, 0], radius: 0.9, speed: 0.4, spin: -2.3, t0: 26 }, { ground: 0.35 }, { ground: 0.35 });
      const a = lt * 0.35 + 0.4;
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(Math.sin(a) * 6.6, 1.45, Math.cos(a) * 6.6); c.lookAt(W.center[0] * 0.5, 0.9, W.center[2] * 0.5);
      renderSet(ctx, target, s, c);
    },
  });

  // ---- 7. kneel + reach: he offers a ring of light, she reaches for his hand
  D.add({
    id: 'kneel', start: 34, end: 40, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.romeo.object.position.set(-0.42, 0, 0); s.romeo.object.rotation.y = Math.PI / 2;
      s.juliet.object.position.set(0.5, 0, -0.05); s.juliet.object.rotation.y = -Math.PI / 2;
      const offer = smoothstep(0.2, 2.0, lt);
      s.romeo.update(t, { preset: 'kneel', offer, lookAt: [0.5, 1.5, -0.05] }, { ground: 0.4 });
      const ring = s.romeo.getJointWorld('ringR');
      s.ring.visible = true; s.ring.position.copy(ring); s.ring.rotation.set(Math.PI / 2, 0, 0);
      const reach = smoothstep(2.2, 4.5, lt);
      s.juliet.update(t, { preset: 'reach', arm: 'L', target: [ring.x + 0.02, ring.y + 0.03, ring.z], amount: reach, palm: 'down', lookAt: [-0.42, 1.1, 0] }, { ground: 0.4 });
      c.fov = 28; c.updateProjectionMatrix();
      c.position.set(0.15, 1.05, 4.1); c.lookAt(0.05, 0.85, 0);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 8. Juliet sitting at a window ledge: hands in lap, then one hand on the glass
  D.add({
    id: 'window', start: 40, end: 46, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.romeo.object.visible = false; s.window.visible = true;
      const m = smoothstep(2.0, 4.2, lt);
      const lap = { preset: 'sit', seat: 0.5, hands: 'lap', headYaw: -0.55, slump: 0.6 };
      const glass = { preset: 'sit', seat: 0.5, hands: 'glass', arm: 'R', glass: [-0.43, 1.18, 0.08], glassNormal: [1, 0, 0], headYaw: -0.75, slump: 0.3, lean: 0.4 };
      s.juliet.update(t, { from: lap, to: glass, m }, { ground: 0.3 });
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(1.9, 1.15, 2.7); c.lookAt(-0.12, 0.88, 0);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 9. hands close-up (1.7): fingertips meet at t = 50.5, ripple of light
  D.add({
    id: 'hands', start: 46, end: 54, setName: 'hands', setFactory: (x) => new HandsSet(x),
    grade: { ...grade, bloom: 0.8, vignette: 0.6 },
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.hands.object.position.set(0, 0, 0);
      s.hands.frame(c, { dist: 0.6 - lt * 0.012, height: -0.02, side: 0.02 * Math.sin(lt * 0.3), fov: 30 });
      s.hands.update(t, { contactTime: 50.5, approach: 4.0, camera: c, aperture: 0.007 });
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 10. dissolve: Romeo's light rises away
  D.add({
    id: 'dissolve', start: 54, end: 58, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.juliet.object.visible = false;
      s.romeo.object.rotation.y = 0.35;
      s.romeo.update(t, { preset: 'lookUp', amount: 0.6 }, { dissolve: smoothstep(0.3, 3.6, lt), ground: 0.4 });
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(0, 1.3, 5.2); c.lookAt(0, 1.25, 0);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 11. collapse: the lovers merge into one white-gold point of light which then rises (to become a star)
  D.add({
    id: 'collapse', start: 58, end: 64, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.romeo.object.position.set(-0.36, 0, 0); s.romeo.object.rotation.y = Math.PI / 2;
      s.juliet.object.position.set(0.36, 0, 0); s.juliet.object.rotation.y = -Math.PI / 2;
      const k = smoothstep(0.5, 4.0, lt);
      const rise = smoothstep(4.0, 6.0, lt) * 1.2;
      const pt = [0, 1.25 + rise, 0];
      const look = { collapse: { point: pt, k, radius: 0.06 }, color: 'union', colorMix: smoothstep(0.3, 3.0, lt), ground: 0.4 * (1 - k) };
      holdHands(s.romeo, s.juliet, t, { poseA: 'stand', poseB: 'stand', lookA: look, lookB: look, height: 0.62 });
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(0, 1.35, 5.0); c.lookAt(0, 1.2, 0);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 12. readability at small scale: figures ~40 px tall (full res), walking hand in hand
  D.add({
    id: 'tiny', start: 64, end: 68, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.romeo.object.position.set(-1.0 + 1.1 * lt, 0, 0); s.romeo.object.rotation.y = Math.PI / 2;
      s.juliet.object.position.set(-1.0 + 1.1 * lt, 0, -0.6); s.juliet.object.rotation.y = Math.PI / 2;
      s.wall.visible = false;
      holdHands(s.romeo, s.juliet, t, { poseA: { preset: 'walk', speed: 1.1 }, poseB: { preset: 'walk', speed: 1.1, phase: 0.5 } });
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(1.2, 6, 85); c.lookAt(1.2, 1.5, 0);
      renderSet(ctx, target, s, c);
    },
  });

  // ---- 13. Juliet turns (1.5): she turns to face us, skirt flaring; rack focus from Romeo (foreground) to her
  D.add({
    id: 'turn', start: 68, end: 74, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      c.fov = 28; c.updateProjectionMatrix();
      c.position.set(-2.0, 1.6, 5.6); c.lookAt(0.3, 1.0, -0.4);
      const u = smoothstep(1.0, 3.2, lt);
      const yaw = Math.PI * (1 - u) + 0.2;
      const rate = -Math.PI * (smoothstep(1.0, 3.2, lt + 0.02) - smoothstep(1.0, 3.2, lt - 0.02)) / 0.04;
      const focus = c.position.distanceTo(new THREE.Vector3(0.3, 1.4, -0.4)) * smoothstep(2.6, 4.0, lt) + c.position.distanceTo(new THREE.Vector3(-1.35, 1.5, 3.0)) * (1 - smoothstep(2.6, 4.0, lt));
      const dof = { focus, aperture: 0.03 };
      s.romeo.object.position.set(-1.35, 0, 3.0); s.romeo.object.rotation.y = Math.PI * 0.85;
      s.romeo.update(t, { preset: 'stand', lookAt: [0.3, 1.5, -0.4] }, dof);
      s.juliet.object.position.set(0.3, 0, -0.4);
      s.juliet.update(t, { preset: 'turn', yaw, rate, lookAt: lt > 2.6 ? [-1.35, 1.6, 3.0] : undefined, lookAmount: smoothstep(2.6, 3.4, lt) }, { ...dof, ground: 0.4 });
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 14. running hand in hand (2.5)
  D.add({
    id: 'runPair', start: 74, end: 79, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      const path = (tau) => ({ position: [-7 + 3.2 * (tau - 74), 0, 0.2 * Math.sin((tau - 74) * 0.7)], yaw: Math.PI / 2 + 0.14 * Math.cos((tau - 74) * 0.7) * 0.2 });
      const mid = runPair(s.romeo, s.juliet, t, { path, t0: 74, lookR: { ground: 0.3 }, lookJ: { ground: 0.3 } });
      const cx = path(t).position[0] + 0.4;
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(cx, 1.05, 6.0); c.lookAt(cx, 0.95, 0);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 15. climb (2.3): Romeo climbs a wall, the camera rises with him
  D.add({
    id: 'climb', start: 79, end: 84, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.juliet.object.visible = false; s.wallBox.visible = true;
      const sp = 0.32;
      s.romeo.object.position.set(0, 0.2 + sp * lt, 0); s.romeo.object.rotation.y = 0;
      s.romeo.update(t, { preset: 'climb', speed: sp, wallZ: 0.3 }, {});
      c.fov = 30; c.updateProjectionMatrix();
      const cy = 1.4 + sp * lt;
      c.position.set(2.4, cy - 0.2, -2.6); c.lookAt(0, cy, 0.1);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 16. embrace (and a lean of her head)
  D.add({
    id: 'embrace', start: 84, end: 89, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      embracePair(s.romeo, s.juliet, t, { center: [0, 0, 0], yaw: Math.PI / 2, dist: 0.26 - 0.06 * smoothstep(0, 2, lt), amount: smoothstep(0.2, 2.2, lt), lookR: { ground: 0.4 }, lookJ: { ground: 0.4 } });
      const a = -0.15 + lt * 0.08;
      c.fov = 28; c.updateProjectionMatrix();
      c.position.set(Math.sin(a) * 3.6, 1.5, Math.cos(a) * 3.6); c.lookAt(0, 1.15, 0);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 17. waiting (3.6): Juliet stands at the window, hand on the frame; her light dims and flickers
  D.add({
    id: 'dim', start: 89, end: 94, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.romeo.object.visible = false; s.window.visible = true;
      s.juliet.object.position.set(-0.12, 0, 0.75); s.juliet.object.rotation.y = -0.35;
      s.juliet.update(t, { preset: 'standWindow', arm: 'R', target: [-0.44, 1.2, 0.58], frameNormal: [1, 0, 0], headYaw: -0.7 }, { dim: smoothstep(0.5, 4.5, lt) * 0.85, ground: 0.3 });
      c.fov = 30; c.updateProjectionMatrix();
      c.position.set(2.2, 1.3, 2.4); c.lookAt(-0.1, 1.05, 0.1);
      renderSet(ctx, target, s, c);
    },
  });
  // ---- 18. balcony (2.1/2.2): he looks up from below, she looks down from above
  D.add({
    id: 'balcony', start: 94, end: 98, setName: 'bench', setFactory: bench, grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      s.reset();
      s.balcony.visible = true;
      s.juliet.object.position.set(0, 2.6, -1.6); s.juliet.object.rotation.y = 0;
      s.juliet.update(t, { preset: 'lookDown', amount: 0.8, lookAt: [0.2, 1.6, 1.4] }, { ground: 0.4 });
      s.romeo.object.position.set(0.2, 0, 1.4); s.romeo.object.rotation.y = Math.PI;
      s.romeo.update(t, { preset: 'lookUp', amount: 1, lookAt: [0, 4.1, -1.6] }, { ground: 0.4 });
      c.fov = 34; c.updateProjectionMatrix();
      c.position.set(6.2, 2.6, 3.8); c.lookAt(0, 2.45, -0.4);
      renderSet(ctx, target, s, c);
    },
  });

  // ---- 20. colour-keep mask check: the world fully desaturated, the lovers keep their colour (grade keepColor)
  D.add({
    id: 'keep', start: 102, end: 104, setName: 'bench', setFactory: bench,
    grade: { ...grade, sat: 0.0, keepColor: 1, aspect: 2.39 },
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t;
      s.reset(); s.window.visible = true;
      s.cycU.uPool.value.setRGB(0.05, 0.035, 0.02); // a warm pool on the paper floor (should turn grey)
      s.romeo.object.position.set(0.9, 0, 0.6); s.romeo.object.rotation.y = -0.6;
      s.juliet.object.position.set(1.5, 0, 0.2); s.juliet.object.rotation.y = -0.9;
      s.romeo.update(t, 'stand', { ground: 0.5 }); s.juliet.update(t, 'stand', { ground: 0.5 });
      c.fov = 30; c.updateProjectionMatrix(); c.position.set(1.0, 1.2, 5.5); c.lookAt(0.8, 1.0, 0);
      renderSet(ctx, target, s, c);
      s.cycU.uPool.value.setRGB(0.012, 0.011, 0.014);
    },
  });
  // ---- 19. faces in profile (2.2/2.4): close-up, face to face — high-detail 'bust' figures
  D.add({
    id: 'faces', start: 98, end: 102, setName: 'busts', setFactory: (x) => new BustSet(x), grade: { ...grade, aspect: 2.39 },
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t, lt = ctx.lt;
      const d = 0.2 - 0.04 * smoothstep(0.5, 3.5, lt);
      s.romeo.object.position.set(-d - 0.06, 0, 0); s.romeo.object.rotation.y = Math.PI / 2;
      s.juliet.object.position.set(d + 0.06, 0, 0); s.juliet.object.rotation.y = -Math.PI / 2;
      const eyesJ = [d + 0.06 - 0.07, 1.57, 0], eyesR = [-d - 0.06 + 0.07, 1.68, 0];
      s.romeo.update(t, { preset: 'stand', lookAt: eyesJ }, { focus: 1.5, aperture: 0.01 });
      s.juliet.update(t, { preset: 'stand', arms: 'hang', lookAt: eyesR }, { focus: 1.5, aperture: 0.01 });
      c.fov = 24; c.updateProjectionMatrix();
      c.position.set(0.0, 1.55, 1.55 - lt * 0.05); c.lookAt(0, 1.56, 0);
      renderSet(ctx, target, s, c);
    },
  });

  return { duration: 104 };
}
