// Small reusable sprites: smiling standard roses, unique flowers, bubbles, icons, critters, UI bits.
import { P, HUES, ex } from '../core/pal.js';
import { sprite, makeSprite } from '../core/sprite.js';
import { rng } from '../core/math.js';

// ---- the standard rose: identical, with a pixel smiley ----
const ROSE = `
..kkkkk..
.kRRrRRk.
kRRrrrRRk
kReRRReRk
kRRRRRRRk
kRrRRRrRk
.kRrrrRk.
..kkkkk..
....g....
...gg.gg.
....g.gg.
....g....`;
const ROSE_BLINK = ROSE.replace('kReRRReRk', 'kRrRRRrRk');
const ROSE_PAL = (exf) => {
  const p = { k: P.ink, R: P.red, r: P.redD, e: P.ink, g: P.greenM };
  if (exf) for (const k in p) p[k] = exf(p[k]);
  return p;
};
export const rose = (blink = false, exempt = true) => sprite(blink ? ROSE_BLINK : ROSE, ROSE_PAL(exempt ? ex : null), { ax: 4.5, ay: 12 });

// a rose in a small pot (shop shelves)
export const POT = `
kkkkkkk
kCCCCCk
.kCcCk.
.kCCCk.
..kkk..`;
export const pot = (exempt = false) => sprite(POT, exempt ? { k: ex(P.ink), C: ex(P.rust), c: ex(P.clay) } : { k: P.ink, C: P.rust, c: P.clay }, { ax: 3.5, ay: 5 });

// ---- unique flowers: shape, colours, height, lean all from the seed ----
// returns a sprite with its anchor at the base of the stem
export function uniqueFlower(seed, o = {}) {
  const key = 'uf' + seed + (o.small ? 's' : '') + (o.exempt ? 'x' : '') + (o.bud ? 'b' : '') + (o.shop ? 'p' : '');
  return makeSprite(24, 32, (g) => {
    const r = rng(seed * 2654435761 + 11);
    const exf = o.exempt ? ex : (c) => c;
    const c1 = r.pick(HUES), c2 = r.pick(HUES), cc = r.pick([P.yellow, P.gold, P.white, P.brownD, P.orange, P.cyan]);
    const sh = shade(c1);
    // shop: a short stem and a big head, the size of a potted rose
    const h = o.shop ? 3 + r.int(0, 2) : (o.small ? 8 : 12) + r.int(0, o.small ? 4 : 8);
    const lean = r.int(-2, 2);
    const cx = 12, base = 31;
    // stem with a kink
    const kink = r.int(3, h - 3);
    for (let y = 0; y < h; y++) {
      const x = cx + Math.round((lean * y) / h) + (y > kink ? r.int(0, 0) : 0);
      g.px(x, base - y, exf(P.greenM));
    }
    // leaves
    const nl = r.int(1, 2);
    for (let i = 0; i < nl; i++) {
      const ly = base - r.int(2, Math.max(3, h - 4)), side = i % 2 ? 1 : -1, lx = cx + Math.round((lean * (base - ly)) / h);
      g.px(lx + side, ly, exf(P.green));
      g.px(lx + side * 2, ly - 1, exf(P.green));
      g.px(lx + side, ly - 1, exf(P.greenM));
    }
    const hx = cx + lean, hy = base - h;
    if (o.bud) { g.rect(hx - 1, hy - 2, 3, 3, exf(c1)); g.px(hx, hy - 3, exf(c2)); return; }
    const type = r.int(0, 7);
    const R = o.small ? 2 : o.shop ? r.int(3, 4) : r.int(2, 4);
    const k = exf(P.ink);
    switch (type) {
      case 0: { // daisy: petals around a centre
        const n = r.int(5, 8);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r() * 0.3;
          g.disc(hx + Math.cos(a) * R, hy + Math.sin(a) * R, 1, exf(i % 2 ? c1 : sh));
        }
        g.disc(hx, hy, 1, exf(cc));
        break;
      }
      case 1: { // tulip cup
        g.rect(hx - R, hy - R, R * 2 + 1, R + 1, exf(c1));
        for (let i = -R; i <= R; i += 2) g.px(hx + i, hy - R - 1, exf(c1));
        g.vline(hx - R, hy - R, hy, exf(sh));
        g.rect(hx - R + 1, hy + 1, R * 2 - 1, 1, exf(sh));
        break;
      }
      case 2: { // round pom
        g.disc(hx, hy, R, exf(sh));
        g.disc(hx - 1, hy - 1, R - 1, exf(c1));
        g.px(hx - 1, hy - 2, exf(c2));
        break;
      }
      case 3: { // star
        g.disc(hx, hy, 1, exf(c1));
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) for (let i = 2; i <= R + 1; i++) g.px(hx + dx * i, hy + dy * i, exf(i > R ? c2 : c1));
        g.px(hx, hy, exf(cc));
        break;
      }
      case 4: { // bell, hanging
        g.rect(hx - 1, hy - 1, 3, 2, exf(c1));
        g.rect(hx - 2, hy + 1, 5, 2, exf(c1));
        g.px(hx - 2, hy + 3, exf(sh)); g.px(hx + 2, hy + 3, exf(sh)); g.px(hx, hy + 3, exf(cc));
        break;
      }
      case 5: { // two-tone layered
        g.disc(hx, hy, R, exf(c2));
        g.disc(hx, hy, Math.max(1, R - 1), exf(c1));
        g.px(hx, hy, exf(cc));
        break;
      }
      case 6: { // spiky asymmetric
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.55;
          g.line(hx, hy, hx + Math.cos(a) * (R + 1 + (i % 2)), hy + Math.sin(a) * (R + 1 + (i % 2)), exf(i % 2 ? c1 : c2));
        }
        g.rect(hx - 1, hy, 3, 2, exf(sh));
        break;
      }
      default: { // cluster of tiny blossoms
        for (let i = 0; i < 4; i++) g.px(hx + r.int(-R, R), hy + r.int(-R, R), exf(i % 2 ? c1 : c2));
        g.disc(hx, hy, 1, exf(c1));
        g.px(hx, hy, exf(cc));
      }
    }
    void k;
  }, { ax: 12, ay: 32 }, key);
}

