// 豆豆, the hero seed. A plump caramel seed with bean eyes, blush and little legs. It can hop,
// squash, look around, sprout two seed leaves and (in the chorus) grow its own flower.
import { clamp, E, TAU, lerp } from '../core/math.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { C } from './palette.js';
import { drawFace, darker } from './flower.js';

// x, y: point between the feet (ground contact). s: body height in local units.
// st: { squash (1 = rest, <1 flat, >1 tall), rot, mood, blink, look, legs (0..1), step (walk phase),
//       sprout (0..1), leafOpen (0..1), alpha, shadow, tint }
export function drawPip(ctx, x, y, s, st = {}) {
  const sq = st.squash ?? 1;
  const legs = st.legs ?? 1;
  const legH = s * 0.16 * legs;
  ctx.save();
  ctx.translate(x, y);
  if (st.rot) ctx.rotate(st.rot);
  const a = st.alpha;
  // ground shadow
  if (st.shadow !== false) shape(ctx, P.ellipse(0, 0, s * 0.42 * (2 - Math.min(1.4, sq)) * 0.8, s * 0.07), { fill: 'rgba(42,46,69,0.16)', riso: 0, alpha: a });
  // legs
  if (legs > 0.01) {
    const ph = st.step ?? 0;
    for (const side of [-1, 1]) {
      const lift = Math.max(0, Math.sin(ph * TAU + (side > 0 ? Math.PI : 0))) * legH * 0.6;
      const fx = side * s * 0.13 + Math.cos(ph * TAU + (side > 0 ? Math.PI : 0)) * s * 0.05 * (st.walk ?? 0);
      stroke(ctx, P.line(side * s * 0.1, -legH, fx, -lift), INK, s * 0.045, { alpha: a, minLw: 1 });
      shape(ctx, P.ellipse(fx + side * s * 0.03, -lift - s * 0.012, s * 0.065, s * 0.035), { fill: INK, riso: 0, alpha: a });
    }
  }
  // body
  const bh = s * 0.84 * sq, bw = s * 0.7 / Math.sqrt(sq);
  const cy = -legH - bh * 0.5;
  const tint = st.tint;
  const col = (h) => (tint ? lerpHex(h, tint[0], tint[1]) : h);
  // sprout behind the body top
  const sp = st.sprout ?? 0;
  if (sp > 0) drawSprout(ctx, 0, cy - bh * 0.44, s * 0.62 * E.outBack(clamp(sp), 1.5), st.leafOpen ?? clamp(sp * 1.5 - 0.3), a);
  shape(ctx, P.drop(0, cy, bw, bh), { fill: col(C.pip), line: darker(C.pip, 0.55), lw: Math.max(1.4, s * 0.03), shadow: st.bodyShadow, alpha: a });
  // shading stripe and a highlight, like the crease of a real seed
  ctx.save();
  ctx.beginPath();
  P.drop(0, cy, bw, bh)(ctx);
  ctx.clip();
  shape(ctx, P.ellipse(bw * 0.32, cy + bh * 0.12, bw * 0.3, bh * 0.52, 0.2), { fill: col(C.pipDark), riso: 0, alpha: (a ?? 1) * 0.55 });
  shape(ctx, P.ellipse(-bw * 0.2, cy - bh * 0.18, bw * 0.09, bh * 0.14, 0.4), { fill: col(C.pipLight), riso: 0, alpha: (a ?? 1) * 0.9 });
  ctx.restore();
  // face
  const look = st.look ?? [0, 0];
  ctx.save();
  ctx.translate(look[0] * s * 0.04, cy + bh * 0.1);
  drawFace(ctx, s * 0.42, { mood: st.mood ?? 'smile', blink: st.blink ?? 0, look, blush: 1 }, a);
  ctx.restore();
  ctx.restore();
}

