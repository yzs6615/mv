// 0 - 12.57  Boot and title screen. A CRT switches on, a little studio logo chimes, then the title
// drops in letter by letter while the a cappella hook plays: a seed falls on the hill ("一起种"),
// sprouts, and blooms into the one rainbow flower on "花". "Only one" sends out a ring of colour.
// PUSH START blinks on the beat and is pressed on the band's entry at 12.57.
import { P, RAINBOW } from '../core/pal.js';
import { text } from '../core/font.js';
import { hash2, E, prog } from '../core/math.js';
import { titleText, blink } from '../art/ui.js';
import { sparkle, burst, ringWave, glow } from '../art/fx.js';
import { seedSprite } from '../art/gardener.js';
import { heroFlower } from '../art/hero.js';

export default (ctx) => {
  const { m } = ctx;
  const T_LOGO = 0.6, T_TITLE = 2.87, T_SEED = 3.03, T_LAND = 3.72, T_SPROUT = 4.96, T_BUD = 5.7, T_BLOOM = 6.98;
  const T_ONLY = 10.47, T_ONE = 11.36, T_START = 12.57;
  ctx.cue(T_LOGO + 0.35, 'boot');
  ctx.cue(T_LAND, 'plip');
  ctx.cue(T_SPROUT, 'sprout');
  ctx.cue(T_BLOOM, 'bloom');
  ctx.cue(T_ONLY, 'shine');
  ctx.cue(T_START, 'start');
  const title = '世界上唯一的花';
  for (let i = 0; i < 7; i++) ctx.cue(T_TITLE + 0.08 + i * 0.1, 'tick', { v: 0.35 });

  return {
    id: 'title', t0: 0, t1: 13.0,
    draw(g, t) {
      const W = g.W, H = g.H;
      g.clear(P.ink);
      // CRT power-on line
      if (t < T_LOGO) {
        const k = prog(t, 0.2, T_LOGO, E.outC);
        if (t > 0.2) { const h = Math.max(1, Math.round(k * 40)); g.rect(0, H / 2 - h / 2, W, h, k < 0.5 ? P.white : P.g4); g.rect(W / 2 - k * W / 2, H / 2, k * W, 1, P.white); }
        return;
      }
      if (t < T_TITLE) {
        // studio logo
        const a = t - T_LOGO;
        const fl = Math.min(4, Math.floor(a * 8));
        const y = H / 2 - 18;
        if (a > 0.1) {
          text(g, 'PIXEL', W / 2 - 4, y, { font: 'en', scale: 2, align: 'right', color: P.white });
          text(g, 'GARDEN', W / 2 + 4, y, { font: 'en', scale: 2, align: 'left', color: RAINBOW[(fl + Math.floor(a * 6)) % RAINBOW.length] });
          text(g, 'presents', W / 2, y + 24, { font: 'en', align: 'center', color: P.g2 });
          sparkle(g, W / 2 + 104, y - 2, a - 0.35, P.white, 4);
        }
        // fade to black before the title
        if (t > T_TITLE - 0.3) g.drect(0, 0, W, H, P.ink, (t - (T_TITLE - 0.3)) / 0.3);
        return;
      }
      // night sky
      g.vgrad(0, 0, W, [[0, P.ink], [90, P.g5], [190, P.purple], [240, P.magenta]], 2);
      for (let i = 0; i < 90; i++) {
        const x = Math.floor(hash2(i, 1) * W), y = Math.floor(hash2(i, 2) * 180);
        const tw = Math.floor(m.beatF(t) + hash2(i, 3) * 4) % 4;
        const c = tw === 0 ? P.white : tw === 1 ? P.g1 : P.g3;
        g.px(x, y, c);
        if (tw === 0 && i % 7 === 0) { g.px(x - 1, y, P.g3); g.px(x + 1, y, P.g3); g.px(x, y - 1, P.g3); g.px(x, y + 1, P.g3); }
      }
      // hill
      g.oval(W / 2, 262, 150, 42, P.greenK);
      g.oval(W / 2, 266, 130, 38, P.greenD);
      for (let i = 0; i < 30; i++) { const x = W / 2 - 120 + i * 8 + Math.floor(hash2(i, 5) * 4); g.px(x, 232 + Math.abs(i - 15) * 0.9, P.greenM); }
      const fx = W / 2, fy = 228;
      // seed falls, lands, sprouts, blooms
      if (t >= T_SEED && t < T_LAND) {
        const k = prog(t, T_SEED, T_LAND, E.inQ);
        g.spr(seedSprite(t * 10), fx, 120 + k * (fy - 122));
      }
      if (t >= T_LAND) {
        const age = t - T_BLOOM;
        const grow = prog(t, T_SPROUT, T_BUD + 0.4, E.outBack);
        const open = prog(t, T_BLOOM, T_BLOOM + 0.6, E.outBack);
        if (t < T_SPROUT) g.spr(seedSprite(t * 10), fx, fy - 1);
        else heroFlower(g, fx, fy, { grow, open, t, sway: Math.sin(t * 2) * 0.6, height: 46, size: 8 });
        if (t > T_BLOOM - 0.1) glow(g, fx, fy - 54, 30 + 3 * m.pulse(t, 6), P.yellow, 0.18 * Math.min(1, (t - T_BLOOM) * 2));
        burst(g, fx, fy - 54, age, { n: 10, r: 30, cols: [P.white, P.yellow, P.pink] });
        if (t >= T_ONLY) ringWave(g, fx, fy - 54, t - T_ONLY, { speed: 140, n: 5, gap: 12, max: 520 });
        if (t >= T_ONE) ringWave(g, fx, fy - 54, t - T_ONE, { speed: 140, n: 3, gap: 16, max: 520 });
      }
      // title letters drop in
      const chars = [...title];
      const sc = 3, cw = 12 * sc, x0 = W / 2 - (chars.length * cw) / 2;
      chars.forEach((ch, i) => {
        const tl = T_TITLE + 0.08 + i * 0.1;
        if (t < tl - 0.25) return;
        const k = prog(t, tl - 0.25, tl, E.inQ);
        let y = 40 - (1 - k) * 80;
        const after = t - tl;
        if (after > 0 && after < 0.2) y -= Math.round(Math.sin((after / 0.2) * Math.PI) * 5);
        const bob = t > T_TITLE + 1.5 ? Math.round(Math.sin(m.beatF(t) * Math.PI + i * 0.7) * 1.2) : 0;
        titleText(g, ch, x0 + i * cw + cw / 2, Math.round(y + bob), { scale: sc, top: P.yellow, bot: P.orange });
      });
      if (t > T_TITLE + 1.0) {
        const a = Math.min(1, (t - T_TITLE - 1.0) * 3);
        if (a > 0.5) text(g, 'THE ONLY FLOWER IN THE WORLD', W / 2, 92, { font: 'en', align: 'center', color: P.peach, outline: P.ink });
      }
      // push start
      if (t < T_START) {
        if (t > 4.2) blink(g, 'PUSH START', W / 2, 124, m.beatF(t) / 2, { rate: 2, color: P.white });
      } else {
        if (Math.floor((t - T_START) * 20) % 2 === 0) text(g, 'PUSH START', W / 2, 124, { font: 'en', align: 'center', color: P.yellow, outline: P.ink });
      }
      // start flash
      if (t >= T_START) g.drect(0, 0, W, H, P.white, Math.max(0, 1 - (t - T_START) / 0.25));
    },
    lyric(t) { return t < T_TITLE ? { hide: true } : { y: 246 }; },
  };
};
