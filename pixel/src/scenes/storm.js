// 132.57 - 151.83  Verse 2, first half: the storm.
//  L19 "有时笑容 有无助 也有阴霾"  three comic panels slam in: smiling in the sun, worried in the drizzle,
//                               glum under a black cloud; the third panel opens out into the storm
//  L20 "让信心 再困难 不可以摇摆"  dot-matrix rain, wind, lightning. He shields the sprout with his body;
//                               his HP bar takes hits; on "不可以摇摆" he braces: GUTS!
//  L21 "只要付出 这朵花 一定会开"  on "一定会开" the clouds tear open, a sunbeam lands on the sprout and
//                               it shoots up into a striped rainbow bud
//  L22 "种下自己梦想 照亮未来"     the gray ground flips to green tile by tile, out from the bud
import { P, ex } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass, remapPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2, hash } from '../core/math.js';
import { drawGardener, pose, GPAL } from '../art/gardener.js';
import { bubble, uniqueFlower, cloudSprite } from '../art/props.js';
import { puff, sparkle, burst, glow, wind, rain, godRays, lightPillar, shakeAt } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { F, sky, city, ground, cloudBank } from '../art/field.js';
import { hpBar, popText } from '../art/ui.js';

export default (ctx) => {
  const { m } = ctx;
  const T0 = 132.44, T_PANEL = [132.44, 133.79, 135.04], T_OPEN = 136.6, T1 = 151.83;
  const HITS = [[138.65, 3], [139.15, 5], [139.38, 4], [140.08, 2]];
  const T_GUTS = 139.85, T_BOLT = 140.73, T_BREAK = 144.84, T_BUD = 145.91, T_FLIP = 147.25, T_GLOW = 149.83;
  const SX = F.spot, G = F.ground;
  ctx.cue(T_PANEL[0], 'panel'); ctx.cue(T_PANEL[1], 'panel', { p: 0.9 }); ctx.cue(T_PANEL[2], 'panel', { p: 0.8 });
  ctx.cue(T_OPEN, 'thunder', { v: 0.55 });
  ctx.cue(T_OPEN, 'rainloop', { dur: T_BREAK - T_OPEN + 0.6, v: 0.55 });
  HITS.forEach(([t]) => ctx.cue(t, 'hit', { v: 0.7 }));
  ctx.cue(T_GUTS, 'guts');
  ctx.cue(T_BOLT, 'thunder', { v: 0.6 });
  ctx.cue(T_BREAK, 'sunbreak');
  ctx.cue(T_BUD, 'levelup', { p: 1.12 });
  ctx.cue(T_GLOW, 'shine');

  const hpAt = (t) => { let hp = 100; for (const [ht, d] of HITS) if (t >= ht) hp -= d; return hp; };
  const lastHit = (t) => HITS.filter(([ht]) => t >= ht).pop();
  const stormK = (t) => (t < T_BREAK ? 1 : 1 - prog(t, T_BREAK, T_BREAK + 1.6, E.ioQ));
  const cam = (t) => ({ x: SX - 120, y: 8 + 4 * prog(t, T_FLIP, T_FLIP + 2, E.ioQ), z: 2 });
  const R0 = 60;
  // ground tiles for the green flip, by distance from the bud
  const TILES = [];
  for (let x = F.edge; x < F.fence; x += 8) for (let y = 100; y < 150; y += 8) {
    const d = Math.hypot(x + 4 - SX, (y + 4 - G) * 2);
    TILES.push({ x, y, at: T_FLIP + d / 70 + hash2(x, y) * 0.12 });
  }
  TILES.forEach((tl, i) => { if (i % 9 === 0 && tl.at < T1) ctx.cue(tl.at, 'flip', { v: 0.12, p: 1 + (i % 5) * 0.1 }); });

  // ---- L19: comic panels (zoom 2, 240 x 135) ----
  function panels(g, t) {
    g.clear(P.ink);
    const W = g.W, H = g.H;
    const pw = 76, ph = 112, top = 10;
    for (let i = 0; i < 3; i++) {
      const tin = T_PANEL[i];
      if (t < tin) continue;
      const a = t - tin;
      const slide = a < 0.12 ? Math.round((1 - a / 0.12) * 20) : 0;
      const x = 6 + i * 78, y = top - (i === 1 ? 0 : 0) + slide * (i === 1 ? 1 : -1);
      g.rect(x - 1, y - 1, pw + 2, ph + 2, P.white);
      const c = g.ctx;
      c.save();
      c.beginPath(); c.rect(x + g.ox, y + g.oy, pw, ph); c.clip();
      const bg = [[[0, P.blue], [60, P.cyan], [112, P.white]], [[0, P.g4], [60, P.g3], [112, P.g2]], [[0, P.ink], [60, P.g5], [112, P.g4]]][i];
      g.vgrad(x, y, pw, bg, 2);
      if (i === 0) { g.disc(x + 58, y + 18, 9, P.gold); g.disc(x + 58, y + 18, 7, P.yellow); }
      if (i === 1) for (let k = 0; k < 30; k++) { const yy = (y + ((t * 90 + hash2(k, 1) * 112) % 112)); g.vline(x + hash2(k, 2) * pw, yy, yy + 3, P.g1); }
      if (i === 2) { g.spr(cloudSprite(91, 70, 30, [P.g4, P.g5, P.ink]), x + 38, y + 34); if (Math.floor(t * 6) % 7 === 0) g.rect(x, y, pw, ph, P.g3); }
      g.rect(x, y + 92, pw, 20, [P.greenM, P.greenD, P.g5][i]);
      const expr = ['happy', 'worried', 'sad'][i];
      drawGardener(g, x + 38, y + 96, { view: 'front', expr, bob: i === 0 && m.sinceBeat(t) < 0.15 ? -1 : 0, armL: i === 2 ? [-1, 6] : [-2, 5], armR: i === 1 ? [3, -2] : [2, 5], scarf: t, headDy: i === 2 ? 1 : 0 });
      if (i === 1) g.spr(bubble('sweat'), x + 46, y + 70);
      c.restore();
      g.frame(x - 1, y - 1, pw + 2, ph + 2, P.ink);
      text(g, ['笑容', '无助', '阴霾'][i], x + 6, y + 4, { color: P.white, outline: P.ink });
    }
  }

  // ---- the field in the storm and after ----
  function field(g, t) {
    const k = stormK(t);
    const c = cam(t);
    g.push(-c.x, -c.y);
    sky(g, 'storm', t > T_BREAK ? 'clear' : null, 1 - k);
    city(g, 0);
    // a hole in the clouds and the beam
    ground(g, t, { grassR: R0, wind: k * 2.5 });
    // flipped tiles get grass drawn on them
    for (const tl of TILES) {
      if (t < tl.at) continue;
      const a = t - tl.at;
      if (a < 0.06) { g.rect(tl.x, tl.y, 8, 8, P.white); continue; }
      g.rect(tl.x, tl.y, 8, 8, P.greenM);
      for (let q = 0; q < 4; q++) g.px(tl.x + Math.floor(hash2(tl.x + q, tl.y) * 8), tl.y + Math.floor(hash2(tl.y + q, tl.x) * 8), P.green);
      if (tl.y === 100) { g.rect(tl.x, 99, 8, 1, P.green); if (hash2(tl.x, 3) < 0.5) g.px(tl.x + 2, 98, P.green); }
      if (hash2(tl.y, tl.x) < 0.12 && a > 0.3) g.spr(uniqueFlower(Math.floor(tl.x * 7 + tl.y), { small: true }), tl.x + 4, tl.y + 6);
    }
    // the plant
    const grow = t < T_BUD ? 0.62 : 0.62 + 0.38 * prog(t, T_BUD, T_BUD + 0.5, E.outBack);
    heroFlower(g, SX, G - 1, { grow, open: 0, t, sway: Math.sin(t * (2 + 6 * k)) * (0.8 + 2 * k), height: 40 });
    // clouds: thick, then torn open
    cloudBank(g, t, 1.15 - (1 - k) * 1.3, -1, [P.g3, P.g4, P.g5]);
    cloudBank(g, t, 1.15 - (1 - k) * 1.3, 1, [P.g3, P.g4, P.g5]);
    if (t > T_BREAK - 0.2) godRays(g, SX - 40, -30, t, { n: 4, len: 150, a0: Math.PI * 0.33, spread: Math.PI * 0.1, amt: 0.3 * Math.min(1, (t - T_BREAK + 0.2) * 2) * (1 - prog(t, T_FLIP, T_FLIP + 2.5, E.lin)), col: ex(P.yellow) });
    // the gardener
    const hit = lastHit(t);
    const sinceHit = hit ? t - hit[0] : 9;
    let p;
    if (t < T_BREAK) {
      const braced = t > T_GUTS;
      p = { view: 'side', flip: true, crouch: braced ? 2 : 3, lean: -2, armR: [-8, -1], armL: [-7, -2], expr: sinceHit < 0.3 ? 'hurt' : braced ? 'determined' : 'worried', wind: 3, scarf: t * 4, headDx: sinceHit < 0.1 ? 1 : 0 };
    } else if (t < T_BUD + 0.4) {
      p = { ...pose.idle(t), flip: true, expr: 'surprised', armL: [-3, 1], armR: [-4, 0] };
    } else {
      p = { view: 'front', expr: 'happy', armL: [-3, -7], armR: [3, -7], armsFront: true, bob: m.sinceBeat(t) < 0.12 ? -2 : 0, scarf: t * 2 };
    }
    const flash = sinceHit < 0.08;
    drawGardener(g, SX + 7 + (sinceHit < 0.1 ? 1 : 0), G, p, flash ? WHITE : GPAL);
    if (t > T_GUTS && t < T_GUTS + 1.5) {
      const a = t - T_GUTS;
      g.ring(SX + 6, G - 14, 14 + a * 6, ex(P.gold), 1);
      if (a < 0.8) g.ring(SX + 6, G - 14, 10 + a * 18, ex(P.yellow), 1);
    }
    if (t > T_BUD) { lightPillar(g, SX, G, t - T_BUD, { h: 160, w: 8 }); burst(g, SX, G - 40, t - T_BUD, { n: 12, r: 26, cols: [P.white, P.yellow, P.pink, P.cyan] }); }
    if (t > T_GLOW) glow(g, SX, G - 44, 16 + 3 * Math.sin(t * 5), ex(P.yellow), 0.35);
    // lightning bolt
    if (t > T_BOLT && t < T_BOLT + 0.25) {
      let x = SX + 70, y = -20;
      for (let s = 0; s < 9; s++) {
        const nx = x + (hash2(s, 77) - 0.5) * 18, ny = y + 15;
        g.line(x, y, nx, ny, ex(P.white), 2);
        x = nx; y = ny;
      }
    }
    g.pop();
    if (k > 0.02) {
      rain(g, t, { n: Math.round(260 * k), speed: 300, wind: -90, len: 6, col: P.g1, col2: P.white });
      wind(g, t, { n: Math.round(12 * k), speed: 340, dir: -1, col: P.g1 });
    }
  }

  const WHITE = Object.fromEntries(Object.keys(GPAL).map((kk) => [kk, P.white]));

  return {
    id: 'storm', t0: T0, t1: T1,
    zoom: () => 2,
    draw(g, t) {
      if (t < T_OPEN) panels(g, t);
      else field(g, t);
    },
    post(g, t) {
      if (t < T_OPEN) return;
      const c = cam(t);
      const zones = [{ x: SX - c.x, y: G - 2 - c.y, r: R0 * 1.35, sy: 0.55, soft: 8 }];
      for (const tl of TILES) if (t >= tl.at + 0.06) zones.push({ x: tl.x - c.x, y: tl.y - c.y, w: 8, h: 8 });
      grayPass(g, zones, 8);
      if ((t > T_OPEN && t < T_OPEN + 0.1) || (t > T_BOLT && t < T_BOLT + 0.1)) remapPass(g, 'white', 0.7);
    },
    shake(t) { const a = shakeAt(t, T_BOLT, 4, 0.4), b = shakeAt(t, T_OPEN, 3, 0.4); return [a[0] + b[0], a[1] + b[1]]; },
    ui(g, t) {
      if (t > T_OPEN && t < T_BREAK + 1.5) {
        const hp = hpAt(t);
        g.rect(10, 10, 160, 30, P.ink);
        g.frame(10, 10, 160, 30, P.white);
        text(g, '园丁 Lv.2', 18, 13, { font: 'zh', color: P.white });
        hpBar(g, 18, 28, hp, 100, { w: 100 });
        for (const [ht, d] of HITS) popText(g, (SX + 7 - cam(t).x) * 2, (G - 34 - cam(t).y) * 2, '-' + d, t - ht, P.hot, { scale: 2 });
        if (t > T_GUTS) {
          const a = t - T_GUTS;
          popText(g, (SX + 7 - cam(t).x) * 2, (G - 40 - cam(t).y) * 2 - 16, 'GUTS!', a, P.yellow, { scale: 2, life: 1.4 });
          if (Math.floor(a * 4) % 2 === 0 || a > 1) { g.rect(176, 12, 54, 12, P.ink); text(g, 'DEF UP', 180, 14, { font: 'en', color: P.yellow }); }
        }
      }
    },
  };
};
