// Shared props: ground, sky, clouds, sun, rain, sparkles, loose petals, rings, bubbles, icons,
// ghost (dotted) flowers.
import { clamp, E, TAU, lerp, hash, hash2, hash3, noise1, rng, prog } from '../core/math.js';
import { shape, stroke, P, INK, localScale, polyPart, polyLength } from '../core/draw.js';
import { C } from './palette.js';
import { darker, mixHex } from './flower.js';

// ---------- ground ----------
// soil band from x0..x1 whose top edge sits near y; seed varies the wobble
export function groundPath(x0, x1, y, seed = 1, amp = 6, bottom = 2000) {
  const pts = [];
  for (let x = x0; x <= x1 + 1; x += 24) pts.push([x, y + Math.sin(x * 0.011 + seed) * amp + Math.sin(x * 0.037 + seed * 2.3) * amp * 0.45]);
  return (c) => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) c.lineTo(p[0], p[1]);
    c.lineTo(x1, bottom); c.lineTo(x0, bottom); c.closePath();
  };
}
export function groundY(x, y, seed = 1, amp = 6) {
  return y + Math.sin(x * 0.011 + seed) * amp + Math.sin(x * 0.037 + seed * 2.3) * amp * 0.45;
}
export function drawGround(ctx, x0, x1, y, o = {}) {
  const seed = o.seed ?? 1;
  const col = o.color ?? C.soil;
  shape(ctx, groundPath(x0, x1, y, seed, o.amp ?? 6, o.bottom ?? 2000), { fill: col, line: darker(col, 0.45), lw: o.lw ?? 2.4, alpha: o.alpha });
  shape(ctx, groundPath(x0, x1, y + (o.band ?? 30), seed + 1.7, 4, o.bottom ?? 2000), { fill: darker(col, 0.14), riso: 0, alpha: o.alpha });
  // pebbles and soil specks
  if (o.pebbles !== false) {
    const n = Math.floor((x1 - x0) / 55);
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.fillStyle = darker(col, 0.3);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x0 + hash2(i, seed * 13) * (x1 - x0), py = y + 18 + hash2(i, seed * 17) * (o.depth ?? 140);
      const r = 2 + hash2(i, seed * 19) * 4.5;
      ctx.moveTo(px + r, py);
      ctx.ellipse(px, py, r, r * 0.7, 0, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }
}

// a little mound of soil (for planted seeds), centred at x on ground line y
export function moundPath(x, y, w, h) {
  return (c) => {
    c.beginPath();
    c.moveTo(x - w / 2, y + 2);
    c.bezierCurveTo(x - w * 0.32, y - h * 0.9, x + w * 0.32, y - h * 0.9, x + w / 2, y + 2);
    c.closePath();
  };
}
export function drawMound(ctx, x, y, w, h, o = {}) {
  shape(ctx, moundPath(x, y, w, h), { fill: o.color ?? C.soil, line: darker(o.color ?? C.soil, 0.45), lw: 2.2, alpha: o.alpha });
  stroke(ctx, P.quad(x - w * 0.18, y - h * 0.42, x, y - h * 0.62, x + w * 0.16, y - h * 0.45), darker(C.soil, 0.25), 1.6, { alpha: (o.alpha ?? 1) * 0.6 });
}

// ---------- sky ----------
export function skyGradient(ctx, x0, y0, x1, y1, top, bottom, mid = null) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  if (mid) g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

export function drawCloud(ctx, x, y, w, h, o = {}) {
  const seed = o.seed ?? 1;
  const n = 5 + (seed % 3);
  const pts = [];
  // bumps along the top, flat-ish bottom
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const bump = 0.55 + 0.45 * Math.sin(u * Math.PI) * (0.75 + 0.5 * hash2(i, seed));
    pts.push([x - w / 2 + u * w, y - h * bump]);
  }
  const fill = o.fill ?? '#FFFFFF';
  const path = (c) => {
    c.beginPath();
    c.moveTo(x - w / 2, y);
    c.quadraticCurveTo(x - w / 2 - h * 0.35, y - h * 0.3, pts[0][0] + w * 0.04, pts[0][1] + h * 0.3);
    for (let i = 1; i <= n; i++) {
      const a = pts[i - 1], b = pts[i];
      c.bezierCurveTo(a[0] + (b[0] - a[0]) * 0.1, a[1] - h * 0.42, b[0] - (b[0] - a[0]) * 0.1, b[1] - h * 0.42, b[0], b[1] + (i === n ? h * 0.3 : 0));
    }
    c.quadraticCurveTo(x + w / 2 + h * 0.35, y - h * 0.3, x + w / 2, y);
    c.closePath();
  };
  shape(ctx, path, { fill, line: o.line ?? darker(fill === '#FFFFFF' ? '#C9CDDB' : fill, 0.35), lw: o.lw ?? 2.2, alpha: o.alpha, shadow: o.shadow });
  if (o.shade !== false) {
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.clip();
    shape(ctx, P.ellipse(x + w * 0.1, y + h * 0.15, w * 0.55, h * 0.42), { fill: o.shadeColor ?? 'rgba(170,180,205,0.28)', riso: 0, alpha: o.alpha });
    ctx.restore();
  }
}

