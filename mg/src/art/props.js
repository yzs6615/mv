// Props: paint-chip fan, polaroid, tear-off calendar, clock, ruler, finish ribbon.
import { clamp, E, TAU, lerp, hash2 } from '../core/math.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { C } from './palette.js';
import { darker } from './flower.js';

export const FAN_COLORS = ['#FF6B5B', '#FF9F80', '#F48FB1', '#E0567A', '#C2407E', '#FFB627', '#FFD84D', '#FF8A3D', '#A78BDA', '#7B5CC4', '#7FA2E8', '#6EC1E4', '#3BB3A6', '#3E9B6E'];
export const FAN_ANGLE = (i, n) => lerp(-1.32, 1.32, n === 1 ? 0.5 : i / (n - 1));

// one paint chip: pivot at the origin, pointing up (angle 0) ; len, wid
export function drawChip(ctx, color, len, wid, o = {}) {
  const a = o.alpha;
  shape(ctx, P.rrect(-wid / 2, -len, wid, len, 16), { fill: '#FFFDF7', line: INK, lw: 2.2, alpha: a, shadow: o.shadow ?? { dx: 4, dy: 6, color: 'rgba(42,46,69,0.10)' } });
  shape(ctx, P.rrect(-wid / 2 + 12, -len + 12, wid - 24, len * 0.62, 10), { fill: color, line: darker(color, 0.45), lw: 1.8, alpha: a });
  shape(ctx, P.circle(0, -34, 11), { fill: '#E9DFCF', line: INK, lw: 1.8, alpha: a });
  if (o.label !== false) {
    ctx.save();
    ctx.globalAlpha *= a ?? 1;
    ctx.translate(0, -len * 0.3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = INK;
    ctx.font = 'italic 500 24px "Fraunces"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(color.toUpperCase(), 0, 0);
    ctx.restore();
  }
}

// the whole fan; open(i) -> 0..1 spread of chip i; show(i) -> 0..1 presence
export function drawFan(ctx, px, py, len, wid, open, show, o = {}) {
  const n = o.n ?? FAN_COLORS.length;
  for (let i = 0; i < n; i++) {
    const s = show(i);
    if (s <= 0) continue;
    const ang = FAN_ANGLE(i, n) * open(i) + (o.sway ?? 0) * Math.sin(i * 0.7);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.scale(lerp(0.6, 1, s), lerp(0.6, 1, s));
    drawChip(ctx, (o.colors ?? FAN_COLORS)[i], len, wid, { alpha: clamp(s * 2) });
    ctx.restore();
  }
  shape(ctx, P.circle(px, py - 34, 16), { fill: C.gold, line: darker(C.gold, 0.5), lw: 2.2, alpha: o.rivet ?? 1 });
}

// polaroid: card centred at (0,0) in local units w x h; inner(ctx, x, y, w, h) draws the photo
export function drawPolaroid(ctx, w, h, inner, o = {}) {
  shape(ctx, P.rect(-w / 2, -h / 2, w, h), { fill: '#FFFEF9', line: darker('#FFFEF9', 0.35), lw: 2, shadow: { dx: 10, dy: 14, color: 'rgba(42,46,69,0.16)' }, alpha: o.alpha });
  const m = w * 0.07;
  const pw = w - m * 2, ph = pw;
  const x = -w / 2 + m, y = -h / 2 + m;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, pw, ph);
  ctx.clip();
  inner(ctx, x, y, pw, ph);
  ctx.restore();
  stroke(ctx, P.rect(x, y, pw, ph), 'rgba(42,46,69,0.35)', 1.5, { alpha: o.alpha });
  if (o.caption) {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.globalAlpha *= (o.alpha ?? 1) * 0.85;
    ctx.font = `400 ${w * 0.07}px "LXGW WenKai"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.caption, 0, y + ph + (h / 2 - (y + ph)) * 0.5 + 2);
    ctx.restore();
  }
  if (o.tape !== false) shape(ctx, P.rect(-w * 0.14, -h / 2 - 18, w * 0.28, 40), { fill: 'rgba(255,230,160,0.75)', riso: 0, alpha: o.alpha });
}

// tear-off calendar block; day number and a page that flips off (flip 0..1)
export function drawCalendar(ctx, x, y, s, day, flip, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  shape(ctx, P.rrect(-s / 2, -s * 0.62, s, s * 1.2, 10), { fill: '#FFFDF7', line: INK, lw: 2.4, shadow: true });
  shape(ctx, P.rrect(-s / 2, -s * 0.62, s, s * 0.3, 10), { fill: C.coral, line: INK, lw: 2.4 });
  for (const rx of [-s * 0.25, s * 0.25]) shape(ctx, P.circle(rx, -s * 0.62, 8), { fill: INK, riso: 0 });
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 600 ${s * 0.5}px "Fraunces"`;
  ctx.fillText(String(day), 0, s * 0.18);
  ctx.font = `700 ${s * 0.13}px "LXGW WenKai"`;
  ctx.fillStyle = '#FFF8EE';
  ctx.fillText('明 天', 0, -s * 0.47);
  if (flip > 0 && flip < 1) {
    // the previous page tearing away up and to the side
    ctx.save();
    ctx.translate(s * 0.3 * flip, -s * 0.5 - s * 0.9 * E.outQ(flip));
    ctx.rotate(flip * 1.4);
    ctx.globalAlpha *= 1 - flip;
    shape(ctx, P.rect(-s / 2, 0, s, s * 0.85), { fill: '#FFFDF7', line: INK, lw: 2 });
    ctx.fillStyle = INK;
    ctx.font = `italic 600 ${s * 0.45}px "Fraunces"`;
    ctx.fillText(String(day - 1), 0, s * 0.42);
    ctx.restore();
  }
  ctx.restore();
}

export function drawClock(ctx, x, y, r, hours, o = {}) {
  shape(ctx, P.circle(x, y, r), { fill: '#FFFDF7', line: INK, lw: 3, shadow: true });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    stroke(ctx, P.line(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9), INK, i % 3 ? 2 : 3.5);
  }
  const ha = (hours / 12) * TAU - Math.PI / 2, ma = hours * TAU - Math.PI / 2;
  stroke(ctx, P.line(x, y, x + Math.cos(ha) * r * 0.5, y + Math.sin(ha) * r * 0.5), INK, 6);
  stroke(ctx, P.line(x, y, x + Math.cos(ma) * r * 0.75, y + Math.sin(ma) * r * 0.75), C.coral, 4);
  shape(ctx, P.circle(x, y, r * 0.07), { fill: INK, riso: 0 });
}

