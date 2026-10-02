// The town, as pre-rendered parallax strips: a far skyline, mid-rise blocks with billboards, and the
// street-level facades with sidewalk, curb and road. Everything is drawn in muted colour and turned
// gray by the post pass, so the same town can bloom into colour at the end.
// Set pieces (flower shop, beauty booth, judge stage, paint shop) are drawn by their own scenes on
// top of reserved gaps in the near strip.
import { P, ex } from '../core/pal.js';
import { Gfx } from '../core/gfx.js';
import { rng } from '../core/math.js';
import { text } from '../core/font.js';

export const GROUND = 224; // feet row on the sidewalk (near strip coordinates)
export const SIDEWALK = [212, 230];

const FACADES = [
  { wall: P.clay, dark: P.rust, light: P.peach, trim: P.cream },
  { wall: P.tan, dark: P.brown, light: P.peach, trim: P.cream },
  { wall: P.g2, dark: P.g3, light: P.g1, trim: P.white },
  { wall: P.g3, dark: P.g4, light: P.g2, trim: P.g1 },
  { wall: P.cream, dark: P.tan, light: P.white, trim: P.brown },
  { wall: P.rust, dark: P.brown, light: P.clay, trim: P.cream },
  { wall: P.blueD, dark: P.g5, light: P.blue, trim: P.g1 },
  { wall: P.greenD, dark: P.greenK, light: P.greenM, trim: P.cream },
];
const SIGNS = ['第一补习班', '冠军银行', '标准照相馆', '排名健身', '优等生文具', '满分书店', '第一名速食', '标准牙科', '精英理发', '冠军房产', '一级便利店', '名次洗衣'];

function windowAt(g, x, y, w, h, f, lit, r) {
  g.rect(x - 1, y - 1, w + 2, h + 2, f.dark);
  g.rect(x, y, w, h, lit ? P.gold : P.g5);
  if (lit) { g.rect(x, y, w, 1, P.yellow); g.px(x + 1, y + 1, P.yellow); }
  else {
    g.px(x + 1, y + 1, P.g3);
    g.px(x + 2, y + 2, P.g3);
    if (r() < 0.5) g.rect(x, y, w, Math.floor(h / 2), P.g4); // blinds half down
  }
  g.rect(x - 1, y + h + 1, w + 2, 1, f.trim);
}

// one street-level building into the near strip; returns its right edge
function building(g, x, w, r, opts = {}) {
  const f = opts.f || r.pick(FACADES);
  const top = opts.top ?? r.int(28, 110);
  const base = SIDEWALK[0];
  // body
  g.rect(x, top, w, base - top, f.wall);
  g.rect(x, top, 2, base - top, f.light);
  g.rect(x + w - 2, top, 2, base - top, f.dark);
  // cornice and roof bits
  g.rect(x - 2, top - 3, w + 4, 3, f.trim);
  g.rect(x - 2, top, w + 4, 1, f.dark);
  if (r() < 0.5) { const ax = x + r.int(6, w - 10); g.rect(ax, top - 12, 6, 9, P.g3); g.rect(ax, top - 13, 6, 1, P.g2); }
  if (r() < 0.4) { const ax = x + r.int(4, w - 6); g.vline(ax, top - 20, top - 3, P.g4); g.px(ax, top - 21, P.red); }
  // storeys
  const storeyH = r.pick([22, 24, 26]);
  const shopH = 46;
  const ww = r.pick([6, 8, 10]), wh = r.pick([9, 11, 12]);
  const cols = Math.max(1, Math.floor((w - 10) / (ww + 8)));
  const gap = (w - cols * ww) / (cols + 1);
  for (let y = top + 8; y + wh < base - shopH - 4; y += storeyH) {
    for (let c = 0; c < cols; c++) {
      const wx = Math.round(x + gap + c * (ww + gap));
      windowAt(g, wx, y, ww, wh, f, r() < 0.12, r);
    }
    g.rect(x + 2, y + wh + 6, w - 4, 1, f.dark);
  }
  // ground floor: shop front
  const sy = base - shopH;
  g.rect(x, sy, w, 3, f.trim);
  g.rect(x, sy + 3, w, 1, f.dark);
  const kind = opts.kind || r.pick(['shop', 'shop', 'door', 'shutter']);
  if (kind === 'shop' || kind === 'shutter') {
    // sign board
    const sign = opts.sign || r.pick(SIGNS);
    const sw = Math.min(w - 8, sign.length * 12 + 8);
    const sx = Math.round(x + (w - sw) / 2);
    g.rect(sx - 1, sy + 5, sw + 2, 16, P.ink);
    g.rect(sx, sy + 6, sw, 14, opts.signCol || r.pick([P.blueD, P.redD, P.greenD, P.g5, P.purple]));
    text(g, sign, x + w / 2, sy + 7, { align: 'center', color: P.white });
    if (kind === 'shutter') {
      for (let y = sy + 24; y < base; y += 2) g.rect(x + 4, y, w - 8, 1, y % 4 ? P.g3 : P.g2);
      g.rect(x + 4, base - 2, w - 8, 2, P.g4);
    } else {
      // window + door
      const dw = 14;
      g.rect(x + 4, sy + 24, w - 8 - dw - 4, base - sy - 26, P.g5);
      g.rect(x + 5, sy + 25, w - 10 - dw - 4, base - sy - 28, P.g4);
      for (let i = 0; i < 3; i++) g.line(x + 8 + i * 9, sy + 27, x + 4 + i * 9, sy + 35, P.g3);
      const dx = x + w - dw - 4;
      g.rect(dx, sy + 22, dw, base - sy - 22, P.ink);
      g.rect(dx + 1, sy + 23, dw - 2, base - sy - 23, f.dark);
      g.rect(dx + 3, sy + 25, dw - 6, 10, P.g4);
      g.px(dx + dw - 4, sy + 38, P.gold);
    }
  } else {
    // residential door with steps
    const dx = Math.round(x + w / 2 - 7);
    g.rect(dx - 2, sy + 10, 18, base - sy - 10, f.trim);
    g.rect(dx, sy + 12, 14, base - sy - 12, P.brownD);
    g.rect(dx + 1, sy + 13, 12, base - sy - 15, P.brown);
    g.rect(dx + 3, sy + 15, 3, 8, P.brownD); g.rect(dx + 8, sy + 15, 3, 8, P.brownD);
    g.px(dx + 10, sy + 26, P.gold);
    g.rect(x + 6, sy + 16, 10, 12, P.g5); g.rect(x + w - 16, sy + 16, 10, 12, P.g5);
    g.px(x + 7, sy + 17, P.g3); g.px(x + w - 15, sy + 17, P.g3);
  }
  return x + w;
}

