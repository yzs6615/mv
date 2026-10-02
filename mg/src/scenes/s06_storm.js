// 2:12.6–2:51.4  主歌二 — in the same garden: a triptych (smile / helpless / gloom), the storm and the
// stem that will not bend, clouds part, night and a glowing dream seed whose beam lights the horizon,
// a smiling sunrise, a heart that overflows into a sea of flowers, walking with a firefly of hope,
// the sunflower hill.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2, mix } from '../core/math.js';
import { track } from '../core/camera.js';
import { shape, stroke, P, INK, deviceScale, polyPart } from '../core/draw.js';
import { applyCam } from '../core/camera.js';
import { drawPipBloom, blinkAt } from '../art/pip.js';
import { drawRain, drawCloud, drawSun, sparkle, ripple, drawGround, drawPetal, skyGradient, splash } from '../art/kit.js';
import { flowerSpec, pipSpec, drawPlant, drawHead, drawHeadCached, darker, mixHex } from '../art/flower.js';
import { drawFace } from '../art/flower.js';
import { drawLine } from '../core/text.js';
import { Bloom, T_B_END, GY2, PIPX } from './s05_bloom.js';

const T0 = T_B_END;                   // 132.568
export const T_S_END = 171.356;       // pre-chorus 2
const PANELS = [[40, 40, 600, 1000], [660, 40, 600, 1000], [1280, 40, 600, 1000]];
const HILL = { x0: 3950, x1: 6400, peak: 5000, h: 330 };
const hillY = (x) => (x < HILL.x0 ? GY2 : GY2 - HILL.h * Math.pow(Math.sin(Math.PI * clamp((x - HILL.x0) / ((HILL.peak - HILL.x0) * 2))), 1.4));

export class Storm extends Scene {
  constructor(film) {
    super(film, T0, T_S_END + 0.001);
    this.pipF = pipSpec();
    this.cam = track([
      { t: 137.42, x: PIPX - 60, y: 545, z: 1.15 },
      { t: 141.9, x: PIPX - 40, y: 540, z: 1.2, e: E.sine },
      { t: 146.9, x: PIPX + 40, y: 520, z: 1.05, e: E.ioC },
      { t: 148.6, x: PIPX + 260, y: 470, z: 0.82, e: E.ioC },
      { t: 151.9, x: PIPX + 300, y: 470, z: 0.8, e: E.sine },
      { t: 156.6, x: PIPX + 420, y: 430, z: 0.78, e: E.sine },
      { t: 158.9, x: PIPX + 10, y: 330, z: 1.28, e: E.ioC },
      { t: 160.5, x: PIPX + 700, y: 120, z: 0.3, e: E.ioQt },
      { t: 161.5, x: PIPX + 760, y: 130, z: 0.31, e: E.sine },
      { t: 162.95, x: PIPX + 260, y: 560, z: 0.88, e: E.ioC },
      { t: 166.2, x: 3500, y: 560, z: 0.86, e: E.lin },
      { t: 167.6, x: 4300, y: 470, z: 0.74, e: E.ioC },
      { t: T_S_END, x: 4420, y: 470, z: 0.76, e: E.sine },
    ]);
    // the flower sea: receding rows of heads behind the field
    this.sea = [];
    for (let k = 1; k <= 15; k++) {
      const y = GY2 - 55 - Math.pow(k / 15, 1.35) * 560, sp = 118 - k * 5.4, R = 34 - k * 1.75;
      for (let x = -430 + (k % 2) * sp * 0.5; x < 5980; x += sp) {
        const i = this.sea.length;
        this.sea.push({ x: x + hash2(i, 2) * sp * 0.4, y, R: R * (0.8 + 0.4 * hash2(i, 3)), F: flowerSpec(40000 + i), d: Math.abs(x - PIPX) / 6000 + k * 0.02 });
      }
    }
    this.bed = [];
    for (let r = 0; r < 4; r++) for (let x = -430 + r * 37; x < 5980; x += 74 + r * 6) {
      const i = this.bed.length;
      this.bed.push({ x: x + hash2(i, 1) * 30, y: GY2 + 95 + r * 70, R: 30 + r * 7 + hash2(i, 2) * 8, F: flowerSpec(50000 + i), d: Math.abs(x - PIPX) / 6000 });
    }
    this.hillF = [0, 1, 2].map((i) => flowerSpec(9900 + i));
    this.dreamF = flowerSpec(31, { type: 'star', scheme: ['#FFE08A', '#FFF6D0', '#FFB627', '#FFFFFF'] });
    this.heartF = Array.from({ length: 36 }, (_, i) => flowerSpec(9500 + i));
    this.sunflowers = [];
    for (let i = 0; i < 9; i++) {
      const x = 4150 + i * 230 + hash2(i, 1) * 60;
      this.sunflowers.push({ x, F: flowerSpec(9800 + i, { type: 'sunflower', scheme: ['#FFB627', '#FFD84D', '#8A5A3C', '#5E3B27'] }), h: 260 + hash2(i, 2) * 120, turn: 166.51 + Math.floor(i / 3) * this.m.beat + (i % 3) * this.m.beat * 0.5 });
    }
  }
  bloom() { return this.film.scenes.find((s) => s instanceof Bloom); }

