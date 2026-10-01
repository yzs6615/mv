import * as THREE from 'three';
import { rng } from '../core/math.js';

// Paper-cut artwork toolkit. Silhouettes are drawn with Canvas2D in metres (x right, y up from the
// ground line) and packed into one RGBA data texture:
//   A = silhouette coverage   R = window glass coverage   G = rim (edge facing the light)   B = window id
// Window ids let shots light / extinguish windows progressively (uWinOn threshold).

export class Art {
  constructor(wm, hm, ppm, { light = [-0.6, 0.8], rimPx = 3, seed = 1 } = {}) {
    this.wm = wm; this.hm = hm; this.ppm = ppm;
    this.w = Math.min(4096, Math.ceil(wm * ppm)); this.h = Math.min(4096, Math.ceil(hm * ppm));
    this.sx = this.w / wm; this.sy = this.h / hm;
    const mk = () => { const c = document.createElement('canvas'); c.width = this.w; c.height = this.h; return c; };
    this.sil = mk(); this.win = mk(); this.ids = mk();
    this.s = this.sil.getContext('2d'); this.wc = this.win.getContext('2d'); this.ic = this.ids.getContext('2d');
    for (const c of [this.s, this.wc, this.ic]) { c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineJoin = 'round'; }
    this.light = light; this.rimPx = rimPx;
    this.r = rng(seed);
  }
  X(x) { return x * this.sx; }
  Y(y) { return this.h - y * this.sy; }
  // --- primitive fills (silhouette). Every fill also erases windows drawn earlier underneath it. ---
  fillPath(p) {
    this.s.fill(p);
    for (const c of [this.wc, this.ic]) { c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(p); c.restore(); }
  }
  rect(x, y, w, h) { const p = new Path2D(); p.rect(this.X(x), this.Y(y + h), w * this.sx, h * this.sy); this.fillPath(p); }
  poly(pts) { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(this.X(x), this.Y(y)) : p.moveTo(this.X(x), this.Y(y)))); p.closePath(); this.fillPath(p); }
  ellipse(cx, cy, rx, ry) { const p = new Path2D(); p.ellipse(this.X(cx), this.Y(cy), rx * this.sx, ry * this.sy, 0, 0, Math.PI * 2); this.fillPath(p); }
  /** half-ellipse dome sitting on y */
  dome(cx, y, rx, ry) { const p = new Path2D(); p.ellipse(this.X(cx), this.Y(y), rx * this.sx, ry * this.sy, 0, Math.PI, 0); p.closePath(); this.fillPath(p); }
  /** onion / pointed dome */
  ogee(cx, y, rx, h) {
    const p = new Path2D();
    p.moveTo(this.X(cx - rx), this.Y(y));
    p.bezierCurveTo(this.X(cx - rx * 1.15), this.Y(y + h * 0.55), this.X(cx - rx * 0.1), this.Y(y + h * 0.7), this.X(cx), this.Y(y + h));
    p.bezierCurveTo(this.X(cx + rx * 0.1), this.Y(y + h * 0.7), this.X(cx + rx * 1.15), this.Y(y + h * 0.55), this.X(cx + rx), this.Y(y));
    p.closePath(); this.fillPath(p);
  }
  /** cut a hole (arches under bridges, loggia openings) */
  hole(fn) { this.s.save(); this.s.globalCompositeOperation = 'destination-out'; const keep = this.fillPath; this.fillPath = (p) => this.s.fill(p); fn(); this.fillPath = keep; this.s.restore(); }
  archHole(x, y, w, h) { this.hole(() => { this.rect(x, y, w, h - w / 2); this.dome(x + w / 2, y + h - w / 2, w / 2, w / 2); }); }

  // --- windows (glass + id) ---
  window(x, y, w, h, { arch = true, id = null, lit = 1 } = {}) {
    const v = id ?? (0.08 + 0.92 * this.r());
    const draw = (ctx) => {
      ctx.fillRect(this.X(x), this.Y(y + h - (arch ? w / 2 : 0)), w * this.sx, (h - (arch ? w / 2 : 0)) * this.sy);
      if (arch) { ctx.beginPath(); ctx.ellipse(this.X(x + w / 2), this.Y(y + h - w / 2), w / 2 * this.sx, w / 2 * this.sy, 0, Math.PI, 0); ctx.fill(); }
    };
    this.wc.globalAlpha = lit; draw(this.wc); this.wc.globalAlpha = 1;
    const g = Math.round(v * 255);
    this.ic.fillStyle = `rgb(${g},${g},${g})`;
    // id drawn slightly larger so bilinear filtering keeps it constant across the glass
    this.ic.save(); this.ic.translate(this.X(x + w / 2), this.Y(y + h / 2)); this.ic.scale(1.25, 1.12); this.ic.translate(-this.X(x + w / 2), -this.Y(y + h / 2)); draw(this.ic); this.ic.restore();
  }
  windowGrid(x, y, cols, rows, w, h, gx, gy, opts = {}) {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (opts.skip && this.r() < opts.skip) continue;
      this.window(x + i * (w + gx), y + j * (h + gy), w, h, opts);
    }
  }

  // --- architecture ---
  merlonsSwallow(x0, x1, y, mw = 0.9, mh = 1.2, gap = 0.7) { // Ghibelline swallowtail battlements (Castelvecchio)
    for (let x = x0; x + mw <= x1 + 1e-6; x += mw + gap) {
      this.poly([[x, y], [x, y + mh], [x + mw * 0.3, y + mh], [x + mw * 0.5, y + mh * 0.62], [x + mw * 0.7, y + mh], [x + mw, y + mh], [x + mw, y]]);
    }
  }
  merlons(x0, x1, y, mw = 0.8, mh = 0.9, gap = 0.6) { for (let x = x0; x + mw <= x1 + 1e-6; x += mw + gap) this.rect(x, y, mw, mh); }
  tower(x, w, h, { top = 'swallow', windows = true, belfry = false } = {}) {
    this.rect(x, 0, w, h);
    if (top === 'swallow') { this.rect(x - 0.4, h - 0.6, w + 0.8, 0.6); this.merlonsSwallow(x - 0.4, x + w + 0.4, h, w / 6, w / 5, w / 12); }
    else if (top === 'pyramid') { this.poly([[x - 0.3, h], [x + w / 2, h + w * 1.1], [x + w + 0.3, h]]); }
    else if (top === 'spire') { this.poly([[x, h], [x + w / 2, h + w * 2.8], [x + w, h]]); this.rect(x + w / 2 - 0.08, h + w * 2.8, 0.16, 1.4); }
    else if (top === 'cupola') { this.rect(x + w * 0.12, h, w * 0.76, w * 0.5); this.ogee(x + w / 2, h + w * 0.5, w * 0.42, w * 0.9); this.rect(x + w / 2 - 0.1, h + w * 1.4, 0.2, 1.2); }
    if (belfry) { const bw = w / 3.4; for (let i = 0; i < 2; i++) this.archHole(x + w * 0.16 + i * (bw + w * 0.18), h - w * 0.95, bw, w * 0.7); }
    if (windows) for (let yy = 4; yy < h - (belfry ? w * 1.2 : 3); yy += 5.5 + this.r() * 2) if (this.r() < 0.55) this.window(x + w / 2 - 0.45, yy, 0.9, 1.7);
  }
  /** Torre dei Lamberti: tall striped tower with octagonal belfry + cupola */
  lamberti(x, w = 9, h = 72) {
    this.rect(x, 0, w, h);
    this.rect(x - 0.5, h - 0.8, w + 1, 0.8);
    const bw = w / 3.2; for (let i = 0; i < 2; i++) this.archHole(x + w * 0.14 + i * (bw + w * 0.18), h - 9, bw, 6.5);
    const ow = w * 0.8; this.rect(x + (w - ow) / 2, h, ow, 9);
    for (let i = 0; i < 3; i++) this.archHole(x + (w - ow) / 2 + 0.8 + i * (ow - 1.6) / 3, h + 2, (ow - 1.6) / 3 - 0.6, 5);
    this.rect(x + (w - ow) / 2 - 0.3, h + 9, ow + 0.6, 0.6);
    this.ogee(x + w / 2, h + 9.6, ow * 0.46, 8);
    this.rect(x + w / 2 - 0.12, h + 17.4, 0.24, 2.4);
    for (let yy = 8; yy < h - 12; yy += 9) this.window(x + w / 2 - 0.5, yy, 1.0, 2.0);
  }
  /** church: nave + gabled facade + rose window + campanile */
  church(x, w, h, { campanile = true, cw = 5.5, ch = null } = {}) {
    this.poly([[x, 0], [x, h], [x + w / 2, h + w * 0.32], [x + w, h], [x + w, 0]]);
    this.window(x + w / 2 - 1.6, h * 0.55, 3.2, 3.2, { arch: false, id: 0.97 });
    this.window(x + w * 0.15, h * 0.2, 1.4, 4.2); this.window(x + w * 0.85 - 1.4, h * 0.2, 1.4, 4.2);
    if (campanile) this.tower(x + w + 1, cw, ch ?? h * 2.2, { top: 'spire', belfry: true });
  }
  domeChurch(x, w, h, dr) {
    this.rect(x, 0, w, h);
    this.poly([[x - 0.5, h], [x + w / 2, h + 3], [x + w + 0.5, h]]);
    this.rect(x + w / 2 - dr * 0.9, h, dr * 1.8, dr * 0.9);
    this.dome(x + w / 2, h + dr * 0.9, dr, dr * 0.95);
    this.rect(x + w / 2 - dr * 0.18, h + dr * 1.8, dr * 0.36, dr * 0.5);
    this.dome(x + w / 2, h + dr * 2.3, dr * 0.22, dr * 0.3);
    this.rect(x + w / 2 - 0.08, h + dr * 2.55, 0.16, 1.5);
    this.windowGrid(x + 1.2, 2, Math.floor((w - 2) / 2.6), 1, 1.3, 4, 1.3, 0);
  }
  house(x, w, h, { roof = 'gable', floors = 3, lit = 1, chimney = true, loggia = false } = {}) {
    this.rect(x, 0, w, h);
    if (roof === 'gable') this.poly([[x - 0.35, h], [x + w / 2, h + w * 0.28], [x + w + 0.35, h]]);
    else if (roof === 'hip') this.poly([[x - 0.35, h], [x + w * 0.2, h + w * 0.22], [x + w * 0.8, h + w * 0.22], [x + w + 0.35, h]]);
    else if (roof === 'flat') this.merlons(x, x + w, h, 0.6, 0.6, 0.5);
    if (chimney && this.r() < 0.6) { const cx = x + w * (0.2 + 0.6 * this.r()); this.rect(cx, h, 0.7, w * 0.28 + 1.2); this.rect(cx - 0.15, h + w * 0.28 + 1.2, 1.0, 0.3); }
    const fh = h / floors;
    const n = Math.max(1, Math.floor(w / 2.4));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      if (this.r() < 0.2) continue;
      const ww = 0.8, wh = Math.min(1.8, fh * 0.5);
      this.window(x + (i + 0.5) * (w / n) - ww / 2, f * fh + fh * 0.3, ww, wh, { arch: this.r() < 0.6, lit: this.r() < 0.65 * lit ? 1 : 0.0 });
    }
    if (loggia) for (let i = 0; i < n; i++) this.archHole(x + (i + 0.5) * (w / n) - 0.7, h - fh * 0.85, 1.4, fh * 0.65);
  }
  cypress(x, h, w = null, y0 = 0) {
    w = w ?? h * 0.16;
    const c = new Path2D();
    c.moveTo(this.X(x - w * 0.18), this.Y(y0));
    c.bezierCurveTo(this.X(x - w * 0.62), this.Y(y0 + h * 0.25), this.X(x - w * 0.55), this.Y(y0 + h * 0.7), this.X(x), this.Y(y0 + h));
    c.bezierCurveTo(this.X(x + w * 0.55), this.Y(y0 + h * 0.7), this.X(x + w * 0.62), this.Y(y0 + h * 0.25), this.X(x + w * 0.18), this.Y(y0));
    c.closePath(); this.fillPath(c);
  }
  pine(x, h, cw) { // umbrella / stone pine
    const c = this.s; c.lineWidth = Math.max(1.5, 0.35 * this.sx); c.lineCap = 'round';
    c.beginPath(); c.moveTo(this.X(x), this.Y(0)); c.quadraticCurveTo(this.X(x + cw * 0.08), this.Y(h * 0.6), this.X(x + cw * 0.05), this.Y(h * 0.82)); c.stroke();
    for (let i = 0; i < 9; i++) { const a = i / 8; this.ellipse(x - cw / 2 + cw * a, h * (0.84 + 0.1 * Math.sin(a * 3.1)), cw * (0.16 + 0.06 * this.r()), h * 0.09); }
  }
  hills(points, base = 0) { this.poly([[points[0][0], base], ...points, [points[points.length - 1][0], base]]); }
  bridgeArches(x0, x1, deckY, n, { thick = 2.2, pierW = 3, parapet = 1.1 } = {}) {
    this.rect(x0, 0, x1 - x0, deckY + parapet);
    const span = (x1 - x0 - pierW * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const ax = x0 + pierW + i * (span + pierW);
      const rise = Math.min(span / 2, deckY - thick);
      this.hole(() => { this.rect(ax, -1, span, deckY - thick - rise + 1); this.dome(ax + span / 2, deckY - thick - rise, span / 2, rise); });
    }
    this.merlons(x0, x1, deckY + parapet, 0.5, 0.25, 0.25);
  }
  lamp(x, h) {
    this.rect(x - 0.06, 0, 0.12, h); this.rect(x - 0.22, h, 0.44, 0.08);
    this.poly([[x - 0.18, h + 0.08], [x - 0.24, h + 0.55], [x + 0.24, h + 0.55], [x + 0.18, h + 0.08]]);
    this.poly([[x - 0.3, h + 0.55], [x, h + 0.8], [x + 0.3, h + 0.55]]);
    this.window(x - 0.15, h + 0.12, 0.3, 0.38, { arch: false, id: 0.99 });
  }

  /** pack the three canvases into one RGBA DataTexture */
  pack() {
    const { w, h } = this;
    // rim: silhouette minus silhouette shifted toward the light, softly blurred
    const rim = document.createElement('canvas'); rim.width = w; rim.height = h;
    const rc = rim.getContext('2d');
    rc.drawImage(this.sil, 0, 0);
    rc.globalCompositeOperation = 'destination-out';
    rc.drawImage(this.sil, this.light[0] * this.rimPx, -this.light[1] * this.rimPx);
    const rim2 = document.createElement('canvas'); rim2.width = w; rim2.height = h;
    const r2 = rim2.getContext('2d'); r2.filter = 'blur(1.2px)'; r2.drawImage(rim, 0, 0);
    const S = this.s.getImageData(0, 0, w, h).data, Wd = this.wc.getImageData(0, 0, w, h).data,
      I = this.ic.getImageData(0, 0, w, h).data, R = r2.getImageData(0, 0, w, h).data;
    const out = new Uint8Array(w * h * 4);
    // flip rows so uv (0,0) is bottom-left as in GL
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4, dst = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        const a = S[src + x + 3];
        out[dst + x] = Math.min(a, Wd[src + x + 3]);
        out[dst + x + 1] = Math.min(a, R[src + x + 3]);
        out[dst + x + 2] = I[src + x];
        out[dst + x + 3] = a;
      }
    }
    const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
    tex.userData = { wm: this.wm, hm: this.hm };
    return tex;
  }
}

