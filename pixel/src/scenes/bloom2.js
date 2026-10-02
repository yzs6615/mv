// 190.75 - 212.57  Chorus 2: everyone.
//  190.75  the cracked screen shatters (film.js 'shatter' transition) onto a world with no fence
//  L31 "用清脆步伐"            the runners step off the track together, five crisp steps; colour washes
//                             over each of them and their race bibs drop away
//  L32 "你是这世界上 最特别的花"  the gardener's bud opens into the lopsided rainbow flower; one by one the
//                             others hold up the odd seeds they had all along: GET!
//  L33 "每个人 ... 都是种子在发芽" they plant them in a row: sprout after sprout, a COMBO counter climbing
//  L34 "这朵花成长 一定会绽放开花"  all bloom at once, none alike; the colour floods the whole screen and the
//                             track turns into a flower bed
//  L35 "汗水灌溉 就让色彩留下"     everyone waters together under a rainbow; a jump on the last beat
import { P, ex, RAINBOW } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2, hash } from '../core/math.js';
import { drawGardener, pose, ITEMS, GARDENER, SPOUT } from '../art/gardener.js';
import { heldPoint } from '../art/rig.js';
import { drawCitizen, folkPoses, RACER, CITIZEN, CPAL, freeLook } from '../art/folk.js';
import { bubble, uniqueFlower, personalSeed, cloudSprite } from '../art/props.js';
import { puff, sparkle, burst, glow, ringWave, lightPillar, pour, petals } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { F, sky, city, ground } from '../art/field.js';
import { combo, levelUp } from '../art/ui.js';

