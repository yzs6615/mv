// 1:11–1:30  导歌一 · 害怕慢一步 — the paint-chip fan folds into a polaroid of the seedling tray;
// the camera pushes into the photo (the memory turns vivid), calendar pages fly, then a vertical
// race to the ribbon while 豆豆 alone has not sprouted; a light and a single drop: don't be afraid.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2 } from '../core/math.js';
import { track } from '../core/camera.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawPip, blinkAt, drawSprout } from '../art/pip.js';
import { speechBubble, ripple, sparkle, drawPetal } from '../art/kit.js';
import { drawFan, drawPolaroid, drawCalendar, drawClock, drawRuler, drawRibbon, FAN_COLORS } from '../art/props.js';
import { darker } from '../art/flower.js';
import { T_W_END } from './s03_world.js';

const T0 = T_W_END;                 // 70.75
export const T_M_END = 90.144;
const POL = { x: 960, y: 600, w: 560, h: 660 };
const PW = POL.w * 0.86, PHOTO_DY = -POL.h / 2 + POL.w * 0.07 + PW / 2;
const SQ = 860;                     // world square shown in the photo
const SQC = [960, 650];
const T_PUSH0 = 75.0, T_PUSH1 = 75.75;
export const TRAY_Y = 800;
export const CELLS = [640, 800, 960, 1120, 1280];
const SIB_TINT = [['#E2B07E', 0.55], ['#9C6B48', 0.45], ['#D3B48C', 0.6], ['#B5794E', 0.35]];
const RIBBON_Y = TRAY_Y - 2300;

export class Memory extends Scene {
  constructor(film) {
    super(film, T0, T_M_END + 0.001);
    this.cam = track([
      { t: T_PUSH1, x: SQC[0], y: SQC[1], z: 1920 / SQ },
      { t: 77.1, x: 960, y: 560, z: 1.0, e: E.ioC },
      { t: 80.3, x: 960, y: 560, z: 1.0 },
      { t: 84.1, x: 960, y: -1220, z: 0.82, e: E.ioQ },
      { t: 84.7, x: 960, y: -1300, z: 0.8, e: E.outC },
      { t: 85.75, x: 960, y: 650, z: 1.3, e: E.ioC },
      { t: T_M_END, x: 960, y: 640, z: 1.42, e: E.sine },
    ]);
    // race: per-sibling growth spurts on the beats
    const beats = [];
    for (let b = Math.ceil(this.m.beatF(80.45)); this.m.beatTime(b) < 84.2; b++) beats.push(this.m.beatTime(b));
    this.spurts = [0, 1, 2, 3].map((i) => beats.map((bt, j) => ({ t: bt + hash2(i, j) * 0.12, h: (j < 3 ? 120 : 260) * (0.65 + 0.7 * hash2(i * 3 + 1, j)) * (i === 2 ? 1.12 : 1) })));
    this.spurts.forEach((sp) => { const tot = sp.reduce((s, q) => s + q.h, 0); sp.forEach((q) => { q.h *= (2150 + hash2(sp.length, tot | 0) * 120) / tot; }); });
    this.spurts[2].forEach((q) => { q.h *= 1.04; });
  }
  static lyrics() {
    return {
      10: { x: 960, y: 118, size: 66, accent: (i, u) => (u.c === '牙' ? C.coral : null) },
      11: { x: 960, y: 112, size: 70, accent: (i, u) => (u.c === '明' || u.c === '天' ? C.coral : null) },
      12: { x: 1470, y: 520, size: 80, rows: [3, 9], accent: (i, u) => (i >= 10 ? C.coral : null), exitT: 84.55 },
      13: { x: 960, y: 128, size: 76, accent: (i, u) => (i >= 5 ? C.marigold : null) },
    };
  }

  height(i, t) {
    let h = 0;
    for (const q of this.spurts[i]) h += q.h * E.outBack(prog(t, q.t, q.t + 0.32), 1.2);
    return h;
  }

  draw(ctx, t) {
    if (t < T_PUSH1) this.drawPolaroidPhase(ctx, t);
    else {
      this.apply(ctx, this.cam(t));
      this.drawWorld(ctx, t);
      const tint = 1 - prog(t, 75.9, 77.2);
      if (tint > 0) { this.screen(ctx); ctx.fillStyle = `rgba(232,205,160,${0.32 * tint})`; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(0, 0, 1920, 1080); ctx.globalCompositeOperation = 'source-over'; }
      this.screen(ctx);
      this.drawSpeed(ctx, t);
    }
  }

