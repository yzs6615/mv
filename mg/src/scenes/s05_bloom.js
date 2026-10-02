// 1:30–2:12.6  副歌一 + 间奏 — 豆豆 hops out of the memory onto its own green line and blooms; seeds
// sprout around it, the field grows and blooms, drops splash colour across the sky; the garden
// dances, then the weather turns and everything holds its breath for one raindrop.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2, smoothstep, mix } from '../core/math.js';
import { track } from '../core/camera.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawLine } from '../core/text.js';
import { drawPip, drawPipBloom, blinkAt, drawSprout } from '../art/pip.js';
import { ripple, sparkle, drawPetal, petalDrift, butterfly, splash, drawCloud, skyGradient, drawGround } from '../art/kit.js';
import { flowerSpec, pipSpec, drawPlant, darker, mixHex } from '../art/flower.js';
import { Memory, T_M_END, TRAY_Y, CELLS } from './s04_memory.js';

const T0 = T_M_END;                    // 90.144
export const T_B_END = 132.568;        // verse 2 downbeat
export const GY2 = TRAY_Y + 120;       // 920: the shelf becomes the meadow
export const PIPX = 2080;
const HOPS = [[960, TRAY_Y + 8], [1300, GY2], [1560, GY2], [1820, GY2], [PIPX, GY2]];
const SPLASH_COLORS = ['#FFB39F', '#FFE08A', '#BFE3F0', '#D9CCF5', '#FFD3E0', '#C8E6C0', '#CFE0FA', '#FFC9A0', '#B8E6DE', '#FFF0B8'];

export class Bloom extends Scene {
  constructor(film) {
    super(film, T0, T_B_END + 0.001);
    const m = this.m;
    this.hopT = [T0, m.beatTime(Math.round(m.beatF(T0)) + 1), m.beatTime(Math.round(m.beatF(T0)) + 2), m.beatTime(Math.round(m.beatF(T0)) + 3), m.barTime(m.barIndex(T0) + 1)];
    this.pipF = pipSpec();
    this.cam = track([
      { t: T0, x: 960, y: 640, z: 1.42 },
      { t: 92.5, x: 1790, y: 560, z: 1.08, e: E.ioC },
      { t: 96.6, x: 1760, y: 545, z: 1.2, e: E.sine },
      { t: 98.4, x: PIPX + 120, y: 650, z: 0.76, e: E.ioC },
      { t: 102.2, x: PIPX + 160, y: 640, z: 0.74, e: E.sine },
      { t: 106.4, x: PIPX + 160, y: 530, z: 0.72, e: E.ioC },
      { t: 111.96, x: PIPX + 260, y: 520, z: 0.74, e: E.sine },
      { t: 121.5, x: 3300, y: 540, z: 0.8, e: E.ioQ },
      { t: 130.9, x: PIPX + 40, y: 500, z: 1.0, e: E.ioC },
      { t: T_B_END, x: PIPX, y: 420, z: 1.3, e: E.inQ },
    ]);
    // the field: two rows of seeds around 豆豆's spot
    this.plants = [];
    const e8 = m.beat / 2;
    for (let row = 0; row < 2; row++) {
      for (let x = -400 + row * 60; x < 5200; x += 118 + row * 22) {
        if (Math.abs(x - PIPX) < 150 + row * 40) continue;
        const i = this.plants.length;
        const d = Math.abs(x - PIPX) / 2700;
        const sprout = 97.42 + Math.round((d * 3.9 + hash2(i, 2) * 0.25) / e8) * e8;
        this.plants.push({
          x: x + hash2(i, 1) * 40 - 20, row, d, F: flowerSpec(7000 + i), H: (row ? 170 : 220) + hash2(i, 3) * 170, R: (row ? 44 : 56) + hash2(i, 4) * 18,
          sprout, grow0: 102.27 + d * 0.9, grow1: 105.6 + d * 0.5, bloom: 106.05 + d * 0.75 + hash2(i, 5) * 0.12,
          seedCol: ['#C98A5B', '#B5794E', '#D9A06B', '#9C6B48', '#E2B07E'][i % 5],
        });
      }
    }
    this.plants.sort((a, b) => a.row === b.row ? a.x - b.x : b.row - a.row);
  }
  memory() { return this.film.scenes.find((s) => s instanceof Memory); }

  static lyrics() {
    return {
      14: { x: 960, y: 128, size: 86, style: 'pop', accent: (i, u) => (u.c === '清' || u.c === '脆' ? C.coral : null) },
      15: { inScene: true },
      16: { x: 960, y: 118, size: 72, accent: (i, u) => (i >= 8 && i <= 9 ? C.leafDark : i >= 11 ? C.leaf : null) },
      17: { x: 960, y: 118, size: 72, accent: (i, u) => (i >= 10 ? C.coral : null) },
      18: { x: 960, y: 118, size: 74, accent: (i, u) => (u.c === '色' ? C.coral : u.c === '彩' ? C.marigold : u.c === '汗' || u.c === '水' ? C.sky : null), exitT: 111.6 },
    };
  }

