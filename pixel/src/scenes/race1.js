// 70.75 - 90.14  Pre-chorus 1, a fast montage in cold colours.
//  L10 "回想起我们 从儿语牙牙"  memory in Game Boy green: a nursery where the babies already race on
//                              a crawl mat, numbered; baby gardener (tiny straw hat) sits and plays
//  L11 "就怕 输掉明天 付出代价"  a cold digital start line under a TOMORROW clock; 3, 2, 1...
//  L12 "所有的人 ... 第一个到达"  GO! A Mode-7 race: heads-down runners with 1st/2nd/3rd tags jostling,
//                              some burning out to white and falling behind
//  L13 "你不会落后 不要害怕"     side view in slow motion: the gray gardener swept along by the
//                              crowd, clutching the glitchy seed; he skids to a stop at the end
import { P, ex, grayPalette, exPalette } from '../core/pal.js';
import { text } from '../core/font.js';
import { remapPass } from '../core/post.js';
import { abgr } from '../core/post.js';
import { E, prog, clamp, lerp, hash2, hash } from '../core/math.js';
import { drawGardener, pose, seedSprite, GPAL } from '../art/gardener.js';
import { drawCitizen, citizenSprite, folkPoses, RACER, CPAL, babySprite, BPAL } from '../art/folk.js';
import { mode7, project7, bubble, ICON } from '../art/props.js';
import { puff, sparkle, glow, ringWave, wind } from '../art/fx.js';
import { rankTag, popText } from '../art/ui.js';
import { uniqueFlower } from '../art/props.js';

