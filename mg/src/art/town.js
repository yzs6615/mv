// Paper-cut town: pastel houses that pop up like a pop-up book, street furniture, the corner
// flower shop.
import { clamp, E, TAU, lerp, rng, hash2, spring } from '../core/math.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawLine, makeLine } from '../core/text.js';
import { C } from './palette.js';
import { darker, mixHex, flowerSpec, drawHead, drawPlant } from './flower.js';

const FACADES = ['#F7C9B6', '#FBE3B0', '#CFE6D8', '#D8D3F0', '#F6D5DF', '#CDE3F2', '#F3E1C7', '#E4EFC9'];
const ROOFS = ['#E0705E', '#5E6A9A', '#C9785A', '#4E8C7A', '#B85C78', '#7A6AA8'];

export function makeHouses(x0, x1, seed = 3) {
  const r = rng(seed);
  const out = [];
  let x = x0;
  while (x < x1) {
    const w = r.range(230, 380), h = r.range(300, 560);
    out.push({
      x: x + w / 2, w, h, facade: r.pick(FACADES), roof: r.pick(ROOFS), roofType: r.pick(['gable', 'gable', 'flat', 'step', 'round']),
      cols: Math.max(2, Math.round(w / 95)), rows: Math.max(2, Math.round((h - 120) / 110)), door: r.chance(0.7), doorPos: r.range(-0.25, 0.25),
      seed: r.int(0, 1e6), boxes: r.chance(0.5), chimney: r.chance(0.4), awning: r.chance(0.25),
    });
    x += w + r.range(6, 40);
  }
  return out;
}

// house standing on ground line gy; pop 0..1 unfolds it upwards (pop-up book)
export function drawHouse(ctx, Hs, gy, pop, t, o = {}) {
  if (pop <= 0) return;
  const k = spring(pop * 0.9, 1.4, 6.5);
  const { x, w, h } = Hs;
  ctx.save();
  ctx.translate(x, gy);
  // hinge at the ground: scale y with a slight lean as it rises
  ctx.transform(1, 0, (1 - Math.min(1, k)) * 0.25, 1, 0, 0);
  ctx.scale(1, Math.max(0.001, k));
  const L = -w / 2, T = -h;
  const line = darker(Hs.facade, 0.6);
  shape(ctx, P.rect(L, T, w, h), { fill: Hs.facade, line, lw: 2.4, shadow: { dx: 7, dy: 0, color: 'rgba(42,46,69,0.12)' }, alpha: o.alpha });
  // roof
  const rh = 70;
  let roof;
  if (Hs.roofType === 'gable') roof = P.poly([[L - 14, T + 2], [0, T - rh - 30], [-L + 14, T + 2]]);
  else if (Hs.roofType === 'flat') roof = P.rect(L - 10, T - 24, w + 20, 26);
  else if (Hs.roofType === 'step') roof = P.poly([[L - 8, T + 2], [L - 8, T - 30], [L + w * 0.3, T - 30], [L + w * 0.3, T - 60], [-L - w * 0.3, T - 60], [-L - w * 0.3, T - 30], [-L + 8, T - 30], [-L + 8, T + 2]]);
  else roof = (c) => { c.beginPath(); c.moveTo(L - 8, T + 2); c.quadraticCurveTo(0, T - rh * 1.6, -L + 8, T + 2); c.closePath(); };
  if (Hs.chimney && Hs.roofType === 'gable') shape(ctx, P.rect(w * 0.18, T - rh * 0.95, 30, 60), { fill: Hs.roof, line: darker(Hs.roof, 0.5), lw: 2.2, alpha: o.alpha });
  shape(ctx, roof, { fill: Hs.roof, line: darker(Hs.roof, 0.5), lw: 2.4, alpha: o.alpha });
  // windows (light up in a beat-synced pattern when o.lit > 0)
  const ww = Math.min(52, (w - 40) / Hs.cols - 26), wh = 62;
  for (let j = 0; j < Hs.rows; j++) {
    for (let i = 0; i < Hs.cols; i++) {
      const cx = L + (w / Hs.cols) * (i + 0.5), cy = T + 70 + j * 105;
      if (cy + wh > -40) continue;
      const lit = (o.lit ?? 0) > 0 && hash2(i + j * 7, Hs.seed) < (o.lit ?? 0);
      const wc = lit ? C.light : '#FFFDF6';
      shape(ctx, P.rrect(cx - ww / 2, cy, ww, wh, ww * 0.5 * (Hs.roofType === 'round' ? 1 : 0.12)), { fill: wc, line, lw: 2, alpha: o.alpha });
      stroke(ctx, P.line(cx, cy + 4, cx, cy + wh - 2), line, 1.4, { alpha: (o.alpha ?? 1) * 0.6 });
      if (Hs.boxes && j === Hs.rows - 1) {
        shape(ctx, P.rect(cx - ww / 2 - 4, cy + wh - 2, ww + 8, 14), { fill: C.soilLight, line: darker(C.soilLight, 0.5), lw: 1.8, alpha: o.alpha });
        for (let q = 0; q < 3; q++) shape(ctx, P.circle(cx - ww / 2 + 6 + q * (ww / 2 - 2), cy + wh - 6, 7), { fill: [C.coral, C.pink, C.marigold][(q + i) % 3], line: INK, lw: 1.2, alpha: o.alpha });
      }
    }
  }
  if (Hs.door) {
    const dx = Hs.doorPos * w;
    shape(ctx, (c) => { c.beginPath(); c.moveTo(dx - 30, 0); c.lineTo(dx - 30, -80); c.arc(dx, -80, 30, Math.PI, 0); c.lineTo(dx + 30, 0); c.closePath(); }, { fill: darker(Hs.roof, 0.1), line: darker(Hs.roof, 0.55), lw: 2.2, alpha: o.alpha });
    shape(ctx, P.circle(dx + 16, -48, 3.5), { fill: C.gold, riso: 0, alpha: o.alpha });
  }
  if (Hs.awning) {
    const aw = w * 0.7;
    for (let i = 0; i < 6; i++) {
      shape(ctx, P.rect(-aw / 2 + (aw / 6) * i, -150, aw / 6, 34), { fill: i % 2 ? '#FFFFFF' : Hs.roof, riso: 0, alpha: o.alpha });
    }
    stroke(ctx, P.rect(-aw / 2, -150, aw, 34), darker(Hs.roof, 0.5), 2, { alpha: o.alpha });
  }
  ctx.restore();
}

