// 0:32–0:51  主歌一 · 花店 — facade, the bucket flowers turn and smile, the camera passes through the
// 16:9 shop window into the interior (vase of three, then the shelf: thoughts, then a catalogue).
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2 } from '../core/math.js';
import { track, pinned, worldToScreen } from '../core/camera.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawPip, blinkAt } from '../art/pip.js';
import { thoughtBubble, icon, sparkle } from '../art/kit.js';
import { shopWindow } from '../art/town.js';
import { drawInterior, COUNTER_Y, SHELF_Y, POT_FLOWERS, vaseFlowers } from '../art/shop.js';
import { darker } from '../art/flower.js';
import { Opening, SHOP_X, GY } from './s01_opening.js';

const WIN = shopWindow(SHOP_X, GY);
const WC = [WIN[0] + WIN[2] / 2, WIN[1] + WIN[3] / 2];
const ZIN = 1920 / WIN[2];
export const T_IN0 = 35.95, T_IN1 = 37.0;   // through the window
export const T_END = 51.36;

export class Shop extends Scene {
  constructor(film) {
    super(film, 31.96, T_END + 0.001);
    this.icam = track([
      { t: T_IN1, x: 960, y: 540, z: 1 },
      { t: 41.0, x: 935, y: 525, z: 1.07, e: E.sine },
      { t: 42.75, x: 2660, y: 450, z: 1.1, e: E.ioC },
      { t: 46.2, x: 2720, y: 450, z: 1.12, e: E.sine },
      { t: T_END, x: 3700, y: 470, z: 1.08, e: E.ioQ },
    ]);
    this.fcam0 = track([{ t: 31.96, x: SHOP_X, y: 470, z: 1.0 }, { t: T_IN0, x: SHOP_X - 32, y: 488, z: 1.05, e: E.ioC }]);
  }
  opening() { return this.film.scenes.find((s) => s instanceof Opening); }

  static lyrics() {
    return {
      2: { x: 960, y: 112, size: 70, accent: (i, u) => (u.c === '花' ? C.coral : null), exitT: 35.9 },
      3: { x: 960, y: 962, size: 70, accent: (i, u) => (u.c === '笑' ? C.coral : u.c === '艳' ? C.magenta : u.c === '亮' ? C.marigold : null) },
      4: { x: 960, y: 962, size: 70, accent: (i, u) => (i >= 9 ? C.violet : null) },
      5: { x: 960, y: 962, size: 70, accent: (i, u) => (u.c === '独' || u.c === '特' ? C.coral : null), exitT: 50.95 },
    };
  }

  // interior camera at any time (before the pass-through it is the first view)
  interiorCam(t) { return t < T_IN1 ? { x: 960, y: 540, z: 1 } : this.icam(t); }

  facadeCam(t) {
    if (t < T_IN0) return this.fcam0(t);
    const c0 = this.fcam0(T_IN0);
    const u = E.ioQt(prog(t, T_IN0, T_IN1));
    const z = Math.exp(lerp(Math.log(c0.z), Math.log(ZIN), u));
    const s0 = worldToScreen(c0, WC[0], WC[1]);
    return pinned(WC[0], WC[1], z, lerp(s0[0], 960, u), lerp(s0[1], 540, u));
  }

  interiorOpts(t) {
    return {
      faces: (i) => {
        const at = [this.ut(3, 1), this.ut(3, 4), this.ut(3, 6)][i];
        if (t < at - 0.05) return null;
        const k = t - at;
        return { mood: i === 0 && k < 1.6 ? 'happy' : i === 2 && k < 1.2 ? 'laugh' : 'smile', blink: blinkAt(t, 3 + i), look: [-0.2 + 0.4 * (i / 2), 0.2] };
      },
      sat: (i) => (i === 1 ? lerp(0.12, 1, E.ioC(prog(t, this.ut(3, 4) - 0.1, this.ut(3, 5) + 0.25))) : 1),
      glint: (i) => (i === 2 ? prog(t, this.ut(3, 6) - 0.05, this.ut(3, 9) + 0.6) : 0),
      potFace: (i) => (t > 41.5 && t < 46.4 && i < 5 ? { mood: hash2(i, 2) > 0.5 ? 'smile' : 'calm', blink: blinkAt(t, i + 9), look: [0, -0.6] } : null),
    };
  }

