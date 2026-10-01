import { Cut } from './ballroom_art.js';
import { rng } from '../core/math.js';

// Paper-cut artwork for Juliet's chamber (shot 3.6, WAITING): the room wall with a deep window niche,
// a leaded casement window, a drawn-back curtain, and the tree outside (branches + twig anchors for
// leaves, snow and blossom). Layout constants are shared with chamber.js.

export const ROOM = {
  seatY: 0.9,                                        // window-seat (ledge) height
  niche: { hw: 1.35, spring: 2.95, depth: 0.95 },    // opening in the room wall (z = 0), round arch
  win: { hw: 0.95, y0: 1.02, spring: 2.95 },          // casement opening at the back of the niche
  wall: { w: 12, h: 6 },
  tree: { w: 11, h: 11, x: -1.2, y: -4.2, z: -6.5 },
};

/** room wall seen from inside: niche opening, mouldings, panelling, curtain rod */
export function roomWallArt({ preview = false } = {}) {
  const R = ROOM, W = R.wall, c = new Cut(W.w, W.h, 120, { seed: 31 });
  const cx = W.w / 2;
  c.rect(0, 0, W.w, W.h);
  // niche (cut out) with a moulded surround
  const n = R.niche;
  c.tfill(c.archPath(cx - n.hw - 0.22, n.spring, 2 * n.hw + 0.44, { down: n.spring - R.seatY + 0.3 }), 0.55);
  c.holePath(c.archPath(cx - n.hw, n.spring, 2 * n.hw, { down: n.spring - R.seatY }));
  c.gc.lineWidth = 0.02 * c.sx; c.gc.stroke(c.archPath(cx - n.hw - 0.08, n.spring, 2 * n.hw + 0.16, { down: n.spring - R.seatY + 0.05 }));
  // keystone
  c.trect(cx - 0.14, n.spring + n.hw + 0.02, 0.28, 0.32, 0.9);
  // seat front (the ledge block below the niche) with a carved panel
  c.trect(cx - n.hw - 0.05, R.seatY - 0.12, 2 * n.hw + 0.1, 0.12, 0.8);
  c.trect(cx - n.hw + 0.15, 0.2, 2 * n.hw - 0.3, R.seatY - 0.45, 0.3);
  // wainscot panelling + dado rail
  for (let x = 0.3; x < W.w - 0.5; x += 1.25) { if (Math.abs(x + 0.5 - cx) < n.hw + 0.4) continue; c.trect(x, 0.2, 0.95, 0.75, 0.32); }
  c.trect(0, 1.05, W.w, 0.06, 0.7);
  // tall panels above
  for (const x of [cx - 4.4, cx - 3.0, cx + 2.0, cx + 3.4]) { c.trect(x, 1.4, 1.0, 3.3, 0.22); c.trect(x + 0.08, 1.48, 0.84, 3.14, 0.12); }
  // cornice
  c.trect(0, W.h - 0.45, W.w, 0.12, 0.8); c.trect(0, W.h - 0.3, W.w, 0.3, 0.45);
  // curtain rod across the niche top
  c.rect(cx - n.hw - 0.75, n.spring + n.hw + 0.42, 2 * n.hw + 1.5, 0.045);
  c.fillPath(c.ell(cx - n.hw - 0.78, n.spring + n.hw + 0.443, 0.06, 0.06)); c.fillPath(c.ell(cx + n.hw + 0.78, n.spring + n.hw + 0.443, 0.06, 0.06));
  // a small framed icon / mirror on the right wall catching candlelight
  c.tfill(c.ell(cx + 2.65, 3.1, 0.42, 0.55), 0.7); c.tfill(c.ell(cx + 2.65, 3.1, 0.33, 0.46), 0.15);
  c.gc.lineWidth = 0.025 * c.sx; c.gc.beginPath(); c.gc.ellipse(c.X(cx + 2.65), c.Y(3.1), 0.38 * c.sx, 0.51 * c.sy, 0, 0, Math.PI * 2); c.gc.stroke();
  if (preview) return c;
  return c.packCut();
}

