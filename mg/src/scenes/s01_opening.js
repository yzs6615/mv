// 0:00–0:32  序 · 种下 / 片名 / 风起 — one continuous camera from the seed's fall, through the dream
// bloom and the title, to the gust that carries 豆豆 across town to the corner flower shop.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2, smoothstep } from '../core/math.js';
import { track } from '../core/camera.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawLine, makeLine } from '../core/text.js';
import { flowerSpec, pipSpec, drawPlant, drawHead, darker } from '../art/flower.js';
import { drawPip, blinkAt } from '../art/pip.js';
import { drawGround, drawMound, ghostFlower, petalDrift, drawPetal, sparkle, skyGradient, drawCloud } from '../art/kit.js';
import { makeHouses, drawHouse, drawLamp, drawTree, drawHills, drawShop, drawBucket, SHOP, shopWindow } from '../art/town.js';
import { drawInterior, portal } from '../art/shop.js';

export const GY = 780;            // ground line for the whole opening
export const SHOP_X = 7700;       // corner flower shop
const MOUNDS = Array.from({ length: 11 }, (_, i) => i - 5);
const MX = (k) => 960 + k * 250;

export class Opening extends Scene {
  constructor(film) {
    super(film, 0, 31.97);
    const m = this.m;
    this.B = (i) => m.barTime(i);
    const B = this.B;
    this.pipF = pipSpec();
    this.flowers = MOUNDS.map((k) => (k === 0 ? this.pipF : flowerSpec(1000 + (k + 5) * 37)));
    this.heights = MOUNDS.map((k) => (k === 0 ? 390 : 280 + hash2(k, 3) * 150));
    this.radius = MOUNDS.map((k) => (k === 0 ? 112 : 66 + hash2(k, 5) * 26));
    // camera, split per axis so the long flight can ease on its own curve
    this.cx = track([{ t: 0, x: 960 }, { t: B(1), x: 960 }, { t: 7.4, x: 960 }, { t: 10.6, x: 960 }, { t: B(7), x: 1010, e: E.sine },
      { t: 31.96, x: SHOP_X, e: (u) => E.ioC(u) }].map((k) => ({ ...k, y: 0, z: 1 })));
    this.cy = track([{ t: 0, y: 540 }, { t: B(1) + 0.2, y: 540 }, { t: 7.4, y: 545 }, { t: 10.6, y: 455, e: E.ioQn }, { t: B(7), y: 445, e: E.sine },
      { t: B(8), y: 420 }, { t: B(12), y: 425, e: E.sine }, { t: 31.96, y: 470 }].map((k) => ({ ...k, x: 0, z: 1 })));
    this.cz = track([{ t: 0, z: 1 }, { t: B(1) + 0.2, z: 1 }, { t: 7.4, z: 1.16 }, { t: 10.6, z: 0.68, e: E.ioQn }, { t: B(7), z: 0.72, e: E.sine },
      { t: B(8) + 0.6, z: 0.72 }, { t: B(12) - 0.4, z: 0.75, e: E.sine }, { t: 31.96, z: 1.0, e: E.ioC }].map((k) => ({ ...k, x: 0, y: 0 })));
    // town
    this.houses = makeHouses(2550, SHOP_X - 560, 11).concat(makeHouses(SHOP_X + 470, SHOP_X + 4200, 23));
    this.trees = [];
    this.lamps = [];
    for (let i = 0; i < this.houses.length - 1; i++) {
      const gap = (this.houses[i].x + this.houses[i].w / 2 + this.houses[i + 1].x - this.houses[i + 1].w / 2) / 2;
      if (i % 3 === 1) this.trees.push({ x: gap, h: 300 + hash2(i, 2) * 80, seed: i * 31 });
      if (i % 3 === 0) this.lamps.push(gap);
    }
    // each house pops up on the first beat after it nears the right edge of frame
    const popAt = (x) => {
      for (let t = B(7); t < 32; t += 1 / 30) if (this.camAt(t).x + 1250 / this.camAt(t).z > x) return this.nextBeat(t);
      return 32;
    };
    this.houses.forEach((h) => { h.popT = h.x > SHOP_X ? Math.min(popAt(h.x - h.w / 2), 31.2) : popAt(h.x - h.w / 2); });
    this.trees.forEach((h) => { h.popT = popAt(h.x); });
    this.shopPop = popAt(SHOP_X - SHOP.w / 2);
    this.bucketFlowers = [0, 1, 2].map((b) => [0, 1, 2].map((j) => ({ F: flowerSpec(3000 + b * 11 + j * 3), dx: (j - 1) * 34, h: 120 + j * 22 + b * 6, R: 40 })));
  }
  nextBeat(t) { const m = this.m; return m.beatTime(Math.ceil(m.beatF(t) - 1e-6)); }
  camAt(t) { return { x: this.cx(t).x, y: this.cy(t).y, z: this.cz(t).z, r: 0 }; }

