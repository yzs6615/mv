// Effects, all closed-form in time: dust puffs, sparkles, water drops, rain, wind streaks, petals,
// light pillars, god rays, ring waves, screen cracks and the glass shatter.
import { P, RAINBOW, ex } from '../core/pal.js';
import { hash, hash2, hash3, rng, clamp } from '../core/math.js';
import { bayer } from '../core/gfx.js';

// dust puff at (x, y) aged age seconds: a few little clouds drifting out and fading by dither
export function puff(g, x, y, age, o = {}) {
  if (age < 0 || age > 0.45) return;
  const n = o.n || 4, sp = o.spread || 8, col = o.col || P.g1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + Math.PI + (o.seed || 0);
    const d = 2 + age * sp * 3;
    const px = x + Math.cos(a) * d * (i % 2 ? 1 : -1), py = y - 1 - Math.abs(Math.sin(a)) * d * 0.4 - age * 6;
    const r = Math.max(0, 2.2 - age * 4);
    g.disc(px, py, r, col);
  }
}

// four-point sparkle cycling size
export function sparkle(g, x, y, age, col = P.white, size = 3) {
  if (age < 0 || age > 0.6) return;
  const s = Math.round(size * Math.sin((age / 0.6) * Math.PI));
  if (s <= 0) return;
  g.hline(x - s, x + s, y, col);
  g.vline(x, y - s, y + s, col);
  if (s > 1) { g.px(x - 1, y - 1, col); g.px(x + 1, y - 1, col); g.px(x - 1, y + 1, col); g.px(x + 1, y + 1, col); }
}

// a burst of sparkles around a point
export function burst(g, x, y, age, o = {}) {
  if (age < 0 || age > 0.9) return;
  const n = o.n || 8, R = o.r || 18, cols = o.cols || [P.white, P.yellow];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (o.seed || 0);
    const d = R * Math.min(1, age * 3) * (0.6 + 0.4 * hash2(i, o.seed | 0));
    sparkle(g, Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * (o.sy || 1)), age - 0.05 * (i % 3), cols[i % cols.length], 2);
  }
}

// falling water drops from a spout (watering can): drops born every dt, falling under gravity
export function pour(g, x, y, t0, t1, t, o = {}) {
  const dt = o.dt || 0.05, groundY = o.ground ?? y + 30, col = o.col || P.cyan;
  // o.to: aim the stream so it lands at that x (fall time from y = y0 + 40a^2 + 6a)
  const fall = (-6 + Math.sqrt(36 + 160 * Math.max(1, groundY - y))) / 80;
  const vx = o.to !== undefined ? (o.to - x) / fall : o.vx ?? 18;
  for (let tb = Math.max(t0, t - 1); tb <= Math.min(t1, t); tb += dt) {
    const k = Math.round(tb / dt);
    const a = t - tb;
    const px = x + vx * a + (hash(k) - 0.5) * 3;
    const py = y + 40 * a * a + 6 * a;
    if (py < groundY) { g.px(px, py, col); g.px(px, py - 1, P.white); }
    else if (py < groundY + 6) { g.px(px - 1, groundY - 1, col); g.px(px + 1, groundY - 1, col); }
  }
}

// rain: density (drops per 1000 px^2 per screen), wind px/s horizontal, closed form per drop
export function rain(g, t, o = {}) {
  const W = g.W, H = g.H, n = o.n || 220, sp = o.speed || 260, wind = o.wind || 40, len = o.len || 5;
  const col = o.col || P.g1, col2 = o.col2 || P.g2;
  for (let i = 0; i < n; i++) {
    const s = 0.7 + hash2(i, 7) * 0.6;
    const per = (H + 40) / (sp * s);
    const ph = (t / per + hash2(i, 3)) % 1;
    const y = -20 + ph * (H + 40);
    let x = (hash2(i, 5) * (W + 60) - 30 + wind * ph * per) % (W + 60);
    if (x < -30) x += W + 60;
    const dx = Math.round((wind / (sp * s)) * len);
    g.line(x, y, x - dx, y - len, i % 3 ? col : col2);
    if (o.ground && y > o.ground - 4 && y < o.ground + 4) { g.px(x - 2, o.ground - 1, col); g.px(x + 2, o.ground - 1, col); }
  }
}

// wind streaks (pixel gusts)
export function wind(g, t, o = {}) {
  const n = o.n || 12, W = g.W, H = g.H, sp = o.speed || 300, col = o.col || P.g1;
  for (let i = 0; i < n; i++) {
    const per = (W + 120) / sp;
    const ph = (t / per + hash2(i, 41)) % 1;
    const x = -60 + ph * (W + 120) * (o.dir || 1);
    const y = (o.y0 || 0) + hash2(i, 43) * ((o.y1 || H) - (o.y0 || 0));
    const L = 10 + Math.floor(hash2(i, 47) * 20);
    const wob = Math.round(Math.sin(ph * 12 + i) * 2);
    g.hline(x, x + L, y + wob, col);
    g.hline(x + L, x + L + 4, y + wob - 1, col);
  }
}

