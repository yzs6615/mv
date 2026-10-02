// Music clock: beat grid, bars (with the half bar before verse 2), sections, envelopes, melody.
import { clamp } from './math.js';

export class Music {
  constructor(map) {
    this.map = map;
    this.beat = map.beat;
    this.t0 = map.t0;
    this.bars = map.bars;
    this.sections = map.sections;
    this.fps = map.env.fps;
    this.env = map.env;
    this.midi = map.pitch.midi;
    this.duration = map.duration;
  }
  beatF(t) { return (t - this.t0) / this.beat; }
  beatTime(i) { return this.t0 + i * this.beat; }
  // time since the most recent beat
  sinceBeat(t) { const b = this.beatF(t); return b < 0 ? 1e9 : (b - Math.floor(b)) * this.beat; }
  barIndex(t) {
    const B = this.bars;
    if (t < B[0]) return -1;
    let lo = 0, hi = B.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (B[m] <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  barTime(i) { return this.bars[Math.max(0, Math.min(this.bars.length - 1, i))]; }
  sinceBar(t) { const i = this.barIndex(t); return i < 0 ? 1e9 : t - this.bars[i]; }
  // exponential flash after each beat / bar
  pulse(t, decay = 7) { return Math.exp(-decay * this.sinceBeat(t)); }
  barPulse(t, decay = 3.5) { return Math.exp(-decay * this.sinceBar(t)); }
  // sampled envelopes (mix, voc, acc, low) in 0..~1
  e(name, t) {
    const a = this.env[name];
    const x = clamp(t * this.fps, 0, a.length - 1.001);
    const i = Math.floor(x), f = x - i;
    return a[i] * (1 - f) + a[i + 1] * f;
  }
  // smoothed envelope (box average over +-w seconds)
  es(name, t, w = 0.15) {
    const a = this.env[name];
    const i0 = Math.max(0, Math.floor((t - w) * this.fps)), i1 = Math.min(a.length - 1, Math.ceil((t + w) * this.fps));
    let s = 0;
    for (let i = i0; i <= i1; i++) s += a[i];
    return s / Math.max(1, i1 - i0 + 1);
  }
  // sung pitch as MIDI number, 0 when nothing is sung
  pitch(t) {
    const i = Math.round(t * this.fps);
    if (i < 0 || i >= this.midi.length) return 0;
    return this.e('voc', t) > 0.08 ? this.midi[i] : 0;
  }
  section(t) {
    for (const s of this.sections) if (t >= s.start && t < s.end) return s;
    return this.sections[this.sections.length - 1];
  }
}
