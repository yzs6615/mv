// Drawing kit. Every shape is a path builder (ctx) => void, rendered in the film's print style:
// flat fill nudged a pixel or two off its ink line (risograph misregistration), optional hard
// paper-cut shadow, ink line whose on-screen width stays within a readable range at any zoom.
import { clamp, TAU, lerp } from './math.js';

export const INK = '#2A2E45';
let K = 1; // canvas px per design px, set once per frame
export const setDeviceScale = (k) => { K = k; };
export const deviceScale = () => K;

// design px per local unit under the current transform
export function localScale(ctx) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) / K;
}

function shifted(ctx, dx, dy, fn) {
  const m = ctx.getTransform();
  ctx.save();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e + dx * K, m.f + dy * K);
  fn();
  ctx.restore();
}

// style: { fill, line, lw (design px at scale 1), riso (0..1), shadow: {dx, dy, color} | true, alpha }
export function shape(ctx, path, st) {
  const a = st.alpha ?? 1;
  if (a <= 0.002) return;
  const prevA = ctx.globalAlpha;
  if (a < 1) ctx.globalAlpha = prevA * a;
  const s = localScale(ctx);
  if (st.shadow) {
    const sh = st.shadow === true ? { dx: 5, dy: 7, color: 'rgba(42,46,69,0.13)' } : st.shadow;
    shifted(ctx, sh.dx, sh.dy, () => { ctx.fillStyle = sh.color; path(ctx); ctx.fill(); });
  }
  if (st.fill) {
    const r = st.riso ?? 1;
    if (r) shifted(ctx, 1.7 * r, 1.3 * r, () => { ctx.fillStyle = st.fill; path(ctx); ctx.fill(); });
    else { ctx.fillStyle = st.fill; path(ctx); ctx.fill(); }
  }
  if (st.line) {
    const lw = st.lw ?? 2.2;
    ctx.lineWidth = clamp(lw * s, st.minLw ?? 0.6, st.maxLw ?? 7) / s;
    ctx.strokeStyle = st.line;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    path(ctx);
    ctx.stroke();
  }
  ctx.globalAlpha = prevA;
}

// stroke only (open paths), width in design px at scale 1
export function stroke(ctx, path, color, lw = 2.2, st = {}) {
  const s = localScale(ctx);
  const a = st.alpha ?? 1;
  if (a <= 0.002) return;
  const prevA = ctx.globalAlpha;
  if (a < 1) ctx.globalAlpha = prevA * a;
  ctx.lineWidth = clamp(lw * s, st.minLw ?? 0.6, st.maxLw ?? 9) / s;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = st.cap ?? 'round';
  if (st.dash) { ctx.setLineDash(st.dash.map((d) => d)); ctx.lineDashOffset = st.dashOffset ?? 0; }
  path(ctx);
  ctx.stroke();
  if (st.dash) ctx.setLineDash([]);
  ctx.globalAlpha = prevA;
}

