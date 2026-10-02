// 3:10.7–3:32.6  副歌二 · 每个人都开花 — the tray room shrinks into one tile of a catalogue page;
// green paths shoot out from it on the beat, each ending in a tile where a flower blooms. The page
// grows to hundreds of tiles; seeds sprout in waves; together the tiles bloom into one giant flower
// made of unique flowers; coloured rain, a rainbow.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, TAU, hash2, rng } from '../core/math.js';
import { shape, stroke, P, INK, polyPart } from '../core/draw.js';
import { drawLine } from '../core/text.js';
import { drawPip, drawSprout, blinkAt } from '../art/pip.js';
import { sparkle, drawPetal } from '../art/kit.js';
import { flowerSpec, pipSpec, drawHead, drawHeadCached, darker, mixHex } from '../art/flower.js';
import { Echo, T_E_END } from './s07_echo.js';

const T0 = T_E_END;                  // 190.75
export const T_X_END = 212.568;
const CELL = 46, COLS = 41, ROWS = 23;
const CX = Math.floor(COLS / 2), CY = Math.floor(ROWS / 2);
const PALETTES = {
  petal: [['#FF6B5B', '#FFB39F', '#FFB627', '#C2407E'], ['#FF8A3D', '#FFC46B', '#5E3B27', '#FFD84D'], ['#E0567A', '#F48FB1', '#FFD84D', '#FFF8EE'], ['#FF9F80', '#FFE0D1', '#E0567A', '#FFD84D']],
  heart: [['#FFB627', '#FFD84D', '#8A5A3C', '#5E3B27'], ['#FFD84D', '#FFF3C4', '#FF8A3D', '#E0567A']],
  ground: [['#FFF8EE', '#FBE8C8', '#FFB627', '#E8B04A'], ['#FFFDF6', '#F3EAD8', '#E8B04A', '#B07A52'], ['#FBF3E6', '#FFFFFF', '#FFD84D', '#E8B04A']],
  stem: [['#3BB3A6', '#A8E0D6', '#FFF8EE', '#2E7D5B'], ['#7CC49A', '#B9E0A5', '#FFF3C4', '#2E7D5B']],
};

// which part of the giant flower a cell belongs to: five round petals, a heart, a stem with a leaf
function role(i, j) {
  const fx = CX, fy = CY - 1.6;
  const x = (i - fx) / 6.4, y = (j - fy) / 6.4;
  const r = Math.hypot(x, y);
  if (r < 0.3) return 'heart';
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
    if (Math.hypot(x - Math.cos(a) * 0.64, y - Math.sin(a) * 0.64) < 0.34) return 'petal';
  }
  if (i === CX && j > fy + 4) return 'stem';
  const lx = (i - CX - 2.6) / 2.6, ly = (j - (CY + 7.6)) / 1.2;
  if (lx * lx + ly * ly < 1) return 'stem';
  const rx = (i - CX + 2.4) / 2.2, ry = (j - (CY + 9.8)) / 1.05;
  if (rx * rx + ry * ry < 1) return 'stem';
  return 'ground';
}

