// Generative flowers. A flower is fully determined by its seed number: type, petal count and shape,
// layers, colours, heart pattern, tilt. No two seeds give the same flower, which is the film's
// central rule ("世界上唯一的花").
import { rng, TAU, clamp, E, lerp, rgb, css, smoothstep } from '../core/math.js';
import { shape, stroke, P, INK, localScale, deviceScale } from '../core/draw.js';
import { env } from '../core/env.js';
import { C, SCHEMES, SCHEME_WEIGHTS, PIP_SCHEME } from './palette.js';

const TYPES = [['daisy', 3], ['cosmos', 2.6], ['poppy', 2], ['camellia', 2], ['star', 1.3], ['sunflower', 1.3],
  ['anemone', 2], ['dahlia', 1.6], ['lotus', 1.1], ['sakura', 1.8]];

export function mixHex(a, b, t) {
  const p = rgb(a), q = rgb(b);
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + h(lerp(p[0], q[0], t)) + h(lerp(p[1], q[1], t)) + h(lerp(p[2], q[2], t));
}
export const darker = (hex, t = 0.45) => mixHex(hex, INK, t);

// petal outline along +x, unit length; half-width profile with a tip treatment
function petalPts(wid, tip, um, seed) {
  const top = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let w;
    if (u <= um) w = 0.16 + 0.84 * Math.sin((Math.PI / 2) * (u / um));
    else {
      const s = (u - um) / (1 - um);
      if (tip === 'point') w = Math.pow(1 - s, 0.9);
      else if (tip === 'notch' || tip === 'heart') w = Math.sqrt(Math.max(0, 1 - s * s * 0.55));
      else w = Math.sqrt(Math.max(0, 1 - s * s));
    }
    if (tip === 'wave') w *= 1 + 0.07 * Math.sin(u * 17 + seed);
    top.push([u, -w * wid]);
  }
  let tipPts;
  const we = -top[N][1];
  if (tip === 'notch') {
    top.pop();
    tipPts = [[0.985, -we * 0.95], [0.93, -we * 0.45], [1.0, -we * 0.12], [1.0, we * 0.12], [0.93, we * 0.45], [0.985, we * 0.95]];
  } else if (tip === 'heart') {
    top.pop();
    tipPts = [[0.99, -we * 0.75], [0.97, -we * 0.25], [0.88, 0], [0.97, we * 0.25], [0.99, we * 0.75]];
  } else {
    top.pop();
    tipPts = [[1, 0]];
  }
  const bottom = top.slice(1).reverse().map(([x, y]) => [x, -y]);
  return [...top, ...tipPts, ...bottom];
}