  // ---------- timeline helpers ----------
  pipPos(t) {
    const H = this.hopT;
    if (t <= H[0]) return { x: HOPS[0][0], y: HOPS[0][1], air: 0, k: 0 };
    for (let i = 0; i < 4; i++) {
      if (t < H[i + 1]) {
        const u = (t - H[i]) / (H[i + 1] - H[i]);
        const arc = i === 0 ? 210 : 95;
        return { x: lerp(HOPS[i][0], HOPS[i + 1][0], E.sine(u)), y: lerp(HOPS[i][1], HOPS[i + 1][1], u) - Math.sin(u * Math.PI) * arc, air: Math.sin(u * Math.PI), k: i };
      }
    }
    // dance hops on the downbeats of the interlude
    let y = GY2;
    if (t > 112.0 && t < 121.5) {
      const ph = this.m.sinceBar(t);
      y -= Math.max(0, Math.sin((ph / 0.5) * Math.PI)) * (ph < 0.5 ? 60 : 0);
    }
    return { x: PIPX, y, air: 0, k: 4 };
  }
  stemH(t) { return 360 * E.outBack(prog(t, 92.62, 93.85), 1.3) + 70 * E.ioC(prog(t, 102.3, 105.9)); }
  pipOpen(t) {
    const a = this.ut(15, 6), b = this.ut(15, 10);
    return E.outC(prog(t, a - 0.1, b + 0.15));
  }
  sky(t) { return prog(t, 90.3, 91.3, E.ioC); }
  weather(t) { return E.ioC(prog(t, 121.66, 128.5)); }
  frozen(t) { return t > 131.36 ? 131.36 : t; }

  draw(ctx, t) {
    const cam = this.cam(t);
    const T = this.frozen(t);
    // sky behind everything
    this.screen(ctx);
    const sk = this.sky(t);
    ctx.globalAlpha = sk;
    skyGradient(ctx, 0, 0, 1920, 1080, '#FCD9C6', C.paper, '#FBE8D8');
    ctx.globalAlpha = 1;
    this.apply(ctx, cam);
    if (sk > 0) this.drawSplashes(ctx, T, cam);
    // memory set: backdrop flies up, tray stays to the left
    if (t < 93.5) this.memory().drawWorld(ctx, t, { lift: 2600 * E.inQ(prog(t, T0 + 0.05, T0 + 1.0)), noPip: true, noShelf: sk > 0.98 });
    // meadow
    const ga = prog(t, T0 + 0.1, T0 + 0.9);
    if (ga > 0) drawGround(ctx, -1200, 6400, GY2, { seed: 4, alpha: ga, depth: 260, color: '#9B6A47' });
    this.drawPath(ctx, t);
    this.drawField(ctx, T, t);
    this.drawHero(ctx, T, t);
    this.drawConfetti(ctx, t);
    this.drawButterflies(ctx, T);
    this.drawWeather(ctx, t, cam);
    this.screen(ctx);
    this.drawHeroType(ctx, t);
  }

  drawPath(ctx, t) {
    // 豆豆's own green line, drawn under its feet as it hops
    const p = this.pipPos(t);
    const x1 = t < this.hopT[1] ? 1300 : Math.min(PIPX + 2400 * E.ioC(prog(t, 111.96, 121.5)), Math.max(1300, p.x));
    if (t < this.hopT[1] - 0.02) return;
    stroke(ctx, P.line(1240, GY2 + 2, x1, GY2 + 2), C.leafDark, 9);
    stroke(ctx, P.line(1240, GY2 + 2, x1, GY2 + 2), C.leafLight, 5);
    for (let i = 1; i < 5; i++) {
      ripple(ctx, HOPS[i][0], GY2, t, this.hopT[i], { r1: 150, color: C.coral, lw: 6, dur: 0.6, squash: 0.28 });
      ripple(ctx, HOPS[i][0], GY2, t, this.hopT[i] + 0.08, { r1: 95, color: C.leafDark, lw: 4, dur: 0.5, squash: 0.28 });
    }
    for (let i = 1; i < 5; i++) {
      const k = prog(t, this.hopT[i], this.hopT[i] + 0.35);
      if (k > 0 && k < 1) for (let j = 0; j < 3; j++) sparkle(ctx, HOPS[i][0] + (j - 1) * 50 * (1 + k), GY2 - 30 - k * 60 - (j === 1 ? 30 : 0), 14 * Math.sin(k * Math.PI), { rot: k * 3 });
    }
  }