  draw(ctx, t) {
    if (t < T_IN1) this.drawFacade(ctx, t);
    else this.drawInside(ctx, t);
  }

  drawFacade(ctx, t) {
    const cam = this.facadeCam(t);
    const op = this.opening();
    const smileAt = (i) => this.ut(2, 9) + i * 0.11;
    op.drawWorld(ctx, t, cam, {
      interiorCam: () => this.interiorCam(t),
      interior: this.interiorOpts(t),
      bucketFace: (i) => (t > smileAt(i) ? { mood: t - smileAt(i) < 0.9 ? 'happy' : 'smile', blink: blinkAt(t, i), look: [0.3, -0.2] } : null),
      after: (c) => this.drawPipOutside(c, t),
    });
  }

  drawPipOutside(ctx, t) {
    const [sx, sy] = [WIN[0] + WIN[2] * 0.47, WIN[1] + WIN[3]];
    const s = 140 * 0.86;
    const hop = prog(t, 35.75, 36.45);
    if (hop >= 1) return;
    const lookAt = t < 33.2 ? [Math.sin(t * 2.2) * 0.7, 0] : t < 34.3 ? [-0.8, 0.3] : t < 35.6 ? [0.9, 0.3] : [0, -0.6];
    const mood = t > this.ut(2, 9) && t < 35.7 ? 'wow' : t < 32.6 ? 'happy' : 'smile';
    const land = 1 - 0.28 * wobble(t - 31.96, 2.4, 5);
    if (hop <= 0) {
      drawPip(ctx, sx, sy, s, { mood, blink: blinkAt(t, 1), look: lookAt, squash: land });
      return;
    }
    // hop up and into the window: arc towards the centre of the glass, shrinking as it "enters"
    const x = lerp(sx, WC[0], hop), y = lerp(sy, WC[1] + 40, hop) - Math.sin(hop * Math.PI) * 120;
    drawPip(ctx, x, y, s * lerp(1, 0.35, E.inQ(hop)), { mood: 'laugh', look: [0, -0.5], squash: 1 + 0.15 * Math.sin(hop * Math.PI), alpha: 1 - prog(hop, 0.75, 1), shadow: false });
  }

  drawInside(ctx, t) {
    const cam = this.icam(t);
    this.apply(ctx, cam);
    drawInterior(ctx, t, this.interiorOpts(t));
    this.drawPipInside(ctx, t);
    this.drawThoughts(ctx, t);
    this.drawLabels(ctx, t);
  }

  pipX(t) { return lerp(1460, 1960, E.ioC(prog(t, 41.1, 42.7))); }

  drawPipInside(ctx, t) {
    const s = 150;
    const x = this.pipX(t);
    const fall = prog(t, T_IN1 - 0.05, T_IN1 + 0.3, E.inQ);
    const y = lerp(COUNTER_Y - 420, COUNTER_Y, fall);
    const walking = t > 41.1 && t < 42.7;
    const sq = fall < 1 ? 1.1 : 1 - 0.3 * wobble(t - T_IN1 - 0.3, 2.4, 5);
    const look = t < 38 ? [-0.6, -0.5] : t < 41.2 ? [-0.8, -0.7] : t < 46.3 ? [0.6, -0.8] : [0.8, -0.5];
    const mood = t > 37.1 && t < 40.6 ? (t > this.ut(3, 6) ? 'wow' : 'happy') : t > 44.6 && t < 46.4 ? 'calm' : 'smile';
    drawPip(ctx, x, y, s, { mood, blink: blinkAt(t, 1), look, squash: sq, step: walking ? (t - 41.1) * 2.2 : 0, walk: walking ? 1 : 0, rot: walking ? Math.sin((t - 41.1) * 2.2 * TAU) * 0.06 : 0 });
  }