function sidewalk(g, x0, x1) {
  const [a, b] = SIDEWALK;
  g.rect(x0, a, x1 - x0, b - a, P.g2);
  for (let x = x0 - (x0 % 16); x < x1; x += 16) g.vline(x, a, b - 1, P.g3);
  g.rect(x0, a + 8, x1 - x0, 1, P.g3);
  g.rect(x0, a, x1 - x0, 1, P.g1);
  // curb and road
  g.rect(x0, b, x1 - x0, 2, P.g1);
  g.rect(x0, b + 2, x1 - x0, 4, P.g3);
  g.rect(x0, b + 6, x1 - x0, 270 - b - 6, P.g4);
  for (let x = x0 - (x0 % 40); x < x1; x += 40) g.rect(x, 252, 20, 2, P.g2);
  g.rect(x0, b + 6, x1 - x0, 1, P.g5);
}

// street furniture into the near strip
function lamp(g, x) {
  g.rect(x - 1, 120, 3, SIDEWALK[0] + 6 - 120, P.g5);
  g.rect(x, 120, 1, SIDEWALK[0] + 6 - 120, P.g4);
  g.rect(x - 3, SIDEWALK[0] + 2, 7, 4, P.g5);
  g.rect(x - 1, 118, 10, 3, P.g5);
  g.rect(x + 6, 121, 6, 3, P.g5);
  g.rect(x + 7, 124, 4, 1, P.g1);
}
function hydrant(g, x) {
  const y = SIDEWALK[0] + 4;
  g.rect(x - 3, y - 10, 7, 10, P.ink); g.rect(x - 2, y - 9, 5, 9, P.red); g.rect(x - 4, y - 7, 9, 2, P.redD); g.rect(x - 1, y - 12, 3, 2, P.redD);
}
function bin(g, x) {
  const y = SIDEWALK[0] + 4;
  g.rect(x - 5, y - 12, 11, 12, P.ink); g.rect(x - 4, y - 11, 9, 11, P.greenD); g.rect(x - 5, y - 13, 11, 2, P.greenK);
  g.vline(x - 2, y - 10, y - 2, P.greenK); g.vline(x + 2, y - 10, y - 2, P.greenK);
}
function bench(g, x) {
  const y = SIDEWALK[0] + 4;
  g.rect(x - 12, y - 8, 25, 3, P.brown); g.rect(x - 12, y - 13, 25, 3, P.brown); g.rect(x - 12, y - 8, 25, 1, P.clay);
  g.rect(x - 10, y - 5, 2, 5, P.ink); g.rect(x + 9, y - 5, 2, 5, P.ink);
}

