// 2:51.4–3:10.7  导歌二 · 传下去 — the old polaroid blows in; inside it the same seedling tray, but
// now a new generation babbles and the grown 豆豆 stands beside them. Calendar, race (豆豆 calm),
// then 豆豆 bends its flower over the smallest seed like an umbrella; one drop, and it sprouts.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2 } from '../core/math.js';
import { track } from '../core/camera.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawPip, drawPipBloom, blinkAt, drawSprout } from '../art/pip.js';
import { speechBubble, ripple, sparkle } from '../art/kit.js';
import { drawPolaroid, drawCalendar, drawClock, drawRuler, drawRibbon } from '../art/props.js';
import { pipSpec, darker } from '../art/flower.js';
import { Storm, T_S_END } from './s06_storm.js';
import { TRAY_Y, CELLS } from './s04_memory.js';

const T0 = T_S_END;                    // 171.356
export const T_E_END = 190.75;
const POL = { w: 560, h: 660 };
const PW = POL.w * 0.86, PHOTO_DY = -POL.h / 2 + POL.w * 0.07 + PW / 2;
const SQ = 860, SQC = [960, 650];
const T_PUSH0 = 172.55, T_PUSH1 = 173.35;
const PIP_X = 1560;
const NEW_TINT = [['#F2C9A0', 0.6], ['#C7A27A', 0.5], ['#EBC59A', 0.55], ['#D6AE86', 0.45]];
const RIBBON_Y = TRAY_Y - 2300;

export class Echo extends Scene {
  constructor(film) {
    super(film, T0, T_E_END + 0.001);
    this.pipF = pipSpec();
    this.cam = track([
      { t: T_PUSH1, x: SQC[0], y: SQC[1], z: 1920 / SQ },
      { t: 174.8, x: 1060, y: 560, z: 1.0, e: E.ioC },
      { t: 180.9, x: 1060, y: 560, z: 1.0 },
      { t: 184.7, x: 1000, y: -1200, z: 0.82, e: E.ioQ },
      { t: 185.2, x: 1000, y: -1260, z: 0.8, e: E.outC },
      { t: 186.25, x: 1100, y: 600, z: 1.22, e: E.ioC },
      { t: T_E_END, x: 1080, y: 590, z: 1.32, e: E.sine },
    ]);
    const beats = [];
    for (let b = Math.ceil(this.m.beatF(181.05)); this.m.beatTime(b) < 184.8; b++) beats.push(this.m.beatTime(b));
    this.spurts = [0, 1, 2, 3].map((i) => beats.map((bt, j) => ({ t: bt + hash2(i + 20, j) * 0.12, h: (j < 3 ? 120 : 260) * (0.65 + 0.7 * hash2(i * 3 + 21, j)) })));
    this.spurts.forEach((sp, i) => { const tot = sp.reduce((s, q) => s + q.h, 0); sp.forEach((q) => { q.h *= (2050 + 140 * hash2(i, 77)) / tot; }); });
  }
  storm() { return this.film.scenes.find((s) => s instanceof Storm); }
  static lyrics() {
    return {
      27: { x: 960, y: 118, size: 66, accent: (i, u) => (u.c === '牙' ? C.coral : null) },
      28: { x: 960, y: 112, size: 70, accent: (i, u) => (u.c === '明' || u.c === '天' ? C.leafDark : null) },
      29: { x: 1490, y: 520, size: 80, rows: [3, 9], accent: (i, u) => (i >= 10 ? C.coral : null), exitT: 185.0 },
      30: { x: 960, y: 128, size: 76, accent: (i, u) => (i >= 5 ? C.marigold : null) },
    };
  }
  height(i, t) {
    let h = 0;
    for (const q of this.spurts[i]) h += q.h * E.outBack(prog(t, q.t, q.t + 0.32), 1.2);
    return h;
  }