  drawPolaroidPhase(ctx, t) {
    this.screen(ctx);
    // the fan folds shut and turns into the photo
    const close = prog(t, T0, T0 + 0.55, E.ioC);
    const morph = prog(t, T0 + 0.5, T0 + 1.15, E.ioC);
    if (morph <= 0) {
      drawFan(ctx, 960, 1030, 600, 132, () => 1 - close, () => 1, { n: FAN_COLORS.length });
      return;
    }
    if (morph < 1) {
      // the closed stack (pivot at the bottom) rises and unfolds into the card
      const u = morph;
      const w = lerp(132, POL.w, u), h = lerp(600, POL.h, u);
      const cx = 960, cy = lerp(1030 - 300, POL.y, u);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(lerp(0, -0.06, u));
      shape(ctx, P.rrect(-w / 2, -h / 2, w, h, lerp(16, 2, u)), { fill: '#FFFEF9', line: INK, lw: 2.2, shadow: { dx: 10, dy: 14, color: 'rgba(42,46,69,0.16)' } });
      const m = w * 0.07 * u + 12 * (1 - u);
      shape(ctx, P.rrect(-w / 2 + m, -h / 2 + m, w - 2 * m, lerp(h * 0.62, w - 2 * m, u), lerp(10, 0, u)), { fill: FAN_COLORS[FAN_COLORS.length - 1], riso: 0, alpha: 1 - u });
      ctx.restore();
      if (u < 0.7) return;
    }
    const push = prog(t, T_PUSH0, T_PUSH1, E.ioC);
    const S = Math.exp(lerp(0, Math.log(1920 / PW), push));
    const pop = 1;
    const rot = lerp(-0.06, 0, push) + Math.sin(t * 0.8) * 0.01 * (1 - push);
    const fadeIn = prog(morph, 0.7, 1);
    ctx.save();
    // keep the photo centre heading to the screen centre as we push in
    const cy = lerp(POL.y, 540 - PHOTO_DY * S, push);
    ctx.translate(POL.x, lerp(POL.y, cy, push));
    ctx.rotate(rot);
    ctx.scale(S, S);
    ctx.globalAlpha = fadeIn;
    drawPolaroid(ctx, POL.w, POL.h, (c, x, y, w, h) => {
      c.save();
      c.translate(x + w / 2, y + h / 2);
      c.scale(w / SQ, w / SQ);
      c.translate(-SQC[0], -SQC[1]);
      this.drawWorld(c, t);
      c.restore();
      c.fillStyle = 'rgba(232,205,160,0.32)';
      c.globalCompositeOperation = 'multiply';
      c.fillRect(x, y, w, h);
      c.globalCompositeOperation = 'source-over';
    }, { caption: '小时候', alpha: 1 });
    ctx.restore();
  }

  // o.lift raises the wall like a stage backdrop, o.noPip leaves 豆豆 to the next scene, o.noShelf
  drawWorld(ctx, t, o = {}) {
    const lift = o.lift ?? 0;
    ctx.save();
    ctx.translate(0, -lift);
    // wall
    shape(ctx, P.rect(-400, -3200, 2800, 4500), { fill: '#F3E6D3', riso: 0, shadow: lift > 0 ? { dx: 0, dy: 30, color: 'rgba(42,46,69,0.18)' } : null });
    for (let x = -400; x < 2400; x += 140) shape(ctx, P.rect(x, -3200, 60, 4500), { fill: '#EEDDC6', riso: 0 });
    // ruler + ribbon appear for the race
    const race = prog(t, 79.9, 80.6, E.outC);
    if (race > 0) {
      ctx.save();
      ctx.globalAlpha = race;
      drawRuler(ctx, 380, TRAY_Y + 100, RIBBON_Y - 200);
      drawRibbon(ctx, 520, 1400, RIBBON_Y, t);
      ctx.restore();
    }
    this.drawWorryProps(ctx, t);
    ctx.restore();
    // shelf edge the tray sits on
    if (!o.noShelf) shape(ctx, P.rect(-400, TRAY_Y + 120, 2800, 800), { fill: '#C99063', line: darker('#C99063', 0.5), lw: 2.4 });
    // tray
    shape(ctx, P.rrect(540, TRAY_Y - 10, 840, 130, 14), { fill: '#3F4A5E', line: INK, lw: 2.6, shadow: true });
    CELLS.forEach((x) => {
      shape(ctx, P.rrect(x - 70, TRAY_Y, 140, 100, 10), { fill: '#56627A', line: INK, lw: 2 });
      shape(ctx, P.ellipse(x, TRAY_Y + 10, 62, 14), { fill: C.soil, line: darker(C.soil, 0.45), lw: 2 });
    });
    // siblings and 豆豆
    const sib = [0, 1, 3, 4];
    sib.forEach((ci, i) => this.drawSibling(ctx, t, i, CELLS[ci]));
    if (!o.noPip) this.drawPipHere(ctx, t);
    this.drawBabble(ctx, t);
  }

