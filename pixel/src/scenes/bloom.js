// 151.83 - 171.36  Verse 2, second half: the green spreads.
//  L23 "要每天露出笑容 笑得开怀"  a dance on the new grass with a bunny, a bird and a snail, under a sun
//                               with its own goofy grin (nothing like the standard smile)
//  L24 "把心里的鲜花 变成花海"     top-down, RPG overworld: the meadow grows out from the bud into a heart
//                               and fills with flowers, no two alike
//  L25 "和希望一起走 就会有将来"   he walks a path through it with a fairy light; every footstep sprouts
//  L26 "在向阳的地方 种下精彩"     golden hour: he scatters seeds toward the sun, the bud leans to the
//                               light, and over on the gray track two runners stop and look: "!"
import { P, ex } from '../core/pal.js';
import { text } from '../core/font.js';
import { grayPass } from '../core/post.js';
import { E, prog, clamp, lerp, hash2, hash } from '../core/math.js';
import { drawGardener, pose, seedSprite } from '../art/gardener.js';
import { drawCitizen, folkPoses, RACER, CPAL } from '../art/folk.js';
import { bubble, uniqueFlower, cloudSprite, bunny, bird, snail, fairy } from '../art/props.js';
import { puff, sparkle, burst, glow, petals } from '../art/fx.js';
import { heroFlower } from '../art/hero.js';
import { F, sky, city, ground } from '../art/field.js';

