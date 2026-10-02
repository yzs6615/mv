// Scene base: a time range plus helpers shared by all scenes.
import { W, H, applyCam } from '../core/camera.js';
import { deviceScale } from '../core/draw.js';

export class Scene {
  constructor(film, t0, t1) {
    this.film = film;
    this.m = film.music;
    this.t0 = t0;
    this.t1 = t1;
  }
  line(i) { return this.film.lines[i]; }
  // time of unit u of lyric line i (falls back to the line start)
  ut(i, u = 0) { const L = this.film.lines[i]; return L ? (L.chars[Math.min(u, L.chars.length - 1)] || L.chars[0]).t : 0; }
  apply(ctx, c) { applyCam(ctx, deviceScale(), c); }
  screen(ctx) { const k = deviceScale(); ctx.setTransform(k, 0, 0, k, 0, 0); }
  fill(ctx, color) { this.screen(ctx); ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); }
}
