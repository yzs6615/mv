// 171.36 - 190.75  Pre-chorus 2. Same words as pre-chorus 1, a different story:
//  L27 "回想起我们 从儿语牙牙"  the memory again, in warm sepia this time: a stork flies over the cribs
//                              and drops a different glowing seed to every baby. Everyone had one.
//  L28 "就怕 输掉明天 付出代价"  the race at dusk: runners spent, HP bars nearly empty, the screens
//                              shouting FASTER! DON'T STOP!
//  L29 "所有的人 ... 第一个到达"  from the field, rings of coloured light roll across the track; each one
//                              that passes a runner cracks the rank tag over their head
//  L30 "你不会落后 不要害怕"     the gardener waves them over; they stop; cracks spread over the screen
//                              itself, faster and faster, until chorus 2 breaks it (see bloom2)
import { P, ex, RAINBOW } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass, remapPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2, hash } from '../core/math.js';
import { drawGardener, pose } from '../art/gardener.js';
import { drawCitizen, folkPoses, RACER, CPAL, babySprite, BPAL } from '../art/folk.js';
import { bubble, uniqueFlower, stork, personalSeed } from '../art/props.js';
import { puff, sparkle, burst, glow, ringWave, cracks, shakeAt } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { F, sky, city, ground } from '../art/field.js';
import { rankTag, hpBar, popText } from '../art/ui.js';