export const SEEDS = new Set();
export function flowerSpec(seed, o = {}) {
  SEEDS.add(seed);
  const r = rng(((seed + 1) * 2654435761) >>> 0);
  const type = o.type ?? r.weighted(TYPES);
  const scheme = o.scheme ?? SCHEMES[r.weighted(SCHEMES.map((s, i) => [i, SCHEME_WEIGHTS[i]]))];
  const [pc, ic, cc, ac] = scheme;
  const layers = [];
  let center = { r: 0.28, style: 'dots', color: cc, accent: ac };
  const add = (n, len, wid, tip, um, off, color, inner, overlap) =>
    layers.push({ n, len, wid, tip, off, color, inner, overlap, pts: petalPts(wid, tip, um, seed % 97) });
  switch (type) {
    case 'daisy': {
      const n = r.int(13, 21), w = r.range(0.12, 0.16);
      if (r.chance(0.45)) add(n, 0.92, w * 0.9, 'round', 0.6, 0.5, mixHex(pc, ic, 0.55), ic, false);
      add(n, 1, w, 'round', 0.62, 0, pc, ic, false);
      center = { r: r.range(0.25, 0.32), style: 'dots', color: cc, accent: ac };
      break;
    }
    case 'cosmos': {
      add(8, 1, r.range(0.3, 0.36), 'notch', 0.7, 0, pc, ic, true);
      center = { r: 0.19, style: 'stamens', color: cc, accent: ac };
      break;
    }
    case 'poppy': {
      const n = r.int(4, 5);
      add(n, 1, r.range(0.66, 0.78), 'wave', 0.66, 0, pc, ic, true);
      center = { r: 0.22, style: 'stamens', color: INK, accent: cc };
      break;
    }
    case 'camellia': {
      const n = r.int(5, 6);
      add(n, 1, 0.5, 'round', 0.62, 0, pc, ic, true);
      add(n, 0.74, 0.5, 'round', 0.6, 0.5, mixHex(pc, ic, 0.3), ic, true);
      add(n, 0.48, 0.5, 'round', 0.6, 0.0, mixHex(pc, ic, 0.6), ic, true);
      center = { r: 0.15, style: 'plain', color: cc, accent: ac };
      break;
    }
    case 'star': {
      add(5, 1, r.range(0.34, 0.42), 'point', 0.4, 0, pc, ic, true);
      center = { r: 0.24, style: 'star', color: cc, accent: ac };
      break;
    }
    case 'sunflower': {
      const n = r.int(16, 22);
      add(n, 1, 0.15, 'point', 0.45, 0.5, mixHex(pc, INK, 0.12), ic, false);
      add(n, 0.94, 0.15, 'point', 0.45, 0, pc, ic, false);
      center = { r: r.range(0.38, 0.44), style: 'seeds', color: C.soil, accent: C.soilPale };
      break;
    }
    case 'anemone': {
      add(6, 1, r.range(0.45, 0.52), 'round', 0.58, 0, pc, ic, true);
      center = { r: 0.27, style: 'ring', color: INK, accent: ac === INK ? C.lemon : ac };
      break;
    }
    case 'dahlia': {
      const n = r.int(10, 13);
      add(n, 1, 0.24, 'point', 0.55, 0, pc, ic, true);
      add(n, 0.78, 0.25, 'point', 0.55, 0.5, mixHex(pc, ic, 0.35), ic, true);
      add(n - 2, 0.54, 0.27, 'point', 0.55, 0.25, mixHex(pc, ic, 0.65), ic, true);
      center = { r: 0.12, style: 'plain', color: cc, accent: ac };
      break;
    }
    case 'lotus': {
      add(8, 1, 0.36, 'point', 0.5, 0.5, mixHex(pc, ic, 0.15), ic, true);
      add(8, 0.82, 0.38, 'point', 0.5, 0, pc, ic, true);
      center = { r: 0.24, style: 'ring', color: cc, accent: ac };
      break;
    }
    case 'sakura': {
      add(5, 1, r.range(0.48, 0.55), 'heart', 0.62, 0, pc, ic, true);
      center = { r: 0.17, style: 'stamens', color: cc, accent: ac };
      break;
    }
  }
  return {
    seed, type, scheme, layers, center,
    rot: r() * TAU,
    tiltAxis: r() * TAU,
    tilt: o.tilt ?? r.range(0.72, 1),
    sway: r.range(0.6, 1.4),
    phase: r() * TAU,
    stemBend: r.range(-1, 1),
    leaves: r.int(1, 3),
    leafSeed: r.int(0, 1e6),
  };
}

export function pipSpec() {
  const F = flowerSpec(5, { type: 'cosmos', scheme: PIP_SCHEME, tilt: 1 });
  F.layers = [];
  F.layers.push({ n: 8, len: 1, wid: 0.33, tip: 'round', off: 0.5, color: '#FF8B78', inner: '#FFD0C2', overlap: true, pts: petalPts(0.33, 'round', 0.62, 3) });
  F.layers.push({ n: 8, len: 0.86, wid: 0.36, tip: 'heart', off: 0, color: '#FF6B5B', inner: '#FFB39F', overlap: true, pts: petalPts(0.36, 'heart', 0.64, 3) });
  F.center = { r: 0.25, style: 'star', color: '#FFB627', accent: '#FFF3C4' };
  F.rot = -Math.PI / 2;
  F.isPip = true;
  return F;
}

// ---------- drawing ----------

