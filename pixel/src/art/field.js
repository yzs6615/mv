// The gardener's field at the edge of the map, shared by the interlude and verse 2: a sky that can
// be any time of day or weather, the far city, the track behind its fence, the cracked soil, the
// void past the map edge, and the planted spot. Coordinates match plant.js (spot x=300, ground 116).
import { P } from '../core/pal.js';
import { text } from '../core/font.js';
import { hash2 } from '../core/math.js';
import { cloudSprite } from './props.js';
import { dissolve } from '../core/post.js';
import { Gfx } from '../core/gfx.js';
import { env } from '../core/env.js';

export const F = { spot: 300, fence: 360, edge: 120, ground: 116 };

export const SKIES = {
  day: [[0, P.blueD], [150, P.blue], [250, P.cyan], [290, P.white]],
  dawn: [[0, P.g5], [150, P.purple], [240, P.pink], [290, P.peach]],
  dusk: [[0, P.purple], [140, P.magenta], [240, P.orange], [290, P.gold]],
  night: [[0, P.ink], [160, P.g5], [260, P.purple], [290, P.blueD]],
  storm: [[0, P.ink], [150, P.g5], [250, P.g4], [290, P.g3]],
  snow: [[0, P.g4], [150, P.g3], [250, P.g2], [290, P.g1]],
  clear: [[0, P.blue], [150, P.cyan], [250, P.white], [290, P.white]],
};

let tmp = null;
// sky gradient in world space (y from -200), optionally dissolving into a second sky by k
export function sky(g, a, b = null, k = 0) {
  g.vgrad(-400, -200, 1700, SKIES[a], 2);
  if (b && k > 0) {
    if (!tmp || tmp.W !== g.W || tmp.H !== g.H) tmp = new Gfx(g.W, g.H);
    tmp.ox = g.ox; tmp.oy = g.oy;
    tmp.vgrad(-400, -200, 1700, SKIES[b], 2);
    dissolve(g, tmp.c, k);
  }
}

export function stars(g, t, amt = 1) {
  for (let i = 0; i < 70; i++) {
    if (hash2(i, 77) > amt) continue;
    const x = -100 + hash2(i, 1) * 700, y = -40 + hash2(i, 2) * 110;
    const tw = Math.floor(t * 3 + hash2(i, 3) * 4) % 4;
    g.px(x, y, tw === 0 ? P.white : P.g1);
  }
}

export function city(g, lit = 0) {
  for (let i = 0; i < 40; i++) {
    const x = -100 + i * 30, h = 18 + Math.floor(hash2(i, 9) * 34);
    const bc = [P.clay, P.tan, P.blueD, P.purple, P.rust, P.greenD][i % 6];
    g.rect(x, 78 - h, 26, h, bc);
    for (let k = 0; k < 4; k++) for (let j = 0; j < h - 8; j += 7) if (hash2(i * 7 + k, j) < 0.3 + lit * 0.5) g.px(x + 4 + k * 6, 78 - h + 6 + j, P.yellow);
  }
}

// everything below the sky. o: {track: bool, racers: fn(g) | null, grassR: radius of grass}
export function ground(g, t, o = {}) {
  const { fence, edge, spot, ground: G } = F;
  g.rect(-400, 78, 1700, 200, P.greenM);
  for (let x = -400; x < 1200; x += 7) g.px(x + (x % 3), 82 + (x % 11), P.green);
  if (o.track !== false) {
    g.rect(fence, 80, 900, 40, P.blueD);
    for (let i = 0; i < 4; i++) g.hline(fence, 1300, 84 + i * 10, P.blue);
    g.rect(fence, 120, 900, 3, P.cyan);
    if (o.racers) o.racers(g);
    for (let y = 82; y < 122; y += 6) g.hline(fence - 2, fence + 2, y, P.g4);
    g.rect(fence - 1, 76, 3, 46, P.g4);
    g.rect(fence - 40, 58, 38, 21, P.ink);
    g.rect(fence - 39, 59, 36, 19, P.white);
    text(g, 'NO', fence - 21, 60, { font: 'en', align: 'center', color: P.red });
    text(g, 'RANK', fence - 21, 69, { font: 'en', align: 'center', color: P.red });
    g.vline(fence - 21, 79, 116, P.brown);
  }
  g.rect(-400, 100, fence + 400, 100, P.brown);
  g.rect(-400, 100, fence + 400, 2, P.clay);
  for (let i = 0; i < 70; i++) {
    const x = edge + hash2(i, 1) * (fence - edge), y = 104 + hash2(i, 2) * 26;
    g.line(x, y, x + 3 + hash2(i, 3) * 5, y + (hash2(i, 4) - 0.5) * 4, P.brownD);
  }
  // the void past the edge
  g.rect(-400, 0, edge + 400, 300, P.ink);
  for (let y = 4; y < 300; y += 12) for (let x = -400 + ((y / 12) % 2) * 6; x < edge; x += 12) g.px(x, y, P.g5);
  g.rect(edge - 2, 100, 2, 60, P.brownD);
  // grass around the spot
  const r = o.grassR || 0;
  if (r > 2) {
    const wind = o.wind || 0;
    for (let x = Math.floor(spot - r * 1.4); x < spot + r * 1.4; x += 2) {
      const d = Math.abs(x - spot);
      if (d > r * 1.15) continue;
      const h = Math.max(0, Math.round((1 - d / (r * 1.15)) * 5 + hash2(x, 3) * 2));
      const lean = Math.round(wind * (0.5 + 0.5 * Math.sin(t * 9 + x * 0.3)));
      g.rect(x + lean, 101 - h, 2, h, hash2(x, 5) < 0.5 ? P.green : P.greenM);
      g.rect(x, 101, 2, 4 + Math.round(hash2(x, 7) * 3), P.greenM);
    }
    for (let i = 0; i < 40; i++) {
      const x = spot + (hash2(i, 51) - 0.5) * r * 2.4, y = 104 + hash2(i, 52) * 24;
      if (Math.hypot((x - spot) / 1.2, y - G) > r) continue;
      g.px(x, y, P.green); g.px(x, y - 1, P.greenM);
    }
  }
  // the planted mound
  g.rect(spot - 4, G - 1, 9, 2, P.brownD);
}

// a big storm cloud bank sliding in from one side; k = 0..1 coverage
export function cloudBank(g, t, k, side, cols = [P.g3, P.g4, P.g5]) {
  for (let i = 0; i < 6; i++) {
    const w = 90 + (i % 3) * 30;
    const base = side < 0 ? -260 + k * 420 : 760 - k * 420;
    const x = base + side * -i * 40 + Math.sin(t * 0.7 + i) * 4;
    const y = -10 + (i % 3) * 22 + i * 4;
    g.spr(cloudSprite(200 + i + (side > 0 ? 10 : 0), w, 40, cols), x, y + 40);
  }
}

export { env };