  drawField(ctx, T, t) {
    const bounce = T > 111.96 && T < 121.6 ? this.m.pulse(T, 6) : 0;
    const wind = this.weather(t) * 0.22 * Math.sin(T * 2.3);
    for (const p of this.plants) {
      const shown = prog(T, p.sprout - 1.2, p.sprout - 0.9);
      if (shown <= 0) continue;
      const depth = p.row ? 0.82 : 1;
      const y = GY2 - (p.row ? 26 : 0);
      ctx.save();
      ctx.translate(p.x, y);
      ctx.scale(depth, depth);
      // seed peeking out of the soil, then the sprout
      const sp = prog(T, p.sprout, p.sprout + 0.32);
      const g = E.ioC(prog(T, p.grow0, p.grow1));
      if (g <= 0.02) {
        shape(ctx, P.drop(0, -20 + 8 * (1 - shown), 46, 60), { fill: p.seedCol, line: darker(p.seedCol, 0.5), lw: 2.2, alpha: shown });
        if (sp > 0) drawSprout(ctx, 0, -46, 105 * E.outBack(sp, 1.8), sp);
      } else {
        const open = prog(T, p.bloom, p.bloom + 0.55);
        const sway = Math.sin(T * 1.3 + p.F.phase) * 0.05 + wind * (0.7 + 0.6 * hash2(p.x | 0, 3)) + (bounce ? Math.sin(p.x * 0.01) * 0.02 * bounce : 0);
        ctx.scale(1, 1 + 0.06 * bounce);
        drawPlant(ctx, p.F, 0, 0, Math.max(40, p.H * g), p.R, { open, bud: open > 0 ? 1 : clamp((g - 0.6) / 0.4), sway, shadow: !p.row, leafGrow: clamp(g * 1.5), tint: p.row ? ['#F4EDE1', 0.12] : null });
        if (open > 0 && open < 1 && !p.row) sparkle(ctx, Math.sin(sway) * p.H * g, -p.H * g - p.R, 16 * Math.sin(open * Math.PI), { rot: open * 3 });
      }
      ctx.restore();
    }
  }

  drawHero(ctx, T, t) {
    const p = this.pipPos(t);
    const s = 150;
    let squash = 1;
    for (let i = 1; i < 5; i++) if (t > this.hopT[i]) squash = 1 - 0.28 * wobble(t - this.hopT[i], 2.6, 6);
    if (t > T0 - 0.01 && t < this.hopT[1]) squash = 1 + 0.12 * Math.sin(prog(t, T0, this.hopT[1]) * Math.PI);
    const open = this.pipOpen(t);
    const stemH = this.stemH(T);
    const bud = prog(T, 93.3, 94.8);
    const sway = Math.sin(T * 1.6) * 0.05 + this.weather(t) * 0.25 * Math.sin(T * 2.3 + 1);
    const dance = T > 112 && T < 121.6 ? Math.sin(T * Math.PI * 2 / (this.m.beat * 2)) * 0.12 : 0;
    const mood = t < 92.6 ? (p.air > 0.2 ? 'laugh' : 'happy') : open > 0 && open < 1 ? 'wow' : T > 125.5 ? 'worried' : 'happy';
    const look = t < 92.6 ? [0.7, -0.1] : open > 0 && open < 1 ? [0, -1] : T > 124 ? [0.2, -1] : [0, 0];
    const glow = win(t, this.ut(15, 10) - 0.2, this.ut(15, 10), this.ut(15, 10) + 0.6, this.ut(15, 10) + 2.2);
    drawPipBloom(ctx, p.x, p.y, s, {
      mood, look, blink: blinkAt(T, 1), squash, rot: dance * 0.4,
      stemH, R: 150 + 22 * E.ioC(prog(T, 102.3, 105.9)), open, bud, F: this.pipF, sway: sway + dance, glow, spin: (T - 96) * 0.03,
    });
  }

  drawConfetti(ctx, t) {
    const at = this.ut(15, 10);
    if (t < at || t > at + 3.5) return;
    const tip = [PIPX, GY2 - 150 * 0.98 - this.stemH(t)];
    for (let i = 0; i < 26; i++) {
      const u = t - at;
      const a = hash2(i, 3) * TAU, v = 380 + hash2(i, 4) * 520;
      const x = tip[0] + Math.cos(a) * v * u, y = tip[1] + Math.sin(a) * v * u * 0.8 + 260 * u * u;
      drawPetal(ctx, x, y, 22 + hash2(i, 5) * 16, u * 6 + i, [C.coral, C.peach, C.marigold, C.pink, '#FFFFFF'][i % 5], { alpha: 1 - prog(u, 2.2, 3.5), flip: Math.cos(u * 8 + i) });
    }
  }