export function drawRuler(ctx, x, y0, y1, o = {}) {
  shape(ctx, P.rect(x - 34, y1, 68, y0 - y1), { fill: '#FBE3B0', line: darker('#FBE3B0', 0.55), lw: 2.4, shadow: true });
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = 'italic 500 22px "Fraunces"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let y = y0, i = 0; y > y1 + 4; y -= 25, i++) {
    stroke(ctx, P.line(x - 34, y, x - 34 + (i % 4 === 0 ? 30 : 16), y), INK, 2);
    if (i % 4 === 0 && i > 0) ctx.fillText(String(i / 4 * 10), x, y);
  }
  ctx.restore();
}

export function drawRibbon(ctx, x0, x1, y, t, o = {}) {
  const pts = [];
  for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push([lerp(x0, x1, u), y + Math.sin(u * Math.PI) * 26 + Math.sin(t * 4 + u * 9) * 5]); }
  stroke(ctx, P.smooth(pts, false), darker(C.coral, 0.4), 16);
  stroke(ctx, P.smooth(pts, false), C.coral, 11);
  for (const px of [x0, x1]) {
    stroke(ctx, P.line(px, y - 10, px, y + 280), INK, 6);
    shape(ctx, P.poly([[px, y - 10], [px + (px === x0 ? 50 : -50), y + 8], [px, y + 26]]), { fill: C.marigold, line: INK, lw: 2 });
  }
}