  static lyrics() {
    return {
      19: { inScene: true },
      20: { x: 960, y: 120, size: 74, accent: (i, u) => (i >= 6 ? C.marigold : null) },
      21: { x: 960, y: 120, size: 74, accent: (i, u) => (u.c === '开' ? C.coral : null) },
      22: { x: 960, y: 118, size: 74, color: '#FFF8EE', halo: 'rgba(42,46,69,0.7)', risoColor: C.marigold, accent: (i, u) => (u.c === '梦' || u.c === '想' ? '#FFE08A' : null) },
      23: { x: 960, y: 118, size: 74, accent: (i, u) => (u.c === '笑' ? C.coral : null) },
      24: { x: 960, y: 118, size: 74, accent: (i, u) => (u.c === '心' ? C.coral : i >= 8 ? C.rose : null) },
      25: { x: 960, y: 118, size: 74, accent: (i, u) => (u.c === '希' || u.c === '望' ? C.marigold : null) },
      26: { x: 960, y: 118, size: 74, accent: (i, u) => (u.c === '阳' ? C.marigold : u.c === '精' || u.c === '彩' ? C.coral : null) },
    };
  }

  // ---------- state over time ----------
  rain(t) { return Math.max(win(t, 133.6, 134.2, 136.4, 137.0) * 0.4, win(t, 136.6, 137.6, 143.6, 145.6)); }
  storm(t) { return win(t, 135.0, 137.2, 142.2, 145.4); }
  night(t) { return win(t, 146.9, 148.6, 151.4, 153.2); }
  dawn(t) { return prog(t, 151.6, 154.0, E.ioC); }
  pipX(t) { return lerp(PIPX, 3780, E.ioQ(prog(t, 161.66, 166.3))); }
  pipY(t) { return hillY(this.pipX(t)); }
  sunPos(t) {
    const u = prog(t, 151.9, 157.5, E.outC);
    const rise = [PIPX + 900 - 300 * u, lerp(GY2 + 120, GY2 - 820, u)];
    const c = this.cam(t);
    const far = [c.x + 600 / c.z, c.y - 300 / c.z];
    const k = E.ioC(prog(t, 157.0, 158.8));
    return [lerp(rise[0], far[0], k), lerp(rise[1], far[1], k)];
  }

  draw(ctx, t) {
    if (t < 137.42) this.drawTriptych(ctx, t);
    else this.drawGarden(ctx, t, this.cam(t), [0, 0, 1920, 1080], 'live');
    this.screen(ctx);
  }

  // weather presets for the panels; 'live' follows the timeline
  wx(t, kind) {
    if (kind === 'sun') return { storm: 0, rain: 0, night: 0, dawn: 0, sunny: 1, mood: 'happy', droop: 0 };
    if (kind === 'drizzle') return { storm: 0.35, rain: 0.45, night: 0, dawn: 0, sunny: 0, mood: 'worried', droop: 0.25 };
    if (kind === 'gloom') return { storm: Math.max(0.85, this.storm(t)), rain: this.rain(t), night: 0, dawn: 0, sunny: 0, mood: 'worried', droop: 0.45 };
    return { storm: this.storm(t), rain: this.rain(t), night: this.night(t), dawn: this.dawn(t), sunny: 0, mood: null, droop: 0 };
  }