const N = 8;
export default (ctx) => {
  const { m, lyrics } = ctx;
  const T0 = 190.75, T_BLOOM = 197.26, T_PLANT = 198.03, T_WIDE = 197.9, T_ALL = 205.78, T_RAIN = 207.8, T_JUMP = 211.5, T1 = 212.9;
  const STEPS = (lyrics.lines[31] ? lyrics.lines[31].chars.map((c) => c.t) : [190.96, 191.23, 191.65, 191.96, 192.53]);
  const GETS = (lyrics.lines[32] ? lyrics.lines[32].chars.slice(0, 8).map((c) => c.t) : []).concat([197.5, 197.6]).slice(0, N);
  const G = F.ground;
  const LOOKS = Array.from({ length: N }, (_, i) => freeLook(i * 3 + 2));
  const START = Array.from({ length: N }, (_, i) => [372 + (i % 4) * 22 + (i >> 2) * 8, 96 + (i >> 2) * 12]);
  const FINAL = [196, 216, 236, 256, 336, 356, 376, 396].map((x, i) => [x, G + (i % 2) * 5]);
  const PLANT = Array.from({ length: N }, (_, i) => T_PLANT + 0.25 + i * (m.beat / 2));
  ctx.cue(T0, 'shatter');
  STEPS.forEach((t) => ctx.cue(t, 'step8', { v: 0.9, n: 3 }));
  STEPS.forEach((t, k) => ctx.cue(t + 0.02, 'colorize', { v: 0.35, p: 1 + k * 0.12 }));
  ctx.cue(T_BLOOM, 'bigbloom');
  GETS.forEach((t, i) => ctx.cue(t, 'get', { p: 1 + i * 0.07 }));
  ctx.cue(195.53, 'fanfare');
  PLANT.forEach((t, i) => ctx.cue(t, 'combo', { p: 1 + i * 0.09 }));
  ctx.cue(T_ALL, 'allbloom');
  ctx.cue(T_RAIN, 'rainbow');
  for (let t = T_RAIN + 0.3; t < 211; t += m.beat) ctx.cue(t, 'drop', { v: 0.3 });
  ctx.cue(T_JUMP, 'jump');

  const stepN = (t) => STEPS.filter((s) => t >= s).length;
  const posOf = (i, t) => {
    const n = stepN(t), since = n ? t - STEPS[n - 1] : 1;
    let k = n / 5;
    if (n > 0 && since < 0.1) k -= (1 - since / 0.1) * 0.2;
    const [x0, y0] = START[i], [x1, y1] = FINAL[i];
    return [lerp(x0, x1, clamp(k)), lerp(y0, y1, clamp(k))];
  };
  const colored = (i, t) => stepN(t) > (i % 5) || t > STEPS[4] + 0.2;
  const cam = (t) => {
    const k1 = prog(t, T_WIDE - 0.6, T_WIDE + 0.4, E.ioC);
    const k = prog(t, 205.2, 206.2, E.ioC);
    const z = lerp(2, 1, k);
    const cx = lerp(lerp(320, 296, k1), 360, k), cy = lerp(84, 52, k);
    return { x: cx - 240 / z, y: cy - 135 / z, z };
  };
  const radius = (t) => 140 + 520 * prog(t, 202.83, T_ALL + 0.5, E.inQ);

  function trackBed(g, t) {
    // after the bloom the track becomes a flower bed, tile by tile from the field outward
    for (let x = F.fence; x < 900; x += 8) for (let y = 80; y < 124; y += 8) {
      const at = T_ALL - 0.3 + (x - F.fence) / 260 + hash2(x, y) * 0.15;
      if (t < at) continue;
      if (t - at < 0.05) { g.rect(x, y, 8, 8, P.white); continue; }
      g.rect(x, y, 8, 8, P.greenM);
      g.px(x + (x % 5), y + (y % 6), P.green);
      if (hash2(y, x) < 0.25) g.spr(uniqueFlower(700 + x * 3 + y, { small: true }), x + 4, y + 7);
    }
  }

  function draw(g, t) {
    const c = cam(t);
    g.push(-Math.round(c.x), -Math.round(c.y));
    sky(g, 'day');
    for (let i = 0; i < 5; i++) g.spr(cloudSprite(i + 60, 70, 24, [P.white, P.g1, P.g2]), 120 + i * 130 + ((t * 6) % 130), 6 + (i % 2) * 14);
    // rainbow
    if (t > T_RAIN) {
      const k = prog(t, T_RAIN, T_RAIN + 1.2, E.outQ);
      const rcx = 300, rcy = 120;
      g.ctx.save();
      g.ctx.beginPath(); g.ctx.rect(0, 0, g.W, Math.round(rcy - c.y)); g.ctx.clip();
      RAINBOW.slice(0, 7).forEach((col, i) => g.ring(rcx, rcy, (150 - i * 5) * k + 1, col, 5));
      g.ctx.restore();
    }
    city(g, 0.4);
    ground(g, t, { track: true, grassR: 220, racers: (gg) => trackBed(gg, t) });
    for (let x = F.edge; x < F.fence; x += 8) { g.rect(x, 100, 8, 90, P.greenM); g.px(x + (x % 5), 104 + (x % 7), P.green); g.px(x + 5, 140 + (x % 6), P.green); }
    for (let i = 0; i < 18; i++) g.spr(uniqueFlower(400 + i, { small: true }), F.edge + 10 + i * 13 + (i % 3) * 3, 112 + (i % 4) * 8);
    // the gardener's flower opens
    const open = prog(t, 194.9, T_BLOOM, E.outBack);
    heroFlower(g, F.spot, G - 1, { grow: 1, open, t, sway: Math.sin(t * 2) * 1.2, height: 44, size: 7 });
    if (t > T_BLOOM) { burst(g, F.spot, G - 52, t - T_BLOOM, { n: 14, r: 34, cols: RAINBOW }); ringWave(g, F.spot, G - 52, t - T_BLOOM, { speed: 140, n: 4, gap: 10, max: 400 }); }
    // the runners
    const order = [...Array(N).keys()].sort((a, b) => posOf(a, t)[1] - posOf(b, t)[1]);
    for (const i of order) {
      const [x, y] = posOf(i, t);
      const L = LOOKS[i], col = colored(i, t);
      const def = col ? CITIZEN : RACER, pal = col ? L.pal : CPAL;
      const style = { hair: col ? L.hair : null, acc: col ? L.acc : null };
      let p;
      if (t < STEPS[4] + 0.3) {
        const n = stepN(t), since = n ? t - STEPS[n - 1] : 1;
        p = { ...folkPoses.walk(n * 0.5 + Math.min(0.5, since * 3)), flip: true, expr: col ? 'happy' : 'tired', ...style };
      } else if (t < GETS[i]) {
        p = { ...folkPoses.stand(t, { view: 'front', expr: 'smile' }), ...style };
      } else if (t < PLANT[i] - 0.3) {
        // GET! holding the seed overhead
        p = { view: 'front', armL: [-3, -10], armR: [3, -10], armsFront: true, expr: 'happy', ...style };
      } else if (t < T_RAIN) {
        const planted = t > PLANT[i];
        p = { view: 'side', flip: i < 4 ? false : true, crouch: planted && t < PLANT[i] + 0.6 ? 6 : 0, armR: planted ? [4, 10] : [3, 4], expr: 'happy', ...style };
        if (t > T_ALL) p = { view: 'front', expr: 'grin', armL: [-3, -9], armR: [3, -9], armsFront: true, bob: m.sinceBeat(t) < 0.12 ? -3 : 0, ...style };
      } else {
        const jump = t > T_JUMP ? -Math.round(Math.sin(clamp((t - T_JUMP) / 0.45) * Math.PI) * 8) : 0;
        p = t > T_JUMP ? { view: 'front', expr: 'grin', armL: [-3, -10], armR: [3, -10], armsFront: true, bob: jump, ...style }
          : { view: 'side', flip: i < 4 ? false : true, expr: 'smile', armR: [3, 2], item: { s: ITEMS.canPour(), dx: -3, dy: 1 }, ...style };
      }
      drawCitizen(g, x, y, p, pal, def);
      if (col && t - (STEPS[Math.min(4, i % 5)] || 0) < 0.4 && t > STEPS[0]) burst(g, x, y - 20, t - STEPS[Math.min(4, i % 5)], { n: 6, r: 12, cols: [P.white, P.yellow, P.pink] });
      if (t > GETS[i] && t < PLANT[i] - 0.3) {
        g.spr(personalSeed(i * 3 + 2), x, y - 44 + (Math.floor(t * 4) % 2));
        sparkle(g, x + 6, y - 48, (t - GETS[i]) % 0.6, P.white, 3);
      }
      // their flowers
      if (t > PLANT[i]) {
        const fx = x + (i < 4 ? 9 : -9), fy = y + 1;
        if (t < T_ALL) {
          const gr = prog(t, PLANT[i], PLANT[i] + 0.3, E.outBack);
          g.vline(fx, fy - Math.round(5 * gr), fy - 1, P.green); g.px(fx - 1, fy - Math.round(4 * gr), P.green); g.px(fx + 1, fy - Math.round(5 * gr), P.greenM);
          lightPillar(g, fx, fy, t - PLANT[i], { h: 40, w: 3 });
        } else {
          const k = prog(t, T_ALL + i * 0.04, T_ALL + 0.4 + i * 0.04, E.outBack);
          const s = uniqueFlower(1000 + i * 17);
          g.ctx.drawImage(s.c, Math.round(fx - s.ax), Math.round(fy - s.ay + (1 - k) * 12));
        }
      }
      if (t > T_RAIN && t < T_JUMP && p.item) {
        const [ox, oy] = heldPoint(def, p, p.item, SPOUT[0], SPOUT[1]);
        pour(g, x + ox, y + oy, T_RAIN + 0.3, T_JUMP, t, { ground: y - 1, to: x + (i < 4 ? 9 : -9), col: P.cyan });
      }
    }
    // the gardener by his flower
    const gp = t < T_BLOOM ? { ...pose.front(t), expr: 'happy', armL: [-3, 2], armR: [3, 2] }
      : t < T_ALL ? { ...pose.front(t), expr: 'content' }
      : t < T_RAIN ? { view: 'front', expr: 'happy', armL: [-3, -9], armR: [3, -9], armsFront: true, bob: m.sinceBeat(t) < 0.12 ? -3 : 0 }
      : t < T_JUMP ? { ...pose.idle(t), flip: true, expr: 'smile', armR: [7, -2], item: { s: ITEMS.canPour(), dy: 1 } }
      : { view: 'front', expr: 'happy', armL: [-3, -10], armR: [3, -10], armsFront: true, bob: -Math.round(Math.sin(clamp((t - T_JUMP) / 0.45) * Math.PI) * 8) };
    const gxw = t > T_RAIN && t < T_JUMP ? F.spot + 17 : F.spot + 18;
    drawGardener(g, gxw, G, gp);
    if (t > T_RAIN && t < T_JUMP) {
      const [ox, oy] = heldPoint(GARDENER, gp, gp.item, SPOUT[0], SPOUT[1]);
      pour(g, gxw + ox, G + oy, T_RAIN + 0.3, T_JUMP, t, { ground: G - 1, to: F.spot, col: P.cyan });
    }
    g.pop();
    if (t > T_ALL) petals(g, t, { n: 50, drift: 10 });
  }

  return {
    id: 'bloom2', t0: T0, t1: T1,
    enter: { type: 'shatter' },
    zoom: (t) => cam(t).z,
    draw,
    post(g, t) {
      const c = cam(t);
      if (t > T_ALL + 0.5) return;
      grayPass(g, [{ x: F.edge - c.x, y: 0, w: F.fence - F.edge, h: g.H }, { x: F.spot - c.x, y: G - 30 - c.y, r: radius(t), sy: 0.8, soft: 16 }, ...[...Array(N).keys()].filter((i) => colored(i, t)).map((i) => { const [x, y] = posOf(i, t); return { x: x - c.x, y: y - 16 - c.y, r: 16, soft: 6 }; })], 10);
    },
    ui(g, t) {
      const c = cam(t);
      const n = PLANT.filter((p) => t >= p).length;
      if (n >= 2 && t < T_ALL + 1.2) combo(g, g.W - 16, 24, n + 1, t - PLANT[n - 1]);
      for (let i = 0; i < N; i++) {
        if (t > GETS[i] && t < GETS[i] + 0.9) {
          const [x, y] = posOf(i, t);
          const sx = (x - c.x) * c.z, sy = (y - 58 - c.y) * c.z;
          text(g, 'GET!', sx, sy - Math.round(Math.min(1, (t - GETS[i]) * 8) * 6), { font: 'en', align: 'center', color: P.yellow, outline: P.ink });
        }
      }
      if (t > T_BLOOM && t < T_BLOOM + 2) levelUp(g, (F.spot - c.x) * c.z, (G - 80 - c.y) * c.z, t - T_BLOOM, 'BLOOM!');
    },
  };
};
