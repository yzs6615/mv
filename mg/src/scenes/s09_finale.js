// 3:32.6–4:37  尾声 + 片尾 — a tree grows out of the page, every branch ends in its own flower; three
// round frames (你 / 我 / 他); half sun, half rain, then each frame gets its own sky; pull back on
// "Only one". La-la outro: 豆豆 steps out of its frame and walks home along a green line, a flower
// blooming at every "la", while the credits pass. It ends where the film began: a seed falls on the
// soil line and the outline of a flower nobody has seen yet draws itself above it.
import { Scene } from './base.js';
import { C } from '../art/palette.js';
import { E, clamp, lerp, prog, win, spring, wobble, TAU, hash2, rng } from '../core/math.js';
import { track } from '../core/camera.js';
import { shape, stroke, P, INK } from '../core/draw.js';
import { drawLine, makeLine } from '../core/text.js';
import { drawPip, drawPipBloom, blinkAt } from '../art/pip.js';
import { sparkle, drawPetal, drawRain, drawCloud, drawSun, ghostFlower, drawMound, drawGround, skyGradient } from '../art/kit.js';
import { flowerSpec, pipSpec, drawHead, drawPlant, drawLeafAt, darker, mixHex, SEEDS } from '../art/flower.js';
import { drawHills } from '../art/town.js';
import { Mosaic, T_X_END } from './s08_mosaic.js';

const T0 = T_X_END;                 // 212.568
const T_OUT = 231.962;              // outro
const T_LA = 236.81;
const T_HOME = 268.3, T_SEED = 273.17, T_HIT = 274.386;
const END = 277.08;
const BARK = '#9B6A47';

function makeTree() {
  const r = rng(2024);
  const branches = [], tips = [];
  const DUR = [1.15, 0.9, 0.8, 0.7, 0.62, 0.56];
  const grow = (x, y, ang, len, w, depth, t0) => {
    const dur = DUR[depth];
    const bend = r.range(-0.22, 0.22);
    const x1 = x + Math.sin(ang) * len, y1 = y - Math.cos(ang) * len;
    const b = { x0: x, y0: y, x1, y1, cx: (x + x1) / 2 + Math.cos(ang) * len * bend, cy: (y + y1) / 2 + Math.sin(ang) * len * bend, w0: w, w1: w * 0.6, depth, t0, t1: t0 + dur, ang };
    branches.push(b);
    if (depth >= 5) { tips.push(b); return; }
    const n = depth === 0 ? 3 : r.chance(0.22) ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const spread = n === 3 ? (k - 1) * 0.62 : (k === 0 ? -1 : 1) * r.range(0.34, 0.58);
      grow(x1, y1, ang * 0.75 + spread + r.range(-0.1, 0.1), len * r.range(0.7, 0.8), w * 0.62, depth + 1, t0 + dur * 0.72);
    }
  };
  grow(0, 0, 0, 390, 54, 0, 212.62);
  return { branches, tips };
}
const qpt = (b, u) => [(1 - u) * (1 - u) * b.x0 + 2 * (1 - u) * u * b.cx + u * u * b.x1, (1 - u) * (1 - u) * b.y0 + 2 * (1 - u) * u * b.cy + u * u * b.y1];

export class Finale extends Scene {
  constructor(film) {
    super(film, T0, END + 1);
    this.pipF = pipSpec();
    this.tree = makeTree();
    this.tree.tips.forEach((b, i) => { b.F = flowerSpec(30000 + i); b.bloom = this.ut(36, 9) - 0.1 + Math.abs(b.x1) / 900 * 0.5 + hash2(i, 4) * 0.15; });
    // frames hang from the outer ends of three depth-2 branches
    const d3 = this.tree.branches.filter((b) => b.depth === 3);
    const near = (x) => d3.reduce((best, b) => (Math.abs(b.x1 - x) < Math.abs(best.x1 - x) ? b : best), d3[0]);
    this.frames = [-600, 40, 640].map((x, i) => { const b = near(x); return { b, x: b.x1, y: b.y1 + (i === 1 ? 360 : 300), who: ['你', '我', '他'][i] }; });
    this.otherF = flowerSpec(30500, { type: 'anemone', scheme: ['#6EC1E4', '#CDEBF7', '#FFE58A', '#3B7FC4'] });
    // la-la walk: one flower per sung syllable
    const syl = (film.lyrics.outroSyllables || []).filter((x) => x > T_LA - 0.2 && x < T_HOME + 0.6);
    this.la = syl.map((t, i) => ({ t, F: flowerSpec(20000 + i), side: i % 2 ? 1 : -1, h: 90 + hash2(i, 2) * 110, R: 36 + hash2(i, 3) * 18 }));
    this.newSeedF = flowerSpec(99999);
    this.cam = track([
      { t: T0, x: 0, y: -60, z: 1.15 },
      { t: 213.9, x: 0, y: -380, z: 0.86, e: E.ioC },
      { t: 216.6, x: 0, y: -640, z: 0.62, e: E.ioC },
      { t: 222.2, x: 0, y: -640, z: 0.64, e: E.sine },
      { t: 226.9, x: 0, y: -620, z: 0.62, e: E.sine },
      { t: 230.6, x: 0, y: -520, z: 0.46, e: E.ioC },
      { t: 232.4, x: 120, y: -420, z: 0.5, e: E.sine },
      { t: 235.6, x: 520, y: -260, z: 0.82, e: E.ioC },
    ]);
    this.flowerCount = SEEDS.size;
  }
  mosaic() { return this.film.scenes.find((s) => s instanceof Mosaic); }