  drawTriptych(ctx, t) {
    // underneath: the end of the interlude frame
    this.bloom().draw(ctx, Math.min(t, T0 - 0.001));
    this.screen(ctx);
    const L = this.line(19);
    const at = L ? [this.ut(19, 0), this.ut(19, 4), this.ut(19, 7)] : [132.44, 133.79, 135.04];
    const kinds = ['sun', 'drizzle', 'gloom'];
    const grow = prog(t, 136.5, 137.42, E.ioC);
    // paper gutters appear with the first panel
    const gut = prog(t, T0, T0 + 0.35, E.ioC);
    if (gut > 0) { ctx.fillStyle = C.paper; ctx.globalAlpha = gut; ctx.fillRect(0, 0, 1920, 1080); ctx.globalAlpha = 1; }
    PANELS.forEach((r, i) => {
      const k = E.outBack(prog(t, Math.max(at[i] - 0.12, T0 + 0.05), Math.max(at[i] + 0.42, T0 + 0.6)), 1.2);
      if (k <= 0) return;
      let [x, y, w, h] = r;
      y = lerp(i === 1 ? 1200 : -1100, y, k);
      if (i === 2) { x = lerp(x, 0, grow); y = lerp(y, 0, grow); w = lerp(w, 1920, grow); h = lerp(h, 1080, grow); }
      else { x += (i === 0 ? -1 : 1) * 0 + (i === 0 ? -700 : 0) * E.inQ(grow); y += (i === 1 ? 1200 : 0) * E.inQ(grow); }
      const cam = i === 2 ? this.blendCam(grow) : { x: PIPX - 10, y: 545, z: 1.0 };
      this.drawGarden(ctx, t, cam, [x, y, w, h], kinds[i]);
      this.screen(ctx);
      stroke(ctx, P.rect(x, y, w, h), INK, 3 * (1 - grow * (i === 2 ? 1 : 0)));
    });
    // the line itself, one phrase per panel
    if (L) {
      const parts = [[0, 4], [4, 7], [7, 11]];
      parts.forEach(([a, b], i) => {
        const sub = { ...L, chars: L.chars.slice(a, b) };
        const r = PANELS[i];
        drawLine(ctx, sub, t, { x: r[0] + r[2] / 2, y: 130, size: 72, exitT: 136.55, exitDur: 0.35, seed: 19 + i, accent: (j, u) => (i === 0 && u.c === '笑' ? C.coral : i === 2 ? '#3D4466' : null) });
      });
    }
  }
  blendCam(g) { const c = this.cam(137.42); return { x: lerp(PIPX - 10, c.x, g), y: lerp(545, c.y, g), z: lerp(1.0, c.z, g) }; }

