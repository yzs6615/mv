// Inside the flower shop: wallpaper, a long wooden counter, a vase of three hero flowers and a
// shelf of potted plants. Interior coordinates: the first view is a 1920x1080 frame centred at
// (960, 540); the shelf continues to the right.
import { clamp, E, TAU, lerp, hash2, rng, prog, spring } from '../core/math.js';
import { shape, stroke, P, INK, deviceScale } from '../core/draw.js';
import { applyCam, W, H } from '../core/camera.js';
import { C } from './palette.js';
import { flowerSpec, drawPlant, drawHead, darker, mixHex } from './flower.js';
import { sparkle } from './kit.js';

export const COUNTER_Y = 800;
export const SHELF_Y = 560;
export const VASE = { x: 900, y: COUNTER_Y };
export const POTS = [2050, 2370, 2690, 3010, 3330, 3650, 3970, 4290];

const VASE_FLOWERS = [
  { F: flowerSpec(2101, { type: 'camellia', scheme: ['#F48FB1', '#FFD3E0', '#FFB627', '#E0567A'] }), dx: -250, h: 470, bend: -0.5, R: 140 },
  { F: flowerSpec(2203, { type: 'anemone', scheme: ['#A78BDA', '#D9CCF5', '#2A2E45', '#FFD84D'] }), dx: 10, h: 560, bend: 0.1, R: 150 },
  { F: flowerSpec(2309, { type: 'sunflower', scheme: ['#FFB627', '#FFD84D', '#8A5A3C', '#5E3B27'] }), dx: 270, h: 450, bend: 0.5, R: 140 },
];
const POT_TYPES = ['daisy', 'cosmos', 'poppy', 'star', 'dahlia', 'lotus', 'sakura', 'camellia'];
export const POT_FLOWERS = POTS.map((x, i) => ({ x, F: flowerSpec(2400 + i * 41, { type: POT_TYPES[i] }), h: 170 + hash2(i, 3) * 60, R: 66 + hash2(i, 4) * 12 }));
export const vaseFlowers = VASE_FLOWERS;
const PICTURE_F = flowerSpec(77, { type: 'sakura' });

export function interiorCamApply(ctx, cam) { applyCam(ctx, deviceScale(), cam); }

// o: { faces: fn(i) -> face | null for vase flowers, sat: fn(i) -> 0..1, potFace: fn(i) }
export function drawInterior(ctx, t, o = {}) {
  // wallpaper
  shape(ctx, P.rect(-1200, -600, 7000, 2600), { fill: '#F7E9D6', riso: 0 });
  ctx.save();
  ctx.fillStyle = '#F0DDC4';
  for (let x = -1200; x < 5800; x += 120) ctx.fillRect(x, -600, 46, 2600);
  ctx.restore();
  // little sprig pattern on the wallpaper
  for (let i = 0; i < 60; i++) {
    const x = -1100 + (i % 15) * 480 + ((Math.floor(i / 15) % 2) * 240), y = -380 + Math.floor(i / 15) * 300;
    stroke(ctx, P.quad(x, y + 26, x + 6, y + 6, x + 2, y - 16), mixHex(C.leaf, '#F7E9D6', 0.55), 2.4);
    shape(ctx, P.circle(x + 2, y - 20, 6), { fill: mixHex(C.coral, '#F7E9D6', 0.5), riso: 0 });
  }
  // framed picture and a window with light
  shape(ctx, P.rrect(130, 120, 300, 220, 8), { fill: '#FFF8EE', line: '#8A5A3C', lw: 6, shadow: true });
  drawHead(ctx, PICTURE_F, 280, 230, 62, {});
  // shelf
  shape(ctx, P.rect(1780, SHELF_Y, 2800, 28), { fill: '#C99063', line: darker('#C99063', 0.5), lw: 2.4, shadow: { dx: 0, dy: 14, color: 'rgba(42,46,69,0.12)' } });
  for (const bx of [1900, 2840, 3780]) shape(ctx, P.poly([[bx, SHELF_Y + 26], [bx + 60, SHELF_Y + 26], [bx + 8, SHELF_Y + 96]]), { fill: '#B07A52', line: darker('#B07A52', 0.5), lw: 2 });
  POT_FLOWERS.forEach((p, i) => {
    const face = o.potFace ? o.potFace(i) : null;
    drawPlant(ctx, p.F, p.x, SHELF_Y - 40, p.h, p.R, { sway: Math.sin(t * 1.2 + p.F.phase) * 0.04, face, shadow: true, open: o.potOpen ? o.potOpen(i) : 1 });
    drawPot(ctx, p.x, SHELF_Y, 120, 92, i);
  });
  // counter
  shape(ctx, P.rect(-1200, COUNTER_Y, 7000, 30), { fill: '#D9A577', line: darker('#D9A577', 0.5), lw: 2.4 });
  shape(ctx, P.rect(-1200, COUNTER_Y + 30, 7000, 900), { fill: '#B98258', line: darker('#B98258', 0.5), lw: 2.4 });
  for (let x = -1200; x < 5800; x += 210) stroke(ctx, P.line(x, COUNTER_Y + 30, x, COUNTER_Y + 600), darker('#B98258', 0.3), 2, { alpha: 0.5 });
  // vase of three
  VASE_FLOWERS.forEach((v, i) => {
    const sway = Math.sin(t * 1.1 + v.F.phase) * 0.03;
    const sat = o.sat ? o.sat(i) : 1;
    drawPlant(ctx, v.F, VASE.x + v.dx * 0.18, VASE.y - 120, v.h, v.R, {
      sway: sway + v.bend * 0.42, bendScale: 0.4, face: o.faces ? o.faces(i) : null, shadow: true, tint: sat < 1 ? ['#E9E2D6', 1 - sat] : null, stemW: 9,
    });
    if (o.glint && o.glint(i) > 0) {
      const g = o.glint(i);
      const hx = VASE.x + v.dx * 0.18 + Math.sin(sway + v.bend * 0.42) * v.h * 0.9, hy = VASE.y - 120 - v.h * Math.cos(sway + v.bend * 0.42);
      for (let k = 0; k < 4; k++) sparkle(ctx, hx + Math.cos(k * 1.7 + 0.5) * v.R * 1.15, hy + Math.sin(k * 2.3) * v.R * 1.0, 26 * E.outBack(clamp(g * 2 - k * 0.25)) * (1 - clamp(g - 0.7) / 0.3), { rot: t * 2 + k });
    }
  });
  drawVase(ctx, VASE.x, VASE.y);
}