function addPetal(c, pts, ang, len, wid = 1) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] * len, y = pts[i][1] * len * wid;
    const X = x * ca - y * sa, Y = x * sa + y * ca;
    i ? c.lineTo(X, Y) : c.moveTo(X, Y);
  }
  c.closePath();
}
// smooth closed petal (Catmull-Rom) for big on-screen sizes
function addPetalSmooth(c, pts, ang, len, wid = 1) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const n = pts.length;
  const T = (i) => {
    const p = pts[(i + n) % n];
    const x = p[0] * len, y = p[1] * len * wid;
    return [x * ca - y * sa, x * sa + y * ca];
  };
  const p0 = T(0);
  c.moveTo(p0[0], p0[1]);
  for (let i = 0; i < n; i++) {
    const a = T(i - 1), b = T(i), d = T(i + 1), e = T(i + 2);
    c.bezierCurveTo(b[0] + (d[0] - a[0]) / 6, b[1] + (d[1] - a[1]) / 6, d[0] - (e[0] - b[0]) / 6, d[1] - (e[1] - b[1]) / 6, d[0], d[1]);
  }
  c.closePath();
}

// per-petal bloom: outer layers first, spiralling round the head
function petalOpen(open, li, k, n, nl) {
  const d = (li / Math.max(1, nl)) * 0.22 + (k / n) * 0.2;
  return clamp((open - d) / 0.58);
}

// x, y: head centre; R: radius in local units. st: open, spin, alpha, face, sat, light, shadow, lineAlpha
export function drawHead(ctx, F, x, y, R, st = {}) {
  const open = st.open ?? 1;
  if (open <= 0 || R <= 0) return;
  const sR = R * localScale(ctx);
  const tilt = st.tilt ?? F.tilt;
  ctx.save();
  ctx.translate(x, y);
  if (st.rot) ctx.rotate(st.rot);
  if (tilt < 0.999) { ctx.rotate(F.tiltAxis); ctx.scale(1, tilt); ctx.rotate(-F.tiltAxis); }
  const spin = F.rot + (st.spin ?? 0) + (1 - E.outC(clamp(open))) * -0.9;
  const nl = F.layers.length;
  const line = st.line;
  const tint = st.tint;
  const col = (h) => (tint ? mixHex(h, tint[0], tint[1]) : h);

  if (sR < 5) {
    // speck: a dot of petal colour and its heart
    shape(ctx, P.circle(0, 0, R * 0.85 * open), { fill: col(F.layers[nl - 1].color), riso: 0, alpha: st.alpha });
    shape(ctx, P.circle(0, 0, R * F.center.r), { fill: col(F.center.color), riso: 0, alpha: st.alpha });
    ctx.restore();
    return;
  }
  const detail = sR > 22;
  const big = sR > 70;
  if (st.shadow && detail) {
    // one soft paper-cut shadow for the whole head
    ctx.save();
    ctx.translate(R * 0.06, R * 0.09);
    ctx.globalAlpha *= (st.alpha ?? 1) * 0.16;
    ctx.fillStyle = INK;
    ctx.beginPath();
    const L0 = F.layers[0];
    for (let k = 0; k < L0.n; k++) addPetal(ctx, L0.pts, spin + ((k + L0.off) * TAU) / L0.n, R * L0.len * E.outBack(petalOpen(open, 0, k, L0.n, nl)));
    ctx.fill();
    ctx.restore();
  }
  for (let li = 0; li < nl; li++) {
    const L = F.layers[li];
    const pc = col(L.color), ic = col(L.inner);
    const lc = line ?? darker(L.color, 0.55);
    const lw = Math.max(1.1, R * 0.028);
    if (!L.overlap || !detail) {
      // batched: all petals of the layer in one fill and one stroke
      const path = (c) => {
        c.beginPath();
        for (let k = 0; k < L.n; k++) {
          const o = petalOpen(open, li, k, L.n, nl);
          if (o <= 0) continue;
          addPetal(c, L.pts, spin + ((k + L.off) * TAU) / L.n + (1 - o) * 0.5, R * L.len * E.outBack(o, 1.3));
        }
      };
      shape(ctx, path, { fill: pc, line: lc, lw, riso: detail ? 1 : 0, alpha: st.alpha, minLw: 0.5 });
      if (detail) {
        const inner = (c) => {
          c.beginPath();
          for (let k = 0; k < L.n; k++) {
            const o = petalOpen(open, li, k, L.n, nl);
            if (o <= 0) continue;
            addPetal(c, L.pts, spin + ((k + L.off) * TAU) / L.n + (1 - o) * 0.5, R * L.len * 0.42 * E.outBack(o, 1.3), 1.15);
          }
        };
        shape(ctx, inner, { fill: ic, riso: 1, alpha: (st.alpha ?? 1) * 0.9 });
      }
    } else {
      for (let k = 0; k < L.n; k++) {
        const o = petalOpen(open, li, k, L.n, nl);
        if (o <= 0) continue;
        const ang = spin + ((k + L.off) * TAU) / L.n + (1 - o) * 0.5;
        const len = R * L.len * E.outBack(o, 1.3);
        const add = big ? addPetalSmooth : addPetal;
        shape(ctx, (c) => { c.beginPath(); add(c, L.pts, ang, len); }, { fill: pc, riso: 1, alpha: st.alpha });
        shape(ctx, (c) => { c.beginPath(); add(c, L.pts, ang, len * 0.5, 1.12); }, { fill: ic, riso: 1, alpha: (st.alpha ?? 1) * 0.85 });
        if (big) {
          const ca = Math.cos(ang), sa = Math.sin(ang);
          stroke(ctx, (c) => { c.beginPath(); c.moveTo(ca * len * 0.12, sa * len * 0.12); c.quadraticCurveTo(ca * len * 0.4 - sa * len * 0.03, sa * len * 0.4 + ca * len * 0.03, ca * len * 0.62, sa * len * 0.62); },
            lc, lw * 0.6, { alpha: (st.alpha ?? 1) * 0.45 });
        }
        shape(ctx, (c) => { c.beginPath(); add(c, L.pts, ang, len); }, { line: lc, lw, alpha: st.alpha, minLw: 0.5 });
      }
    }
  }
  drawCenter(ctx, F, R, st, open, col, detail, big);
  ctx.restore();
}