// falling petals in colours, closed form (sway + fall), with 2-frame flutter
export function petals(g, t, o = {}) {
  const W = g.W, H = g.H, n = o.n || 40, cols = o.cols || RAINBOW;
  for (let i = 0; i < n; i++) {
    const s = 0.6 + hash2(i, 9) * 0.8;
    const per = (H + 30) / (28 * s);
    const ph = (t / per + hash2(i, 11)) % 1;
    const y = -15 + ph * (H + 30);
    const x = (hash2(i, 13) * (W + 40) - 20 + Math.sin(t * 1.5 * s + i) * 10 + (o.drift || 8) * ph * per) % (W + 40);
    const c = cols[i % cols.length];
    const f = Math.floor(t * 6 + i) % 2;
    if (f) { g.rect(x, y, 2, 1, c); g.px(x + 1, y + 1, c); }
    else { g.rect(x, y, 1, 2, c); g.px(x + 1, y, c); }
  }
}

// vertical light pillar (level up): grows, then fades by dither
export function lightPillar(g, x, y, age, o = {}) {
  if (age < 0 || age > 1.6) return;
  const h = (o.h || 120) * Math.min(1, age * 5);
  const w = Math.round((o.w || 14) * (age < 0.3 ? 1 : Math.max(0, 1 - (age - 0.3) / 1.3)));
  if (w <= 0) return;
  const amt = age < 0.8 ? 1 : 1 - (age - 0.8) / 0.8;
  g.drect(x - w, y - h, w * 2 + 1, h, o.col || P.yellow, amt * 0.5);
  g.drect(x - Math.ceil(w / 2), y - h, w + 1, h, P.white, amt);
}

// rays from a point (sunbeam through clouds), dithered wedges
export function godRays(g, x, y, t, o = {}) {
  const n = o.n || 6, len = o.len || 300, amt = o.amt ?? 0.5, col = o.col || P.yellow;
  for (let i = 0; i < n; i++) {
    const a = (o.a0 ?? Math.PI * 0.35) + (i / (n - 1)) * (o.spread ?? Math.PI * 0.3) + Math.sin(t * 0.7 + i) * 0.03;
    const w = 3 + (i % 3) * 3;
    const pts = [[x, y], [x + Math.cos(a - 0.025 * w / 3) * len, y + Math.sin(a - 0.025 * w / 3) * len], [x + Math.cos(a + 0.025 * w / 3) * len, y + Math.sin(a + 0.025 * w / 3) * len]];
    ditherPoly(g, pts, col, amt * (0.6 + 0.4 * Math.sin(t * 2 + i * 1.7)));
  }
}

// dithered polygon: fill with a Bayer pattern of coverage amt
export function ditherPoly(g, pts, col, amt) {
  const c = g.ctx;
  const pat = g.pattern(col, Math.round(clamp(amt) * 16));
  c.save();
  c.fillStyle = pat;
  // integer scanline fill through Gfx.poly but with the pattern as fill
  const saved = c.fillStyle;
  g.poly(pts, saved);
  c.restore();
}

// expanding ring wave(s) in rainbow colours, 2 px thick; r grows with age
export function ringWave(g, cx, cy, age, o = {}) {
  const sp = o.speed || 120, gap = o.gap || 14, n = o.n || 4, cols = o.cols || RAINBOW;
  for (let i = 0; i < n; i++) {
    const r = age * sp - i * gap;
    if (r <= 0 || r > (o.max || 600)) continue;
    g.ring(cx, cy, r, cols[(i + Math.floor(age * 4)) % cols.length], o.th || 2);
  }
}

// screen cracks spreading from impact points: progress 0..1
export function cracks(g, seed, progress, pts, o = {}) {
  const col = o.col || P.white, sh = o.shadow || P.g4;
  pts.forEach(([x, y], k) => {
    const r = rng(seed + k * 101);
    const arms = 5 + r.int(0, 3);
    for (let a = 0; a < arms; a++) {
      let ang = (a / arms) * Math.PI * 2 + r.range(-0.3, 0.3);
      let px = x, py = y;
      const L = (o.len || 160) * r.range(0.5, 1);
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        if ((s + 1) / steps > progress) break;
        const seg = L / steps;
        ang += r.range(-0.35, 0.35);
        const nx = px + Math.cos(ang) * seg, ny = py + Math.sin(ang) * seg;
        g.line(px + 1, py + 1, nx + 1, ny + 1, sh);
        g.line(px, py, nx, ny, col);
        if (r() < 0.3) {
          const ba = ang + r.range(0.6, 1.2) * (r() < 0.5 ? 1 : -1);
          g.line(nx, ny, nx + Math.cos(ba) * seg * 0.6, ny + Math.sin(ba) * seg * 0.6, col);
        }
        px = nx; py = ny;
      }
    }
    // impact star
    if (progress > 0) { g.disc(x, y, 2, col); }
  });
}