  static lyrics() {
    return {
      0: { x: 960, y: 190, size: 78, style: 'rise', exitT: 7.35, accent: (i, u) => (u.c === '花' ? C.coral : null) },
      1: { x: 960, y: 190, size: 78, style: 'rise', exitT: 12.35, exitStyle: 'fade', accent: (i, u) => (/^[A-Za-z]/.test(u.c) ? C.coral : u.c === '唯' || u.c === '一' ? C.coral : null) },
    };
  }

  draw(ctx, t) {
    this.drawWorld(ctx, t, this.camAt(t), { pip: true });
    this.screen(ctx);
    this.drawTitle(ctx, t);
    this.drawWind(ctx, t);
  }

  // the whole opening world under a given camera (the shop scene reuses it for the facade shot)
  drawWorld(ctx, t, cam, o = {}) {
    // sky arrives as we leave the field
    const skyK = smoothstep(1700, 3400, cam.x);
    if (skyK > 0) {
      this.screen(ctx);
      ctx.globalAlpha = skyK;
      skyGradient(ctx, 0, 0, 1920, 1080, '#BFE3F0', C.paper, '#DDEEF0');
      ctx.globalAlpha = 1;
    }
    // far hills and clouds (parallax)
    if (skyK > 0) {
      this.apply(ctx, cam);
      ctx.save();
      ctx.translate(cam.x * 0.62, cam.y * 0.4);
      ctx.globalAlpha = skyK;
      const lx0 = cam.x * 0.38 - 1100 / cam.z, lx1 = cam.x * 0.38 + 1100 / cam.z;
      for (let i = Math.floor(lx0 / 900); i <= Math.ceil(lx1 / 900); i++) drawCloud(ctx, i * 900 + hash2(i, 1) * 300, 120 + hash2(i, 2) * 120, 260 + hash2(i, 3) * 120, 70, { seed: (i & 7) + 2, alpha: 0.9 });
      drawHills(ctx, Math.floor(lx0 / 40) * 40, lx1, GY - 120, '#CFE3D6', 4, 140);
      drawHills(ctx, Math.floor(lx0 / 40) * 40, lx1, GY - 40, '#B9D9C4', 7, 110);
      ctx.restore();
    }
    this.apply(ctx, cam);
    if (cam.x < 3600) this.drawField(ctx, t);
    else drawStreet(ctx, cam);
    if (cam.x > 1500) this.drawTown(ctx, t, cam, o);
    if (o.pip) this.drawPipAll(ctx, t);
    if (o.after) o.after(ctx);
    // near layer: lamps slide past in front
    if (cam.x > 2000) {
      ctx.save();
      ctx.translate(-cam.x * 0.22, 0);
      for (const lx of this.lamps) drawLamp(ctx, lx * 1.22 + 300, GY + 150, 420, {});
      ctx.restore();
    }
  }