export function shade(c) {
  const M = {
    [P.red]: P.redD, [P.orange]: P.rust, [P.gold]: P.clay, [P.yellow]: P.gold, [P.green]: P.greenM, [P.cyan]: P.blue,
    [P.blue]: P.blueD, [P.magenta]: P.purple, [P.pink]: P.magenta, [P.hot]: P.redD, [P.purple]: P.g5, [P.peach]: P.tan,
  };
  return M[c] || P.g4;
}

// ---- speech / thought bubbles ----
export function bubble(kind = 'q') {
  const arts = {
    q: `
..kkkkkkkkk..
.kwwwwwwwwwk.
kwwwwkkkwwwwk
kwwwkkwkkwwwk
kwwwwwwkkwwwk
kwwwwwkkwwwwk
kwwwwwkkwwwwk
kwwwwwwwwwwwk
kwwwwwkkwwwwk
.kwwwwwwwwwk.
..kkkkwwkkkk.
.....kwk.....
.....kk......`,
    big: `
..kkkkkkkkkkk..
.kwwwwwwwwwwwk.
kwwwwwwwwwwwwwk
kwwwwwwwwwwwwwk
kwwwwwwwwwwwwwk
kwwwwwwwwwwwwwk
kwwwwwwwwwwwwwk
kwwwwwwwwwwwwwk
kwwwwwwwwwwwwwk
kwwwwwwwwwwwwwk
.kwwwwwwwwwwwk.
..kkkkkwwkkkk..
......kwk......
......kk.......`,
    ex: `
.kkkkkkk.
kwwwkwwwk
kwwwkwwwk
kwwwkwwwk
kwwwkwwwk
kwwwwwwwk
kwwwkwwwk
.kkkkkkk.
...kwk...
....k....`,
    heart: `
.kkkkkkk.
kwwwwwwwk
kwrrwrrwk
kwrrrrrwk
kwwrrrwwk
kwwwrwwwk
kwwwwwwwk
.kkkkkkk.
...kwk...
....k....`,
    note: `
.kkkkkkk.
kwwwwkkwk
kwwwwkwkk
kwwwwkwwk
kwwkkkwwk
kwkkkkwwk
kwwkkwwwk
.kkkkkkk.
...kwk...
....k....`,
    dots: `
.kkkkkkk.
kwwwwwwwk
kwwwwwwwk
kwkwkwkwk
kwwwwwwwk
kwwwwwwwk
.kkkkkkk.
...kwk...
....k....`,
    sweat: `
..k..
.kck.
kccck
kcwck
.kkk.`,
    anger: `
k.k.k
.k.k.
kk.kk
.k.k.
k.k.k`,
  };
  const small = kind === 'sweat' || kind === 'anger';
  const w = arts[kind].split('\n').map((l) => l.trim()).filter((l) => l.length)[0].length;
  const h = arts[kind].split('\n').map((l) => l.trim()).filter((l) => l.length).length;
  return sprite(arts[kind], { k: P.ink, w: P.white, r: P.red, c: P.cyan }, { ax: small ? 2.5 : w / 2, ay: small ? 5 : h });
}