function drawPot(ctx, x, y, w, h, i) {
  const col = ['#D9825B', '#C9785A', '#E09A6B', '#7FA2E8', '#D9825B', '#A3B98A', '#E0705E', '#C9785A'][i % 8];
  shape(ctx, P.poly([[x - w / 2, y - h], [x + w / 2, y - h], [x + w * 0.36, y], [x - w * 0.36, y]]), { fill: col, line: darker(col, 0.5), lw: 2.4, shadow: true });
  shape(ctx, P.rect(x - w / 2 - 8, y - h - 6, w + 16, 26), { fill: mixHex(col, '#FFFFFF', 0.15), line: darker(col, 0.5), lw: 2.4 });
}

function drawVase(ctx, x, y) {
  const path = (c) => {
    c.beginPath();
    c.moveTo(x - 70, y - 210);
    c.bezierCurveTo(x - 150, y - 150, x - 150, y - 20, x - 80, y);
    c.lineTo(x + 80, y);
    c.bezierCurveTo(x + 150, y - 20, x + 150, y - 150, x + 70, y - 210);
    c.closePath();
  };
  shape(ctx, path, { fill: '#8FB8D8', line: darker('#8FB8D8', 0.55), lw: 3, shadow: true });
  stroke(ctx, P.quad(x - 95, y - 160, x - 118, y - 90, x - 92, y - 40), '#FFFFFF', 6, { alpha: 0.6 });
  shape(ctx, P.rect(x - 80, y - 226, 160, 22), { fill: '#7CA7CA', line: darker('#8FB8D8', 0.55), lw: 2.6 });
  for (let i = 0; i < 3; i++) stroke(ctx, P.quad(x - 120 + i * 10, y - 120 + i * 30, x, y - 95 + i * 30, x + 120 - i * 10, y - 120 + i * 30), '#FFFFFF', 3, { alpha: 0.35 });
}

// draw an inner world inside a screen-space rect [x, y, w, h] given in the CURRENT transform's units:
// innerCam is the inner world's camera as if it filled a 1920x1080 frame
export function portal(ctx, rect, innerCam, fn) {
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(w / W, h / H);
  ctx.translate(W / 2, H / 2);
  if (innerCam.r) ctx.rotate(innerCam.r);
  ctx.scale(innerCam.z, innerCam.z);
  ctx.translate(-innerCam.x, -innerCam.y);
  fn(ctx);
  ctx.restore();
}

export { prog, spring };