/** heavy curtain drawn back to the left of the niche (paper-cut folds) */
export function curtainArt({ preview = false } = {}) {
  const c = new Cut(1.6, 4.6, 140, { seed: 33 });
  // gathered at the tie-back (y ~ 1.6), flaring above and below
  const top = 4.5, tie = 1.75, bot = 0.0;
  c.blob([[0.05, top, 1], [1.35, top, 1], [1.2, 3.6], [0.72, 2.35], [0.62, tie + 0.08], [0.78, tie - 0.25], [1.1, 0.9], [1.25, bot, 1], [0.0, bot, 1]], 1);
  // folds (tone)
  for (const [x0, x1, x2] of [[0.25, 0.3, 0.2], [0.55, 0.45, 0.45], [0.85, 0.55, 0.72], [1.15, 0.6, 1.0]]) {
    c.tline([[x0, top - 0.05], [x1 + 0.05, tie + 0.6], [0.5 + x1 * 0.2, tie], [x2, 0.5], [x2 + 0.05, 0.05]], 0.022, false, 0.55);
  }
  // tie-back cord + tassel
  c.limb([[0.0, tie + 0.15, 0.02], [0.45, tie - 0.05, 0.022], [0.8, tie + 0.02, 0.02]]);
  c.blob([[0.76, tie - 0.05], [0.88, tie - 0.05], [0.9, tie - 0.42], [0.74, tie - 0.42]], 0.7);
  c.gline([[0.0, tie + 0.15], [0.45, tie - 0.05], [0.8, tie + 0.02]], 0.012);
  // rings at the top
  for (let x = 0.12; x < 1.3; x += 0.2) c.gfill(c.ell(x, top - 0.02, 0.03, 0.03));
  if (preview) return c;
  return c.packCut();
}

/** the casement window at the back of the niche: frame, central mullion, transom, diamond leading */
export function windowArt({ preview = false } = {}) {
  const R = ROOM, n = R.niche, w = R.win;
  const c = new Cut(2 * n.hw, n.spring + n.hw - R.seatY + 0.1, 260, { seed: 35 });
  const cx = n.hw, y0 = R.seatY; // art origin: x = -hw.., y = seatY..
  const Y = (y) => y - y0;
  c.rect(0, 0, 2 * n.hw, c.hm);
  const opening = c.archPath(cx - w.hw, Y(w.spring), 2 * w.hw, { down: w.spring - w.y0 });
  c.holePath(opening);
  // diamond leading clipped to the opening
  const lead = new Path2D();
  const step = 0.17, lw = 0.011;
  for (let k = -30; k < 30; k++) {
    const x0 = cx + k * step;
    lead.moveTo(c.X(x0), c.Y(0)); lead.lineTo(c.X(x0 + 4), c.Y(4 * 1.45));
    lead.moveTo(c.X(x0), c.Y(0)); lead.lineTo(c.X(x0 - 4), c.Y(4 * 1.45));
  }
  c.s.save(); c.s.clip(opening); c.s.lineWidth = lw * c.sx; c.s.strokeStyle = '#fff'; c.s.stroke(lead); c.s.restore();
  // casement frames, mullion, transom
  const fw = 0.045;
  c.s.save(); c.s.lineWidth = fw * c.sx; c.s.strokeStyle = '#fff'; c.s.stroke(c.archPath(cx - w.hw + fw / 2, Y(w.spring), 2 * w.hw - fw, { down: w.spring - w.y0 - fw / 2 })); c.s.restore();
  c.rect(cx - 0.035, Y(w.y0), 0.07, w.spring + w.hw - w.y0);
  c.rect(cx - w.hw, Y(w.spring - 0.02), 2 * w.hw, 0.06);
  for (const x of [cx - w.hw / 2, cx + w.hw / 2]) c.rect(x - 0.01, Y(w.y0), 0.02, w.spring - w.y0); // casement meeting bars
  // latch + hinges
  c.rect(cx + 0.04, Y(1.95), 0.09, 0.03); c.gfill(c.ell(cx + 0.13, Y(1.965), 0.018, 0.018));
  for (const y of [1.35, 2.6]) { c.rect(cx - w.hw - 0.02, Y(y), 0.1, 0.04); c.rect(cx + w.hw - 0.08, Y(y), 0.1, 0.04); }
  if (preview) return c;
  return c.packCut();
}

