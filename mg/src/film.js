// The film: scene list, lyric layout table and the per-frame compositor.
import { Music } from './core/music.js';
import { setDeviceScale } from './core/draw.js';
import { W, H } from './core/camera.js';
import { drawPost } from './core/post.js';
import { drawLine } from './core/text.js';
import { C } from './art/palette.js';
import { SCENES, LYRIC_LAYOUT, EXTRA_TEXTS } from './scenes/index.js';

export class Film {
  constructor(map, lyrics) {
    this.music = new Music(map);
    this.lyrics = lyrics;
    this.lines = lyrics.lines;
    this.duration = map.duration;
    this.scenes = SCENES.map((S) => new S(this));
    this.layout = LYRIC_LAYOUT;
  }
  texts() { return EXTRA_TEXTS; }
  line(i) { return this.lines[i]; }

  render(ctx, t, frame, k) {
    setDeviceScale(k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);
    for (const s of this.scenes) {
      if (t >= s.t0 && t < s.t1) {
        ctx.save();
        s.draw(ctx, t);
        ctx.restore();
        ctx.setTransform(k, 0, 0, k, 0, 0);
      }
    }
    this.drawLyrics(ctx, t, k);
    drawPost(ctx, frame);
  }

  drawLyrics(ctx, t, k) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    for (let i = 0; i < this.lines.length; i++) {
      const L = this.lines[i];
      const cfg = this.layout[i];
      if (!cfg || cfg.inScene) continue;
      const next = this.lines[i + 1];
      const exitT = cfg.exitT ?? (next ? Math.min(next.t0 - 0.55, L.t1 + 2.6) : L.t1 + 1.2);
      if (t < L.t0 - 0.3 || t > exitT + 1.5) continue;
      const o = cfg.dyn ? { ...cfg, ...cfg.dyn(t, L, this) } : cfg;
      const n = L.chars.length;
      drawLine(ctx, L, t, { size: 64, x: W / 2, y: H - 120, exitDur: 0.36, exitStagger: Math.min(0.02, 0.18 / n), ...o, exitT: o.exitT ?? exitT, seed: i });
    }
  }
}
