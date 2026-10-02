// A small character rig shared by the gardener and the townsfolk. Head and torso are ASCII sprites
// per view ('front' | 'side' | 'back', side faces right); arms and legs are outlined 2-px limbs drawn
// to hand / foot targets. A pose renders into a scratch canvas facing right and is cached, so a crowd
// of identical people costs one drawing per distinct pose. Flipping mirrors the cached sprite.
import { sprite, makeSprite } from '../core/sprite.js';

const FW = 64, FH = 72, AX = 32, AY = 66; // scratch canvas and ground anchor (row below the feet)
const cache = new Map();
let ids = 0;

function patchArt(art, rows, from) {
  if (!rows) return art;
  const lines = art.split('\n').map((l) => l.trim()).filter((l) => l.length);
  rows.forEach((r, i) => {
    if (!r || from + i >= lines.length) return;
    const L = lines[from + i].split('');
    for (let j = 0; j < r.length && j < L.length; j++) if (r[j] !== '.' && L[j] !== '.' && L[j] !== 'k') L[j] = r[j];
    lines[from + i] = L.join('');
  });
  return lines.join('\n');
}

const headArts = new Map();
export function headOf(def, view, expr, hair) {
  const key = def.name + view + expr + (hair || '');
  let art = headArts.get(key);
  if (!art) {
    const base = (hair && def.hairs && def.hairs[hair] ? def.hairs[hair] : def.head)[view];
    art = view === 'back' ? base : patchArt(base, def.expr(view, expr), def.exprRow);
    headArts.set(key, art);
  }
  return art;
}

function limb(g, x0, y0, x1, y1, col, endCol, k, th = 2) {
  g.line(x0, y0, x1, y1, k, th + 2);
  g.rect(x1 - 1, y1 - 1, th + 2, th + 2, k);
  g.line(x0, y0, x1, y1, col, th);
  g.rect(x1, y1, th, th, endCol);
}

function drawFigure(g, def, pose, pal) {
  const x = AX, y = AY - 1; // y = feet row
  const view = pose.view || 'side';
  const front = view !== 'side';
  const k = pal.k;
  const crouch = Math.round(pose.crouch || 0);
  const bob = Math.round(pose.bob || 0) + crouch;
  const neckY = y - def.neck + bob;
  const hipY = y - def.hip + bob;
  const lean = Math.round(pose.lean || 0);
  const hips = def.hips[front ? 'front' : 'side'];
  const shoulders = def.shoulders[front ? 'front' : 'side'];
  const dA = def.arms[front ? 'front' : 'side'];
  const armL = pose.armL || dA[0];
  const armR = pose.armR || dA[1];
  const legL = pose.legL || [0, 0];
  const legR = pose.legR || [0, 0];

  const leg = (hx, f) => {
    const fx = x + hx + f[0];
    const footY = y - 2 + Math.min(0, Math.round(f[1]));
    g.line(x + hx, hipY, fx, footY - 1, k, 4);
    g.line(x + hx, hipY, fx, footY - 1, pal[def.legCol], 2);
    g.rect(fx - 1, footY - 1, front ? 4 : 5, 4, k);
    g.rect(fx, footY, front ? 2 : 3, 2, pal[def.bootCol]);
    if (!front && def.bootHi) g.px(fx + 2, footY, pal[def.bootHi]);
  };
  const arm = (sh, a) => {
    const ax0 = x + sh[0] + lean, ay0 = neckY + sh[1];
    limb(g, ax0, ay0, ax0 + a[0], ay0 + a[1], pal[def.sleeveCol], pal[def.handCol], k);
  };
  const hand = () => [x + shoulders[1][0] + lean + armR[0], neckY + shoulders[1][1] + armR[1]];
  const handL = () => [x + shoulders[0][0] + lean + armL[0], neckY + shoulders[0][1] + armL[1]];
  const item = (it) => {
    if (!it) return;
    const [hx, hy] = it.left ? handL() : hand();
    g.spr(it.s, hx + (it.dx || 0), hy + (it.dy || 0), !!it.flip);
  };

  if (def.behind) def.behind(g, pose, pal, { x: x + lean, neckY, front, view });
  if (view === 'side') arm(shoulders[0], armL);
  item(pose.itemBack);
  leg(hips[0], legL);
  leg(hips[1], legR);
  if (front && view === 'front' && !pose.armsFront) { arm(shoulders[0], armL); arm(shoulders[1], armR); }
  const ts = sprite(def.torso[view], pal, { ax: def.torsoAx[front ? 'front' : 'side'], ay: 0 });
  g.spr(ts, x + lean, neckY);
  if (view === 'back') { arm(shoulders[0], armL); arm(shoulders[1], armR); }
  const hs = sprite(headOf(def, view, pose.expr || 'neutral', pose.hair), pal, { ax: def.headAx, ay: def.headAy });
  const hx = x + lean + (pose.headDx || 0), hy = neckY + def.headOverlap + Math.round(pose.headDy || 0);
  g.spr(hs, hx, hy);
  if (def.onHead) def.onHead(g, pose, pal, { x: hx, y: hy, view });
  if (view === 'front' && pose.armsFront) { arm(shoulders[0], armL); arm(shoulders[1], armR); }
  if (view === 'side') arm(shoulders[1], armR);
  item(pose.item);
  if (def.after) def.after(g, pose, pal, { x: x + lean, neckY, view, hand: hand() });
}

