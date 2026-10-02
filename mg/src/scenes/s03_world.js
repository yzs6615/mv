// 0:51–1:11  主歌一后半 · 世界 — pull out of the shop window, the town, onto a small paper planet;
// flowers spread over it, burst on the beat; dive into one flower (vertical type); its petals peel
// off into a paint-chip fan.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2, smoothstep } from '../core/math.js';
import { pinned, worldToScreen } from '../core/camera.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawPip, blinkAt } from '../art/pip.js';
import { sparkle, petalDrift, drawPetal, skyGradient } from '../art/kit.js';
import { shopWindow } from '../art/town.js';
import { drawGlobe, GFLOWERS, project, HV } from '../art/globe.js';
import { flowerSpec, drawHead, darker, mixHex, SEEDS } from '../art/flower.js';
import { drawFan, FAN_COLORS, FAN_ANGLE } from '../art/props.js';
import { Opening, SHOP_X, GY } from './s01_opening.js';
import { Shop, T_END } from './s02_shop.js';

const WIN = shopWindow(SHOP_X, GY);
const WC = [WIN[0] + WIN[2] / 2, WIN[1] + WIN[3] / 2];
const ZIN = 1920 / WIN[2];
const T0 = T_END;           // 51.36
const T_GLOBE = 52.95;      // planet takes over
const T_DIVE0 = 60.55, T_DIVE1 = 61.3;
const T_FAN = 65.85;
export const T_W_END = 70.75;
const MACRO = { x: 1250, y: 560, R: 420 };
const FAN = { x: 960, y: 1030, len: 600, wid: 132 };

export class World extends Scene {
  constructor(film) {
    super(film, T0, T_W_END + 0.001);
    this.macroF = flowerSpec(8061, { type: 'camellia', scheme: ['#F48FB1', '#FFE0EA', '#FFB627', '#E0567A'], tilt: 1 });
    this.macroF.layers.forEach((L) => { L.n = 7; });
    // keep only globe flowers that are actually seen (bloomed and on the visible side at some frame)
    for (let i = GFLOWERS.length - 1; i >= 0; i--) {
      const f = GFLOWERS[i];
      let seen = false;
      for (let t = 53.75 + f.d * 1.2 + 0.1; t < T_DIVE0 && !seen; t += 0.1) seen = project([f.p.x, f.p.y, f.p.z], this.phi(t), 1, 0, 0)[2] > 0.12;
      if (!seen) { SEEDS.delete(f.F.seed); GFLOWERS.splice(i, 1); }
    }
    // the flower we dive into: the most frontal one when the dive starts
    let best = null, bz = -1;
    for (const f of GFLOWERS) {
      const [sx, sy, z] = project([f.p.x, f.p.y, f.p.z], this.phi(T_DIVE0), 1, 0, 0);
      if (z > bz && Math.abs(sx) < 0.5 && Math.abs(sy) < 0.5) { bz = z; best = f; }
    }
    this.dive = best;
    // burst schedule on eighth notes through the second line
    const e8 = this.m.beat / 2;
    GFLOWERS.forEach((f, i) => { f.tb = 56.2 + Math.floor(f.burst * 16) * e8 * 2 + (i % 2) * e8; });
  }
  shop() { return this.film.scenes.find((s) => s instanceof Shop); }
  opening() { return this.film.scenes.find((s) => s instanceof Opening); }
  phi(t) { return -0.9 + 0.22 * (t - T0) + 0.55 * Math.max(0, t - 56.2) - 0.45 * Math.max(0, t - 59.4); }

  static lyrics() {
    return {
      6: { x: 960, y: 118, size: 68, accent: (i, u) => (u.c === '洋' || u.c === '洒' ? C.sky : null) },
      7: { x: 470, y: 520, size: 80, rows: [4], accent: (i, u) => (u.c === '惊' || u.c === '讶' ? C.coral : null), exitT: 60.12, exitDur: 0.4 },
      8: { x: 520, y: 560, size: 84, vertical: true, rows: [3], colAlign: 'center', lineHeight: 1.45, accent: (i, u) => (i >= 8 ? C.rose : null), exitT: 65.6, exitStyle: 'fade' },
      9: { x: 960, y: 150, size: 74, accent: (i, u) => (u.c === '色' || u.c === '彩' ? C.marigold : null), exitT: 69.95 },
    };
  }