export function drawSun(ctx, x, y, r, t, o = {}) {
  const rays = o.rays ?? 12;
  const spin = t * (o.spin ?? 0.25);
  ctx.save();
  ctx.translate(x, y);
  if (o.glow !== false) {
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 3.2);
    g.addColorStop(0, 'rgba(255,230,150,0.55)');
    g.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.fillRect(-r * 3.2, -r * 3.2, r * 6.4, r * 6.4);
    ctx.globalAlpha /= o.alpha ?? 1;
  }
  const rayPath = (c) => {
    c.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = spin + (i / rays) * TAU;
      const L = r * (1.45 + 0.12 * Math.sin(t * 3 + i * 1.7)) * (o.rayScale ?? 1);
      c.moveTo(Math.cos(a - 0.09) * r * 1.12, Math.sin(a - 0.09) * r * 1.12);
      c.lineTo(Math.cos(a) * L, Math.sin(a) * L);
      c.lineTo(Math.cos(a + 0.09) * r * 1.12, Math.sin(a + 0.09) * r * 1.12);
      c.closePath();
    }
  };
  shape(ctx, rayPath, { fill: o.rayColor ?? C.marigold, line: darker(C.marigold, 0.4), lw: 2, alpha: o.alpha });
  shape(ctx, P.circle(0, 0, r), { fill: o.color ?? C.lemon, line: darker(C.marigold, 0.45), lw: 2.6, alpha: o.alpha });
  ctx.restore();
}

// rain streaks inside a rectangle; density = drops per 100x100 px
export function drawRain(ctx, t, x0, y0, w, h, o = {}) {
  const n = Math.floor(((w * h) / 10000) * (o.density ?? 1.2));
  const speed = o.speed ?? 1500, len = o.len ?? 34, ang = o.angle ?? 0.18;
  const dx = Math.sin(ang), dy = Math.cos(ang);
  ctx.save();
  ctx.strokeStyle = o.color ?? 'rgba(90,110,160,0.55)';
  ctx.lineWidth = (o.lw ?? 2.2) / localScale(ctx);
  ctx.lineCap = 'round';
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const sx = hash2(i, 7) * (w + h * dx), ph = hash2(i, 9);
    const y = ((t * speed * (0.85 + 0.3 * hash2(i, 3)) + ph * (h + 200)) % (h + 200)) - 100;
    const x = sx - y * dx;
    ctx.moveTo(x0 + x, y0 + y);
    ctx.lineTo(x0 + x - dx * len, y0 + y - dy * len);
  }
  ctx.stroke();
  ctx.restore();
}

