// 231.96 - 277.08  Outro: the la-la-la over a sea of flowers at sunset.
//  232     down from the sky into the flower sea; everyone stands by their own flower
//  236.8   every "la" makes someone jump (they take turns, a looping cheer); petals fall; the camera
//          drifts along a parade of callbacks: the runners on a track that is now a flower bed, the
//          babies, the robot judge with a flower on its head, the BEAUTY 9000 booth gone to seed, the
//          shop that now sells flowers that are all different. Staff credits, game style, in the sky.
//  268.3   a whip pan back to the gardener: LEVEL CLEAR, and "YOU ARE THE ONLY ONE" typed out
//  274.39  the last hit: the frame freezes mid-jump, and it ends
import { P, ex, RAINBOW, HUES } from '../core/pal.js';
import { text, measure } from '../core/font.js';
import { E, prog, clamp, lerp, hash2 } from '../core/math.js';
import { drawGardener, pose } from '../art/gardener.js';
import { drawCitizen, folkPoses, freeLook, CITIZEN, RACER, babySprite } from '../art/folk.js';
import { uniqueFlower, cloudSprite, stork, bird, bunny, rose, pot } from '../art/props.js';
import { sparkle, burst, petals, glow } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { SKIES, city } from '../art/field.js';
import { typewriter, titleText } from '../art/ui.js';