// ---------- path builders ----------
export const P = {
  circle: (x, y, r) => (c) => { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); },
  ellipse: (x, y, rx, ry, rot = 0) => (c) => { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); },
  rect: (x, y, w, h) => (c) => { c.beginPath(); c.rect(x, y, w, h); },
  rrect: (x, y, w, h, r) => (c) => { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)); },
  poly: (pts, closed = true) => (c) => {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    if (closed) c.closePath();
  },
  // Catmull-Rom through points, as cubic beziers
  smooth: (pts, closed = true, ten = 0.5) => (c) => {
    c.beginPath();
    const n = pts.length;
    if (n < 2) return;
    const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    c.moveTo(pts[0][0], pts[0][1]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const k = ten / 3;
      c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]);
    }
    if (closed) c.closePath();
  },
  line: (x0, y0, x1, y1) => (c) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); },
  quad: (x0, y0, cx, cy, x1, y1) => (c) => { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); },
  cubic: (x0, y0, c1x, c1y, c2x, c2y, x1, y1) => (c) => { c.beginPath(); c.moveTo(x0, y0); c.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1); },
  star: (x, y, r1, r2, n = 5, rot = -Math.PI / 2) => (c) => {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n;
      i ? c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : c.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    c.closePath();
  },
  heart: (x, y, s) => (c) => {
    c.beginPath();
    c.moveTo(x, y + s * 0.95);
    c.bezierCurveTo(x - s * 1.25, y + s * 0.15, x - s * 0.95, y - s * 0.95, x, y - s * 0.38);
    c.bezierCurveTo(x + s * 0.95, y - s * 0.95, x + s * 1.25, y + s * 0.15, x, y + s * 0.95);
    c.closePath();
  },
  // teardrop with the point at the top (seed, droplet)
  drop: (x, y, w, h) => (c) => {
    c.beginPath();
    c.moveTo(x, y - h * 0.5);
    c.bezierCurveTo(x + w * 0.18, y - h * 0.22, x + w * 0.52, y + h * 0.02, x + w * 0.5, y + h * 0.2);
    c.bezierCurveTo(x + w * 0.48, y + h * 0.42, x + w * 0.26, y + h * 0.5, x, y + h * 0.5);
    c.bezierCurveTo(x - w * 0.26, y + h * 0.5, x - w * 0.48, y + h * 0.42, x - w * 0.5, y + h * 0.2);
    c.bezierCurveTo(x - w * 0.52, y + h * 0.02, x - w * 0.18, y - h * 0.22, x, y - h * 0.5);
    c.closePath();
  },
  // organic closed blob, deterministic per seed, can breathe with phase
  blob: (x, y, r, n, amp, seed, phase = 0) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const w = 1 + amp * (Math.sin(a * 3 + seed * 1.7 + phase) * 0.5 + Math.sin(a * 5 + seed * 3.1 - phase * 0.7) * 0.3 + Math.sin(a * 2 + seed) * 0.2);
      pts.push([x + Math.cos(a) * r * w, y + Math.sin(a) * r * w]);
    }
    return P.smooth(pts, true);
  },
  // leaf along +x from the origin: len, half width, bend (-1..1)
  leaf: (len, wid, bend = 0) => (c) => {
    const b = bend * len * 0.25;
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(len * 0.25, -wid * 1.1 + b, len * 0.7, -wid * 0.9 + b * 1.4, len, b * 1.6);
    c.bezierCurveTo(len * 0.7, wid * 0.9 + b * 1.4, len * 0.25, wid * 1.1 + b, 0, 0);
    c.closePath();
  },
  // a soft cloud from overlapping circles, flat bottom
  cloud: (x, y, w, h, seed = 1) => (c) => {
    c.beginPath();
    const n = 4 + (seed % 3);
    c.moveTo(x - w / 2, y);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const cx = x - w / 2 + w * u;
      const rr = h * (0.45 + 0.35 * Math.sin(u * Math.PI)) * (0.85 + 0.3 * ((seed * (i + 3) * 7919) % 100) / 100);
      if (i === 0) continue;
      const px = x - w / 2 + (w * (i - 0.5)) / n;
      c.quadraticCurveTo(px, y - rr * 2.1, cx, y - (i === n ? 0 : rr * 0.5));
    }
    c.lineTo(x - w / 2, y);
    c.closePath();
  },
};

// arc length helpers for "drawing on" a polyline
export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
export function polyAt(pts, u) {
  const L = polyLength(pts) * u;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= L) {
      const f = d ? (L - acc) / d : 0;
      return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f), Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])];
    }
    acc += d;
  }
  const n = pts.length;
  return [pts[n - 1][0], pts[n - 1][1], Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0])];
}
// the first u (0..1) of a polyline as a path
export function polyPart(pts, u0, u1 = null) {
  if (u1 === null) { u1 = u0; u0 = 0; }
  const L = polyLength(pts);
  const a = L * u0, b = L * u1;
  return (c) => {
    c.beginPath();
    let acc = 0, started = false;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const s0 = acc, s1 = acc + d;
      acc = s1;
      if (s1 < a || s0 > b || d === 0) continue;
      const f0 = Math.max(0, (a - s0) / d), f1 = Math.min(1, (b - s0) / d);
      const x0 = lerp(p[0], q[0], f0), y0 = lerp(p[1], q[1], f0);
      if (!started) { c.moveTo(x0, y0); started = true; }
      c.lineTo(lerp(p[0], q[0], f1), lerp(p[1], q[1], f1));
    }
  };
}
// sample a cubic bezier into a polyline
export function cubicPts(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}