// glass shatter: the source canvas is cut into triangular shards that fall and spin away.
// age: seconds since the hit. Shards are clipped with integer polygons (no anti-aliasing).
export function shatter(g, src, age, seed = 1, o = {}) {
  const W = g.W, H = g.H;
  const cx = o.x ?? W / 2, cy = o.y ?? H / 2;
  const r = rng(seed);
  // radial fan of shards around the impact
  const rings = [0, 40, 95, 170, 300];
  const shards = [];
  const spokes = 14;
  const angs = Array.from({ length: spokes }, (_, i) => (i / spokes) * Math.PI * 2 + r.range(-0.12, 0.12));
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < spokes; i++) {
      const a0 = angs[i], a1 = angs[(i + 1) % spokes] + (i + 1 === spokes ? Math.PI * 2 : 0);
      const r0 = rings[k] * (k ? r.range(0.85, 1.15) : 1), r1 = rings[k + 1] * r.range(0.9, 1.1);
      const pts = [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0], [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1], [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0]];
      shards.push({ pts, mx: cx + Math.cos((a0 + a1) / 2) * (r0 + r1) / 2, my: cy + Math.sin((a0 + a1) / 2) * (r0 + r1) / 2, k, i });
    }
  }
  const c = g.ctx;
  for (const s of shards) {
    const d = Math.hypot(s.mx - cx, s.my - cy) + 1;
    const delay = d / 900;
    const a = Math.max(0, age - delay);
    const vx = ((s.mx - cx) / d) * (60 + hash2(s.k, s.i) * 120), vy = ((s.my - cy) / d) * 60 - 40 * hash2(s.i, s.k);
    const dx = vx * a, dy = vy * a + 260 * a * a;
    const rot = (hash2(s.i, s.k + 9) - 0.5) * 4 * a;
    c.save();
    c.translate(Math.round(s.mx + dx), Math.round(s.my + dy));
    c.rotate(Math.round(rot * 8) / 8);
    c.beginPath();
    s.pts.forEach(([x, y], j) => (j ? c.lineTo(x - s.mx, y - s.my) : c.moveTo(x - s.mx, y - s.my)));
    c.closePath();
    c.clip();
    c.drawImage(src, -s.mx, -s.my);
    // bright edge
    c.strokeStyle = a > 0 ? P.white : P.g1;
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }
}

// shake offset: decaying jitter after an impact at t0
export function shakeAt(t, t0, amp = 4, dur = 0.5) {
  const a = t - t0;
  if (a < 0 || a > dur) return [0, 0];
  const k = amp * (1 - a / dur);
  return [Math.round((hash(Math.floor(t * 60)) - 0.5) * 2 * k), Math.round((hash(Math.floor(t * 60) + 999) - 0.5) * 2 * k)];
}

// dithered disc (soft glow) of coverage amt at the centre falling to 0 at r
export function glow(g, cx, cy, r, col, amt = 1) {
  for (let i = 4; i >= 1; i--) {
    const rr = (r * i) / 4;
    g.ctx.fillStyle = g.pattern(col, Math.round(clamp(amt * (1 - (i - 1) / 4)) * 16));
    // spans
    const R = Math.round, x0 = R(cx), y0 = R(cy);
    for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
      g.ctx.fillRect(x0 - w + g.ox, y0 + dy + g.oy, 2 * w + 1, 1);
    }
  }
}

// black outside a disc of radius r (pixel spans)
export function iris(g, cx, cy, r) {
  const c = g.ctx;
  c.fillStyle = P.ink;
  if (r <= 0.5) { c.fillRect(0, 0, g.W, g.H); return; }
  for (let y = 0; y < g.H; y++) {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) >= r) { c.fillRect(0, y, g.W, 1); continue; }
    const w = Math.sqrt(r * r - dy * dy);
    const a = Math.round(cx - w), b = Math.round(cx + w);
    if (a > 0) c.fillRect(0, y, a, 1);
    if (b < g.W) c.fillRect(b, y, g.W - b, 1);
  }
}

export { bayer, hash3, ex };
