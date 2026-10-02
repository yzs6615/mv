// 217.3 - 227.0  Coda, the 2D middle (plays over the 3D world map):
//  L37 "你和我 我和他 是特别的花"   a party screen: three member cards slide up on 你 / 我 / 他. No levels,
//                                no ranks; each card has its own flower, and on "是特别的花" they bloom
//  L38 "太阳下 风雨里 天空属于自己"  five friends in a row: sunshine, then wind and rain under leaf umbrellas,
//                                then the sky splits into five strips, a sky of their own over each one
import { P, ex, RAINBOW, HUES } from '../core/pal.js';
import { text, measure } from '../core/font.js';
import { E, prog, clamp, lerp, hash2 } from '../core/math.js';
import { figure as rigFigure } from '../art/rig.js';
import { gardenerSprite, pose, GARDENER } from '../art/gardener.js';
import { citizenSprite, folkPoses, freeLook, CITIZEN, babySprite } from '../art/folk.js';
import { uniqueFlower, cloudSprite, bird } from '../art/props.js';
import { sparkle, burst, rain, wind, petals } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { box } from '../art/ui.js';
import { SKIES } from '../art/field.js';

export default (ctx) => {
  const { m } = ctx;
  const T0 = 217.3, T_CARDS = [217.38, 217.91, 218.99], T_SPECIAL = [219.81, 220.23, 220.99];
  const T_SKY = 222.4, T_SUN = 222.47, T_RAIN = 223.47, T_OWN = 224.7, T1 = 227.0;
  const YOU = freeLook(12), HIM = freeLook(9);
  YOU.pal = { ...YOU.pal, J: P.pink, j: P.magenta, t: P.white, H: P.brown, h: P.brownD, s: P.peach, L: P.blueD, x: P.hot };
  HIM.acc = 'crown';
  T_CARDS.forEach((t, i) => ctx.cue(t, 'card', { p: 1 + i * 0.12 }));
  T_SPECIAL.forEach((t, i) => ctx.cue(t, 'sparkle', { p: 1 + i * 0.2 }));
  ctx.cue(T_RAIN, 'rainloop', { dur: 1.2, v: 0.5 });
  ctx.cue(T_OWN, 'shine');

  const big = (g, s, x, y, k = 3) => g.ctx.drawImage(s.c, Math.round(x - s.ax * k) + g.ox, Math.round(y - s.ay * k) + g.oy, s.w * k, s.h * k);

  function cards(g, t) {
    const W = g.W, H = g.H;
    g.clear(P.g5);
    for (let i = -10; i < 40; i++) { const x = i * 24 + ((t * 20) % 24); g.poly([[x, 0], [x + 10, 0], [x - 60, H], [x - 70, H]], P.ink); }
    text(g, 'MEMBER', W / 2, 14, { font: 'en', scale: 2, align: 'center', color: P.white, outline: P.ink });
    const who = [
      { name: '你', s: citizenSprite({ ...folkPoses.stand(t, { view: 'front', expr: 'happy', acc: 'bow', hair: 'bob' }) }, YOU.pal, CITIZEN), flower: 31 },
      { name: '我', s: gardenerSprite({ ...pose.front(t), expr: 'happy' }), flower: -1 },
      { name: '他', s: citizenSprite({ ...folkPoses.stand(t, { view: 'front', expr: 'grin', acc: 'crown', hair: HIM.hair }) }, HIM.pal, CITIZEN), flower: 57 },
    ];
    who.forEach((w, i) => {
      if (t < T_CARDS[i]) return;
      const a = t - T_CARDS[i];
      const cw = 132, ch = 196;
      const x = 24 + i * 150, y = 40 + Math.round((1 - E.outBack(Math.min(1, a / 0.35))) * 220);
      const special = t > T_SPECIAL[i];
      if (special) {
        const c = RAINBOW[Math.floor(t * 12 + i) % RAINBOW.length];
        g.rect(x - 3, y - 3, cw + 6, ch + 6, c);
      }
      box(g, x, y, cw, ch);
      // portrait
      g.rect(x + 10, y + 10, cw - 20, 100, i === 1 ? P.greenD : i === 0 ? P.purple : P.blueD);
      for (let k = 0; k < 6; k++) g.px(x + 16 + k * 18, y + 18 + (k % 3) * 9, P.white);
      big(g, w.s, x + cw / 2, y + 104, 3);
      text(g, w.name, x + cw / 2, y + 116, { align: 'center', scale: 2, color: P.white, outline: P.ink });
      // stats: no rank, only one
      text(g, 'RANK', x + 14, y + 148, { font: 'en', color: P.g2 });
      g.hline(x + 50, x + 76, y + 151, P.g2);
      text(g, 'ONLY ONE', x + 14, y + 166, { font: 'en', color: special ? P.yellow : P.white });
      // their flower
      const fk = special ? E.outBack(Math.min(1, (t - T_SPECIAL[i]) / 0.3)) : 0.6;
      if (w.flower < 0) heroFlower(g, x + cw - 22, y + 176, { grow: 1, open: special ? 1 : 0, t, height: 30, size: 5 });
      else { const f = uniqueFlower(w.flower); big(g, f, x + cw - 22, y + 182, special ? 2 : 1); }
      if (special) burst(g, x + cw - 22, y + 150, t - T_SPECIAL[i], { n: 8, r: 18, cols: [P.white, P.yellow, P.pink] });
      void fk;
    });
  }

  // five friends, each with their own sky
  const FRIENDS = [
    { s: (t, e) => gardenerSprite({ ...pose.front(t), expr: e }), sky: 'clear', wx: 'sun' },
    { s: (t, e) => citizenSprite(folkPoses.stand(t, { view: 'front', expr: e, acc: 'bow', hair: 'bob' }), YOU.pal, CITIZEN), sky: 'night', wx: 'stars' },
    { s: (t, e) => citizenSprite(folkPoses.stand(t, { view: 'front', expr: e, acc: 'crown', hair: HIM.hair }), HIM.pal, CITIZEN), sky: 'day', wx: 'rainbow' },
    { s: (t, e) => { const L = freeLook(21); return citizenSprite(folkPoses.stand(t, { view: 'front', expr: e, acc: L.acc, hair: L.hair }), L.pal, CITIZEN); }, sky: 'snow', wx: 'snow' },
    { s: (t, e) => { const L = freeLook(33); return citizenSprite(folkPoses.stand(t, { view: 'front', expr: e, acc: L.acc, hair: L.hair }), L.pal, CITIZEN); }, sky: 'dusk', wx: 'sunset' },
  ];
  function skies(g, t) {
    const W = g.W, H = g.H;
    const own = t > T_OWN;
    const rainy = t > T_RAIN && !own;
    const split = own ? prog(t, T_OWN, T_OWN + 0.6, E.outQ) : 0;
    // shared sky (sunny or stormy)
    g.vgrad(0, -150, W, rainy ? SKIES.storm : SKIES.clear, 2);
    if (!rainy && !own) { g.disc(200, 22, 12, P.gold); g.disc(200, 22, 10, P.yellow); }
    // personal sky strips rise from the bottom
    if (own) {
      FRIENDS.forEach((f, i) => {
        const sx = i * 48, top = Math.round(lerp(H, 0, split));
        const c = g.ctx;
        c.save(); c.beginPath(); c.rect(sx, top, 48, H - top); c.clip();
        g.vgrad(sx, -150, 48, SKIES[f.sky], 2);
        const cx = sx + 24;
        if (f.wx === 'sun') { g.disc(cx, 22, 9, P.gold); g.disc(cx, 22, 7, P.yellow); }
        if (f.wx === 'stars') { for (let k = 0; k < 14; k++) g.px(sx + hash2(k, 1) * 48, hash2(k, 2) * 60, Math.floor(t * 3 + k) % 3 ? P.white : P.g1); g.disc(cx + 8, 16, 5, P.cream); g.disc(cx + 11, 14, 4, SKIES.night[0][1]); }
        if (f.wx === 'rainbow') RAINBOW.slice(0, 6).forEach((col, k) => g.ring(cx, 100, 30 - k * 2, col, 2));
        if (f.wx === 'snow') for (let k = 0; k < 18; k++) { const yy = (t * 14 + hash2(k, 4) * 90) % 90; g.px(sx + hash2(k, 3) * 48, yy, P.white); }
        if (f.wx === 'sunset') { g.disc(cx, 52, 10, P.orange); g.disc(cx, 52, 8, P.gold); }
        c.restore();
      });
      for (let i = 1; i < 5; i++) g.vline(i * 48, Math.round(lerp(H, 0, split)), H, P.white);
    }
    // ground
    g.rect(0, 100, W, 35, P.greenM);
    for (let x = 0; x < W; x += 6) g.px(x + (x % 4), 102 + (x % 9), P.green);
    // the friends
    FRIENDS.forEach((f, i) => {
      const x = 24 + i * 48;
      const e = rainy ? 'determined' : 'happy';
      const s = f.s(t, e);
      const hop = own && m.sinceBeat(t) < 0.12 && (Math.floor(m.beatF(t)) + i) % 2 === 0 ? -2 : 0;
      g.spr(s, x, 112 + hop);
      g.spr(uniqueFlower(800 + i * 7), x + 14, 118);
      if (rainy) {
        // leaf umbrella
        g.poly([[x - 12, 77], [x, 70], [x + 12, 77], [x, 76]], P.green);
        g.hline(x - 12, x + 12, 77, P.greenD);
        g.vline(x, 77, 92, P.greenD);
      }
    });
    if (rainy) { rain(g, t, { n: 140, speed: 260, wind: -60, len: 5, col: P.g1, col2: P.white }); wind(g, t, { n: 6, dir: -1, col: P.white }); }
  }

  return {
    id: 'party', t0: T0, t1: T1,
    enter: { type: 'mosaic', dur: 0.4 },
    zoom: (t) => (t < T_SKY ? 1 : 2),
    draw(g, t) {
      if (t < T_SKY) cards(g, t);
      else skies(g, t);
    },
    over(g, t) { if (t > T1 - 0.3) g.drect(0, 0, g.W, g.H, P.white, prog(t, T1 - 0.3, T1, E.inQ)); },
  };
};
