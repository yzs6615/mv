// Deterministic math helpers. Everything in the film is a pure function of time:
// no Math.random(), no accumulated state — any frame can be rendered in any order.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * t * (t * (t * 6 - 15) + 10); };
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  // camera-operator ease: slow start, long glide, gentle settle
  glide: (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
};

// mulberry32 — small seeded PRNG
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash1(n) { // stateless hash -> [0,1)
  let x = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B);
  x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// 1D value noise (smooth), deterministic
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash1(i * 7919 + seed * 104729), b = hash1((i + 1) * 7919 + seed * 104729);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u; // [0,1)
}
export const snoise1 = (x, seed = 0) => noise1(x, seed) * 2 - 1;
export function fbm1(x, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * snoise1(x * f, seed + i * 31); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// Keyframe track: keys = [[t, value], ...] where value is number or array; per-key easing optional [t, v, easeFn]
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1, e] = keys[i + 1];
  const u = (e || ease.inOutSine)((t - t0) / (t1 - t0));
  if (Array.isArray(v0)) return v0.map((x, k) => lerp(x, v1[k], u));
  return lerp(v0, v1, u);
}

// Centripetal Catmull-Rom through points (arrays of 3), u in [0,1] across the whole path
export function catmull(points, u) {
  const n = points.length - 1;
  const x = clamp(u) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const t = x - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

// Deterministic "camera operator" shake: smooth, multi-frequency, amplitude in world units/radians
export function handheld(t, amp = 1, speed = 1, seed = 1) {
  return [
    fbm1(t * 0.9 * speed, seed, 3) * amp,
    fbm1(t * 0.7 * speed, seed + 11, 3) * amp,
    fbm1(t * 0.5 * speed, seed + 23, 3) * amp * 0.5,
  ];
}