// four-point glint
export function sparkle(ctx, x, y, s, o = {}) {
  if (s <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.rot ?? 0);
  const p = (c) => {
    c.beginPath();
    c.moveTo(0, -s);
    c.quadraticCurveTo(s * 0.12, -s * 0.12, s, 0);
    c.quadraticCurveTo(s * 0.12, s * 0.12, 0, s);
    c.quadraticCurveTo(-s * 0.12, s * 0.12, -s, 0);
    c.quadraticCurveTo(-s * 0.12, -s * 0.12, 0, -s);
    c.closePath();
  };
  shape(ctx, p, { fill: o.color ?? C.light, line: o.line ?? C.gold, lw: o.lw ?? 1.6, alpha: o.alpha, riso: 0.5 });
  ctx.restore();
}

// a loose petal (for drifting particles)
export function drawPetal(ctx, x, y, s, rot, color, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1, o.flip ?? 1);
  shape(ctx, P.leaf(s, s * 0.36, 0.25), { fill: color, line: darker(color, 0.45), lw: Math.max(1, s * 0.05), alpha: o.alpha, riso: 0.6 });
  ctx.restore();
}

// drifting petals: deterministic particles; o: { n, x0, y0, w, h, wind, fall, colors, size, t0 }
export function petalDrift(ctx, t, o) {
  const n = o.n ?? 30;
  const colors = o.colors ?? [C.coral, C.pink, C.marigold, C.lavender, C.peach];
  for (let i = 0; i < n; i++) {
    const r1 = hash2(i, 11 + (o.seed ?? 0)), r2 = hash2(i, 23 + (o.seed ?? 0)), r3 = hash2(i, 37 + (o.seed ?? 0));
    const life = o.life ?? 6;
    const tt = t - (o.t0 ?? 0) - r3 * life;
    if (tt < 0 && !o.loop) continue;
    const ph = o.loop ? ((tt % life) + life) % life : tt;
    if (!o.loop && ph > life) continue;
    const x = (o.x0 ?? 0) + r1 * (o.w ?? 1920) + ph * (o.wind ?? 120) + Math.sin(ph * 1.7 + i) * 30;
    const y = (o.y0 ?? 0) + r2 * (o.h ?? 300) + ph * (o.fall ?? 60) + Math.sin(ph * 2.3 + i * 2) * 14;
    const a = Math.min(1, ph * 2) * Math.min(1, (life - ph) * 1.5) * (o.alpha ?? 1);
    drawPetal(ctx, x, y, (o.size ?? 18) * (0.7 + r2 * 0.6), ph * (1.5 + r1 * 2) + i, colors[i % colors.length], { alpha: a, flip: Math.cos(ph * 3 + i) });
  }
}

export function ring(ctx, x, y, r, o = {}) {
  stroke(ctx, P.circle(x, y, r), o.color ?? C.ink, o.lw ?? 3, { alpha: o.alpha });
}
// expanding ripple that starts at t0
export function ripple(ctx, x, y, t, t0, o = {}) {
  const k = (t - t0) / (o.dur ?? 0.7);
  if (k < 0 || k > 1) return;
  const r = (o.r0 ?? 6) + E.outC(k) * (o.r1 ?? 90);
  stroke(ctx, P.ellipse(x, y, r, r * (o.squash ?? 0.32)), o.color ?? C.ink, (o.lw ?? 3) * (1 - k * 0.6), { alpha: (1 - k) * (o.alpha ?? 1) });
}

// ---------- bubbles & icons ----------
export function thoughtBubble(ctx, x, y, w, h, tx, ty, o = {}) {
  const fill = o.fill ?? '#FFFFFF';
  shape(ctx, P.rrect(x - w / 2, y - h / 2, w, h, h * 0.5), { fill, line: o.line ?? INK, lw: 2.4, alpha: o.alpha, shadow: true });
  // trailing dots towards the thinker
  for (let i = 1; i <= 2; i++) {
    const u = i / 3;
    const px = lerp(x, tx, 0.45 + u * 0.4), py = lerp(y + h / 2, ty, 0.3 + u * 0.55);
    shape(ctx, P.circle(px, py, (h * 0.13) / i), { fill, line: o.line ?? INK, lw: 2, alpha: o.alpha });
  }
}
export function speechBubble(ctx, x, y, w, h, tx, ty, o = {}) {
  const fill = o.fill ?? '#FFFFFF';
  const path = (c) => {
    c.beginPath();
    c.roundRect(x - w / 2, y - h / 2, w, h, h * 0.45);
    c.moveTo(x - w * 0.12, y + h / 2 - 1);
    c.lineTo(tx, ty);
    c.lineTo(x + w * 0.08, y + h / 2 - 1);
  };
  shape(ctx, path, { fill, line: o.line ?? INK, lw: 2.2, alpha: o.alpha });
}