// ---- tiny icons ----
export const ICON = {
  heart: () => sprite(`
.kk.kk.
kRRkRRk
kRRRRRk
.kRRRk.
..kRk..
...k...`, { k: P.ink, R: P.red }),
  coin: () => sprite(`
.kkkk.
kyyyyk
kyowyk
kyowyk
kyyyyk
.kkkk.`, { k: P.ink, y: P.gold, o: P.clay, w: P.yellow }),
  star: () => sprite(`
...k...
..kyk..
kkkyykk
kyyyyyk
.kyyyk.
.kykyk.
.kk.kk.`, { k: P.ink, y: P.yellow }),
  sparkle: (i = 0) => sprite([`
..w..
..w..
wwwww
..w..
..w..`, `
.....
..w..
.www.
..w..
.....`, `
w...w
.w.w.
..w..
.w.w.
w...w`][i % 3], { w: P.white }),
};

// pigeon (gray world birds), 2 frames
export const pigeon = (f = 0) => sprite(f ? `
.k.....
kgk.kk.
.kggggk
..kggk.
...k.k.` : `
.......
.k.kk..
kgkgggk
.kggggk
...k.k.`, { k: P.ink, g: P.g2 }, { ax: 3.5, ay: 5 });

// puffy pixel cloud (cached): w x h, shades [light, mid, dark]
export function cloudSprite(seed, w, h, shades) {
  const key = 'cl' + seed + 'x' + w + 'x' + h + shades.join('');
  return makeSprite(w, h, (g) => {
    const r = rng(seed * 97 + 5);
    const n = Math.max(3, Math.round(w / 14));
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const bx = 6 + (i / (n - 1)) * (w - 12) + r.range(-3, 3);
      const br = Math.min(h / 2 - 1, (h / 2) * r.range(0.55, 1) * (1 - Math.abs(i / (n - 1) - 0.5) * 0.8));
      blobs.push([bx, h - 2 - br, br]);
    }
    for (const [x, y, rr] of blobs) g.disc(x, y + 2, rr, shades[2]);
    for (const [x, y, rr] of blobs) g.disc(x, y + 1, rr, shades[1]);
    for (const [x, y, rr] of blobs) g.disc(x - 1, y, rr - 1.5, shades[0]);
    g.rect(4, h - 3, w - 8, 2, shades[2]);
  }, { ax: w / 2, ay: h }, key);
}

// Mode-7 floor: for every row below the horizon, sample a procedural floor function.
// cam: {x, z, h (height), f (focal px), hz (horizon row)}; floor(wx, wz) -> packed ABGR colour
export function mode7(g, cam, floor, y0 = null) {
  const W = g.W, H = g.H;
  const top = Math.max(0, Math.ceil(y0 ?? cam.hz + 1));
  if (top >= H) return;
  const img = g.ctx.getImageData(0, top, W, H - top);
  const d = new Uint32Array(img.data.buffer);
  for (let y = top; y < H; y++) {
    const dy = y + 0.5 - cam.hz;
    if (dy <= 0) continue;
    const z = (cam.h * cam.f) / dy;
    const row = (y - top) * W;
    const k = z / cam.f;
    const wz = cam.z + z;
    for (let x = 0; x < W; x++) {
      const wx = cam.x + (x + 0.5 - W / 2) * k;
      const c = floor(wx, wz, z, x, y);
      if (c) d[row + x] = c;
    }
  }
  g.ctx.putImageData(img, 0, top);
}
// project a world point onto the Mode-7 screen: returns [sx, sy, scale] or null when behind
export function project7(cam, W, wx, wz, wy = 0) {
  const z = wz - cam.z;
  if (z <= 1) return null;
  const s = cam.f / z;
  return [W / 2 + (wx - cam.x) * s, cam.hz + (cam.h - wy) * s, s];
}