// where pixel (ix, iy) of a held item lands, as an offset from the figure's anchor (feet), flip-aware.
// Mirrors drawFigure's hand and item placement, so effects (water from a spout) start in the right place.
export function heldPoint(def, pose, item, ix, iy) {
  const front = (pose.view || 'side') !== 'side';
  const sh = def.shoulders[front ? 'front' : 'side'][1];
  const armR = pose.armR || def.arms[front ? 'front' : 'side'][1];
  const bob = Math.round(pose.bob || 0) + Math.round(pose.crouch || 0);
  const lean = Math.round(pose.lean || 0);
  const neckY = AY - 1 - def.neck + bob;
  const hx = AX + sh[0] + lean + armR[0], hy = neckY + sh[1] + armR[1];
  const cx = Math.round(hx + (item.dx || 0) - item.s.ax) + ix;
  const cy = Math.round(hy + (item.dy || 0) - item.s.ay) + iy;
  return [pose.flip ? AX - 1 - cx : cx - AX, cy - AY];
}

// cached sprite of a pose (anchor = ground row under the feet)
export function figure(def, pose, pal) {
  const key = def.name + JSON.stringify(pose, (kk, v) => (kk === 's' && v && v.c ? v.c.dataset.fid || (v.c.dataset.fid = 'c' + ids++) : typeof v === 'number' ? Math.round(v * 10) / 10 : v)) + JSON.stringify(pal);
  let s = cache.get(key);
  if (s) return s;
  if (cache.size > 6000) cache.clear();
  s = makeSprite(FW, FH, (g) => drawFigure(g, def, pose, pal), { ax: AX, ay: AY });
  cache.set(key, s);
  return s;
}

export function drawFig(g, def, x, y, pose = {}, pal = def.pal) {
  g.spr(figure(def, pose, pal), x, y, !!pose.flip);
}

