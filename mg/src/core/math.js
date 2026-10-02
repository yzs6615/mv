// Math, easing, deterministic randomness and noise. Everything in the film is a pure function of
// time, so nothing here touches Math.random or the clock.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (x - a) / (b - a);
export const remap = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * x);
export const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a)));
export const fract = (x) => x - Math.floor(x);
export const mix2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

const pow = Math.pow;
export const E = {
  lin: (t) => t,
  inQ: (t) => t * t,
  outQ: (t) => 1 - (1 - t) * (1 - t),
  ioQ: (t) => (t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2),
  inC: (t) => t * t * t,
  outC: (t) => 1 - pow(1 - t, 3),
  ioC: (t) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
  inQt: (t) => t * t * t * t,
  outQt: (t) => 1 - pow(1 - t, 4),
  ioQt: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2),
  outQn: (t) => 1 - pow(1 - t, 5),
  ioQn: (t) => (t < 0.5 ? 16 * pow(t, 5) : 1 - pow(-2 * t + 2, 5) / 2),
  inExpo: (t) => (t <= 0 ? 0 : pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - pow(2, -10 * t)),
  ioExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2),
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * pow(t - 1, 3) + s * pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  ioBack: (t, s = 1.70158 * 1.525) =>
    t < 0.5 ? (pow(2 * t, 2) * ((s + 1) * 2 * t - s)) / 2 : (pow(2 * t - 2, 2) * ((s + 1) * (t * 2 - 2) + s) + 2) / 2,
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

// progress of t through [t0, t1], eased and clamped
export const prog = (t, t0, t1, e = E.lin) => e(clamp((t - t0) / (t1 - t0)));
// 0 -> 1 -> 0 window with eased ramps
export const win = (t, a, b, c, d, e = E.ioC) => (t <= a || t >= d ? 0 : t < b ? e((t - a) / (b - a)) : t <= c ? 1 : 1 - e((t - c) / (d - c)));
// damped spring that settles at 1 (overshoots once or twice)
export const spring = (t, freq = 1.6, damp = 7) => (t <= 0 ? 0 : 1 - Math.exp(-damp * t) * Math.cos(TAU * freq * t));
// decaying wobble around 0, useful for squash and stretch
export const wobble = (t, freq = 3, damp = 6) => (t <= 0 ? 0 : Math.exp(-damp * t) * Math.sin(TAU * freq * t));

// integer hash -> [0,1)
export function hash(a) {
  a = (a | 0) + 0x6d2b79f5;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const hash2 = (a, b) => hash(Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263));
export const hash3 = (a, b, c) => hash(Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177));

// seeded generator (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.weighted = (pairs) => {
    let s = 0;
    for (const [, w] of pairs) s += w;
    let x = f() * s;
    for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
    return pairs[pairs.length - 1][0];
  };
  return f;
}

// smooth value noise in [-1, 1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash2(i, seed), b = hash2(i + 1, seed);
  return lerp(a, b, smooth(f)) * 2 - 1;
}
export function noise2(x, y, seed = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const a = hash3(i, j, seed), b = hash3(i + 1, j, seed), c = hash3(i, j + 1, seed), d = hash3(i + 1, j + 1, seed);
  const u = smooth(fx), v = smooth(fy);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function fbm1(x, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * noise1(x * f, seed + o * 17); a *= 0.5; f *= 2.03; }
  return s;
}

// colour helpers (hex <-> rgb, mixing)
const cache = new Map();
export function rgb(hex) {
  let v = cache.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    cache.set(hex, v);
  }
  return v;
}
export const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`);
export function mix(h1, h2, t, a = 1) {
  const p = rgb(h1), q = rgb(h2);
  return css([lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)], a);
}
export const alpha = (hex, a) => css(rgb(hex), a);
// desaturate towards paper and darken, used for depth and for "memory" grading
export function grade(hex, sat = 1, light = 0) {
  const [r, g, b] = rgb(hex);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  let c = [lerp(l, r, sat), lerp(l, g, sat), lerp(l, b, sat)];
  if (light > 0) c = c.map((v) => lerp(v, 255, light));
  else if (light < 0) c = c.map((v) => v * (1 + light));
  return css(c);
}
