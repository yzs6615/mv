import * as THREE from 'three';
import { DEFAULT_GRADE } from './post.js';
import { clamp, lerp, smoothstep } from './math.js';
import * as music from './music.js';

// The Director owns the edit: an ordered list of shots, each a pure function of film time.
// Cuts are hard by default; a shot may declare transIn = { type, dur } and the director renders
// both the outgoing shot (continuing past its end) and the incoming shot, then mixes them.

const MODES = { dissolve: 0, lightDissolve: 1, ink: 2, light: 3 };

export class Director {
  constructor(engine) {
    this.e = engine;
    this.shots = [];
    this.sets = new Map();
    this.global = []; // global grade modifiers: (t, g) => void
  }

  add(...shots) { for (const s of shots) this.shots.push(s); this.shots.sort((a, b) => a.start - b.start); }

  set(name, factory) {
    if (!this.sets.has(name)) this.sets.set(name, factory(this.e));
    return this.sets.get(name);
  }

  shotAt(t) {
    let cur = this.shots[0];
    for (const s of this.shots) if (t >= s.start) cur = s;
    return cur;
  }

  resolve(t) {
    const idx = this.shots.indexOf(this.shotAt(t));
    const cur = this.shots[idx];
    const tr = cur.transIn;
    if (tr && idx > 0 && t < cur.start + tr.dur) {
      const prev = this.shots[idx - 1];
      return { a: prev, b: cur, mix: clamp((t - cur.start) / tr.dur), mode: MODES[tr.type] ?? 0, tr };
    }
    return { a: cur, b: null, mix: 0 };
  }

  ctxFor(shot, t) {
    const lt = t - shot.start, dur = shot.end - shot.start;
    return { t, lt, dur, u: clamp(lt / dur), shot, e: this.e, music, set: shot.setName ? this.set(shot.setName, shot.setFactory) : null };
  }

  /** render one shot into target, return its grade */
  renderShot(shot, t, target) {
    const ctx = this.ctxFor(shot, t);
    const g = { ...DEFAULT_GRADE, ...(typeof shot.grade === 'function' ? shot.grade(ctx) : shot.grade || {}) };
    const out = shot.render(ctx, target, g);
    return out || g;
  }

  frame(t, frameIndex) {
    const e = this.e, post = e.post;
    const { a, b, mix, mode, tr } = this.resolve(t);
    let g = this.renderShot(a, t, post.sceneA);
    let src = post.sceneA;
    if (b) {
      const gb = this.renderShot(b, t, post.sceneB);
      const m = tr.ease ? tr.ease(mix) : smoothstep(0, 1, mix);
      src = post.transition(post.sceneA.texture, post.sceneB.texture, m, mode, tr.seed ?? 3.1, tr.edge);
      g = blendGrades(g, gb, m);
    }
    for (const fn of this.global) fn(t, g);
    const A = e.W / e.H;
    const lb = g.aspect > A ? (1 - A / g.aspect) / 2 : 0;
    const overlay = e.type.render(t, lb);
    post.composite(src, overlay, g, frameIndex);
  }
}

export function blendGrades(a, b, m) {
  const o = {};
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k];
    if (Array.isArray(x)) o[k] = x.map((v, i) => lerp(v, y[i], m));
    else if (typeof x === 'number') o[k] = lerp(x, y, m);
    else o[k] = m < 0.5 ? x : y;
  }
  return o;
}

/** standard shot render: one set, one camera */
export function renderSet(ctx, target, set, camera) {
  const r = ctx.e.renderer;
  r.setRenderTarget(target);
  r.setClearColor(set.clearColor || 0x000000, 0);
  r.clear(true, true, true);
  r.render(set.scene, camera || set.camera);
}