/** tiling paper-fibre texture (CPU value noise + fibres), shared by every paper surface */
export function paperTexture(size = 512, seed = 7) {
  const r = rng(seed);
  const data = new Uint8Array(size * size * 4);
  const grid = (n) => { const g = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < g.length; i++) g[i] = r(); for (let i = 0; i <= n; i++) { g[i * (n + 1) + n] = g[i * (n + 1)]; g[n * (n + 1) + i] = g[i]; } return g; };
  const octs = [8, 16, 32, 64, 128].map((n) => [n, grid(n)]);
  const val = (g, n, x, y) => { const gx = x * n, gy = y * n, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), N = n + 1;
    const a = g[j * N + i], b = g[j * N + i + 1], c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1]; return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const f = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, amp = 0.5, tot = 0;
    for (const [n, g] of octs) { s += amp * val(g, n, x / size, y / size); tot += amp; amp *= 0.55; }
    f[y * size + x] = s / tot;
  }
  // fibres: short random strokes
  for (let k = 0; k < 2600; k++) {
    let x = r() * size, y = r() * size; const a = r() * Math.PI, len = 4 + r() * 18, b = (r() - 0.5) * 0.12;
    for (let s = 0; s < len; s++) { const ix = ((Math.floor(x) % size) + size) % size, iy = ((Math.floor(y) % size) + size) % size; f[iy * size + ix] += b; x += Math.cos(a); y += Math.sin(a); }
  }
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(255, Math.round(f[i] * 255))); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}