export function drawLamp(ctx, x, gy, h = 260, o = {}) {
  stroke(ctx, P.line(x, gy, x, gy - h), INK, 6, { alpha: o.alpha });
  stroke(ctx, P.quad(x, gy - h, x + 10, gy - h - 40, x + 46, gy - h - 34), INK, 5, { alpha: o.alpha });
  shape(ctx, P.poly([[x + 30, gy - h - 34], [x + 62, gy - h - 34], [x + 56, gy - h - 4], [x + 36, gy - h - 4]]), { fill: o.lit ? C.light : '#FFFDF6', line: INK, lw: 2.2, alpha: o.alpha });
}

export function drawTree(ctx, x, gy, h, seed, t, o = {}) {
  const r = rng(seed);
  const sway = Math.sin(t * 1.1 + seed) * 0.03 + (o.wind ?? 0) * 0.08;
  stroke(ctx, P.quad(x, gy, x + sway * h * 0.5, gy - h * 0.5, x + sway * h, gy - h * 0.62), darker(C.soil, 0.35), 14, { alpha: o.alpha });
  const cx = x + sway * h, cy = gy - h * 0.78;
  const col = o.color ?? r.pick([C.leaf, '#5BAE7E', '#4F9C80']);
  shape(ctx, P.blob(cx, cy, h * 0.34, 12, 0.12, seed, t * 0.6), { fill: col, line: darker(col, 0.5), lw: 2.4, alpha: o.alpha, shadow: true });
  shape(ctx, P.blob(cx - h * 0.08, cy - h * 0.08, h * 0.16, 10, 0.15, seed + 3), { fill: mixHex(col, '#FFFFFF', 0.25), riso: 0, alpha: (o.alpha ?? 1) * 0.7 });
}

// distant hills silhouette band
export function drawHills(ctx, x0, x1, gy, color, seed = 5, amp = 120) {
  const pts = [];
  for (let x = x0; x <= x1 + 40; x += 40) pts.push([x, gy - amp * (0.55 + 0.45 * Math.sin(x * 0.0021 + seed) * Math.sin(x * 0.0007 + seed * 2))]);
  shape(ctx, (c) => { c.beginPath(); c.moveTo(x0, gy + 600); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(x1 + 40, gy + 600); c.closePath(); }, { fill: color, line: darker(color, 0.25), lw: 2, riso: 0 });
}

