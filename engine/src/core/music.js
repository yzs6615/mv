// Music clock: maps film time <-> song bars/beats and exposes analysed envelopes.
// The song starts at SONG_START seconds of film time; the prologue shares the same beat grid
// (negative bars), so the procedural score and every cut land on the song's pulse.

export const SONG_START = 44.0;
export const FPS = 24;

let MAP = null;
export function setMusicMap(m) { MAP = m; }
export const map = () => MAP;

export const BEAT = 0.50415675;
export const BAR = BEAT * 4;
export const T0 = 0.18993;

/** film time of the downbeat of bar n (n may be fractional or negative) */
export const bar = (n) => SONG_START + T0 + n * BAR;
/** film time of beat b counted from bar 0 */
export const beat = (b) => SONG_START + T0 + b * BEAT;
/** fractional bar position at film time t */
export const barAt = (t) => (t - SONG_START - T0) / BAR;
export const beatAt = (t) => (t - SONG_START - T0) / BEAT;

/** analysed envelope (rms|low|high|onset|intensity) at film time t, linearly interpolated, 0 outside song */
export function env(name, t) {
  if (!MAP) return 0;
  const a = MAP.env[name];
  const x = (t - SONG_START) * FPS;
  if (x < 0 || x >= a.length - 1) return 0;
  const i = Math.floor(x), f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
}

/** a decaying pulse (0..1) on every beat, peak at the beat, e.g. for subtle light breathing */
export function beatPulse(t, decay = 6) {
  const b = beatAt(t);
  const ph = b - Math.floor(b);
  return Math.exp(-ph * BEAT * decay);
}