/** the tree outside: recursive paper-cut branches; returns { tex, twigs: [[x, y, size], ...] (metres, card-local) } */
export function treeArt({ preview = false } = {}) {
  const T = ROOM.tree, c = new Cut(T.w, T.h, 150, { seed: 41 });
  const r = rng(4242);
  const twigs = [];
  const branch = (x, y, a, len, wd, depth) => {
    // gently curved tapered limb
    const nodes = [];
    const seg = 5, bend = (r() - 0.5) * 0.5;
    let px = x, py = y, ang = a;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      nodes.push([px, py, Math.max(0.006, wd * (1 - 0.55 * u))]);
      ang += bend / seg + (r() - 0.5) * 0.12;
      px += Math.cos(ang) * len / seg; py += Math.sin(ang) * len / seg;
    }
    c.limb(nodes);
    const [ex, ey] = [nodes[seg][0], nodes[seg][1]];
    // twig anchors along thin branches
    if (depth <= 2) for (let i = 1; i <= seg; i++) if (r() < 0.75) twigs.push([nodes[i][0] + (r() - 0.5) * 0.08, nodes[i][1] + (r() - 0.5) * 0.08, 0.6 + r() * 0.8]);
    if (depth <= 0 || wd < 0.008) { twigs.push([ex, ey, 1]); return; }
    const kids = depth > 5 ? 2 : (r() < 0.6 ? 2 : 3);
    for (let k = 0; k < kids; k++) {
      const spread = 0.35 + r() * 0.45;
      const na = ang + (k - (kids - 1) / 2) * spread + (r() - 0.5) * 0.3 + (ang > Math.PI / 2 ? 0.08 : -0.08);
      branch(ex, ey, na, len * (0.66 + r() * 0.16), wd * (0.62 + r() * 0.1), depth - 1);
    }
  };
  // trunk rising from below on the left, leaning right; the main limbs reach across the window view
  const bx = 2.6;
  c.limb([[bx - 0.2, 0, 0.42], [bx, 1.8, 0.34], [bx + 0.35, 3.6, 0.27]]);
  branch(bx + 0.35, 3.6, Math.PI * 0.32, 2.4, 0.2, 8);
  branch(bx + 0.3, 3.4, Math.PI * 0.58, 2.2, 0.17, 8);
  branch(bx + 0.1, 2.6, Math.PI * 0.12, 2.6, 0.15, 7);
  branch(bx + 0.2, 4.6, Math.PI * 0.45, 2.0, 0.13, 7);
  if (preview) return c;
  return { tex: c.packCut(), twigs };
}

/** far rooftops of Verona seen low through the window (with window ids for time-lapse lights) */
export function roofsArt({ preview = false } = {}) {
  const c = new Cut(120, 22, 18, { seed: 47 });
  for (let x = 0; x < 120;) {
    const w = 5 + c.r() * 8, h = 6 + c.r() * 9;
    c.house(x, w, h, { roof: c.r() < 0.7 ? 'gable' : 'hip', floors: Math.max(2, Math.round(h / 3.2)), lit: 1 });
    x += w + c.r() * 0.6;
  }
  c.tower(52, 4.5, 21, { top: 'swallow', belfry: true });
  c.cypress(20, 9); c.cypress(88, 10);
  if (preview) return c;
  return c.packCut();
}