  // draw the garden world clipped to a screen rect, with the camera centred on the rect
  drawGarden(ctx, t, cam, rect, kind) {
    const k = deviceScale();
    const [rx, ry, rw, rh] = rect;
    const w = this.wx(t, kind);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    // sky
    const day = ['#FCD9C6', '#F7EDE0'], storm = ['#5C6380', '#9AA0B8'], night = ['#1F2340', '#3E4470'], sunny = ['#FFE7A8', '#FFF6E0'];
    const top = mixHex(mixHex(mixHex(day[0], storm[0], w.storm), night[0], w.night), sunny[0], w.sunny);
    const bot = mixHex(mixHex(mixHex(day[1], storm[1], w.storm), night[1], w.night), sunny[1], w.sunny);
    const g = ctx.createLinearGradient(0, ry, 0, ry + rh);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
    // world transform: camera centred on the rect centre
    ctx.translate(rx + rw / 2, ry + rh / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    const shake = kind !== 'sun' && kind !== 'drizzle' ? win(t, 137.6, 138.2, 140.6, 141.2) * 3 : 0;
    if (shake) ctx.translate(Math.sin(t * 37) * shake, Math.cos(t * 29) * shake);
    this.drawSkyThings(ctx, t, w, cam, kind);
    this.drawSea(ctx, t, w);
    drawGround(ctx, cam.x - 2600 / cam.z, cam.x + 2600 / cam.z, GY2, { seed: 4, depth: 260, color: mixHex('#9B6A47', '#3A3550', w.night * 0.7) });
    this.drawHill(ctx, t, w);
    this.drawField(ctx, t, w, kind);
    this.drawHero(ctx, t, w, kind);
    this.drawBed(ctx, t, w);
    if (w.rain > 0) {
      const v = this.viewRect(cam, rect);
      drawRain(ctx, t, v[0], v[1], v[2], v[3], { density: 2.2 * w.rain, angle: 0.28, len: 64 / cam.z, lw: 3, color: 'rgba(225,235,255,0.75)', alpha: Math.min(1, w.rain * 1.3), speed: 1900 / cam.z });
    }
    ctx.restore();
    // lightning flash
    const fl = kind === 'live' || kind === 'gloom' ? Math.max(win(t, 138.62, 138.66, 138.7, 138.95), win(t, 139.1, 139.13, 139.16, 139.35) * 0.6) : 0;
    if (fl > 0) { ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0); ctx.globalAlpha = fl * 0.55; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(rx, ry, rw, rh); ctx.restore(); }
  }
  viewRect(cam, rect) {
    const w = rect[2] / cam.z, h = rect[3] / cam.z;
    return [cam.x - w / 2 - 200, cam.y - h / 2 - 200, w + 400, h + 400];
  }

