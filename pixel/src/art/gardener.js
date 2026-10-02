// The gardener: a chibi with a straw hat, red scarf and green overalls. Head and torso are hand-made
// sprites (front, side and back views; expressions are small patches over the face); arms and legs
// are outlined 2-px limbs drawn to hand and foot targets, so any pose is a handful of numbers.
// A pose is rendered facing right into a small canvas, cached, and mirrored when he faces left.
// In the gray world the post pass turns him gray; the sprite itself is always in colour.
import { P } from '../core/pal.js';
import { sprite } from '../core/sprite.js';
import { drawFig, figure, makeExpr, poses } from './rig.js';

export const GPAL = {
  k: P.brownD, h: P.gold, H: P.clay, y: P.yellow, b: P.red, r: P.brown, s: P.peach, S: P.tan,
  e: P.ink, w: P.white, c: P.pink, m: P.redD, f: P.red, F: P.redD, t: P.cream, T: P.tan,
  o: P.greenM, O: P.greenD, u: P.gold, B: P.brown, D: P.brownD,
};

// ---- heads: 20 x 15, chin on the bottom row ----
const HEAD = {
  front: `
.......kkkkkk.......
......khhhhhhk......
.....khyhhhhhhk.....
.....kbbbbbbbbk.....
..kkkkhhhhhhhhkkkk..
.khhyhhhhhhhhhhhHhk.
khhhhhhhhhhhhhhhhHhk
.kkkkkkkkkkkkkkkkkk.
...krrrSSSSSSrrrk...
...krssssssssssrk...
...ksseesssseessk...
...ksseesssseessk...
...kscsssmmssscsk...
....kssssssssssk....
.....kkkkkkkkkk.....`,
  side: `
.......kkkkkk.......
......khhhhhhk......
.....khyhhhhhhk.....
.....kbbbbbbbbk.....
..kkkkhhhhhhhhkkkk..
.khhyhhhhhhhhhhhHhk.
khhhhhhhhhhhhhhhhHhk
.kkkkkkkkkkkkkkkkkk.
...krrrrrSSSSSSSk...
...krrrrssssssssk...
...krrrsseesseesk...
...krrrsseesseesk...
...krrrscsssmssck...
....krrssssssssk....
......kkkkkkkkk.....`,
  back: `
.......kkkkkk.......
......khhhhhhk......
.....khyhhhhhhk.....
.....kbbbbbbbbk.....
..kkkkhhhhhhhhkkkk..
.khhyhhhhhhhhhhhHhk.
khhhhhhhhhhhhhhhhHhk
.kkkkkkkkkkkkkkkkkk.
...krrrrrrrrrrrrk...
...krrrrrrrrrrrrk...
...krrrrrrrrrrrrk...
...krrrrrrrrrrrrk...
...krrrrrrrrrrrrk...
....krrrrrrrrrrk....
.....kkkkkkkkkk.....`,
};

// ---- torsos: 12 x 9, neck at the top centre ----
const TORSO = {
  front: `
..kffffffk..
.kfFffffFfk.
kttoooooottk
ktouoooouotk
ktooooooootk
ktooOOOOootk
kooooooooook
kooooOOooook
.kkkkkkkkkk.`,
  side: `
..kffffk..
.kffFfFfk.
.kttoooook
.kttouoook
.ktooooook
.ktoOOOook
.koooooook
.kooOOoook
..kkkkkkk.`,
};
TORSO.back = TORSO.front.replace(/u/g, 'o').replace(/O/g, 'o');

// ---- items ----
const SEED = `
..kk..
.kwyk.
kxyzxk
kyzxyk
kzxyzk
.kxyk.
..kk..`;
const CAN = `
.....kkkk....
....k....k...
..kkkkkkkkk.k
.kGgggggggkkk
.kGgggggggkgk
.kGgRggggggk.
.kGgggggggk..
.kGGGGGGGGk..
..kkkkkkkk...`;
const CAN_POUR = `
...kkk.......
..k...k......
.kkkkkkkk....
kGgggggggk...
kGgggggggk...
kGgRgggggkk..
kGgggggggkgk.
kGGGGGGGGk.gk
.kkkkkkkk...k`;
const TROWEL = `
.k.
kgk
kgk
.k.
.B.
.B.`;
// the pixel just under the spout of CAN_POUR, where water leaves the can
export const SPOUT = [12, 9];
export const ITEMS = {
  can: () => sprite(CAN, { k: P.ink, g: P.g2, G: P.g3, R: P.rust }, { ax: 2, ay: 4 }),
  canPour: () => sprite(CAN_POUR, { k: P.ink, g: P.g2, G: P.g3, R: P.rust }, { ax: 2, ay: 4 }),
  trowel: () => sprite(TROWEL, { k: P.ink, g: P.g1, B: P.brown }, { ax: 1.5, ay: 1 }),
};
// the odd seed: three colours cycling through the rainbow; pass ex() to make it exempt from gray
export const SEED_COLS = [P.red, P.orange, P.gold, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink];
export function seedSprite(phase, exf) {
  const R = SEED_COLS;
  const i = ((Math.floor(phase) % R.length) + R.length) % R.length;
  const pal = { k: P.ink, w: P.white, x: R[i], y: R[(i + 3) % R.length], z: R[(i + 6) % R.length] };
  if (exf) for (const k of Object.keys(pal)) pal[k] = exf(pal[k]);
  return sprite(SEED, pal, { ax: 3, ay: 4 });
}

// ---- rig definition ----
function scarf(g, pose, pal, o) {
  const ph = pose.scarf ?? 0, wind = pose.wind ?? 0, k = pal.k;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i <= 5; i++) {
      const wv = Math.round(Math.sin(ph * 6.283 + i * 1.2) * (i / 5) * (1.2 + wind));
      const tx = o.front ? 4 + Math.round(i * 0.5) : -2 - i - Math.round(wind * i * 0.4);
      const ty = o.neckY + 1 + Math.round(i * (o.front ? 0.9 : 0.6 - wind * 0.15)) + wv;
      if (pass === 0) g.rect(o.x + tx - 1, ty - 1, 3, 3, k);
      else g.px(o.x + tx, ty, i >= 4 ? pal.F : pal.f);
    }
  }
}
export const GARDENER = {
  name: 'gardener', pal: GPAL,
  head: HEAD, headAx: 10, headAy: 15, headOverlap: 1, exprRow: 10,
  expr: makeExpr({ eyes: { front: [6, 12], side: [9, 13] }, mouth: { front: [9, 10], side: [12, 12] }, ew: 2 }),
  torso: TORSO, torsoAx: { front: 6, side: 5 },
  neck: 15, hip: 6,
  hips: { front: [-3, 1], side: [-2, 0] },
  shoulders: { front: [[-5, 2], [4, 2]], side: [[-2, 2], [0, 2]] },
  arms: { front: [[-2, 5], [2, 5]], side: [[-1, 5], [1, 5]] },
  legCol: 'o', bootCol: 'B', bootHi: 'D', sleeveCol: 't', handCol: 's',
  behind: scarf,
};
export function drawGardener(g, x, y, p = {}, pal = GPAL) { drawFig(g, GARDENER, x, y, p, pal); }
export const gardenerSprite = (p, pal = GPAL) => figure(GARDENER, p, pal);
export const pose = {
  idle: (t, o = {}) => poses.stand(t, { armL: [-1, 5], armR: [1, 5], ...o }),
  front: (t, o = {}) => poses.stand(t, { view: 'front', ...o }),
  walk: poses.walk,
  run: poses.run,
};