export default (ctx) => {
  const { m } = ctx;
  const T0 = 70.75, T_COLD = 75.6, C3 = 78.63, C2 = 79.24, C1 = 79.84, GO = 80.45, T_SIDE = 84.8, T_STOP = 89.1, T1 = 90.6;
  const GG = grayPalette(GPAL);
  const RP = { ...CPAL };
  ctx.cue(T0, 'memory');
  for (let i = 0; i < 6; i++) ctx.cue(m.beatTime(Math.ceil(m.beatF(72.77)) + i), 'crawl', { v: 0.25 });
  ctx.cue(T_COLD, 'cold');
  ctx.cue(C3, 'beep'); ctx.cue(C2, 'beep'); ctx.cue(C1, 'beep');
  ctx.cue(GO, 'go');
  ctx.cue(GO + 0.05, 'gun');
  for (let t = GO; t < T_SIDE; t += 0.15) ctx.cue(t, 'step', { v: 0.12 });
  ctx.cue(T_SIDE, 'slowmo');
  for (let i = 0; i < 7; i++) ctx.cue(m.beatTime(Math.ceil(m.beatF(T_SIDE + 0.2)) + i), 'heart', { v: 0.45 });
  ctx.cue(T_STOP, 'skid');

  // ---------- L10 nursery (Game Boy green, zoom 3: 160 x 90) ----------
  function nursery(g, t) {
    const W = g.W, H = g.H;
    g.rect(0, 0, W, 50, P.cream);
    for (let x = 0; x < W; x += 10) g.vline(x, 0, 49, P.peach);
    g.rect(0, 50, W, H - 50, P.tan);
    g.rect(0, 50, W, 1, P.brown);
    // poster, clock, cribs
    g.rect(8, 8, 34, 22, P.white); g.frame(8, 8, 34, 22, P.brown);
    text(g, '第一名', 25, 13, { align: 'center', color: P.red });
    g.disc(140, 18, 9, P.brown); g.disc(140, 18, 7, P.white);
    const a = t * 7;
    g.line(140, 18, 140 + Math.cos(a) * 6, 18 + Math.sin(a) * 6, P.ink);
    g.line(140, 18, 140 + Math.cos(a / 12) * 4, 18 + Math.sin(a / 12) * 4, P.ink);
    for (let i = 0; i < 3; i++) {
      const cx = 56 + i * 24;
      g.rect(cx, 26, 20, 2, P.brown);
      for (let k = 0; k < 6; k++) g.vline(cx + 1 + k * 3.6, 26, 46, P.brown);
      g.rect(cx, 46, 20, 2, P.brown);
      text(g, 'No.' + (i + 1), cx + 10, 17, { font: 'zh8', align: 'center', color: P.brown });
    }
    // crawl mat, lanes, ribbon
    g.rect(30, 54, 128, 34, P.white);
    for (let i = 1; i < 3; i++) g.hline(30, 157, 54 + i * 11, P.g1);
    g.vline(146, 50, 88, P.red);
    g.rect(145, 49, 3, 3, P.red);
    // three babies racing, tags above
    const race = prog(t, 72.4, 75.5, E.lin);
    const sp = [0.95, 0.7, 0.82];
    const xs = sp.map((v, i) => 40 + Math.min(1, race * v) * 96 + i * 3);
    const order = xs.map((x, i) => [x, i]).sort((p, q) => q[0] - p[0]).map((p) => p[1]);
    for (let i = 0; i < 3; i++) {
      const x = xs[i], y = 63 + i * 11;
      const f = Math.floor(m.beatF(t) * 2 + i) % 2;
      g.spr(babySprite(f ? 'crawl1' : 'crawl2'), x, y);
      if (t > 72.5) rankTag(g, x + 1, y - 8, order.indexOf(i) + 1, { small: true });
    }
    // baby gardener, sitting aside with a flower
    const bx = 14, by = 84;
    g.spr(babySprite('sit'), bx, by);
    g.rect(bx - 5, by - 12, 11, 2, P.gold); g.rect(bx - 3, by - 14, 7, 2, P.gold); g.rect(bx - 3, by - 13, 7, 1, P.red);
    g.spr(uniqueFlower(5, { small: true }), bx + 8, by);
    if (t > 73.7) g.spr(bubble('heart'), bx + 1, by - 15 - (t - 73.7 < 0.08 ? 1 : 0));
  }

  // ---------- L11 start line (cold, zoom 2: 240 x 135) ----------
  function startLine(g, t) {
    const W = g.W, H = g.H;
    g.vgrad(0, 0, W, [[0, P.ink], [40, P.g5], [80, P.blueD], [98, P.blue]], 2);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(hash2(i, 1) * W);
      const y = ((t * (20 + hash2(i, 2) * 30) + hash2(i, 3) * 100) % 100) - 8;
      text(g, String(Math.floor(hash2(i, Math.floor(t * 8)) * 10)), x, y, { font: 'zh8', color: i % 3 ? P.blueD : P.blue });
    }
    // clock board
    g.rect(60, 8, 120, 34, P.ink);
    g.frame(60, 8, 120, 34, P.cyan);
    text(g, 'TOMORROW', 120, 12, { font: 'en', align: 'center', color: P.cyan });
    const left = Math.max(0, GO - t);
    text(g, '00:' + left.toFixed(2).padStart(5, '0'), 120, 25, { font: 'en', align: 'center', color: left < 2 ? P.hot : P.white });
    // track
    g.rect(0, 98, W, 37, P.blueD);
    for (let i = 0; i < 3; i++) g.hline(0, W, 104 + i * 11, P.blue);
    g.rect(36, 98, 2, 37, P.white);
    // racers at the line, identical, crouching as the count starts
    const crouch = t > C3 - 0.3;
    const xs = [24, 58, 92, 160, 194, 226];
    xs.forEach((x, i) => {
      drawCitizen(g, x, 124 - (i % 2) * 6, crouch ? { view: 'side', crouch: 5, lean: 2, legL: [-5, 0], legR: [4, 0], armL: [3, 8], armR: [4, 8], expr: 'determined' } : folkPoses.stand(t, { expr: 'tired' }), RP, RACER);
    });
    // the gardener, standing, looking around
    const gx = 126, gy = 121;
    const look = Math.floor((t - T_COLD) * 1.6) % 2;
    drawGardener(g, gx, gy, { ...pose.idle(t), flip: !!look, expr: 'worried', armR: [3, 2], item: { s: seedSprite(t * 10, ex), dx: 1, dy: -1 } }, GG);
    if (t > 76.4) g.spr(bubble('sweat'), gx + (look ? -9 : 9), gy - 24);
  }

  // ---------- L12 Mode-7 race (zoom 1) ----------
  const TRACK_W = 96;
  const C_LINE = abgr(P.cyan), C_DARK = abgr(P.blueD), C_MID = abgr(P.g5), C_VOID = abgr(P.ink), C_EDGE = abgr(P.white), C_LANE = abgr(P.blue), C_HOT = abgr(P.hot);
  function floor(wx, wz, z, x, y) {
    const ax = Math.abs(wx);
    if (ax > TRACK_W + 30) {
      // void with a sparse grid
      const gx = ((wx % 40) + 40) % 40, gz = ((wz % 40) + 40) % 40;
      return gx < 1 + z * 0.01 || gz < 1 + z * 0.01 ? C_MID : C_VOID;
    }
    if (ax > TRACK_W) return (Math.floor(wz / 12) % 2 === 0) ? C_EDGE : C_HOT;
    const lz = ((wz % 24) + 24) % 24;
    const lane = ((wx + TRACK_W) % 32 + 32) % 32;
    if (lane < 1.2 + z * 0.006 && lz < 14) return C_LANE;
    if (lz < 1 + z * 0.01) return C_LINE;
    return C_DARK;
  }
  const runners = Array.from({ length: 14 }, (_, i) => ({ lane: -80 + (i % 6) * 32 + (hash2(i, 5) - 0.5) * 10, z0: 30 + i * 22 + hash2(i, 7) * 10, v: 220 + hash2(i, 9) * 40, burn: i % 4 === 1 ? 81.3 + hash2(i, 11) * 2.4 : 1e9 }));
  function race(g, t) {
    const W = g.W, H = g.H;
    const a = t - GO;
    const camZ = a * 230, cam = { x: Math.sin(a * 1.3) * 10, z: camZ, h: 34, f: 210, hz: 92 };
    // sky
    g.vgrad(0, 0, W, [[0, P.ink], [40, P.g5], [80, P.blueD], [93, P.blue]], 2);
    // finish gate far away, approaching on "第一个到达"
    const gateZ = camZ + lerp(900, 260, prog(t, 82.9, 84.5, E.inQ));
    mode7(g, cam, floor);
    const gp = project7(cam, W, 0, gateZ, 60);
    if (gp) {
      const [sx, sy, s] = gp;
      const gw = TRACK_W * s;
      g.rect(sx - gw, sy, 3, cam.hz + cam.h * s - sy, P.white);
      g.rect(sx + gw - 3, sy, 3, cam.hz + cam.h * s - sy, P.white);
      g.rect(sx - gw, sy - 10 * s, gw * 2, 10 * s, P.hot);
      if (s > 0.25) text(g, 'GOAL  1st ONLY', sx, sy - 9 * s, { font: 'en', align: 'center', color: P.white, scale: s > 0.6 ? 2 : 1 });
    }
    // runners, far to near
    const list = runners.map((r, i) => {
      const burnt = t > r.burn;
      const z = r.z0 + a * (burnt ? r.v * 0.55 : r.v) + Math.sin(a * 3 + i) * 6;
      return { r, i, z, burnt, x: r.lane + Math.sin(a * 2 + i * 1.7) * 8 };
    }).sort((p, q) => q.z - p.z);
    // ranks by z (furthest ahead = 1st)
    const order = [...list].sort((p, q) => q.z - p.z);
    order.forEach((o, k) => (o.rank = k + 1));
    for (const o of list) {
      const p = project7(cam, W, o.x, o.z, 0);
      if (!p) continue;
      const [sx, sy, s] = p;
      if (s < 0.08 || sy > H + 40) continue;
      const sc = Math.max(1, Math.round(s * 4) / 2);
      const spr = citizenSprite({ ...folkPoses.run(a * 4 + o.i * 0.3), view: 'back', expr: 'tired' }, o.burnt ? burnPal(t - o.r.burn) : RP, RACER);
      const w = spr.w * sc, h = spr.h * sc;
      g.ctx.drawImage(spr.c, Math.round(sx - spr.ax * sc), Math.round(sy - spr.ay * sc), w, h);
      if (sc >= 1 && !o.burnt) rankTag(g, sx, sy - 36 * sc, o.rank);
      if (o.burnt && t - o.r.burn < 0.6) popText(g, sx, sy - 40 * sc, 'BURN OUT', t - o.r.burn, P.white, { font: 'zh8' });
    }
    // speed lines
    for (let i = 0; i < 18; i++) {
      const ang = hash2(i, 1) * Math.PI * 2;
      const ph = (a * 3 + hash2(i, 2)) % 1;
      const r0 = 60 + ph * 300, r1 = r0 + 20 + ph * 40;
      g.line(W / 2 + Math.cos(ang) * r0, cam.hz + Math.sin(ang) * r0 * 0.6, W / 2 + Math.cos(ang) * r1, cam.hz + Math.sin(ang) * r1 * 0.6, P.white);
    }
  }
  const burnPal = (age) => {
    const k = clamp(age / 0.5);
    return k < 0.5 ? { ...RP, J: P.g1, j: P.g2, L: P.g2, H: P.g2, s: P.white } : { ...RP, J: P.white, j: P.g1, L: P.g1, H: P.g1, s: P.white, k: P.g2, K: P.g1 };
  };

  // ---------- L13 side view, slow motion (zoom 3: 160 x 90) ----------
  function side(g, t) {
    const W = g.W, H = g.H;
    const run = t < T_STOP;
    const slow = run ? 0.35 : 1;
    const a = t - T_SIDE;
    g.vgrad(0, 0, W, [[0, P.g5], [40, P.blueD], [62, P.blue]], 2);
    for (let i = 0; i < 8; i++) {
      const x = ((i * 44 - a * 50 * slow) % 352 + 352) % 352 - 44;
      g.rect(x, 12, 36, 20, P.ink); g.frame(x, 12, 36, 20, P.blue);
      text(g, ['1st', '2nd', '3rd', 'WIN', 'TOP', 'No.1'][i % 6], x + 18, 17, { font: 'zh8', align: 'center', color: P.cyan });
    }
    g.rect(0, 62, W, 28, P.blueD);
    for (let x = -((a * 120 * slow) % 20); x < W; x += 20) g.vline(x, 62, 89, P.blue);
    g.hline(0, W, 62, P.cyan);
    const crowd = (front) => {
      for (let i = 0; i < 4; i++) {
        const sp = (front ? 70 : 50) + hash2(i, front ? 3 : 4) * 30;
        const x = ((i * 47 + a * sp * (run ? 0.5 : 2.2)) % 220) - 30;
        drawCitizen(g, x, front ? 92 : 74, folkPoses.run(t * (run ? 1.2 : 3.2) + i * 0.37, { expr: 'tired' }), RP, RACER);
      }
    };
    crowd(false);
    const gx = 78, gy = 84;
    if (run) {
      drawGardener(g, gx, gy, { ...pose.run(t * 1.2, { expr: Math.floor(m.beatF(t)) % 4 === 3 ? 'sad' : 'worried' }), armR: [2, 3], armL: [3, 3], item: { s: seedSprite(t * 8, ex), dx: 0, dy: -1 } }, GG);
      const beat = m.pulse(t, 6);
      glow(g, gx + 4, gy - 15, 5 + beat * 6, ex(P.yellow), 0.3 + beat * 0.35);
      ringWave(g, gx + 4, gy - 15, m.sinceBeat(t), { speed: 60, n: 1, max: 30, cols: [ex(P.white)] });
    } else {
      const k = prog(t, T_STOP, T_STOP + 0.35, E.outQ);
      drawGardener(g, gx + k * 5, gy, { ...pose.idle(t), lean: -1, expr: 'surprised', armR: [2, 3], item: { s: seedSprite(t * 8, ex), dx: 0, dy: -1 } }, GG);
      puff(g, gx + 4, gy, t - T_STOP, { col: P.g1, n: 5, spread: 8 });
      puff(g, gx - 5, gy, t - T_STOP - 0.08, { col: P.g1, n: 4, spread: 7 });
    }
    crowd(true);
    g.rect(0, 0, W, 5, P.ink); g.rect(0, H - 5, W, 5, P.ink);
  }

  const phase = (t) => (t < T_COLD ? 'nursery' : t < GO ? 'start' : t < T_SIDE ? 'race' : 'side');
  return {
    id: 'race1', t0: T0, t1: T1,
    zoom: (t) => ({ nursery: 3, start: 2, race: 1, side: 3 }[phase(t)]),
    draw(g, t) {
      const ph = phase(t);
      if (ph === 'nursery') nursery(g, t);
      else if (ph === 'start') startLine(g, t);
      else if (ph === 'race') race(g, t);
      else side(g, t);
    },
    post(g, t) {
      if (phase(t) === 'nursery') {
        remapPass(g, 'gb');
        // rounded memory frame
        const W = g.W, H = g.H;
        g.frame(2, 2, W - 4, H - 4, '#0f380f');
        for (const [x, y] of [[0, 0], [W - 4, 0], [0, H - 4], [W - 4, H - 4]]) g.rect(x, y, 4, 4, P.ink);
      }
    },
    shake(t) { if (t > GO && t < GO + 0.3) return [(hash(Math.floor(t * 60)) - 0.5) * 6, (hash(Math.floor(t * 60) + 7) - 0.5) * 6]; return null; },
    over(g, t) { if (t < T0 + 0.4) g.drect(0, 0, g.W, g.H, P.white, 1 - prog(t, T0, T0 + 0.4, E.outQ)); },
    ui(g, t) {
      if (t > GO && t < GO + 0.7) {
        const a = t - GO;
        text(g, 'GO!', g.W / 2, 100 - (a < 0.1 ? 6 : 0), { font: 'en', scale: a < 0.1 ? 7 : 6, align: 'center', color: P.yellow, outline: P.ink });
      }
      if (phase(t) === 'nursery' && Math.floor(t * 2) % 2 === 0) text(g, 'MEMORY', 18, 16, { font: 'en', color: '#9bbc0f', outline: '#0f380f' });
      for (const [tt, s2] of [[C3, '3'], [C2, '2'], [C1, '1']]) {
        const a = t - tt;
        if (a >= 0 && a < 0.6) text(g, s2, g.W / 2, 110 - (a < 0.08 ? 6 : 0), { font: 'en', scale: a < 0.08 ? 7 : 6, align: 'center', color: P.white, outline: P.ink });
      }
    },
  };
};