  static lyrics() {
    return {
      36: { x: 250, y: 560, size: 80, vertical: true, rows: [3], colAlign: 'center', lineHeight: 1.45, accent: (i, u) => (u.c === '枝' || u.c === '丫' ? C.leafDark : null), exitT: 217.05 },
      37: { x: 960, y: 985, size: 74, accent: (i, u) => (u.c === '你' || u.c === '我' || u.c === '他' ? C.coral : null) },
      38: { x: 960, y: 985, size: 74, accent: (i, u) => (u.c === '阳' ? C.marigold : u.c === '雨' ? C.sky : null) },
      39: { inScene: true },
    };
  }

  pathY(x) { return 40 * Math.sin(x * 0.0021) - 10; }
  pipX(t) { return lerp(300, 7900, prog(t, T_LA, T_HOME, (u) => u)); }
  outroCam(t) {
    const px = this.pipX(t);
    const walk = { x: px + 300, y: -470, z: 0.86 };
    const c0 = this.cam(Math.min(t, 235.6));
    const k = E.ioC(prog(t, 235.6, 237.6));
    const home = E.ioC(prog(t, T_HOME - 0.6, T_HOME + 1.8));
    const hx = this.pipX(T_HOME) + 280;
    return {
      x: lerp(lerp(c0.x, walk.x, k), hx, home),
      y: lerp(lerp(c0.y, walk.y, k), -420, home),
      z: lerp(lerp(c0.z, walk.z, k), 0.92, home),
      r: 0,
    };
  }

  draw(ctx, t) {
    const cam = t < 235.6 ? this.cam(t) : this.outroCam(t);
    this.drawSky(ctx, t, cam);
    this.apply(ctx, cam);
    this.drawLand(ctx, t, cam);
    this.drawTree(ctx, t);
    this.drawFrames(ctx, t);
    this.drawWalk(ctx, t);
    this.drawHome(ctx, t);
    this.screen(ctx);
    // the mosaic page is lifted off the top like a sheet of paper
    const lift = prog(t, T0, T0 + 0.75, E.inQ);
    if (lift < 1) {
      ctx.save();
      ctx.translate(0, -lift * 1250);
      ctx.rotate(-lift * 0.06);
      ctx.fillStyle = 'rgba(42,46,69,0.18)';
      ctx.fillRect(0, 1080, 1920, 36);
      ctx.beginPath(); ctx.rect(0, 0, 1920, 1080); ctx.clip();
      this.mosaic().draw(ctx, Math.min(t, T0 - 0.001));
      ctx.restore();
      this.screen(ctx);
    }
    this.drawType(ctx, t);
  }