  drawSkyThings(ctx, t, w, cam, kind) {
    // stars at night
    if (w.night > 0) {
      ctx.save();
      ctx.fillStyle = '#FFF3C4';
      for (let i = 0; i < 90; i++) {
        const x = cam.x - 2400 + hash2(i, 1) * 4800, y = GY2 - 1500 + hash2(i, 2) * 1200;
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + i);
        ctx.globalAlpha = w.night * tw * prog(t, 147 + hash2(i, 3) * 2, 148 + hash2(i, 3) * 2);
        ctx.beginPath();
        ctx.arc(x, y, 3 + hash2(i, 4) * 3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // the sun of the new day, with a face
    if (kind === 'live' && t > 151.6) {
      const [sx, sy] = this.sunPos(t);
      const laugh = t > this.ut(23, 7) - 0.1;
      drawSun(ctx, sx, sy, 150, t, { glow: true });
      ctx.save();
      ctx.translate(sx, sy + 12);
      drawFace(ctx, 120, { mood: laugh ? 'laugh' : t > this.ut(23, 5) - 0.1 ? 'happy' : 'smile', blink: blinkAt(t, 7) }, 1);
      ctx.restore();
    }
    if (kind === 'sun') drawSun(ctx, PIPX + 330, 230, 110, t, { glow: true });
    // storm clouds
    if (w.storm > 0.02) {
      const part = kind === 'live' ? E.ioC(prog(t, 142.4, 145.6)) : 0;
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1;
        const x = PIPX + (i - 2.5) * 430 + side * part * 900, y = 170 + (i % 3) * 70;
        drawCloud(ctx, x, y, 720 + (i % 3) * 140, 200, { fill: i % 2 ? '#7E849E' : '#8D93AC', line: '#4A5070', seed: i + 11, shadow: true, alpha: w.storm, shadeColor: 'rgba(50,55,80,0.4)' });
      }
      // sunbeam through the gap
      const beam = kind === 'live' ? win(t, 143.2, 144.4, 147.0, 148.0) : 0;
      if (beam > 0) {
        const g = ctx.createLinearGradient(0, 100, 0, GY2);
        g.addColorStop(0, `rgba(255,236,170,${0.7 * beam})`);
        g.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(PIPX - 130, 60); ctx.lineTo(PIPX + 130, 60); ctx.lineTo(PIPX + 330, GY2); ctx.lineTo(PIPX - 330, GY2); ctx.closePath();
        ctx.fill();
      }
    }
    // the dream: a light beam that rises and spreads along the horizon
    if (kind === 'live') {
      const up = prog(t, this.ut(22, 6) - 0.2, this.ut(22, 9) + 0.2, E.ioC);
      const fade = 1 - prog(t, 152.6, 154.4);
      if (up > 0 && fade > 0) {
        const bx = PIPX + 300;
        const top = lerp(GY2, GY2 - 1500, up);
        const g = ctx.createLinearGradient(0, GY2, 0, top);
        g.addColorStop(0, `rgba(255,228,140,${0.85 * fade})`);
        g.addColorStop(1, `rgba(255,228,140,0)`);
        ctx.fillStyle = g;
        ctx.fillRect(bx - 46, top, 92, GY2 - top);
        const hz = prog(t, this.ut(22, 8) - 0.1, this.ut(22, 9) + 0.6, E.outC) * fade;
        const g2 = ctx.createLinearGradient(0, GY2 - 160, 0, GY2);
        g2.addColorStop(0, 'rgba(255,214,140,0)');
        g2.addColorStop(1, `rgba(255,214,140,${0.75 * hz})`);
        ctx.fillStyle = g2;
        ctx.fillRect(bx - 2600 * hz, GY2 - 160, 5200 * hz, 160);
      }
    }
  }

  drawSea(ctx, t, w) {
    const sea = prog(t, 159.15, 160.6);
    if (sea <= 0) return;
    // the meadow rising to a horizon, so the rows of heads read as a field going into the distance
    const hz = GY2 - 640;
    const c = this.cam(t);
    const g = ctx.createLinearGradient(0, hz, 0, GY2);
    g.addColorStop(0, mixHex('#CFE6C2', '#FBE8D8', 0.35));
    g.addColorStop(1, '#8CC08A');
    ctx.save();
    ctx.globalAlpha = E.ioC(prog(t, 159.15, 159.9));
    ctx.fillStyle = g;
    const lx = c.x - 3200 / c.z, rx = c.x + 3200 / c.z;
    ctx.beginPath();
    ctx.moveTo(lx, GY2 + 10);
    for (let x = lx; x <= rx; x += 120) ctx.lineTo(x, hz + Math.sin(x * 0.0017) * 30);
    ctx.lineTo(rx, GY2 + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const tint = w.night > 0 ? ['#2A2E45', 0.5 * w.night] : null;
    const vx0 = c.x - 1050 / c.z, vx1 = c.x + 1050 / c.z;
    for (const s of this.sea) {
      if (s.x < vx0 || s.x > vx1) continue;
      const b = prog(t, 159.2 + s.d * 1.6, 159.6 + s.d * 1.6);
      if (b <= 0) continue;
      (b >= 1 ? drawHeadCached : drawHead)(ctx, s.F, s.x, s.y, s.R * E.outBack(b, 1.6), { tilt: 0.55, tint: tint ? ['#2A2E45', Math.round(tint[1] * 10) / 10] : null });
    }
  }

  // foreground flower bed on the soil, part of the sea
  drawBed(ctx, t, w) {
    const k = prog(t, 159.2, 160.2);
    if (k <= 0) return;
    const c = this.cam(t);
    const lx = c.x - 1100 / c.z, rx = c.x + 1100 / c.z;
    for (const b of this.bed) {
      if (b.x < lx || b.x > rx) continue;
      const bb = prog(t, 159.25 + b.d * 1.4, 159.65 + b.d * 1.4);
      if (bb <= 0) continue;
      (bb >= 1 ? drawHeadCached : drawHead)(ctx, b.F, b.x, b.y, b.R * E.outBack(bb, 1.6), { tilt: 0.7, shadow: true });
    }
  }

  drawHill(ctx, t, w) {
    if (t < 161) return;
    const pts = [];
    for (let x = HILL.x0 - 50; x <= HILL.x1; x += 40) pts.push([x, hillY(x)]);
    shape(ctx, (c) => { c.beginPath(); c.moveTo(HILL.x0 - 50, GY2 + 400); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(HILL.x1, GY2 + 400); c.closePath(); }, { fill: '#8FC48A', line: darker('#8FC48A', 0.5), lw: 2.6 });
    shape(ctx, (c) => { c.beginPath(); c.moveTo(HILL.x0 + 200, GY2 + 400); pts.forEach((p) => c.lineTo(p[0] + 60, p[1] + 60)); c.lineTo(HILL.x1, GY2 + 400); c.closePath(); }, { fill: '#7CB57A', riso: 0 });
    // sunflowers turn to the sun on the beat
    const sun = this.sunPos(t);
    for (const s of this.sunflowers) {
      const gy = hillY(s.x);
      const turn = spring(prog(t, s.turn, s.turn + 0.6), 1.2, 6);
      const lean = lerp(-0.25, Math.atan2(sun[0] - s.x, gy - sun[1]) * 0.35, turn);
      drawPlant(ctx, s.F, s.x, gy + 6, s.h, 70, { sway: lean + Math.sin(t * 1.4 + s.x) * 0.03, tilt: lerp(0.45, 1, turn), shadow: true, face: turn > 0.6 ? { mood: 'happy', blink: blinkAt(t, s.x | 0) } : null });
    }
    // seeds thrown on 种下, popping into sparkles and little flowers on 精彩
    const throwT = [this.ut(26, 6), this.ut(26, 7), this.ut(26, 7) + 0.15];
    const land = [this.ut(26, 8), this.ut(26, 9), this.ut(26, 9) + 0.2];
    throwT.forEach((t0, i) => {
      const from = [this.pipX(t) + 20, this.pipY(t) - 320];
      const to = [4250 + i * 340, hillY(4250 + i * 340)];
      const u = prog(t, t0, land[i]);
      if (u > 0 && u < 1) shape(ctx, P.drop(lerp(from[0], to[0], u), lerp(from[1], to[1], u) - Math.sin(u * Math.PI) * 260, 22, 30), { fill: C.marigold, line: darker(C.marigold, 0.5), lw: 1.6 });
      if (u >= 1) {
        const k = prog(t, land[i], land[i] + 0.5);
        drawPlant(ctx, this.hillF[i], to[0], to[1] + 4, 110 * E.outBack(k, 1.8), 34, { open: k, leafGrow: k, shadow: true });
        for (let j = 0; j < 4; j++) sparkle(ctx, to[0] + Math.cos(j * 1.6 + i) * 90 * (0.5 + k), to[1] - 140 + Math.sin(j * 2.1) * 60, 22 * Math.sin(Math.PI * prog(t, land[i] + j * 0.06, land[i] + 0.7 + j * 0.06)), { rot: t * 2 });
      }
    });
  }

  drawField(ctx, t, w, kind) {
    const wind = (kind === 'sun' ? 0 : w.storm) * (0.35 + 0.1 * Math.sin(t * 3.1));
    const tint = w.night > 0 ? ['#2A2E45', 0.55 * w.night] : w.storm > 0 ? ['#8D93AC', 0.35 * w.storm] : null;
    const bounce = t > 154.3 && t < 156.6 && kind === 'live' ? this.m.pulse(t, 7) : 0;
    for (const p of this.bloom().plants) {
      if (p.x > HILL.x0 - 80 && t > 161) continue;
      const depth = p.row ? 0.82 : 1;
      ctx.save();
      ctx.translate(p.x, GY2 - (p.row ? 26 : 0));
      ctx.scale(depth, depth * (1 + 0.07 * bounce));
      const sway = Math.sin(t * 1.3 + p.F.phase) * 0.05 + wind * (0.8 + 0.5 * hash2(p.x | 0, 3)) * Math.sin(t * 2.2 + p.x * 0.002 + 1.2);
      const closed = kind === 'live' ? 1 - 0.45 * win(t, 137.6, 139, 143.5, 145.8) : 1 - 0.3 * w.storm;
      drawPlant(ctx, p.F, 0, 0, p.H, p.R, { open: closed, sway, shadow: !p.row, tint: p.row ? (tint ?? ['#F4EDE1', 0.12]) : tint, face: bounce > 0 && !p.row && hash2(p.x | 0, 5) > 0.55 ? { mood: 'laugh' } : null });
      ctx.restore();
    }
  }

  drawHero(ctx, t, w, kind) {
    const live = kind === 'live';
    const hold = live ? win(t, this.ut(20, 6) - 0.15, this.ut(20, 6) + 0.2, 146, 147) : 0;   // 不可以摇摆
    const wind = live ? w.storm * (1 - hold) : kind === 'sun' ? 0 : 0.6;
    const sway = Math.sin(t * 1.5) * 0.04 + wind * (0.42 + 0.18 * Math.sin(t * 3.3)) - (w.droop ?? 0) * 0.15;
    const x = live ? this.pipX(t) : PIPX, y = live ? this.pipY(t) : GY2;
    const walking = live && t > 161.66 && t < 166.3;
    const open = live ? 1 - 0.55 * win(t, 137.6, 139, this.ut(21, 10) - 0.5, this.ut(21, 10) + 0.1) : kind === 'gloom' ? 0.6 : kind === 'drizzle' ? 0.8 : 1;
    let mood = w.mood;
    if (live) {
      mood = t < 140 ? 'worried' : t < 142.3 ? 'calm' : t < this.ut(21, 10) ? 'smile' : t < 147 ? 'happy' : t < 151.6 ? 'wow' : t < 156.5 ? (t > this.ut(23, 7) - 0.1 ? 'laugh' : 'happy') : walking ? 'happy' : t > this.ut(26, 6) ? 'laugh' : 'happy';
    }
    const look = live ? (t > 147 && t < 151.6 ? [0.4, -0.6] : t > 151.6 && t < 157 ? [0.7, -0.6] : walking ? [0.8, 0] : t > 166.4 ? [0.8, -0.3] : [0, -0.2]) : kind === 'gloom' ? [0, 0.6] : [0, 0];
    const step = walking ? (t - 161.66) * 1.65 : 0;
    // confidence ring around the stem
    if (hold > 0) {
      for (let r = 0; r < 2; r++) stroke(ctx, P.ellipse(x, y - 360, 120 + r * 60 + Math.sin(t * 6) * 6, 300 + r * 40), C.marigold, 5 - r * 2, { alpha: hold * (0.8 - r * 0.3) });
    }
    const R = 172;
    const tip = drawPipBloom(ctx, x, y, 150, {
      mood, look, blink: blinkAt(t, 1), stemH: 430, R, open, F: this.pipF, sway, step, walk: walking ? 1 : 0, rot: walking ? Math.sin(step * TAU) * 0.05 : 0,
      squash: walking ? 1 + 0.04 * Math.sin(step * TAU * 2) : 1, glow: live ? win(t, this.ut(21, 10) - 0.1, this.ut(21, 10) + 0.2, 147, 148.5) * 0.8 : 0,
    });
    if (live && t > this.ut(21, 10) - 0.1 && t < 148) for (let i = 0; i < 6; i++) sparkle(ctx, tip[0] + Math.cos(i * 1.05 + 0.3) * R * 1.25, tip[1] + Math.sin(i * 1.05 + 0.3) * R * 1.1, 26 * Math.sin(Math.PI * prog(t, this.ut(21, 10) + i * 0.05, this.ut(21, 10) + 0.9 + i * 0.05)), { rot: t * 2 + i });
    if (live) this.drawDreamSeed(ctx, t, tip, x, y);
    if (live) this.drawHeart(ctx, t, tip);
    if (live) this.drawFirefly(ctx, t, x, y);
  }

  drawDreamSeed(ctx, t, tip, x, y) {
    const t0 = this.ut(22, 0) - 0.2, t1 = this.ut(22, 1) + 0.15;
    const bx = PIPX + 300;
    const u = prog(t, t0, t1, E.inQ);
    if (u > 0 && u < 1) {
      const px = lerp(tip[0], bx, u), py = lerp(tip[1], GY2 - 10, u) - Math.sin(u * Math.PI) * 120;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 60);
      g.addColorStop(0, 'rgba(255,236,160,0.9)');
      g.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - 60, py - 60, 120, 120);
      shape(ctx, P.drop(px, py, 26, 36), { fill: '#FFE08A', line: darker(C.marigold, 0.4), lw: 2 });
    }
    if (u >= 1 && t < 154) {
      ripple(ctx, bx, GY2, t, t1, { r1: 140, color: C.marigold, lw: 5, dur: 0.8, squash: 0.3 });
      const sp = prog(t, this.ut(22, 4) - 0.1, this.ut(22, 5) + 0.3);
      const fade = 1 - prog(t, 152.8, 154);
      if (sp > 0) {
        const g = ctx.createRadialGradient(bx, GY2 - 60, 0, bx, GY2 - 60, 240);
        g.addColorStop(0, `rgba(255,236,160,${0.8 * fade})`);
        g.addColorStop(1, 'rgba(255,236,160,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bx - 240, GY2 - 300, 480, 480);
        drawPlant(ctx, this.dreamF, bx, GY2, 150 * E.outBack(sp, 1.5), 44, { open: prog(t, this.ut(22, 5), this.ut(22, 6) + 0.2), alpha: fade, leafGrow: sp });
      }
    }
  }

  drawHeart(ctx, t, tip) {
    const t0 = this.ut(24, 1) - 0.25, t1 = this.ut(24, 3) + 0.2;
    const fill = prog(t, this.ut(24, 4) - 0.1, this.ut(24, 5) + 0.4);
    const burst = prog(t, this.ut(24, 6) - 0.05, this.ut(24, 7) + 0.5, E.outC);
    const draw = prog(t, t0, t1, E.ioC);
    if (draw <= 0 || burst >= 1) return;
    const cx = tip[0], cy = tip[1] + 10, s = 300;
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      pts.push([cx + (hx * s) / 16, cy + (hy * s) / 16 - s * 0.1]);
    }
    const a = 1 - burst;
    // mini flowers filling the heart, then thrown outwards on 变
    if (fill > 0) {
      for (let i = 0; i < 36; i++) {
        const ang = hash2(i, 1) * TAU, rr = Math.sqrt(hash2(i, 2)) * s * 0.75;
        let px = cx + Math.cos(ang) * rr, py = cy - s * 0.15 + Math.sin(ang) * rr * 0.85;
        px += Math.cos(ang) * burst * 1400; py += Math.sin(ang) * burst * 900;
        const k = prog(fill, hash2(i, 3) * 0.6, hash2(i, 3) * 0.6 + 0.4);
        drawHead(ctx, this.heartF[i], px, py, 30 * E.outBack(k, 1.8) * (1 + burst), { alpha: a });
      }
    }
    stroke(ctx, polyPart(pts, draw), C.coral, 9, { alpha: a });
    stroke(ctx, polyPart(pts, draw), '#FFFFFF', 3, { alpha: a * 0.6 });
  }