  draw(ctx, t) {
    if (t < T_PUSH1) {
      // the hill keeps going underneath while the photo flutters in
      this.storm().draw(ctx, Math.min(t, T0 + 1.2));
      this.drawPhotoPhase(ctx, t);
      return;
    }
    this.apply(ctx, this.cam(t));
    this.drawWorld(ctx, t);
    const tint = 1 - prog(t, 173.6, 174.9);
    this.screen(ctx);
    if (tint > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(232,205,160,${0.32 * tint})`; ctx.fillRect(0, 0, 1920, 1080); ctx.globalCompositeOperation = 'source-over'; }
    this.drawSpeed(ctx, t);
  }

  drawPhotoPhase(ctx, t) {
    this.screen(ctx);
    const fly = prog(t, T0 - 0.1, T_PUSH0, E.outC);
    const push = prog(t, T_PUSH0, T_PUSH1, E.ioC);
    const S = Math.exp(lerp(0, Math.log(1920 / PW), push)) * lerp(0.35, 1, fly);
    const x = lerp(lerp(1700, 960, fly), 960, push), y = lerp(lerp(-200, 560, fly), 540 - PHOTO_DY * S, push);
    const rot = lerp(lerp(1.1, -0.05, fly) + Math.sin(t * 5) * 0.08 * (1 - fly), 0, push);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(S, S);
    drawPolaroid(ctx, POL.w, POL.h, (c, px, py, w, h) => {
      c.save();
      c.translate(px + w / 2, py + h / 2);
      c.scale(w / SQ, w / SQ);
      c.translate(-SQC[0], -SQC[1]);
      this.drawWorld(c, t);
      c.restore();
      c.fillStyle = 'rgba(232,205,160,0.32)';
      c.globalCompositeOperation = 'multiply';
      c.fillRect(px, py, w, h);
      c.globalCompositeOperation = 'source-over';
    }, { caption: '小时候' });
    ctx.restore();
  }

  drawWorld(ctx, t) {
    shape(ctx, P.rect(-400, -3200, 3000, 4500), { fill: '#F5ECDD', riso: 0 });
    for (let x = -400; x < 2600; x += 140) shape(ctx, P.rect(x, -3200, 60, 4500), { fill: '#EEE3D0', riso: 0 });
    // a window of daylight this time
    shape(ctx, P.rrect(1260, 190, 420, 300, 10), { fill: '#CDEBF7', line: darker('#C99063', 0.3), lw: 8 });
    stroke(ctx, P.line(1470, 190, 1470, 490), darker('#C99063', 0.3), 6);
    shape(ctx, P.rect(-400, TRAY_Y + 120, 3000, 800), { fill: '#C99063', line: darker('#C99063', 0.5), lw: 2.4 });
    const race = prog(t, 180.6, 181.3, E.outC);
    if (race > 0) {
      ctx.save();
      ctx.globalAlpha = race;
      drawRuler(ctx, 380, TRAY_Y + 100, RIBBON_Y - 200);
      drawRibbon(ctx, 520, 1400, RIBBON_Y, t);
      ctx.restore();
    }
    this.drawWorry(ctx, t);
    shape(ctx, P.rrect(540, TRAY_Y - 10, 840, 130, 14), { fill: '#4E6A5E', line: INK, lw: 2.6, shadow: true });
    CELLS.forEach((x) => {
      shape(ctx, P.rrect(x - 70, TRAY_Y, 140, 100, 10), { fill: '#628274', line: INK, lw: 2 });
      shape(ctx, P.ellipse(x, TRAY_Y + 10, 62, 14), { fill: C.soil, line: darker(C.soil, 0.45), lw: 2 });
    });
    [0, 1, 3, 4].forEach((ci, i) => this.drawSeedling(ctx, t, i, CELLS[ci]));
    this.drawLittle(ctx, t);
    this.drawGrown(ctx, t);
    this.drawBabble(ctx, t);
  }

  drawSeedling(ctx, t, i, x) {
    const s = 104;
    const H = this.height(i, t);
    const worried = t > 176.6 && t < 181.0;
    const racing = t > 181.0;
    const mood = racing ? 'happy' : worried ? 'worried' : t > 173.8 && t < 176 && i % 2 ? 'laugh' : 'smile';
    drawPip(ctx, x, TRAY_Y + 8 + Math.sin(t * 5 + i) * 3 * (t < 176 ? 1 : 0), s, { mood, blink: blinkAt(t, i + 14), look: racing ? [0, -1] : [(i < 2 ? 1 : -1) * 0.5, -0.1], legs: 0, shadow: false, tint: NEW_TINT[i], sprout: H > 1 ? 0 : 1 });
    const headY = TRAY_Y + 8 - s * 0.84;
    if (H > 1) {
      const tipY = headY - 40 - H, sway = Math.sin(t * 3 + i * 2) * 10;
      const path = (c) => { c.beginPath(); c.moveTo(x, headY + 20); c.bezierCurveTo(x - 20, headY - H * 0.3, x + 24 + sway, headY - H * 0.7, x + sway, tipY); };
      stroke(ctx, path, darker(C.stem, 0.5), 11);
      stroke(ctx, path, C.leafLight, 7);
      for (let k = 1; k <= Math.floor(H / 260); k++) {
        ctx.save();
        ctx.translate(x + Math.sin(k) * 8, headY - k * 260 + 60);
        ctx.rotate(-Math.PI / 2 + (k % 2 ? 0.9 : -0.9));
        shape(ctx, P.leaf(70, 18, k % 2 ? 0.3 : -0.3), { fill: C.leaf, line: C.leafDark, lw: 2 });
        ctx.restore();
      }
      drawSprout(ctx, x + sway, tipY + 40, 80, 1);
    }
  }

  // the smallest seed, in the middle cell: it sprouts under 豆豆's flower
  drawLittle(ctx, t) {
    const x = CELLS[2];
    const dropT = this.ut(30, 8);
    const sp = prog(t, dropT + 0.05, dropT + 0.45);
    const mood = t > dropT + 0.2 ? 'happy' : t > 185.4 ? 'worried' : t > 181 ? 'wow' : 'smile';
    drawPip(ctx, x, TRAY_Y + 8, 84, { mood, blink: blinkAt(t, 21), look: t > 186 && t < dropT ? [0.5, -0.8] : [0, 0], legs: 0, shadow: false, tint: ['#F7E0C4', 0.55], sprout: E.outBack(sp, 1.8), squash: t > dropT ? 1 - 0.2 * wobble(t - dropT, 3, 5) : 1 });
    const dk = prog(t, dropT - 0.55, dropT, E.inQ);
    const from = this.flowerTip(dropT - 0.55);
    if (dk > 0 && dk < 1) shape(ctx, P.drop(lerp(from[0], x, dk), lerp(from[1] + 60, TRAY_Y - 70, dk), 24, 36), { fill: '#BFE3F0', line: darker('#6EC1E4', 0.5), lw: 2 });
    if (t > dropT) {
      ripple(ctx, x, TRAY_Y - 60, t, dropT, { r1: 60, color: '#6EC1E4', dur: 0.6, squash: 0.4 });
      for (let k = 0; k < 4; k++) sparkle(ctx, x + (k - 1.5) * 50, TRAY_Y - 110 - (k % 2) * 30, 18 * Math.sin(Math.PI * prog(t, dropT + 0.1 + k * 0.08, dropT + 0.9 + k * 0.08)), { rot: t });
    }
  }

  lean(t) { return E.ioC(prog(t, 186.4, 187.6)) * (1 - E.ioC(prog(t, 189.2, 190.4))); }
  flowerTip(t) {
    const lean = this.lean(t);
    const sway = -0.85 * lean + Math.sin(t * 1.4) * 0.03;
    const h = 430, top = [PIP_X, TRAY_Y + 120 - 150 * 0.16 - 150 * 0.84 * 0.92];
    return [top[0] + Math.sin(sway) * h * 0.85, top[1] - Math.cos(sway) * h];
  }

  drawGrown(ctx, t) {
    const lean = this.lean(t);
    const sway = -0.85 * lean + Math.sin(t * 1.4) * 0.03;
    const dropT = this.ut(30, 8);
    const look = t > 185.6 ? [-0.8, 0] : t > 181 && t < 185 ? [-0.3, -1] : [-0.7, 0.1];
    const mood = t > dropT ? 'happy' : t > 185.6 ? 'calm' : t > 176.6 && t < 181 ? 'smile' : 'happy';
    const glow = win(t, 187.2, 187.8, dropT + 0.3, dropT + 1.2) * 0.9;
    drawPipBloom(ctx, PIP_X, TRAY_Y + 120, 150, { mood, look, blink: blinkAt(t, 1), stemH: 430, R: 172, open: 1, F: this.pipF, sway, glow, rot: -0.05 * lean });
  }

  drawBabble(ctx, t) {
    const at = [this.ut(27, 6), this.ut(27, 7), this.ut(27, 8), this.ut(27, 9)];
    const cells = [0, 1, 3, 4];
    at.forEach((a, j) => {
      const k = prog(t, a - 0.05, a + 0.3), out = 1 - prog(t, 175.9, 176.3);
      if (k <= 0 || out <= 0) return;
      ctx.save();
      ctx.translate(CELLS[cells[j]] + (j < 2 ? -30 : 30), TRAY_Y - 220 - (j % 2) * 40);
      ctx.scale(E.outBack(k, 2) * out, E.outBack(k, 2) * out);
      speechBubble(ctx, 0, 0, 130, 74, j < 2 ? 40 : -40, 70, {});
      const sc = (c) => { c.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24; i ? c.lineTo(-42 + u * 84, Math.sin(u * TAU * 2.5 + j) * 10) : c.moveTo(-42, Math.sin(j) * 10); } };
      stroke(ctx, sc, [C.coral, C.violet, C.leafDark, C.sky][j], 4);
      ctx.restore();
    });
  }

  drawWorry(ctx, t) {
    const k = prog(t, 176.2, 176.8, E.outBack) * (1 - prog(t, 180.7, 181.2));
    if (k <= 0) return;
    const step = this.m.beat / 2, t0 = 176.8;
    const n = Math.max(0, Math.floor((t - t0) / step));
    ctx.save(); ctx.translate(430, 380); ctx.scale(k, k);
    drawCalendar(ctx, 0, 0, 230, 1 + n, t > t0 ? ((t - t0) % step) / step : 0);
    ctx.restore();
    ctx.save(); ctx.translate(930, 300); ctx.scale(k * 0.85, k * 0.85);
    drawClock(ctx, 0, 0, 130, (t - 176.2) * 7);
    ctx.restore();
  }

  drawSpeed(ctx, t) {
    const up = win(t, 181.2, 181.8, 184.4, 184.8), down = win(t, 185.3, 185.5, 185.8, 186.1);
    const a = Math.max(up, down);
    if (a <= 0) return;
    for (let i = 0; i < 16; i++) {
      const x = hash2(i, 1) < 0.5 ? 80 + hash2(i, 2) * 340 : 1500 + hash2(i, 2) * 340;
      const ph = ((t * (up > down ? 2.4 : -3) + hash2(i, 3)) % 1 + 1) % 1;
      stroke(ctx, P.line(x, ph * 1400 - 160, x, ph * 1400 - 20 + hash2(i, 4) * 120), INK, 2.4, { alpha: a * 0.35 });
    }
  }
}
