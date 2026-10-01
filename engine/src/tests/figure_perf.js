import * as THREE from 'three';
import { renderSet } from '../core/director.js';
import { LightFigure, HandsCloseUp, waltzPair } from '../fx/figure.js';

// Performance probe for the figures of light. Logs per-frame timings (ms) to the console:
//   cpu   = figure.update() for all figures (pose, IK, cloth guides, uniforms)
//   gpu   = scene render with figures, synchronised with a 1-pixel readback
//   base  = the same render with the figures hidden  -> figure cost = gpu - base
// node render/render.mjs --params film=./tests/figure_perf.js --range 0:96 --out build/debug/perf.mp4

let px = null;
// full-target readback forces SwiftShader to finish every queued draw
function sync(e) { const gl = e.gl; if (!px) px = new Float32Array(e.W * e.H * 4); gl.readPixels(0, 0, e.W, e.H, gl.RGBA, gl.FLOAT, px); }
const REP = 4;

class PerfSet {
  constructor(e) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, e.W / e.H, 0.02, 200);
    this.romeo = new LightFigure(e, { who: 'romeo' });
    this.juliet = new LightFigure(e, { who: 'juliet' });
    this.hands = new HandsCloseUp(e);
    this.scene.add(this.romeo.object, this.juliet.object, this.hands.object);
  }
}

export async function buildFilm(e) {
  const D = e.director;
  const stats = {};
  const probe = (name, ctx, target, s, figs, updateFn) => {
    const t0 = performance.now();
    updateFn();
    const t1 = performance.now();
    renderSet(ctx, target, s, s.camera); sync(e);
    const t2 = performance.now();
    for (let i = 0; i < REP; i++) renderSet(ctx, target, s, s.camera);
    sync(e);
    const t3a = performance.now();
    const vis = figs.map((f) => f.visible);
    figs.forEach((f) => { f.visible = false; });
    renderSet(ctx, target, s, s.camera); sync(e);
    const t3b = performance.now();
    for (let i = 0; i < REP; i++) renderSet(ctx, target, s, s.camera);
    sync(e);
    const t4a = performance.now();
    // per-render times (the readback cost cancels in the difference)
    const t3 = t2 + (t3a - t2) / REP, t4 = t3 + (t4a - t3b) / REP;
    figs.forEach((f, i) => { f.visible = vis[i]; });
    renderSet(ctx, target, s, s.camera); // leave the real frame in the target
    const st = (stats[name] = stats[name] || { n: 0, cpu: 0, gpu: 0, base: 0 });
    if (ctx.lt > 0.3) { st.n++; st.cpu += t1 - t0; st.gpu += t3 - t2; st.base += t4 - t3; }
    console.log(`PERF ${name} t=${ctx.t.toFixed(2)} cpu=${(t1 - t0).toFixed(1)} gpu=${(t3 - t2).toFixed(1)} base=${(t4 - t3).toFixed(1)} fig=${(t3 - t2 - (t4 - t3)).toFixed(1)}` +
      (st.n ? `  avg cpu=${(st.cpu / st.n).toFixed(1)} fig=${((st.gpu - st.base) / st.n).toFixed(1)}` : ''));
  };
  const grade = { bloom: 0.7, aspect: 2.39 };
  D.add({
    id: 'medium', start: 0, end: 2, setName: 'perf', setFactory: (x) => new PerfSet(x), grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t;
      s.hands.object.visible = false; s.romeo.object.visible = true; s.juliet.object.visible = true;
      c.fov = 30; c.updateProjectionMatrix(); c.position.set(0, 1.0, 5.4); c.lookAt(0, 0.92, 0);
      probe('medium-2figs', ctx, target, s, [s.romeo, s.juliet], () => {
        s.romeo.object.position.set(-0.55, 0, 0); s.juliet.object.position.set(0.55, 0, 0);
        s.romeo.object.rotation.y = t * 0.6; s.juliet.object.rotation.y = t * 0.6;
        s.romeo.update(t, 'stand'); s.juliet.update(t, 'stand');
      });
    },
  });
  D.add({
    id: 'waltz', start: 2, end: 4, setName: 'perf', setFactory: (x) => new PerfSet(x), grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t;
      s.hands.object.visible = false; s.romeo.object.visible = true; s.juliet.object.visible = true;
      c.fov = 30; c.updateProjectionMatrix(); c.position.set(0, 1.3, 3.6); c.lookAt(0, 1.0, 0);
      probe('waltz-close', ctx, target, s, [s.romeo, s.juliet], () => { waltzPair(s.romeo, s.juliet, t, { radius: 0.3, t0: 2 }); });
    },
  });
  D.add({
    id: 'hands', start: 4, end: 6, setName: 'perf', setFactory: (x) => new PerfSet(x), grade,
    render(ctx, target) {
      const s = ctx.set, c = s.camera, t = ctx.t;
      s.hands.object.visible = true; s.romeo.object.visible = false; s.juliet.object.visible = false;
      s.hands.frame(c, { dist: 0.6 });
      probe('hands-closeup', ctx, target, s, [s.hands.romeo, s.hands.juliet], () => { s.hands.update(t, { contactTime: 5, camera: c, aperture: 0.007 }); });
    },
  });
  return { duration: 6 };
}