// the corner flower shop; x centre, gy ground. o: { pop, t, faces: 0..1 per flower via fn, windowGlow }
export const SHOP = { w: 760, h: 620 };
const SIGN_F = flowerSpec(7, { type: 'sakura', scheme: ['#FF6B5B', '#FFB39F', '#FFB627', '#FFF3C4'] });
export function shopWindow(x, gy) { return [x - SHOP.w / 2 + 52, gy - SHOP.h + 160 + 74 + 52, 400, 225]; }
export function drawShop(ctx, x, gy, t, o = {}) {
  const { w, h } = SHOP;
  const L = x - w / 2, T = gy - h;
  const wall = '#F3E3CB', trim = '#3E6F64', line = darker(trim, 0.4);
  ctx.save();
  if (o.pop !== undefined && o.pop < 1) {
    const k = Math.max(0.001, spring(o.pop, 1.3, 6.5));
    ctx.translate(x, gy); ctx.scale(1, k); ctx.translate(-x, -gy);
  }
  shape(ctx, P.rect(L, T, w, h), { fill: wall, line: darker(wall, 0.6), lw: 2.6, shadow: { dx: 9, dy: 0, color: 'rgba(42,46,69,0.14)' } });
  // brick hints
  for (let i = 0; i < 18; i++) {
    const bx = L + 30 + hash2(i, 4) * (w - 90), by = T + 40 + hash2(i, 5) * (h - 120);
    stroke(ctx, P.rect(bx, by, 34, 14), darker(wall, 0.18), 1.4, { alpha: 0.6 });
  }
  // sign board
  shape(ctx, P.rrect(x - 190, T + 34, 380, 92, 14), { fill: trim, line, lw: 2.6, shadow: true });
  ctx.save();
  ctx.fillStyle = '#FFF8EE';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 58px "LXGW WenKai"';
  ctx.fillText('花  店', x - 26, T + 82);
  ctx.font = 'italic 600 22px "Fraunces"';
  ctx.fillStyle = C.marigold;
  ctx.fillText('FLOWERS', x + 112, T + 98);
  ctx.restore();
  drawHead(ctx, SIGN_F, x + 128, T + 64, 26, {});
  // awning (scalloped stripes)
  const aw = w + 40, ay = T + 160, ah = 74, n = 10;
  for (let i = 0; i < n; i++) {
    const sx = x - aw / 2 + (aw / n) * i;
    shape(ctx, (c) => {
      c.beginPath();
      c.moveTo(sx + 6, ay); c.lineTo(sx + aw / n + 6, ay); c.lineTo(sx + aw / n, ay + ah);
      c.arc(sx + aw / n / 2, ay + ah, aw / n / 2, 0, Math.PI);
      c.closePath();
    }, { fill: i % 2 ? '#FFF8EE' : C.coral, line: darker(C.coral, 0.5), lw: 2.2, shadow: i === n - 1 });
  }
  // display window (16:9, so the inside can fill the frame exactly when the camera passes through)
  const [wx, wy, ww, wh] = shopWindow(x, gy);
  shape(ctx, P.rect(wx, wy, ww, wh), { fill: o.windowGlow ? mixHex('#E8F3F1', C.light, o.windowGlow) : '#E8F3F1', line, lw: 3 });
  if (o.inWindow) o.inWindow(ctx, wx, wy, ww, wh);
  stroke(ctx, P.rect(wx, wy, ww, wh), trim, 10);
  stroke(ctx, P.line(wx + ww / 2, wy, wx + ww / 2, wy + wh), trim, 6);
  stroke(ctx, P.line(wx + 30, wy + 24, wx + 90, wy + 70), '#FFFFFF', 5, { alpha: 0.7 });
  shape(ctx, P.rect(wx - 14, wy + wh, ww + 28, 22), { fill: trim, line, lw: 2.2 });
  // door
  const dx = x + 200, dw = 150, dh = 300;
  shape(ctx, (c) => { c.beginPath(); c.moveTo(dx - dw / 2, gy); c.lineTo(dx - dw / 2, gy - dh + dw / 2); c.arc(dx, gy - dh + dw / 2, dw / 2, Math.PI, 0); c.lineTo(dx + dw / 2, gy); c.closePath(); },
    { fill: trim, line, lw: 2.6 });
  shape(ctx, (c) => { c.beginPath(); c.moveTo(dx - dw / 2 + 22, gy - 130); c.lineTo(dx - dw / 2 + 22, gy - dh + dw / 2); c.arc(dx, gy - dh + dw / 2, dw / 2 - 22, Math.PI, 0); c.lineTo(dx + dw / 2 - 22, gy - 130); c.closePath(); },
    { fill: '#E8F3F1', line, lw: 2.2 });
  shape(ctx, P.circle(dx + 46, gy - 110, 6), { fill: C.gold, riso: 0 });
  ctx.restore();
  return { window: [wx, wy, ww, wh], door: [dx, gy - dh / 2], sill: [wx, wy + wh, ww] };
}

// a galvanised bucket of flowers; flowers: [{F, dx, h}] ; faceFn(i) -> face | null
export function drawBucket(ctx, x, gy, w, flowers, t, o = {}) {
  const h = w * 0.82;
  flowers.forEach((f, i) => {
    const sway = Math.sin(t * 1.4 + f.F.phase) * 0.05 + (o.wind ?? 0);
    drawPlant(ctx, f.F, x + f.dx, gy - h * 0.6, f.h, f.R ?? 44, { sway, face: o.faceFn ? o.faceFn(i, f) : null, shadow: true, open: o.open ?? 1, leafGrow: 1 });
  });
  shape(ctx, P.poly([[x - w / 2, gy - h], [x + w / 2, gy - h], [x + w * 0.38, gy], [x - w * 0.38, gy]]), { fill: '#AEB8C8', line: '#5D6782', lw: 2.4, shadow: true });
  stroke(ctx, P.line(x - w / 2 + 6, gy - h + 16, x + w / 2 - 6, gy - h + 16), '#5D6782', 2, { alpha: 0.7 });
  stroke(ctx, P.line(x - w * 0.42, gy - h * 0.42, x + w * 0.42, gy - h * 0.42), '#5D6782', 2, { alpha: 0.5 });
}

export { drawLine, makeLine, TAU, E, clamp, lerp };
