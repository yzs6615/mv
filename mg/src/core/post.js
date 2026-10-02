// Print finish in one pass: paper fibres x vignette x grain are pre-multiplied into a few full-frame
// textures, and one of them is multiplied over the frame (grain changes every other frame).
import { hash3, noise2, clamp } from './math.js';
import { env } from './env.js';

const VARIANTS = 8;
let layers = [], size = [0, 0];

export function initPost(w, h) {
  size = [w, h];
  const sc = 1920 / w;
  // base: paper mottling + specks, vignette, as float luminance multipliers
  const base = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x * sc, Y = y * sc;
      const m = noise2(X / 180, Y / 180, 3) * 0.5 + noise2(X / 47, Y / 47, 5) * 0.3 + noise2(X / 9, Y / 9, 9) * 0.2;
      const sp = hash3(x, y, 77);
      let v = (250 + m * 5 - (sp > 0.9965 ? 26 * hash3(x, y, 78) : 0)) / 255;
      const dx = (X - 960) / 1100, dy = (Y - 520) / 760;
      const r = Math.sqrt(dx * dx + dy * dy);
      v *= 1 - 0.1 * clamp((r - 0.45) / 0.75) ** 1.6;
      base[y * w + x] = v;
    }
  }
  // fibres drawn once on a scratch canvas, read back as darkening
  const fib = env.createCanvas(w, h);
  const g = fib.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.lineCap = 'round';
  for (let i = 0; i < 900 / sc; i++) {
    const x = hash3(i, 1, 9) * w, y = hash3(i, 2, 9) * h, a = hash3(i, 3, 9) * Math.PI, L = (8 + hash3(i, 4, 9) * 26) / sc;
    g.strokeStyle = `rgba(150,130,100,${0.05 + hash3(i, 5, 9) * 0.08})`;
    g.lineWidth = Math.max(0.5, 0.9 / sc);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + 3, y + Math.sin(a) * L * 0.5 - 2, x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  const fd = g.getImageData(0, 0, w, h).data;
  layers = [];
  for (let k = 0; k < VARIANTS; k++) {
    const c = env.createCanvas(w, h);
    const cg = c.getContext('2d');
    const img = cg.createImageData(w, h);
    const d = img.data;
    for (let i = 0, n = w * h; i < n; i++) {
      // grain: two hashes -> roughly triangular noise, a few percent, slightly coarser than a pixel at 1080p
      const gx = (i % w) >> (sc < 1.5 ? 1 : 0), gy = ((i / w) | 0) >> (sc < 1.5 ? 1 : 0);
      const gr = 1 - 0.045 * (hash3(gx, gy, 101 + k) + hash3(gx, gy, 211 + k)) * 0.5 - 0.012 * hash3(i, k, 7);
      const v = base[i] * gr;
      d[i * 4] = clamp((fd[i * 4] / 255) * v * 255, 0, 255);
      d[i * 4 + 1] = clamp((fd[i * 4 + 1] / 255) * v * 254, 0, 255);
      d[i * 4 + 2] = clamp((fd[i * 4 + 2] / 255) * v * 251, 0, 255);
      d[i * 4 + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    layers.push(c);
  }
}

// frame: integer frame index at 60 fps (grain is held for two frames, like animation on twos)
export function drawPost(ctx, frame) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(layers[Math.floor(frame / 2) % VARIANTS], 0, 0);
  ctx.restore();
}
