// A small paper planet: ocean disc, land drawn as dots on a rotating sphere (orthographic), flowers
// that bloom on the land in waves, and the home town as a cluster of tiny houses.
import { clamp, E, TAU, lerp, hash, hash2, hash3, noise2, rng } from '../core/math.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { C } from './palette.js';
import { flowerSpec, drawHead, darker, mixHex } from './flower.js';

const N = 2600;
const TILT = 0.38;
// fibonacci sphere points with a land mask from 3D-ish noise
const PTS = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (2 * (i + 0.5)) / N;
  const r = Math.sqrt(1 - y * y);
  const th = i * 2.399963229728653;
  const x = Math.cos(th) * r, z = Math.sin(th) * r;
  const lon = Math.atan2(z, x), lat = Math.asin(y);
  const n = noise2(lon * 1.3 + 3, lat * 2.1 + 1, 41) * 0.65 + noise2(lon * 3.1, lat * 3.7, 43) * 0.35;
  if (n > 0.06) PTS.push({ x, y, z, lon, lat, n });
}
export const LAND = PTS;
// home town location (lon, lat) and the flowers
export const HOME = { lon: 0.6, lat: 0.35 };
const toVec = (lon, lat) => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
const HV = toVec(HOME.lon, HOME.lat);
export const GFLOWERS = [];
{
  const r = rng(777);
  PTS.forEach((p, i) => {
    if (hash2(i, 5) < 0.22) {
      const d = Math.acos(clamp(p.x * HV[0] + p.y * HV[1] + p.z * HV[2], -1, 1));
      GFLOWERS.push({ p, d, F: flowerSpec(5000 + i), s: r.range(0.75, 1.25), burst: hash2(i, 9) });
    }
  });
}

// rotate (around y by phi, then tilt around x) and project; returns [sx, sy, depth]
export function project(v, phi, R, cx, cy) {
  const c = Math.cos(phi), s = Math.sin(phi);
  const x1 = v[0] * c - v[2] * s, z1 = v[0] * s + v[2] * c;
  const ct = Math.cos(TILT), st = Math.sin(TILT);
  const y2 = v[1] * ct - z1 * st, z2 = v[1] * st + z1 * ct;
  return [cx + x1 * R, cy - y2 * R, z2];
}

// o: { phi, bloom(f) -> 0..1, burst(f) -> 0..1, houses, alpha, landColor }
export function drawGlobe(ctx, cx, cy, R, t, o = {}) {
  const phi = o.phi ?? 0;
  const a = o.alpha ?? 1;
  // halo
  const g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
  g.addColorStop(0, 'rgba(160,215,235,0.45)');
  g.addColorStop(1, 'rgba(160,215,235,0)');
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = g;
  ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);
  ctx.restore();
  shape(ctx, P.circle(cx, cy, R), { fill: '#A9DCEB', line: darker('#6EC1E4', 0.55), lw: 3, alpha: a, shadow: { dx: 10, dy: 14, color: 'rgba(42,46,69,0.12)' } });
  // night-side shading crescent
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();
  shape(ctx, P.circle(cx + R * 0.38, cy + R * 0.3, R * 1.05), { fill: 'rgba(60,110,150,0.16)', riso: 0, alpha: a });
  // land dots, back to front by depth sign only
  const dr = Math.max(0.6, R * 0.021);
  ctx.globalAlpha *= a;
  ctx.fillStyle = o.landColor ?? '#6DBB8C';
  ctx.beginPath();
  for (const p of PTS) {
    const [sx, sy, z] = project([p.x, p.y, p.z], phi, R, cx, cy);
    if (z <= 0.02) continue;
    const rr = dr * (0.55 + 0.45 * z) * (0.8 + 0.4 * p.n);
    ctx.moveTo(sx + rr, sy);
    ctx.arc(sx, sy, rr, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
  stroke(ctx, (c) => { c.beginPath(); c.arc(cx - R * 0.2, cy - R * 0.2, R * 0.72, Math.PI * 1.05, Math.PI * 1.45); }, '#FFFFFF', Math.max(2, R * 0.02), { alpha: a * 0.6 });
  // home town
  if (o.houses !== false) {
    const [hx, hy, hz] = project(HV, phi, R, cx, cy);
    if (hz > 0.05) {
      const ang = Math.atan2(hy - cy, hx - cx) + Math.PI / 2;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang);
      ctx.scale(R / 420, R / 420);
      const cols = ['#F7C9B6', '#FBE3B0', '#CFE6D8', '#D8D3F0', '#F3E3CB', '#CDE3F2'];
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * 13, h = 16 + hash2(i, 3) * 12;
        shape(ctx, P.rect(x - 6, -h, 12, h), { fill: cols[i], line: INK, lw: 1.2, alpha: a * hz });
        shape(ctx, P.poly([[x - 7.5, -h], [x, -h - 7], [x + 7.5, -h]]), { fill: i === 4 ? C.coral : '#B85C78', line: INK, lw: 1, alpha: a * hz });
      }
      ctx.restore();
    }
  }
  // flowers
  if (o.bloom) {
    const list = [];
    for (const f of GFLOWERS) {
      const b = o.bloom(f);
      if (b <= 0) continue;
      const v = [f.p.x * 1.01, f.p.y * 1.01, f.p.z * 1.01];
      const [sx, sy, z] = project(v, phi, R, cx, cy);
      if (z <= 0.05) continue;
      list.push([z, f, sx, sy, b]);
    }
    list.sort((p, q) => p[0] - q[0]);
    for (const [z, f, sx, sy, b] of list) {
      const burst = o.burst ? o.burst(f) : 0;
      const r = R * 0.046 * f.s * E.outBack(clamp(b), 1.8) * (0.55 + 0.45 * z) * (1 + burst * 0.9);
      drawHead(ctx, f.F, sx, sy, r, { alpha: a * clamp(z * 4), tilt: Math.max(0.35, z) });
    }
  }
}

export { HV, toVec };