  drawSky(ctx, t, cam) {
    // sunset for the walk home; paper again at the very end
    const dusk = prog(t, 233, 240);
    const home = prog(t, T_HOME - 0.4, T_HOME + 1.6);
    skyGradient(ctx, 0, 0, 1920, 1080, mixHex('#FBEADB', '#F6C9B8', dusk * (1 - home)), mixHex(C.paper, '#FBE3CC', dusk * (1 - home)), mixHex('#F8EFE2', '#FAD9C2', dusk * (1 - home)));
    // a low evening sun during the walk
    const ev = prog(t, 236, 240) * (1 - prog(t, T_HOME - 0.6, T_HOME + 1.0));
    if (ev > 0) {
      const g = ctx.createRadialGradient(1500, 640, 40, 1500, 640, 520);
      g.addColorStop(0, `rgba(255,214,150,${0.75 * ev})`);
      g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(900, 100, 1100, 1000);
      shape(ctx, P.circle(1500, 640, 92), { fill: '#FFD58A', line: darker('#FFB627', 0.35), lw: 2.2, alpha: ev });
    }
    // half sun, half rain
    const sun = win(t, this.ut(38, 0) - 0.2, this.ut(38, 0) + 0.3, this.ut(38, 6) - 0.1, this.ut(38, 6) + 0.5);
    const rain = win(t, this.ut(38, 3) - 0.2, this.ut(38, 3) + 0.3, this.ut(38, 6) - 0.1, this.ut(38, 6) + 0.5);
    if (sun > 0 || rain > 0) {
      const sx = 960 + (0 - cam.x) * cam.z;
      ctx.save();
      ctx.globalAlpha = sun;
      const g = ctx.createLinearGradient(sx - 900, 0, sx + 160, 0);
      g.addColorStop(0, 'rgba(255,224,140,0.85)'); g.addColorStop(0.75, 'rgba(255,236,180,0.6)'); g.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, sx + 160, 1080);
      ctx.globalAlpha = rain;
      const g2 = ctx.createLinearGradient(sx - 160, 0, sx + 900, 0);
      g2.addColorStop(0, 'rgba(141,147,172,0)'); g2.addColorStop(0.25, 'rgba(141,147,172,0.6)'); g2.addColorStop(1, 'rgba(120,126,152,0.85)');
      ctx.fillStyle = g2;
      ctx.fillRect(sx - 160, 0, 1920, 1080);
      ctx.restore();
      this.apply(ctx, cam);
      if (sun > 0) drawSun(ctx, -900, -1250, 120, t, { alpha: sun });
      if (rain > 0) {
        drawCloud(ctx, 900, -1260, 700, 170, { fill: '#8D93AC', line: '#4A5070', seed: 5, alpha: rain, shadeColor: 'rgba(50,55,80,0.4)' });
        ctx.save();
        ctx.beginPath(); ctx.rect(0, -1300, 3000, 1400); ctx.clip();
        drawRain(ctx, t, 0, -1250, 1600, 1250, { density: 1.4 * rain, angle: 0.2, len: 60, lw: 3, color: 'rgba(225,235,255,0.8)', speed: 1600 });
        ctx.restore();
      }
      this.screen(ctx);
    }
  }

  drawLand(ctx, t, cam) {
    // a soft hill under the tree, then the meadow the path runs through
    const x0 = cam.x - 1400 / cam.z, x1 = cam.x + 1400 / cam.z;
    if (t > 232) {
      ctx.save();
      ctx.translate(cam.x * 0.55, -40);
      ctx.globalAlpha *= prog(t, 232, 234) * (1 - prog(t, T_HOME - 0.4, T_HOME + 1.2));
      drawHills(ctx, Math.floor((x0 - cam.x * 0.55) / 40) * 40, x1 - cam.x * 0.55 + 400, -40, '#D5E7CF', 6, 150);
      ctx.restore();
      ctx.save();
      ctx.translate(cam.x * 0.3, -10);
      ctx.globalAlpha *= prog(t, 232, 234) * (1 - prog(t, T_HOME - 0.4, T_HOME + 1.2));
      drawHills(ctx, Math.floor((x0 - cam.x * 0.3) / 40) * 40, x1 - cam.x * 0.3 + 400, 10, '#BBDDB4', 11, 90);
      ctx.restore();
    }
    const fieldA = 1 - prog(t, T_HOME - 0.4, T_HOME + 1.2);
    drawGround(ctx, x0, x1, 0, { seed: 9, depth: 300, color: mixHex('#9B6A47', '#8A5A3C', 1 - fieldA), alpha: 1 });
    shape(ctx, (c) => { c.beginPath(); c.ellipse(0, 14, 620, 70, 0, Math.PI, TAU); c.closePath(); }, { fill: '#9FCB8F', line: darker('#9FCB8F', 0.5), lw: 2.4, alpha: fieldA * (1 - prog(t, 236, 238)) + (t < 236 ? 0 : 0) });
  }

  drawTree(ctx, t) {
    if (t > 245) return;
    const sway = (b) => Math.sin(t * 1.1 + b.depth) * 0.006 * b.depth;
    for (const b of this.tree.branches) {
      const k = E.outC(prog(t, b.t0, b.t1));
      if (k <= 0) continue;
      const n = 10, L = [], R = [];
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * k;
        const [x, y] = qpt(b, u);
        const [x2, y2] = qpt(b, Math.min(1, u + 0.02));
        const dx = x2 - x, dy = y2 - y, d = Math.hypot(dx, dy) || 1;
        const w = lerp(b.w0, b.w1, u) / 2;
        L.push([x - (dy / d) * w, y + (dx / d) * w]);
        R.push([x + (dy / d) * w, y - (dx / d) * w]);
      }
      const poly = [...L, ...R.reverse()];
      shape(ctx, P.poly(poly), { fill: BARK, line: darker(BARK, 0.5), lw: 2.2 });
      if (b.depth >= 2 && k > 0.6) {
        const [lx, ly] = qpt(b, 0.55);
        drawLeafAt(ctx, lx, ly, b.ang - Math.PI / 2 + (b.depth % 2 ? 0.9 : -0.9) + sway(b) * 20, 70 - b.depth * 6, 18, { grow: prog(k, 0.6, 1), lw: 2 });
      }
    }
    // a flower on every branch tip
    this.tree.tips.forEach((b, i) => {
      const k = prog(t, b.bloom, b.bloom + 0.5);
      if (k <= 0) return;
      drawHead(ctx, b.F, b.x1, b.y1, 52 * E.outBack(k, 1.6) * (1 + 0.05 * this.m.pulse(t, 6)), { open: k, shadow: true });
    });
  }

  drawFrames(ctx, t) {
    if (t > 245) return;
    const at = [this.ut(37, 0), this.ut(37, 2), this.ut(37, 5)];
    const ownSky = prog(t, this.ut(38, 6) - 0.1, this.ut(38, 8) + 0.3);
    this.frames.forEach((f, i) => {
      const k = prog(t, at[i] - 0.15, at[i] + 0.5);
      if (k <= 0) return;
      const swing = Math.sin((t - at[i]) * 3.2) * 0.22 * Math.exp(-(t - at[i]) * 1.1) + Math.sin(t * 1.3 + i) * 0.02;
      const drop = (1 - E.outBack(k, 1.6)) * -300;
      const top = [f.b.x1, f.b.y1];
      ctx.save();
      ctx.translate(top[0], top[1]);
      ctx.rotate(swing);
      const L = f.y - f.b.y1 + drop;
      stroke(ctx, P.line(0, 0, 0, L - 120), INK, 2.4);
      const R = 168;
      // inside: paper, or its own little sky
      ctx.save();
      ctx.beginPath(); ctx.arc(0, L, R, 0, TAU); ctx.clip();
      const skies = [['#FFE6A3', '#FFF6DC'], ['#2E3460', '#5A5F94'], ['#BFE3F0', '#F4EDE1']];
      const g = ctx.createLinearGradient(0, L - R, 0, L + R);
      g.addColorStop(0, mixHex('#FFF8EE', skies[i][0], ownSky)); g.addColorStop(1, mixHex('#FFF8EE', skies[i][1], ownSky));
      ctx.fillStyle = g;
      ctx.fillRect(-R, L - R, R * 2, R * 2);
      if (ownSky > 0) {
        if (i === 0) drawSun(ctx, 50, L - 60, 26, t, { alpha: ownSky, glow: false });
        if (i === 1) for (let s = 0; s < 14; s++) shape(ctx, P.circle(-90 + hash2(s, 1) * 180, L - 100 + hash2(s, 2) * 90, 2.5), { fill: '#FFF3C4', riso: 0, alpha: ownSky });
        if (i === 2) ['#FF6B5B', '#FFD84D', '#7CC49A', '#6EC1E4'].forEach((c, j) => stroke(ctx, (cc) => { cc.beginPath(); cc.arc(0, L + 40, 110 - j * 12, Math.PI, TAU); }, c, 10, { alpha: ownSky * 0.9, cap: 'butt' }));
      }
      // portraits
      const blink = blinkAt(t, 30 + i);
      if (i === 0) drawPip(ctx, 0, L + 132, 168, { mood: 'happy', blink, tint: ['#F7E0C4', 0.55], sprout: 1, legs: 0, shadow: false });
      if (i === 1 && t < 232.4) drawPipBloom(ctx, 0, L + 150, 118, { mood: 'happy', blink, stemH: 96, R: 64, open: 1, F: this.pipF, legs: 0, shadow: false });
      if (i === 2) drawPipBloom(ctx, 0, L + 150, 118, { mood: 'smile', blink, stemH: 96, R: 64, open: 1, F: this.otherF, legs: 0, shadow: false, tint: ['#9C6B48', 0.45] });
      ctx.restore();
      stroke(ctx, P.circle(0, L, R), darker(BARK, 0.2), 14);
      stroke(ctx, P.circle(0, L, R + 7), darker(BARK, 0.55), 2.2);
      ctx.save();
      ctx.fillStyle = INK;
      ctx.font = '700 72px "LXGW WenKai"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.who, 0, L + R + 62);
      ctx.restore();
      ctx.restore();
    });
  }

  // la-la: 豆豆 walks home, a flower at every "la"
  drawWalk(ctx, t) {
    if (t < 231.9) return;
    const me = this.frames[1];
    const jump = prog(t, 232.4, 233.6);
    const walk = prog(t, T_LA, T_HOME);
    // the green line
    const lineEnd = this.pipX(t);
    if (t > 234) {
      const pts = [];
      for (let x = 160; x <= Math.max(170, lineEnd); x += 40) pts.push([x, this.pathY(x)]);
      if (pts.length > 1) { stroke(ctx, P.poly(pts, false), C.leafDark, 9); stroke(ctx, P.poly(pts, false), C.leafLight, 5); }
    }
    for (const f of this.la) {
      if (t < f.t) continue;
      const k = prog(t, f.t, f.t + 0.45);
      const x = this.pipX(f.t) - 70 + f.side * 26, y = this.pathY(x) + 4;
      drawPlant(ctx, f.F, x, y, f.h * E.outBack(k, 1.8), f.R, { open: k, leafGrow: k, sway: Math.sin(t * 1.6 + f.t) * 0.06, shadow: true });
    }
    let x, y, mood = 'happy', step = 0, sq = 1;
    if (t < T_LA) {
      // out of the frame, down to the foot of the tree
      const [fx, fy] = [me.b.x1, me.y + 108];
      const u = E.ioC(jump);
      x = lerp(fx, 300, u); y = lerp(fy, this.pathY(300), u) - Math.sin(u * Math.PI) * 320;
      sq = jump >= 1 ? 1 - 0.25 * wobble(t - 233.6, 2.5, 5) : 1;
      mood = jump > 0 && jump < 1 ? 'laugh' : 'happy';
      if (t < 232.4) return;
    } else {
      x = this.pipX(t); y = this.pathY(x);
      step = (t - T_LA) * 1.65;
      mood = Math.sin(t * 0.8) > 0.3 ? 'laugh' : 'happy';
    }
    const stopping = t > T_HOME;
    const tip = drawPipBloom(ctx, x, y, 150, {
      mood: stopping ? 'calm' : mood, blink: blinkAt(t, 1), stemH: 430, R: 172, open: 1, F: this.pipF, sway: Math.sin(t * 1.4) * 0.04 - (stopping ? 0.1 * win(t, 270.6, 271.4, 272.6, 273.6) : 0),
      step: walk > 0 && !stopping ? step : 0, walk: walk > 0 && !stopping ? 1 : 0, squash: sq, look: stopping ? [0.8, 0.3] : [0.8, 0],
      rot: walk > 0 && !stopping ? Math.sin(step * TAU) * 0.05 : 0,
    });
    this.tipAtHome = tip;
  }

  // the bookend: a seed falls from 豆豆's flower onto the soil line; a dotted flower draws above it
  drawHome(ctx, t) {
    if (t < T_HOME) return;
    const px = this.pipX(T_HOME);
    const sx = px + 420;
    const tip = [px + Math.sin(-0.1) * 430 * 0.85, this.pathY(px) - 150 * 0.16 - 150 * 0.84 * 0.92 - 430];
    const fall = prog(t, T_SEED - 1.25, T_SEED, E.inQ);
    if (fall > 0 && fall < 1) {
      const x = lerp(tip[0] + 60, sx, fall), y = lerp(tip[1] + 40, this.pathY(sx), fall) - Math.sin(fall * Math.PI) * 160;
      drawPip(ctx, x, y + 50, 56, { mood: 'wow', legs: 0, shadow: false, rot: fall * 3 });
    }
    if (t >= T_SEED) {
      const land = 1 - 0.3 * wobble(t - T_SEED, 2.6, 5);
      const planted = spring(prog(t, T_SEED + 0.15, T_SEED + 0.9), 1.3, 6);
      ctx.save();
      ctx.beginPath(); ctx.rect(sx - 200, -3000, 400, 3000 + this.pathY(sx) - 2); ctx.clip();
      drawPip(ctx, sx, this.pathY(sx) + 4 * planted, 56, { mood: t > T_HIT ? 'happy' : 'smile', blink: blinkAt(t, 40), legs: 1 - planted, squash: land, shadow: false });
      ctx.restore();
      drawMound(ctx, sx, this.pathY(sx), 110, 20 * planted);
      const g = prog(t, T_SEED + 0.35, T_HIT + 0.2, E.ioC);
      ghostFlower(ctx, this.newSeedF, sx, this.pathY(sx) - 12, 300, 92, g, t, { color: 'rgba(42,46,69,0.5)' });
      const hit = prog(t, T_HIT, T_HIT + 1.2);
      if (hit > 0 && hit < 1) for (let i = 0; i < 6; i++) sparkle(ctx, sx + Math.cos(i * 1.05) * 150 * (0.6 + hit), this.pathY(sx) - 312 + Math.sin(i * 1.05) * 120 * (0.6 + hit), 26 * Math.sin(Math.PI * hit), { rot: t * 2 });
    }
  }

  drawType(ctx, t) {
    // L39 in two tiers: the line, then its last words stamped large
    const L = this.line(39);
    if (L) {
      const a = { ...L, chars: L.chars.slice(0, 7) }, b = { ...L, chars: L.chars.slice(7) };
      drawLine(ctx, a, t, { x: 960, y: 900, size: 72, accent: (i, u) => (i >= 5 ? C.coral : null), exitT: 232.6, exitDur: 0.5, seed: 39 });
      drawLine(ctx, b, t, { x: 960, y: 1005, size: 92, style: 'stamp', color: C.coral, exitT: 232.7, exitDur: 0.5, seed: 40 });
    }
    // credits on the la-la phrases
    const W = this.m.beat * 8;
    const credits = [
      ['《世界上唯一的花》中文版', 'Sekai ni Hitotsu Dake no Hana · Chinese version'],
      ['原曲作词·作曲  槇原敬之', '中文填词  林明阳'],
      ['MG 动画 · 每一帧都由代码绘制', 'Canvas 2D · 99 BPM · 60 fps'],
      [`本片出现的 ${this.flowerCount} 朵花`, '各由一个种子数生成，没有两朵完全相同'],
      ['Every flower in this film', 'grew from its own seed.'],
    ];
    credits.forEach((c, i) => {
      const t0 = T_LA + 0.35 + i * W, t1 = t0 + W - 0.9;
      if (t < t0 - 0.1 || t > t1 + 0.8) return;
      const l1 = this.cache(`c${i}a`, () => makeLine(c[0], t0, 0.035));
      const l2 = this.cache(`c${i}b`, () => makeLine(c[1], t0 + 0.35, 0.02));
      drawLine(ctx, l1, t, { x: 960, y: 150, size: /[A-Za-z]/.test(c[0][0]) ? 58 : 60, style: 'fade', inDur: 0.6, exitT: t1, exitDur: 0.6, sing: false, riso: false, seed: 60 + i });
      drawLine(ctx, l2, t, { x: 960, y: 228, size: 36, style: 'fade', inDur: 0.6, exitT: t1 + 0.05, exitDur: 0.6, sing: false, riso: false, color: '#555A78', weight: 400, seed: 70 + i });
    });
    // the last card, over the bookend
    const fin = this.cache('fin', () => makeLine('世界上唯一的花', T_HIT - 0.3, 0.06));
    const only = this.cache('only', () => makeLine('Only one.', T_HIT + 0.3, 0.06));
    drawLine(ctx, fin, t, { x: 1500, y: 360, size: 66, style: 'fade', inDur: 0.8, sing: false, accent: (i, u) => (u.c === '花' ? C.coral : null), seed: 80 });
    drawLine(ctx, only, t, { x: 1500, y: 446, size: 48, style: 'fade', inDur: 0.8, sing: false, color: C.coral, seed: 81 });
    // fade to paper at the very end
    const out = prog(t, END - 1.4, END - 0.1, E.ioC);
    if (out > 0) { ctx.fillStyle = C.paper; ctx.globalAlpha = out; ctx.fillRect(0, 0, 1920, 1080); ctx.globalAlpha = 1; }
  }
  cache(key, fn) { this._c = this._c || {}; return this._c[key] || (this._c[key] = fn()); }
}