  drawFirefly(ctx, t, x, y) {
    const a = win(t, 161.4, 162.0, 166.6, 167.4);
    if (a <= 0) return;
    const fx = x + 170 + Math.sin(t * 2.3) * 60, fy = y - 360 + Math.sin(t * 3.1) * 40;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 90);
    g.addColorStop(0, `rgba(255,240,150,${0.9 * a})`);
    g.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - 90, fy - 90, 180, 180);
    shape(ctx, P.circle(fx, fy, 11), { fill: '#FFF3A8', line: darker(C.marigold, 0.4), lw: 1.6, alpha: a });
    for (const s of [-1, 1]) shape(ctx, P.ellipse(fx - 6, fy - 10 * s * Math.abs(Math.sin(t * 30)), 12, 6, 0.4 * s), { fill: 'rgba(255,255,255,0.8)', line: INK, lw: 1, alpha: a });
    // trail of light dots
    for (let i = 1; i < 8; i++) {
      const tt = t - i * 0.08;
      shape(ctx, P.circle(this.pipX(tt) + 170 + Math.sin(tt * 2.3) * 60, y - 360 + Math.sin(tt * 3.1) * 40, 5 - i * 0.5), { fill: '#FFF3A8', riso: 0, alpha: a * (1 - i / 8) });
    }
  }
}