  // flat world camera while pulling out of the window
  flatCam(t) {
    const u = E.ioC(prog(t, T0, T_GLOBE + 0.45));
    const z = Math.exp(lerp(Math.log(ZIN), Math.log(0.16), u));
    return pinned(WC[0], WC[1], z, lerp(960, 960 + (WC[0] - 6300) * 0.2, u), lerp(540, 610, u));
  }
  globeGeom(t) {
    const g = prog(t, T_GLOBE, 54.6, E.outC);
    const R = Math.exp(lerp(Math.log(2600), Math.log(345), g));
    const top = lerp(this.flatGround(t), 245, g);
    // L7 moves the planet to the right, the dive grows it around the chosen flower
    const side = E.ioC(prog(t, 55.9, 56.7)) * (1 - E.ioC(prog(t, 59.9, 60.5)));
    const cx = 960 + 260 * side;
    return { R: R * (1 + 0.12 * side), cx, cy: top + R * (1 + 0.12 * side) + 0 * side };
  }
  flatGround(t) { const c = this.flatCam(Math.min(t, T_GLOBE + 0.45)); return worldToScreen(c, 0, GY)[1]; }

  draw(ctx, t) {
    if (t < T_GLOBE + 0.4) this.drawFlat(ctx, t);
    if (t >= T_GLOBE) this.drawPlanet(ctx, t);
    if (t >= T_DIVE0) this.drawMacro(ctx, t);
  }

  drawFlat(ctx, t) {
    const cam = this.flatCam(t);
    const fade = 1 - prog(t, T_GLOBE, T_GLOBE + 0.4);
    ctx.save();
    ctx.globalAlpha = fade;
    const shop = this.shop();
    this.opening().drawWorld(ctx, t, cam, {
      interiorCam: () => shop.icam(T_END), interior: shop.interiorOpts(T_END - 0.01), extraHouses: true,
    });
    ctx.restore();
  }

