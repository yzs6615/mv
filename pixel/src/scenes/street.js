// 56.2 - 70.75  Down the main street, three gags in one continuous walk (zoom 2):
//  L7 "都可以美得 让你无比惊讶"   a girl with a pink bow walks into the BEAUTY 9000 booth and comes out
//                               gray, standard and smiling; her bow falls off. The gardener: "!"
//  L8 "只要是花 一定会有艳丽文雅"  a robot judge gives every rose 100; the odd seed gets ??? then ERROR
//                               and the robot overheats
//  L9 "没有谁的色彩 会是匮乏"      the paint shop is sold out of every colour except gray; held up to the
//                               window, the seed brings a little circle of colour back to the cans
import { P, ex, HUES } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2 } from '../core/math.js';
import { buildCity, drawCity, drawSky, GROUND } from '../art/city.js';
import { drawGardener, pose, seedSprite } from '../art/gardener.js';
import { drawCitizen, folkPoses, freeLook, CPAL } from '../art/folk.js';
import { rose, pot, bubble, ICON, cloudSprite } from '../art/props.js';
import { puff, sparkle, burst, glow } from '../art/fx.js';
import { scoreCard } from '../art/ui.js';
import { sprite } from '../core/sprite.js';

const BOOTH = { x: 176, w: 56 }, STAGE = { x: 238, w: 112 }, PAINT = { x: 362, w: 132 };
const exPal = (pal) => { const o = {}; for (const k in pal) o[k] = ex(pal[k]); return o; };