function lerpHex(a, b, t) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(p >> 16, q >> 16, t)), g = Math.round(lerp((p >> 8) & 255, (q >> 8) & 255, t)), bl = Math.round(lerp(p & 255, q & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// two seed leaves on a short shoot, rooted at (x, y), height h
export function drawSprout(ctx, x, y, h, open = 1, alpha) {
  if (h <= 0) return;
  const tip = [x + h * 0.06, y - h];
  stroke(ctx, P.quad(x, y, x - h * 0.12, y - h * 0.55, tip[0], tip[1]), darker(C.stem, 0.5), Math.max(2.2, h * 0.11) + 2, { alpha, minLw: 1 });
  stroke(ctx, P.quad(x, y, x - h * 0.12, y - h * 0.55, tip[0], tip[1]), C.leafLight, Math.max(2.2, h * 0.11), { alpha, minLw: 1 });
  const o = E.outBack(clamp(open), 1.4);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(tip[0], tip[1]);
    ctx.rotate(-Math.PI / 2 + s * lerp(0.15, 1.05, o));
    shape(ctx, P.leaf(h * 0.62 * Math.max(0.2, o), h * 0.24 * Math.max(0.3, o), s * 0.35), { fill: C.leaf, line: C.leafDark, lw: Math.max(1.2, h * 0.035), alpha });
    stroke(ctx, P.quad(h * 0.06, 0, h * 0.3, s * h * 0.03, h * 0.5 * o, s * h * 0.08), C.leafLight, Math.max(1, h * 0.02), { alpha: (alpha ?? 1) * 0.8 });
    ctx.restore();
  }
}

// blinking schedule: closes for ~0.12 s every few seconds, deterministic
export function blinkAt(t, seed = 0) {
  const period = 3.1 + (seed % 5) * 0.37;
  const ph = ((t + seed * 0.71) % period + period) % period;
  return ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0;
}

// 豆豆 with its own flower growing from the top of its head.
// st: pip state + { stemH, R, open, bud (0..1 shown while open == 0), sway, F, leafGrow, glow }
import { drawHead, drawBud, drawLeafAt } from './flower.js';
export function drawPipBloom(ctx, x, y, s, st = {}) {
  const sq = st.squash ?? 1;
  const legH = s * 0.16 * (st.legs ?? 1);
  const bh = s * 0.84 * sq;
  const top = [x + (st.rot ?? 0) * bh, y - legH - bh * 0.92];
  const h = st.stemH ?? 0;
  const sway = st.sway ?? 0;
  let tip = top;
  if (h > 1) {
    tip = [top[0] + Math.sin(sway) * h * 0.85, top[1] - Math.cos(sway) * h];
    const cx = top[0] + Math.sin(sway) * h * 0.2 + h * 0.06, cy = top[1] - h * 0.55;
    const path = (c) => { c.beginPath(); c.moveTo(top[0], top[1] + 6); c.quadraticCurveTo(cx, cy, tip[0], tip[1]); };
    const lw = Math.max(5, s * 0.07);
    stroke(ctx, path, darker(C.stem, 0.5), lw + 3, { alpha: st.alpha });
    stroke(ctx, path, C.leafLight, lw, { alpha: st.alpha });
    const lg = st.leafGrow ?? clamp(h / 160);
    for (const [u, side] of [[0.38, -1], [0.62, 1]]) {
      const px = (1 - u) * (1 - u) * top[0] + 2 * (1 - u) * u * cx + u * u * tip[0];
      const py = (1 - u) * (1 - u) * top[1] + 2 * (1 - u) * u * cy + u * u * tip[1];
      drawLeafAt(ctx, px, py, -Math.PI / 2 + side * 1.0 + sway * 0.4, s * 0.62, s * 0.15, { grow: lg, alpha: st.alpha, bend: side * 0.3, lw: 2 });
    }
  }
  drawPip(ctx, x, y, s, { ...st, sprout: h > 1 ? 0 : st.sprout });
  if (st.glow > 0) {
    const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], (st.R ?? 100) * 2.4);
    g.addColorStop(0, `rgba(255,236,170,${0.6 * st.glow})`);
    g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(tip[0] - (st.R ?? 100) * 2.4, tip[1] - (st.R ?? 100) * 2.4, (st.R ?? 100) * 4.8, (st.R ?? 100) * 4.8);
  }
  if (h > 1 && st.F) {
    if ((st.open ?? 0) > 0) drawHead(ctx, st.F, tip[0], tip[1], st.R ?? 100, { open: st.open, shadow: true, rot: sway * 0.5, alpha: st.alpha, spin: st.spin ?? 0 });
    else if ((st.bud ?? 0) > 0) drawBud(ctx, st.F, tip[0], tip[1], (st.R ?? 100) * 0.42 * E.outBack(clamp(st.bud), 1.6), st.bud, { rot: sway * 0.5, alpha: st.alpha });
  }
  return tip;
}