function drawCenter(ctx, F, R, st, open, col, detail, big) {
  const c = F.center;
  const co = E.outBack(clamp(open * 1.6 - 0.1), 1.6);
  if (co <= 0) return;
  const cr = R * c.r * co;
  const fill = col(c.color), acc = col(c.accent);
  const lc = st.line ?? darker(c.color === INK ? '#555A78' : c.color, 0.5);
  if (c.style === 'star') {
    shape(ctx, P.circle(0, 0, cr), { fill, line: lc, lw: Math.max(1, R * 0.026), alpha: st.alpha });
    if (!st.face) shape(ctx, P.star(0, 0, cr * 0.62, cr * 0.28, 5), { fill: acc, riso: 0.6, alpha: st.alpha });
  } else {
    shape(ctx, P.circle(0, 0, cr), { fill, line: lc, lw: Math.max(1, R * 0.026), alpha: st.alpha });
    if (detail && !st.face) {
      ctx.save();
      if (st.alpha !== undefined) ctx.globalAlpha *= st.alpha;
      ctx.fillStyle = acc;
      if (c.style === 'dots' || c.style === 'seeds') {
        const n = big ? (c.style === 'seeds' ? 90 : 34) : 14;
        ctx.beginPath();
        for (let i = 1; i <= n; i++) {
          const a = i * 2.39996, rr = cr * 0.86 * Math.sqrt(i / n);
          const dr = cr * (c.style === 'seeds' ? 0.05 : 0.07);
          ctx.moveTo(Math.cos(a) * rr + dr, Math.sin(a) * rr);
          ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, dr, 0, TAU);
        }
        ctx.fill();
      } else if (c.style === 'stamens') {
        const n = 12;
        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(0.8 / localScale(ctx), cr * 0.08);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + 0.3;
          ctx.moveTo(Math.cos(a) * cr * 0.35, Math.sin(a) * cr * 0.35);
          ctx.lineTo(Math.cos(a) * cr * 1.25, Math.sin(a) * cr * 1.25);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + 0.3;
          ctx.moveTo(Math.cos(a) * cr * 1.3 + cr * 0.11, Math.sin(a) * cr * 1.3);
          ctx.arc(Math.cos(a) * cr * 1.3, Math.sin(a) * cr * 1.3, cr * 0.11, 0, TAU);
        }
        ctx.fill();
      } else if (c.style === 'ring') {
        ctx.beginPath();
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          ctx.moveTo(Math.cos(a) * cr * 0.72 + cr * 0.1, Math.sin(a) * cr * 0.72);
          ctx.arc(Math.cos(a) * cr * 0.72, Math.sin(a) * cr * 0.72, cr * 0.1, 0, TAU);
        }
        ctx.fill();
      } else if (c.style === 'plain') {
        ctx.globalAlpha *= 0.7;
        ctx.beginPath();
        ctx.arc(-cr * 0.25, -cr * 0.28, cr * 0.32, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  if (st.face) drawFace(ctx, cr, { ...st.face, light: c.color === INK || st.face.light }, st.alpha);
}

// face on a flower heart or a seed. f: { mood: 'smile'|'happy'|'laugh'|'worried'|'wow'|'calm'|'sleep', blink: 0..1, look: [dx, dy] }
export function drawFace(ctx, cr, f, alpha = 1) {
  const look = f.look ?? [0, 0];
  const ex = cr * 0.36, ey = -cr * 0.05;
  const lx = look[0] * cr * 0.12, ly = look[1] * cr * 0.1;
  const mood = f.mood ?? 'smile';
  const er = cr * 0.12;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha *= alpha;
  // blush
  if (f.blush !== 0) {
    ctx.fillStyle = 'rgba(255,128,120,0.55)';
    ctx.beginPath();
    ctx.ellipse(-cr * 0.6 + lx, cr * 0.2 + ly, cr * 0.17, cr * 0.1, 0, 0, TAU);
    ctx.ellipse(cr * 0.6 + lx, cr * 0.2 + ly, cr * 0.17, cr * 0.1, 0, 0, TAU);
    ctx.fill();
  }
  const FC = f.light ? '#FFF8EE' : INK;
  ctx.fillStyle = FC;
  ctx.strokeStyle = FC;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(cr * 0.075, 0.9 / localScale(ctx));
  const blink = f.blink ?? 0;
  if (mood === 'happy' || mood === 'laugh' || mood === 'sleep') {
    ctx.beginPath();
    for (const s of [-1, 1]) {
      const cx = s * ex + lx, cy = ey + ly;
      if (mood === 'sleep') { ctx.moveTo(cx - er * 1.1, cy); ctx.quadraticCurveTo(cx, cy + er * 0.9, cx + er * 1.1, cy); }
      else { ctx.moveTo(cx - er * 1.1, cy + er * 0.4); ctx.quadraticCurveTo(cx, cy - er * 1.3, cx + er * 1.1, cy + er * 0.4); }
    }
    ctx.stroke();
  } else {
    const ry = er * (mood === 'wow' ? 1.35 : 1.15) * (1 - 0.9 * blink);
    const rx = er * (mood === 'wow' ? 1.1 : 0.95);
    ctx.beginPath();
    ctx.ellipse(-ex + lx, ey + ly, rx, Math.max(ry, er * 0.12), 0, 0, TAU);
    ctx.ellipse(ex + lx, ey + ly, rx, Math.max(ry, er * 0.12), 0, 0, TAU);
    ctx.fill();
    if (blink < 0.5) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-ex + lx + rx * 0.35, ey + ly - ry * 0.4, er * 0.32, 0, TAU);
      ctx.arc(ex + lx + rx * 0.35, ey + ly - ry * 0.4, er * 0.32, 0, TAU);
      ctx.fill();
      ctx.fillStyle = FC;
    }
    if (mood === 'worried') {
      ctx.beginPath();
      ctx.moveTo(-ex - er * 1.2 + lx, ey - er * 1.9 + ly); ctx.lineTo(-ex + er * 0.9 + lx, ey - er * 2.5 + ly);
      ctx.moveTo(ex + er * 1.2 + lx, ey - er * 1.9 + ly); ctx.lineTo(ex - er * 0.9 + lx, ey - er * 2.5 + ly);
      ctx.stroke();
    }
  }
  // mouth
  const my = cr * 0.3 + ly, mx = lx;
  ctx.beginPath();
  if (mood === 'laugh') {
    ctx.moveTo(mx - cr * 0.24, my - cr * 0.04);
    ctx.quadraticCurveTo(mx, my + cr * 0.42, mx + cr * 0.24, my - cr * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FF8F7A';
    ctx.beginPath();
    ctx.ellipse(mx, my + cr * 0.14, cr * 0.1, cr * 0.06, 0, 0, TAU);
    ctx.fill();
  } else if (mood === 'wow') {
    ctx.ellipse(mx, my + cr * 0.04, cr * 0.09, cr * 0.12, 0, 0, TAU);
    ctx.fill();
  } else if (mood === 'worried') {
    ctx.moveTo(mx - cr * 0.15, my + cr * 0.1);
    ctx.quadraticCurveTo(mx, my - cr * 0.04, mx + cr * 0.15, my + cr * 0.1);
    ctx.stroke();
  } else if (mood === 'calm' || mood === 'sleep') {
    ctx.moveTo(mx - cr * 0.1, my + cr * 0.02);
    ctx.quadraticCurveTo(mx, my + cr * 0.1, mx + cr * 0.1, my + cr * 0.02);
    ctx.stroke();
  } else {
    const w = cr * (mood === 'happy' ? 0.2 : 0.17);
    ctx.moveTo(mx - w, my - cr * 0.02);
    ctx.quadraticCurveTo(mx, my + cr * (mood === 'happy' ? 0.26 : 0.18), mx + w, my - cr * 0.02);
    ctx.stroke();
  }
  ctx.restore();
}