export default (ctx) => {
  const { m } = ctx;
  const T0 = 151.83, T_MAP = 156.82, T_WALK = 161.44, T_SUN = 166.44, T_LOOK = 168.4, T1 = 171.45;
  const SX = F.spot, G = F.ground;
  for (let i = 0; i < 7; i++) ctx.cue(m.beatTime(Math.ceil(m.beatF(T0)) + i), 'hop', { v: 0.3, p: 1 + (i % 2) * 0.2 });
  ctx.cue(T_MAP, 'mapopen');
  ctx.cue(T_LOOK, 'notice');
  ctx.cue(T_LOOK + 0.5, 'notice', { p: 1.2 });

  // ---------- L23: dance (side view, zoom 2) ----------
  function dance(g, t) {
    const c = { x: SX - 120, y: 12 };
    g.push(-c.x, -c.y);
    sky(g, 'clear');
    // goofy sun with sunglasses and a tongue
    const sx = SX - 60, sy = 24 + Math.round(Math.sin(t * 3) * 1);
    g.disc(sx, sy, 15, P.orange); g.disc(sx, sy, 13, P.gold); g.disc(sx - 2, sy - 2, 9, P.yellow);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 0.8; g.line(sx + Math.cos(a) * 17, sy + Math.sin(a) * 17, sx + Math.cos(a) * 21, sy + Math.sin(a) * 21, P.gold, 2); }
    g.rect(sx - 10, sy - 5, 9, 5, P.ink); g.rect(sx + 1, sy - 5, 9, 5, P.ink); g.rect(sx - 1, sy - 4, 2, 1, P.ink); g.px(sx - 8, sy - 4, P.white); g.px(sx + 3, sy - 4, P.white);
    g.rect(sx - 6, sy + 4, 13, 3, P.ink); g.rect(sx - 5, sy + 5, 11, 3, P.redD); g.rect(sx + 1, sy + 7, 4, 3, P.pink);
    city(g, 0);
    ground(g, t, { grassR: 200 });
    for (let x = F.edge; x < F.fence; x += 8) { g.rect(x, 100, 8, 60, P.greenM); g.px(x + (x % 5), 104 + (x % 7), P.green); g.px(x + 3, 112 + (x % 9), P.green); g.px(x + 5, 140 + (x % 6), P.green); }
    for (let i = 0; i < 16; i++) g.spr(uniqueFlower(400 + i, { small: true }), F.edge + 14 + i * 14 + (i % 3) * 3, 104 + (i % 4) * 7);
    heroFlower(g, SX, G - 1, { grow: 1, open: 0, t, sway: Math.sin(t * 4) * 1.2, height: 40 });
    // dancer
    const b = m.beatF(t), bi = Math.floor(b), sb = m.sinceBeat(t);
    const big = [153.66, 154.36].some((x) => t > x && t < x + 0.3);
    const hop = sb < 0.12 ? (big ? -5 : -2) : 0;
    const side = bi % 2;
    const x = SX + 22;
    const views = ['front', 'side', 'front', 'side'];
    drawGardener(g, x, G + hop, { view: views[bi % 4] === 'side' ? 'side' : 'front', flip: bi % 4 === 3, expr: big ? 'happy' : 'content', armL: side ? [-3, -7] : [-3, 3], armR: side ? [3, 3] : [3, -7], armsFront: true, scarf: t * 2 });
    // bunny hops in time, bird circles then lands on the hat, snail creeps
    const bx = SX - 24 + Math.sin(t * 0.8) * 6;
    g.spr(bunny(sb < 0.15 ? 1 : 0), bx, G + 2 - (sb < 0.15 ? 3 : 0));
    const landed = t > 155.19;
    const brx = landed ? x : x + Math.cos(t * 3) * 20, bry = landed ? G - 30 + hop : G - 40 + Math.sin(t * 5) * 5;
    g.spr(bird(Math.floor(t * 10) % 2), brx, bry);
    g.spr(snail(Math.floor(t * 2) % 2), SX - 50 + (t - T0) * 2, G + 6);
    if (big) burst(g, x, G - 32, t - (t > 154.36 ? 154.36 : 153.66), { n: 6, r: 14, cols: [P.yellow, P.pink] });
    g.pop();
  }

  // ---------- L24-L25: overworld (top-down, zoom 2) ----------
  const TS = 8;
  const MW = 64, MH = 40; // tiles
  const heart = (u, v) => { const x = u, y = -v; return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0; };
  // heart scale over time
  const heartS = (t) => 13 * prog(t, T_MAP, T_MAP + 3.6, E.outQ) + (t > T_WALK ? 2 * prog(t, T_WALK, T1, E.lin) : 0);
  const PATH = (k) => [MW * TS / 2 + Math.sin(k * 3.2) * 34, MH * TS / 2 + 120 - k * 300]; // k 0..1 along the path, upward
  function overworld(g, t) {
    const walkK = prog(t, T_WALK, T_SUN, E.lin);
    const [px, py] = PATH(walkK);
    const camX = MW * TS / 2 - 120, camY = clamp(py - 80, -40, MH * TS - 135) * (t > T_WALK ? 1 : 0) + (t > T_WALK ? 0 : MH * TS / 2 - 72);
    const cy = t > T_WALK ? lerp(MH * TS / 2 - 72, clamp(py - 80, -60, 400), prog(t, T_WALK, T_WALK + 0.8, E.ioQ)) : MH * TS / 2 - 72;
    g.push(-camX, -Math.round(cy));
    const cx0 = MW * TS / 2, cy0 = MH * TS / 2 + 10;
    const s = heartS(t);
    for (let j = -8; j < MH + 8; j++) for (let i = 0; i < MW; i++) {
      const x = i * TS, y = j * TS;
      const u = (x + 4 - cx0) / (s * TS), v = (y + 4 - cy0) / (s * TS);
      const inside = s > 0.3 && heart(u * 1.1, v * 1.1 - 0.15);
      if (inside) {
        g.rect(x, y, TS, TS, P.greenM);
        g.px(x + (i * 3 % 7), y + (j * 5 % 7), P.green);
        g.px(x + ((i + 3) * 5 % 7), y + ((j + 2) * 3 % 7), P.green);
      } else {
        g.rect(x, y, TS, TS, P.g3);
        g.rect(x, y, TS, 1, P.g4); g.rect(x, y, 1, TS, P.g4);
        if (hash2(i, j) < 0.25) g.px(x + 3, y + 4, P.g2);
        if (hash2(j, i) < 0.08) g.line(x + 1, y + 2, x + 5, y + 6, P.g4);
      }
    }
    // the path
    for (let k = 0; k <= 1; k += 0.004) {
      const [x, y] = PATH(k);
      g.rect(x - 4, y - 2, 9, 5, P.peach);
    }
    // flowers inside the heart, each different, popping in as it grows
    for (let n = 0; n < 160; n++) {
      const u = (hash2(n, 1) - 0.5) * 2.4, v = (hash2(n, 2) - 0.5) * 2.4;
      if (!heart(u * 1.1, v * 1.1 - 0.15)) continue;
      const need = Math.hypot(u, v) * 13;
      if (s < need) continue;
      const age = (s - need) / 4;
      const fx = cx0 + u * 13 * TS, fy = cy0 + v * 13 * TS;
      const pop = Math.min(1, age * 3);
      g.spr(uniqueFlower(500 + n, { small: true }), fx, fy + 4 - Math.round(pop * 4));
    }
    heroFlower(g, cx0, cy0 + 6, { grow: 1, open: 0, t, sway: Math.sin(t * 2), height: 40 });
    // footstep flowers along the walk
    if (t > T_WALK) {
      for (let k = 0; k < walkK; k += 0.05) {
        const [fx, fy] = PATH(k);
        const age = (walkK - k) * (T_SUN - T_WALK);
        const pop = Math.min(1, age * 4);
        g.spr(uniqueFlower(900 + Math.round(k * 100), { small: true }), fx + (Math.round(k * 20) % 2 ? 5 : -5), fy + 3 - Math.round(pop * 3));
      }
      const walking = t < T_SUN;
      drawGardener(g, px, py + 4, walking ? { ...pose.walk(t * 2.4), view: 'back' } : pose.front(t));
      // the fairy light circling him
      const a = t * 3;
      const fx = px + Math.cos(a) * 14, fy = py - 22 + Math.sin(a) * 6;
      glow(g, fx, fy, 9, ex(P.yellow), 0.4);
      g.spr(fairy(Math.floor(t * 10) % 2), fx, fy);
      for (let k = 1; k < 5; k++) { const b2 = a - k * 0.25; g.px(px + Math.cos(b2) * 14, py - 22 + Math.sin(b2) * 6, k % 2 ? P.white : P.yellow); }
    } else {
      drawGardener(g, cx0 + 16, cy0 + 8, pose.front(t, { expr: 'happy' }));
    }
    g.pop();
  }

  // ---------- L26: golden hour, scattering seeds; the runners notice ----------
  function golden(g, t) {
    const c = { x: SX - 120, y: 12 };
    g.push(-c.x, -c.y);
    sky(g, 'dusk');
    g.disc(SX + 70, 60, 16, P.gold); g.disc(SX + 70, 60, 12, P.yellow);
    city(g, 0.3);
    // racers on the track; two stop and look
    ground(g, t, {
      grassR: 200,
      racers: (gg) => {
        for (let i = 0; i < 6; i++) {
          const stopper = i === 1 || i === 4;
          let x = F.fence + 30 + ((i * 61 + (t - T0) * 70) % 380);
          if (stopper) x = lerp(F.fence - 60, i === 1 ? 386 : 408, prog(t, T_SUN, T_LOOK, E.outQ));
          const look = stopper && t > T_LOOK + (i === 4 ? 0.5 : 0);
          drawCitizen(gg, x, 92 + (i % 3) * 9, look ? folkPoses.stand(t, { flip: true, expr: 'surprised' }) : folkPoses.run(t * 2.6 + i * 0.3, { expr: 'tired' }), CPAL, RACER);
          if (look) gg.spr(bubble('ex'), x, 92 + (i % 3) * 9 - 36);
        }
      },
    });
    for (let x = F.edge; x < F.fence; x += 8) { g.rect(x, 100, 8, 60, P.greenM); g.px(x + (x % 5), 104 + (x % 7), P.green); g.px(x + 5, 140 + (x % 6), P.green); }
    for (let i = 0; i < 16; i++) g.spr(uniqueFlower(400 + i, { small: true }), F.edge + 14 + i * 14 + (i % 3) * 3, 104 + (i % 4) * 7);
    // seedlings from the scattered seeds
    const T_TOSS = 167.06;
    for (let i = 0; i < 6; i++) {
      const land = T_TOSS + 0.35 + i * 0.12;
      const tx = SX - 70 + i * 22, ty = G + 4 + (i % 2) * 6;
      if (t < T_TOSS + i * 0.12) continue;
      if (t < land) {
        const k = (t - T_TOSS - i * 0.12) / 0.35;
        g.spr(seedSprite(t * 10 + i), lerp(SX + 16, tx, k), lerp(G - 24, ty, k) - Math.sin(k * Math.PI) * 18);
      } else {
        const grow = prog(t, land + 0.6, land + 1.4, E.outBack) * 0.5;
        if (grow <= 0) g.rect(tx - 1, ty - 1, 3, 1, P.brownD);
        else heroFlower(g, tx, ty, { grow, open: 0, t: t + i, height: 18 });
      }
    }
    heroFlower(g, SX, G - 1, { grow: 1, open: 0, t, sway: 2 + Math.sin(t * 2), height: 40 });
    const tossing = t > T_TOSS - 0.2 && t < T_TOSS + 0.4;
    drawGardener(g, SX + 16, G, tossing ? { ...pose.idle(t), flip: true, expr: 'happy', armR: [6, -4] } : { ...pose.idle(t), flip: t < T_LOOK + 1.2, expr: t > T_LOOK + 1.2 ? 'smile' : 'content' });
    g.pop();
  }

  const phase = (t) => (t < T_MAP ? 'dance' : t < T_SUN ? 'map' : 'golden');
  return {
    id: 'bloom', t0: T0, t1: T1,
    zoom: () => 2,
    draw(g, t) {
      const ph = phase(t);
      if (ph === 'dance') dance(g, t);
      else if (ph === 'map') overworld(g, t);
      else golden(g, t);
      if (ph === 'map' && t < T_MAP + 0.3) g.drect(0, 0, g.W, g.H, P.white, 1 - (t - T_MAP) / 0.3);
    },
    post(g, t) {
      const ph = phase(t);
      if (ph === 'map') return;
      // the field and sky above it are coloured; the city and the track stay gray
      const c = { x: SX - 120, y: 12 };
      grayPass(g, [{ x: F.edge - c.x, y: 0, w: F.fence - F.edge - 2, h: g.H }, { x: SX - c.x, y: 20 - c.y, r: 130, sy: 0.8, soft: 16 }], 10);
    },
    ui(g, t) {
      if (phase(t) === 'map') {
        // a little overworld frame
        g.rect(8, 8, 120, 20, P.ink); g.frame(8, 8, 120, 20, P.white);
        text(g, '心之花海', 16, 12, { color: P.white });
        text(g, 'WORLD 1', 72, 14, { font: 'en', color: P.yellow });
      }
    },
  };
};
