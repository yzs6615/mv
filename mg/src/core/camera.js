// 2D camera. World units are design pixels (1920x1080 frame); a camera looks at (x, y) with zoom z
// and roll r. Tracks interpolate zoom in log space so pushes feel even.
import { E, lerp } from './math.js';

export const W = 1920, H = 1080;

export function track(keys) {
  const K = keys.map((k) => ({ x: 0, y: 0, z: 1, r: 0, e: E.ioC, ...k }));
  return (t) => {
    if (t <= K[0].t) return { x: K[0].x, y: K[0].y, z: K[0].z, r: K[0].r };
    for (let i = 0; i < K.length - 1; i++) {
      const a = K[i], b = K[i + 1];
      if (t <= b.t) {
        const u = b.e((t - a.t) / (b.t - a.t));
        return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), u)), r: lerp(a.r, b.r, u) };
      }
    }
    const l = K[K.length - 1];
    return { x: l.x, y: l.y, z: l.z, r: l.r };
  };
}

// Zoom towards a world point so that it stays pinned to a screen point (sx, sy) while z changes.
export function pinned(px, py, z, sx = W / 2, sy = H / 2, r = 0) {
  return { x: px - (sx - W / 2) / z, y: py - (sy - H / 2) / z, z, r };
}

// Apply a camera on top of the device scale k (canvas px per design px).
export function applyCam(ctx, k, cam) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.translate(W / 2, H / 2);
  if (cam.r) ctx.rotate(cam.r);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
}

export function worldToScreen(cam, x, y) {
  let dx = (x - cam.x) * cam.z, dy = (y - cam.y) * cam.z;
  if (cam.r) { const c = Math.cos(cam.r), s = Math.sin(cam.r); [dx, dy] = [dx * c - dy * s, dx * s + dy * c]; }
  return [W / 2 + dx, H / 2 + dy];
}
