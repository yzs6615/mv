// Townsfolk. In the gray world everyone is the same "standard citizen": slicked hair, gray suit,
// gray tie, dot eyes, the same mouth. Later they become racers (track suits with rank numbers) and
// finally each gets their own colours, hair and accessory: free(seed) builds a one-off look.
import { P, HUES } from '../core/pal.js';
import { sprite } from '../core/sprite.js';
import { drawFig, figure, makeExpr, poses } from './rig.js';
import { rng } from '../core/math.js';

export const CPAL = {
  k: P.ink, H: P.g4, h: P.g3, s: P.g1, S: P.g2, e: P.ink, m: P.g4, w: P.white, t: P.g5,
  J: P.g3, j: P.g4, L: P.g4, K: P.ink, c: P.g1, A: P.g3, a: P.g4,
};

const HEAD = {
  front: `
...kkkkkk...
..kHHHHHHk..
.kHHHhHHHHk.
kHHHhHHHHHHk
kHHssssssHHk
kHssssssssHk
kssessssessk
kssessssessk
kSssssssssSk
.kssssssssk.
..kssssssk..
...kkkkkk...`,
  side: `
...kkkkkk...
..kHHHHHHk..
.kHHHHHhHHk.
kHHHHHHHhHHk
kHHHHssssssk
kHHHsssssssk
kHHsssessesk
kHHsssessesk
kHHSssssssk.
.kHssssssk..
..kssssssk..
...kkkkkk...`,
  back: `
...kkkkkk...
..kHHHHHHk..
.kHHHHHHHHk.
kHHHHHHHHHHk
kHHHHHHHHHHk
kHHHHHHHHHHk
kHHHHHHHHHHk
kHHHHHHHHHHk
kHHHHHHHHHHk
.kHHHHHHHHk.
..kssssssk..
...kkkkkk...`,
};

// hair styles for freed people (same face, different silhouettes)
const HAIRS = {
  bob: {
    front: HEAD.front.replace('kHHssssssHHk', 'kHHHHHHHHHHk').replace('kHssssssssHk', 'kHHssssssHHk').replace(/kssessssessk/g, 'kHsessssesHk').replace('kSssssssssSk', 'kHssssssssHk'),
    side: HEAD.side,
    back: HEAD.back,
  },
  spiky: {
    front: HEAD.front.replace('...kkkkkk...', '.k.k.kk.k.k.').replace('..kHHHHHHk..', '.kHkHkHHkHk.'),
    side: HEAD.side.replace('...kkkkkk...', '..k.k.kk.k..').replace('..kHHHHHHk..', '.kHkHkHHkHk.'),
    back: HEAD.back,
  },
  bald: {
    front: HEAD.front.replace(/H/g, 's').replace(/h/g, 'S'),
    side: HEAD.side.replace(/H/g, 's').replace(/h/g, 'S'),
    back: HEAD.back.replace(/H/g, 's'),
  },
};

const TORSO = {
  front: `
...kwttwk...
.kJJwttwJJk.
kJJJJttJJJJk
kJJJJttJJJJk
kjJJJttJJJjk
kjJJJJtJJJjk
kjJJJJJJJJjk
kLLLLLLLLLLk
kLLLLkkLLLLk
.kkkk..kkkk.`,
  side: `
..kwwttk..
.kJJwttJk.
.kJJJJtJk.
.kJJJJJtk.
.kjJJJJJk.
.kjJJJJJk.
.kjJJJJJk.
.kLLLLLLk.
.kLLLLLLk.
..kkkkkk..`,
  back: `
...kkkkkk...
.kJJJJJJJJk.
kJJJJJJJJJJk
kJJJJJJJJJJk
kjJJJJJJJJjk
kjJJJjjJJJjk
kjJJJJJJJJjk
kLLLLLLLLLLk
kLLLLkkLLLLk
.kkkk..kkkk.`,
};

// race bib over the suit: the torso art with a white number patch
const BIB = {
  front: TORSO.front.replace('kJJJJttJJJJk\nkjJJJttJJJjk', 'kJJwwwwwwJJk\nkjJwwwwwwJjk').replace('kjJJJJtJJJjk', 'kjJwwwwwwJjk'),
  side: TORSO.side,
  back: TORSO.back.replace('kjJJJjjJJJjk', 'kjJwwwwwwJjk').replace('kjJJJJJJJJjk\nkLLL', 'kjJwwwwwwJjk\nkLLL'),
};

const BRIEFCASE = `
.kkkk.
kAkkAk
kAAAAk
kaAAak
.kkkk.`;
export const briefcase = (pal = CPAL) => sprite(BRIEFCASE, pal, { ax: 3, ay: 1 });

// accessories drawn on top of the head (12-wide head, anchor = bottom centre of the head)
const ACC = {
  bow: { art: `\n.kk.kk.\nkxxkxxk\n.kk.kk.`, dx: 2, dy: -12 },
  cap: { art: `\n..kkkkk...\n.kxxxxxk..\nkxxxxxxxkk\n.kkkkkkkkxk\n........kk`, dx: -1, dy: -14 },
  flower: { art: `\n.kxk.\nkxyxk\n.kxk.`, dx: 3, dy: -12 },
  band: { art: `\nkkkkkkkkkkkk\nxxxxxxxxxxxx\nkkkkkkkkkkkk`, dx: 0, dy: -9 },
  glasses: { art: `\nkkkk..kkkk\nkwwkkkkwwk\nkkkk..kkkk`, dx: 0, dy: -6 },
  beanie: { art: `\n....kk....\n...kyyk...\n..kxxxxk..\n.kxxxxxxk.\nkxxxxxxxxk\nkyyyyyyyyk\nkkkkkkkkkk`, dx: 0, dy: -15 },
  antenna: { art: `\n.k.\nkxk\n.k.\n.k.\n.k.`, dx: 0, dy: -16 },
  crown: { art: `\nk.k.k.k\nkxkxkxk\nkxxxxxk\nkkkkkkk`, dx: 0, dy: -14 },
};
function onHead(g, pose, pal, o) {
  const a = pose.acc && ACC[pose.acc];
  if (!a || o.view === 'back') return;
  const s = sprite(a.art, { k: P.ink, x: pal.x || P.red, y: pal.y || P.yellow, w: P.white }, { ax: 6 - a.dx, ay: 0 });
  g.spr(s, o.x, o.y + a.dy);
}