// bud on the end of a stem, pointing up; b: 0 closed .. 1 about to open
export function drawBud(ctx, F, x, y, R, b = 0.5, st = {}) {
  const pc = F.layers[F.layers.length - 1].color;
  ctx.save();
  ctx.translate(x, y);
  if (st.rot) ctx.rotate(st.rot);
  const h = R * (0.9 + 0.5 * b), w = R * (0.55 + 0.45 * b);
  shape(ctx, P.drop(0, -h * 0.35, w, h), { fill: pc, line: darker(pc, 0.5), lw: Math.max(1, R * 0.05), alpha: st.alpha });
  // sepals
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.rotate(s * (0.5 + 0.35 * b) - Math.PI / 2);
    shape(ctx, P.leaf(R * 0.75, R * 0.2, -s * 0.3), { fill: C.leaf, line: C.leafDark, lw: Math.max(1, R * 0.04), alpha: st.alpha });
    ctx.restore();
  }
  ctx.restore();
}

// stem from (x, y) (ground) up to the head; returns head position. sway in radians at the tip.
export function stemPath(x, y, h, bend, sway) {
  const tx = x + Math.sin(sway) * h * 0.9 + bend * h * 0.12, ty = y - Math.cos(sway) * h;
  const cx = x + bend * h * 0.28 + Math.sin(sway) * h * 0.25, cy = y - h * 0.55;
  return { tx, ty, cx, cy };
}