  drawSibling(ctx, t, i, x) {
    const s = 118;
    const H = this.height(i, t);
    const worried = t > 75.9 && t < 80.4;
    const racing = t > 80.4;
    const mood = racing ? (t > 84.0 && i === 2 ? 'laugh' : 'happy') : worried ? 'worried' : t > 72.6 && t < 75.2 && i % 2 === 0 ? 'laugh' : 'smile';
    const look = racing ? [0, -1] : worried ? [(i < 2 ? 1 : -1) * 0.5, -0.4] : [(i < 2 ? 1 : -1) * 0.6, 0];
    const bob = Math.sin(t * 5 + i) * 3 * (t < 75.5 ? 1 : 0);
    drawPip(ctx, x, TRAY_Y + 8 + bob, s, { mood, blink: blinkAt(t, i + 4), look, legs: 0, shadow: false, tint: SIB_TINT[i], sprout: H > 1 ? 0 : 1 });
    const headY = TRAY_Y + 8 - s * 0.84;
    if (H > 1) {
      // tall racing stem with alternate leaves and the seed leaves on top
      const tipY = headY - 40 - H;
      const sway = Math.sin(t * 3 + i * 2) * 10;
      const path = (c) => { c.beginPath(); c.moveTo(x, headY + 20); c.bezierCurveTo(x - 20, headY - H * 0.3, x + 24 + sway, headY - H * 0.7, x + sway, tipY); };
      stroke(ctx, path, darker(C.stem, 0.5), 11);
      stroke(ctx, path, C.leafLight, 7);
      const n = Math.floor(H / 260);
      for (let k = 1; k <= n; k++) {
        const y = headY - k * 260 + 60;
        ctx.save();
        ctx.translate(x + Math.sin(k) * 8, y);
        ctx.rotate(-Math.PI / 2 + (k % 2 ? 0.9 : -0.9));
        shape(ctx, P.leaf(70, 18, k % 2 ? 0.3 : -0.3), { fill: C.leaf, line: C.leafDark, lw: 2 });
        ctx.restore();
      }
      drawSprout(ctx, x + sway, tipY + 40, 80, 1);
    }
    // sweat drop while worrying
    if (worried && hash2(i, 7) > 0.3) {
      const k = ((t - 75.9) * 1.3 + hash2(i, 2)) % 1;
      shape(ctx, P.drop(x + 46, headY + 40 + k * 30, 14, 22), { fill: '#BFE3F0', line: darker('#6EC1E4', 0.5), lw: 1.5, alpha: 1 - k });
    }
  }