export function buildCity(seed = 7, length = 3600, gaps = []) {
  const r = rng(seed);
  const near = new Gfx(length, 270);
  near.ctx.clearRect(0, 0, length, 270);
  // facades, leaving gaps for set pieces: gaps = [[x0, x1, opts?], ...]
  let x = -10;
  const inGap = (a, b) => gaps.find(([g0, g1]) => a < g1 && b > g0);
  while (x < length) {
    const gp = gaps.find(([g0]) => g0 >= x && g0 < x + 200);
    let w = r.int(70, 150);
    if (gp && x + w > gp[0]) w = gp[0] - x;
    if (w >= 40 && !inGap(x, x + w)) building(near, x, w, r);
    else if (w > 0 && !inGap(x, x + w)) near.rect(x, 60, w, SIDEWALK[0] - 60, P.g4);
    x += w;
    const g2 = gaps.find(([g0, g1]) => x >= g0 && x < g1);
    if (g2) x = g2[1];
  }
  sidewalk(near, 0, length);
  // furniture
  for (let i = 60; i < length; i += 190 + Math.floor(r() * 60)) {
    if (!inGap(i - 20, i + 20)) lamp(near, i);
    const j = i + 70 + Math.floor(r() * 40);
    if (!inGap(j - 15, j + 15)) [hydrant, bin, bench, bin][Math.floor(r() * 4)](near, j);
  }

  // mid layer: taller blocks with billboards
  const midLen = Math.ceil(length * 0.5 + 520);
  const mid = new Gfx(midLen, 270);
  mid.ctx.clearRect(0, 0, midLen, 270);
  x = -20;
  while (x < midLen) {
    const w = r.int(50, 110), top = r.int(20, 90);
    const col = r.pick([P.g3, P.g4, P.blueD, P.brown, P.tan]);
    mid.rect(x, top, w, 200 - top, col);
    mid.rect(x, top, 1, 200 - top, P.g2);
    for (let y = top + 6; y < 190; y += 10) for (let c = x + 5; c < x + w - 5; c += 8) mid.rect(c, y, 4, 5, r() < 0.08 ? P.gold : P.g5);
    if (r() < 0.35) {
      // billboard on the roof
      const bw = Math.min(w + 10, 70), bx = x + (w - bw) / 2, by = top - 30;
      mid.rect(bx + 6, by + 22, 2, 8, P.g5); mid.rect(bx + bw - 8, by + 22, 2, 8, P.g5);
      mid.rect(bx - 1, by - 1, bw + 2, 24, P.ink);
      mid.rect(bx, by, bw, 22, P.white);
      const msg = r.pick(['微笑标准', 'BE No.1', '标准即美', '人人第一', 'SMILE!', '别落后']);
      text(mid, msg, bx + bw / 2, by + 5, { align: 'center', color: P.red, font: /[A-Z]/.test(msg) ? 'en' : 'zh' });
    }
    x += w + r.int(-6, 8);
  }

  // far skyline
  const farLen = Math.ceil(length * 0.25 + 520);
  const far = new Gfx(farLen, 270);
  far.ctx.clearRect(0, 0, farLen, 270);
  x = -10;
  while (x < farLen) {
    const w = r.int(24, 60), top = r.int(30, 120);
    far.rect(x, top, w, 220 - top, P.g4);
    far.rect(x + 2, top + 3, w - 4, 1, P.g3);
    if (r() < 0.3) far.vline(x + Math.floor(w / 2), top - 14, top, P.g4);
    for (let y = top + 6; y < 200; y += 7) for (let c = x + 3; c < x + w - 3; c += 5) if (r() < 0.1) far.px(c, y, P.g2);
    x += w + r.int(-4, 4);
  }
  return { near, mid, far, length };
}

// sky behind the town: overcast, banded and dithered
export function drawSky(g, oy = 0, kind = 'gray') {
  const stops = kind === 'gray'
    ? [[0, P.g4], [40, P.g3], [110, P.g2], [180, P.g1]]
    : kind === 'dusk' ? [[0, P.purple], [60, P.magenta], [130, P.pink], [190, P.peach]]
    : [[0, P.blue], [70, P.cyan], [150, P.white]];
  g.vgrad(0, oy - 200, g.W, [[0, stops[0][1]], ...stops.map(([y, c]) => [y + 200, c]), [600, stops[stops.length - 1][1]]], 2);
}

// draw the three layers for a camera at (cx, cy) in near-strip coordinates
export function drawCity(g, city, cx, cy = 0) {
  const R = Math.round;
  g.blit(city.far.c, -R(cx * 0.25), R(-cy * 0.3) + 20);
  g.blit(city.mid.c, -R(cx * 0.5), R(-cy * 0.6) + 10);
  g.blit(city.near.c, -R(cx), R(-cy));
}

export { ex };