export function drawStem(ctx, x, y, s, lw, st = {}) {
  const path = (c) => { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(s.cx, s.cy, s.tx, s.ty); };
  const col = st.color ?? C.stem;
  stroke(ctx, path, darker(col, 0.5), lw + 2.2, { alpha: st.alpha, minLw: 1 });
  stroke(ctx, path, col, lw, { alpha: st.alpha, minLw: 0.6 });
}

export function drawLeafAt(ctx, x, y, ang, len, wid, st = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const g = st.grow ?? 1;
  if (g <= 0) { ctx.restore(); return; }
  ctx.scale(g, g);
  const fill = st.color ?? C.leaf;
  shape(ctx, P.leaf(len, wid, st.bend ?? 0.3), { fill, line: darker(fill, 0.5), lw: st.lw ?? 2, alpha: st.alpha });
  stroke(ctx, (c) => { c.beginPath(); c.moveTo(len * 0.08, 0); c.quadraticCurveTo(len * 0.5, (st.bend ?? 0.3) * len * 0.18, len * 0.85, (st.bend ?? 0.3) * len * 0.36); },
    darker(fill, 0.35), (st.lw ?? 2) * 0.7, { alpha: (st.alpha ?? 1) * 0.6 });
  ctx.restore();
}

// whole plant: stem, leaves, head. o: { open, sway, face, leafGrow, shadow, alpha, R }
export function drawPlant(ctx, F, x, y, h, R, o = {}) {
  const sway = o.sway ?? 0;
  const s = stemPath(x, y, h, F.stemBend * (o.bendScale ?? 1), sway);
  const lw = o.stemW ?? Math.max(2, R * 0.12);
  if (h > 1) {
    drawStem(ctx, x, y, s, lw, o);
    const r = rng(F.leafSeed);
    for (let i = 0; i < F.leaves; i++) {
      const u = 0.25 + 0.45 * (i / Math.max(1, F.leaves - 1)) * (F.leaves > 1 ? 1 : 0) + r.range(-0.05, 0.05);
      const px = (1 - u) * (1 - u) * x + 2 * (1 - u) * u * s.cx + u * u * s.tx;
      const py = (1 - u) * (1 - u) * y + 2 * (1 - u) * u * s.cy + u * u * s.ty;
      const side = i % 2 ? 1 : -1;
      const ang = -Math.PI / 2 + side * r.range(0.75, 1.15) + sway * 0.5;
      drawLeafAt(ctx, px, py, ang, R * r.range(0.8, 1.15), R * 0.22, { grow: o.leafGrow ?? 1, alpha: o.alpha, bend: side * 0.35, lw: Math.max(1.2, R * 0.03) });
    }
  }
  if (o.bud !== undefined && o.bud < 1 && (o.open ?? 0) <= 0) drawBud(ctx, F, s.tx, s.ty, R * 0.5, o.bud, { rot: sway, alpha: o.alpha });
  else drawHead(ctx, F, s.tx, s.ty, R, { ...o, rot: (o.rot ?? 0) + sway * 0.4 });
  return s;
}

