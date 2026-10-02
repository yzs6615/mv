// The gardener's flower: grown from the odd seed, lopsided on purpose. A crooked stem, one ordinary
// leaf and one glitchy rainbow leaf, a striped bud, and a bloom of seven petals that are all a
// different size and colour, cycling slowly through the palette.
import { P, RAINBOW, ex } from '../core/pal.js';

// opts: grow 0..1 (stem), open 0..1 (bud -> bloom), t (palette cycling), sway (px), scale (1|2),
// exempt (stay coloured in the gray world), height (px)
export function heroFlower(g, x, y, o = {}) {
  const X = o.exempt ? ex : (c) => c;
  const grow = Math.max(0, Math.min(1, o.grow ?? 1));
  const open = Math.max(0, Math.min(1.2, o.open ?? 0));
  const t = o.t || 0;
  const H = Math.round((o.height || 26) * grow);
  if (H < 1) return;
  const sway = o.sway || 0;
  const cyc = Math.floor(t * 6);
  const stemX = (i) => Math.round(x + Math.sin((i / Math.max(1, H)) * 2.2) * 2 * grow + (sway * i) / Math.max(1, H));
  // stem (2 px, with a kink)
  for (let i = 0; i < H; i++) {
    const sx = stemX(i);
    g.px(sx, y - 1 - i, X(P.greenM));
    if (i > 2 && i < H - 2) g.px(sx + 1, y - 1 - i, X(P.greenD));
  }
  // leaves
  if (H > 5) {
    const ly = y - Math.round(H * 0.35), lx = stemX(Math.round(H * 0.35));
    const n = Math.min(4, Math.round(H / 5));
    for (let i = 1; i <= n; i++) { g.px(lx - i, ly - Math.floor(i / 2), X(P.green)); g.px(lx - i, ly - Math.floor(i / 2) + 1, X(P.greenM)); }
  }
  if (H > 10) {
    const ly = y - Math.round(H * 0.6), lx = stemX(Math.round(H * 0.6)) + 1;
    const n = Math.min(5, Math.round(H / 4));
    for (let i = 1; i <= n; i++) {
      g.px(lx + i, ly - Math.floor(i / 2), X(RAINBOW[(i + cyc) % RAINBOW.length]));
      g.px(lx + i, ly - Math.floor(i / 2) + 1, X(RAINBOW[(i + cyc + 4) % RAINBOW.length]));
    }
  }
  const hx = stemX(H), hy = y - H;
  if (open <= 0) {
    // tiny sprout tip or bud depending on growth
    if (grow < 0.6) { g.px(hx - 1, hy, X(P.green)); g.px(hx + 1, hy - 1, X(P.green)); return; }
    const b = Math.round(2 + grow * 2);
    g.oval(hx, hy - b, b - 1, b, X(P.ink));
    for (let r = -b + 1; r < b; r++) g.hline(hx - (b - 2), hx + (b - 2), hy - b + r, X(RAINBOW[(r + b + cyc) % RAINBOW.length]));
    g.px(hx, hy - 2 * b, X(P.white));
    return;
  }
  // bloom: seven petals around the head, each its own size and colour
  const R = (o.size || 5) * Math.min(1, open);
  const petals = [[0.0, 1.0], [0.85, 0.75], [1.8, 1.15], [2.7, 0.8], [3.5, 1.05], [4.4, 0.7], [5.3, 0.95]];
  petals.forEach(([a, s], i) => {
    const ang = a + (o.spin || 0) - Math.PI / 2;
    const d = R * 0.9 * s;
    const px = hx + Math.cos(ang) * d, py = hy - R + Math.sin(ang) * d;
    const col = RAINBOW[(i * 2 + Math.floor(cyc / 2)) % RAINBOW.length];
    g.disc(px, py, Math.max(1, R * 0.55 * s), X(P.ink));
  });
  petals.forEach(([a, s], i) => {
    const ang = a + (o.spin || 0) - Math.PI / 2;
    const d = R * 0.9 * s;
    const px = hx + Math.cos(ang) * d, py = hy - R + Math.sin(ang) * d;
    const col = RAINBOW[(i * 2 + Math.floor(cyc / 2)) % RAINBOW.length];
    g.disc(px, py, Math.max(0.5, R * 0.55 * s - 1), X(col));
  });
  g.disc(hx, hy - R, Math.max(1, R * 0.4), X(P.gold));
  g.px(hx - 1, hy - R - 1, X(P.white));
}