// rank tag floating above a racer: "1st", "2nd", ... (drawn by scenes)
export const CITIZEN = {
  name: 'citizen', pal: CPAL,
  head: HEAD, hairs: HAIRS, headAx: 6, headAy: 12, headOverlap: 1, exprRow: 6,
  expr: makeExpr({ eyes: { front: [3, 8], side: [6, 9] }, mouth: { front: [5, 6], side: [8, 9] }, ew: 1 }),
  torso: TORSO, torsoAx: { front: 6, side: 5 },
  neck: 22, hip: 13,
  hips: { front: [-4, 2], side: [-2, 0] },
  shoulders: { front: [[-5, 2], [4, 2]], side: [[-2, 2], [0, 2]] },
  arms: { front: [[-2, 8], [2, 8]], side: [[-1, 8], [1, 8]] },
  legCol: 'L', bootCol: 'K', bootHi: null, sleeveCol: 'J', handCol: 's',
  onHead,
};
export const RACER = { ...CITIZEN, name: 'racer', torso: BIB };

export function drawCitizen(g, x, y, p = {}, pal = CPAL, def = CITIZEN) { drawFig(g, def, x, y, p, pal); }
export const citizenSprite = (p, pal = CPAL, def = CITIZEN) => figure(def, p, pal);

// a freed person's look: palette + hair + accessory, deterministic from a seed
const SKINS = [P.peach, P.skin, P.tan, P.clay, P.cream];
const HAIRCOL = [P.brown, P.brownD, P.gold, P.rust, P.ink, P.magenta, P.orange, P.purple, P.cream];
export function freeLook(seed) {
  const r = rng(seed * 7919 + 13);
  const jacket = r.pick(HUES);
  let tie = r.pick(HUES);
  if (tie === jacket) tie = P.white;
  const skin = r.pick(SKINS);
  const pal = {
    ...CPAL, k: P.ink, s: skin, S: skin === P.peach ? P.tan : skin === P.cream ? P.peach : P.brown,
    H: r.pick(HAIRCOL), h: P.brownD, J: jacket, j: shade(jacket), t: tie, L: r.pick([P.blueD, P.brownD, P.g4, P.purple, P.greenD, P.brown]),
    K: r.pick([P.brownD, P.ink, P.redD]), m: P.redD, e: P.ink, x: r.pick(HUES), y: r.pick([P.yellow, P.white, P.cyan, P.pink]),
  };
  pal.h = shade(pal.H);
  return { pal, hair: r.pick([null, 'bob', 'spiky', 'bald', null, 'bob']), acc: r.pick(['bow', 'cap', 'flower', 'band', 'glasses', 'beanie', 'antenna', 'crown', null, 'flower']) };
}
export function shade(c) {
  const M = {
    [P.red]: P.redD, [P.orange]: P.rust, [P.gold]: P.clay, [P.yellow]: P.gold, [P.green]: P.greenM, [P.cyan]: P.blue,
    [P.blue]: P.blueD, [P.magenta]: P.purple, [P.pink]: P.magenta, [P.hot]: P.redD, [P.purple]: P.g5, [P.peach]: P.tan,
    [P.brown]: P.brownD, [P.brownD]: P.ink, [P.rust]: P.brown, [P.ink]: P.ink, [P.cream]: P.tan, [P.white]: P.g1,
    [P.greenM]: P.greenD, [P.g3]: P.g4, [P.g4]: P.g5, [P.clay]: P.rust, [P.tan]: P.brown,
  };
  return M[c] || P.g5;
}

export const folkPoses = {
  ...poses,
  stand: (t, o = {}) => poses.stand(t, { armL: [-1, 8], armR: [1, 8], ...o }),
  walk: (ph, o = {}) => poses.walk(ph, { armY: 8, stride: 3, ...o }),
};

// babies (flashbacks): a round head, a nappy, crawling or sitting
const BABY = {
  sit: `
...kkkkk...
..kHssssk..
.kssssssk..
.ksesssesk.
.kscsssscsk
..kssmssk..
...kkkkk...
..kwwwwwk..
.kswwwwwsk.
..kkkkkkk..`,
  crawl1: `
.....kkkkk...
....kHssssk..
...kssssssk..
...ksesssesk.
...kscssscsk.
..kkkssmsskk.
.kwwwkkkkkk..
kswwwwwwsk...
.kkk.kk.kk...`,
  crawl2: `
.....kkkkk...
....kHssssk..
...kssssssk..
...ksesssesk.
...kscssscsk.
..kkkssmsskk.
.kwwwkkkkkk..
.kwwwwwwwsk..
kk.kk..kkk...`,
};
export const BPAL = { k: P.ink, H: P.brown, s: P.peach, e: P.ink, c: P.pink, m: P.redD, w: P.white };
export const babySprite = (kind, pal = BPAL) => sprite(BABY[kind], pal, kind === 'sit' ? { ax: 5.5, ay: 10 } : { ax: 6.5, ay: 9 });
