// Pixel drawing on a 2D canvas at native resolution. Every coordinate is rounded to whole pixels
// and nothing is anti-aliased: shapes are plotted with rectangles, sprites are blitted canvases,
// soft things (gradients, shadows, fades) are ordered-dithered with a 4x4 Bayer matrix.
import { env, ctx2d } from './env.js';

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const BAYER8 = (() => {
  const m = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  return m;
})();
// threshold in (0,1) for pixel (x,y)
export const bayer = (x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
export const bayer8 = (x, y) => (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64;

const R = Math.round;

export class Gfx {
  constructor(w, h, canvas) {
    this.W = w;
    this.H = h;
    this.c = canvas || env.createCanvas(w, h);
    this.c.width = w;
    this.c.height = h;
    this.ctx = ctx2d(this.c);
    this.ox = 0; // translation stack (integers)
    this.oy = 0;
    this.stack = [];
    this.patterns = new Map();
  }
  clear(col = '#181425') { const x = this.ctx; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.fillStyle = col; x.fillRect(0, 0, this.W, this.H); }
  push(dx = 0, dy = 0) { this.stack.push([this.ox, this.oy]); this.ox += R(dx); this.oy += R(dy); }
  pop() { [this.ox, this.oy] = this.stack.pop(); }

  rect(x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    const c = this.ctx;
    c.fillStyle = col;
    c.fillRect(R(x) + this.ox, R(y) + this.oy, R(w), R(h));
  }
  // rectangle given by corners (inclusive-exclusive), robust to rounding
  box(x0, y0, x1, y1, col) {
    const a = R(x0), b = R(y0), c = R(x1), d = R(y1);
    if (c <= a || d <= b) return;
    this.ctx.fillStyle = col;
    this.ctx.fillRect(a + this.ox, b + this.oy, c - a, d - b);
  }
  px(x, y, col) { this.ctx.fillStyle = col; this.ctx.fillRect(R(x) + this.ox, R(y) + this.oy, 1, 1); }
  hline(x0, x1, y, col) { if (x1 < x0) [x0, x1] = [x1, x0]; this.rect(x0, y, R(x1) - R(x0) + 1, 1, col); }
  vline(x, y0, y1, col) { if (y1 < y0) [y0, y1] = [y1, y0]; this.rect(x, y0, 1, R(y1) - R(y0) + 1, col); }
  // outlined rectangle (1px)
  frame(x, y, w, h, col) {
    this.rect(x, y, w, 1, col); this.rect(x, y + h - 1, w, 1, col);
    this.rect(x, y + 1, 1, h - 2, col); this.rect(x + w - 1, y + 1, 1, h - 2, col);
  }
  // Bresenham line, optional thickness (square brush)
  line(x0, y0, x1, y1, col, th = 1) {
    x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
    const c = this.ctx;
    c.fillStyle = col;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    const o = th > 1 ? Math.floor((th - 1) / 2) : 0;
    for (;;) {
      c.fillRect(x0 - o + this.ox, y0 - o + this.oy, th, th);
      if ((x0 === x1 && y0 === y1) || ++n > 4000) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // filled disc / ring by horizontal spans (midpoint style, symmetric)
  disc(cx, cy, r, col) {
    cx = R(cx); cy = R(cy);
    if (r < 0.5) { this.px(cx, cy, col); return; }
    const c = this.ctx;
    c.fillStyle = col;
    const rr = r * r + r * 0.8;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
      if (dy * dy > rr) continue;
      c.fillRect(cx - w + this.ox, cy + dy + this.oy, 2 * w + 1, 1);
    }
  }
  ring(cx, cy, r, col, th = 1) {
    cx = R(cx); cy = R(cy);
    const c = this.ctx;
    c.fillStyle = col;
    const ro = r * r + r * 0.8, ri = Math.max(0, (r - th) * (r - th) + (r - th) * 0.8);
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const yy = dy * dy;
      if (yy > ro) continue;
      const wo = Math.floor(Math.sqrt(ro - yy));
      const wi = yy < ri ? Math.floor(Math.sqrt(ri - yy)) + 1 : 0;
      if (wi === 0) { c.fillRect(cx - wo + this.ox, cy + dy + this.oy, 2 * wo + 1, 1); continue; }
      if (wo >= wi) {
        c.fillRect(cx - wo + this.ox, cy + dy + this.oy, wo - wi + 1, 1);
        c.fillRect(cx + wi + this.ox, cy + dy + this.oy, wo - wi + 1, 1);
      }
    }
  }
  // filled ellipse
  oval(cx, cy, rx, ry, col) {
    cx = R(cx); cy = R(cy);
    const c = this.ctx;
    c.fillStyle = col;
    const H = Math.ceil(ry);
    for (let dy = -H; dy <= H; dy++) {
      const f = 1 - (dy * dy) / ((ry + 0.4) * (ry + 0.4));
      if (f < 0) continue;
      const w = Math.floor(rx * Math.sqrt(f) + 0.3);
      c.fillRect(cx - w + this.ox, cy + dy + this.oy, 2 * w + 1, 1);
    }
  }
  // filled polygon by scanline (integer, even-odd)
  poly(pts, col) {
    const c = this.ctx;
    c.fillStyle = col;
    let y0 = 1e9, y1 = -1e9;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.floor(y0); y1 = Math.ceil(y1);
    const n = pts.length, xs = [];
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
        if (xb > xa) c.fillRect(xa + this.ox, y + this.oy, xb - xa, 1);
      }
    }
  }

  // dither pattern: colour on the pixels whose Bayer rank < level (0..16), transparent elsewhere
  pattern(col, level) {
    level = Math.max(0, Math.min(16, Math.round(level)));
    const key = col + level;
    let p = this.patterns.get(key);
    if (!p) {
      const cv = env.createCanvas(4, 4);
      const g = ctx2d(cv);
      g.fillStyle = col;
      for (let i = 0; i < 16; i++) if (BAYER4[i] < level) g.fillRect(i & 3, i >> 2, 1, 1);
      p = this.ctx.createPattern(cv, 'repeat');
      this.patterns.set(key, p);
    }
    return p;
  }
  // dithered rectangle: amount 0..1 of coverage (screen-anchored pattern)
  drect(x, y, w, h, col, amount) {
    const lv = Math.round(amount * 16);
    if (lv <= 0 || w <= 0 || h <= 0) return;
    if (lv >= 16) { this.rect(x, y, w, h, col); return; }
    this.ctx.fillStyle = this.pattern(col, lv);
    this.ctx.fillRect(R(x) + this.ox, R(y) + this.oy, R(w), R(h));
  }
  // vertical gradient through a list of palette colours, dithered between neighbours.
  // stops: [[y, colour], ...] in local coordinates, sorted by y
  vgrad(x, y, w, stops, band = 1) {
    for (let i = 0; i + 1 < stops.length; i++) {
      const [ya, ca] = stops[i], [yb, cb] = stops[i + 1];
      const h = yb - ya;
      if (h <= 0) continue;
      this.rect(x, y + ya, w, h, ca);
      // dither cb over ca with increasing density, in bands
      for (let yy = 0; yy < h; yy += band) {
        const f = (yy + band * 0.5) / h;
        this.drect(x, y + ya + yy, w, Math.min(band, h - yy), cb, f);
      }
    }
  }

  // sprite blit. s: {c: canvas, w, h, ax, ay, fl (flipped canvas)}; the anchor is a pixel-boundary
  // position inside the sprite (feet: ax = w/2, ay = h), mirrored when flipped
  spr(s, x, y, flip = false, alpha = 1) {
    if (!s) return;
    const c = this.ctx;
    if (alpha < 1) c.globalAlpha = alpha;
    const ax = flip ? s.w - s.ax : s.ax;
    c.drawImage(flip ? s.fl : s.c, R(x - ax) + this.ox, R(y - s.ay) + this.oy);
    if (alpha < 1) c.globalAlpha = 1;
  }
  // whole-canvas blit, integer scale
  blit(cv, x, y, scale = 1) {
    if (scale === 1) this.ctx.drawImage(cv, R(x) + this.ox, R(y) + this.oy);
    else this.ctx.drawImage(cv, R(x) + this.ox, R(y) + this.oy, cv.width * scale, cv.height * scale);
  }
}