  drawThoughts(ctx, t) {
    const icons = ['note', 'star', 'book', 'plane', 'heart'];
    const at = [this.ut(4, 3), this.ut(4, 5), this.ut(4, 8), this.ut(4, 9), this.ut(4, 10)];
    const out = 46.25;
    POT_FLOWERS.slice(0, 5).forEach((p, i) => {
      const k = prog(t, at[i], at[i] + 0.45);
      const o = 1 - prog(t, out + i * 0.05, out + 0.35 + i * 0.05);
      if (k <= 0 || o <= 0) return;
      const sc = E.outBack(k, 2) * o;
      const hx = p.x, hy = SHELF_Y - 40 - p.h;
      const bx = hx + 70, by = hy - p.R - 110 + Math.sin(t * 2 + i) * 6;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(sc, sc);
      thoughtBubble(ctx, 0, 0, 150, 108, -70 / sc, (p.R + 60) / sc, {});
      icon(ctx, icons[i], 0, 0, 72, {});
      ctx.restore();
    });
    // 豆豆 wonders what it will become
    const k = prog(t, this.ut(4, 11), this.ut(4, 11) + 0.45), o = 1 - prog(t, out, out + 0.4);
    if (k > 0 && o > 0) {
      const x = this.pipX(t) + 175, y = COUNTER_Y - 120 + Math.sin(t * 2) * 6;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(E.outBack(k, 2) * o * 1.25, E.outBack(k, 2) * o * 1.25);
      thoughtBubble(ctx, 0, 0, 120, 100, -110, 40, { fill: '#FFF3C4' });
      icon(ctx, 'question', 0, 0, 80, { color: C.coral });
      ctx.restore();
    }
  }

  drawLabels(ctx, t) {
    const at = [this.ut(5, 1), this.ut(5, 3), this.ut(5, 5), this.ut(5, 7), this.ut(5, 10)];
    const out = T_END - 0.3;
    POT_FLOWERS.slice(3, 8).forEach((p, j) => {
      const k = prog(t, at[j], at[j] + 0.55);
      const o = 1 - prog(t, out, out + 0.4);
      if (k <= 0 || o <= 0) return;
      const hx = p.x, hy = SHELF_Y - 40 - p.h;
      const ex = hx + 120, ey = hy - p.R - 120;
      const lk = E.outC(clamp(k * 1.6));
      // leader line: dot on the flower, elbow, card
      shape(ctx, P.circle(hx + p.R * 0.45, hy - p.R * 0.3, 7 * lk), { fill: INK, riso: 0, alpha: o });
      const path = (c) => { c.beginPath(); c.moveTo(hx + p.R * 0.45, hy - p.R * 0.3); c.lineTo(lerp(hx + p.R * 0.45, ex - 30, lk), lerp(hy - p.R * 0.3, ey, lk)); if (lk >= 1) c.lineTo(ex, ey); };
      stroke(ctx, path, INK, 2.2, { alpha: o });
      const ck = E.outBack(prog(k, 0.45, 1), 1.8) * o;
      if (ck <= 0) return;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.scale(ck, ck);
      shape(ctx, P.rrect(0, -58, 210, 116, 14), { fill: '#FFFDF7', line: INK, lw: 2.2, shadow: true });
      const L0 = p.F.layers[0];
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 600 30px "Fraunces"';
      ctx.fillText(`No.${String(p.F.seed).padStart(4, '0')}`, 18, -30);
      ctx.font = '700 26px "LXGW WenKai"';
      ctx.fillText(`${L0.n} 瓣 · ${F_NAME[p.F.type]}`, 18, 4);
      shape(ctx, P.circle(30, 36, 10), { fill: L0.color, line: darker(L0.color, 0.5), lw: 1.6 });
      ctx.fillStyle = INK;
      ctx.font = '400 22px "Fraunces"';
      ctx.fillText(L0.color.toUpperCase(), 48, 37);
      ctx.restore();
    });
  }
}

const F_NAME = { daisy: '雏菊型', cosmos: '波斯菊型', poppy: '罂粟型', camellia: '山茶型', star: '星形', sunflower: '向日葵型', anemone: '银莲型', dahlia: '大丽型', lotus: '莲型', sakura: '樱型' };
