// The timeline: which scene draws when, how scenes hand over (dither dissolve, iris, mosaic, cut),
// integer zoom for close-ups, screen shake, then the HUD and lyric overlays at native resolution.
import { Gfx } from './core/gfx.js';
import { dissolve, mosaicPass, quantizePass } from './core/post.js';
import { P } from './core/pal.js';
import { Lyrics } from './lyrics.js';
import { iris, shatter } from './art/fx.js';
import { SCENES } from './scenes/index.js';

export class Film {
  constructor({ music, lyrics, W, H }) {
    this.m = music;
    this.lyrics = lyrics;
    this.W = W;
    this.H = H;
    this.pool = new Map();
    this.cueList = [];
  }
  async init() {
    const ctx = { m: this.m, lyrics: this.lyrics, W: this.W, H: this.H, cue: (t, name, opt = {}) => this.cueList.push({ t: +t.toFixed(4), name, ...opt }) };
    this.ctx = ctx;
    this.scenes = SCENES.map((S) => S(ctx)).sort((a, b) => a.t0 - b.t0);
    for (const s of this.scenes) if (s.init) await s.init();
    this.lyr = new Lyrics(ctx);
    this.blank = new Gfx(this.W, this.H);
  }
  cues() { return [...this.cueList].sort((a, b) => a.t - b.t); }

  buf(w, h, slot) {
    const k = `${w}x${h}#${slot}`;
    let g = this.pool.get(k);
    if (!g) { g = new Gfx(w, h); this.pool.set(k, g); }
    return g;
  }

  // render one scene at time t into a native-size buffer. Integer zooms get pooled buffers; a
  // fractional zoom (only during a camera move) reuses one buffer that is resized as needed.
  renderScene(s, t, slot) {
    let z = s.zoom ? Math.max(1, s.zoom(t)) : 1;
    if (Math.abs(z - Math.round(z)) < 0.01) z = Math.round(z);
    const w = Math.ceil(this.W / z), h = Math.ceil(this.H / z);
    let g;
    if (Number.isInteger(z)) g = this.buf(w, h, 's' + slot);
    else {
      g = this.buf(1, 1, 'frac' + slot);
      if (g.W !== w || g.H !== h) { g.c.width = w; g.c.height = h; g.W = w; g.H = h; g.ctx.imageSmoothingEnabled = false; }
    }
    g.ox = 0; g.oy = 0; g.stack.length = 0;
    g.clear(P.ink);
    s.draw(g, t);
    if (s.post) s.post(g, t);
    if (z === 1) return g;
    const out = this.buf(this.W, this.H, 'z' + slot);
    out.ctx.imageSmoothingEnabled = false;
    out.ctx.drawImage(g.c, 0, 0, Math.round(w * z), Math.round(h * z));
    return out;
  }

  // the full picture of one scene (picture, HUD, lyrics, overlay) into a native buffer
  composite(s, t, out) {
    const f = this.renderScene(s, t, 2);
    const sh = s.shake ? s.shake(t) : null;
    out.clear(P.ink);
    out.ctx.drawImage(f.c, sh ? Math.round(sh[0]) : 0, sh ? Math.round(sh[1]) : 0);
    if (s.ui) s.ui(out, t);
    this.lyr.draw(out, t, s);
    if (s.over) s.over(out, t);
    return out;
  }

  draw(main, t) {
    const act = this.scenes.filter((s) => t >= s.t0 && t < s.t1);
    if (!act.length) { main.clear(P.ink); return; }
    const B = act[act.length - 1];
    let A = act.length > 1 ? act[act.length - 2] : null;
    // a scene with an explicit entry duration only overlaps the one below it for that long
    if (A && B.enter && B.enter.dur && t - B.t0 >= B.enter.dur) A = null;
    if (A && B.enter && B.enter.type === 'shatter') {
      // the last frame of A, frozen, breaks like glass over B
      const key = A.id + '@' + B.t0;
      if (this.frozenKey !== key) {
        this.frozen = this.frozen || new Gfx(this.W, this.H);
        this.composite(A, B.t0 - 1 / 120, this.frozen);
        this.frozenKey = key;
      }
      this.composite(B, t, main);
      shatter(main, this.frozen.c, t - B.t0, 7, B.enter);
      quantizePass(main, 0);
      return;
    }
    let frame = this.renderScene(B, t, 0);
    if (A) {
      const tr = B.enter || { type: 'cut' };
      const p = Math.min(1, Math.max(0, (t - B.t0) / (tr.dur || A.t1 - B.t0)));
      const ga = this.renderScene(A, t, 1);
      const out = this.buf(this.W, this.H, 'mix');
      if (tr.type === 'dissolve') {
        out.ctx.drawImage(ga.c, 0, 0);
        dissolve(out, frame.c, p);
      } else if (tr.type === 'mosaic') {
        // pixelate out of A, then into B
        const src = p < 0.5 ? ga : frame;
        out.ctx.drawImage(src.c, 0, 0);
        const k = p < 0.5 ? p * 2 : (1 - p) * 2;
        mosaicPass(out, 1 + Math.round(k * k * 23));
      } else if (tr.type === 'iris') {
        // close on A to black, open on B
        const src = p < 0.5 ? ga : frame;
        out.ctx.drawImage(src.c, 0, 0);
        const k = p < 0.5 ? 1 - p * 2 : p * 2 - 1;
        iris(out, tr.x ?? this.W / 2, tr.y ?? this.H / 2, k * k * Math.hypot(this.W, this.H) * 0.6);
      } else {
        out.ctx.drawImage(frame.c, 0, 0);
      }
      frame = out;
    }
    // shake (integer offsets, black edges)
    const sh = B.shake ? B.shake(t) : null;
    main.clear(P.ink);
    main.ctx.drawImage(frame.c, sh ? Math.round(sh[0]) : 0, sh ? Math.round(sh[1]) : 0);
    if (A && A.ui && (B.enter?.keepUiA)) A.ui(main, t);
    if (B.ui) B.ui(main, t);
    this.lyr.draw(main, t, B);
    if (B.over) B.over(main, t);
  }
}