export function flowerStemColor() { return C.stem; }
export { smoothstep, css };

// Sprite cache for static, fully open heads (fields of hundreds of flowers): each head is drawn once
// per size bucket into its own small canvas and blitted afterwards.
const SPRITES = new Map();
export function drawHeadCached(ctx, F, x, y, R, st = {}) {
  if (st.face || (st.open ?? 1) < 1 || st.rot || st.spin) return drawHead(ctx, F, x, y, R, st);
  const sR = R * localScale(ctx) * deviceScale();
  if (sR < 5 || sR > 300) return drawHead(ctx, F, x, y, R, st);
  const bucket = Math.max(8, Math.pow(2, Math.ceil(Math.log2(sR))));
  const tilt = st.tilt ?? F.tilt;
  const key = `${F.seed}|${bucket}|${tilt.toFixed(2)}|${st.tint ? st.tint.join() : ''}|${st.shadow ? 1 : 0}`;
  let spr = SPRITES.get(key);
  if (!spr) {
    const S = Math.ceil(bucket * 2.5) + 6;
    const c = env.createCanvas(S, S);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawHead(g, F, S / 2, S / 2, bucket, { ...st, open: 1, alpha: 1 });
    spr = { c, S, bucket };
    SPRITES.set(key, spr);
  }
  const k = R / spr.bucket;
  const a = st.alpha ?? 1;
  if (a <= 0.003) return;
  const prev = ctx.globalAlpha;
  if (a < 1) ctx.globalAlpha = prev * a;
  ctx.drawImage(spr.c, x - (spr.S / 2) * k, y - (spr.S / 2) * k, spr.S * k, spr.S * k);
  ctx.globalAlpha = prev;
}