  drawPlanet(ctx, t) {
    const a = prog(t, T_GLOBE, T_GLOBE + 0.4);
    const dive = prog(t, T_DIVE0, T_DIVE1, E.inQ);
    if (dive >= 1) return;
    const { R, cx, cy } = this.globeGeom(t);
    // dive: scale the planet up around the chosen flower
    const phi = this.phi(Math.min(t, T_DIVE0));
    const [fx, fy] = project([this.dive.p.x, this.dive.p.y, this.dive.p.z], phi, R, cx, cy);
    const zoom = Math.exp(dive * Math.log(26));
    this.screen(ctx);
    ctx.save();
    ctx.globalAlpha = a * (1 - prog(dive, 0.55, 1));
    ctx.translate(fx, fy);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);
    const bloom = (f) => prog(t, 53.75 + f.d * 1.2, 54.35 + f.d * 1.2);
    const burst = (f) => (t > f.tb && t < 60.5 ? Math.exp(-(t - f.tb) * 5) : 0);
    drawGlobe(ctx, cx, cy, R, t, { phi, bloom, burst, alpha: 1 });
    // sparkles with the bursts
    if (t > 56.2 && t < 60.4) {
      for (let i = 0; i < 10; i++) {
        const tb = 56.2 + i * 0.42;
        const k = prog(t, tb, tb + 0.6);
        if (k <= 0 || k >= 1) continue;
        const an = hash2(i, 3) * TAU, rr = R * (0.3 + 0.6 * hash2(i, 4));
        sparkle(ctx, cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.8, 22 * Math.sin(k * Math.PI), { rot: k * 2 });
      }
    }
    ctx.restore();
    this.drawInset(ctx, t);
  }

  // 豆豆, amazed, in a round inset ("让你无比惊讶")
  drawInset(ctx, t) {
    const at = this.ut(7, 5);
    const k = E.outBack(prog(t, at - 0.15, at + 0.35), 1.8) * (1 - E.inBack(prog(t, 60.0, 60.45)));
    if (k <= 0) return;
    const x = 470, y = 850, r = 128 * k;
    shape(ctx, P.circle(x, y, r), { fill: '#FFE9B8', line: INK, lw: 3, shadow: true });
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, TAU);
    ctx.clip();
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * TAU + t * 0.4;
      shape(ctx, P.poly([[x, y], [x + Math.cos(an - 0.13) * r, y + Math.sin(an - 0.13) * r], [x + Math.cos(an + 0.13) * r, y + Math.sin(an + 0.13) * r]]), { fill: 'rgba(255,182,39,0.25)', riso: 0 });
    }
    drawPip(ctx, x, y + r * 0.95, r * 1.45, { mood: t - at < 1.6 ? 'wow' : 'laugh', blink: blinkAt(t, 2), look: [0.5, -0.3], legs: 0, shadow: false, squash: 1 + 0.08 * wobble(t - at, 3, 4) });
    ctx.restore();
  }

  drawMacro(ctx, t) {
    const dive = prog(t, T_DIVE0, T_DIVE1, E.ioC);
    const bgA = prog(t, T_DIVE0 + 0.2, T_DIVE1);
    if (bgA > 0) {
      this.screen(ctx);
      ctx.globalAlpha = bgA;
      const g = ctx.createRadialGradient(MACRO.x, MACRO.y, 50, MACRO.x, MACRO.y, 1300);
      g.addColorStop(0, '#FCE9E2');
      g.addColorStop(1, C.paper);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.globalAlpha = 1;
    }
    // where the dive flower sits on screen when the dive starts
    const { R, cx, cy } = this.globeGeom(T_DIVE0);
    const [fx, fy] = project([this.dive.p.x, this.dive.p.y, this.dive.p.z], this.phi(T_DIVE0), R, cx, cy);
    const r0 = R * 0.046 * this.dive.s;
    const x = lerp(fx, MACRO.x, dive), y = lerp(fy, MACRO.y, dive);
    const Rr = Math.exp(lerp(Math.log(r0), Math.log(MACRO.R), dive));
    const open = lerp(0.36, 1, E.ioC(prog(t, T_DIVE1 - 0.2, 64.9)));
    const peel = prog(t, T_FAN, T_FAN + 3.6);
    this.screen(ctx);
    if (t > T_DIVE1) petalDrift(ctx, t, { n: 22, x0: 700, y0: 120, w: 1200, h: 800, wind: 26, fall: -18, size: 10, colors: ['#FFE58A', '#FFFFFF', '#F48FB1'], loop: true, life: 7, alpha: 0.55 * (1 - peel) });
    const F = this.macroF;
    const fan = this.fanState(t);
    // the flower loses one outer petal per chip (they fly to the fan)
    ctx.save();
    const shrink = 1 - 0.35 * E.inQ(peel);
    drawHead(ctx, F, x, y, Rr * shrink, { open: t < T_FAN ? open : 1, spin: (t - T_DIVE1) * 0.05, shadow: true, alpha: 1 - prog(t, 69.0, 69.7), tint: dive < 1 ? null : null });
    ctx.restore();
    if (t >= T_FAN) this.drawFanPart(ctx, t, x, y, Rr * shrink, fan);
  }

  fanState(t) {
    const n = FAN_COLORS.length;
    const L = this.line(9);
    const times = L ? L.chars.map((c) => c.t) : [];
    while (times.length < n) times.push((times[times.length - 1] ?? 69) + 0.18);
    return { n, times, spread: prog(t, this.ut(9, 9) - 0.05, this.ut(9, 9) + 0.9) };
  }

  drawFanPart(ctx, t, hx, hy, R, fan) {
    const { n, times, spread } = fan;
    const fly = 0.55;
    // chips that have landed
    drawFan(ctx, FAN.x, FAN.y, FAN.len, FAN.wid,
      (i) => lerp(0.32, 1, spring(spread, 1.1, 6)),
      (i) => prog(t, times[i] + fly - 0.05, times[i] + fly + 0.15),
      { n, sway: 0.015 * Math.sin(t * 2) * spread, rivet: prog(t, times[0] + fly - 0.1, times[0] + fly + 0.2) });
    // petals in flight: from the flower towards their chip slot
    for (let i = 0; i < n; i++) {
      const k = prog(t, times[i] - 0.05, times[i] + fly);
      if (k <= 0 || k >= 1) continue;
      const a0 = (i / n) * TAU - 1.2;
      const sx = hx + Math.cos(a0) * R * 0.75, sy = hy + Math.sin(a0) * R * 0.75;
      const ang = FAN_ANGLE(i, n) * 0.32;
      const ex = FAN.x + Math.sin(ang) * FAN.len * 0.62, ey = FAN.y - Math.cos(ang) * FAN.len * 0.62;
      const u = E.ioC(k);
      const px = lerp(sx, ex, u), py = lerp(sy, ey, u) - Math.sin(u * Math.PI) * 140;
      drawPetal(ctx, px, py, lerp(R * 0.5, 120, u), lerp(a0, ang - Math.PI / 2, u) + Math.sin(u * 6) * 0.3, FAN_COLORS[i], { flip: Math.cos(u * 7) });
    }
  }
}