export function icon(ctx, name, x, y, s, o = {}) {
  const col = o.color ?? INK;
  const lw = o.lw ?? Math.max(2, s * 0.09);
  ctx.save();
  ctx.translate(x, y);
  const a = o.alpha;
  switch (name) {
    case 'note':
      shape(ctx, P.ellipse(-s * 0.18, s * 0.28, s * 0.22, s * 0.16, -0.4), { fill: col, riso: 0, alpha: a });
      stroke(ctx, P.line(s * 0.02, s * 0.25, s * 0.02, -s * 0.42), col, lw, { alpha: a });
      stroke(ctx, P.quad(s * 0.02, -s * 0.42, s * 0.3, -s * 0.3, s * 0.32, -s * 0.05), col, lw, { alpha: a });
      break;
    case 'star':
      shape(ctx, P.star(0, 0, s * 0.45, s * 0.2, 5), { fill: o.fill ?? C.marigold, line: darker(C.marigold, 0.45), lw: lw * 0.7, alpha: a });
      break;
    case 'heart':
      shape(ctx, P.heart(0, 0, s * 0.42), { fill: o.fill ?? C.coral, line: darker(C.coral, 0.45), lw: lw * 0.7, alpha: a });
      break;
    case 'book':
      shape(ctx, P.poly([[-s * 0.42, -s * 0.25], [0, -s * 0.15], [0, s * 0.3], [-s * 0.42, s * 0.2]]), { fill: o.fill ?? C.sky, line: col, lw: lw * 0.7, alpha: a });
      shape(ctx, P.poly([[s * 0.42, -s * 0.25], [0, -s * 0.15], [0, s * 0.3], [s * 0.42, s * 0.2]]), { fill: o.fill ?? C.ice, line: col, lw: lw * 0.7, alpha: a });
      break;
    case 'plane':
      shape(ctx, P.poly([[-s * 0.45, s * 0.05], [s * 0.45, -s * 0.3], [-s * 0.05, s * 0.32], [-s * 0.12, s * 0.12]]), { fill: o.fill ?? '#FFFFFF', line: col, lw: lw * 0.7, alpha: a });
      stroke(ctx, P.line(-s * 0.12, s * 0.12, s * 0.45, -s * 0.3), col, lw * 0.5, { alpha: a });
      break;
    case 'question':
      ctx.globalAlpha *= a ?? 1;
      ctx.fillStyle = col;
      ctx.font = `700 ${s * 0.9}px "Fraunces"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, s * 0.04);
      break;
    case 'sun':
      shape(ctx, P.circle(0, 0, s * 0.24), { fill: C.lemon, line: darker(C.marigold, 0.4), lw: lw * 0.7, alpha: a });
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * TAU;
        stroke(ctx, P.line(Math.cos(an) * s * 0.33, Math.sin(an) * s * 0.33, Math.cos(an) * s * 0.46, Math.sin(an) * s * 0.46), darker(C.marigold, 0.3), lw * 0.7, { alpha: a });
      }
      break;
    case 'drop':
      shape(ctx, P.drop(0, 0, s * 0.5, s * 0.75), { fill: o.fill ?? C.sky, line: darker(C.sky, 0.45), lw: lw * 0.7, alpha: a });
      break;
  }
  ctx.restore();
}

// ---------- ghost flower (dotted outline of a flower that does not exist yet) ----------
// progress 0..1 draws stem, then petals, then heart; dash marches slowly
export function ghostFlower(ctx, F, x, y, h, R, progress, t, o = {}) {
  if (progress <= 0) return;
  const col = o.color ?? 'rgba(42,46,69,0.55)';
  const lw = o.lw ?? 2.2;
  const s = localScale(ctx);
  const dash = [7 / s, 7 / s];
  const off = -t * 18 / s;
  const stemPts = [];
  const tx = x + F.stemBend * h * 0.12, ty = y - h;
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    stemPts.push([lerp(x, tx, u) + Math.sin(u * Math.PI) * F.stemBend * h * 0.1, lerp(y, ty, u)]);
  }
  const ps = clamp(progress / 0.35);
  stroke(ctx, polyPart(stemPts, ps), col, lw, { dash, dashOffset: off, alpha: o.alpha });
  // leaf
  if (progress > 0.25) {
    const lp = clamp((progress - 0.25) / 0.2);
    ctx.save();
    ctx.translate(lerp(x, tx, 0.45), lerp(y, ty, 0.45));
    ctx.rotate(-Math.PI / 2 + 0.9 * (F.stemBend > 0 ? -1 : 1));
    ctx.scale(lp, lp);
    stroke(ctx, P.leaf(R * 0.8, R * 0.2, 0.3), col, lw, { dash, dashOffset: off, alpha: o.alpha });
    ctx.restore();
  }
  // petals of the outer layer
  const L = F.layers[0];
  const pp = clamp((progress - 0.35) / 0.5);
  ctx.save();
  ctx.translate(tx, ty);
  for (let k = 0; k < L.n; k++) {
    const kp = clamp(pp * L.n - k);
    if (kp <= 0) break;
    const ang = F.rot + ((k + L.off) * TAU) / L.n;
    const pts = L.pts.map(([px, py]) => {
      const X = px * R * L.len, Y = py * R * L.len;
      return [X * Math.cos(ang) - Y * Math.sin(ang), X * Math.sin(ang) + Y * Math.cos(ang)];
    });
    pts.push(pts[0]);
    stroke(ctx, polyPart(pts, kp), col, lw, { dash, dashOffset: off, alpha: o.alpha });
  }
  const cp = clamp((progress - 0.85) / 0.15);
  if (cp > 0) stroke(ctx, P.circle(0, 0, R * F.center.r * E.outBack(cp)), col, lw, { dash, dashOffset: off, alpha: o.alpha });
  ctx.restore();
  return [tx, ty];
}

export { noise1, hash, hash2, hash3, rng, prog, polyLength, mixHex };

// butterfly: body along +x, wings flap with phase
export function butterfly(ctx, x, y, s, phase, color, o = {}) {
  const f = 0.35 + 0.65 * Math.abs(Math.sin(phase));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.rot ?? 0);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side * f);
    shape(ctx, P.ellipse(-s * 0.1, -s * 0.42, s * 0.36, s * 0.42, -0.5), { fill: color, line: darker(color, 0.5), lw: 1.6, alpha: o.alpha });
    shape(ctx, P.ellipse(s * 0.22, -s * 0.3, s * 0.24, s * 0.28, 0.4), { fill: mixHex(color, '#FFFFFF', 0.35), line: darker(color, 0.5), lw: 1.4, alpha: o.alpha });
    ctx.restore();
  }
  stroke(ctx, P.line(-s * 0.3, 0, s * 0.35, 0), INK, s * 0.09, { alpha: o.alpha });
  stroke(ctx, P.quad(s * 0.32, 0, s * 0.5, -s * 0.2, s * 0.58, -s * 0.3), INK, 1.4, { alpha: o.alpha });
  ctx.restore();
}

// paint splash blob (soft-edged by a second, lighter ring)
export function splash(ctx, x, y, r, color, seed, o = {}) {
  if (r <= 0) return;
  shape(ctx, P.blob(x, y, r, 18, 0.16, seed, o.phase ?? 0), { fill: color, riso: 0, alpha: o.alpha });
  for (let i = 0; i < 7; i++) {
    const a = hash2(i, seed) * TAU, d = r * (1.05 + 0.3 * hash2(i, seed + 1));
    shape(ctx, P.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.04 + 0.06 * hash2(i, seed + 2))), { fill: color, riso: 0, alpha: o.alpha });
  }
}