// critters (2-frame animations)
export const bunny = (f = 0) => sprite(f ? `
.k.k....
kwkwk...
kwwwk...
kwewwkk.
.kwwwwwk
.kwwwwwk
..kk.kk.` : `
.k.k....
kwkwk...
kwwwk...
kwewwkkk
.kwwwwwwk
..kwwwwk.
...kk.kk.`, { k: P.ink, w: P.white, e: P.ink }, { ax: 4, ay: 7 });
export const bird = (f = 0) => sprite(f ? `
k...k.
.kkk..
kyyyyk
.kyyok
..kk..` : `
......
.kkkk.
kyyyyk
kkyyok
k.kk..`, { k: P.ink, y: P.cyan, o: P.orange }, { ax: 3, ay: 5 });
export const snail = (f = 0) => sprite(`
..kkk..
.kppkk.
kpkpkk.
kppppkk
kkkkkkkk`.replace(/kkkkkkkk$/, f ? 'kgggggkk' : 'kkgggggk'), { k: P.ink, p: P.pink, g: P.greenM }, { ax: 4, ay: 5 });
// a fairy light (hope): bright core, wings flicker
export const fairy = (f = 0) => sprite(f ? `
.w...w.
wcw.wcw
.wyyyw.
..yWy..
.wyyyw.
.......` : `
.......
.w...w.
wcwywcw
..yWy..
..yyy..
.......`, { w: P.white, c: P.cyan, y: P.yellow, W: P.white }, { ax: 3.5, ay: 3 });

// a stork carrying a bundle, 2 wing frames
export const stork = (f = 0) => sprite(f ? `
........kkk.........
......kkwwwk........
....kkwwwwwk........
..kkwwwwwwk.........
.kwwwwwwwwwkk.......
kwwwwwwwwwwwwkkk....
.kkkkwwwwwwwwwwwkkk.
.....kwwwwwwwkkweoook
......kkkkkkk..kkkkk.
........k..kc........
........k...kcck.....
.............kcck....
..............kk.....` : `
.....................
.kkkkkk..............
kwwwwwwkkk...........
.kwwwwwwwwkk.........
..kkwwwwwwwwkk.......
....kkwwwwwwwwkkkkk..
.....kwwwwwwwwwwwkkk.
.....kwwwwwwwwkkweoook
......kkkkkkk..kkkkk.
........k..kc........
........k...kcck.....
.............kcck....
..............kk.....`, { k: P.ink, w: P.white, e: P.ink, o: P.orange, c: P.cream }, { ax: 10, ay: 7 });

// a unique seed (each person's): shape and colours from the seed number; exempt optional
export function personalSeed(seed, exempt = false) {
  const key = 'ps' + seed + (exempt ? 'x' : '');
  return makeSprite(9, 9, (g) => {
    const r = rng(seed * 31 + 7);
    const X = exempt ? ex : (c) => c;
    const a = r.pick(HUES), b = r.pick(HUES);
    const shape = r.int(0, 4);
    if (shape === 0) { g.disc(4, 4, 3, X(P.ink)); g.disc(4, 4, 2, X(a)); g.px(3, 3, X(P.white)); }
    else if (shape === 1) { g.poly([[4, 0], [8, 4], [4, 8], [0, 4]], X(P.ink)); g.poly([[4, 1.5], [6.5, 4], [4, 6.5], [1.5, 4]], X(a)); g.px(4, 3, X(b)); }
    else if (shape === 2) { g.rect(1, 1, 7, 7, X(P.ink)); g.rect(2, 2, 5, 5, X(a)); g.rect(3, 3, 2, 2, X(b)); }
    else if (shape === 3) { g.oval(4, 4, 2, 4, X(P.ink)); g.oval(4, 4, 1, 3, X(a)); g.px(4, 2, X(b)); g.px(4, 5, X(b)); }
    else { for (let i = 0; i < 5; i++) { const an = (i / 5) * Math.PI * 2 - Math.PI / 2; g.line(4, 4, 4 + Math.cos(an) * 4, 4 + Math.sin(an) * 4, X(i % 2 ? a : b)); } g.px(4, 4, X(P.white)); }
  }, { ax: 4.5, ay: 4.5 }, key);
}

