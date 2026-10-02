// 56.2 - 70.75  Down the main street, three stops in one continuous walk (zoom 2). The townsfolk stay
// gray and standard the whole way; the gardener's odd seed only shows what is already there.
//  L7 "都可以美得 让你无比惊讶"   a standard gray citizen steps into the BEAUTY 9000 photo booth. The
//                               seed's sparks get into the machine: she comes out as gray as ever, but
//                               the photo strip shows her in full colour, beaming. Her rigid smile
//                               drops, she gasps, then smiles for real. The gardener: "!"
//  L8 "只要是花 一定会有艳丽文雅"  the robot judge gives the standard rose 100 and the three odd flowers
//                               0. The seed's beam gets into the robot: hearts for eyes, and on
//                               艳 丽 文 雅 it turns every card over, each flower lighting up in colour
//  L9 "没有谁的色彩 会是匮乏"      the paint shop has every colour on its shelves while a gray line
//                               marches past carrying gray paint. In the seed's light every passer-by
//                               shows a small flower of their own colour in the chest; no one is
//                               without one. Out of the light they are as gray as before
import { P, ex, HUES } from '../core/pal.js';
import { text, measure } from '../core/font.js';
import { grayPass } from '../core/post.js';
import { Gfx } from '../core/gfx.js';
import { E, prog, lerp, hash2 } from '../core/math.js';
import { buildCity, drawCity, drawSky, GROUND } from '../art/city.js';
import { drawGardener, pose, seedSprite, GARDENER } from '../art/gardener.js';
import { heldPoint } from '../art/rig.js';
import { drawCitizen, folkPoses, citizenSprite, freeLook } from '../art/folk.js';
import { rose, bubble, cloudSprite, dreamPlant } from '../art/props.js';
import { puff, sparkle, burst, glow } from '../art/fx.js';
import { sprite } from '../core/sprite.js';

const BOOTH = { x: 176, w: 56 }, STAGE = { x: 238, w: 112 }, PAINT = { x: 362, w: 132 };
// how the photo booth sees her: the same look she wears when she is free (party, finale)
const TRUE_PAL = { ...freeLook(12).pal, J: P.pink, j: P.magenta, t: P.white, H: P.brown, h: P.brownD, s: P.peach, L: P.blueD, x: P.hot };
// the odd flowers on the judging stage, the ones the buyers dreamt of in the flower shop (the first
// pedestal holds the standard rose)
const ODD = [null, 'sunflower', 'bluebell', 'tulip'];
const ZAP = [P.red, P.orange, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink];
const CANS = [P.red, P.gold, P.blue, P.green, P.magenta, P.orange, P.cyan, P.pink, P.purple, P.yellow, P.hot, P.greenM, P.peach, P.blueD, P.clay, P.white];
const HEART = ['.x.x.', 'xxxxx', '.xxx.', '..x..'];