// expression helper for heads with 2-row eyes: eyes {front:[l,r], side:[l,r]} (eye width ew),
// mouth centre columns {front: [a,b], side: [a,b]}; skin char 's'
export function makeExpr({ eyes, mouth, ew = 2 }) {
  const row = (set) => { const a = Array(24).fill('.'); for (const [c, ch] of set) if (c >= 0) a[c] = ch; return a.join(''); };
  return (view, expr) => {
    if (view === 'back') return null;
    const [l, r] = eyes[view];
    const [m0, m1] = mouth[view];
    const E = (cols) => cols.flatMap((c) => Array.from({ length: ew }, (_, i) => c + i));
    const eyeCols = E([l, r]);
    const clear = row(eyeCols.map((c) => [c, 's']));
    const set = (cols, ch = 'e') => row(cols.map((c) => [c, ch]));
    const mw = m1 - m0;
    const M = {
      line: [set(range(m0, m1), 'm'), null],
      smile: [set([m0 - 1, m1 + 1], 'm'), set(range(m0, m1), 'm')],
      wide: [set([m0 - 2, m1 + 2], 'm'), set(range(m0 - 1, m1 + 1), 'm')],
      open: [set(range(m0 - 1, m1 + 1), 'm'), set(range(m0, m1), 'm')],
      frown: [set(range(m0, m1), 'm'), set([m0 - 1, m1 + 1], 'm')],
      o: [set(range(m0, m1), 'm'), set(range(m0, m1), 'm')],
      flat: [set(range(m0 - 1, m1 + 1), 'm'), null],
      none: [null, null],
    };
    const outer = ew === 1 ? [] : [l, r + ew - 1];
    const inner = ew === 1 ? [] : [l + ew - 1, r];
    const eyesRows = {
      open: [null, null],
      closed: [clear, set(eyeCols)],
      happy: ew === 1 ? [set([l, r]), clear.replace(/s/g, '.') && set([l - 1, l + 1, r - 1, r + 1])] : [set(eyeCols), set([l - 1, l + ew, r - 1, r + ew])],
      sad: [set(outer, 's'), null],
      angry: [set(inner, 's'), null],
      squeeze: [clear, set([l - 1, ...eyeCols.slice(0, ew), l + ew, r - 1, ...eyeCols.slice(ew), r + ew])],
      half: [clear, null],
    };
    const T = {
      neutral: ['open', null], blink: ['closed', 'keep'], sleep: ['closed', 'none'], happy: ['happy', 'open'], smile: ['open', 'smile'],
      surprised: ['open', 'o'], sad: ['sad', 'frown'], worried: ['sad', 'keep'], determined: ['angry', 'keep'], hurt: ['squeeze', 'flat'],
      shout: ['angry', 'open'], content: ['happy', 'smile'], wow: ['open', 'open'], standard: ['open', 'wide'], tired: ['half', 'flat'],
      grin: ['happy', 'wide'],
    }[expr];
    if (!T) return null;
    const out = [...eyesRows[T[0]]];
    if (T[1] !== 'keep') {
      const base = set(range(m0 - 2, m1 + 2), 's');
      const m = M[T[1] || 'line'];
      out[2] = merge(base, m[0]);
      out[3] = m[1] ? merge(set(range(m0 - 2, m1 + 2), 's'), m[1]) : null;
    }
    void mw;
    return out;
  };
}
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
function merge(a, b) {
  if (!b) return a;
  const A = a.split('');
  for (let i = 0; i < b.length; i++) if (b[i] !== '.') A[i] = b[i];
  return A.join('');
}

// shared pose library (works for any def; phase = cycles of two steps)
const S = Math.sin, TAU = Math.PI * 2;
export const poses = {
  stand(t, o = {}) {
    const br = (t * 1.1) % 1 < 0.5 ? 0 : 1;
    const blink = (t + (o.seed || 0)) % 3.3 < 0.13;
    return { view: 'side', bob: br, expr: blink && !o.expr ? 'blink' : o.expr || 'neutral', scarf: Math.floor(t * 4) / 4, ...o };
  },
  walk(phase, o = {}) {
    const f = Math.floor(phase * 8) / 8;
    const a = S(f * TAU), st = o.stride ?? 3;
    return {
      view: 'side', bob: Math.abs(a) < 0.5 ? -1 : 0, scarf: f,
      legR: [Math.round(a * st), a > 0.3 ? -1 : 0], legL: [Math.round(-a * st), a < -0.3 ? -1 : 0],
      armR: [Math.round(-a * 2), o.armY ?? 5], armL: [Math.round(a * 2), o.armY ?? 5], expr: 'neutral', ...o,
    };
  },
  run(phase, o = {}) {
    const f = Math.floor(phase * 8) / 8;
    const a = S(f * TAU), c = Math.cos(f * TAU);
    return {
      view: 'side', bob: Math.abs(a) < 0.5 ? -2 : 0, lean: 1, scarf: f * 2, wind: 1,
      legR: [Math.round(a * 4), c > 0 ? -2 : 0], legL: [Math.round(-a * 4), c < 0 ? -2 : 0],
      armR: [Math.round(-a * 3) + 1, 4], armL: [Math.round(a * 3) + 1, 4], expr: 'determined', ...o,
    };
  },
};