// a thought cloud (puffy, with two little circles trailing down-left to the thinker)
export const thought = () => makeSprite(24, 22, (g) => {
  const blobs = [[7, 7, 4], [12, 5, 5], [17, 7, 4], [9, 10, 4], [15, 10, 4], [19, 10, 3], [5, 10, 3]];
  for (const [x, y, r] of blobs) g.disc(x, y, r + 1, P.ink);
  for (const [x, y, r] of blobs) g.disc(x, y, r, P.white);
  g.disc(5, 17, 2, P.ink); g.disc(5, 17, 1, P.white);
  g.rect(2, 19, 3, 3, P.ink); g.px(3, 20, P.white);
}, { ax: 3, ay: 22 }, 'thought');

// what someone is secretly thinking of: three flowers that have nothing in common
const DREAMS = {
  sunflower: { art: `
...ooo...
.ooyyyoo.
.oybbbyo.
oybbBbbyo
oybBbBbyo
oybbBbbyo
.oybbbyo.
.ooyyyoo.
...ooo...`, pal: { o: P.gold, y: P.yellow, b: P.brown, B: P.brownD } },
  tulip: { art: `
.p..p..p.
.pp.p.pp.
.ppppppp.
.pPpppPp.
..ppppp..
...ppp...
....g....
.gg.g.gg.
..ggggg..`, pal: { p: P.pink, P: P.magenta, g: P.greenM } },
  bluebell: { art: `
....g....
....gg...
...kbbk..
..kbccbk.
..kbcbbk.
.kbbbbbbk
.kbbbbbbk
kb.b.b.bk
.k.k.k.k.`, pal: { g: P.greenM, b: P.blue, c: P.cyan, k: P.blueD } },
};
export const dream = (kind) => {
  const d = DREAMS[kind];
  const pal = {};
  for (const k in d.pal) pal[k] = ex(d.pal[k]);
  return sprite(d.art, pal, { ax: 4.5, ay: 4.5 });
};

// the same three flowers grown up on a stem, for the judging stage; exempt = in colour even in the
// gray world (otherwise the gray pass flattens them like everything else)
export const dreamPlant = (kind, exempt = true) => makeSprite(13, 16, (g) => {
  const d = DREAMS[kind];
  const X = exempt ? ex : (c) => c;
  const pal = {};
  for (const k in d.pal) pal[k] = X(d.pal[k]);
  const head = sprite(d.art, pal, { ax: 0, ay: 0 });
  const st = X(P.greenM), lf = X(P.green);
  if (kind === 'bluebell') {
    // nodding: the stem climbs, arches over and the bell hangs from it
    g.vline(3, 1, 15, st); g.hline(3, 7, 1, st); g.px(7, 2, st);
    g.px(4, 11, lf); g.px(5, 10, lf); g.px(2, 13, lf); g.px(1, 12, lf);
    g.spr(head, 3, 3);
  } else if (kind === 'tulip') {
    g.vline(6, 12, 15, st);
    g.spr(head, 2, 3);
  } else {
    g.vline(6, 10, 15, st); g.px(7, 12, lf); g.px(8, 11, lf); g.px(9, 11, lf); g.px(5, 14, lf); g.px(4, 13, lf);
    g.spr(head, 2, 1);
  }
}, { ax: kind === 'bluebell' ? 3.5 : 6.5, ay: 16 }, 'dplant' + kind + (exempt ? 'x' : ''));