export default (ctx) => {
  const { m } = ctx;
  const T0 = 171.36, T_RACE = 176.0, T_WAVES = 180.9, T_WAVE = 185.3, T1 = 191.6;
  const DROPS = [172.12, 172.97, 173.81, 174.63];
  const RINGS = [181.01, 182.03, 183.16, 184.06, 185.34, 186.21];
  const T_CRACK0 = 186.6, T_SHATTER = 190.75;
  ctx.cue(T0 + 0.1, 'memory', { p: 1.12 });
  ctx.cue(171.6, 'flap', { v: 0.3 });
  DROPS.forEach((t, i) => ctx.cue(t + 0.35, 'twinkle', { p: 1 + i * 0.15 }));
  ctx.cue(T_RACE, 'alarm', { v: 0.35 });
  RINGS.forEach((t, i) => ctx.cue(t, 'wave', { p: 1 + i * 0.1 }));
  for (let i = 0; i < 6; i++) ctx.cue(T_WAVES + 0.4 + i * 0.66, 'crack', { v: 0.35 });
  ctx.cue(T_CRACK0, 'crack', { v: 0.7 });
  for (let i = 0; i < 8; i++) ctx.cue(T_CRACK0 + 0.6 + i * 0.4 * (1 - i * 0.07), 'crack', { v: 0.4 + i * 0.06 });

  // ---------- L27: sepia nursery, the stork and the seeds (zoom 3) ----------
  function nursery(g, t) {
    const W = g.W, H = g.H;
    g.rect(0, 0, W, 50, P.tan);
    for (let x = 0; x < W; x += 10) g.vline(x, 0, 49, P.clay);
    g.rect(0, 50, W, H - 50, P.brown);
    g.rect(0, 50, W, 1, P.brown);
    // window with the night and a moon
    g.rect(116, 6, 34, 26, P.brown); g.rect(118, 8, 30, 22, P.blueD); g.disc(140, 16, 4, P.cream);
    // mobile
    g.vline(30, 0, 8, P.brown); g.hline(20, 40, 8, P.brown);
    for (let i = 0; i < 3; i++) { const y = 12 + Math.sin(t * 2 + i) * 1; g.vline(20 + i * 10, 8, y, P.brown); g.disc(20 + i * 10, y + 2, 2, [P.gold, P.pink, P.cyan][i]); }
    // four cribs, a baby in each
    for (let i = 0; i < 4; i++) {
      const cx = 18 + i * 36;
      g.rect(cx, 52, 28, 2, P.brown);
      for (let k = 0; k < 8; k++) g.vline(cx + 1 + k * 3.7, 52, 76, P.brown);
      g.rect(cx, 76, 28, 3, P.brown);
      const got = t > DROPS[i] + 0.35;
      const sb = babySprite('sit');
      g.spr(sb, cx + 14, 76 - (got && Math.floor(t * 4 + i) % 2 ? 1 : 0));
      if (got) {
        g.spr(personalSeed(40 + i, true), cx + 14, 62);
        sparkle(g, cx + 18, 58, (t - DROPS[i] - 0.35) % 0.7, ex(P.white), 2);
      }
    }
    // stork across the top dropping seeds
    const sx = lerp(-30, 200, prog(t, T0 + 0.1, 175.3, E.lin)), sy = 20 + Math.sin(t * 3) * 2;
    g.spr(stork(Math.floor(t * 6) % 2), sx, sy);
    DROPS.forEach((d, i) => {
      const a = t - d;
      if (a < 0 || a > 0.35) return;
      const cx = 18 + i * 36 + 14;
      g.spr(personalSeed(40 + i, true), lerp(cx, cx, a), lerp(sy + 4, 62, a / 0.35));
    });
  }

  // ---------- L28: the race at dusk, spent (zoom 2) ----------
  function dusk(g, t) {
    const W = g.W, H = g.H, a = t - T_RACE;
    g.vgrad(0, 0, W, [[0, P.purple], [40, P.magenta], [70, P.orange], [96, P.gold]], 2);
    for (let i = 0; i < 7; i++) {
      const x = ((i * 50 - a * 40) % 350 + 350) % 350 - 50;
      g.rect(x, 18, 42, 26, P.ink); g.frame(x, 18, 42, 26, P.redD);
      const msg = ['FASTER!', "DON'T", 'STOP!', 'No.1', 'RANK', 'HURRY'][i % 6];
      if (Math.floor(t * 4 + i) % 2 === 0) text(g, msg, x + 21, 27, { font: 'zh8', align: 'center', color: ex(P.hot) });
    }
    g.rect(0, 70, W, 65, P.blueD);
    for (let i = 0; i < 4; i++) g.hline(0, W, 76 + i * 14, P.blue);
    for (let x = -((a * 50) % 30); x < W; x += 30) g.vline(x, 70, 134, P.g5);
    for (let i = 0; i < 6; i++) {
      const x = 22 + i * 38 + Math.sin(a * 2 + i) * 4, y = 96 + (i % 2) * 18;
      const stumble = i === 2 && t > 178.6 && t < 179.6;
      drawCitizen(g, x, y, stumble ? { view: 'side', crouch: 5, lean: 3, armL: [4, 9], armR: [5, 9], expr: 'hurt' } : { ...folkPoses.run(t * 1.6 + i * 0.4, { expr: 'tired' }), lean: 2, bob: 1 }, CPAL, RACER);
      g.spr(bubble('sweat'), x + 7, y - 30 + (Math.floor(t * 3 + i) % 2));
      if (i % 2 === 0) {
        const hp = Math.max(2, 18 - a * 3 - i);
        g.rect(x - 9, y - 41, 18, 4, ex(P.ink)); g.rect(x - 8, y - 40, 16, 2, ex(P.g5)); g.rect(x - 8, y - 40, Math.round(16 * hp / 100) + 1, 2, ex(P.red));
      }
    }
  }

  // ---------- L29-L30: wide shot, field and track (zoom 1) ----------
  const camW = { x: 170, y: -92 };
  const RUN = Array.from({ length: 9 }, (_, i) => ({ x0: 384 + i * 31, lane: i % 3 }));
  function wide(g, t) {
    g.push(-camW.x, -camW.y);
    sky(g, 'dusk');
    city(g, 0.4);
    // racers: slow down as the rings pass, stop by T_WAVE, turn to the field
    ground(g, t, {
      grassR: 200,
      racers: (gg) => {
        RUN.forEach((r, i) => {
          const hitT = RINGS[0] + (r.x0 - F.spot) / 180;
          const k = prog(t, T_WAVES, T_WAVE + 0.5, E.outQ);
          const x = r.x0 + (1 - k) * Math.sin(t * 2 + i) * 6 + k * 0;
          const y = 92 + r.lane * 9;
          const stopped = t > T_WAVE + 0.3 + i * 0.08;
          drawCitizen(gg, x, y, stopped ? folkPoses.stand(t, { flip: true, expr: t > 187.4 ? 'wow' : 'surprised' }) : folkPoses.run(t * 2.4 * (1 - k * 0.7) + i * 0.3, { expr: 'tired' }), CPAL, RACER);
          const cr = clamp((t - hitT) / 3.5);
          if (cr < 1 || t < T_SHATTER) rankTag(gg, x, y - 33, (i * 4) % 9 + 1, { crack: cr });
        });
      },
    });
    for (let x = F.edge; x < F.fence; x += 8) { g.rect(x, 100, 8, 90, P.greenM); g.px(x + (x % 5), 104 + (x % 7), P.green); g.px(x + 5, 140 + (x % 6), P.green); }
    for (let i = 0; i < 16; i++) g.spr(uniqueFlower(400 + i, { small: true }), F.edge + 14 + i * 14 + (i % 3) * 3, 104 + (i % 4) * 7);
    heroFlower(g, F.spot, F.ground - 1, { grow: 1, open: 0.15 * prog(t, T_WAVES, T1, E.lin), t, sway: Math.sin(t * 2), height: 40 });
    glow(g, F.spot, F.ground - 46, 16 + 4 * m.pulse(t, 4), ex(P.yellow), 0.4);
    // the gardener waving them over
    const waving = t > T_WAVE;
    const wv = Math.floor(t * 4) % 2;
    drawGardener(g, F.spot + 18, F.ground, waving ? { ...pose.idle(t), expr: 'happy', armR: [4, wv ? -9 : -6], armL: [-1, 5] } : pose.idle(t, { expr: 'content' }));
    if (t > T_WAVE + 0.6) g.spr(bubble('heart'), F.spot + 20, F.ground - 32 - (Math.floor(t * 2) % 2));
    // rainbow rings rolling out
    RINGS.forEach((rt) => { if (t > rt) ringWave(g, F.spot, F.ground - 46, t - rt, { speed: 180, n: 3, gap: 8, max: 700, th: 2, cols: RAINBOW.map(ex) }); });
    g.pop();
  }

  const phase = (t) => (t < T_RACE ? 'nursery' : t < T_WAVES ? 'dusk' : 'wide');
  const crackPts = [[250, 120], [120, 70], [380, 200], [330, 50], [80, 210], [420, 110]];
  return {
    id: 'race2', t0: T0, t1: T1,
    zoom: (t) => ({ nursery: 3, dusk: 2, wide: 1 }[phase(t)]),
    draw(g, t) {
      const ph = phase(t);
      if (ph === 'nursery') nursery(g, t);
      else if (ph === 'dusk') dusk(g, t);
      else wide(g, t);
    },
    post(g, t) {
      const ph = phase(t);
      if (ph === 'nursery') {
        remapPass(g, 'sepia');
        const W = g.W, H = g.H;
        g.frame(1, 1, W - 2, H - 2, P.cream);
        for (const [x, y] of [[0, 0], [W - 3, 0], [0, H - 3], [W - 3, H - 3]]) g.rect(x, y, 3, 3, P.ink);
      } else if (ph === 'dusk') {
        grayPass(g, [], 8);
      } else {
        // the field keeps its colour, rings and everything they have passed light up a little
        grayPass(g, [{ x: F.edge - camW.x, y: 0, w: F.fence - F.edge - 2, h: g.H }, { x: F.spot - camW.x, y: 30 - camW.y, r: 120, sy: 0.9, soft: 14 }], 10);
      }
    },
    shake(t) {
      if (t < T_CRACK0) return null;
      const k = prog(t, T_CRACK0, T_SHATTER, E.inQ);
      return [(hash(Math.floor(t * 60)) - 0.5) * 2 * (1 + k * 5), (hash(Math.floor(t * 60) + 3) - 0.5) * 2 * (1 + k * 5)];
    },
    ui(g, t) {
      if (phase(t) === 'nursery' && Math.floor(t * 2) % 2 === 0) text(g, 'MEMORY', 18, 16, { font: 'en', color: P.cream, outline: P.brownD });
    },
    over(g, t) {
      if (t > T_CRACK0) {
        const k = prog(t, T_CRACK0, T_SHATTER - 0.05, E.inQ);
        const n = Math.min(crackPts.length, 1 + Math.floor(k * crackPts.length * 1.2));
        cracks(g, 77, Math.min(1, 0.3 + k), crackPts.slice(0, n), { len: 120 + 120 * k });
      }
    },
  };
};
