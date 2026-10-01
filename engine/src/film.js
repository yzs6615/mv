import * as THREE from 'three';
import { renderSet } from './core/director.js';
import { bar } from './core/music.js';
import { track, ease, clamp, smoothstep, handheld } from './core/math.js';
import { VeronaSet } from './sets/verona.js';

// The edit. Each shot: { id, start, end, setName, setFactory, grade, render(ctx, target, grade) }.

export async function buildFilm(e) {
  const D = e.director, T = e.type;
  const verona = (x) => new VeronaSet(x);

  // ---------------- PROLOGUE: P1 typed cards ----------------
  T.add({ t0: 1.6, t1: 6.6, fadeIn: 0.01, fadeOut: 0.7, anchor: [0.5, 0.5], valign: 0.5, lines: [
    { text: 'This story has been told for over four hundred years.', style: 'mono', size: 40, type: { dur: 2.6, cps: 20 }, delay: 0.25 },
    { text: '这个故事，已被讲述了四百多年。', style: 'cn', size: 32, gap: 22, delay: 3.0, fadeIn: 0.9 },
  ] });
  T.add({ t0: 6.85, t1: 9.75, fadeIn: 0.01, fadeOut: 0.5, anchor: [0.5, 0.5], valign: 0.5, lines: [
    { text: 'It has always ended the same way.', style: 'mono', size: 40, type: { dur: 1.7 }, delay: 0.1 },
    { text: '结局，从未改变。', style: 'cn', size: 32, gap: 22, delay: 1.9, fadeIn: 0.7 },
  ] });

  D.add({
    id: 'P1', start: 0, end: 9.91,
    grade: { bloom: 0.5, bloomThreshold: 0.6, vignette: 0.3, grain: 0.04, aspect: 2.39 },
    render(ctx, target) { const r = ctx.e.renderer; r.setRenderTarget(target); r.setClearColor(0x000000, 0); r.clear(); },
  });

  // ---------------- P4: Verona at night (test) ----------------
  D.add({
    id: 'P4', start: 9.91, end: 40, setName: 'verona', setFactory: verona,
    grade: { bloom: 0.75, bloomThreshold: 0.7, streak: 0.25, streakThreshold: 1.2, vignette: 0.6, grain: 0.035, contrast: 0.12, gain: [1.0, 1.0, 1.05] },
    render(ctx, target) {
      const s = ctx.set, c = s.camera;
      s.look('night', ctx.t, { winOn: 0.42 });
      const x = track([[0, -18], [30, 18]], ctx.lt);
      c.fov = 28; c.updateProjectionMatrix();
      c.position.set(x, 6.5, 0);
      c.lookAt(x * 0.6, 22, -300);
      s.frame(c);
      renderSet(ctx, target, s, c);
    },
  });

  return { duration: 40, glyphs: [] };
}
