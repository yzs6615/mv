// 90.14 - 111.96  Chorus 1: off the track.
//  L14 "用清脆步伐"            he turns his back on the race and takes five crisp steps, one per syllable
//  L15 "你是这世界上 最特别的花"  at the barren NO RANK field by the edge of the map he digs and plants
//  L16 "每个人 每个人 都是种子在发芽" waters it from an old can; on "发芽" LEVEL UP and a lopsided sprout
//  L17 "这朵花成长 一定会绽放开花"  a small circle of warm colour spreads from the sprout and catches him
//  L18 "汗水灌溉 就让色彩留下"     a drop of sweat widens the circle; he sits down beside it; pull back
import { P, ex } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2, hash } from '../core/math.js';
import { drawGardener, pose, seedSprite, ITEMS, GARDENER, SPOUT } from '../art/gardener.js';
import { heldPoint } from '../art/rig.js';
import { drawCitizen, folkPoses, RACER, CPAL } from '../art/folk.js';
import { bubble, uniqueFlower, cloudSprite } from '../art/props.js';
import { puff, sparkle, burst, pour, lightPillar, glow, ringWave } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { levelUp } from '../art/ui.js';

export const FIELD = { spot: 300, fence: 360, edge: 120, ground: 116 };

export default (ctx) => {
  const { m, lyrics } = ctx;
  const T0 = 90.14, T1 = 112.4;
  const line = (i) => lyrics.lines[i] || { chars: [] };
  const STEPS = line(14).chars.map((c) => c.t).filter((t) => t >= 90.5);
  const T_TURN = 90.1, T_ARRIVE = 92.9, DIG = [93.26, 93.78, 94.52], T_DROP = 94.89, PAT = [95.36, 95.88], T_SHINE = 96.44;
  const T_CAN = 97.38, WATER0 = 97.7, WATER1 = 100.9, T_SPROUT = 101.24, T_COLOR = 102.22, T_BLOOMS = 105.16;
  const T_WIPE = 107.04, T_SPLASH = 108.09, T_SIT = 109.3, T_PULL = 110.0;
  const G = FIELD.ground, SX = FIELD.spot;
  const X0 = 410, XA = SX + 12;

  ctx.cue(T_TURN, 'turn');
  STEPS.forEach((t) => ctx.cue(t, 'step8', { v: 0.75 }));
  DIG.forEach((t) => ctx.cue(t, 'dig'));
  ctx.cue(T_DROP, 'plip');
  PAT.forEach((t) => ctx.cue(t, 'pat'));
  ctx.cue(T_SHINE, 'sparkle');
  ctx.cue(T_CAN, 'itempop');
  for (let t = WATER0; t < WATER1; t += m.beat / 2) ctx.cue(t, 'drop', { v: 0.35 });
  ctx.cue(T_SPROUT, 'levelup');
  ctx.cue(T_COLOR, 'colorwave');
  ctx.cue(T_BLOOMS, 'pops');
  ctx.cue(T_SPLASH, 'splash');
  ctx.cue(T_SIT, 'sit', { v: 0.4 });

  const gx = (t) => {
    if (t < STEPS[0]) return X0;
    // five deliberate steps, then a short walk to the spot
    const n = STEPS.filter((s) => t >= s).length;
    let x = X0 - n * 14;
    const last = STEPS[n - 1];
    if (n > 0 && t - last < 0.12) x += 14 * (1 - (t - last) / 0.12);
    if (t > 92.27) x = lerp(X0 - 70, XA, prog(t, 92.27, T_ARRIVE, E.ioQ));
    return x;
  };
  const cam = (t) => {
    // zoom 2 following him; zoom 3 close on the planting; back to 2 as the colour spreads; 1 at the end
    const fx = clamp(gx(t) + 10, SX + 20, 450);
    let z = 2, cx = fx, cy = 84;
    const kin = prog(t, 92.5, 93.3, E.ioC), kout = prog(t, T_COLOR + 0.1, T_COLOR + 1.2, E.ioC);
    const z3 = kin * (1 - kout);
    z = lerp(2, 3, z3);
    cx = lerp(fx, SX + 4, kin);
    cy = lerp(84, G - 26, z3);
    const k = prog(t, T_PULL, 111.9, E.ioC);
    z = lerp(z, 1, k);
    cx = lerp(cx, SX + 30, k); cy = lerp(cy, 96, k);
    return { x: cx - 240 / z, y: cy - 135 / z, z };
  };
  const radius = (t) => {
    if (t < T_COLOR) return 0;
    let r = 36 * prog(t, T_COLOR, T_COLOR + 1.4, E.outBack);
    r += 10 * prog(t, T_SPLASH, T_SPLASH + 0.6, E.outBack);
    if (t > T_COLOR + 1.4) r += 2 * m.barPulse(t, 4);
    return r;
  };

  function world(g, t) {
    // sky: in colour (the circle shows it), grayed elsewhere
    g.vgrad(-400, -200, 1600, [[0, P.blueD], [150, P.blue], [250, P.cyan], [290, P.white]], 2);
    for (let i = 0; i < 6; i++) g.spr(cloudSprite(i + 30, 60 + (i % 3) * 20, 22, [P.white, P.g1, P.g2]), 40 + i * 140 + ((t * 4) % 140), 20 + (i % 3) * 12);
    // distant city skyline
    for (let i = 0; i < 40; i++) {
      const x = -100 + i * 30, h = 18 + Math.floor(hash2(i, 9) * 34);
      const bc = [P.clay, P.tan, P.blueD, P.purple, P.rust, P.greenD][i % 6];
      g.rect(x, 78 - h, 26, h, bc);
      for (let k = 0; k < 4; k++) for (let j = 0; j < h - 8; j += 7) g.px(x + 4 + k * 6, 78 - h + 6 + j, P.yellow);
    }
    // ground plane
    g.rect(-400, 78, 1600, 200, P.greenM);
    for (let x = -400; x < 1200; x += 7) g.px(x + (x % 3), 82 + (x % 11), P.green);
    // the track (right of the fence), lanes
    g.rect(FIELD.fence, 80, 900, 40, P.blueD);
    for (let i = 0; i < 4; i++) g.hline(FIELD.fence, 1300, 84 + i * 10, P.blue);
    g.rect(FIELD.fence, 120, 900, 3, P.cyan);
    // racers streaming right in the back lanes
    g.ctx.save();
    g.ctx.beginPath();
    g.ctx.rect(FIELD.fence + 2 + g.ox, -1000, 4000, 3000);
    g.ctx.clip();
    for (let i = 0; i < 10; i++) {
      const x = ((i * 71 + (t - T0) * (95 + hash2(i, 2) * 30)) % 700) + FIELD.fence - 60;
      if (x < FIELD.fence - 10) continue;
      drawCitizen(g, x, 92 + (i % 3) * 9, folkPoses.run(t * 2.6 + i * 0.3, { expr: 'tired' }), CPAL, RACER);
    }
    g.ctx.restore();
    // the gate pillar at the end of the track: the runners come out from behind it
    g.rect(FIELD.fence + 1, 56, 12, 66, P.ink);
    g.rect(FIELD.fence + 2, 57, 10, 64, P.g3);
    g.rect(FIELD.fence + 2, 57, 2, 64, P.g2);
    g.rect(FIELD.fence + 2, 57, 10, 3, P.g2);
    g.rect(FIELD.fence + 4, 66, 6, 9, P.g4);
    text(g, '1', FIELD.fence + 7, 67, { font: 'zh8', align: 'center', color: P.g1 });
    // fence and sign
    for (let y = 82; y < 122; y += 6) g.hline(FIELD.fence - 2, FIELD.fence + 2, y, P.g4);
    for (let i = 0; i < 3; i++) g.rect(FIELD.fence - 1 + i * 0, 76 + i * 0, 3, 46, P.g4);
    g.rect(FIELD.fence - 40, 58, 38, 21, P.ink);
    g.rect(FIELD.fence - 39, 59, 36, 19, P.white);
    text(g, 'NO', FIELD.fence - 21, 60, { font: 'en', align: 'center', color: P.red });
    text(g, 'RANK', FIELD.fence - 21, 69, { font: 'en', align: 'center', color: P.red });
    g.vline(FIELD.fence - 21, 79, 116, P.brown);
    // barren field: cracked soil
    g.rect(-400, 100, FIELD.fence + 400, 100, P.brown);
    g.rect(-400, 100, FIELD.fence + 400, 2, P.clay);
    for (let i = 0; i < 70; i++) {
      const x = FIELD.edge + hash2(i, 1) * (FIELD.fence - FIELD.edge), y = 104 + hash2(i, 2) * 26;
      g.line(x, y, x + 3 + hash2(i, 3) * 5, y + (hash2(i, 4) - 0.5) * 4, P.brownD);
    }
    for (let i = 0; i < 14; i++) {
      const x = FIELD.edge + 10 + hash2(i, 6) * (FIELD.fence - FIELD.edge - 20), y = 112 + hash2(i, 7) * 12;
      g.vline(x, y - 3, y, P.tan); g.px(x + 1, y - 4, P.tan);
    }
    // the edge of the map: the ground stops, the void beyond
    g.rect(-400, 0, FIELD.edge + 400, 300, P.ink);
    for (let y = 4; y < 300; y += 12) for (let x = -400 + ((y / 12) % 2) * 6; x < FIELD.edge; x += 12) g.px(x, y, P.g5);
    g.rect(FIELD.edge - 2, 100, 2, 60, P.brownD);
    text(g, 'MAP EDGE', FIELD.edge - 40, 120, { font: 'zh8', align: 'center', color: P.g4 });

    // planted spot, the sprout and flora inside the colour
    const r = radius(t);
    if (r > 2) {
      // grass grows where the colour is
      for (let x = Math.floor(SX - r * 1.4); x < SX + r * 1.4; x += 2) {
        const d = Math.abs(x - SX);
        if (d > r * 1.15) continue;
        const h = Math.max(0, Math.round((1 - d / (r * 1.15)) * 5 + hash2(x, 3) * 2));
        g.rect(x, 101 - h, 2, h, hash2(x, 5) < 0.5 ? P.green : P.greenM);
        g.rect(x, 101, 2, 4 + Math.round(hash2(x, 7) * 3), P.greenM);
      }
      for (let i = 0; i < 40; i++) {
        const x = SX + (hash2(i, 51) - 0.5) * r * 2.4, y = 104 + hash2(i, 52) * 24;
        if (Math.hypot((x - SX) / 1.2, y - G) > r) continue;
        g.px(x, y, P.green); g.px(x, y - 1, P.greenM);
      }
    }
    if (t > DIG[0]) {
      const hole = t < T_DROP + 0.4;
      g.rect(SX - 4, G - 1, 9, 2, hole ? P.ink : P.brownD);
      g.rect(SX - 6, G - 2, 3, 1, P.brownD); g.rect(SX + 4, G - 2, 3, 1, P.brownD);
    }
    if (t > T_SPROUT) {
      const grow = 0.18 + 0.12 * prog(t, T_SPROUT, T_SPROUT + 0.35, E.outBack) + 0.06 * prog(t, T_COLOR, 106, E.outQ);
      heroFlower(g, SX, G - 1, { grow, open: 0, t, sway: Math.sin(t * 2.2) * 0.8, height: 40 });
    }
    if (t > T_BLOOMS) {
      for (let i = 0; i < 9; i++) {
        const a = hash2(i, 31) * Math.PI * 2, d = 10 + hash2(i, 33) * (r - 8);
        const fx = SX + Math.cos(a) * d * 1.3, fy = G + 1 + Math.abs(Math.sin(a)) * 8;
        const born = T_BLOOMS + i * 0.12;
        if (t < born || d > r - 4) continue;
        const k = prog(t, born, born + 0.25, E.outBack);
        if (i % 3 === 0) { g.vline(fx, fy - 3 * k, fy, P.green); g.px(fx - 1, fy - 2 * k, P.greenM); }
        else g.spr(uniqueFlower(100 + i, { small: true }), fx, fy + 6 - Math.round(6 * k));
      }
      // butterfly
      const bt = t - T_BLOOMS;
      const bx = SX - 30 + Math.sin(bt * 1.3) * 26, by = G - 30 + Math.sin(bt * 3.1) * 8;
      const fl = Math.floor(t * 10) % 2;
      g.px(bx, by, P.ink);
      g.rect(bx - 2, by - (fl ? 2 : 1), 2, fl ? 2 : 1, P.pink); g.rect(bx + 1, by - (fl ? 2 : 1), 2, fl ? 2 : 1, P.pink);
    }
  }

  function gardener(g, t) {
    let x = gx(t);
    let p;
    let spout = null;
    if (t < T_TURN) p = { ...pose.idle(t), expr: 'surprised' };
    else if (t < STEPS[0]) p = { ...pose.front(t), expr: 'determined' };
    else if (t < T_ARRIVE) {
      const n = STEPS.filter((s) => t >= s).length;
      const since = n ? t - STEPS[n - 1] : 1;
      if (t < 92.27) p = { ...pose.walk(n * 0.5 + Math.min(0.5, since * 2.5), { stride: 4 }), flip: true, expr: 'determined', bob: since < 0.08 ? 1 : 0 };
      else p = { ...pose.walk((t - 92.27) * 2.2), flip: true, expr: 'neutral' };
    } else if (t < T_DROP + 0.2) {
      // dig: kneel, scoop on each beat
      const last = DIG.filter((d) => t >= d).pop();
      const s = last ? t - last : 1;
      p = { ...pose.idle(t), flip: true, crouch: 4, legL: [-3, 0], legR: [4, 0], armR: [5 - (s < 0.15 ? 2 : 0), 8 + (s < 0.15 ? 1 : 0)], armL: [3, 7], expr: 'determined' };
      if (t > T_DROP - 0.4) p = { ...p, armR: [5, 6], item: { s: seedSprite(t * 10), dx: 1, dy: 0 } };
    } else if (t < T_CAN) {
      const last = PAT.filter((d) => t >= d).pop();
      const s = last ? t - last : 1;
      p = { ...pose.idle(t), flip: true, crouch: 4, legL: [-3, 0], legR: [4, 0], armR: [5, 7 + (s < 0.12 ? 1 : 0)], armL: [4, 7 + (s < 0.12 ? 1 : 0)], expr: t > T_SHINE ? 'content' : 'smile' };
    } else if (t < T_SPROUT) {
      // watering: a step back, the can held out over the spot; the water leaves from its spout
      const pourOn = t > WATER0;
      x = lerp(x, SX + 17, prog(t, T_CAN, T_CAN + 0.25, E.outQ));
      p = { ...pose.idle(t), flip: true, expr: 'smile', armR: [7, -2], item: { s: pourOn ? ITEMS.canPour() : ITEMS.can(), dx: 0, dy: 1 } };
      if (pourOn) { const [ox, oy] = heldPoint(GARDENER, p, p.item, SPOUT[0], SPOUT[1]); spout = [x + ox, G + oy]; }
    } else if (t < T_COLOR) {
      const a = t - T_SPROUT;
      p = { view: 'front', armL: [-3, -7], armR: [3, -7], armsFront: true, expr: 'happy', bob: a < 0.15 ? -3 : a < 0.3 ? -1 : 0, scarf: t * 2 };
    } else if (t < T_WIPE) {
      const a = t - T_COLOR;
      p = a < 1.8 ? { ...pose.front(t), expr: 'wow', armL: [-4, 2], armR: [4, 2] } : { ...pose.front(t), expr: 'happy', armL: [-3, 3 + (Math.floor(m.beatF(t)) % 2)], armR: [3, 3 + (Math.floor(m.beatF(t) + 1) % 2)] };
    } else if (t < T_SIT) {
      p = { ...pose.idle(t), flip: true, expr: 'content', armR: [3, -6], headDy: 0 };
    } else {
      // sitting beside the sprout
      p = { view: 'side', flip: true, crouch: 6, legL: [5, 0], legR: [7, 0], armL: [-3, 6], armR: [-2, 6], expr: (t % 3.3) < 0.15 ? 'blink' : 'content', scarf: t };
    }
    drawGardener(g, t < T_SIT ? x : x + 4, G, p);
    // water
    if (spout) pour(g, spout[0], spout[1], WATER0, WATER1, t, { ground: G - 1, to: SX, col: P.cyan });
    // sweat drop flying off to the soil
    if (t > T_WIPE + 0.3 && t < T_SPLASH + 0.1) {
      const k = prog(t, T_WIPE + 0.3, T_SPLASH, E.inQ);
      const dx = x - 4 - k * 10, dy = G - 26 + k * 25 - Math.sin(k * Math.PI) * 8;
      g.spr(bubble('sweat'), dx, dy);
    }
    if (t > T_SPLASH && t < T_SPLASH + 0.6) ringWave(g, SX - 12, G, t - T_SPLASH, { speed: 50, n: 2, gap: 6, max: 40, cols: [P.cyan, P.white] });
  }

  return {
    id: 'plant', t0: T0, t1: T1,
    zoom: (t) => cam(t).z,
    draw(g, t) {
      const c = cam(t);
      g.push(-Math.round(c.x), -Math.round(c.y));
      world(g, t);
      gardener(g, t);
      if (t > T_SHINE && t < T_SHINE + 0.8) burst(g, SX, G - 4, t - T_SHINE, { n: 6, r: 10, cols: [P.white, P.yellow] });
      if (t > T_SPROUT) {
        lightPillar(g, SX, G, t - T_SPROUT, { h: 140, w: 10 });
        burst(g, SX, G - 16, t - T_SPROUT, { n: 10, r: 22, cols: [P.white, P.yellow, P.pink, P.cyan] });
      }
      if (t > T_COLOR && t < T_COLOR + 1.2) ringWave(g, SX, G - 6, t - T_COLOR, { speed: 60, n: 3, gap: 8, max: 60 });
      g.pop();
    },
    post(g, t) {
      const c = cam(t);
      const zones = [];
      const r = radius(t);
      if (r > 0) zones.push({ x: SX - c.x, y: G - 2 - c.y, r: r * 1.35, sy: 0.62, soft: 8 });
      // the seed and the sprout keep their colour before the circle opens
      grayPass(g, zones, 8);
    },
    ui(g, t) {
      const c = cam(t);
      const sx = (SX - c.x) * c.z, sy = (G - 50 - c.y) * c.z;
      levelUp(g, sx, sy, t - T_SPROUT);
    },
  };
};
