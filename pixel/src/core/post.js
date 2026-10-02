// Per-pixel passes over a Gfx canvas: the gray world with its colour zones, palette remaps for
// memories / storms / flashes, palette quantization for 3D renders, mosaic, and dissolves.
import { TBL, quantize, hex2int } from './pal.js';
import { BAYER4, BAYER8 } from './gfx.js';

// tables re-keyed on the little-endian ABGR words of ImageData
const toAbgr = (v) => 0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
const TABLES = {};
for (const [k, m] of Object.entries(TBL)) {
  const n = new Map();
  for (const [a, b] of m) n.set(toAbgr(a) >>> 0, toAbgr(b) >>> 0);
  TABLES[k] = n;
}
export const abgr = (hex) => toAbgr(hex2int(hex)) >>> 0;

let maskBuf = null;
function mask(n) {
  if (!maskBuf || maskBuf.length < n) maskBuf = new Uint8Array(n);
  maskBuf.fill(0, 0, n);
  return maskBuf;
}

function grab(g) {
  const img = g.ctx.getImageData(0, 0, g.W, g.H);
  return [img, new Uint32Array(img.data.buffer)];
}

// mark colour zones into a mask. zones: [{x, y, r, soft}] discs with a dithered rim,
// or {x, y, w, h} rectangles; coordinates in the canvas' own pixels
function markZones(m, W, H, zones, soft0) {
  for (const z of zones) {
    if (z.w !== undefined) {
      const x0 = Math.max(0, Math.round(z.x)), x1 = Math.min(W, Math.round(z.x + z.w));
      const y0 = Math.max(0, Math.round(z.y)), y1 = Math.min(H, Math.round(z.y + z.h));
      for (let y = y0; y < y1; y++) m.fill(1, y * W + x0, y * W + x1);
      continue;
    }
    const s = z.soft ?? soft0, r = z.r;
    if (r <= 0) continue;
    const x0 = Math.max(0, Math.floor(z.x - r - s)), x1 = Math.min(W - 1, Math.ceil(z.x + r + s));
    const y0 = Math.max(0, Math.floor(z.y - (r + s) * (z.sy || 1))), y1 = Math.min(H - 1, Math.ceil(z.y + (r + s) * (z.sy || 1)));
    const isy = 1 / (z.sy || 1);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - z.y) * isy, row = y * W;
      for (let x = x0; x <= x1; x++) {
        if (m[row + x]) continue;
        const dx = x + 0.5 - z.x;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r - s * 0.5 + ((BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16) * s) m[row + x] = 1;
      }
    }
  }
}

// gray everything outside the zones (exempt colours pass through)
export function grayPass(g, zones = [], soft = 8) {
  const W = g.W, H = g.H;
  const [img, d] = grab(g);
  const m = mask(W * H);
  markZones(m, W, H, zones, soft);
  const T = TABLES.gray;
  for (let i = 0, n = W * H; i < n; i++) {
    if (m[i]) continue;
    const v = T.get(d[i]);
    if (v !== undefined) d[i] = v;
  }
  g.ctx.putImageData(img, 0, 0);
}

// palette remap ('gb' | 'sepia' | 'storm' | 'night' | 'white' | 'black' | 'gray'), with a Bayer
// dithered amount (0..1) and optional zones that are left untouched
export function remapPass(g, name, amount = 1, zones = null, soft = 8) {
  if (amount <= 0) return;
  const W = g.W, H = g.H;
  const [img, d] = grab(g);
  const T = TABLES[name];
  let m = null;
  if (zones && zones.length) { m = mask(W * H); markZones(m, W, H, zones, soft); }
  const full = amount >= 1;
  for (let y = 0; y < H; y++) {
    const row = y * W, by = (y & 7) * 8;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      if (m && m[i]) continue;
      if (!full && (BAYER8[by + (x & 7)] + 0.5) / 64 >= amount) continue;
      const v = T.get(d[i]);
      if (v !== undefined) d[i] = v;
    }
  }
  g.ctx.putImageData(img, 0, 0);
}

// snap arbitrary colours to the palette; dither > 0 blends the two nearest with Bayer 4x4
export function quantizePass(g, dither = 1, subset = null, x0 = 0, y0 = 0, w = g.W, h = g.H) {
  const W = g.W;
  const img = g.ctx.getImageData(x0, y0, w, h);
  const d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, v = d[i];
      if ((v >>> 24) === 0) continue;
      const q = quantize(v & 255, (v >> 8) & 255, (v >> 16) & 255, subset);
      const th = (BAYER4[((y + y0) & 3) * 4 + ((x + x0) & 3)] + 0.5) / 16;
      const pick = dither > 0 && q[2] * dither > th * 0.5 + 0.25 ? q[1] : q[0];
      d[i] = toAbgr(pick) >>> 0;
    }
  }
  g.ctx.putImageData(img, x0, y0);
  void W;
}

// mosaic: blocks of size b (in canvas pixels) take the colour of their centre pixel
export function mosaicPass(g, b) {
  b = Math.round(b);
  if (b <= 1) return;
  const W = g.W, H = g.H;
  const [img, d] = grab(g);
  const ox = Math.floor(((W % b) + b) / 2) % b, oy = Math.floor(((H % b) + b) / 2) % b;
  for (let by = -oy; by < H; by += b) {
    for (let bx = -ox; bx < W; bx += b) {
      const cx = Math.min(W - 1, Math.max(0, bx + (b >> 1))), cy = Math.min(H - 1, Math.max(0, by + (b >> 1)));
      const v = d[cy * W + cx];
      for (let y = Math.max(0, by); y < Math.min(H, by + b); y++) d.fill(v, y * W + Math.max(0, bx), y * W + Math.min(W, bx + b));
    }
  }
  g.ctx.putImageData(img, 0, 0);
}

// ordered-dither dissolve of canvas B over g by amount p (0..1)
export function dissolve(g, cvB, p) {
  if (p <= 0) return;
  if (p >= 1) { g.ctx.drawImage(cvB, 0, 0); return; }
  const W = g.W, H = g.H;
  const [img, d] = grab(g);
  const b = new Uint32Array(cvB.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data.buffer);
  for (let y = 0; y < H; y++) {
    const row = y * W, by = (y & 7) * 8;
    for (let x = 0; x < W; x++) if ((BAYER8[by + (x & 7)] + 0.5) / 64 < p) d[row + x] = b[row + x];
  }
  g.ctx.putImageData(img, 0, 0);
}

export { TABLES };
