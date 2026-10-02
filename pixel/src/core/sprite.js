// Sprites from ASCII art. Each character of the art is looked up in a palette object
// ({k: '#3e2731', s: '#e4a672', ...}); '.' and characters missing from the palette are transparent.
// Rows are trimmed, so art can be indented in the source.
import { env, ctx2d } from './env.js';
import { Gfx } from './gfx.js';

const cache = new Map();
let uid = 0;
const artIds = new Map();

export function parseArt(art) {
  const rows = art.split('\n').map((r) => r.trim()).filter((r) => r.length);
  const w = Math.max(...rows.map((r) => r.length));
  return { rows, w, h: rows.length };
}

function finish(c, w, h, ax, ay) {
  const fl = env.createCanvas(w, h);
  const fx = ctx2d(fl);
  fx.translate(w, 0);
  fx.scale(-1, 1);
  fx.drawImage(c, 0, 0);
  return { c, fl, w, h, ax: ax ?? w / 2, ay: ay ?? h };
}

// sprite(art, pal, {ax, ay}) -> {c, fl, w, h, ax, ay}; cached on (art, palette)
export function sprite(art, pal, o = {}) {
  let id = artIds.get(art);
  if (id === undefined) { id = uid++; artIds.set(art, id); }
  const key = id + '|' + JSON.stringify(pal) + '|' + (o.ax ?? '') + ',' + (o.ay ?? '');
  let s = cache.get(key);
  if (s) return s;
  const { rows, w, h } = parseArt(art);
  const c = env.createCanvas(w, h);
  const x = ctx2d(c);
  for (let j = 0; j < h; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      const col = pal[r[i]];
      if (!col || r[i] === '.') continue;
      x.fillStyle = col;
      x.fillRect(i, j, 1, 1);
    }
  }
  s = finish(c, w, h, o.ax, o.ay);
  cache.set(key, s);
  return s;
}

// procedural sprite: draw(g) on a w x h Gfx; cached by key when given
export function makeSprite(w, h, draw, o = {}, key = null) {
  if (key && cache.has(key)) return cache.get(key);
  const g = new Gfx(w, h);
  g.ctx.clearRect(0, 0, w, h);
  draw(g);
  const s = finish(g.c, w, h, o.ax, o.ay);
  if (key) cache.set(key, s);
  return s;
}

// a 1-px dark outline around everything opaque in a sprite (returns a new, 2 px larger sprite)
export function outlined(s, col, key) {
  if (key && cache.has(key)) return cache.get(key);
  const w = s.w + 2, h = s.h + 2;
  const src = ctx2d(s.c).getImageData(0, 0, s.w, s.h).data;
  const c = env.createCanvas(w, h);
  const x = ctx2d(c);
  x.fillStyle = col;
  const op = (i, j) => i >= 0 && j >= 0 && i < s.w && j < s.h && src[(j * s.w + i) * 4 + 3] > 0;
  for (let j = -1; j <= s.h; j++)
    for (let i = -1; i <= s.w; i++)
      if (!op(i, j) && (op(i - 1, j) || op(i + 1, j) || op(i, j - 1) || op(i, j + 1))) x.fillRect(i + 1, j + 1, 1, 1);
  x.drawImage(s.c, 1, 1);
  const r = finish(c, w, h, s.ax + 1, s.ay + 1);
  if (key) cache.set(key, r);
  return r;
}

export const spriteCache = cache;