export default (ctx) => {
  const { m, lyrics } = ctx;
  const T0 = 231.96, T_LA = 236.6, T_BACK = 268.33, T_TYPE = 269.3, T_HIT = 274.39, T_END = 277.08;
  const raw = (lyrics.outroSyllables || []).filter((t) => t > T_LA - 0.2);
  const LA = raw.filter((t, i) => i === 0 || t - raw[i - 1] > 0.12);
  const GY = 112; // ground row of the front line
  const PAN0 = 120, PAN1 = 1500;
  const cue = ctx.cue;
  cue(T0, 'whoosh', { v: 0.5, p: 1.2 });
  cue(T_BACK, 'whip');
  for (let i = 0; i < 20; i++) cue(T_TYPE + i / 7, 'blip', { v: 0.3, p: 1 + (i % 4) * 0.12 });
  cue(T_HIT, 'clear');

  // cast along the strip: [x, kind, data]
  const cast = [];
  cast.push({ x: 150, kind: 'gardener' });
  const friends = [[96, 12, 'bow'], [120, 9, 'crown'], [184, 21], [208, 33]];
  friends.forEach(([x, seed, acc], i) => { const L = freeLook(seed); cast.push({ x, kind: 'folk', L, acc: acc || L.acc, hair: L.hair, i }); });
  for (let i = 0; i < 6; i++) { const L = freeLook(i * 3 + 2); cast.push({ x: 330 + i * 34, kind: 'folk', L, acc: L.acc, hair: L.hair, i: i + 4 }); }
  for (let i = 0; i < 4; i++) cast.push({ x: 600 + i * 30, kind: 'baby', i: i + 10 });
  cast.push({ x: 920, kind: 'robot', i: 14 });
  cast.push({ x: 1140, kind: 'folk', L: freeLook(12), acc: 'bow', hair: 'bob', i: 15, girl: true });
  cast.push({ x: 1420, kind: 'folk', L: freeLook(44), acc: 'flower', hair: null, i: 16 });
  cast.find((c) => c.girl).L.pal = { ...cast.find((c) => c.girl).L.pal, J: P.pink, j: P.magenta, t: P.white, H: P.brown, s: P.peach, L: P.blueD, x: P.hot };

  // which syllables make character i jump: alternate groups, everyone on every fourth
  const jumpOf = (i, t) => {
    let best = 9;
    for (let k = 0; k < LA.length; k++) {
      const s = LA[k];
      if (s > t) break;
      if ((k + i) % 2 === 0 || k % 4 === 3) best = Math.min(best, t - s);
    }
    return best;
  };
  const hopY = (a) => (a < 0.32 ? -Math.round(Math.sin((a / 0.32) * Math.PI) * 7) : 0);

  const camX = (t) => {
    if (t < T_LA) return PAN0 - 120;
    if (t < T_BACK) return lerp(PAN0 - 120, PAN1 - 120, prog(t, T_LA, T_BACK - 0.2, E.sine));
    return lerp(PAN1 - 120, 30, prog(t, T_BACK, T_BACK + 0.7, E.ioQt));
  };
  const CAMY = 34;

  function shop(g, t, x) {
    const top = 52;
    g.rect(x, top, 150, GY - top, P.peach);
    g.rect(x, top, 2, GY - top, P.white);
    g.rect(x + 34, top + 4, 82, 16, P.ink);
    text(g, '花店', x + 44, top + 6, { color: P.pink, outline: P.hot });
    text(g, '每朵都不一样', x + 92, top + 9, { font: 'zh8', align: 'center', color: P.white });
    for (let i = 0; i < 10; i++) { g.rect(x + 6 + i * 14, top + 22, 14, 6, i % 2 ? P.white : P.green); g.disc(x + 13 + i * 14, top + 28, 6, i % 2 ? P.white : P.green); }
    g.rect(x + 10, top + 34, 96, GY - top - 34, P.g5);
    for (let c = 0; c < 6; c++) { g.spr(uniqueFlower(1200 + c, { small: true }), x + 18 + c * 15, top + 50); g.spr(pot(), x + 18 + c * 15, top + 52); }
    g.rect(x + 114, top + 36, 26, GY - top - 36, P.brown);
  }
  function booth(g, t, x) {
    const top = 58;
    g.rect(x - 1, top - 1, 54, GY - top + 1, P.ink);
    g.rect(x, top, 52, GY - top, P.g1);
    g.rect(x, top, 2, GY - top, P.white);
    g.rect(x + 2, top - 18, 48, 17, P.ink); g.rect(x + 3, top - 17, 46, 15, P.purple);
    text(g, 'BEAUTY', x + 26, top - 16, { font: 'zh8', align: 'center', color: P.pink });
    text(g, '9000', x + 26, top - 9, { font: 'zh8', align: 'center', color: P.yellow });
    g.rect(x + 6, top + 6, 22, GY - top - 6, P.magenta);
    g.rect(x + 32, top + 8, 16, 12, P.ink);
    // OUT OF ORDER plate, slightly crooked
    g.rect(x + 8, top + 18, 38, 13, P.ink); g.rect(x + 9, top + 19, 36, 11, P.white);
    text(g, 'OUT OF', x + 27, top + 19, { font: 'zh8', align: 'center', color: P.red });
    text(g, 'ORDER', x + 27, top + 24, { font: 'zh8', align: 'center', color: P.red });
    // vines and flowers over everything
    for (let i = 0; i < 26; i++) {
      const vx = x + 2 + hash2(i, 3) * 48, vy = top - 14 + hash2(i, 4) * (GY - top + 10);
      g.px(vx, vy, P.green); g.px(vx + 1, vy + 1, P.greenM); g.px(vx - 1, vy + 2, P.green);
    }
    for (let i = 0; i < 6; i++) g.spr(uniqueFlower(1300 + i, { small: true }), x + 4 + i * 9, top - 10 + (i % 2) * 5);
  }
  function robot(g, t, x, jump) {
    const y = GY + jump;
    g.rect(x - 9, y - 26, 18, 14, P.ink); g.rect(x - 8, y - 25, 16, 12, P.g3);
    g.rect(x - 6, y - 12, 4, 12, P.ink); g.rect(x + 2, y - 12, 4, 12, P.ink);
    const hy = y - 27;
    g.rect(x - 11, hy - 16, 22, 16, P.ink); g.rect(x - 10, hy - 15, 20, 14, P.g2);
    g.rect(x - 8, hy - 12, 16, 9, P.ink);
    g.px(x - 4, hy - 10, P.cyan); g.px(x + 3, hy - 10, P.cyan);
    g.px(x - 5, hy - 7, P.cyan); g.px(x + 4, hy - 7, P.cyan); g.hline(x - 4, x + 3, hy - 6, P.cyan);
    heroFlower(g, x + 2, hy - 16, { grow: 0.5, open: 1, t: t + 3, height: 12, size: 3 });
    // a heart card
    g.line(x + 9, y - 22, x + 15, y - 34, P.ink, 3);
    g.rect(x + 9, y - 46, 14, 12, P.ink); g.rect(x + 10, y - 45, 12, 10, P.white);
    g.disc(x + 14, y - 42, 1.5, P.red); g.disc(x + 18, y - 42, 1.5, P.red); g.poly([[x + 12, y - 41], [x + 21, y - 41], [x + 16.5, y - 37]], P.red);
  }

  function draw(g, t) {
    const tt = t >= T_HIT ? T_HIT : t; // freeze frame
    const cx = Math.round(camX(tt)), cy = CAMY;
    const W = g.W;
    // sky (parallax-free) and sun
    g.vgrad(0, -cy - 80, W, SKIES.dusk, 2);
    g.disc(W * 0.72, 46, 16, P.gold); g.disc(W * 0.72, 46, 13, P.yellow);
    for (let i = 0; i < 6; i++) g.spr(cloudSprite(i + 80, 60 + (i % 3) * 20, 20, [P.peach, P.pink, P.magenta]), ((i * 97 - cx * 0.15 + tt * 3) % 340 + 340) % 340 - 50, 14 + (i % 3) * 10);
    // the far city, in colour now
    g.push(-Math.round(cx * 0.35), -cy + 30);
    city(g, 0.6);
    g.pop();
    g.push(-cx, -cy);
    // hills of flowers behind (small, many)
    g.rect(cx - 10, 70, 300, 120, P.greenD);
    for (let i = Math.floor((cx - 20) / 9); i < (cx + 260) / 9; i++) {
      const x = i * 9 + Math.floor(hash2(i, 3) * 5), y = 74 + Math.floor(hash2(i, 4) * 10);
      g.px(x, y, HUES[i % HUES.length]); g.px(x + 1, y, HUES[(i + 3) % HUES.length]); g.px(x, y + 1, P.greenM);
    }
    g.rect(cx - 10, 88, 300, 100, P.greenM);
    // set pieces along the way
    if (cx < 520 && cx + 260 > 300) {
      // the old track, now a flower bed, finish gate with flowers
      g.rect(300, 92, 240, 14, P.green);
      g.rect(520, 66, 4, 36, P.white); g.rect(300, 66, 4, 36, P.white); g.rect(300, 60, 224, 8, P.hot);
      text(g, 'NO RANK', 412, 61, { font: 'zh8', align: 'center', color: P.white });
      for (let i = 0; i < 12; i++) g.spr(uniqueFlower(1400 + i, { small: true }), 306 + i * 19, 68 + (i % 2) * 3);
    }
    if (cx < 1020 && cx + 260 > 870) {
      g.rect(880, 96, 90, 16, P.brown); g.rect(880, 96, 90, 3, P.clay);
      g.vline(966, 72, 96, P.brown); g.rect(950, 64, 34, 12, P.ink); g.rect(951, 65, 32, 10, P.cream);
      text(g, '评审会', 967, 64, { align: 'center', font: 'zh8', color: P.brownD });
    }
    if (cx < 1220 && cx + 260 > 1060) booth(g, tt, 1070);
    if (cx < 1600 && cx + 260 > 1290) shop(g, tt, 1300);
    // stork over the babies
    if (cx < 800 && cx + 260 > 520) { const sx = 560 + ((tt * 30) % 260); g.spr(stork(Math.floor(tt * 6) % 2), sx, 34 + Math.sin(tt * 3) * 2); }
    // the cast, each by their own flower
    for (const c of cast) {
      if (c.x < cx - 30 || c.x > cx + W + 30) continue;
      const a = jumpOf(c.i ?? 0, tt);
      const jy = tt > T_LA ? hopY(a) : 0;
      const up = a < 0.32;
      if (c.kind === 'gardener') {
        heroFlower(g, c.x - 18, GY, { grow: 1, open: 1, t: tt, height: 40, size: 7, sway: Math.sin(tt * 2) });
        drawGardener(g, c.x, GY + jy, up ? { view: 'front', expr: 'happy', armL: [-3, -9], armR: [3, -9], armsFront: true, scarf: tt * 2 } : { ...pose.front(tt), expr: 'content' });
      } else if (c.kind === 'folk') {
        g.spr(uniqueFlower(1600 + (c.i ?? 0) * 13), c.x + 13, GY);
        drawCitizen(g, c.x, GY + jy, up ? { view: 'front', expr: 'grin', armL: [-3, -10], armR: [3, -10], armsFront: true, acc: c.acc, hair: c.hair } : folkPoses.stand(tt, { view: 'front', expr: 'happy', acc: c.acc, hair: c.hair, seed: c.i }), c.L.pal, CITIZEN);
      } else if (c.kind === 'baby') {
        g.spr(uniqueFlower(1700 + c.i, { small: true }), c.x + 8, GY);
        g.spr(babySprite('sit'), c.x, GY + Math.round(jy / 2));
        if (up) sparkle(g, c.x, GY - 16, a, P.white, 2);
      } else if (c.kind === 'robot') {
        robot(g, tt, c.x, jy);
      }
    }
    // the flower sea in front: three dense rows, then big flowers sweeping past
    for (let row = 0; row < 3; row++) {
      const step = 9 - row * 2;
      for (let i = Math.floor((cx - 30) / step); i < (cx + 280) / step; i++) {
        const fx = i * step + Math.floor(hash2(i, row) * step), fy = 124 + row * 13 + Math.floor(hash2(row, i) * 5);
        g.spr(uniqueFlower(3000 + row * 997 + i, { small: true }), fx, fy);
      }
    }
    for (let i = Math.floor((cx - 30) / 30); i < (cx + 280) / 30; i++) {
      const s = uniqueFlower(2000 + i);
      g.spr(s, i * 30 + Math.floor(hash2(i, 9) * 12), 168 + Math.floor(hash2(i, 8) * 6));
    }
    // a bunny and a bird with the gardener's group
    if (cx < 260) {
      const sb = m.sinceBeat(tt);
      g.spr(bunny(sb < 0.15 ? 1 : 0), 64 + Math.sin(tt * 0.6) * 8, GY + 2 - (sb < 0.15 ? 3 : 0));
      g.spr(bird(Math.floor(tt * 10) % 2), 150 + Math.cos(tt * 2) * 30, 52 + Math.sin(tt * 3) * 6);
    }
    g.pop();
    petals(g, tt, { n: 60, drift: 12 });
  }

  // staff roll blocks
  const CREDITS = [
    ['STAFF', ''], ['原曲', '槇原敬之'], ['中文词', '林明阳'],
    ['主演', '园丁'], ['共演', '灰色市民  ×∞'], ['画面 · 音效', '全部由代码绘制'], ['花', '没有两朵一样'],
  ];
  // the blocks share the la-la section evenly
  const SLOT = (T_BACK - 0.3 - T_LA) / CREDITS.length;
  return {
    id: 'finale', t0: T0, t1: T_END + 1,
    enter: { type: 'mosaic', dur: 0.5 },
    zoom: () => 2,
    draw,
    ui(g, t) {
      const tt = Math.min(t, T_HIT);
      // credits in the sky
      if (tt > T_LA && tt < T_BACK - 0.3) {
        const k = Math.floor((tt - T_LA) / SLOT);
        const c = CREDITS[Math.min(k, CREDITS.length - 1)];
        const a = tt - T_LA - k * SLOT;
        const vis = a > 0.15 && a < SLOT - 0.25;
        if (vis && k < CREDITS.length) {
          const n = Math.floor((a - 0.15) * 12);
          text(g, [...c[0]].slice(0, n).join(''), g.W / 2, 214, { align: 'center', color: P.yellow, outline: P.ink, shadow: P.ink, font: /[A-Z]/.test(c[0]) ? 'en' : 'zh' });
          if (c[1]) text(g, [...c[1]].slice(0, Math.max(0, n - 2)).join(''), g.W / 2, 232, { align: 'center', color: P.white, outline: P.ink, shadow: P.ink, scale: 2 });
        }
      }
      // level clear and the line
      if (t > T_BACK + 0.6) {
        const a = t - T_BACK - 0.6;
        if (a > 0) titleText(g, 'LEVEL CLEAR!', g.W / 2, 20 - Math.round((1 - E.outBack(Math.min(1, a / 0.35))) * 40), { font: 'en', scale: 3, top: P.yellow, bot: P.orange, split: 4 });
        typewriter(g, 'YOU ARE THE ONLY ONE', g.W / 2, 58, T_TYPE, t, { cps: 7, scale: 2, align: 'center', color: P.white, caret: t < T_HIT });
      }
      // the end
      if (t >= T_HIT) {
        const a = t - T_HIT;
        if (a < 0.12) g.drect(0, 0, g.W, g.H, P.white, 1 - a / 0.12);
        if (a > 0.5) text(g, 'THE END', g.W / 2, 84, { font: 'en', scale: 2, align: 'center', color: P.white, outline: P.ink });
        if (a > 1.4) g.drect(0, 0, g.W, g.H, P.ink, prog(t, T_HIT + 1.4, T_END - 0.05, E.inQ));
      }
    },
    lyric(t) { return t > T_BACK ? { hide: true } : null; },
  };
};