  drawPipHere(ctx, t) {
    const x = CELLS[2];
    const s = 118;
    const dropT = this.ut(13, 8);   // 怕
    const lit = prog(t, this.ut(13, 5) - 0.2, this.ut(13, 5) + 0.6);
    // the light from above
    if (lit > 0) {
      const g = ctx.createLinearGradient(0, TRAY_Y - 900, 0, TRAY_Y);
      g.addColorStop(0, 'rgba(255,232,160,0)');
      g.addColorStop(1, `rgba(255,232,160,${0.55 * lit})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 60, TRAY_Y - 900); ctx.lineTo(x + 60, TRAY_Y - 900); ctx.lineTo(x + 170, TRAY_Y + 20); ctx.lineTo(x - 170, TRAY_Y + 20); ctx.closePath();
      ctx.fill();
    }
    const alone = t > 84.6;
    const glow = prog(t, dropT, dropT + 0.5) * (1 - prog(t, dropT + 1.6, dropT + 2.4));
    if (glow > 0) stroke(ctx, P.circle(x, TRAY_Y - 40, 70 + glow * 50), C.marigold, 4, { alpha: glow * 0.8 });
    const crouch = prog(t, 89.15, T_M_END, E.inQ);
    const land = t > dropT ? 1 - 0.18 * wobble(t - dropT, 3, 5) : 1;
    const mood = t > dropT + 0.3 ? (t > 88.6 ? 'happy' : 'calm') : alone ? 'worried' : t > 75.9 && t < 80.4 ? 'worried' : t > 80.4 ? 'wow' : 'smile';
    const look = alone && t < dropT - 0.2 ? [0, -1] : t > 80.4 && t < 84.6 ? [0.3, -1] : t > dropT + 0.3 ? [0, -0.2] : [0, 0];
    drawPip(ctx, x, TRAY_Y + 8, s, { mood, blink: blinkAt(t, 1), look, legs: 0, shadow: false, squash: land * (1 - 0.18 * crouch) });
    // the drop
    const dk = prog(t, dropT - 0.9, dropT, E.inQ);
    if (dk > 0 && dk < 1) shape(ctx, P.drop(x, lerp(TRAY_Y - 760, TRAY_Y - 110, dk), 26, 40), { fill: '#BFE3F0', line: darker('#6EC1E4', 0.5), lw: 2 });
    if (t > dropT) {
      ripple(ctx, x, TRAY_Y - 98, t, dropT, { r1: 70, color: '#6EC1E4', dur: 0.6, squash: 0.4 });
      for (let k = 0; k < 4; k++) {
        const u = prog(t, dropT, dropT + 0.5);
        if (u > 0 && u < 1) shape(ctx, P.circle(x + (k - 1.5) * 30 * u * 2, TRAY_Y - 100 - Math.sin(u * Math.PI) * 50, 6 * (1 - u)), { fill: '#BFE3F0', line: darker('#6EC1E4', 0.5), lw: 1.2 });
      }
      for (let k = 0; k < 3; k++) sparkle(ctx, x + (k - 1) * 90, TRAY_Y - 140 - k * 20, 18 * Math.sin(Math.PI * prog(t, dropT + 0.1 + k * 0.1, dropT + 0.8 + k * 0.1)), { rot: t });
    }
  }

  drawBabble(ctx, t) {
    const at = [this.ut(10, 6), this.ut(10, 7), this.ut(10, 8), this.ut(10, 9)];
    const cells = [0, 1, 3, 4];
    at.forEach((a, j) => {
      const k = prog(t, a - 0.05, a + 0.3);
      const out = 1 - prog(t, 75.0, 75.4);
      if (k <= 0 || out <= 0) return;
      const x = CELLS[cells[j]] + (j < 2 ? -30 : 30), y = TRAY_Y - 230 - (j % 2) * 40;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(E.outBack(k, 2) * out, E.outBack(k, 2) * out);
      speechBubble(ctx, 0, 0, 130, 74, (j < 2 ? 40 : -40), 70, {});
      // scribble: "ya ya"
      const sc = (c) => { c.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24; const xx = -42 + u * 84, yy = Math.sin(u * TAU * 2.5 + j) * 10; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } };
      stroke(ctx, sc, [C.coral, C.violet, C.leafDark, C.sky][j], 4);
      ctx.restore();
    });
  }

  drawWorryProps(ctx, t) {
    const k = prog(t, 75.75, 76.4, E.outBack) * (1 - prog(t, 80.0, 80.5));
    if (k <= 0) return;
    // calendar flips on eighth notes, faster around 明天
    const t0 = 76.3;
    const step = this.m.beat / 2;
    const n = Math.max(0, Math.floor((t - t0) / step));
    const flip = t > t0 ? ((t - t0) % step) / step : 0;
    ctx.save();
    ctx.translate(430, 380);
    ctx.scale(k, k);
    drawCalendar(ctx, 0, 0, 230, 1 + n, t > t0 ? flip : 0);
    ctx.restore();
    ctx.save();
    ctx.translate(1500, 360);
    ctx.scale(k, k);
    drawClock(ctx, 0, 0, 130, (t - 75.75) * 7);
    ctx.restore();
  }

  drawSpeed(ctx, t) {
    // vertical speed lines while racing / dropping
    const up = win(t, 80.6, 81.2, 83.9, 84.3), down = win(t, 84.8, 85.0, 85.3, 85.6);
    const a = Math.max(up, down);
    if (a <= 0) return;
    for (let i = 0; i < 16; i++) {
      const x = hash2(i, 1) < 0.5 ? 80 + hash2(i, 2) * 340 : 1500 + hash2(i, 2) * 340;
      const ph = ((t * (up > down ? 2.4 : -3) + hash2(i, 3)) % 1 + 1) % 1;
      const y = ph * 1400 - 160;
      stroke(ctx, P.line(x, y, x, y + 140 + hash2(i, 4) * 120), INK, 2.4, { alpha: a * 0.35 });
    }
  }
}