  drawField(ctx, t) {
    const B = this.B;
    // the ink line that becomes the ground
    const draw = prog(t, 0.12, 1.75, E.ioC);
    if (draw < 1 || t < 2.1) {
      const pts = [];
      for (let x = -60; x <= 1980; x += 30) pts.push([x, GY + Math.sin(x * 0.011 + 1) * 6 + Math.sin(x * 0.037 + 2.3) * 2.7]);
      const part = (c) => { c.beginPath(); const n = Math.floor(pts.length * draw); pts.slice(0, Math.max(2, n)).forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); };
      stroke(ctx, part, INK, 3);
    }
    const soilA = prog(t, 1.05, 2.1, E.ioC);
    if (soilA > 0) {
      drawGround(ctx, -700, 2420, GY, { seed: 1, alpha: soilA, depth: 220 });
      // field ends in a curb where the town begins
      shape(ctx, P.rect(2420, GY - 6, 7300, 800), { fill: '#D8CDBA', line: darker('#D8CDBA', 0.5), lw: 2.2, alpha: soilA });
      shape(ctx, P.rect(2420, GY + 40, 7300, 760), { fill: '#BFB3A0', riso: 0, alpha: soilA });
      for (let x = 2470; x < 9700; x += 140) stroke(ctx, P.line(x, GY + 4, x - 20, GY + 38), darker('#D8CDBA', 0.35), 1.6, { alpha: soilA * 0.6 });
    }
    // mounds, ghosts, the dream bloom and its dissolve in the gust
    const bloom0 = B(5);
    const gust = B(7);
    MOUNDS.forEach((k, idx) => {
      const x = MX(k);
      const F = this.flowers[idx];
      const h = this.heights[idx], R = this.radius[idx];
      const reveal = k === 0 ? 3.35 : 7.9 + Math.abs(k) * 0.12;
      const mh = k === 0 ? spring(prog(t, 3.35, 4.3), 1.3, 6) : spring(prog(t, reveal, reveal + 0.9), 1.3, 6);
      if (mh > 0 && k !== 0) drawMound(ctx, x, GY, 150, 54 * mh);
      if (k === 0 && t > B(7) + 0.5) drawMound(ctx, x, GY, 250, 34);
      // ghost outline
      const gStart = k === 0 ? 5.15 : 8.2 + Math.abs(k) * 0.16;
      const gProg = prog(t, gStart, gStart + (k === 0 ? 1.85 : 1.6), E.ioC);
      const bloomT = bloom0 + Math.abs(k) * 0.075;
      const ghostA = 1 - prog(t, bloomT - 0.05, bloomT + 0.25);
      const isPip = k === 0;
      const coral = isPip ? prog(t, 10.45, 11.2) : 0;
      if (gProg > 0 && ghostA > 0) ghostFlower(ctx, F, x, GY - 26, h, R, gProg, t, { alpha: ghostA, color: coral > 0 ? `rgba(255,107,91,${0.55 + 0.4 * coral})` : 'rgba(42,46,69,0.5)', lw: isPip ? 2.6 : 2.2 });
      if (isPip && coral > 0 && t < bloomT) {
        const pulse = 1 + 0.06 * Math.sin((t - 10.45) * 9) * (1 - prog(t, 11.3, 12));
        sparkle(ctx, x + 70, GY - 26 - h - 70, 18 * coral * pulse, { rot: t });
      }
      // dream bloom on the band's entrance
      const bp = prog(t, bloomT, bloomT + 1.1);
      if (bp > 0) {
        const grow = E.outBack(prog(t, bloomT, bloomT + 0.55), 1.5);
        const dis = prog(t, gust + 0.1 + hash2(k, 9) * 0.5, gust + 1.0 + hash2(k, 9) * 0.5, E.inQ);
        const sway = Math.sin(t * 1.5 + F.phase) * 0.05 + (t > gust ? E.outC(prog(t, gust, gust + 0.6)) * 0.35 * (1 - dis) : 0);
        if (dis < 1) drawPlant(ctx, F, x, GY - 20, h * grow * (1 - dis * 0.5), R, { open: E.outC(clamp(bp * 1.3)) * (1 - dis), sway, shadow: true, leafGrow: grow, alpha: 1 - dis * 0.6 });
        // petals torn off by the gust
        if (t > gust) {
          const L = F.layers[0];
          for (let p = 0; p < 7; p++) {
            const st = gust + 0.1 + hash2(k, 9) * 0.5 + p * 0.06;
            const u = t - st;
            if (u < 0 || u > 4) continue;
            const px = x + F.stemBend * h * 0.12 + u * (380 + hash2(k * 7 + p, 1) * 260) + Math.sin(u * 3 + p) * 30;
            const py = GY - 20 - h + u * u * -30 - u * (60 + hash2(k + p, 2) * 90) + Math.sin(u * 2.4 + p * 2) * 26;
            drawPetal(ctx, px, py, R * 0.55, u * 3 + p, L.color, { alpha: 1 - prog(u, 2.5, 4), flip: Math.cos(u * 4 + p) });
          }
        }
      }
    });
  }

  drawPipAll(ctx, t) {
    const B = this.B;
    const gust = B(7);
    const land = B(1);
    const x0 = MX(0);
    if (t < 1.35) return;
    const s = 140;
    if (t < land) {
      // fall
      const u = (t - 1.35) / (land - 1.35);
      const y = lerp(-220, GY, u * u);
      drawPip(ctx, x0, y, s, { mood: 'wow', legs: 1, rot: (1 - u) * 0.9 * Math.sin(u * 5), squash: 1 + 0.12 * u, shadow: false });
      return;
    }
    if (t < gust + 0.55) {
      // landed, then planted: sinks into its mound and peeks out
      const sq = 1 - 0.32 * wobble(t - land, 2.6, 5) - (t - land < 0.08 ? 0.25 : 0);
      const planted = spring(prog(t, 3.35, 4.3), 1.3, 6);
      const sink = planted * 6 - (t > gust ? E.outBack(prog(t, gust + 0.25, gust + 0.55)) * 70 : 0);
      const look = t < 3.0 ? [0, 0] : t < 3.7 ? [Math.sin((t - 3) * 9) * 0.8, 0] : t > 5.1 && t < 7.4 ? [0.15, -1] : t > 12.4 && t < 14.5 ? [0, -1] : [0, 0];
      const mood = t > gust ? 'wow' : t > B(5) && t < B(5) + 2.4 ? 'wow' : t > 3.72 && t < 4.6 ? 'happy' : t > 10.4 && t < 11.6 ? 'laugh' : 'smile';
      // dust puffs
      const dk = prog(t, land, land + 0.45);
      if (dk > 0 && dk < 1) for (const sd of [-1, 1]) shape(ctx, P.ellipse(x0 + sd * (30 + dk * 70), GY - 6 - dk * 12, 16 * (1 - dk) + 4, 9 * (1 - dk) + 2), { fill: C.soilPale, line: darker(C.soilPale, 0.4), lw: 1.5, alpha: 1 - dk });
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 200, -3000, 400, 3000 + GY - 4);
      ctx.clip();
      drawPip(ctx, x0, GY + sink, s, { squash: sq, mood, blink: blinkAt(t, 1), look, legs: 1 - clamp(planted * 1.5), shadow: planted < 0.3 });
      ctx.restore();
      drawMound(ctx, x0, GY, 250, 34 * planted);
      return;
    }
    // riding a petal across town
    const fly = this.pipFlight(t);
    ctx.save();
    ctx.translate(fly.x, fly.y);
    ctx.rotate(fly.rot);
    rideCanoe(ctx, 0, 6, 230, fly.land);
    drawPip(ctx, 0, 0, s * 0.86, { mood: fly.mood, blink: blinkAt(t, 1), look: [0.6, 0], legs: 1, shadow: false, squash: fly.sq, step: t * 0.8, walk: 0 });
    ctx.restore();
  }

  pipFlight(t) {
    const B = this.B;
    const gust = B(7);
    const cam = this.camAt(t);
    const t1 = 31.96;
    const sill = this.sill();
    const pop = prog(t, gust + 0.55, gust + 1.25, E.outC);
    const startX = MX(0), startY = GY - 60;
    const cruiseX = cam.x + 170 + 60 * Math.sin(t * 0.9), cruiseY = cam.y - 70 + 40 * Math.sin(t * 1.7) + 14 * Math.sin(t * 4.1);
    let x = lerp(startX, cruiseX, pop), y = lerp(startY - 140 * Math.sin(pop * Math.PI) * 0.6, cruiseY, pop);
    const land = prog(t, 29.9, t1, E.ioC);
    x = lerp(x, sill[0], land);
    y = lerp(y, sill[1], land);
    const rot = (1 - land) * (0.12 * Math.sin(t * 1.7 + 0.6) - 0.08);
    const mood = land > 0.9 ? 'happy' : t < gust + 1.5 ? 'wow' : Math.sin(t * 0.7) > 0.4 ? 'laugh' : 'happy';
    return { x, y, rot, mood, sq: 1 + 0.05 * Math.sin(t * 6), land };
  }

  sill() { const w = shopWindow(SHOP_X, GY); return [w[0] + w[2] * 0.47, w[1] + w[3]]; }

  drawTown(ctx, t, cam, o = {}) {
    for (const h of this.trees) drawTree(ctx, h.x, GY, h.h * Math.max(0.001, spring(prog(t, h.popT, h.popT + 0.7), 1.3, 6)), h.seed, t, { wind: 0.4 });
    const lit = 0;
    for (const h of this.houses) {
      if (Math.abs(h.x - cam.x) > 1700 / cam.z) continue;
      drawHouse(ctx, h, GY, prog(t, h.popT, h.popT + 0.75), t, { lit });
    }
    // the corner shop and its buckets
    const sp = prog(t, this.shopPop, this.shopPop + 0.8);
    if (sp > 0) {
      const icam = o.interiorCam ? o.interiorCam(t) : { x: 960, y: 540, z: 1 };
      drawShop(ctx, SHOP_X, GY, t, { pop: sp, inWindow: (c, wx, wy, ww, wh) => portal(c, [wx, wy, ww, wh], icam, (cc) => drawInterior(cc, t, o.interior || {})) });
      this.bucketFlowers.forEach((fl, b) => drawBucket(ctx, [SHOP_X - 440, SHOP_X - 300, SHOP_X + 340][b], GY + 2, 92, fl, t,
        { open: E.outBack(prog(t, this.shopPop + 0.3 + b * 0.1, this.shopPop + 1.0 + b * 0.1)), faceFn: o.bucketFace ? (i) => o.bucketFace(b * 3 + i) : null }));
    }
  }

  drawTitle(ctx, t) {
    const B = this.B;
    if (t < B(6) - 0.2 || t > B(7) + 2.5) return;
    const title = this.title || (this.title = makeLine('世界上唯一的花', B(6), this.m.beat / 2));
    const sub = this.sub || (this.sub = makeLine('Only One', B(6) + 7 * this.m.beat / 2 + 0.15, 0.18));
    drawLine(ctx, title, t, { x: 960, y: 205, size: 132, style: 'drop', exitT: B(7) + 0.05, exitStyle: 'scatter', exitDur: 1.2, exitStagger: 0.05, accent: (i, u) => (u.c === '花' ? C.coral : null), seed: 3, sing: false });
    drawLine(ctx, sub, t, { x: 960, y: 322, size: 54, style: 'rise', color: C.coral, exitT: B(7) + 0.2, exitStyle: 'scatter', exitDur: 1.0, seed: 5, sing: false });
    const deco = prog(t, B(6) + 1.6, B(6) + 2.4, E.outC) * (1 - prog(t, B(7), B(7) + 0.5));
    if (deco > 0) {
      stroke(ctx, P.line(960 - 330 * deco, 322, 960 - 170 * deco, 322), C.coral, 2.4, { alpha: deco });
      stroke(ctx, P.line(960 + 170 * deco, 322, 960 + 330 * deco, 322), C.coral, 2.4, { alpha: deco });
    }
  }

  drawWind(ctx, t) {
    const B = this.B;
    const gust = B(7);
    const k = win(t, gust - 0.1, gust + 0.3, gust + 1.8, gust + 2.8);
    const cruise = t > gust + 2 ? 0.45 : 0;
    const amt = Math.max(k, cruise * prog(t, gust + 2, gust + 3) * (1 - prog(t, 29.5, 31)));
    if (amt <= 0) return;
    for (let i = 0; i < 9; i++) {
      const sp = 0.9 + hash2(i, 4) * 0.8;
      const ph = ((t - gust) * sp + hash2(i, 7)) % 1.6;
      const x = -300 + ph * 1600 + hash2(i, 2) * 300;
      const y = 140 + hash2(i, 3) * 780;
      const L = 160 + hash2(i, 5) * 160;
      const path = (c) => { c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + L * 0.4, y - 18, x + L * 0.7, y + 14, x + L, y - 4); c.arc(x + L, y - 22, 18, Math.PI / 2, -Math.PI * 0.9, true); };
      stroke(ctx, path, '#FFFFFF', 3.2, { alpha: amt * (1 - Math.abs(ph / 1.6 - 0.5) * 2) * 0.95 });
      stroke(ctx, path, 'rgba(42,46,69,0.25)', 1.2, { alpha: amt * (1 - Math.abs(ph / 1.6 - 0.5) * 2) });
    }
  }
}

