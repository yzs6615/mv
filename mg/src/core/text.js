// Kinetic typography. A line is a list of units (CJK characters or Latin words) with the time each
// one is sung; every unit lands on its own onset. Layout supports horizontal rows and vertical
// (top-to-bottom) setting, accent colours, a paper halo for legibility and a risograph double print.
import { clamp, E, lerp, hash2, TAU } from './math.js';
import { INK } from './draw.js';

export const FONT_CN = '"LXGW WenKai"';
export const FONT_LATIN = '"Fraunces"';
const isLatin = (s) => /^[A-Za-z']+$/.test(s);

const widthCache = new Map();
function unitWidth(ctx, u, size, weight) {
  const key = `${u}|${weight}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = fontFor(u, 100, weight);
    w = ctx.measureText(u).width / 100;
    ctx.restore();
    widthCache.set(key, w);
  }
  return w * size;
}
export function fontFor(u, size, weight = 700) {
  return isLatin(u) ? `italic ${weight >= 700 ? 600 : 500} ${size}px ${FONT_LATIN}` : `${weight} ${size}px ${FONT_CN}`;
}

// build a timed line for non-lyric text (titles, labels, credits)
export function makeLine(text, t0, step = 0.08, extra = {}) {
  const units = [];
  for (const tok of text.match(/[A-Za-z'.,·:&#0-9-]+|[^\sA-Za-z]| /g) || []) {
    if (tok === ' ') { if (units.length) units[units.length - 1].brk = true; continue; }
    units.push({ c: tok, t: t0 + units.length * step, d: step, brk: false });
  }
  return { text, t0, t1: t0 + units.length * step, chars: units, ...extra };
}

// layout units into rows; returns [{u, x, y, w}] relative to the anchor, plus bounds
function layout(ctx, line, o) {
  const size = o.size;
  const gap = size * (o.gap ?? 0.42);
  const track = size * (o.tracking ?? 0.02);
  const units = line.chars;
  const rowsAt = new Set(o.rows ?? []);
  const rows = [[]];
  units.forEach((u, i) => {
    rows[rows.length - 1].push(i);
    if (rowsAt.has(i) && i < units.length - 1) rows.push([]);
  });
  const placed = new Array(units.length);
  if (o.vertical) {
    // columns right-to-left, characters top-to-bottom
    const colStep = size * (o.lineHeight ?? 1.35);
    rows.forEach((row, ri) => {
      let y = 0;
      row.forEach((i) => {
        const u = units[i];
        placed[i] = { x: -ri * colStep, y: y + size * 0.5, w: size };
        y += size * 1.04 + (u.brk && !rowsAt.has(i) ? gap * 0.8 : 0);
      });
      row.h = y;
    });
    const maxH = Math.max(...rows.map((r) => r.h));
    const ax = o.align === 'left' ? (rows.length - 1) * colStep : o.align === 'right' ? 0 : ((rows.length - 1) * colStep) / 2;
    const ay = o.valign === 'top' ? 0 : o.valign === 'bottom' ? -maxH : -maxH / 2;
    rows.forEach((row) => {
      const off = o.colAlign === 'center' ? (maxH - row.h) / 2 : 0;
      row.forEach((i) => { placed[i].x += ax; placed[i].y += ay + off; });
    });
    return placed;
  }
  const lh = size * (o.lineHeight ?? 1.3);
  rows.forEach((row, ri) => {
    let x = 0;
    row.forEach((i, k) => {
      const u = units[i];
      const w = unitWidth(ctx, u.c, size, o.weight ?? 700);
      const prev = k ? units[row[k - 1]] : null;
      if (prev && (isLatin(prev.c) || isLatin(u.c))) x += size * 0.2;
      placed[i] = { x: x + w / 2, y: ri * lh, w };
      x += w + track + (u.brk && k < row.length - 1 ? gap : 0);
    });
    const rw = x - track;
    const off = o.align === 'left' ? 0 : o.align === 'right' ? -rw : -rw / 2;
    row.forEach((i) => { placed[i].x += off + (o.rowShift ? o.rowShift[ri] ?? 0 : 0); });
  });
  const totalH = (rows.length - 1) * lh;
  const vy = o.valign === 'top' ? size * 0.5 : o.valign === 'bottom' ? -totalH - size * 0.5 : -totalH / 2;
  placed.forEach((p) => { p.y += vy; });
  return placed;
}

// o: { x, y, size, align, valign, vertical, rows, color, accent: {i: color} | fn(i,u), style, inDur, lead,
//      exitT, exitStyle, exitDur, halo, riso, rot, alpha, weight, sing (bounce on onset), seed }
export function drawLine(ctx, line, t, o) {
  if (!line) return;
  const lead = o.lead ?? 0.07;
  const inDur = o.inDur ?? 0.34;
  const first = line.chars[0].t - lead;
  if (t < first - 0.01) return;
  const exitT = o.exitT ?? Infinity;
  const exitDur = o.exitDur ?? 0.5;
  const nUnits = line.chars.length;
  if (t > exitT + exitDur + nUnits * (o.exitStagger ?? 0.02) + 0.05) return;
  const size = o.size;
  const placed = layout(ctx, line, o);
  const style = o.style ?? 'rise';
  const exitStyle = o.exitStyle ?? 'fade';
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.scale) ctx.scale(o.scale, o.scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const baseA = o.alpha ?? 1;
  const halo = o.halo ?? 'rgba(244,237,225,0.92)';
  const pass = (which) => {
    line.chars.forEach((u, i) => {
      const p = placed[i];
      const tin = u.t - lead;
      const k = clamp((t - tin) / inDur);
      if (k <= 0) return;
      let a = 1, dx = 0, dy = 0, sc = 1, rot = 0;
      const r1 = hash2(i + 1, (o.seed ?? 7) + 3) - 0.5, r2 = hash2(i + 5, (o.seed ?? 7) + 11) - 0.5;
      if (style === 'rise') { a = E.outC(k); dy = (1 - E.outBack(k, 2.2)) * size * 0.45; sc = lerp(0.86, 1, E.outBack(k, 2)); }
      else if (style === 'pop') { a = clamp(k * 3); sc = E.outBack(k, 2.6); }
      else if (style === 'drop') { a = clamp(k * 4); dy = -(1 - E.outBack(k, 1.8)) * size * 1.1; rot = (1 - k) * r1 * 0.6; }
      else if (style === 'stamp') { a = clamp(k * 2.5); sc = lerp(1.7, 1, E.outQt(k)); }
      else if (style === 'slide') { a = E.outC(k); dx = (1 - E.outQt(k)) * size * 0.6; }
      else if (style === 'fade') { a = E.ioC(k); }
      // a little bounce while the unit is sung
      const since = t - u.t;
      if ((o.sing ?? true) && since > 0 && since < 0.6) sc *= 1 + 0.09 * Math.exp(-since * 9) * Math.sin(Math.min(Math.PI, since * 14));
      // exit
      const te = exitT + i * (o.exitStagger ?? 0.02);
      if (t > te) {
        const x = clamp((t - te) / exitDur);
        if (exitStyle === 'fade') { a *= 1 - E.inQ(x); dy -= E.inQ(x) * size * 0.35; }
        else if (exitStyle === 'fall') { a *= 1 - E.inC(x); dy += E.inQ(x) * size * 2.2; rot += x * r1 * 1.4; }
        else if (exitStyle === 'scatter') { a *= 1 - E.inQ(x); dx += E.inQ(x) * size * (1.5 + r1 * 2); dy -= E.inQ(x) * size * (0.8 + r2 * 1.6); rot += x * r2 * 3; }
        else if (exitStyle === 'shrink') { a *= 1 - E.inC(x); sc *= 1 - E.inQ(x) * 0.6; }
        else if (exitStyle === 'cut') { a *= x > 0 ? 0 : 1; }
      }
      a *= baseA;
      if (a <= 0.003) return;
      const color = typeof o.accent === 'function' ? o.accent(i, u) ?? o.color : (o.accent && o.accent[i]) || o.color || INK;
      ctx.save();
      ctx.translate(p.x + dx, p.y + dy);
      if (rot) ctx.rotate(rot);
      if (sc !== 1) ctx.scale(sc, sc);
      ctx.globalAlpha = a;
      const fs = isLatin(u.c) ? size * 1.08 : size;
      ctx.font = fontFor(u.c, fs, o.weight ?? 700);
      if (which === 0 && halo) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * (o.haloW ?? 0.2);
        ctx.strokeStyle = halo;
        ctx.strokeText(u.c, 0, 0);
      } else if (which === 1) {
        if (o.riso !== false) {
          ctx.globalAlpha = a * (o.risoA ?? 0.5);
          ctx.fillStyle = o.risoColor ?? (color === INK ? '#FF8F7A' : INK);
          ctx.fillText(u.c, size * 0.035, size * 0.03);
          ctx.globalAlpha = a;
        }
        ctx.fillStyle = color;
        ctx.fillText(u.c, 0, 0);
      }
      ctx.restore();
    });
  };
  if (halo) pass(0);
  pass(1);
  ctx.restore();
}

// width of a laid-out single-row line (for placing things next to it)
export function lineWidth(ctx, line, size, o = {}) {
  const p = layout(ctx, line, { size, ...o });
  if (!p.length) return 0;
  return p[p.length - 1].x + p[p.length - 1].w / 2 - (p[0].x - p[0].w / 2);
}

export async function loadFonts(texts) {
  if (typeof document === 'undefined') return; // Node registers TTFs up front
  const all = texts.join('');
  const specs = ['700 64px "LXGW WenKai"', '400 64px "LXGW WenKai"', 'italic 600 64px "Fraunces"', 'italic 500 64px "Fraunces"', '600 64px "Fraunces"', '400 64px "Fraunces"'];
  await Promise.all(specs.map((s) => document.fonts.load(s, all)));
  await document.fonts.ready;
}
