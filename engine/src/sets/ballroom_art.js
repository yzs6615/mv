import * as THREE from 'three';
import { Art } from '../fx/art.js';
import { rng } from '../core/math.js';

// Paper-cut artwork for the interior sets (Palazzo Capulet ballroom, Juliet's chamber).
// `Cut` extends the shared Art toolkit with two extra layers and smooth-shape helpers, and packs:
//   A = silhouette coverage   R = gilt (gold leaf / inlay that glints in candlelight)
//   G = glow (emissive: lit doorways, sconce flames)   B = tone (raised lighter-ink detail)
// Rim light is not baked: the interior shaders derive it from the alpha gradient and the real
// candle positions, so every cut edge facing a chandelier catches warm light.

export class Cut extends Art {
  constructor(wm, hm, ppm, opts = {}) {
    super(wm, hm, ppm, opts);
    const mk = () => { const c = document.createElement('canvas'); c.width = this.w; c.height = this.h; return c; };
    this.gil = mk(); this.ton = mk();
    this.gc = this.gil.getContext('2d'); this.tc = this.ton.getContext('2d');
    for (const c of [this.s, this.wc, this.gc, this.tc]) { c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineJoin = 'round'; c.lineCap = 'round'; }
  }
  // every silhouette fill also covers details drawn earlier underneath it
  fillPath(p) {
    super.fillPath(p);
    for (const c of [this.gc, this.tc]) { c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(p); c.restore(); }
  }
  P(x, y) { return [this.X(x), this.Y(y)]; }
  /** closed (or open) Catmull-Rom spline through [x,y(,corner)] points in metres -> Path2D */
  spl(pts, closed = true, k = 1, path = null) {
    const P = pts.map(([x, y, c]) => [this.X(x), this.Y(y), c]);
    const p = path || new Path2D(); const n = P.length;
    const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    p.moveTo(P[0][0], P[0][1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const a = p1[2] ? 0 : k / 6, b = p2[2] ? 0 : k / 6;
      p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * a, p1[1] + (p2[1] - p0[1]) * a, p2[0] - (p3[0] - p1[0]) * b, p2[1] - (p3[1] - p1[1]) * b, p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  }
  blob(pts, k = 1) { this.fillPath(this.spl(pts, true, k)); }
  /** tapered limb through nodes [[x,y,r],...] with rounded ends */
  limbPath(nodes) {
    const n = nodes.length, L = [], R = [];
    const dir = (i) => { const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(n - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    for (let i = 0; i < n; i++) { const [x, y, r] = nodes[i]; const [dx, dy] = dir(i); L.push([x - dy * r, y + dx * r]); R.push([x + dy * r, y - dx * r]); }
    const [ex, ey, er] = nodes[n - 1], [ed0, ed1] = dir(n - 1), [sx, sy, sr] = nodes[0], [sd0, sd1] = dir(0);
    const pts = [...L, [ex + ed0 * er * 0.9, ey + ed1 * er * 0.9], ...R.reverse(), [sx - sd0 * sr * 0.9, sy - sd1 * sr * 0.9]];
    return this.spl(pts, true, 1);
  }
  limb(nodes) { this.fillPath(this.limbPath(nodes)); }
  ell(cx, cy, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(this.X(cx), this.Y(cy), rx * this.sx, ry * this.sy, -rot, 0, Math.PI * 2); return p; }
  /** curved ostrich plume: spine from (x,y) with heading a (rad), length len, half-width w, curl (rad over length) */
  plume(x, y, a, len, w, curl = 0.8, jag = 7, ctx = null) {
    const N = 10, spine = [];
    for (let i = 0; i <= N; i++) { const u = i / N; const ang = a + curl * u * u; spine.push([0, 0, ang]); }
    let px = x, py = y; const pts = [[px, py]];
    for (let i = 1; i <= N; i++) { const ang = spine[i][2]; px += Math.cos(ang) * len / N; py += Math.sin(ang) * len / N; pts.push([px, py]); }
    const L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, ang = spine[i][2], nx = -Math.sin(ang), ny = Math.cos(ang);
      const wd = w * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.35 + 0.65 * u) + 0.002;
      const jg = (i % 2 ? 1 : 0.62);
      L.push([pts[i][0] + nx * wd * jg, pts[i][1] + ny * wd * jg]);
      R.push([pts[i][0] - nx * wd * 0.55, pts[i][1] - ny * wd * 0.55]);
    }
    const path = this.spl([...L, ...R.reverse()], true, 0.8);
    if (ctx) ctx.fill(path); else this.fillPath(path);
  }
  // detail layers ---------------------------------------------------------------------------------
  gfill(path) { this.gc.fill(path); }
  gline(pts, wm, closed = false) { this.gc.lineWidth = Math.max(1, wm * this.sx); this.gc.stroke(this.spl(pts, closed)); }
  tfill(path, a = 1) { this.tc.globalAlpha = a; this.tc.fill(path); this.tc.globalAlpha = 1; }
  tline(pts, wm, closed = false, a = 1) { this.tc.globalAlpha = a; this.tc.lineWidth = Math.max(1, wm * this.sx); this.tc.stroke(this.spl(pts, closed)); this.tc.globalAlpha = 1; }
  grect(x, y, w, h) { this.gc.fillRect(this.X(x), this.Y(y + h), w * this.sx, h * this.sy); }
  trect(x, y, w, h, a = 1) { this.tc.globalAlpha = a; this.tc.fillRect(this.X(x), this.Y(y + h), w * this.sx, h * this.sy); this.tc.globalAlpha = 1; }
  /** soft emissive halo into the glow layer */
  halo(x, y, r, a = 1, ry = null) {
    const c = this.wc; c.save(); c.translate(this.X(x), this.Y(y)); c.scale(1, (ry ?? r) / r);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r * this.sx);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, `rgba(255,255,255,${a * 0.45})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(-r * this.sx, -r * this.sx, 2 * r * this.sx, 2 * r * this.sx); c.restore();
  }
  glowFill(path, a = 1) { this.wc.globalAlpha = a; this.wc.fill(path); this.wc.globalAlpha = 1; }
  holePath(path) { this.s.save(); this.s.globalCompositeOperation = 'destination-out'; this.s.fill(path); this.s.restore(); }
  /** round or pointed arch outline from springing line y with span w at x (left), as Path2D */
  archPath(x, y, w, { pointed = 0, down = 0 } = {}) {
    const p = new Path2D(), r = w / 2, cx = x + r;
    p.moveTo(this.X(x), this.Y(y - down));
    if (!pointed) { p.lineTo(this.X(x), this.Y(y)); p.ellipse(this.X(cx), this.Y(y), r * this.sx, r * this.sy, 0, Math.PI, 0); }
    else { // two-centred pointed arch: centres offset inward by pointed*r
      const off = pointed * r, R = r + off, top = Math.sqrt(R * R - off * off);
      p.lineTo(this.X(x), this.Y(y));
      const N = 18;
      for (let i = 1; i <= N; i++) { const a = Math.PI - (Math.PI - Math.atan2(top, -off)) * (i / N); p.lineTo(this.X(cx + off + R * Math.cos(a)), this.Y(y + R * Math.sin(a))); }
      for (let i = N - 1; i >= 0; i--) { const a = Math.PI - (Math.PI - Math.atan2(top, -off)) * (i / N); p.lineTo(this.X(cx - off - R * Math.cos(a)), this.Y(y + R * Math.sin(a))); }
    }
    p.lineTo(this.X(x + w), this.Y(y - down)); p.closePath();
    return p;
  }
  /** pack layers into an RGBA DataTexture (R gilt, G glow, B tone, A silhouette) */
  packCut({ repeatX = false, repeatY = false, flipY = true } = {}) {
    const { w, h } = this;
    const S = this.s.getImageData(0, 0, w, h).data, Gl = this.wc.getImageData(0, 0, w, h).data,
      Gi = this.gc.getImageData(0, 0, w, h).data, T = this.tc.getImageData(0, 0, w, h).data;
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const src = (flipY ? h - 1 - y : y) * w * 4, dst = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        const a = S[src + x + 3];
        out[dst + x] = Math.min(a, Gi[src + x + 3]);
        out[dst + x + 1] = Gl[src + x + 3];
        out[dst + x + 2] = Math.min(a, T[src + x + 3]);
        out[dst + x + 3] = a;
      }
    }
    const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true; tex.anisotropy = 4;
    if (repeatX) tex.wrapS = THREE.RepeatWrapping;
    if (repeatY) tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    tex.userData = { wm: this.wm, hm: this.hm, w, h };
    return tex;
  }
}

// =====================================================================================================
// DANCERS: masked couples in dance hold, drawn as paper puppets on thin rods.
// Atlas of 8 cells (4 x 2), each CELL_W x CELL_H metres; the rod (rotation axis) is the cell centre.
// =====================================================================================================
export const CELL_W = 2.4, CELL_H = 2.6, ATLAS_COLS = 4, ATLAS_ROWS = 2;

function rodAndBase(c, ox) {
  c.rect(ox - 0.007, 0.0, 0.014, 0.26);
  c.blob([[ox - 0.075, 0.0], [ox - 0.06, 0.016], [ox + 0.06, 0.016], [ox + 0.075, 0.0]], 0.6);
}

// ---- heads -----------------------------------------------------------------------------------------
// profile head facing f (+1 right, -1 left) centred (x,y); s = scale; tilt (rad, + = chin up)
const HEAD = [[0.085, 0.02], [0.06, 0.09], [0.0, 0.115], [-0.06, 0.098], [-0.083, 0.06], [-0.088, 0.025], [-0.112, -0.012], [-0.09, -0.024], [-0.094, -0.046], [-0.07, -0.08], [-0.02, -0.097], [0.03, -0.09], [0.07, -0.06]];
// local head frame faces -x; rotate by -tilt (chin up) then mirror for f = +1
function headXY(x, y, f, s, tilt, px, py) { const ca = Math.cos(tilt), sa = Math.sin(tilt); const rx = px * ca + py * sa, ry = -px * sa + py * ca; return [x - f * rx * s, y + ry * s]; }
function headProfile(c, x, y, f, s = 1, tilt = 0) { c.blob(HEAD.map(([px, py]) => headXY(x, y, f, s, tilt, px, py)), 1); }
function neck(c, x0, y0, x1, y1, r = 0.034) { c.limb([[x0, y0, r * 1.1], [x1, y1, r]]); }

// gilt masquerade mask on a profile head facing f (slim eye band with a swept wing)
function mask(c, x, y, f, s = 1, kind = 0, tilt = 0) {
  const g = (pts) => pts.map(([px, py]) => headXY(x, y, f, s, tilt, -px, py));
  if (kind === 0) { // colombina
    const p = c.spl(g([[0.108, 0.03], [0.07, 0.042], [0.02, 0.044], [-0.03, 0.056], [-0.07, 0.085], [-0.055, 0.04], [-0.01, 0.018], [0.06, 0.016], [0.11, 0.02]]), true, 1);
    c.gfill(p);
    const w = c.spl(g([[-0.045, 0.06], [-0.09, 0.105], [-0.075, 0.05]]), true, 1);
    c.fillPath(w); c.gfill(w);
  } else { // bauta-like beak
    const p = c.spl(g([[0.128, -0.005, 1], [0.1, 0.05], [0.02, 0.06], [-0.05, 0.045], [-0.045, 0.0], [0.04, -0.02]]), true, 1);
    c.fillPath(p); c.gfill(p);
  }
}

// ---- headgear ----
function beret(c, x, y, f, s = 1, featherDir = 1) {
  const P = (px, py) => [x + f * px * s, y + py * s];
  c.blob([P(-0.13, 0.07), P(-0.04, 0.125), P(0.09, 0.115), P(0.15, 0.075), P(0.1, 0.055), P(-0.08, 0.06)], 1);
  const [fx, fy] = P(-0.08, 0.1);
  c.plume(fx, fy, featherDir > 0 ? (f > 0 ? Math.PI * 0.8 : Math.PI * 0.2) : Math.PI * 0.5, 0.3 * s, 0.045 * s, f > 0 ? 0.7 : -0.7);
}
function tricorne(c, x, y, f, s = 1) {
  const P = (px, py) => [x + f * px * s, y + py * s];
  c.blob([P(-0.16, 0.06, 1), P(-0.12, 0.14), P(-0.02, 0.12), P(0.07, 0.15), P(0.15, 0.07, 1), P(0.0, 0.085)], 1);
}
function tallHat(c, x, y, f, s = 1) {
  const P = (px, py) => [x + f * px * s, y + py * s];
  c.blob([P(-0.11, 0.065, 1), P(-0.085, 0.24), P(0.06, 0.25), P(0.085, 0.07, 1), P(0.14, 0.06), P(0.0, 0.05), P(-0.15, 0.055)], 1);
  c.plume(x - f * 0.03 * s, y + 0.24 * s, f > 0 ? Math.PI * 0.72 : Math.PI * 0.28, 0.26 * s, 0.04 * s, f > 0 ? 0.8 : -0.8);
}
function chignon(c, x, y, f, s = 1) {
  c.fillPath(c.ell(x - f * 0.07 * s, y + 0.06 * s, 0.062 * s, 0.055 * s, -f * 0.3));
  c.fillPath(c.ell(x - f * 0.03 * s, y + 0.1 * s, 0.05 * s, 0.035 * s, f * 0.2));
}
function plumeHair(c, x, y, f, s = 1, side = -1) { // tall ostrich plume from the chignon
  c.plume(x - f * 0.08 * s, y + 0.1 * s, Math.PI / 2 + f * side * 0.55, 0.34 * s, 0.05 * s, f * side * 0.9);
  c.plume(x - f * 0.1 * s, y + 0.08 * s, Math.PI / 2 + f * side * 1.0, 0.22 * s, 0.035 * s, f * side * 0.8);
}
function tiara(c, x, y, f, s = 1) {
  const P = (px, py) => [x + f * px * s, y + py * s];
  const p = c.spl([P(-0.07, 0.09), P(-0.03, 0.15, 1), P(0.0, 0.11), P(0.03, 0.17, 1), P(0.06, 0.11), P(0.08, 0.13, 1), P(0.08, 0.085)], true, 0.6);
  c.fillPath(p); c.gfill(p);
}
function fanHeaddress(c, x, y, f, s = 1) { // lace fan / halo headdress behind the head (Colombina)
  const P = (px, py) => [x + f * px * s, y + py * s];
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = Math.PI * (0.15 + 0.7 * i / 14); const r = 0.2 + (i % 2 ? 0.0 : 0.022); pts.push(P(-0.06 + Math.cos(a) * r, 0.03 + Math.sin(a) * r)); }
  pts.push(P(0.0, 0.05)); pts.push(P(-0.1, 0.03));
  const path = c.spl(pts, true, 0.7);
  c.fillPath(path);
  // lace: punch small holes in a ring
  for (let i = 0; i < 9; i++) { const a = Math.PI * (0.22 + 0.56 * i / 8); const [hx, hy] = P(-0.06 + Math.cos(a) * 0.155, 0.03 + Math.sin(a) * 0.155); c.holePath(c.ell(hx, hy, 0.014 * s, 0.014 * s)); }
}
function ruff(c, x, y, s = 1) { // Elizabethan ruff collar
  const pts = [];
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; const r = (i % 2 ? 0.075 : 0.088) * s; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.42]); }
  c.blob(pts, 0.8);
}

// ---- bodies ------------------------------------------------------------------------------------------
// gentleman: doublet, hose, optional cape. ox = body centre x at hip, f = facing (+1 right)
function gentleman(c, ox, f, o = {}) {
  const P = (px, py) => [ox + f * px, py];
  const lean = o.lean ?? 0.0;
  const sh = (px, py) => P(px + lean * (py - 1.0), py); // lean the upper body back (away from f)
  // legs
  const sf = o.stepF ?? 0.08, sb = o.stepB ?? 0.08;
  c.limb([P(0.04, 0.98).concat(0.07), P(0.06 + sf * 0.5, 0.78).concat(0.058), P(0.08 + sf, 0.58).concat(0.042), P(0.085 + sf * 1.2, 0.43).concat(0.048), P(0.1 + sf * 1.6, 0.21).concat(0.028)]);
  c.limb([P(-0.06, 0.98).concat(0.07), P(-0.08 - sb * 0.5, 0.78).concat(0.058), P(-0.1 - sb, 0.58).concat(0.042), P(-0.11 - sb * 1.35, 0.43).concat(0.048), P(-0.12 - sb * 1.9, 0.23).concat(0.028)]);
  // shoes
  const fa = P(0.1 + (o.stepF ?? 0.08) * 1.6, 0.2), ba = P(-0.12 - (o.stepB ?? 0.08) * 1.9, 0.22);
  c.limb([[fa[0], fa[1] - 0.02, 0.03], [fa[0] + f * 0.11, 0.155, 0.018]]);
  c.limb([[ba[0], ba[1] - 0.02, 0.03], [ba[0] + f * 0.07, 0.145, 0.016]]);
  // doublet with peplum
  c.blob([sh(0.13, 1.46), sh(0.15, 1.36), P(0.12, 1.13), P(0.13, 1.0), P(0.17, 0.89, 1), P(-0.15, 0.89, 1), P(-0.12, 1.0), P(-0.11, 1.13), sh(-0.14, 1.38), sh(-0.12, 1.47), sh(0.0, 1.5)], 1);
  // puffed shoulders
  c.fillPath(c.ell(...sh(0.1, 1.44), 0.065, 0.05)); c.fillPath(c.ell(...sh(-0.1, 1.44), 0.065, 0.05));
  // neck + head
  const nb = sh(0.01, 1.48), nt = sh(0.02, 1.565);
  neck(c, nb[0], nb[1], nt[0], nt[1], 0.04);
  const hc = sh(0.025, 1.655);
  headProfile(c, hc[0], hc[1], f, 1.0, o.headTilt ?? 0.05);
  if (o.cape) {
    const q = (px, py) => sh(px, py);
    const cs = o.capeSwing ?? 1;
    c.blob([q(-0.08, 1.49), q(-0.16 - 0.06 * cs, 1.42), P(-0.28 - 0.2 * cs, 1.15), P(-0.34 - 0.3 * cs, 0.88), P(-0.27 - 0.24 * cs, 0.9), P(-0.2 - 0.18 * cs, 0.85), P(-0.12 - 0.08 * cs, 0.92), P(-0.1, 1.15), q(-0.06, 1.38)], 1);
    for (let k = 0; k < 5; k++) { const u = (k + 0.5) / 5; const hx = -0.14 - 0.1 * cs - (0.16 + 0.18 * cs) * u, hy = 0.97 + 0.02 * Math.sin(u * 6); c.holePath(c.ell(...P(hx, hy), 0.012, 0.012)); }
  }
  return { head: hc, shoulderF: sh(0.12, 1.44), shoulderB: sh(-0.12, 1.44), waist: P(0, 1.1) };
}

// lady: corseted bodice, long neck, gown. ox = waist centre x, f = facing
function lady(c, ox, f, o = {}) {
  const P = (px, py) => [ox + f * px, py];
  const lean = o.lean ?? 0.18; // lean back (away from f)
  const sh = (px, py) => P(px - lean * (py - 1.04), py);
  // gown first (sweep: + = trails behind her (away from f), - = toward f)
  const sw = o.sweep ?? 0.8, wd = o.gownW ?? 0.5, lift = o.lift ?? 0.08;
  const back = -wd - sw * 0.42, front = wd * 0.7 - Math.min(0, sw) * 0.2;
  const hem = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const u = i / N; const hx = front + (back - front) * u;
    const fold = (i % 2 ? 0.03 : -0.004) * (1 - 0.4 * u);
    const hy = 0.145 + fold + lift * Math.pow(u, 2.4) + (o.hemWave ?? 0.018) * Math.sin(u * 7.0 + 0.5);
    hem.push(P(hx, hy));
  }
  const hipB = -0.2 - Math.max(0, sw) * 0.04, hipF = 0.17;
  const gown = [P(0.068, 1.04), P(hipF * 0.8, 0.97), P(hipF, 0.88), P(front * 0.55 + 0.1, 0.55), P(front * 0.92, 0.27), ...hem,
    P(back * 0.9, 0.3 + lift * 0.8), P(back * 0.62, 0.5), P(back * 0.36 + hipB * 0.3, 0.72), P(hipB, 0.88), P(hipB * 0.6, 0.98), P(-0.07, 1.04)];
  c.blob(gown, 1);
  // cut-out lace band above the hem (Reiniger-style paper lace)
  for (let i = 1; i < hem.length - 1; i++) {
    const [x0, y0] = hem[i], [x1, y1] = hem[i + 1];
    for (let k = 0; k < 3; k++) {
      const u = k / 3, hx = x0 + (x1 - x0) * u, hy = y0 + (y1 - y0) * u + 0.075;
      c.holePath(c.ell(hx, hy, 0.011, 0.016));
      c.holePath(c.ell(hx + (x1 - x0) / 6, hy + 0.045, 0.006, 0.006));
    }
  }
  // bodice (leaning)
  c.blob([P(0.065, 1.03), sh(0.1, 1.2), sh(0.105, 1.31), sh(0.07, 1.385), sh(-0.02, 1.4), sh(-0.1, 1.38), sh(-0.105, 1.25), P(-0.07, 1.03)], 1);
  // puff sleeves
  c.fillPath(c.ell(...sh(0.07, 1.37), 0.052, 0.042)); c.fillPath(c.ell(...sh(-0.08, 1.37), 0.052, 0.042));
  if (o.ruff) ruff(c, ...sh(0.0, 1.44), 1.0);
  const nb = sh(-0.005, 1.38), nt = sh(-0.035 - lean * 0.15, 1.5);
  neck(c, nb[0], nb[1], nt[0], nt[1], 0.03);
  const hf = o.look ?? f; // head may look away over her shoulder
  const hc = sh(-0.035 - lean * 0.25, 1.585);
  headProfile(c, hc[0], hc[1], hf, 0.92, o.headTilt ?? 0.25);
  return { head: hc, hf, tilt: o.headTilt ?? 0.25, shoulderF: sh(0.08, 1.37), shoulderB: sh(-0.08, 1.37), gown, hem, waist: P(0, 1.04), front, back, P };
}

function gownDetail(c, L) {
  const [wx, wy] = L.waist;
  const n = L.hem.length;
  for (const i of [2, 4, 6, 8]) {
    if (i >= n - 1) continue;
    const [hx, hy] = L.hem[i];
    c.tline([[wx + (hx - wx) * 0.12, wy - 0.12], [wx + (hx - wx) * 0.5, wy - 0.5], [hx, hy + 0.12]], 0.006, false, 0.32);
  }
  c.gline(L.hem.slice(1, -1).map(([x, y]) => [x, y + 0.035]), 0.008);
  c.gline([[wx - 0.068, wy + 0.01], [wx + 0.068, wy + 0.01]], 0.01);
}

// ---- poses --------------------------------------------------------------------------------------------
// each draws a couple around rod x = ox. o: variant options
function poseClosed(c, ox, o) {
  // man on the right facing left, lady on the left leaning back, gown trailing left (classic hold)
  const L = lady(c, ox - 0.12, +1, { lean: o.lean ?? 0.2, sweep: o.sweep ?? 0.9, gownW: o.gownW ?? 0.5, look: -1, ruff: o.ruff, headTilt: 0.3, lift: o.lift ?? 0.1 });
  const G = gentleman(c, ox + 0.17, -1, { cape: o.cape, capeSwing: o.capeSwing ?? 1, stepF: 0.06, stepB: 0.07, lean: -0.05 });
  // her right arm reaching over his shoulder to the joined hands up-right; his left arm raised
  const hand = [ox + 0.5, 1.7];
  c.limb([[L.shoulderF[0], L.shoulderF[1], 0.028], [ox + 0.05, 1.53, 0.024], [ox + 0.24, 1.62, 0.02], [hand[0] - 0.02, hand[1], 0.017]]);
  c.limb([[G.shoulderB[0], G.shoulderB[1], 0.044], [ox + 0.38, 1.43, 0.036], [ox + 0.45, 1.5, 0.03], [hand[0] + 0.01, hand[1] - 0.01, 0.026]]);
  c.fillPath(c.ell(hand[0], hand[1] + 0.02, 0.032, 0.036));
  // her left hand on his shoulder
  c.limb([[L.shoulderB[0] + 0.1, L.shoulderB[1] + 0.02, 0.026], [ox + 0.1, 1.44, 0.022], [ox + 0.15, 1.47, 0.02]]);
  return { L, G };
}
function posePromenade(c, ox, o) {
  // both facing right, lady in front; joined hands extended forward, gown trailing behind
  const L = lady(c, ox + 0.06, +1, { lean: o.lean ?? 0.08, sweep: o.sweep ?? 1.15, gownW: o.gownW ?? 0.45, look: +1, headTilt: 0.2, lift: o.lift ?? 0.16, ruff: o.ruff });
  const G = gentleman(c, ox - 0.24, +1, { cape: o.cape, capeSwing: 1.2, stepF: 0.12, stepB: 0.1, lean: 0.0 });
  const hand = [ox + 0.62, 1.5];
  c.limb([[G.shoulderF[0], G.shoulderF[1], 0.045], [ox + 0.22, 1.36, 0.036], [hand[0] - 0.02, hand[1], 0.03]]);
  c.limb([[L.shoulderF[0], L.shoulderF[1], 0.03], [ox + 0.42, 1.41, 0.024], [hand[0] + 0.01, hand[1] + 0.01, 0.021]]);
  c.fillPath(c.ell(hand[0], hand[1] + 0.01, 0.034, 0.032));
  // her free arm swept back gracefully
  c.limb([[L.shoulderB[0], L.shoulderB[1], 0.028], [ox - 0.12, 1.2, 0.022], [ox - 0.3, 1.14, 0.018]]);
  return { L, G };
}
function poseTurn(c, ox, o) {
  // underarm turn: man left facing right lifts her hand above her head; bell gown flares wide
  const L = lady(c, ox + 0.12, -1, { lean: -0.04, sweep: o.sweep ?? -0.15, gownW: o.gownW ?? 0.62, look: -1, headTilt: 0.12, lift: o.lift ?? 0.12, hemWave: 0.035, ruff: o.ruff });
  const G = gentleman(c, ox - 0.33, +1, { cape: o.cape, capeSwing: 0.5, stepF: 0.04, stepB: 0.06, lean: 0.06 });
  const hand = [ox + 0.03, 2.0];
  c.limb([[G.shoulderF[0], G.shoulderF[1], 0.045], [ox - 0.12, 1.72, 0.036], [hand[0] - 0.01, hand[1] - 0.02, 0.03]]);
  c.limb([[L.shoulderB[0], L.shoulderB[1], 0.03], [ox + 0.07, 1.72, 0.024], [hand[0] + 0.01, hand[1], 0.021]]);
  c.fillPath(c.ell(hand[0], hand[1] + 0.02, 0.034, 0.034));
  // her other arm opened outward
  c.limb([[L.shoulderF[0], L.shoulderF[1], 0.028], [ox + 0.38, 1.3, 0.022], [ox + 0.6, 1.38, 0.018]]);
  c.fillPath(c.ell(ox + 0.62, 1.39, 0.02, 0.016));
  // his free hand on his hip / extended low
  c.limb([[G.shoulderB[0], G.shoulderB[1], 0.044], [ox - 0.6, 1.25, 0.034], [ox - 0.66, 1.08, 0.028]]);
  return { L, G };
}
function poseCheek(c, ox, o) {
  // close hold, upright, cheek to cheek; man left facing right; her train sweeps right behind her
  const L = lady(c, ox + 0.1, -1, { lean: 0.06, sweep: o.sweep ?? 1.0, gownW: o.gownW ?? 0.48, look: -1, headTilt: 0.1, lift: o.lift ?? 0.05, ruff: o.ruff });
  const G = gentleman(c, ox - 0.16, +1, { cape: o.cape, capeSwing: 0.9, stepF: 0.05, stepB: 0.09, lean: 0.02 });
  const hand = [ox - 0.5, 1.52];
  c.limb([[G.shoulderB[0], G.shoulderB[1], 0.046], [ox - 0.42, 1.38, 0.037], [hand[0] + 0.01, hand[1] - 0.01, 0.03]]);
  c.limb([[L.shoulderF[0], L.shoulderF[1], 0.03], [ox - 0.2, 1.47, 0.024], [hand[0] - 0.01, hand[1] + 0.01, 0.021]]);
  c.fillPath(c.ell(hand[0], hand[1] + 0.01, 0.033, 0.034));
  return { L, G };
}

const VARIANTS = [
  { pose: poseClosed, man: 'beret', lady: 'plume', cape: true, mask: 0 },
  { pose: posePromenade, man: 'tricorne', lady: 'fan', cape: false, mask: 0 },
  { pose: poseTurn, man: 'tall', lady: 'tiara', cape: true, mask: 1 },
  { pose: poseCheek, man: 'none', lady: 'plume', cape: true, mask: 0, ruff: true },
  { pose: poseClosed, man: 'tricorne', lady: 'tiara', cape: false, mask: 1, sweep: 1.15, gownW: 0.56, ruff: true },
  { pose: posePromenade, man: 'beret', lady: 'plume', cape: true, mask: 0, sweep: 0.9 },
  { pose: poseTurn, man: 'beret', lady: 'fan', cape: false, mask: 0, gownW: 0.7 },
  { pose: poseCheek, man: 'tall', lady: 'tiara', cape: false, mask: 1, sweep: 1.3 },
];

function dressHeads(c, R, v) {
  const { L, G } = R;
  const gf = G.head; const mf = Math.sign((G.head[0] - L.head[0]) || 1) * -1; // man faces the lady
  // man headgear (+ mask)
  if (v.man === 'beret') beret(c, gf[0], gf[1], mf, 1.0);
  else if (v.man === 'tricorne') tricorne(c, gf[0], gf[1], mf, 1.0);
  else if (v.man === 'tall') tallHat(c, gf[0], gf[1], mf, 1.0);
  else { c.fillPath(c.ell(gf[0] - mf * 0.06, gf[1] + 0.02, 0.06, 0.07)); }
  // lady hair
  chignon(c, L.head[0], L.head[1], L.hf, 0.92);
  if (v.lady === 'plume') plumeHair(c, L.head[0], L.head[1], L.hf, 0.92, 1);
  else if (v.lady === 'fan') fanHeaddress(c, L.head[0], L.head[1], L.hf, 0.92);
  else if (v.lady === 'tiara') tiara(c, L.head[0], L.head[1], L.hf, 0.92);
  return mf;
}

/** dancer atlas: returns { tex, cells, samples } (samples: per variant petal origins inside the silhouette) */
export function dancerAtlas({ preview = false, ppm = 210 } = {}) {
  const W = CELL_W * ATLAS_COLS, H = CELL_H * ATLAS_ROWS;
  const c = new Cut(W, H, ppm, { seed: 77 });
  const cells = [];
  VARIANTS.forEach((v, i) => {
    const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
    const x0 = col * CELL_W, y0 = row * CELL_H;
    const ox = x0 + CELL_W / 2;
    // draw in a cell-local vertical frame by shifting y
    const save = c.Y.bind(c); c.Y = (y) => save(y + y0);
    rodAndBase(c, ox);
    const R = v.pose(c, ox, v);
    const mf = dressHeads(c, R, v);
    // details last (gilt masks, gown trims, doublet buttons)
    mask(c, R.G.head[0], R.G.head[1], mf, 0.8, v.mask, 0.05);
    mask(c, R.L.head[0], R.L.head[1], R.L.hf, 0.74, 0, R.L.tilt);
    gownDetail(c, R.L);
    c.gline([[R.G.waist[0] - 0.1, 1.12], [R.G.waist[0] + 0.1, 1.12]], 0.014);
    c.Y = save;
    cells.push({ col, row, u0: col / ATLAS_COLS, v0: row / ATLAS_ROWS, du: 1 / ATLAS_COLS, dv: 1 / ATLAS_ROWS });
  });
  if (preview) return c;
  // petal origins: sample points inside each cell's silhouette (deterministic)
  const r = rng(991); const S = c.s.getImageData(0, 0, c.w, c.h).data;
  const samples = cells.map((cell) => {
    const pts = [];
    let guard = 0;
    while (pts.length < 64 && guard++ < 20000) {
      const u = r(), v = r() * 0.85;
      const px = Math.floor((cell.u0 + u * cell.du) * c.w), py = Math.floor((1 - (cell.v0 + v * cell.dv)) * c.h);
      if (S[(py * c.w + px) * 4 + 3] > 200) pts.push([u, v]);
    }
    return pts;
  });
  const tex = c.packCut();
  return { tex, cells, samples };
}

// =====================================================================================================
// ARCHITECTURE (hall: nave |x| < 7.5, aisles to |x| = 14, floor y = 0, ceiling y = 18.5, bays of 6 m)
// =====================================================================================================
export const HALL = {
  naveX: 7.5, outerX: 14, ceilY: 18.5, bay: 6, zFront: 13, zBack: -41, zc: -14,
  colR: 0.42, capTop: 7.0, imposTop: 7.5, archR: 2.45, stringY: 11.0, galleryY: 11.4, gallTop: 15.6,
  win: { x: 0, w: 6.4, y0: 3.2, ys: 13.0, pointed: 0.35, mull: [-1.07, 1.07], mullW: 0.14, transom: 8.5, roseY: 15.15, roseR: 1.42 },
};

function cornice(c, x, w, y, h, { dentils = 0, gilt = true } = {}) {
  c.rect(x, y, w, h);
  c.trect(x, y + h * 0.55, w, h * 0.12, 0.7);
  if (gilt) c.grect(x, y + h - 0.035, w, 0.025);
  if (dentils) for (let xx = x + 0.05; xx < x + w - 0.1; xx += dentils * 2) c.rect(xx, y - dentils * 0.9, dentils, dentils * 0.9);
}
function balustrade(c, x, w, y, h = 1.0, pitch = 0.26) {
  // cut the zone, then draw rails and turned balusters as solid paper
  c.hole(() => c.rect(x, y, w, h));
  c.rect(x, y, w, 0.15); c.rect(x - 0.05, y + h - 0.15, w + 0.1, 0.15);
  const n = Math.floor(w / pitch);
  for (let i = 0; i < n; i++) {
    const bx = x + (i + 0.5) * (w / n), bw = pitch * 0.3, y0 = y + 0.15, bh = h - 0.3;
    c.blob([[bx - bw * 0.55, y0, 1], [bx + bw * 0.55, y0, 1], [bx + bw * 0.4, y0 + bh * 0.12], [bx + bw * 0.95, y0 + bh * 0.38], [bx + bw * 0.35, y0 + bh * 0.72], [bx + bw * 0.5, y0 + bh * 0.9], [bx + bw * 0.55, y0 + bh, 1],
      [bx - bw * 0.55, y0 + bh, 1], [bx - bw * 0.5, y0 + bh * 0.9], [bx - bw * 0.35, y0 + bh * 0.72], [bx - bw * 0.95, y0 + bh * 0.38], [bx - bw * 0.4, y0 + bh * 0.12]], 1);
  }
}
function rosette(c, x, y, r, petals = 8) {
  const pts = [];
  for (let i = 0; i < petals * 2; i++) { const a = (i / (petals * 2)) * Math.PI * 2; const rr = i % 2 ? r * 0.55 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
  c.gfill(c.spl(pts, true, 0.9));
}
function quatrefoil(c, x, y, r) {
  const p = new Path2D();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; p.ellipse(c.X(x + Math.cos(a) * r * 0.5), c.Y(y + Math.sin(a) * r * 0.5), r * 0.52 * c.sx, r * 0.52 * c.sy, 0, 0, Math.PI * 2); }
  return p;
}

/** inner arcade bay: 6 m (column centre to column centre) x 18.5 m; tiles horizontally */
export function arcadeBayArt({ preview = false } = {}) {
  const H = HALL, c = new Cut(6, 18.5, 170, { seed: 5 });
  // full wall, then cut the arch, the gallery openings and the balustrade
  c.rect(0, 0, 6, 18.5);
  const pierW = 0.55, span = 6 - 2 * pierW, ys = H.imposTop;
  c.hole(() => { c.rect(pierW, -0.1, span, ys + 0.1); c.dome(3, ys, span / 2, span / 2); });
  // gallery: biforate pointed openings under a round relieving arch, behind a balustrade
  const gy = H.galleryY + 1.0;
  c.holePath(c.archPath(0.95, gy + 1.9, 1.85, { pointed: 0.3, down: 1.9 }));
  c.holePath(c.archPath(3.2, gy + 1.9, 1.85, { pointed: 0.3, down: 1.9 }));
  c.holePath(quatrefoil(c, 3.0, 14.95, 0.34));
  balustrade(c, 0.75, 4.5, H.galleryY, 1.0);
  // archivolt (raised tone band + gilt intrados line), keystone
  const ring = new Path2D(); ring.ellipse(c.X(3), c.Y(ys), (span / 2 + 0.42) * c.sx, (span / 2 + 0.42) * c.sy, 0, Math.PI, 0); ring.ellipse(c.X(3), c.Y(ys), (span / 2 + 0.02) * c.sx, (span / 2 + 0.02) * c.sy, 0, 0, Math.PI, true);
  c.tfill(ring, 0.75);
  c.gc.lineWidth = 0.05 * c.sx; c.gc.beginPath(); c.gc.ellipse(c.X(3), c.Y(ys), (span / 2 + 0.06) * c.sx, (span / 2 + 0.06) * c.sy, 0, Math.PI, 0); c.gc.stroke();
  c.trect(2.82, ys + span / 2 - 0.05, 0.36, 0.55, 0.9);
  // impost blocks
  for (const x of [0, 6]) { c.trect(x - 0.62, ys - 0.5, 1.24, 0.5, 0.8); c.grect(x - 0.62, ys - 0.06, 1.24, 0.03); }
  // spandrel roundels (half at each edge so the tiling joins)
  for (const x of [0, 6]) {
    c.tfill(c.ell(x, 9.95, 0.62, 0.62), 0.55); rosette(c, x, 9.95, 0.3, 8);
    c.gc.lineWidth = 0.035 * c.sx; c.gc.beginPath(); c.gc.ellipse(c.X(x), c.Y(9.95), 0.62 * c.sx, 0.62 * c.sy, 0, 0, Math.PI * 2); c.gc.stroke();
  }
  // string course with dentils, gallery cornice, frieze, crowning cornice with modillions
  cornice(c, 0, 6, H.stringY, 0.4, { dentils: 0.07 });
  c.trect(2.86, gy, 0.28, 1.95, 0.85); // colonnette between the lights
  cornice(c, 0, 6, H.gallTop, 0.4, { dentils: 0.06 });
  for (let x = 0.3; x < 6; x += 1.5) { rosette(c, x, 16.75, 0.2, 6); c.tline([[x + 0.25, 16.75], [x + 0.75, 16.45], [x + 1.25, 16.75]], 0.05, false, 0.6); }
  cornice(c, 0, 6, 17.65, 0.5, { dentils: 0 });
  for (let x = 0.2; x < 6; x += 0.6) c.rect(x, 17.42, 0.16, 0.23);
  if (preview) return c;
  return c.packCut({ repeatX: true });
}

/** outer aisle wall bay: tall arched window, sconces, gallery window; tiles horizontally */
export function outerBayArt({ preview = false } = {}) {
  const H = HALL, c = new Cut(6, 18.5, 110, { seed: 6 });
  c.rect(0, 0, 6, 18.5);
  // lower window (two lights + oculus) and upper gallery window
  c.holePath(c.archPath(2.05, 7.5, 1.9, { down: 5.0 }));
  c.rect(2.97, 2.5, 0.06, 5.6); c.rect(2.05, 5.6, 1.9, 0.06);
  c.fillPath(c.ell(3.0, 8.05, 0.32, 0.32)); c.holePath(quatrefoil(c, 3.0, 8.05, 0.26));
  c.holePath(c.archPath(2.3, 15.6, 1.4, { pointed: 0.25, down: 3.0 }));
  c.rect(2.97, 12.6, 0.06, 3.4);
  // window surrounds
  c.tfill(c.archPath(1.85, 7.5, 2.3, { down: 5.2 }), 0.5);
  c.holePath(c.archPath(2.05, 7.5, 1.9, { down: 5.0 }));
  c.rect(2.97, 2.5, 0.06, 5.6); c.rect(2.05, 5.6, 1.9, 0.06);
  c.fillPath(c.ell(3.0, 8.05, 0.32, 0.32)); c.holePath(quatrefoil(c, 3.0, 8.05, 0.26));
  // pilasters at the bay edges + dado
  for (const x of [0, 6]) { c.trect(x - 0.32, 0, 0.64, 10.8, 0.45); c.trect(x - 0.4, 10.2, 0.8, 0.6, 0.7); }
  c.trect(0, 0, 6, 1.3, 0.35); c.grect(0, 1.3, 6, 0.025);
  // candle sconces flanking the window: bracket (silhouette), flame + halo (glow)
  for (const x of [1.05, 4.95]) {
    c.limb([[x, 3.15, 0.04], [x, 3.45, 0.05]]); c.blob([[x - 0.16, 3.5], [x + 0.16, 3.5], [x + 0.1, 3.6], [x - 0.1, 3.6]], 0.5);
    c.rect(x - 0.025, 3.6, 0.05, 0.22);
    c.halo(x, 3.95, 0.3, 0.25); c.halo(x, 3.9, 0.07, 1.0, 0.13);
  }
  cornice(c, 0, 6, H.stringY, 0.4, { dentils: 0.07 });
  cornice(c, 0, 6, 17.65, 0.5);
  if (preview) return c;
  return c.packCut({ repeatX: true });
}

/** back wall (28 x 18.5): the great tracery window between niches; aisle doorways glow */
export function backWallArt({ preview = false } = {}) {
  const H = HALL, W = H.win, c = new Cut(28, 18.5, 100, { seed: 8 });
  const cx = 14;
  c.rect(0, 0, 28, 18.5);
  // window surround (tone) then the opening
  c.tfill(c.archPath(cx - W.w / 2 - 0.45, W.ys, W.w + 0.9, { pointed: W.pointed * 0.95, down: W.ys - W.y0 + 0.4 }), 0.6);
  c.holePath(c.archPath(cx - W.w / 2, W.ys, W.w, { pointed: W.pointed, down: W.ys - W.y0 }));
  // tracery: mullions, transom, lancet heads, rose
  for (const m of W.mull) c.rect(cx + m - W.mullW / 2, W.y0, W.mullW, W.ys - W.y0 + 0.6);
  c.rect(cx - W.w / 2, W.transom - 0.06, W.w, 0.12);
  const lw = (W.w - 2 * W.mullW) / 3;
  for (let i = 0; i < 3; i++) { // pointed lancet heads set in solid tracery
    const x0 = cx - W.w / 2 + i * (lw + W.mullW);
    c.rect(x0 - 0.02, W.ys - 0.35, lw + 0.04, 1.75);
    c.holePath(c.archPath(x0 + 0.06, W.ys - 0.35, lw - 0.12, { pointed: 0.32, down: 0.02 }));
    c.holePath(c.ell(x0 + lw / 2, W.ys + 1.08, 0.13, 0.13));
  }
  // rose: ring + six petals cut out
  const rr = W.roseR;
  c.fillPath(c.ell(cx, W.roseY, rr + 0.1, rr + 0.1));
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 2; c.holePath(c.ell(cx + Math.cos(a) * rr * 0.56, W.roseY + Math.sin(a) * rr * 0.56, rr * 0.33, rr * 0.33)); }
  c.holePath(c.ell(cx, W.roseY, rr * 0.18, rr * 0.18));
  c.gc.lineWidth = 0.05 * c.sx; c.gc.beginPath(); c.gc.ellipse(c.X(cx), c.Y(W.roseY), (rr + 0.06) * c.sx, (rr + 0.06) * c.sy, 0, 0, Math.PI * 2); c.gc.stroke();
  // niches with statues (glowing recess, black figure) between window and arcade
  for (const nx of [9.0, 19.0]) {
    c.glowFill(c.archPath(nx - 0.8, 5.6, 1.6, { down: 4.2 }), 0.18);
    c.halo(nx, 3.4, 1.4, 0.35, 2.4);
    c.tfill(c.archPath(nx - 1.0, 5.6, 2.0, { down: 4.4 }), 0.5);
    // statue: robed figure on a plinth
    c.rect(nx - 0.42, 1.4, 0.84, 0.35);
    c.blob([[nx - 0.32, 1.75], [nx - 0.36, 2.6], [nx - 0.25, 3.6], [nx - 0.18, 4.25], [nx - 0.06, 4.45], [nx + 0.12, 4.35], [nx + 0.22, 3.9], [nx + 0.42, 4.1], [nx + 0.46, 3.95], [nx + 0.26, 3.5], [nx + 0.3, 2.5], [nx + 0.36, 1.75]], 1);
    c.fillPath(c.ell(nx + 0.02, 4.66, 0.14, 0.17));
    c.limb([[nx + 0.15, 4.2, 0.06], [nx + 0.42, 4.55, 0.05], [nx + 0.5, 4.9, 0.04]]);
  }
  // aisle doorways (warm light beyond)
  for (const dx of [3.25, 24.75]) {
    c.tfill(c.archPath(dx - 1.35, 3.6, 2.7, { down: 3.7 }), 0.55);
    const door = c.archPath(dx - 1.05, 3.4, 2.1, { down: 3.4 });
    c.glowFill(door, 0.55); c.halo(dx, 1.0, 2.2, 0.6, 2.6);
    c.rect(dx - 1.05, 0, 0.32, 3.4); c.rect(dx + 0.73, 0, 0.32, 3.4); // door leaves ajar
  }
  // pilasters where the arcades meet the wall
  for (const px of [6.5, 21.5, 0.6, 27.4]) c.trect(px - 0.4, 0, 0.8, 11, 0.45);
  // gallery level: blind arcading
  for (const gx of [7.1, 9.0, 17.3, 19.2, 0.9, 2.8, 23.3, 25.2]) c.tfill(c.archPath(gx, 14.2, 1.6, { pointed: 0.3, down: 2.6 }), 0.5);
  cornice(c, 0, 28, H.stringY, 0.4, { dentils: 0.07 }); c.hole(() => c.rect(cx - W.w / 2, H.stringY - 0.2, W.w, 0.8));
  for (const m of W.mull) c.rect(cx + m - W.mullW / 2, H.stringY - 0.3, W.mullW, 1.0);
  cornice(c, 0, cx - W.w / 2 - 0.6, H.gallTop, 0.4); cornice(c, cx + W.w / 2 + 0.6, 28 - cx - W.w / 2 - 0.6, H.gallTop, 0.4);
  cornice(c, 0, 28, 17.65, 0.5);
  for (let x = 0.2; x < 28; x += 0.6) if (Math.abs(x - cx) > 2.6) c.rect(x, 17.42, 0.16, 0.23);
  c.gc.lineWidth = 0.05 * c.sx; c.gc.stroke(c.archPath(cx - W.w / 2 - 0.12, W.ys, W.w + 0.24, { pointed: W.pointed * 0.97, down: W.ys - W.y0 + 0.1 }));
  if (preview) return c;
  return c.packCut();
}

/** front wall (28 x 18.5) seen from inside: grand doorway with warm light, musicians' gallery, oculus */
export function frontWallArt({ preview = false } = {}) {
  const H = HALL, c = new Cut(28, 18.5, 80, { seed: 9 });
  const cx = 14;
  c.rect(0, 0, 28, 18.5);
  // grand doorway: warm glow from the corridor, doors swung open
  c.tfill(c.archPath(cx - 2.95, 5.5, 5.9, { down: 5.6 }), 0.6);
  const door = c.archPath(cx - 2.3, 5.5, 4.6, { down: 5.5 });
  c.glowFill(door, 0.75); c.halo(cx, 1.4, 3.6, 0.8, 4.2);
  c.rect(cx - 2.3, 0, 0.45, 5.4); c.rect(cx + 1.85, 0, 0.45, 5.4);
  c.gc.lineWidth = 0.05 * c.sx; c.gc.stroke(c.archPath(cx - 2.42, 5.5, 4.84, { down: 5.5 }));
  // musicians' gallery: balcony + lit arches with players
  balustrade(c, cx - 6, 12, 9.0, 1.1, 0.3);
  c.rect(cx - 6.3, 8.7, 12.6, 0.32);
  for (let i = 0; i < 4; i++) {
    const ax = cx - 5.6 + i * 2.9;
    const arch = c.archPath(ax, 12.4, 2.4, { down: 2.3 });
    c.glowFill(arch, 0.32); c.halo(ax + 1.2, 10.6, 1.6, 0.35, 1.5);
  }
  // players silhouetted against the light (lute, harp, viol, recorder)
  const head = (x, y) => c.fillPath(c.ell(x, y, 0.13, 0.16));
  head(cx - 4.3, 11.2); c.blob([[cx - 4.6, 10.1], [cx - 4.55, 10.85], [cx - 4.3, 11.0], [cx - 4.0, 10.85], [cx - 3.95, 10.1]], 1);
  c.fillPath(c.ell(cx - 3.85, 10.55, 0.28, 0.2, 0.5)); c.limb([[cx - 3.7, 10.7, 0.03], [cx - 3.25, 11.15, 0.025]]);
  head(cx - 1.35, 11.25); c.blob([[cx - 1.65, 10.1], [cx - 1.6, 10.9], [cx - 1.35, 11.05], [cx - 1.05, 10.9], [cx - 1.0, 10.1]], 1);
  c.poly([[cx - 0.95, 10.1], [cx - 0.55, 10.1], [cx - 0.45, 11.7], [cx - 0.75, 11.75]]); c.hole(() => c.poly([[cx - 0.85, 10.25], [cx - 0.62, 10.25], [cx - 0.57, 11.5], [cx - 0.74, 11.55]]));
  head(cx + 1.55, 11.2); c.blob([[cx + 1.25, 10.1], [cx + 1.3, 10.85], [cx + 1.55, 11.0], [cx + 1.85, 10.85], [cx + 1.9, 10.1]], 1);
  c.blob([[cx + 1.95, 10.15], [cx + 2.15, 10.3], [cx + 2.2, 10.75], [cx + 2.1, 11.2], [cx + 2.0, 11.25], [cx + 1.9, 10.8]], 1); c.limb([[cx + 2.05, 11.2, 0.02], [cx + 2.0, 11.7, 0.015]]);
  c.limb([[cx + 1.6, 10.7, 0.02], [cx + 2.5, 10.75, 0.008]]);
  head(cx + 4.45, 11.2); c.blob([[cx + 4.15, 10.1], [cx + 4.2, 10.85], [cx + 4.45, 11.0], [cx + 4.75, 10.85], [cx + 4.8, 10.1]], 1);
  c.limb([[cx + 4.35, 11.1, 0.025], [cx + 4.0, 10.7, 0.018]]);
  // oculus (rose) above
  c.holePath(c.ell(cx, 15.2, 1.5, 1.5));
  c.fillPath(c.ell(cx, 15.2, 0.32, 0.32));
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.limb([[cx + Math.cos(a) * 0.3, 15.2 + Math.sin(a) * 0.3, 0.06], [cx + Math.cos(a) * 1.5, 15.2 + Math.sin(a) * 1.5, 0.05]]); }
  c.gc.lineWidth = 0.05 * c.sx; c.gc.beginPath(); c.gc.ellipse(c.X(cx), c.Y(15.2), 1.58 * c.sx, 1.58 * c.sy, 0, 0, Math.PI * 2); c.gc.stroke();
  // aisle doors
  for (const dx of [3.25, 24.75]) { const d = c.archPath(dx - 1.0, 3.3, 2.0, { down: 3.3 }); c.glowFill(d, 0.45); c.halo(dx, 1.0, 1.8, 0.4, 2.2); }
  for (const px of [6.5, 21.5, 0.6, 27.4]) c.trect(px - 0.4, 0, 0.8, 11, 0.45);
  cornice(c, 0, 28, H.stringY + 1.6, 0.4, { dentils: 0.07 });
  cornice(c, 0, 28, 17.65, 0.5);
  if (preview) return c;
  return c.packCut();
}

/** ceiling bay (x across 28 m, y along 6 m of hall): coffers with gilt rosettes; tiles along the hall */
export function ceilingArt({ preview = false } = {}) {
  const c = new Cut(28, 6, 48, { seed: 10 });
  c.rect(0, 0, 28, 6);
  // nave coffers
  const n = 5, cw = 15 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
    const x = 6.5 + i * cw + 0.25, y = j * 3 + 0.35, w = cw - 0.5, h = 3 - 0.7;
    c.trect(x, y, w, h, 0.5); c.trect(x + 0.18, y + 0.18, w - 0.36, h - 0.36, 0.25);
    rosette(c, x + w / 2, y + h / 2, 0.32, 8);
    c.gc.lineWidth = 0.03 * c.sx; c.gc.strokeRect(c.X(x), c.Y(y + h), w * c.sx, h * c.sy);
  }
  // aisle panels
  for (const x0 of [0.4, 22.0]) { c.trect(x0, 0.4, 5.6, 5.2, 0.35); rosette(c, x0 + 2.8, 3, 0.25, 6); }
  if (preview) return c;
  return c.packCut({ repeatY: true });
}

/** heraldic banner: swallowtail cloth with a gilt rose roundel, border and tassels */
export function bannerArt({ preview = false } = {}) {
  const c = new Cut(1.7, 6.2, 150, { seed: 12 });
  const w = 1.5, x0 = 0.1, top = 6.0, bot = 0.35, notch = 0.85;
  c.poly([[x0, top], [x0 + w, top], [x0 + w, bot], [x0 + w / 2, bot + notch], [x0, bot]]);
  // hanging rod with finials
  c.rect(0.0, 6.0, 1.7, 0.07); c.fillPath(c.ell(0.03, 6.035, 0.05, 0.05)); c.fillPath(c.ell(1.67, 6.035, 0.05, 0.05));
  // border
  c.gc.lineWidth = 0.025 * c.sx;
  c.gc.stroke(c.spl([[x0 + 0.08, top - 0.15, 1], [x0 + w - 0.08, top - 0.15, 1], [x0 + w - 0.08, bot + 0.12, 1], [x0 + w / 2, bot + notch + 0.1, 1], [x0 + 0.08, bot + 0.12, 1]], true, 0));
  // heraldic rose in a roundel
  const ry = 3.8, cxr = x0 + w / 2;
  c.gc.lineWidth = 0.03 * c.sx; c.gc.beginPath(); c.gc.ellipse(c.X(cxr), c.Y(ry), 0.55 * c.sx, 0.55 * c.sy, 0, 0, Math.PI * 2); c.gc.stroke();
  for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + i * 2 * Math.PI / 5; c.gfill(c.ell(cxr + Math.cos(a) * 0.2, ry + Math.sin(a) * 0.2, 0.17, 0.17)); }
  for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i + 0.5) * 2 * Math.PI / 5; c.gfill(c.spl([[cxr + Math.cos(a) * 0.3, ry + Math.sin(a) * 0.3], [cxr + Math.cos(a + 0.12) * 0.42, ry + Math.sin(a + 0.12) * 0.42, 1], [cxr + Math.cos(a - 0.12) * 0.42, ry + Math.sin(a - 0.12) * 0.42, 1]], true, 0.5)); }
  c.tc.fillStyle = '#fff'; c.tfill(c.ell(cxr, ry, 0.09, 0.09), 1);
  // fleurons above and below
  for (const fy of [5.15, 2.35]) { c.gfill(c.ell(cxr, fy, 0.08, 0.08)); for (const s of [-1, 1]) c.gfill(c.ell(cxr + s * 0.13, fy - 0.04, 0.06, 0.04)); c.gfill(c.ell(cxr, fy + 0.12, 0.04, 0.07)); }
  // tassels
  for (const [tx, ty] of [[x0 + 0.02, bot], [x0 + w - 0.02, bot]]) { c.limb([[tx, ty + 0.02, 0.015], [tx, ty - 0.12, 0.01]]); c.blob([[tx - 0.05, ty - 0.12], [tx + 0.05, ty - 0.12], [tx + 0.04, ty - 0.33], [tx - 0.04, ty - 0.33]], 0.7); c.gfill(c.ell(tx, ty - 0.13, 0.05, 0.025)); }
  if (preview) return c;
  return c.packCut();
}

// ----------------------------------------------------------------------------------------------------
// FX textures (data, deterministic)
// ----------------------------------------------------------------------------------------------------
function valueGrid(r, n) { const g = new Float32Array((n + 1) * (n + 1)); for (let i = 0; i < g.length; i++) g[i] = r(); for (let i = 0; i <= n; i++) { g[i * (n + 1) + n] = g[i * (n + 1)]; g[n * (n + 1) + i] = g[i]; } return g; }
function vnoise(g, n, x, y) { const gx = x * n, gy = y * n, i = Math.floor(gx) % n, j = Math.floor(gy) % n, fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), N = n + 1;
  const a = g[j * N + i], b = g[j * N + i + 1], c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1]; return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbmTile(r, size, octs, gain = 0.5) {
  const grids = octs.map((n) => [n, valueGrid(r, n)]);
  const f = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let s = 0, a = 1, t = 0; for (const [n, g] of grids) { s += a * vnoise(g, n, x / size, y / size); t += a; a *= gain; } f[y * size + x] = s / t; }
  return f;
}
function dataTex(data, size, { repeat = true, mip = true } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; tex.generateMipmaps = mip;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true; return tex;
}
/** tiling noise: R = smooth fbm (burn thresholds), G = fine fbm, B = cellular-ish sparkle, A = 1 */
export function noiseTex(size = 256, seed = 4) {
  const r = rng(seed);
  const a = fbmTile(r, size, [4, 8, 16, 32]), b = fbmTile(r, size, [16, 32, 64]);
  const d = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { d[i * 4] = Math.round(Math.min(1, Math.max(0, (a[i] - 0.5) * 2.2 + 0.5)) * 255); d[i * 4 + 1] = Math.round(b[i] * 255); d[i * 4 + 2] = Math.round(r() * 255); d[i * 4 + 3] = 255; }
  return dataTex(d, size);
}
/** dark marble: R = mottling, G = veins (bright thin lines), B = slab variation */
export function marbleTex(size = 512, seed = 14) {
  const r = rng(seed);
  const m = fbmTile(r, size, [3, 6, 12, 24, 48], 0.55), w = fbmTile(r, size, [2, 4, 8, 16], 0.6), w2 = fbmTile(r, size, [3, 7, 14, 28], 0.5);
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const t = (x / size + y / size * 0.35) * 6.283 * 2 + w[i] * 9.0;
    const vein = Math.pow(1 - Math.abs(Math.sin(t)), 14) * 0.85 + Math.pow(1 - Math.abs(Math.sin(t * 2.3 + w2[i] * 7)), 30) * 0.5;
    d[i * 4] = Math.round(m[i] * 255); d[i * 4 + 1] = Math.round(Math.min(1, vein) * 255); d[i * 4 + 2] = Math.round(w2[i] * 255); d[i * 4 + 3] = 255;
  }
  return dataTex(d, size);
}
