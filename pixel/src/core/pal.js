// ENDESGA-32 palette, the gray world ramp, and the colour remaps used by the post pass.
//
// Every pixel the film draws is one of these 32 colours (3D renders are quantized onto them too).
// The gray world is a remap: a pixel whose colour is in the table is swapped for its gray
// counterpart unless it lies inside a "colour zone". A colour drawn with ex() differs by one step
// of blue, so it is not in the table and stays coloured everywhere: neon, roses, the odd seed.

export const P = {
  rust: '#be4a2f', clay: '#d77643', cream: '#ead4aa', skin: '#e4a672', skinD: '#b86f50', brown: '#733e39', brownD: '#3e2731',
  redD: '#a22633', red: '#e43b44', orange: '#f77622', gold: '#feae34', yellow: '#fee761',
  green: '#63c74d', greenM: '#3e8948', greenD: '#265c42', greenK: '#193c3e',
  blueD: '#124e89', blue: '#0099db', cyan: '#2ce8f5',
  white: '#ffffff', g1: '#c0cbdc', g2: '#8b9bb4', g3: '#5a6988', g4: '#3a4466', g5: '#262b44', ink: '#181425',
  hot: '#ff0044', purple: '#68386c', magenta: '#b55088', pink: '#f6757a', peach: '#e8b796', tan: '#c28569',
};
export const ALL = Object.values(P);
export const GRAYS = [P.ink, P.g5, P.g4, P.g3, P.g2, P.g1, P.white];
// bright hues for unique things (flowers, freed people, light waves)
export const HUES = [P.red, P.orange, P.gold, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink, P.hot, P.purple, P.peach];
export const RAINBOW = [P.red, P.orange, P.gold, P.yellow, P.green, P.cyan, P.blue, P.purple, P.magenta];

export const hex2int = (h) => parseInt(h.slice(1, 7), 16);
export const int2hex = (v) => '#' + (v & 0xffffff).toString(16).padStart(6, '0');
const lum = (v) => 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);

// exempt variant: identical to the eye, invisible to the gray remap
const exCache = new Map();
export function ex(hex) {
  let e = exCache.get(hex);
  if (!e) {
    const v = hex2int(hex), b = v & 255;
    e = int2hex((v & 0xffff00) | (b === 0 ? 1 : b - 1));
    exCache.set(hex, e);
  }
  return e;
}

// nearest colour of a ramp by luminance
function nearestByLum(v, ramp) {
  const l = lum(v);
  let best = ramp[0], bd = 1e9;
  for (const r of ramp) { const d = Math.abs(lum(r) - l); if (d < bd) { bd = d; best = r; } }
  return best;
}

// remap tables: Map<rgb int, rgb int>, only palette colours are keys
function table(fn) {
  const m = new Map();
  for (const h of ALL) m.set(hex2int(h), fn(hex2int(h)));
  return m;
}
const grayInts = GRAYS.map(hex2int);
export const TBL = {
  gray: table((v) => nearestByLum(v, grayInts)),
  // Game Boy-ish green memory
  gb: table((v) => nearestByLum(v, ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'].map(hex2int))),
  // warm sepia memory
  sepia: table((v) => nearestByLum(v, [P.brownD, P.brown, P.tan, P.peach, P.cream].map(hex2int))),
  // one step darker and bluer, for storm light
  storm: table((v) => darkStep(v)),
  // night: everything into the blue-purple shadows
  night: table((v) => nearestByLum(v, [P.ink, P.g5, P.g4, P.blueD, P.g3, P.purple].map(hex2int))),
  // flash white
  white: table(() => 0xffffff),
  black: table(() => 0x181425),
};

// darker neighbour in the palette with a similar hue (for storm grading)
function darkStep(v) {
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  let best = v, bd = 1e9;
  for (const h of ALL) {
    const w = hex2int(h), R = (w >> 16) & 255, G = (w >> 8) & 255, B = w & 255;
    if (lum(w) >= lum(v) - 12) continue;
    const d = (R - r * 0.62) ** 2 + (G - g * 0.62) ** 2 + (B - Math.min(255, b * 0.75 + 20)) ** 2;
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}

// quantize an arbitrary colour onto the palette (3D renders); returns [nearest, second, mixAmount]
const PAL_RGB = ALL.map((h) => { const v = hex2int(h); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, v]; });
const qCaches = new Map();
// subset: optional array of hex colours to quantize onto (defaults to the whole palette)
export function quantize(r, g, b, subset = null) {
  const sk = subset ? subset.join('') : '';
  let qCache = qCaches.get(sk);
  if (!qCache) { qCache = new Map(); qCache.pal = subset ? subset.map((h) => { const v = hex2int(h); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, v]; }) : PAL_RGB; qCaches.set(sk, qCache); }
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let q = qCache.get(key);
  if (q) return q;
  let a = null, ad = 1e9, c = null, cd = 1e9;
  for (const p of qCache.pal) {
    const dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < ad) { c = a; cd = ad; a = p; ad = d; } else if (d < cd) { c = p; cd = d; }
  }
  // how far towards the second colour we are (for ordered dithering)
  const sa = Math.sqrt(ad), sc = Math.sqrt(cd);
  q = [a[3], c[3], sa / (sa + sc + 1e-6)];
  qCache.set(key, q);
  return q;
}

// a palette object with every colour swapped for its gray-world counterpart
export function grayPalette(pal) {
  const o = {};
  for (const k in pal) { const v = TBL.gray.get(hex2int(pal[k])); o[k] = v === undefined ? pal[k] : int2hex(v); }
  return o;
}
export function exPalette(pal) { const o = {}; for (const k in pal) o[k] = ex(pal[k]); return o; }
