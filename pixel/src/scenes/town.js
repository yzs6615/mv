// 12.57 - 51.4  STAGE 1: Gray Town and the flower shop.
//  12.57  stage card ("STAGE 1 灰色小镇", the gardener with x1 lives), iris opens on the band's bar
//  15.0   tilt down from the smoggy sky to the street; everyone marches in lockstep on the beat
//  19.8   the gardener walks in against the crowd, out of step; gets bumped at 27.1 and sees stars
//  31.6   zoom into the corner flower shop: the neon buzzes on, identical smiling roses blink together
//  36.8   people buy roses (ka-ching) and all come out wearing the same smile
//  41.4   they all hold the same rose, but each one's thought cloud holds a different flower;
//         the gardener's bubble is a "?"
//  46.5   behind the shop door the odd seed glitches; its rainbow light washes over the window and
//         every "standard" rose shows what it really is, no two alike. The shop's alarm: ERROR.
//         The shopkeeper throws the troublemaker out
//  50.0   ITEM GET: the odd seed
import { P, ex, RAINBOW } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2 } from '../core/math.js';
import { buildCity, drawCity, drawSky, GROUND } from '../art/city.js';
import { drawGardener, pose, seedSprite, GARDENER } from '../art/gardener.js';
import { drawCitizen, folkPoses, briefcase, CPAL } from '../art/folk.js';
import { rose, pot, bubble, ICON, pigeon, cloudSprite, thought, dream, uniqueFlower } from '../art/props.js';
import { puff, sparkle, burst, iris, ringWave, glow } from '../art/fx.js';
import { itemBanner } from '../art/ui.js';

const SHOP_X = 820, SHOP_W = 168;
const WIN = { x: 828, y: 150, w: 96, h: 56 };
const DOOR = { x: 940, y: 154, w: 30, h: 58 };