// the petal 豆豆 rides: a curved coral petal like a little canoe; after landing it slips away
function rideCanoe(ctx, x, y, L, land = 0) {
  const off = E.inQ(clamp((land - 0.92) / 0.08));
  ctx.save();
  ctx.translate(x - off * 60, y + off * 40);
  ctx.rotate(off * -0.5);
  ctx.globalAlpha *= 1 - off;
  const h = L * 0.17;
  const body = (c) => { c.beginPath(); c.moveTo(-L / 2, -h * 0.35); c.bezierCurveTo(-L * 0.32, h * 1.25, L * 0.32, h * 1.25, L / 2, -h * 0.55); c.bezierCurveTo(L * 0.2, h * 0.18, -L * 0.22, h * 0.25, -L / 2, -h * 0.35); c.closePath(); };
  shape(ctx, body, { fill: '#FF7A66', line: darker('#FF6B5B', 0.5), lw: 2.4, shadow: { dx: 0, dy: 26, color: 'rgba(42,46,69,0.10)' } });
  const inner = (c) => { c.beginPath(); c.moveTo(-L * 0.38, -h * 0.05); c.bezierCurveTo(-L * 0.2, h * 0.75, L * 0.22, h * 0.75, L * 0.4, -h * 0.25); c.bezierCurveTo(L * 0.15, h * 0.32, -L * 0.18, h * 0.38, -L * 0.38, -h * 0.05); c.closePath(); };
  shape(ctx, inner, { fill: '#FFB39F', riso: 1 });
  stroke(ctx, P.quad(-L * 0.4, h * 0.05, 0, h * 0.62, L * 0.42, -h * 0.2), darker('#FF6B5B', 0.35), 1.6, { alpha: 0.7 });
  ctx.restore();
}

// pavement only (once the field is far behind)
function drawStreet(ctx, cam) {
  const x0 = cam.x - 1400 / cam.z, x1 = cam.x + 1400 / cam.z;
  shape(ctx, P.rect(x0, GY - 6, x1 - x0, 800), { fill: '#D8CDBA', line: darker('#D8CDBA', 0.5), lw: 2.2 });
  shape(ctx, P.rect(x0, GY + 40, x1 - x0, 760), { fill: '#BFB3A0', riso: 0 });
  for (let x = Math.ceil(x0 / 140) * 140 + 50; x < x1; x += 140) stroke(ctx, P.line(x, GY + 4, x - 20, GY + 38), darker('#D8CDBA', 0.35), 1.6, { alpha: 0.6 });
}