export default (ctx) => {
  const { m } = ctx;
  let city;
  const T0 = 56.2, T1 = 70.75;
  // L7
  const G_IN = 56.17, G_HIDE = 57.0, RUN0 = 57.08, RUN1 = 58.27, OUT = 58.27, TAKE = 58.65, LOOKP = 59.01, WOW = 59.49, GLAD = 59.79, OFF = 59.95;
  const SNAP = [57.08, 57.39, 57.86]; // 美 得 让: three flashes behind the curtain
  // L8
  const SC = [60.69, 61.02, 61.34, 61.59]; // 只 要 是 花: 100, 0, 0, 0
  const LIFT = 61.92, BEAM = 62.21, LOVE = 62.73, CHEER = 63.14;
  const YAN = [63.33, 63.64, 63.95, 64.33]; // 艳 丽 文 雅
  // L9
  const RAISE = 67.45, SWEEP = 68.29, FLASH = 70.35;
  const GXA = 158, GXB = 254, GXC = 384;
  const HER_X = BOOTH.x + 50; // where she stands to look at the strip
  const SLOT = { x: BOOTH.x + 43, y: 182 }; // photo outlet

  // gardener path: stations with quick runs between
  const gx = (t) => {
    if (t < 59.9) return GXA - 40 + 40 * prog(t, T0, T0 + 0.6, E.outQ);
    if (t < 60.85) return lerp(GXA, GXB, prog(t, 59.9, 60.85, E.ioQ));
    if (t < 64.95) return GXB;
    if (t < 65.85) return lerp(GXB, GXC, prog(t, 64.95, 65.85, E.ioQ));
    if (t < SWEEP) return GXC;
    return GXC + 22 * prog(t, SWEEP, SWEEP + 1.1, E.ioQ);
  };
  const camX = (t) => {
    const a = 64, b = 168, c = 300;
    if (t < 59.9) return a;
    if (t < 60.9) return lerp(a, b, prog(t, 59.9, 60.9, E.ioC));
    if (t < 64.95) return b;
    if (t < 65.95) return lerp(b, c, prog(t, 64.95, 65.95, E.ioC));
    return c;
  };
  const CAMY = 104;

  function gPose(t) {
    const seed = (dx = 1, dy = -1) => ({ s: seedSprite(t * 12, ex), dx, dy });
    if (t < T0 + 0.6) return pose.run(t * 3.2, { expr: 'neutral' });
    if ((t > 59.9 && t < 60.85) || (t > 64.95 && t < 65.85)) return pose.run(t * 3.2, { expr: t < 61 ? 'surprised' : 'grin' });
    if (t < 59.9) {
      if (t > WOW) return { ...pose.idle(t), expr: 'surprised', bob: t - WOW < 0.2 ? -2 : 0, armL: [-3, 0], armR: [3, 0] };
      if (t > RUN0 - 0.25 && t < RUN1) return { ...pose.idle(t), expr: 'determined', armR: [6, -2], item: seed(1, -1) };
      return { ...pose.idle(t), expr: t > OUT ? 'smile' : 'neutral', armR: [2, 3], item: seed() };
    }
    if (t < 64.95) {
      if (t > LIFT - 0.1 && t < YAN[0]) return { ...pose.idle(t), expr: 'determined', armR: [4, -8], item: seed(0, -2) };
      if (t >= YAN[0]) return { ...pose.idle(t), expr: 'grin', bob: t > YAN[3] && t < YAN[3] + 0.18 ? -2 : 0, armR: [3, 2], item: seed() };
      return { ...pose.idle(t), expr: t > SC[1] + 0.1 ? 'worried' : 'smile', armR: [3, 2], item: seed() };
    }
    // paint shop: looks in the window, then holds the seed up like a lantern for the passers-by
    if (t < RAISE - 0.15) return { ...pose.idle(t), view: 'back' };
    const k = prog(t, RAISE - 0.15, RAISE + 0.25, E.outBack);
    const base = t > SWEEP && t < SWEEP + 1.1 ? pose.walk(m.beatF(t) * 1.2) : pose.idle(t);
    return { ...base, expr: t > 69.19 ? 'grin' : 'wow', armR: [5, -4 - Math.round(k * 4)], item: seed(0, -3) };
  }
  const seedPos = (t) => {
    const p = gPose(t);
    if (!p.item) return null;
    const [ox, oy] = heldPoint(GARDENER, p, p.item, 3, 3);
    return [gx(t) + ox, GROUND + 1 + oy];
  };
  // the seed's light at the paint shop (world coordinates)
  const lens = (t) => {
    if (t <= RAISE) return null;
    const sp = seedPos(t);
    if (!sp) return null;
    let grow = prog(t, RAISE, RAISE + 0.6, E.outBack) * (1 + 0.3 * prog(t, SWEEP, SWEEP + 0.9, E.ioQ));
    if (t > FLASH - 0.4) grow *= 1 + 7 * prog(t, FLASH - 0.4, FLASH + 0.3, E.inQ);
    return { x: sp[0], y: sp[1], r: (24 + 3 * Math.sin(t * 6)) * grow };
  };

  // the gray line at the paint shop: lockstep, right to left, everyone with the same can of gray
  const N_PASS = 11, PASS_X0 = 472, PASS_SP = 24, PASS_V = 33, PASS_T = 65.95;
  const passX = (j, t) => PASS_X0 + j * PASS_SP - PASS_V * (t - PASS_T);
  const chest = (j, t) => [Math.round(passX(j, t)) - 2, GROUND - 2 - 19];
  const inLens = (L, x, y, pad = 3) => L && Math.hypot(x - L.x, y - L.y) < L.r - pad;

  // L7
  ctx.cue(RUN0 - 0.1, 'machine', { v: 0.45 });
  SNAP.forEach((s, i) => { ctx.cue(s, 'shutter', { v: 0.6 }); ctx.cue(s - 0.06, 'colorize', { v: 0.2, p: 1 + i * 0.2 }); });
  ctx.cue(RUN1, 'ding');
  ctx.cue(OUT + 0.1, 'print', { v: 0.5 });
  ctx.cue(TAKE, 'tick', { v: 0.45 });
  ctx.cue(WOW - 0.1, 'sparkle', { v: 0.4 });
  ctx.cue(WOW, 'surprise');
  ctx.cue(OFF + 0.05, 'heart', { v: 0.5 });
  // L8
  ctx.cue(SC[0], 'ding', { v: 0.6 });
  SC.slice(1).forEach((s) => ctx.cue(s, 'buzz', { v: 0.4 }));
  ctx.cue(LIFT, 'shine', { v: 0.5 });
  ctx.cue(BEAM, 'scan', { v: 0.45 });
  ctx.cue(LOVE, 'heart', { v: 0.7 });
  ctx.cue(CHEER, 'boing', { v: 0.4, p: 1.3 });
  YAN.forEach((s, i) => { ctx.cue(s - 0.06, 'card', { v: 0.5, p: 1 + i * 0.12 }); ctx.cue(s + 0.03, 'bloom', { v: 0.3 }); });
  // L9
  ctx.cue(RAISE, 'shine');
  {
    // a twinkle each time the light finds a flower
    const seen = new Set();
    let n = 0;
    for (let t = RAISE; t < FLASH - 0.4; t += 1 / 30) {
      const L = lens(t);
      for (let j = 0; j < N_PASS; j++) {
        if (seen.has(j)) continue;
        const [x, y] = chest(j, t);
        if (inLens(L, x, y)) { seen.add(j); ctx.cue(t, 'twinkle', { v: 0.32, p: 1 + (n++ % 5) * 0.1 }); }
      }
    }
  }
  ctx.cue(FLASH, 'whoosh', { v: 0.7 });
  for (const [a, b] of [[59.9, 60.85], [64.95, 65.85]]) for (let t = a; t < b; t += 0.16) ctx.cue(t, 'step', { v: 0.2 });

  // ---------------------------------------------------------------- L7 the photo booth
  function booth(g, t) {
    const flash = SNAP.some((s) => t >= s && t < s + 0.1);
    const running = t > RUN0 && t < RUN1;
    const sh = running ? (Math.floor(t * 16) % 2 ? 1 : -1) : 0;
    const x = BOOTH.x + sh, y0 = 146, w = BOOTH.w;
    const glitch = running && Math.floor(t * 10) % 3 === 0;
    // sign (the letters glitch through the rainbow while the seed is in the machine)
    g.rect(x + 2, y0 - 22, w - 4, 20, P.ink);
    g.rect(x + 3, y0 - 21, w - 6, 18, P.purple);
    text(g, 'BEAUTY', x + w / 2 + (glitch ? 1 : 0), y0 - 20, { font: 'en', align: 'center', color: ex(glitch ? ZAP[Math.floor(t * 20) % ZAP.length] : P.pink) });
    text(g, '9000', x + w / 2, y0 - 11, { font: 'en', align: 'center', color: ex(P.yellow) });
    for (let i = 0; i < 8; i++) {
      const on = running ? (Math.floor(t * 12) + i) % 2 === 0 : (Math.floor(m.beatF(t)) + i) % 4 === 0;
      g.px(x + 4 + i * 7, y0 - 23, on ? ex(P.yellow) : P.g3);
    }
    // body
    g.rect(x - 1, y0 - 1, w + 2, 212 - y0 + 1, P.ink);
    g.rect(x, y0, w, 212 - y0, P.g1);
    g.rect(x, y0, 2, 212 - y0, P.white);
    g.rect(x + w - 3, y0, 3, 212 - y0, P.g2);
    // curtain (left half); a flash lights it from inside
    const open = t > OUT - 0.1 && t < OUT + 0.45;
    g.rect(x + 4, y0 + 6, 26, 212 - y0 - 6, P.ink);
    if (!open) {
      g.rect(x + 5, y0 + 7, 24, 212 - y0 - 7, P.magenta);
      for (let i = 0; i < 4; i++) g.vline(x + 8 + i * 6, y0 + 8, 211, P.purple);
      if (flash) {
        g.drect(x + 5, y0 + 7, 24, 212 - y0 - 7, ex(P.white), 0.55);
        g.rect(x + 5, y0 + 6, 24, 1, ex(P.white));
        g.rect(x + 5, 210, 24, 2, ex(P.white));
      }
    } else g.rect(x + 5, y0 + 7, 6, 212 - y0 - 7, P.magenta);
    if (flash) glow(g, x + 17, y0 + 34, 22, ex(P.white), 0.22);
    // screen (right half): the standard smile; rainbow noise while the seed is inside; then a heart
    const sx = x + 34, sy = y0 + 8;
    g.rect(sx, sy, 18, 14, P.ink);
    if (running) {
      const f = Math.floor(t * 30);
      for (let i = 0; i < 26; i++) g.px(sx + 1 + Math.floor(hash2(i, f) * 16), sy + 1 + Math.floor(hash2(i + 40, f) * 12), ex(ZAP[(i + f) % ZAP.length]));
    } else if (t > OUT) {
      heart(g, sx + 9, sy + 4, ex(P.hot));
      g.px(sx + 6, sy + 5, ex(P.pink)); g.px(sx + 12, sy + 5, ex(P.pink));
    } else {
      g.px(x + 39, y0 + 12, ex(P.cyan)); g.px(x + 46, y0 + 12, ex(P.cyan));
      g.px(x + 38, y0 + 16, ex(P.cyan)); g.px(x + 47, y0 + 16, ex(P.cyan)); g.hline(x + 39, x + 46, y0 + 17, ex(P.cyan));
    }
    // buttons, and the photo outlet with the strip sliding out of it
    for (let i = 0; i < 3; i++) g.rect(x + 36 + i * 5, y0 + 26, 3, 3, [P.red, P.gold, P.green][i]);
    if (t > OUT + 0.1 && t < TAKE) {
      const rows = Math.round(prog(t, OUT + 0.1, OUT + 0.45, E.outQ) * 12);
      stripRows(g, SLOT.x - 2 + sh, SLOT.y + 1, rows);
    }
    g.rect(SLOT.x - 5 + sh, SLOT.y - 1, 11, 2, P.g4);
    // pipe and steam
    g.rect(x + w - 12, y0 - 30, 4, 8, P.g3);
    if (running) for (let i = 0; i < 3; i++) puff(g, x + w - 10, y0 - 32 - i * 6, ((t - RUN0) * 1.7 + i * 0.15) % 0.45, { col: P.white, n: 3, spread: 5 });
    if (t > RUN1 && t < RUN1 + 0.8) {
      const a = t - RUN1;
      text(g, 'DING!', x + w / 2, y0 - 40 - Math.round(Math.min(1, a * 8) * 6), { font: 'en', align: 'center', color: ex(P.yellow), outline: P.ink });
    }
  }

  // the photo strip: white paper, three coloured frames (exempt: it is in colour even here)
  const STRIP = ['kkkkk', 'kwwwk', 'kpppk', 'kpppk', 'kwwwk', 'kyyyk', 'kyyyk', 'kwwwk', 'kccck', 'kccck', 'kwwwk', 'kkkkk'];
  const SPAL = { k: ex(P.ink), w: ex(P.white), p: ex(P.pink), y: ex(P.yellow), c: ex(P.cyan) };
  // the bottom `rows` rows of the strip, top-left at (x, y): it slides down out of the slot
  function stripRows(g, x, y, rows) {
    for (let j = 0; j < rows; j++) {
      const row = STRIP[STRIP.length - rows + j];
      for (let i = 0; i < 5; i++) g.px(x + i, y + j, SPAL[row[i]]);
    }
  }
  const stripSprite = () => sprite(STRIP.join('\n'), SPAL, { ax: 2.5, ay: 6 });

  // her: one more standard citizen
  function her(g, t, cx) {
    let x, p;
    if (t < G_HIDE) {
      x = lerp(BOOTH.x + 80, BOOTH.x + 16, prog(t, G_IN - 0.9, G_HIDE, E.lin));
      p = folkPoses.walk(m.beatF(t), { flip: true, expr: 'standard' });
    } else if (t < OUT) return;
    else if (t < OUT + 0.4) {
      x = lerp(BOOTH.x + 16, HER_X, prog(t, OUT, OUT + 0.4, E.outQ));
      p = folkPoses.walk(m.beatF(t), { expr: 'standard' });
    } else if (t < OFF) {
      x = HER_X;
      const expr = t < LOOKP ? 'standard' : t < WOW ? 'neutral' : t < GLAD ? 'wow' : 'content';
      p = folkPoses.stand(t, { view: 'front', expr, bob: t > WOW && t < WOW + 0.22 ? -3 : 0 });
      if (t > TAKE - 0.12 && t < TAKE) p = { ...p, armL: [-4, -3] };
      if (t >= TAKE) p = { ...p, armR: t < LOOKP - 0.1 ? [3, 3] : [2, -2], item: { s: stripSprite(), dx: 0, dy: 0 } };
    } else {
      x = HER_X - (t - OFF) * 30;
      p = folkPoses.walk(m.beatF(t) * 1.15, { flip: true, expr: 'content', armR: [1, 3], item: { s: stripSprite(), dx: 0, dy: 0 } });
    }
    if (x < cx - 20) return;
    drawCitizen(g, x, GROUND - 2, p);
    if (t > WOW && t < OFF) g.spr(bubble('ex'), x + 3, GROUND - 38 - (t - WOW < 0.08 ? 2 : 0));
    if (t > OFF && t < OFF + 0.8) g.spr(bubble('heart'), x + 4, GROUND - 38);
  }

  // close-up of the strip (native resolution, drawn in ui): her as the machine saw her
  let panelCv = null;
  function photoPanel() {
    if (panelCv) return panelCv;
    const W = 38, H = 116, pg = new Gfx(W, H);
    pg.ctx.clearRect(0, 0, W, H);
    pg.rect(0, 0, W, H, P.ink);
    pg.rect(1, 1, W - 2, H - 2, P.white);
    const looks = [['smile', P.pink, P.hot], ['grin', P.yellow, P.gold], ['content', P.cyan, P.blue]];
    looks.forEach(([expr, bg, dot], i) => {
      const fx = 4, fy = 4 + i * 37;
      pg.rect(fx, fy, 30, 34, bg);
      for (let k = 0; k < 9; k++) pg.px(fx + 1 + Math.floor(hash2(k, i + 3) * 28), fy + 1 + Math.floor(hash2(k + 9, i + 3) * 14), dot);
      sparkle(pg, fx + 4 + i * 2, fy + 5, 0.3, P.white, 2);
      sparkle(pg, fx + 25 - i, fy + 8 + i * 2, 0.3, P.white, 2);
      const s = citizenSprite(folkPoses.stand(0, { view: 'front', expr, acc: 'bow', hair: 'bob' }), TRUE_PAL);
      const top = topRow(s);
      pg.ctx.imageSmoothingEnabled = false;
      pg.ctx.drawImage(s.c, 25, top - 2, 15, 17, fx, fy, 30, 34);
    });
    panelCv = pg.c;
    return panelCv;
  }
  function topRow(s) {
    const d = s.c.getContext('2d').getImageData(0, 0, s.w, s.h).data;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (d[(y * s.w + x) * 4 + 3]) return y;
    return 0;
  }

  // ---------------------------------------------------------------- L8 the judging stage
  function heart(g, cx, cy, col) {
    HEART.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === 'x') g.px(cx - 2 + i, cy + j, col); });
  }
  // a judge's card on a stick, squeezed horizontally by wk while it turns over
  function card(g, x, y, str, col, bg, font, wk = 1) {
    const full = Math.max(12, measure(str, { font }) + 4), h = font === 'zh' ? 14 : 10;
    const w = Math.max(1, Math.round(full * wk));
    g.rect(Math.round(x - w / 2) - 1, y - 1, w + 2, h + 2, ex(P.ink));
    g.rect(Math.round(x - w / 2), y, w, h, bg);
    g.rect(x - 1, y + h + 1, 2, 8, P.brown);
    if (wk > 0.75) text(g, str, x, y + 1, { font, color: col, align: 'center' });
  }
  // a crackling rainbow bolt
  function zap(g, x0, y0, x1, y1, t, n = 7) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const f = Math.floor(t * 30);
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) {
      const k = i / n, off = i === n ? 0 : (hash2(i, f) - 0.5) * 7;
      const qx = x0 + dx * k + nx * off, qy = y0 + dy * k + ny * off;
      g.line(px, py, qx, qy, ex(ZAP[(i + f) % ZAP.length]), 2);
      g.line(px, py, qx, qy, ex(P.white), 1);
      px = qx; py = qy;
    }
  }

  function robot(g, x, y, t) {
    // desk
    g.rect(x - 18, y - 16, 36, 16, P.ink);
    g.rect(x - 17, y - 15, 34, 15, P.brown);
    g.rect(x - 17, y - 15, 34, 2, P.clay);
    const glitch = t > BEAM && t < LOVE;
    const jit = glitch ? (Math.floor(t * 24) % 2 ? 1 : -1) : 0;
    const by = y - 16;
    g.rect(x - 9, by - 12, 18, 12, P.ink); g.rect(x - 8, by - 11, 16, 11, P.g3);
    g.rect(x - 2, by - 11, 4, 3, ex(t > LOVE ? P.pink : P.red));
    // head (bobs happily once it has seen it)
    const hx = x + jit, hy = by - 13 + (t > LOVE && Math.floor(m.beatF(t) * 2) % 2 ? -1 : 0);
    g.rect(hx - 11, hy - 16, 22, 16, P.ink); g.rect(hx - 10, hy - 15, 20, 14, P.g2); g.rect(hx - 10, hy - 15, 20, 2, P.g1);
    g.rect(hx - 8, hy - 12, 16, 9, P.ink);
    g.vline(hx, hy - 22, hy - 17, P.ink);
    g.px(hx, hy - 23, Math.floor(t * 4) % 2 ? ex(t > LOVE ? P.pink : P.red) : P.g3);
    // face on the screen: the standard smile, rainbow static under the beam, then hearts for eyes
    if (glitch) {
      const f = Math.floor(t * 30);
      for (let i = 0; i < 22; i++) g.px(hx - 7 + Math.floor(hash2(i, f) * 14), hy - 11 + Math.floor(hash2(i + 30, f) * 7), ex(ZAP[(i + f) % ZAP.length]));
    } else if (t >= LOVE) {
      heart(g, hx - 4, hy - 10, ex(P.hot));
      heart(g, hx + 4, hy - 10, ex(P.hot));
      g.hline(hx - 1, hx + 1, hy - 5, ex(P.pink));
    } else {
      g.px(hx - 4, hy - 10, ex(P.cyan)); g.px(hx + 3, hy - 10, ex(P.cyan));
      g.px(hx - 5, hy - 7, ex(P.cyan)); g.px(hx + 4, hy - 7, ex(P.cyan)); g.hline(hx - 4, hx + 3, hy - 6, ex(P.cyan));
    }
    // arms: the left one goes up with every card, both go up for the cheer
    const last = [...SC, ...YAN].filter((s) => t >= s - 0.06).pop();
    const raising = last !== undefined && t - last < 0.4;
    const cheer = t > CHEER && t < CHEER + 0.3;
    g.line(x - 9, by - 9, x - 14, raising || cheer ? by - 22 : by - 2, P.ink, 3);
    g.line(x + 9, by - 9, x + 14, cheer ? by - 22 : by - 2, P.ink, 3);
    if (glitch) for (let i = 0; i < 2; i++) puff(g, hx - 4 + i * 8, hy - 18, ((t - BEAM) * 1.6 + i * 0.2) % 0.45, { col: P.white, n: 3, spread: 4 });
    // little hearts float up
    if (t > LOVE) {
      for (let i = 0; i < 9; i++) {
        const a = t - (LOVE + 0.12 + i * 0.28);
        if (a > 0 && a < 1.1) heart(g, hx + (i % 2 ? 8 : -8) + Math.round(Math.sin(a * 5 + i) * 3), hy - 20 - Math.round(a * 18), ex(i % 3 ? P.pink : P.hot));
      }
    }
  }

  function stage(g, t) {
    const x = STAGE.x, w = STAGE.w;
    // banner
    g.rect(x + 8, 126, w - 16, 18, P.ink);
    g.rect(x + 9, 127, w - 18, 16, P.redD);
    text(g, '花卉评审会', x + w / 2, 129, { align: 'center', color: P.yellow });
    g.vline(x + 10, 144, 196, P.g5); g.vline(x + w - 11, 144, 196, P.g5);
    // platform
    g.rect(x, 196, w, 16, P.ink);
    g.rect(x + 1, 197, w - 2, 3, P.tan);
    g.rect(x + 1, 200, w - 2, 12, P.brown);
    for (let i = 0; i < 6; i++) g.vline(x + 8 + i * 18, 201, 211, P.brownD);
    // pedestals: the standard rose and three odd flowers (gray until their card turns over)
    for (let i = 0; i < 4; i++) {
      const px = x + 14 + i * 18;
      g.rect(px - 4, 184, 9, 12, P.ink); g.rect(px - 3, 185, 7, 11, P.g1);
      const lit = t >= YAN[i];
      if (i === 0) g.spr(rose(false, true), px, 184);
      else g.spr(dreamPlant(ODD[i], lit), px, 184);
      if (lit) {
        const a = t - YAN[i];
        if (a < 0.5) glow(g, px, 176, 9, ex(P.yellow), 0.5 * (1 - a * 2));
        burst(g, px, 176, a, { n: 6, r: 11, cols: [ex(P.yellow), ex(P.white), ex(P.pink)], seed: i });
      }
      if (t >= SC[i]) {
        const a = t - SC[i], lift = Math.round(Math.min(1, a * 10) * 4);
        let wk = 1, str = i === 0 ? '100' : '0', col = ex(P.white), bg = ex(i === 0 ? P.greenM : P.hot), font = 'zh8';
        const turn = YAN[i] - 0.08;
        if (t >= turn) {
          const f = (t - turn) / 0.16;
          if (f < 0.5) wk = 1 - f * 2;
          else { wk = Math.min(1, f * 2 - 1); str = '艳丽文雅'[i]; col = ex(P.redD); bg = ex(P.yellow); font = 'zh'; }
        }
        card(g, px, 150 - lift, str, col, bg, font, wk);
        if (i === 0 && a < 0.6) sparkle(g, px + 9, 147, a - 0.05, ex(P.yellow), 2);
        if (t >= YAN[i]) sparkle(g, px + 8, 145, t - YAN[i] - 0.05, ex(P.white), 3);
      }
    }
    robot(g, x + w - 22, 196, t);
    // the seed's beam into the robot
    if (t > BEAM && t < LOVE + 0.12) {
      const sp = seedPos(t);
      if (sp) zap(g, sp[0], sp[1], x + w - 22, 196 - 16 - 13 - 8, t, 9);
    }
  }

  // ---------------------------------------------------------------- L9 the paint shop
  function paintShop(g, t) {
    const x = PAINT.x, w = PAINT.w, top = 60;
    g.rect(x, top, w, 212 - top, P.cream);
    g.rect(x, top, 2, 212 - top, P.white);
    g.rect(x + w - 2, top, 2, 212 - top, P.tan);
    for (let i = 0; i < 3; i++) { const wx = x + 14 + i * 40; g.rect(wx, 76, 22, 28, P.g5); g.rect(wx - 2, 104, 26, 3, P.tan); }
    // sign
    g.rect(x + 16, 116, w - 32, 18, P.ink);
    g.rect(x + 17, 117, w - 34, 16, P.blueD);
    text(g, '颜料店 PAINT', x + w / 2, 119, { align: 'center', color: P.white });
    // window: two full shelves, every colour in stock
    const wx = x + 6, wy = 140, ww = w - 12, wh = 66;
    g.rect(wx - 2, wy - 2, ww + 4, wh + 4, P.brown);
    g.rect(wx, wy, ww, wh, P.g5);
    g.rect(wx, wy + 30, ww, 2, P.tan);
    g.rect(wx, wy + 62, ww, 2, P.tan);
    CANS.forEach((c, i) => {
      const cx = wx + 5 + (i % 8) * 14, cy = wy + 12 + Math.floor(i / 8) * 32;
      g.rect(cx, cy, 11, 17, P.ink);
      g.rect(cx + 1, cy + 1, 9, 15, P.g1);
      g.rect(cx + 1, cy + 5, 9, 7, c);
      g.rect(cx + 1, cy + 1, 9, 2, P.g2);
      g.px(cx + 2, cy + 6, P.white);
    });
    // glass glints
    for (let i = 0; i < 3; i++) { g.line(wx + 14 + i * 44, wy + 1, wx + 4 + i * 44, wy + 11, P.g4); g.line(wx + 18 + i * 44, wy + 1, wx + 12 + i * 44, wy + 7, P.g4); }
  }
  const grayCan = () => sprite(`
.k.k.
kkkkk
kwwwk
kGGGk
kGGGk
kwwwk
kkkkk`, { k: P.ink, w: P.g1, G: P.g3 }, { ax: 2.5, ay: 1 });
  // the small flower in each passer-by's chest, only where the light is
  function chestFlower(g, x, y, j, t, L) {
    const c = HUES[Math.floor(hash2(j, 71) * HUES.length)];
    const mid = c === P.yellow || c === P.gold ? P.white : P.yellow;
    const shape = Math.floor(hash2(j, 73) * 3);
    glow(g, x, y, 6 + Math.sin(t * 9 + j), ex(c), 0.45);
    const S = [['..c..', '.ccc.', 'ccmcc', '.ccc.', '..c..'], ['c...c', '.ccc.', '.cmc.', '.ccc.', 'c...c'], ['.ccc.', 'ccccc', 'ccmcc', 'ccccc', '.ccc.']][shape];
    S.forEach((row, jj) => { for (let i = 0; i < 5; i++) if (row[i] !== '.') g.px(x - 2 + i, y - 2 + jj, ex(row[i] === 'm' ? mid : c)); });
    // a sparkle as the light first reaches it
    const enter = Math.abs(Math.hypot(x - L.x, y - L.y) - (L.r - 3));
    if (enter < 3) sparkle(g, x + 3, y - 3, 0.3, ex(P.white), 2);
  }

  return {
    id: 'street', t0: T0, t1: T1,
    enter: { type: 'mosaic' },
    init() { city = buildCity(23, 900, [[BOOTH.x - 4, BOOTH.x + BOOTH.w + 2], [STAGE.x - 2, STAGE.x + STAGE.w + 4], [PAINT.x - 4, PAINT.x + PAINT.w + 4]]); },
    zoom: () => 2,
    draw(g, t) {
      const cx = Math.round(camX(t)), cy = CAMY;
      drawSky(g, -cy * 0.25 + 30, 'gray');
      for (let i = 0; i < 4; i++) g.spr(cloudSprite(i + 11, 70, 24, [P.g2, P.g3, P.g4]), ((i * 97 + t * 5 - cx * 0.1) % 340) - 50, 20 + i * 9);
      drawCity(g, city, cx, cy);
      g.push(-cx, -cy);
      booth(g, t);
      stage(g, t);
      paintShop(g, t);
      her(g, t, cx);
      // the gray line at the paint shop (behind the gardener)
      if (t > 64.9) {
        const L = lens(t);
        for (let j = 0; j < N_PASS; j++) {
          const x = passX(j, t);
          if (x < cx - 20 || x > cx + 260) continue;
          drawCitizen(g, x, GROUND - 2, folkPoses.walk(m.beatF(t), { flip: true, expr: 'standard', item: { s: grayCan() } }));
        }
        if (L) for (let j = 0; j < N_PASS; j++) { const [x, y] = chest(j, t); if (inLens(L, x, y)) chestFlower(g, x, y, j, t, L); }
      }
      gardener(g, t);
      g.pop();
    },
    post(g, t) {
      const zones = [];
      const L = lens(t);
      if (L) zones.push({ x: L.x - camX(t), y: L.y - CAMY, r: L.r, soft: 10 });
      grayPass(g, zones, 10);
    },
    ui(g, t) {
      if (t < WOW - 0.1 || t > 60.45) return;
      const k = prog(t, WOW - 0.1, WOW + 0.1, E.outBack) * (1 - prog(t, 60.2, 60.45, E.inQ));
      if (k < 0.03) return;
      const cv = photoPanel();
      const hx = (HER_X - camX(t)) * 2, hy = (GROUND - 30 - CAMY) * 2;
      const w = Math.round(cv.width * k), h = Math.round(cv.height * k);
      const x = Math.round(lerp(hx, 346, Math.min(1, k))), y = Math.round(lerp(hy, 18, Math.min(1, k)));
      g.ctx.imageSmoothingEnabled = false;
      g.ctx.drawImage(cv, x, y, w, h);
      if (k > 0.9) for (let i = 0; i < 4; i++) sparkle(g, x + [-4, w + 3, -3, w + 4][i], y + [10, 30, 80, 104][i], ((t - WOW) * 1.6 + i * 0.17) % 0.6, P.white, 3);
    },
    over(g, t) { if (t > FLASH) g.drect(0, 0, g.W, g.H, P.white, prog(t, FLASH, T1, E.inQ)); },
  };

  function gardener(g, t) {
    const x = gx(t), p = gPose(t);
    drawGardener(g, x, GROUND + 1, p);
    if (t > WOW && t < 59.9) g.spr(bubble('ex'), x + 2, GROUND - 32 - (t - WOW < 0.08 ? 2 : 0));
    const sp = seedPos(t);
    if (!sp) return;
    // the seed's sparks jump into the booth on each flash
    for (const s of SNAP) if (t > s - 0.06 && t < s + 0.1) zap(g, sp[0], sp[1], BOOTH.x + 14, 178 + (Math.floor(t * 30) % 3) * 6, t, 5);
    if ((t > LIFT - 0.1 && t < LOVE + 0.2) || t > RAISE) {
      glow(g, sp[0], sp[1], 10 + 2 * Math.sin(t * 8), ex(P.yellow), 0.35);
      sparkle(g, sp[0] + 6, sp[1] - 6, (t * 1.7) % 0.6, ex(P.white), 3);
    }
  }
};
