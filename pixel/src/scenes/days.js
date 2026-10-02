// 111.96 - 132.57  Interlude: days go by, then the storm comes.
//  111.96  time-lapse in half-bars: DAY 1, 2, 3, 5, 8, 12, 20, 30. Each day runs dawn -> day -> dusk ->
//          night. Spring watering, chatting to the sprout, sleeping by a campfire, a summer heatwave,
//          autumn leaves, winter snow (he holds his hat over the sprout), spring again, taller
//  121.66  WARNING: cloud banks roll in from both sides, the wind rises, he clutches his hat
//  126.5   lightning far away, twice
//  131.36  the two-beat hold: everything freezes, one raindrop falls onto the sprout's leaf
import { P, ex } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass, remapPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2, hash } from '../core/math.js';
import { drawGardener, pose, ITEMS, GARDENER, SPOUT } from '../art/gardener.js';
import { heldPoint } from '../art/rig.js';
import { bubble, uniqueFlower, cloudSprite } from '../art/props.js';
import { puff, sparkle, pour, glow, wind, petals, rain } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { F, sky, stars, city, ground, cloudBank } from '../art/field.js';

export default (ctx) => {
  const { m } = ctx;
  const T0 = 111.96, T_STORM = 121.66, T_WARN = 124.08, T_FREEZE = 131.36, T1 = 132.57;
  const D = (T_STORM - T0) / 8;
  const DAYS = [1, 2, 3, 5, 8, 12, 20, 30];
  const SEASON = ['spring', 'spring', 'spring', 'spring', 'summer', 'autumn', 'winter', 'spring'];
  const LIGHTNING = [126.51, 128.93];
  const SX = F.spot, G = F.ground;
  const R = 46;
  for (let i = 0; i < 8; i++) ctx.cue(T0 + i * D, 'dayflip', { v: 0.35, p: 1 + i * 0.06 });
  ctx.cue(T_WARN, 'warning');
  ctx.cue(T_WARN + 0.6, 'warning');
  ctx.cue(T_STORM, 'wind', { v: 0.5 });
  LIGHTNING.forEach((t) => ctx.cue(t, 'thunder'));
  ctx.cue(T_FREEZE, 'freeze');
  ctx.cue(132.42, 'plip');

  const dayAt = (t) => clamp(Math.floor((t - T0) / D), 0, 7);
  // phase within the day: 0..1 (0-.12 dawn, .12-.6 day, .6-.72 dusk, .72-1 night)
  const phaseAt = (t) => ((t - T0) / D) % 1;
  const skyOf = (i, ph) => {
    const s = SEASON[i];
    if (ph < 0.12) return 'dawn';
    if (ph < 0.6) return s === 'winter' ? 'snow' : 'day';
    if (ph < 0.72) return 'dusk';
    return 'night';
  };
  const growAt = (t) => 0.36 + 0.24 * prog(t, T0, T_STORM, E.lin);

  const cam = (t = 1e9) => {
    // continue from the pull-back that ended chorus 1 (zoom 1 centred at SX+30, 96), push in to zoom 2
    const k = prog(t, T0, T0 + 1.2, E.ioC);
    const z = lerp(1, 2, k), cx = lerp(SX + 30, SX, k), cy = lerp(96, 75.5, k);
    return { x: cx - 240 / z, y: cy - 135 / z, z };
  };
  const radAt = (t) => R + 14 * prog(t, T0, T_STORM, E.lin);

  function gardenerDay(g, t, i, ph) {
    const x = SX + 16, night = ph >= 0.72;
    if (night) {
      // asleep by a campfire
      const fx = SX + 34;
      g.rect(fx - 4, G - 2, 9, 2, P.brownD);
      const fl = Math.floor(t * 10) % 3;
      g.disc(fx, G - 5, 3 - (fl === 1 ? 1 : 0), ex(P.orange));
      g.disc(fx, G - 6, 1, ex(P.yellow));
      if (fl === 2) g.px(fx + 1, G - 10, ex(P.orange));
      glow(g, fx, G - 5, 14, ex(P.orange), 0.25);
      drawGardener(g, x, G, { view: 'side', flip: true, crouch: 6, legL: [5, 0], legR: [7, 0], armL: [-2, 5], armR: [-1, 6], expr: 'sleep', headDy: 1, scarf: 0 });
      const z = (t * 1.5) % 1;
      text(g, 'z', x + 4 + z * 6, G - 30 - z * 10, { font: 'zh8', color: P.white });
      text(g, 'Z', x + 8 + ((z + 0.5) % 1) * 6, G - 36 - ((z + 0.5) % 1) * 10, { font: 'zh8', color: P.white });
      return;
    }
    switch (i) {
      case 0: {
        const wx = SX + 17;
        const wp = { ...pose.idle(t), flip: true, expr: 'smile', armR: [7, -2], item: { s: ITEMS.canPour(), dy: 1 } };
        drawGardener(g, wx, G, wp);
        const [ox, oy] = heldPoint(GARDENER, wp, wp.item, SPOUT[0], SPOUT[1]);
        pour(g, wx + ox, G + oy, T0 + i * D, T0 + (i + 0.6) * D, t, { ground: G - 1, to: SX, col: P.cyan });
        break;
      }
      case 1: case 7: {
        const jump = i === 7 && m.sinceBeat(t) < 0.15 ? -3 : 0;
        drawGardener(g, x, G, { ...pose.front(t), expr: 'happy', bob: jump, armL: i === 7 ? [-3, -6] : [-2, 5], armR: i === 7 ? [3, -6] : [2, 5], armsFront: i === 7 });
        if (i === 1) g.spr(bubble('note'), x - 2, G - 34);
        break;
      }
      case 2: {
        drawGardener(g, x, G, { view: 'side', flip: true, crouch: 6, legL: [5, 0], legR: [7, 0], armL: [-3, 6], armR: [-2, 6], expr: 'content', scarf: t });
        g.spr(bubble('heart'), x - 2, G - 30);
        break;
      }
      case 3: {
        drawGardener(g, x, G, { ...pose.idle(t), flip: true, expr: 'smile', armR: [4, 1], armL: [3, 2] });
        break;
      }
      case 4: {
        // summer: hot, fanning with his hat... he keeps it on and fans with a hand
        const f = Math.floor(t * 8) % 2;
        drawGardener(g, x, G, { ...pose.front(t), expr: 'hurt', armR: [4, -4 - f * 2], armL: [-2, 5] });
        g.spr(bubble('sweat'), x - 8, G - 26);
        break;
      }
      case 5: {
        drawGardener(g, x, G, { ...pose.idle(t), flip: true, expr: 'smile', armR: [5, -2], armL: [4, 0] });
        break;
      }
      case 6: {
        // winter: holds his arms over the sprout like a little roof
        drawGardener(g, SX + 6, G, { view: 'side', flip: true, crouch: 3, lean: -2, armR: [-8, -2], armL: [-7, -3], expr: 'determined', scarf: t * 2 });
        break;
      }
    }
  }

  function seasonFx(g, t, i) {
    const s = SEASON[i];
    if (s === 'autumn') petals(g, t, { n: 30, cols: [P.orange, P.rust, P.gold, P.clay], drift: 20 });
    if (s === 'winter') {
      for (let k = 0; k < 60; k++) {
        const per = 6 + hash2(k, 3) * 3, ph = (t / per + hash2(k, 4)) % 1;
        const x = SX - 140 + hash2(k, 5) * 280 + Math.sin(t * 2 + k) * 4, y = -20 + ph * 170;
        g.px(x, y, P.white);
      }
      g.rect(F.edge, 99, F.fence - F.edge, 2, P.white);
      for (let k = 0; k < 90; k++) g.px(F.edge + hash2(k, 61) * (F.fence - F.edge), 102 + hash2(k, 62) * 30, P.white);
    }
    if (s === 'summer') {
      const sx = SX - 70, sy = 0;
      g.disc(sx, sy, 12, ex(P.gold)); g.disc(sx, sy, 10, ex(P.yellow));
    }
  }

  return {
    id: 'days', t0: T0, t1: T1,
    zoom: (t) => cam(t).z,
    draw(g, t) {
      const freeze = t >= T_FREEZE;
      const tt = freeze ? T_FREEZE : t;
      const c = cam(t);
      g.push(-Math.round(c.x), -Math.round(c.y));
      if (tt < T_STORM) {
        const i = dayAt(tt), ph = phaseAt(tt);
        const cur = skyOf(i, ph), nxt = skyOf(i, (ph + 0.04) % 1);
        sky(g, cur, nxt !== cur ? nxt : null, 0.5);
        const night = ph >= 0.72, sunK = clamp((ph - 0.05) / 0.6);
        if (!night && ph > 0.05 && ph < 0.68 && SEASON[i] !== 'winter') {
          const ax = SX - 130 + sunK * 260, ay = 70 - Math.sin(sunK * Math.PI) * 70;
          g.disc(ax, ay, 7, ex(P.gold)); g.disc(ax, ay, 5, ex(P.yellow));
        }
        if (night) { stars(g, tt); g.disc(SX + 80, 16, 6, ex(P.cream)); g.disc(SX + 83, 14, 5, P.ink); }
        city(g, night ? 1 : 0);
        ground(g, tt, { grassR: radAt(tt), racers: null });
        // little flowers turning up over the days
        for (let k = 0; k < 7; k++) {
          if (i < 2 + k) continue;
          const fx = SX + [-30, 26, -46, 40, -18, 52, -58][k], fy = G + [4, 6, 9, 3, 10, 8, 5][k];
          g.spr(uniqueFlower(300 + k, { small: true }), fx, fy);
        }
        heroFlower(g, SX, G - 1, { grow: growAt(tt), open: 0, t: tt, sway: Math.sin(tt * 2) * 0.8, height: 40 });
        seasonFx(g, tt, i);
        gardenerDay(g, tt, i, ph);
      } else {
        // the storm gathers
        const k = prog(tt, T_STORM, 127.5, E.ioQ);
        sky(g, 'day', 'storm', clamp(k * 1.2));
        city(g, 0);
        ground(g, tt, { grassR: radAt(tt), wind: k * 2 });
        for (let q = 0; q < 7; q++) {
          const fx = SX + [-30, 26, -46, 40, -18, 52, -58][q], fy = G + [4, 6, 9, 3, 10, 8, 5][q];
          g.spr(uniqueFlower(300 + q, { small: true }), fx + Math.round(Math.sin(tt * 8 + q) * k), fy);
        }
        heroFlower(g, SX, G - 1, { grow: growAt(tt), open: 0, t: tt, sway: Math.sin(tt * 6) * (1 + k * 2), height: 40 });
        cloudBank(g, tt, k, -1);
        cloudBank(g, tt, k, 1);
        wind(g, tt, { n: Math.round(4 + k * 14), speed: 260, col: P.g1, y0: 0, y1: 130 });
        const x = SX + 16;
        drawGardener(g, x, G, { ...pose.idle(tt), flip: true, expr: 'worried', armR: [1, -10], armL: [-1, 4], wind: 1 + k * 2, scarf: tt * 3, headDx: Math.round(Math.sin(tt * 7) * 0.6) });
        if (tt > 125) g.spr(bubble('sweat'), x - 8, G - 26);
      }
      // the single raindrop of the hold
      if (freeze) {
        const k = prog(t, T_FREEZE + 0.15, 132.42, E.inQ);
        const dy = lerp(-30, G - 30, k);
        g.rect(SX + 2, dy, 1, 3, P.cyan); g.px(SX + 2, dy - 1, P.white);
        if (t > 132.42) { g.px(SX, G - 30, P.cyan); g.px(SX + 4, G - 30, P.cyan); }
      }
      g.pop();
    },
    post(g, t) {
      const c = cam(t);
      grayPass(g, [{ x: SX - c.x, y: G - 2 - c.y, r: radAt(Math.min(t, T_STORM)) * 1.35, sy: 0.55, soft: 8 }], 8);
      // lightning flashes
      for (const lt of LIGHTNING) if (t > lt && t < lt + 0.12) remapPass(g, 'white', 0.6);

    },
    ui(g, t) {
      if (t < T_STORM + 0.5) {
        const i = dayAt(t);
        const since = t - (T0 + i * D);
        const flip = since < 0.1 ? -2 : 0;
        g.rect(14, 12, 104, 22, P.ink);
        g.frame(14, 12, 104, 22, P.white);
        text(g, 'DAY ' + DAYS[i], 22, 16 + flip, { font: 'en', scale: 2, color: P.white });
      }
      if (t > T_WARN && t < T_WARN + 2.6) {
        const a = t - T_WARN;
        if (Math.floor(a * 5) % 2 === 0) {
          for (let x = -((a * 120) % 24); x < g.W; x += 24) { g.poly([[x, 112], [x + 12, 112], [x + 4, 124], [x - 8, 124]], P.hot); }
          g.rect(0, 124, g.W, 26, P.ink);
          text(g, 'WARNING', g.W / 2, 129, { font: 'en', scale: 2, align: 'center', color: P.hot });
          for (let x = -((a * 120) % 24); x < g.W; x += 24) { g.poly([[x, 150], [x + 12, 150], [x + 4, 162], [x - 8, 162]], P.hot); }
        }
      }
    },
  };
};