  drawSplashes(ctx, T, cam) {
    const L = this.line(18);
    if (!L) return;
    const times = L.chars.map((c) => c.t);
    times.forEach((td, i) => {
      // the drop falls for half a second, then splashes into a blot of colour behind the field
      const x = PIPX - 1500 + hash2(i, 7) * 3400, y = -260 + hash2(i, 8) * 620;
      const fall = prog(T, td - 0.45, td, E.inQ);
      if (fall > 0 && fall < 1) shape(ctx, P.drop(x, lerp(y - 900, y, fall), 40, 60), { fill: SPLASH_COLORS[i], line: darker(SPLASH_COLORS[i], 0.45), lw: 2 });
      const k = prog(T, td, td + 1.1, E.outC);
      if (k > 0) splash(ctx, x, y, (680 + hash2(i, 9) * 420) * k, SPLASH_COLORS[i], i * 13 + 5, { phase: T * 0.3 });
    });
    // last syllable: the whole sky takes the colour
    const fin = prog(T, times[times.length - 1] + 0.05, times[times.length - 1] + 1.2, E.ioC);
    if (fin > 0) {
      ctx.save();
      ctx.globalAlpha = fin * 0.55;
      const g = ctx.createLinearGradient(cam.x - 2000, 0, cam.x + 2000, 0);
      ['#FFD3C2', '#FFE9A8', '#CDEBF7', '#E3D8FA'].forEach((c, j) => g.addColorStop(j / 3, c));
      ctx.fillStyle = g;
      ctx.fillRect(cam.x - 4000, -3000, 8000, 3000 + GY2);
      ctx.restore();
    }
  }

  drawButterflies(ctx, T) {
    if (T < 111.5 || T > 129) return;
    const a = prog(T, 111.5, 112.5) * (1 - prog(T, 127, 129));
    for (let i = 0; i < 3; i++) {
      const u = T - 111.5 + i * 2.2;
      const x = PIPX - 600 + u * 160 + Math.sin(u * 0.9 + i) * 200, y = GY2 - 520 - i * 90 + Math.sin(u * 1.7 + i * 2) * 90;
      butterfly(ctx, x, y, 92, u * 9 + i, [C.lemon, C.lavender, C.sky][i], { alpha: a, rot: Math.sin(u * 1.3) * 0.3 });
    }
  }

  drawWeather(ctx, t, cam) {
    const w = this.weather(t);
    if (w <= 0) return;
    // a grey veil and heavy clouds closing in from both sides
    ctx.save();
    ctx.globalAlpha = w * 0.38;
    ctx.fillStyle = '#7B819C';
    ctx.fillRect(cam.x - 4000, -4000, 8000, 4000 + GY2 + 2000);
    ctx.restore();
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      const k = E.outC(prog(t, 121.66 + i * 0.5, 126 + i * 0.6));
      const x = cam.x + side * (2400 - 1350 * k) - side * i * 150, y = cam.y - 540 / cam.z + 150 + (i % 3) * 95;
      drawCloud(ctx, x, y, 760 + (i % 3) * 180, 190, { fill: i % 2 ? '#9AA0B8' : '#A9AEC4', line: '#5D6380', seed: i + 3, shadow: true, alpha: k, shadeColor: 'rgba(70,76,104,0.35)' });
    }
    // the half-bar breath: one drop falls on 豆豆's flower
    const dk = prog(t, 131.36, T_B_END, E.inQ);
    if (dk > 0 && dk < 1) {
      const tip = [PIPX, GY2 - 150 * 0.98 - this.stemH(131.36) - 40];
      shape(ctx, P.drop(tip[0] + 20, lerp(tip[1] - 900, tip[1], dk), 30, 46), { fill: '#BFE3F0', line: darker('#6EC1E4', 0.5), lw: 2.2 });
    }
  }

  drawHeroType(ctx, t) {
    const L = this.line(15);
    if (!L) return;
    const a = { ...L, chars: L.chars.slice(0, 6) }, b = { ...L, chars: L.chars.slice(6) };
    const exitT = 96.95;
    drawLine(ctx, a, t, { x: 150, y: 330, size: 74, align: 'left', exitT, exitDur: 0.4, seed: 15 });
    drawLine(ctx, b, t, { x: 140, y: 480, size: 140, align: 'left', style: 'stamp', inDur: 0.3, exitT: exitT + 0.05, exitDur: 0.4, accent: (i, u) => (u.c === '花' ? C.coral : null), seed: 16 });
  }
}
