import * as THREE from 'three';
import { renderSet } from '../core/director.js';
import { track, ease, clamp, smoothstep, lerp } from '../core/math.js';
import { BallroomSet, BALLROOM, danceClock } from '../sets/ballroom.js';
import { ChamberSet, CHAMBER } from '../sets/chamber.js';

// Bench for the interior sets (ballroom 1.3 - 1.10, chamber 3.6). Each shot sets every parameter it uses.
// The lovers are placeholders here (soft amber / rose glows) so composition and their light on the hall
// can be judged; the real figures of light are built elsewhere and feed the same extraLights hook.

const BW = { bloom: 0.8, bloomThreshold: 0.75, bloomKnee: 0.6, streak: 0.18, streakThreshold: 1.6, streakTint: [1.0, 0.75, 0.5],
  vignette: 0.6, grain: 0.035, contrast: 0.1, sat: 0.92, aspect: 2.39, gain: [1.04, 1.0, 0.95], lift: [0.004, 0.003, 0.004], keepColor: 1 };
const ROMEO = { core: [2.6, 1.45, 0.55], halo: [1.0, 0.55, 0.18] }, JULIET = { core: [2.4, 1.2, 1.45], halo: [0.95, 0.42, 0.55] };

// placeholder figure of light: a soft vertical glow (lovers' additive blending, writes the keep mask)
function placeholder(scene) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(6), 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 } }, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: `attribute vec3 aCol; attribute float aSize; uniform float uPx; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vC = aCol; gl_PointSize = aSize * 540. * uPx * projectionMatrix[1][1] / max(0.3, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 c = gl_PointCoord * 2. - 1.; c.x *= 2.2; float r2 = dot(c, c); float a = exp(-r2 * 4.) * 0.8 + exp(-r2 * 30.) * 1.6; gl_FragColor = vec4(vC * a, clamp(a, 0., 1.)); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 150;
  scene.add(pts);
  return {
    pts,
    set(list, px) { // list: [{ pos, col, size }]
      const P = g.attributes.position.array, C = g.attributes.aCol.array, S = g.attributes.aSize.array;
      for (let i = 0; i < 6; i++) { const L = list[i]; S[i] = L ? L.size : 0; if (L) { P.set(L.pos, i * 3); C.set(L.col, i * 3); } }
      g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
      m.uniforms.uPx.value = px;
    },
  };
}
const lover = (pos, who, k = 1) => {
  const c = who === 'r' ? ROMEO : JULIET;
  return [{ pos: [pos[0], pos[1] + 0.95, pos[2]], col: c.core.map((v) => v * 0.9 * k), size: 1.9 }, { pos: [pos[0], pos[1] + 1.55, pos[2]], col: c.core.map((v) => v * 0.6 * k), size: 0.6 }];
};
const loverLight = (pos, who, k = 1) => ({ pos: [pos[0], pos[1] + 1.1, pos[2]], color: (who === 'r' ? ROMEO : JULIET).halo, intensity: 4 * k });

export async function buildFilm(e) {
  const D = e.director;
  const B = BALLROOM, zc = B.centre[2];
  let ph = null;
  const ballroom = (x) => { const s = new BallroomSet(x); ph = placeholder(s.scene); return s; };
  const shot = (o) => D.add({ setName: 'ballroom', setFactory: ballroom, grade: BW, ...o });

  // B1 — 1.3 symmetric one-point establishing shot, craning down past the first chandelier
  shot({
    id: 'B1', start: 0, end: 8,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, u = ctx.u;
      s.update(ctx.t, { danceSpeed: 1, collapse: 0, island: 0, colourBleed: 0, part: 0, dissolve: 0 });
      ph.set([], ctx.e.px);
      const k = ease.glide(u);
      c.fov = 42; c.updateProjectionMatrix();
      c.position.set(0, lerp(15.5, 2.1, k), lerp(12.4, 9.5, k));
      c.lookAt(0, lerp(4.5, 6.2, k), B.hall.zBack);
      renderSet(ctx, target, s, c);
    },
  });
  // B2 — 1.4 steadicam over Romeo's shoulder through the waltz
  shot({
    id: 'B2', start: 8, end: 14,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, lt = ctx.lt;
      const z = lerp(9.5, -6.5, ease.inOutSine(ctx.u)), x = 1.1 + Math.sin(lt * 0.6) * 0.8;
      const rp = [x - 0.7, 0, z - 2.6];
      s.update(ctx.t, { danceSpeed: 1, extraLights: [loverLight(rp, 'r')] });
      ph.set(lover(rp, 'r'), ctx.e.px);
      c.fov = 38; c.updateProjectionMatrix();
      c.position.set(x + 0.35, 1.85 + Math.sin(lt * 1.9) * 0.03, z);
      c.lookAt(x - 0.9 + Math.sin(lt * 0.4) * 1.5, 1.7, z - 12);
      renderSet(ctx, target, s, c);
    },
  });
  // B3 — 1.5 first sight: push-in, the waltz slows almost to a stop, the crowd parts, dolly zoom on Juliet
  const B3 = 14;
  const speed3 = [[B3 + 1.5, 1], [B3 + 4.0, 0.05]];
  shot({
    id: 'B3', start: B3, end: B3 + 8,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, lt = ctx.lt;
      const part = smoothstep(2.0, 6.0, lt);
      const jp = B.juliet;
      s.update(ctx.t, { danceSpeed: speed3, part, extraLights: [loverLight(jp, 'j', 1.2)] });
      ph.set(lover(jp, 'j', 1.2), ctx.e.px);
      // push in (0-4 s), then dolly zoom (4-8 s): camera advances while the lens widens, Juliet stays the same size
      const zA = track([[0, 9.0], [4, 5.0], [8, -7.0]], lt);
      const d0 = 5.0 - jp[2];
      const fov = lt < 4 ? lerp(24, 20, ease.inOutSine(lt / 4)) : 2 * Math.atan(Math.tan((20 / 2) * Math.PI / 180) * d0 / (zA - jp[2])) * 180 / Math.PI;
      c.fov = fov; c.updateProjectionMatrix();
      c.position.set(0, 1.75, zA);
      c.lookAt(0, 1.55, jp[2]);
      renderSet(ctx, target, s, c);
    },
  });
  // B4 — 1.6 lateral tracking: Juliet in the nave, Romeo behind the colonnade, columns sweep through frame
  const B4 = 22;
  shot({
    id: 'B4', start: B4, end: B4 + 6,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, lt = ctx.lt;
      const z = lerp(B.walkZ[0], B.walkZ[0] - 9, ctx.u);
      const jp = [-B.naveLaneX, 0, z - 0.5], rp = [-B.aisleLaneX, 0, z + 0.4];
      s.update(ctx.t, { danceSpeed: 0.6, extraLights: [loverLight(rp, 'r'), loverLight(jp, 'j')] });
      ph.set([...lover(rp, 'r'), ...lover(jp, 'j')], ctx.e.px);
      c.fov = 44; c.updateProjectionMatrix();
      c.position.set(-2.2, 2.1, z);
      c.lookAt(-12, 4.2, z - 1.5);
      renderSet(ctx, target, s, c);
    },
  });
  // B5 — 1.7/1.8 colour bleeds from the touch; the chandeliers rise (low angle)
  const B5 = 28;
  shot({
    id: 'B5', start: B5, end: B5 + 6,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, lt = ctx.lt;
      const touch = [0, 0, zc + 1.0];
      const bleed = smoothstep(0.5, 3.5, lt);
      const lift = 7 * ease.inCubic(clamp((lt - 2.8) / 3.2));
      s.update(ctx.t, { danceSpeed: 0.35 + 0.65 * smoothstep(1, 4, lt), colourBleed: bleed, bleedOrigin: [touch[0], touch[2]], chandelierLift: lift,
        extraLights: [loverLight([-0.5, 0, touch[2]], 'r'), loverLight([0.5, 0, touch[2]], 'j')] });
      ph.set([...lover([-0.5, 0, touch[2]], 'r'), ...lover([0.5, 0, touch[2]], 'j')], ctx.e.px);
      c.fov = 46; c.updateProjectionMatrix();
      const cy = lerp(1.0, 2.6, ease.inOutSine(ctx.u));
      c.position.set(0, cy, zc + 9.5);
      c.lookAt(0, lerp(5.5, 10.0, ease.inOutSine(clamp((lt - 1.5) / 4.5))), zc - 4);
      renderSet(ctx, target, s, c);
    },
  });
  // B6 — 1.9 continuous 360 orbit: dancers become rising light, the hall folds flat, the starry sky
  const B6 = 34;
  shot({
    id: 'B6', start: B6, end: B6 + 12,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, lt = ctx.lt;
      const ctr = B.centre;
      const a = 0.5 + lt / 12 * Math.PI * 2;
      const dissolve = smoothstep(0.3, 5.0, lt), collapse = smoothstep(3.5, 10.5, lt);
      const rp = [ctr[0] - 0.45 * Math.cos(lt * 1.5), 0, ctr[2] - 0.45 * Math.sin(lt * 1.5)], jp = [ctr[0] + 0.45 * Math.cos(lt * 1.5), 0, ctr[2] + 0.45 * Math.sin(lt * 1.5)];
      s.update(ctx.t, { danceSpeed: 1, colourBleed: 1, dissolve, dissolveOrigin: [ctr[0], ctr[2]], collapse, chandelierLift: 7 + lt * 0.6, crown: smoothstep(4, 11, lt),
        sky: 'deepNight', clouds: smoothstep(6, 11, lt), city: 0, extraLights: [loverLight(rp, 'r'), loverLight(jp, 'j')] });
      ph.set([...lover(rp, 'r'), ...lover(jp, 'j')], ctx.e.px);
      const R = lerp(8.5, 11, smoothstep(4, 12, lt)), y = lerp(2.2, 4.5, smoothstep(5, 12, lt));
      c.fov = 44; c.updateProjectionMatrix();
      c.position.set(ctr[0] + Math.cos(a) * R, y, ctr[2] + Math.sin(a) * R);
      c.lookAt(ctr[0], lerp(2.0, 3.5, smoothstep(5, 12, lt)), ctr[2]);
      renderSet(ctx, target, s, c);
    },
  });
  // B7 — 1.10 pull back: the floor is an island floating above a sea of moonlit clouds, Verona far below
  const B7 = 46;
  shot({
    id: 'B7', start: B7, end: B7 + 8,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, lt = ctx.lt;
      const ctr = B.centre;
      const rp = [ctr[0] - 0.45 * Math.cos(lt * 1.2), 0, ctr[2] - 0.45 * Math.sin(lt * 1.2)], jp = [ctr[0] + 0.45 * Math.cos(lt * 1.2), 0, ctr[2] + 0.45 * Math.sin(lt * 1.2)];
      s.update(ctx.t, { danceSpeed: 1, colourBleed: 1, dissolve: 1, collapse: 1, island: 1, crown: 1, chandelierLift: -1, sky: 'night', clouds: 1, city: 1,
        moonDir: [0.36, 0.06, -0.93], moonSize: 0.03, extraLights: [loverLight(rp, 'r'), loverLight(jp, 'j')] });
      ph.set([...lover(rp, 'r'), ...lover(jp, 'j')], ctx.e.px);
      const k = ease.inOutSine(ctx.u);
      const dist = lerp(26, 150, k), el = lerp(0.18, 0.12, k), az = -0.5 + 0.25 * k;
      c.fov = lerp(40, 32, k); c.updateProjectionMatrix();
      c.position.set(ctr[0] + Math.sin(az) * dist * Math.cos(el), dist * Math.sin(el) + 2, ctr[2] + Math.cos(az) * dist * Math.cos(el));
      c.lookAt(ctr[0], lerp(1.5, -6, k), ctr[2]);
      renderSet(ctx, target, s, c);
    },
  });
  // B8 — 3.6 WAITING: one locked-off frame; a year passes; the candle burns down (Act III grey-blue)
  const B8 = 54;
  let phc = null;
  D.add({
    id: 'B8', start: B8, end: B8 + 8.07, setName: 'chamber', setFactory: (x) => { const s = new ChamberSet(x); phc = placeholder(s.scene); return s; },
    grade: { ...BW, sat: 0.55, gain: [0.98, 1.0, 1.06], lift: [0.003, 0.004, 0.007], bloom: 0.7, streak: 0.12, keepColor: 1 },
    render(ctx, target) {
      const s = ctx.set, c = s.camera;
      const jp = CHAMBER.ledge.pos;
      const jl = { pos: [jp[0] + 0.05, jp[1] + 0.75, jp[2]], color: JULIET.halo, intensity: 0.06 };
      s.update(ctx.t, { season: ctx.u, candle: ctx.u, light: 1, extraLights: [jl] });
      phc.set([{ pos: [jp[0], jp[1] + 0.55, jp[2]], col: JULIET.core.map((v) => v * 0.55), size: 0.9 }, { pos: [jp[0] + 0.05, jp[1] + 0.95, jp[2]], col: JULIET.core.map((v) => v * 0.4), size: 0.3 }], ctx.e.px);
      s.frameDefault(c);
      renderSet(ctx, target, s, c);
    },
  });
  return { duration: B8 + 8.07 };
}