export default (ctx) => {
  const { m } = ctx;
  let city;
  const T0 = 56.2, T1 = 70.75;
  // L7
  const G_IN = 56.17, G_HIDE = 57.0, RUN0 = 57.08, RUN1 = 58.27, OUT = 58.27, WOW = 59.49;
  // L8
  const SC = [60.69, 61.34, 61.59], PLACE = 62.21, SCAN = 62.73, Q = 63.33, ERR = 63.95, BACK = 64.4;
  // L9
  const LOOK = 65.92, RAISE = 67.45, SWEEP = 68.29, FLASH = 70.35;
  const GXA = 158, GXB = 254, GXC = 384;
  const girl = (() => { const L = freeLook(12); L.pal = exPal({ ...L.pal, J: P.pink, j: P.magenta, t: P.white, H: P.brown, h: P.brownD, s: P.peach, L: P.blueD, x: P.hot }); return L; })();

  ctx.cue(RUN0, 'machine');
  ctx.cue(RUN1, 'ding');
  ctx.cue(OUT + 0.15, 'boing', { v: 0.4, p: 1.4 });
  ctx.cue(WOW, 'surprise');
  SC.forEach((t, i) => ctx.cue(t, 'ding', { p: 1 + i * 0.12, v: 0.6 }));
  ctx.cue(SCAN, 'scan');
  ctx.cue(ERR, 'buzzer');
  ctx.cue(ERR + 0.3, 'steam');
  ctx.cue(RAISE, 'shine');
  ctx.cue(FLASH, 'whoosh', { v: 0.7 });
  for (const [a, b] of [[59.9, 60.85], [64.95, 65.85]]) for (let t = a; t < b; t += 0.16) ctx.cue(t, 'step', { v: 0.2 });

  // gardener path: stations with quick runs between
  const gx = (t) => {
    if (t < 59.9) return GXA - 40 + 40 * prog(t, T0, T0 + 0.6, E.outQ);
    if (t < 60.85) return lerp(GXA, GXB, prog(t, 59.9, 60.85, E.ioQ));
    if (t < PLACE - 0.4) return GXB;
    if (t < PLACE) return lerp(GXB, GXB + 20, prog(t, PLACE - 0.4, PLACE, E.ioQ));
    if (t < BACK) return GXB + 20;
    if (t < 64.95) return lerp(GXB + 20, GXB, prog(t, BACK, BACK + 0.4, E.ioQ));
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

  function booth(g, t) {
    const running = t > RUN0 && t < RUN1;
    const sh = running ? (Math.floor(t * 16) % 2 ? 1 : -1) : 0;
    const x = BOOTH.x + sh, y0 = 146, w = BOOTH.w;
    // sign
    g.rect(x + 2, y0 - 22, w - 4, 20, P.ink);
    g.rect(x + 3, y0 - 21, w - 6, 18, P.purple);
    text(g, 'BEAUTY', x + w / 2, y0 - 20, { font: 'en', align: 'center', color: ex(P.pink) });
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
    // curtain (left half)
    const open = t > OUT - 0.1 && t < OUT + 0.6;
    g.rect(x + 4, y0 + 6, 26, 212 - y0 - 6, P.ink);
    if (!open) {
      g.rect(x + 5, y0 + 7, 24, 212 - y0 - 7, P.magenta);
      for (let i = 0; i < 4; i++) g.vline(x + 8 + i * 6, y0 + 8, 211, P.purple);
    } else g.rect(x + 5, y0 + 7, 6, 212 - y0 - 7, P.magenta);
    // screen (right half)
    g.rect(x + 34, y0 + 8, 18, 14, P.ink);
    const face = running ? ['@', '#', '%', '&'][Math.floor(t * 10) % 4] : null;
    if (face) text(g, face, x + 43, y0 + 11, { font: 'en', align: 'center', color: ex(P.green) });
    else {
      g.px(x + 39, y0 + 12, ex(P.cyan)); g.px(x + 46, y0 + 12, ex(P.cyan));
      g.px(x + 38, y0 + 16, ex(P.cyan)); g.px(x + 47, y0 + 16, ex(P.cyan)); g.hline(x + 39, x + 46, y0 + 17, ex(P.cyan));
    }
    // slot and buttons
    g.rect(x + 36, y0 + 28, 14, 2, P.g3);
    for (let i = 0; i < 3; i++) g.rect(x + 36 + i * 5, y0 + 34, 3, 3, [P.red, P.gold, P.green][i]);
    // pipe and steam
    g.rect(x + w - 12, y0 - 30, 4, 8, P.g3);
    if (running) for (let i = 0; i < 3; i++) puff(g, x + w - 10, y0 - 32 - i * 6, ((t - RUN0) * 1.7 + i * 0.15) % 0.45, { col: P.white, n: 3, spread: 5 });
    if (t > RUN1 && t < RUN1 + 0.8) {
      const a = t - RUN1;
      text(g, 'DING!', x + w / 2, y0 - 40 - Math.round(Math.min(1, a * 8) * 6), { font: 'en', align: 'center', color: ex(P.yellow), outline: P.ink });
    }
  }

  function robot(g, x, y, t) {
    // desk
    g.rect(x - 18, y - 16, 36, 16, P.ink);
    g.rect(x - 17, y - 15, 34, 15, P.brown);
    g.rect(x - 17, y - 15, 34, 2, P.clay);
    // body
    const over = t > ERR + 0.2 && t < 65.2;
    const jit = over ? (Math.floor(t * 20) % 2) : 0;
    const by = y - 16;
    g.rect(x - 9, by - 12, 18, 12, P.ink); g.rect(x - 8, by - 11, 16, 11, P.g3);
    g.rect(x - 2, by - 11, 4, 3, ex(P.red));
    // head
    const hx = x + jit, hy = by - 13;
    g.rect(hx - 11, hy - 16, 22, 16, P.ink); g.rect(hx - 10, hy - 15, 20, 14, P.g2); g.rect(hx - 10, hy - 15, 20, 2, P.g1);
    g.rect(hx - 8, hy - 12, 16, 9, P.ink);
    g.vline(hx, hy - 22, hy - 17, P.ink);
    g.px(hx, hy - 23, Math.floor(t * 4) % 2 ? ex(P.red) : P.g3);
    // face on the screen
    const sc = (c) => ex(c);
    if (t > ERR) {
      const blink = Math.floor((t - ERR) * 8) % 2 === 0;
      if (blink) { g.line(hx - 4, hy - 11, hx + 3, hy - 5, sc(P.hot)); g.line(hx + 3, hy - 11, hx - 4, hy - 5, sc(P.hot)); }
    } else if (t > Q) {
      text(g, '???', hx, hy - 12, { font: 'zh8', align: 'center', color: sc(P.yellow) });
    } else {
      g.px(hx - 4, hy - 10, sc(P.cyan)); g.px(hx + 3, hy - 10, sc(P.cyan));
      g.px(hx - 5, hy - 7, sc(P.cyan)); g.px(hx + 4, hy - 7, sc(P.cyan)); g.hline(hx - 4, hx + 3, hy - 6, sc(P.cyan));
    }
    // arms holding a card up on each score
    const lastSc = SC.filter((s) => t >= s).pop();
    const raising = lastSc !== undefined && t - lastSc < 0.45 && t < PLACE;
    g.line(x - 9, by - 9, x - 14, raising ? by - 22 : by - 2, P.ink, 3);
    g.line(x + 9, by - 9, x + 14, by - 2, P.ink, 3);
    if (over) for (let i = 0; i < 3; i++) puff(g, hx - 6 + i * 6, hy - 18, ((t - ERR) * 1.5 + i * 0.13) % 0.45, { col: P.white, n: 3, spread: 4 });
  }

  function stage(g, t) {
    const x = STAGE.x, w = STAGE.w;
    // banner
    g.rect(x + 8, 132, w - 16, 18, P.ink);
    g.rect(x + 9, 133, w - 18, 16, P.redD);
    text(g, '花卉评审会', x + w / 2, 135, { align: 'center', color: P.yellow });
    g.vline(x + 10, 150, 196, P.g5); g.vline(x + w - 11, 150, 196, P.g5);
    // platform
    g.rect(x, 196, w, 16, P.ink);
    g.rect(x + 1, 197, w - 2, 3, P.tan);
    g.rect(x + 1, 200, w - 2, 12, P.brown);
    for (let i = 0; i < 6; i++) g.vline(x + 8 + i * 18, 201, 211, P.brownD);
    // pedestals with roses, and the empty fourth one
    for (let i = 0; i < 4; i++) {
      const px = x + 14 + i * 18;
      g.rect(px - 4, 184, 9, 12, P.ink); g.rect(px - 3, 185, 7, 11, P.g1);
      if (i < 3) {
        g.spr(rose(false, true), px, 184);
        if (t >= SC[i]) {
          const a = t - SC[i];
          const lift = Math.round(Math.min(1, a * 10) * 4);
          scoreCard(g, px, 156 - lift, '100', ex(P.white), ex(P.greenM));
          sparkle(g, px + 7, 154, a - 0.05, ex(P.yellow), 2);
        }
      } else if (t > PLACE && t < BACK + 0.1) {
        g.spr(seedSprite(t * 12, ex), px, 182);
        if (t > SCAN && t < Q + 0.4) g.line(x + w - 30, 162, px, 180, ex(P.hot));
        if (t > ERR) {
          const a = t - ERR;
          const lift = Math.round(Math.min(1, a * 10) * 4);
          scoreCard(g, px, 156 - lift, 'ERR', ex(P.white), ex(P.hot));
          if (a < 0.6) { const s = Math.round(10 - a * 8); g.line(px - s, 172 - s, px + s, 172 + s, ex(P.hot), 3); g.line(px + s, 172 - s, px - s, 172 + s, ex(P.hot), 3); }
        }
      }
    }
    robot(g, x + w - 22, 196, t);
  }

  const CANS = [P.red, P.gold, P.blue, P.green, P.magenta, P.orange, P.cyan, P.pink, P.purple, P.yellow];
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
    // window with shelves
    const wx = x + 6, wy = 140, ww = w - 12, wh = 66;
    g.rect(wx - 2, wy - 2, ww + 4, wh + 4, P.brown);
    g.rect(wx, wy, ww, wh, P.g5);
    g.rect(wx, wy + 30, 74, 2, P.tan);
    g.rect(wx, wy + 62, 74, 2, P.tan);
    CANS.forEach((c, i) => {
      const cx = wx + 4 + (i % 5) * 14, cy = wy + 12 + Math.floor(i / 5) * 32;
      g.rect(cx, cy, 11, 17, P.ink);
      g.rect(cx + 1, cy + 1, 9, 15, P.g1);
      g.rect(cx + 1, cy + 5, 9, 7, c);
      g.rect(cx + 1, cy + 1, 9, 2, P.g2);
      // SOLD OUT plate
      g.rect(cx - 1, cy + 13, 13, 6, ex(P.ink));
      g.rect(cx, cy + 14, 11, 4, ex(P.redD));
      g.hline(cx + 1, cx + 9, cy + 16, ex(P.pink));
    });
    text(g, 'SOLD OUT', wx + 37, wy + 2, { font: 'zh8', align: 'center', color: ex(P.pink) });
    // the pyramid of gray
    const px = wx + 82;
    for (let r = 0; r < 4; r++) for (let k = 0; k <= r; k++) {
      const cx = px + 18 - r * 6 + k * 12, cy = wy + 20 + r * 11;
      g.rect(cx, cy, 11, 11, P.ink); g.rect(cx + 1, cy + 1, 9, 9, P.g3); g.rect(cx + 1, cy + 4, 9, 3, P.g4);
    }
    g.rect(px - 2, wy + 4, 46, 12, P.white);
    text(g, '灰色 有货', px + 21, wy + 4, { font: 'zh', align: 'center', color: P.g4 });
  }

  // where the seed is (world) when held up at the paint shop
  const seedAt = (t) => [gx(t) + 9, GROUND - 26 - Math.round(prog(t, RAISE, RAISE + 0.3, E.outBack) * 6)];

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
      // the girl and her bow
      if (t < G_HIDE) {
        const k = prog(t, G_IN - 0.9, G_HIDE, E.lin);
        const x = lerp(BOOTH.x + 80, BOOTH.x + 16, k);
        drawCitizen(g, x, GROUND - 2, folkPoses.walk(m.beatF(t) * 0.8, { flip: true, expr: 'happy', acc: 'bow', hair: 'bob' }), girl.pal);
      } else if (t > OUT) {
        const a = t - OUT;
        const x = BOOTH.x + 16 - Math.max(0, a - 0.5) * 34;
        if (x > cx - 20) drawCitizen(g, x, GROUND - 2, a < 0.5 ? folkPoses.stand(t, { view: 'front', expr: 'standard' }) : folkPoses.walk(m.beatF(t), { flip: true, expr: 'standard' }));
        // bow pops off, falls, stays
        const bx = BOOTH.x + 20 + Math.min(1, a / 0.6) * 10, by = a < 0.6 ? GROUND - 34 - Math.sin((a / 0.6) * Math.PI) * 14 + (a / 0.6) * 30 : GROUND - 4;
        g.spr(bowSprite(), bx, by);
      }
      // gardener
      g.push(0, 0);
      gardener(g, t);
      g.pop();
      g.pop();
    },
    post(g, t) {
      const zones = [];
      if (t > RAISE) {
        const [sx, sy] = seedAt(t);
        const grow = prog(t, RAISE, RAISE + 0.6, E.outBack) * (t > FLASH - 0.4 ? 1 + 6 * prog(t, FLASH - 0.4, FLASH + 0.3, E.inQ) : 1);
        const r = (24 + 3 * Math.sin(t * 6)) * grow;
        zones.push({ x: sx - camX(t), y: sy - CAMY, r, soft: 10 });
      }
      grayPass(g, zones, 10);
    },
    over(g, t) { if (t > FLASH) g.drect(0, 0, g.W, g.H, P.white, prog(t, FLASH, T1, E.inQ)); },
  };

  function bowSprite() { return bowArt({ k: ex(P.ink), x: ex(P.hot) }); }

  function gardener(g, t) {
    const x = gx(t);
    let p;
    const running = (t > 59.9 && t < 60.85) || (t > 64.95 && t < 65.85);
    if (running) p = pose.run(t * 3.2, { expr: t < 61 ? 'surprised' : 'worried' });
    else if (t < WOW) p = { ...pose.idle(t), expr: t > OUT ? 'surprised' : 'neutral', armR: [2, 3], item: { s: seedSprite(t * 12, ex), dx: 1, dy: -1 } };
    else if (t < 59.9) {
      const a = t - WOW;
      p = { ...pose.idle(t), expr: 'surprised', bob: a < 0.2 ? -2 : 0, armL: [-3, 0], armR: [3, 0] };
    } else if (t < PLACE) p = { ...pose.idle(t), expr: 'neutral', armR: [3, 2], item: { s: seedSprite(t * 12, ex), dx: 1, dy: -1 } };
    else if (t < ERR) p = { ...pose.idle(t), expr: t > Q ? 'worried' : 'smile', armR: [4, 4] };
    else if (t < BACK) p = { ...pose.idle(t), expr: 'hurt', armL: [-3, 1], armR: [3, 1] };
    else if (t < 64.95) p = { ...pose.idle(t), expr: 'sad', armR: [2, 3], item: { s: seedSprite(t * 12, ex), dx: 1, dy: -1 } };
    else if (t < RAISE) p = { ...pose.idle(t), view: 'back' };
    else p = { ...pose.idle(t), expr: 'wow', armR: [3, -4 - Math.round(prog(t, RAISE, RAISE + 0.3, E.outBack) * 2)], item: { s: seedSprite(t * 14, ex), dx: 0, dy: -3 } };
    drawGardener(g, x, GROUND + 1, p);
    if (t > WOW && t < 59.9) g.spr(bubble('ex'), x + 2, GROUND - 32 - (t - WOW < 0.08 ? 2 : 0));
    if (t > ERR + 0.2 && t < 65.6) g.spr(bubble('sweat'), x + 9, GROUND - 26 + Math.round((t - ERR) * 3) % 3);
    if (t > RAISE) {
      const [sx, sy] = seedAt(t);
      glow(g, sx, sy, 10 + 2 * Math.sin(t * 8), ex(P.yellow), 0.35);
      sparkle(g, sx + 6, sy - 6, (t * 1.7) % 0.6, ex(P.white), 3);
    }
  }
};

function bowArt(pal) {
  return sprite(`
.kk.kk.
kxxkxxk
.kk.kk.`, pal, { ax: 3.5, ay: 3 });
}