export default (ctx) => {
  const { m } = ctx;
  let city;
  const T0 = 12.57, T_IRIS = 14.99, T_WALK = 19.84, T_BUMP = 27.11, T_ARRIVE = 31.2, T_ZOOM = 31.3, T_ZOOM1 = 32.25;
  const T_NEON = 31.65, T_NEON_ON = 32.45, T_SMILE = 34.4;
  const BUY = [36.79, 38.02, 39.18];
  const T_BUB = [41.35, 42.15, 42.86], T_Q = 44.03;
  const T_GLOW = 46.45, T_ERR = 48.15, T_TOSS = 48.5, T_LAND = 49.3, T_PICK = 49.6, T_GET = 49.96;
  const T_LEAVE = 45.4, T_TURN = 45.55; // buyers walk off; the gardener turns back to the window
  const SEED_IN = { x: DOOR.x + 15, y: DOOR.y + 22 }; // the odd seed on the counter, seen through the door glass
  const WAVE = 95; // px/s of the seed's light
  // when each window rose shows its true flower (the light reaches it)
  const revealAt = (rx, ry) => T_GLOW + 0.1 + Math.hypot(rx - SEED_IN.x, ry - SEED_IN.y) / WAVE;
  const GX0 = 450, GX1 = 838; // gardener path
  const walkSpeed = 40;

  // gardener x over time (walk, bump pause, arrive)
  const bumpX = GX0 + (T_BUMP - T_WALK) * walkSpeed;
  const gx = (t) => {
    if (t < T_WALK) return GX0 - 30;
    if (t < T_BUMP) return GX0 + (t - T_WALK) * walkSpeed;
    if (t < T_BUMP + 1.3) return bumpX - 7 * prog(t, T_BUMP, T_BUMP + 0.25, E.outQ);
    return Math.min(GX1, bumpX - 7 + (t - T_BUMP - 1.3) * walkSpeed * 1.25);
  };
  const tArrive = T_BUMP + 1.3 + (GX1 - bumpX + 7) / (walkSpeed * 1.25);

  // crowd: lockstep marchers in two lanes
  const crowd = [];
  for (let i = 0; i < 16; i++) {
    const lane = i % 3 === 0 ? 1 : 0;
    crowd.push({ x0: 120 + i * 83 + Math.floor(hash2(i, 3) * 20), lane, v: -26, brief: i % 2 === 0 });
  }
  // the one who bumps him walks in his lane and reaches him at T_BUMP
  const bumper = { lane: 2, x: (t) => bumpX + 9 - (t - T_BUMP) * 26 };

  // cues
  ctx.cue(T_IRIS, 'iris');
  ctx.cue(T_BUMP, 'bonk');
  ctx.cue(T_NEON, 'buzz');
  ctx.cue(T_NEON + 0.3, 'buzz', { v: 0.5 });
  ctx.cue(T_NEON_ON, 'neon');
  ctx.cue(T_SMILE, 'blinkall');
  BUY.forEach((t) => ctx.cue(t, 'coin'));
  T_BUB.forEach((t) => ctx.cue(t, 'pop', { v: 0.5 }));
  ctx.cue(T_Q, 'question');
  ctx.cue(T_GLOW, 'shine');
  ctx.cue(T_GLOW + 0.05, 'wave');
  for (let c = 6; c >= 0; c--) ctx.cue(revealAt(WIN.x + 8 + c * 13, WIN.y + 35), 'twinkle', { v: 0.32, p: 1 + (6 - c) * 0.08 });
  ctx.cue(T_ERR, 'error');
  ctx.cue(T_TOSS, 'toss');
  ctx.cue(T_LAND, 'boing');
  ctx.cue(T_LAND + 0.25, 'boing', { v: 0.4, p: 1.5 });
  ctx.cue(T_GET, 'itemget');
  for (let t = T_WALK; t < T_BUMP; t += 0.3) ctx.cue(t, 'step', { v: 0.18 });
  for (let t = T_BUMP + 1.3; t < tArrive; t += 0.25) ctx.cue(t, 'step', { v: 0.18 });

  // camera: top-left world position and zoom
  function cam(t) {
    if (t < T_WALK) {
      const k = prog(t, T_IRIS + 0.3, T_WALK - 0.2, E.ioC);
      return { x: 360, y: lerp(-230, 0, k), z: 1 };
    }
    if (t < T_ZOOM) return { x: clamp(gx(t) - 200, 360, 700), y: 0, z: 1 };
    const k = prog(t, T_ZOOM, T_ZOOM1, E.ioC);
    const z = lerp(1, 2, k);
    const tx = 788, ty = 104;
    const x0 = clamp(gx(T_ZOOM) - 200, 360, 700);
    // interpolate the view centre
    const cx = lerp(x0 + 240, tx + 120, k), cy = lerp(135, ty + 67.5, k);
    return { x: cx - 240 / z, y: cy - 135 / z, z };
  }

  function drawShop(g, t) {
    const x = SHOP_X, top = 40;
    // building
    g.rect(x, top, SHOP_W, 212 - top, P.peach);
    g.rect(x, top, 2, 212 - top, P.white);
    g.rect(x + SHOP_W - 2, top, 2, 212 - top, P.tan);
    for (let y = top + 4; y < 104; y += 4) for (let bx = x + ((y / 4) % 2 ? 2 : 6); bx < x + SHOP_W - 4; bx += 8) g.rect(bx, y, 6, 1, P.cream);
    g.rect(x - 2, top - 3, SHOP_W + 4, 3, P.cream);
    for (let i = 0; i < 3; i++) {
      const wx = x + 18 + i * 50;
      g.rect(wx - 1, 58, 24, 30, P.tan); g.rect(wx, 59, 22, 28, P.g5); g.rect(wx, 72, 22, 1, P.tan); g.rect(wx + 10, 59, 1, 28, P.tan);
      g.rect(wx - 2, 88, 26, 3, P.cream);
      for (let k = 0; k < 5; k++) g.px(wx + 2 + k * 4, 87, P.greenM);
    }
    // neon board
    const nb = { x: x + 34, y: 106, w: 100, h: 26 };
    g.rect(nb.x - 1, nb.y - 1, nb.w + 2, nb.h + 2, P.ink);
    g.rect(nb.x, nb.y, nb.w, nb.h, P.g5);
    const on = neonOn(t);
    const pink = on ? ex(P.pink) : P.g4, pinkD = on ? ex(P.hot) : P.g4, cyan = on ? ex(P.cyan) : P.g4;
    text(g, '花', nb.x + 10, nb.y + 7, { color: pink, outline: pinkD });
    text(g, '店', nb.x + 24, nb.y + 7, { color: pink, outline: pinkD });
    text(g, 'FLOWERS', nb.x + 42, nb.y + 10, { font: 'en', color: cyan });
    if (on) {
      // rose icon in neon
      g.disc(nb.x + 90, nb.y + 11, 3, ex(P.hot));
      g.disc(nb.x + 90, nb.y + 11, 1, ex(P.pink));
      g.vline(nb.x + 90, nb.y + 15, nb.y + 21, ex(P.green));
    }
    // awning
    for (let i = 0; i < 12; i++) {
      const ax = x + 4 + i * 13.3;
      g.rect(ax, 136, 14, 10, i % 2 ? P.white : P.red);
      g.rect(ax, 146, 14, 2, i % 2 ? P.g1 : P.redD);
      g.disc(ax + 7, 148, 6, i % 2 ? P.white : P.red);
    }
    g.rect(x + 2, 135, SHOP_W - 4, 1, P.ink);
    // window
    g.rect(WIN.x - 3, WIN.y - 3, WIN.w + 6, WIN.h + 8, P.brown);
    g.rect(WIN.x, WIN.y, WIN.w, WIN.h, P.g5);
    for (let r = 0; r < 3; r++) g.rect(WIN.x + 1, WIN.y + 18 + r * 18, WIN.w - 2, 2, P.tan);
    // roses: identical, blink together, extra smile pulse on the chorus line
    const beat = m.beatF(t);
    const blinkNow = (beat % 4 > 3.75) || (t > T_SMILE && t < T_SMILE + 0.25);
    const bounce = t > T_SMILE && t < T_SMILE + 1.2 ? Math.round(Math.abs(Math.sin((t - T_SMILE) * 12)) * 2) : (beat % 1 < 0.15 ? 1 : 0);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 7; c++) {
        const rx = WIN.x + 8 + c * 13, ry = WIN.y + 17 + r * 18;
        const at = revealAt(rx, ry);
        if (t < at) g.spr(rose(blinkNow, true), rx, ry - bounce - 4);
        else {
          // its own flower: shape and colour from its seed, no two alike
          const a = t - at;
          const pop = a < 0.08 ? 2 : a < 0.16 ? 1 : 0;
          g.spr(uniqueFlower(1500 + r * 7 + c, { shop: true, exempt: true }), rx, ry - 1 - pop);
          if (a < 0.06) g.disc(rx, ry - 8, 4, ex(P.white));
          sparkle(g, rx + 4, ry - 12, a - 0.04, ex(P.white), 2);
        }
        g.spr(pot(true), rx, ry + 1);
      }
    }
    // glass reflections
    g.line(WIN.x + 6, WIN.y + 2, WIN.x + 2, WIN.y + 10, P.g3);
    g.line(WIN.x + 60, WIN.y + 2, WIN.x + 40, WIN.y + 42, P.g4);
    // door with the seed tray behind its glass
    g.rect(DOOR.x - 2, DOOR.y - 2, DOOR.w + 4, DOOR.h + 2, P.brown);
    const open = t > T_TOSS - 0.3 && t < T_LAND + 0.6;
    g.rect(DOOR.x, DOOR.y, DOOR.w, DOOR.h, open ? P.ink : P.g4);
    if (!open) {
      g.rect(DOOR.x + 4, DOOR.y + 4, DOOR.w - 8, 24, P.g5);
      if (t > 45.0) {
        // the counter inside, and the odd seed on it
        g.rect(DOOR.x + 4, SEED_IN.y + 4, DOOR.w - 8, 3, P.brown);
        const glitch = t > T_GLOW ? (Math.floor(t * 20) % 3) - 1 : 0;
        if (t > T_GLOW) glow(g, SEED_IN.x, SEED_IN.y, 9 + 2 * Math.sin(t * 14), ex(P.yellow), 0.45);
        g.spr(seedSprite(t * (t > T_GLOW ? 20 : 4), ex), SEED_IN.x + glitch, SEED_IN.y);
      }
      g.rect(DOOR.x + 7, DOOR.y + 32, DOOR.w - 14, 6, P.red);
      g.rect(DOOR.x + 9, DOOR.y + 34, DOOR.w - 18, 2, P.white);
      g.px(DOOR.x + DOOR.w - 5, DOOR.y + 36 + 8, P.gold);
    } else {
      // shopkeeper flinging the seed
      const k = prog(t, T_TOSS - 0.3, T_TOSS, E.outQ);
      drawCitizen(g, DOOR.x + 16, 212, folkPoses.stand(t, { view: 'front', expr: k < 1 ? 'angry' : 'neutral', armR: [4, -6 + Math.round(k * 4)], armL: [-2, 8] }));
    }
    // error flash over the door
    if (t > T_ERR && t < T_ERR + 0.9 && Math.floor((t - T_ERR) * 8) % 2 === 0) {
      g.rect(DOOR.x - 6, DOOR.y - 14, 42, 11, ex(P.ink));
      text(g, 'ERROR', DOOR.x + 15, DOOR.y - 12, { font: 'en', align: 'center', color: ex(P.hot) });
    }
    g.rect(x - 4, 210, SHOP_W + 8, 2, P.tan);
  }
  const neonOn = (t) => {
    if (t < T_NEON) return false;
    if (t > T_NEON_ON) return !(t > T_NEON_ON + 2 && hash2(Math.floor(t * 12), 5) < 0.04);
    const f = Math.floor((t - T_NEON) * 14);
    return [1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 1][f % 11] === 1;
  };

  // seed in flight after the toss
  function seedPos(t) {
    const x0 = SEED_IN.x + 4, y0 = SEED_IN.y + 2, x1 = GX1 + 8, yg = GROUND - 1;
    if (t < T_LAND) {
      const k = (t - T_TOSS) / (T_LAND - T_TOSS);
      return [lerp(x0, x1 + 14, k), lerp(y0, yg, k) - Math.sin(k * Math.PI) * 62];
    }
    const a = t - T_LAND;
    if (a < 0.25) return [x1 + 14 - a * 24, yg - Math.sin((a / 0.25) * Math.PI) * 8];
    return [x1 + 8, yg];
  }

  return {
    id: 'town', t0: T0, t1: 51.9,
    init() { city = buildCity(11, 2400, [[SHOP_X - 4, SHOP_X + SHOP_W + 4]]); },
    zoom(t) { return cam(t).z; },
    draw(g, t) {
      if (t < T_IRIS) { stageCard(g, t); return; }
      const c = cam(t);
      const cx = Math.round(c.x), cy = Math.round(c.y);
      // sky and smog
      drawSky(g, -cy * 0.25 + 30, 'gray');
      for (let i = 0; i < 7; i++) {
        const w = 60 + (i % 3) * 30, sx = ((i * 157 + t * (6 + i % 3 * 3) - cx * 0.1) % (g.W + 200)) - 100;
        g.spr(cloudSprite(i + 1, w, 22 + (i % 2) * 8, [P.g2, P.g3, P.g4]), sx, 40 + (i * 37) % 90 - cy * 0.15 - 30);
      }
      // pigeons crossing the sky during the tilt
      if (t < T_WALK + 2) for (let i = 0; i < 6; i++) {
        const a = t - (T_IRIS + 1.2 + i * 0.15);
        if (a < 0) continue;
        g.spr(pigeon(Math.floor(t * 8 + i) % 2), -20 + a * 70 + i * 14, 70 + i * 9 - a * 12 - cy * 0.4 - 60);
      }
      g.push(-cx, -cy);
      // town layers (drawCity expects screen offset; emulate with push)
      g.pop();
      drawCity(g, city, cx, cy);
      g.push(-cx, -cy);
      drawShop(g, t);
      // characters, sorted by lane
      const chars = [];
      if (t < T_ZOOM1 + 0.5) {
        for (const p of crowd) {
          let x = p.x0 + p.v * (t - T_WALK);
          x = ((x - 100) % 1400 + 1400) % 1400 + 100;
          if (x < cx - 40 || x > cx + g.W + 40) continue;
          const y = p.lane ? GROUND + 5 : GROUND - 5;
          chars.push([y, () => drawCitizen(g, x, y, folkPoses.walk(m.beatF(t), { flip: true, item: p.brief ? { s: briefcase() } : null }))]);
        }
        if (t > T_BUMP - 4 && t < T_BUMP + 6) {
          const x = bumper.x(t), by = GROUND + 1 + Math.round(5 * prog(t, T_BUMP, T_BUMP + 0.4, E.outQ));
          chars.push([by + 0.5, () => drawCitizen(g, x, by, folkPoses.walk(m.beatF(t), { flip: true }))]);
        }
      }
      // buyers (shop phase)
      if (t > 35.5) for (let i = 0; i < 3; i++) buyer(g, t, i, chars);
      // the gardener
      chars.push([GROUND + 1, () => gardener(g, t)]);
      chars.sort((a, b) => a[0] - b[0]).forEach((c2) => c2[1]());
      // the seed
      if (t > T_TOSS && t < T_PICK) {
        for (let k = 3; k >= 1; k--) { const [tx, ty] = seedPos(Math.max(T_TOSS, t - k * 0.04)); if (t < T_LAND) g.px(tx, ty - 1, ex([P.hot, P.yellow, P.cyan][k - 1])); }
        const [sx, sy] = seedPos(t);
        g.spr(seedSprite(t * 12, ex), sx, sy);
        sparkle(g, sx + 4, sy - 6, (t * 2) % 0.6, ex(P.white), 2);
      }
      // thought clouds: same rose in every hand, a different flower in every head
      if (t > T_BUB[0] - 0.05 && t < T_LEAVE) {
        const DREAM = ['sunflower', 'bluebell', 'tulip'];
        const lift = [0, 13, 0], shift = [-5, -2, 1];
        [0, 2, 1].forEach((i) => {
          if (t < T_BUB[i]) return;
          const pop = t - T_BUB[i] < 0.08 ? 2 : 0;
          const ax = BUYPOS[i] + shift[i], ay = GROUND - 33 - lift[i] - pop;
          g.spr(thought(), ax, ay);
          g.spr(dream(DREAM[i]), ax + 9, ay - 15 + (Math.floor(m.beatF(t) + i) % 2));
          sparkle(g, ax + 16, ay - 20, t - T_BUB[i] - 0.05, ex(P.yellow), 2);
        });
      }
      if (t > T_Q && t < T_TURN + 0.2) {
        const a = t - T_Q;
        const pop = a < 0.06 ? 4 : a < 0.12 ? 2 : 0;
        g.spr(bubble('q'), GX1 + 4, GROUND - 32 - pop + (a > 0.3 ? Math.round(Math.sin(a * 6)) : 0));
      }
      // the seed's light rolling out over the window
      if (t > T_GLOW && t < T_GLOW + 2.2) ringWave(g, SEED_IN.x, SEED_IN.y, t - T_GLOW, { speed: WAVE, n: 3, gap: 8, max: 150, cols: RAINBOW.map(ex) });
      // coins over the door
      BUY.forEach((tb) => {
        const a = t - tb;
        if (a < 0 || a > 0.7) return;
        g.spr(ICON.coin(), DOOR.x + 15, DOOR.y - 4 - Math.round(Math.min(1, a * 6) * 16));
        sparkle(g, DOOR.x + 22, DOOR.y - 18, a - 0.1, ex(P.yellow), 3);
      });
      // bump stars
      if (t > T_BUMP && t < T_BUMP + 1.2) {
        for (let i = 0; i < 3; i++) {
          const a = (t - T_BUMP) * 9 + (i / 3) * Math.PI * 2;
          g.spr(ICON.star(), bumpX - 7 + Math.cos(a) * 9, GROUND - 32 + Math.sin(a) * 3);
        }
      }
      if (t > T_WALK + 0.3 && t < T_WALK + 4.5 && Math.floor(t * 3) % 2 === 0) {
        const px = gx(t);
        text(g, 'P1', px, GROUND - 46, { font: 'en', align: 'center', color: ex(P.yellow), outline: P.ink });
        g.px(px - 1, GROUND - 37, ex(P.yellow)); g.px(px, GROUND - 37, ex(P.yellow)); g.px(px + 1, GROUND - 37, ex(P.yellow)); g.px(px, GROUND - 36, ex(P.yellow));
      }
      if (t > T_GET - 0.05 && t < 51.4) burst(g, GX1, GROUND - 46, t - T_GET, { n: 10, r: 22, cols: [ex(P.white), ex(P.yellow)] });
      g.pop();
      // iris in from the stage card
      if (t < T_IRIS + 0.7) iris(g, g.W / 2, g.H / 2, prog(t, T_IRIS, T_IRIS + 0.7, E.inQ) * 300);
    },
    post(g) { grayPass(g, []); },
    ui(g, t) {
      if (t > T_GET) itemBanner(g, '得到了 奇怪的种子！', '???  无法识别  ???', t - T_GET, seedSprite(t * 12));
    },
    lyric(t) { return t < T_IRIS ? { hide: true } : null; },
  };

  // ---- pieces that need the closure ----
  function stageCard(g, t) {
    g.clear(P.ink);
    const a = t - T0;
    text(g, 'STAGE 1', g.W / 2, 92, { font: 'en', scale: 2, align: 'center', color: P.white });
    text(g, '灰色小镇', g.W / 2, 120, { align: 'center', color: P.g1, scale: 1 });
    drawGardener(g, g.W / 2 - 22, 176, pose.walk(a * 1.5));
    text(g, 'x 1', g.W / 2 + 4, 162, { font: 'en', color: P.white });
    if (a > 0.6) sparkle(g, g.W / 2 + 54, 98, (a - 0.6) % 0.8, P.white, 3);
  }

  function gardener(g, t) {
    const x = gx(t);
    let p;
    if (t < T_WALK) return;
    if (t < T_BUMP) p = pose.walk((t - T_WALK) * 2.4, { stride: 3 });
    else if (t < T_BUMP + 1.3) {
      const a = t - T_BUMP;
      p = { ...pose.idle(t), expr: a < 0.9 ? 'hurt' : 'worried', bob: a < 0.25 ? -Math.round(Math.sin((a / 0.25) * Math.PI) * 3) : 0, armL: [-3, 1], armR: [3, 1], headDy: a < 0.25 ? 0 : 1 };
      if (a > 0.9) p = { ...pose.idle(t), expr: 'worried' };
    } else if (t < tArrive) p = pose.walk((t - T_BUMP - 1.3) * 3, { stride: 3 });
    else if (t < T_Q) {
      // looking at the window: back view, little bounces when the roses blink
      p = { ...pose.idle(t), view: 'back', armL: [-2, 5], armR: [2, 5] };
      if (t > T_SMILE && t < T_SMILE + 0.6) p.headDy = -1;
    } else if (t < T_TURN) {
      // "?": everyone holds the same rose but thinks of a different flower
      p = { ...pose.front(t), expr: 'surprised', headDx: 1 };
    } else if (t < T_ERR) {
      // back to the window; a little hop when the roses start to change
      const first = T_GLOW + 0.55;
      const a = t - first;
      p = { ...pose.idle(t), view: 'back', armL: [-2, 5], armR: [2, 5], bob: a > 0 && a < 0.2 ? -2 : 0 };
      if (a > 0.9) p = { ...p, armL: [-3, 1], armR: [3, 1] };
    } else if (t < T_PICK) {
      p = { ...pose.front(t), expr: 'surprised', headDx: Math.floor(t * 6) % 2 };
      if (t > T_LAND) p = { ...pose.front(t), expr: 'surprised', armL: [-3, 3], armR: [3, 3] };
    } else if (t < T_GET) {
      p = { ...pose.front(t), crouch: 3, armL: [-1, 6], armR: [3, 7], expr: 'neutral' };
    } else {
      // item get: both hands up, seed above the head
      p = { view: 'front', armL: [-3, -8], armR: [3, -8], armsFront: true, expr: 'happy', scarf: t };
      drawGardener(g, x, GROUND + 1, p);
      g.spr(seedSprite(t * 12, ex), x, GROUND - 36 + (Math.floor(t * 4) % 2));
      return;
    }
    drawGardener(g, x, GROUND + 1, p);
    if (t > T_GLOW + 0.55 && t < T_GLOW + 1.6) g.spr(bubble('ex'), x + 2, GROUND - 34 - (t - T_GLOW - 0.55 < 0.08 ? 2 : 0));
    if (t > T_LAND + 0.3 && t < T_PICK) {
      g.spr(bubble('ex'), x + 2, GROUND - 34);
    }
  }

  function buyer(g, t, i, chars) {
    // walk in from the right to the door, vanish inside, come out with a rose and the smile
    const tb = BUY[i];
    const tin = tb - 0.9, tout = tb;
    const doorX = DOOR.x + 15;
    let x, p, y = GROUND + 4;
    if (t < tin) { x = doorX + (tin - t) * 40; p = folkPoses.walk(m.beatF(t), { flip: true }); }
    else if (t < tout) return;
    else {
      // out of the door, walk to a spot by the window and stand; leave together before the light
      const spot = BUYPOS[i];
      const k = Math.min(1, (t - tout) / 1.2);
      x = lerp(doorX, spot, k);
      p = k < 1 ? folkPoses.walk(m.beatF(t), { flip: true, expr: 'standard' }) : folkPoses.stand(t, { view: 'front', expr: 'standard', headDy: t > T_BUB[i] && t < T_BUB[i] + 0.3 ? -1 : 0 });
      if (t > T_LEAVE) {
        x = spot + (t - T_LEAVE) * 48;
        p = folkPoses.walk(m.beatF(t), { expr: 'standard' });
        if (x > DOOR.x + 120) return;
      }
      p.item = { s: rose(false, true), dy: 2 };
    }
    chars.push([y + i * 0.01, () => {
      drawCitizen(g, x, y, p);
      if (t > tout && t < tout + 0.5) sparkle(g, x + 4, y - 28, t - tout, ex(P.yellow), 3);
    }]);
  }
};
const BUYPOS = [880, 898, 916];