export class Mosaic extends Scene {
  constructor(film) {
    super(film, T0, T_X_END + 0.001);
    this.pipF = pipSpec();
    this.cells = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const ro = role(i, j);
      const pal = PALETTES[ro];
      const k = this.cells.length;
      const r = Math.hypot(i - CX, j - CY);
      this.cells.push({ i, j, x: (i - CX) * CELL, y: (j - CY) * CELL, ro, F: flowerSpec(12000 + k, { scheme: pal[k % pal.length] }), r, a: Math.atan2(j - CY, i - CX) });
    }
    // sixteen journeys out of the centre tile, one per eighth note of the first line
    const e8 = this.m.beat / 2;
    const rr = rng(4242);
    this.paths = [];
    for (let n = 0; n < 16; n++) {
      const ang = (n / 16) * TAU + rr.range(-0.12, 0.12);
      const dist = rr.range(3.2, 6.5);
      const i = Math.round(CX + Math.cos(ang) * dist * 1.25), j = Math.round(CY + Math.sin(ang) * dist * 0.85);
      this.paths.push({ i, j, t: T0 + n * e8 * 0.5 + 0.05, bend: rr.range(-0.6, 0.6) });
    }
  }
  echo() { return this.film.scenes.find((s) => s instanceof Echo); }
  static lyrics() {
    return {
      31: { x: 960, y: 118, size: 86, style: 'pop', accent: (i, u) => (u.c === '清' || u.c === '脆' ? C.coral : null) },
      32: { x: 960, y: 118, size: 78, accent: (i, u) => (u.c === '花' ? C.coral : i >= 6 ? '#B5403A' : null) },
      33: { x: 960, y: 118, size: 72, accent: (i, u) => (i >= 8 && i <= 9 ? C.leafDark : i >= 11 ? C.leaf : null) },
      34: { x: 960, y: 118, size: 72, accent: (i, u) => (i >= 10 ? C.coral : null) },
      35: { x: 960, y: 118, size: 74, accent: (i, u) => (u.c === '色' ? C.coral : u.c === '彩' ? C.marigold : u.c === '汗' || u.c === '水' ? C.sky : null), exitT: 212.1 },
    };
  }
  zoom(t) {
    // the centre tile starts full-frame and the page grows around it
    const a = 1080 / CELL;
    const z1 = Math.exp(lerp(Math.log(a), Math.log(3.2), E.ioQt(prog(t, T0, 193.1))));
    const z2 = Math.exp(lerp(Math.log(3.2), Math.log(1.55), E.sine(prog(t, 193.1, 198.0))));
    const z3 = Math.exp(lerp(Math.log(1.55), Math.log(0.98), E.ioC(prog(t, 198.0, 203.4))));
    return t < 193.1 ? z1 : t < 198.0 ? z2 : t < 203.4 ? z3 : 0.98 + 0.03 * prog(t, 203.4, T_X_END);
  }

  draw(ctx, t) {
    const z = this.zoom(t);
    const cam = { x: 0, y: 0, z, r: 0 };
    this.fill(ctx, '#F7F0E4');
    this.apply(ctx, cam);
    // graph-paper grid
    const span = Math.min(COLS, Math.ceil(1920 / z / CELL) + 2);
    const gx = Math.ceil(span / 2), gy = Math.ceil(Math.min(ROWS, 1080 / z / CELL + 2) / 2);
    ctx.save();
    ctx.strokeStyle = 'rgba(42,46,69,0.10)';
    ctx.lineWidth = 1.2 / z;
    ctx.beginPath();
    for (let i = -gx; i <= gx + 1; i++) { ctx.moveTo((i - 0.5) * CELL, -gy * CELL - CELL); ctx.lineTo((i - 0.5) * CELL, gy * CELL + CELL); }
    for (let j = -gy; j <= gy + 1; j++) { ctx.moveTo(-gx * CELL - CELL, (j - 0.5) * CELL); ctx.lineTo(gx * CELL + CELL, (j - 0.5) * CELL); }
    ctx.stroke();
    ctx.restore();
    this.drawCells(ctx, t, z);
    this.drawPaths(ctx, t, z);
    this.drawCenter(ctx, t, z);
    this.drawRain(ctx, t);
    this.screen(ctx);
    this.drawRainbow(ctx, t);
  }

  cellState(c, t) {
    // 1) path destinations bloom when their path arrives, 2) everything sprouts in a wave from the
    // centre, 3) blooms into the giant flower on 开花
    const path = this.paths.find((p) => p.i === c.i && p.j === c.j);
    const sprout = 198.0 + c.r * 0.13 + hash2(c.i, c.j) * 0.15;
    const bloom = 205.6 + (c.ro === 'heart' ? 0 : c.ro === 'petal' ? 0.25 + c.r * 0.04 : 0.6 + c.r * 0.03) + hash2(c.j, c.i) * 0.1;
    const early = path ? path.t + 0.42 : 1e9;
    return { sprout, bloom, early };
  }

  drawCells(ctx, t, z) {
    const vw = 960 / z + CELL, vh = 540 / z + CELL;
    for (const c of this.cells) {
      if (c.i === CX && c.j === CY) continue;
      if (Math.abs(c.x) > vw || Math.abs(c.y) > vh) continue;
      const s = this.cellState(c, t);
      const open = Math.max(prog(t, s.early, s.early + 0.4), prog(t, s.bloom, s.bloom + 0.55));
      const sp = prog(t, s.sprout, s.sprout + 0.3);
      if (open > 0) {
        // tile tint for the giant picture once it is complete
        const pic = prog(t, s.bloom, s.bloom + 0.6);
        const tint = { petal: '#FFB3A6', heart: '#FFE08A', stem: '#B9E0A5', ground: '#F7F0E4' }[c.ro];
        if (pic > 0) { ctx.globalAlpha = pic; ctx.fillStyle = tint; ctx.fillRect(c.x - CELL / 2 + 0.5, c.y - CELL / 2 + 0.5, CELL - 1, CELL - 1); ctx.globalAlpha = 1; }
        const oo = Math.min(1, open * 1.2);
        (oo >= 1 ? drawHeadCached : drawHead)(ctx, c.F, c.x, c.y, CELL * 0.42 * E.outBack(open, 1.6) * (1 + 0.08 * this.m.pulse(t, 8) * pic), { open: oo, tilt: 1 });
      } else if (sp > 0) {
        shape(ctx, P.drop(c.x, c.y + CELL * 0.2, CELL * 0.26, CELL * 0.34), { fill: '#C98A5B', line: darker('#C98A5B', 0.5), lw: 1.2, alpha: clamp(sp * 3) });
        drawSprout(ctx, c.x, c.y + CELL * 0.06, CELL * 0.5 * E.outBack(sp, 1.8), sp);
      }
      // seed numbers under the early bloomers while the page is close
      if (z > 1.4 && open > 0.5 && t < 198.5) {
        ctx.save();
        ctx.globalAlpha = clamp((z - 1.4) * 2) * prog(open, 0.5, 1);
        ctx.fillStyle = INK;
        ctx.font = `italic 500 ${8}px "Fraunces"`;
        ctx.textAlign = 'center';
        ctx.fillText(`No.${c.F.seed}`, c.x, c.y + CELL * 0.47);
        ctx.restore();
      }
    }
  }

  drawPaths(ctx, t, z) {
    for (const p of this.paths) {
      const k = prog(t, p.t, p.t + 0.42, E.outC);
      if (k <= 0) continue;
      const fade = 1 - prog(t, 197.6, 198.4);
      if (fade <= 0) continue;
      const ex = (p.i - CX) * CELL, ey = (p.j - CY) * CELL;
      const mx = ex * 0.5 - ey * p.bend * 0.4, my = ey * 0.5 + ex * p.bend * 0.4;
      const pts = [];
      for (let u = 0; u <= 1.0001; u += 0.05) pts.push([2 * (1 - u) * u * mx + u * u * ex, 2 * (1 - u) * u * my + u * u * ey]);
      stroke(ctx, polyPart(pts, k), C.leafDark, 3.4, { alpha: fade });
      stroke(ctx, polyPart(pts, k), C.leafLight, 1.6, { alpha: fade });
      if (k < 1) {
        // the seed riding the tip of its path
        const u = k, x = 2 * (1 - u) * u * mx + u * u * ex, y = 2 * (1 - u) * u * my + u * u * ey;
        shape(ctx, P.drop(x, y, 12, 16), { fill: '#C98A5B', line: darker('#C98A5B', 0.5), lw: 1.2 });
      } else {
        const r = prog(t, p.t + 0.42, p.t + 0.9);
        if (r > 0 && r < 1) stroke(ctx, P.circle(ex, ey, CELL * (0.4 + r * 0.5)), C.coral, 2.4, { alpha: 1 - r });
      }
    }
  }

  // the centre tile: the tray room shrinking into it, then 豆豆's flower
  drawCenter(ctx, t, z) {
    const swap = prog(t, 192.6, 193.3);
    const tw = lerp(CELL * 16 / 9, CELL, E.ioC(prog(t, T0 + 0.2, 192.2)));
    if (swap < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-tw / 2, -CELL / 2, tw, CELL);
      ctx.clip();
      const s = CELL / 1080;
      ctx.scale(s, s);
      const ec = this.echo().cam(T0);
      ctx.scale(ec.z, ec.z);
      ctx.translate(-ec.x, -ec.y);
      ctx.globalAlpha = 1 - swap;
      this.echo().drawWorld(ctx, Math.min(t, T0 + 0.5));
      ctx.restore();
    }
    if (swap > 0) {
      shape(ctx, P.rect(-CELL / 2, -CELL / 2, CELL, CELL), { fill: '#FFF3C4', riso: 0, alpha: swap });
      const hi = prog(t, this.ut(32, 6) - 0.1, this.ut(32, 10) + 0.4);
      drawHead(ctx, this.pipF, 0, 0, CELL * 0.44 * E.outBack(swap, 1.5) * (1 + 0.1 * hi), { open: swap, tilt: 1 });
      if (hi > 0) {
        stroke(ctx, P.rect(-CELL / 2 - 2, -CELL / 2 - 2, CELL + 4, CELL + 4), C.marigold, 3.2, { alpha: hi });
        for (let k = 0; k < 4; k++) sparkle(ctx, Math.cos(k * 1.57 + 0.78) * CELL * 0.75, Math.sin(k * 1.57 + 0.78) * CELL * 0.75, 7 * Math.sin(Math.PI * prog(t, this.ut(32, 10) + k * 0.05, this.ut(32, 10) + 0.8 + k * 0.05)), { rot: t, lw: 0.8 });
      }
    }
    stroke(ctx, P.rect(-tw / 2, -CELL / 2, tw, CELL), INK, 1.6, { alpha: clamp(1 - (z - 3) / 20) });
  }

  drawRain(ctx, t) {
    const L = this.line(35);
    if (!L) return;
    const cols = ['#FF6B5B', '#FFB627', '#6EC1E4', '#A78BDA', '#3E9B6E', '#F48FB1', '#FF8A3D', '#7FA2E8'];
    for (let i = 0; i < 70; i++) {
      const t0 = 207.75 + hash2(i, 1) * 3.6;
      const u = prog(t, t0, t0 + 0.7, E.inQ);
      if (u <= 0 || u >= 1) continue;
      const x = (hash2(i, 2) - 0.5) * COLS * CELL, y = lerp(-ROWS * CELL * 0.7, (hash2(i, 3) - 0.5) * ROWS * CELL, u);
      shape(ctx, P.drop(x, y, 12, 18), { fill: cols[i % cols.length], line: darker(cols[i % cols.length], 0.45), lw: 1.2 });
    }
  }

  drawRainbow(ctx, t) {
    const k = prog(t, this.ut(35, 6) - 0.2, this.ut(35, 9) + 0.4, E.ioC);
    if (k <= 0) return;
    const cols = ['#FF6B5B', '#FF8A3D', '#FFD84D', '#7CC49A', '#6EC1E4', '#7FA2E8', '#A78BDA'];
    cols.forEach((c, i) => {
      const r = 860 - i * 26;
      stroke(ctx, (cc) => { cc.beginPath(); cc.arc(960, 1180, r, Math.PI, Math.PI + Math.PI * k); }, c, 24, { alpha: 0.85, cap: 'butt' });
    });
  }
}
