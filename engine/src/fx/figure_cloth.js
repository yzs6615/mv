import * as THREE from 'three';
import { rng } from '../core/math.js';

// Cloth of the figures of light, as guide curves solved per frame on the CPU (pure functions of the pose
// and film time — no state). Each garment owns `rows` guide chains of P points in a shared float texture
// (texel (k, row) = position, (PMAX + k, row) = normal, model space). The particle shader interpolates
// between neighbouring guides and adds fine detail (pleats, strands) analytically.
//
// Chains are "follow-the-leader": from an anchor, each segment takes a rest direction modified by the
// dynamics (spin flare, swirl lag, drag from velocity, wind, flutter), then is pushed out of colliders
// (legs, torso, head, seat, floor) and re-normalised to its rest length — so the cloth drapes over a
// forward knee, lies on the back, pools on the floor when she kneels or sits.

export const PMAX = 24;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();

// ---------------------------------------------------------------- colliders (rebuilt each frame from the pose)
const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _cc = new THREE.Vector3(), _cd = new THREE.Vector3();
export class Colliders {
  constructor() { this.caps = []; this.ells = []; this.seat = null; this.floor = 0.004; this.nc = 0; this.ne = 0; }
  reset() { this.nc = 0; this.ne = 0; this.seat = null; }
  /** grp: bitmask — 1 lower body (legs, hips), 2 upper body (torso, arms, head) */
  cap(a, b, r, grp = 3) {
    let c = this.caps[this.nc]; if (!c) c = this.caps[this.nc] = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0, grp: 3 };
    c.a.copy(a); c.b.copy(b); c.r = r; c.grp = grp; this.nc++;
  }
  ell(center, q, r, grp = 3) {
    let e = this.ells[this.ne]; if (!e) e = this.ells[this.ne] = { c: new THREE.Vector3(), q: new THREE.Quaternion(), qi: new THREE.Quaternion(), r: new THREE.Vector3(), grp: 3 };
    e.c.copy(center); e.q.copy(q); e.qi.copy(q).invert(); e.r.set(r[0], r[1], r[2]); e.grp = grp; this.ne++;
  }
  /** push p out of every collider in `mask` (margin m), in place */
  push(p, m = 0, mask = 3) {
    const skipEll = false;
    for (let i = 0; i < this.nc; i++) {
      const c = this.caps[i];
      if (!(c.grp & mask)) continue;
      const ab = _ca.subVectors(c.b, c.a), ap = _cb.subVectors(p, c.a);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(ab.lengthSq(), 1e-9)));
      const q = _cc.copy(c.a).addScaledVector(ab, t);
      const d = _cd.subVectors(p, q); const L = d.length(), R = c.r + m;
      if (L < R) { if (L < 1e-6) d.set(0, 0, 1); else d.multiplyScalar(1 / L); p.copy(q).addScaledVector(d, R); }
    }
    if (!skipEll) for (let i = 0; i < this.ne; i++) {
      const e = this.ells[i];
      if (!(e.grp & mask)) continue;
      const l = _ca.subVectors(p, e.c).applyQuaternion(e.qi);
      const rx = e.r.x + m, ry = e.r.y + m, rz = e.r.z + m;
      const k = Math.sqrt((l.x / rx) ** 2 + (l.y / ry) ** 2 + (l.z / rz) ** 2);
      if (k < 1 && k > 1e-6) { l.multiplyScalar(1 / k); p.copy(l.applyQuaternion(e.q)).add(e.c); }
    }
    const s = this.seat;
    this.support = false;
    if (s && p.x > s.min.x && p.x < s.max.x && p.z > s.min.z && p.z < s.max.z && p.y < s.max.y + 0.002 && p.y > s.max.y - 0.25) { p.y = s.max.y; this.support = true; }
    if (p.y < this.floor + 0.002) { p.y = this.floor; this.support = true; }
    return p;
  }
}

// ---------------------------------------------------------------- shared texture
export class ClothTex {
  constructor(rows) {
    this.rows = Math.max(1, rows);
    this.data = new Float32Array(PMAX * 2 * this.rows * 4);
    this.tex = new THREE.DataTexture(this.data, PMAX * 2, this.rows, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.needsUpdate = true;
  }
  setP(row, k, p) { const i = (row * PMAX * 2 + k) * 4; this.data[i] = p.x; this.data[i + 1] = p.y; this.data[i + 2] = p.z; }
  setN(row, k, n) { const i = (row * PMAX * 2 + PMAX + k) * 4; this.data[i] = n.x; this.data[i + 1] = n.y; this.data[i + 2] = n.z; }
}

/** compute normals for a garment's grid (rows x P), oriented away from `axisFn(p)` */
const _ga = new THREE.Vector3(), _gb = new THREE.Vector3(), _gn = new THREE.Vector3();
function gridNormals(G, wrap, outward) {
  const { rows, P, pts } = G;
  const n = _gn;
  for (let r = 0; r < rows; r++) {
    const rp = wrap ? (r + rows - 1) % rows : Math.max(0, r - 1), rn = wrap ? (r + 1) % rows : Math.min(rows - 1, r + 1);
    for (let k = 0; k < P; k++) {
      const kp = Math.max(0, k - 1), kn = Math.min(P - 1, k + 1);
      const tv = _ga.subVectors(pts[r * P + kn], pts[r * P + kp]);
      const tu = _gb.subVectors(pts[rn * P + k], pts[rp * P + k]);
      n.crossVectors(tv, tu);
      if (n.lengthSq() < 1e-12) n.set(0, 0, 1);
      n.normalize();
      if (outward(pts[r * P + k], n, r, k) < 0) n.negate();
      G.nrm[r * P + k].copy(n);
    }
  }
}

function makeGrid(rows, P) {
  return { rows, P, pts: Array.from({ length: rows * P }, () => new THREE.Vector3()), nrm: Array.from({ length: rows * P }, () => new THREE.Vector3()) };
}

// ---------------------------------------------------------------- Skirt (gown / doublet skirt)
/**
 * profile: [[r, y], ...] rest meridian (absolute model coords at rest, radius in the meridian direction),
 * from the waist to the hem. ellip: [front/back radius factor at the waist, at the hem].
 */
export class Skirt {
  constructor(rig, row0, { M = 48, P = 22, profile, ellip = [0.82, 0.96], vFront = 0, train = 0, pleatK = 16, pleatAmp = 0.012, hemTag = 3, name = 'skirt', stiff = 0 }) {
    this.rig = rig; this.row0 = row0; this.M = M; this.P = Math.min(P, PMAX); this.rows = M; this.name = name;
    this.ellip = ellip; this.vFront = vFront; this.train = train; this.pleatK = pleatK; this.pleatAmp = pleatAmp; this.hemTag = hemTag; this.stiff = stiff; this.mask = 1;
    // arc-length parameterised rest profile in pelvis space (relative to the rest pelvis joint)
    const py = rig.rest[0].y;
    this.prof = profile.map(([r, y]) => [r, y - py]);
    const seg = [];
    let L = 0;
    for (let i = 1; i < this.prof.length; i++) { const l = Math.hypot(this.prof[i][0] - this.prof[i - 1][0], this.prof[i][1] - this.prof[i - 1][1]); seg.push(l); L += l; }
    this.seg = seg; this.L = L;
    this.G = makeGrid(M, this.P);
    this.sup = new Uint8Array(M * this.P);
    // rest radius vs v (for area-weighted sampling)
    this.rAt = (v) => this.profAt(v * this.L)[0];
  }
  profAt(s) { // [r, y, dr, dy] at arc length s
    const p = this.prof;
    for (let i = 0; i < this.seg.length; i++) {
      if (s <= this.seg[i] || i === this.seg.length - 1) {
        const u = Math.min(1, Math.max(0, s / this.seg[i]));
        const dr = (p[i + 1][0] - p[i][0]) / this.seg[i], dy = (p[i + 1][1] - p[i][1]) / this.seg[i];
        return [p[i][0] + (p[i + 1][0] - p[i][0]) * u, p[i][1] + (p[i + 1][1] - p[i][1]) * u, dr, dy];
      }
      s -= this.seg[i];
    }
    return [p[p.length - 1][0], p[p.length - 1][1], 0, -1];
  }

  /** solve guides. sol: solver (W, J), C: colliders, dyn, t */
  solve(sol, C, dyn, t, tex) {
    const rig = this.rig, M = this.M, P = this.P, G = this.G;
    const W0 = sol.W[0], J0 = sol.J[0];
    // pelvis yaw-only frame for the hanging part
    const fwd = _a.set(0, 0, 1).applyQuaternion(W0); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
    const yaw = Math.atan2(fwd.x, fwd.z);
    const spin = dyn.spin || 0;
    const flare = Math.min(1.25, spin * spin * 0.07 + (dyn.flare || 0));
    const vel = dyn.vel, wind = dyn.wind;
    const ripple = dyn.ripple ?? 1;
    const swirlLag = 0.16 * Math.sign(spin) * Math.min(Math.abs(spin), 6) + (dyn.swirl || 0);
    const stride = dyn.stride || 0;
    const p = _b, dir = _c, prev = _d;
    for (let m = 0; m < M; m++) {
      const th = (m / M) * Math.PI * 2;
      const cth = Math.cos(th), sth = Math.sin(th);
      const back = Math.max(0, -cth);
      const Lm = this.L * (1 + this.train * back * back);
      const ds = Lm / (P - 1);
      let onSup = false;
      for (let k = 0; k < P; k++) {
        const v = k / (P - 1);
        const s = Math.min(v * Lm, this.L - 1e-4);
        const [r, y, dr, dy] = this.profAt(s);
        const ef = this.ellip[0] + (this.ellip[1] - this.ellip[0]) * Math.min(1, v * 2.2);
        if (k === 0) {
          // waist ring follows the pelvis completely; the V point dips at the front
          const vdip = this.vFront * Math.max(0, cth) ** 6;
          p.set(sth * r, y - vdip, cth * r * ef).applyQuaternion(W0).add(J0);
          G.pts[m * P].copy(p);
          continue;
        }
        // hanging frame: pelvis tilt fades out below the hips
        const hang = Math.min(1, v * 3.0);
        const thw = th + yaw - swirlLag * v * v; // swirl lag (hem trails the turn)
        const rx = Math.sin(thw), rz = Math.cos(thw) * ef;
        // rest direction in the (radial, up) plane, flare rotates it outward
        const fa = flare * Math.pow(v, 1.1) + (1 - hang) * 0.0;
        const cr = Math.cos(fa), sr = Math.sin(fa);
        let drr = dr * cr - dy * sr, dyy = dr * sr + dy * cr;
        // hem ripple: travelling waves around the hem
        const rip = ripple * v * v * v * (0.07 * Math.sin(3 * th - t * 2.3 + 0.5) + 0.05 * Math.sin(5 * th + t * 1.7) + 0.035 * Math.sin(8 * th - t * 3.1));
        drr += rip;
        dir.set(rx * drr, dyy, rz * drr);
        // pelvis tilt near the top
        if (hang < 1) { _e.set(Math.sin(th) * dr, dy, Math.cos(th) * dr * ef).applyQuaternion(W0); dir.lerp(_e, 1 - hang); }
        // drag from motion, wind, stride sway
        const dk = 0.16 * (dyn.drag ?? 1) * v;
        dir.x -= vel.x * dk; dir.y -= vel.y * dk * 0.3; dir.z -= vel.z * dk;
        dir.addScaledVector(wind, 0.08 * v * v);
        dir.x += Math.sin(stride * Math.PI * 2) * 0.06 * v * v * (dyn.sway ?? 1);
        dir.normalize();
        prev.copy(G.pts[m * P + k - 1]);
        // fabric resting on a support (floor, seat) bunches up instead of spreading out
        const dsk = ds * (onSup ? 0.2 : 1);
        p.copy(prev).addScaledVector(dir, dsk);
        for (let it = 0; it < 2; it++) {
          C.push(p, 0.012 * rig.s, this.mask);
          _e.subVectors(p, prev); const l = _e.length();
          if (l > 1e-6) p.copy(prev).addScaledVector(_e, dsk / l);
        }
        C.push(p, 0.008 * rig.s, this.mask);
        if (C.support) onSup = true;
        this.sup[m * P + k] = onSup ? 1 : 0;
        G.pts[m * P + k].copy(p);
      }
    }
    const axis = _a.copy(J0);
    gridNormals(G, true, (q, n) => { const dx = q.x - axis.x, dz = q.z - axis.z; return dx * n.x + dz * n.z; });
    for (let m = 0; m < M; m++) for (let k = 1; k < P; k++) if (this.sup[m * P + k]) G.nrm[m * P + k].copy(G.nrm[m * P + k - 1]);
    for (let m = 0; m < M; m++) for (let k = 0; k < P; k++) { tex.setP(this.row0 + m, k, G.pts[m * P + k]); tex.setN(this.row0 + m, k, G.nrm[m * P + k]); }
  }

  /** particle attributes for n particles: returns { pos (u, v, off), nrm (row0, rows, P), bon (pleatK, pleatAmp, tag, wrap) } */
  sample(n, R, { hem = 0.12, waist = 0.03 } = {}) {
    const out = { pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), bon: new Float32Array(n * 4) };
    const nh = Math.round(n * hem), nw = Math.round(n * waist);
    // inverse CDF of v by rest radius (area)
    const K = 200, cdf = [0];
    for (let i = 1; i <= K; i++) cdf.push(cdf[i - 1] + this.rAt((i - 0.5) / K));
    for (let i = 0; i <= K; i++) cdf[i] /= cdf[K];
    const vOf = (u) => { let lo = 0, hi = K; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m; else hi = m; } return (lo + (u - cdf[lo]) / Math.max(1e-9, cdf[hi] - cdf[lo])) / K; };
    for (let i = 0; i < n; i++) {
      let u = R(), v, off = (R() - 0.5) * 0.006 * this.rig.s, tag = 1;
      if (i < nh) { v = 1 - Math.pow(R(), 2) * 0.03; tag = this.hemTag; off *= 0.3; }
      else if (i < nh + nw) { v = R() * 0.02; tag = 3; off *= 0.3; }
      else v = vOf(R());
      out.pos.set([u, v, off], i * 3);
      out.nrm.set([this.row0, this.rows, this.P], i * 3);
      out.bon.set([this.pleatK, this.pleatAmp * this.rig.s, tag, 1], i * 4);
    }
    return out;
  }
  hemPoint(theta, out) { // world-free: model-space point on the hem at angle theta (0 = front)
    const m = Math.round(((theta / (Math.PI * 2)) % 1 + 1) % 1 * this.M) % this.M;
    return out.copy(this.G.pts[m * this.P + this.P - 1]);
  }
}

// ---------------------------------------------------------------- Hair sheet (Juliet)
export class Hair {
  constructor(rig, row0, { S = 20, P = 16, length = 0.6 } = {}) {
    this.rig = rig; this.row0 = row0; this.rows = S; this.P = Math.min(P, PMAX); this.L = length * rig.s; this.name = 'hair';
    this.G = makeGrid(S, this.P);
    const s = rig.s, hc = new THREE.Vector3(0, 1.57 * s, -0.016 * s);
    this.anchors = []; this.dirs = [];
    for (let i = 0; i < S; i++) {
      const u = i / (S - 1);
      const b = (u - 0.5) * 2 * 1.45; // -83..83 deg around the back of the head
      const yb = 1.575 - 0.05 * Math.pow(Math.abs(u - 0.5) * 2, 1.6);
      const a = new THREE.Vector3(Math.sin(b) * 0.083 * s, yb * s, -Math.cos(b) * 0.096 * s - 0.022 * s);
      this.anchors.push(a);
      this.dirs.push(new THREE.Vector3(Math.sin(b) * 0.3, -1, -Math.cos(b) * 0.45 - 0.25).normalize());
    }
    this.hc = hc;
  }
  solve(sol, C, dyn, t, tex) {
    const rig = this.rig, S = this.rows, P = this.P, G = this.G, I = rig.idx;
    const Wh = sol.W[I.head], Jh = sol.J[I.head], rh = rig.rest[I.head];
    const ds = this.L / (P - 1);
    const vel = dyn.vel, spin = dyn.spin || 0;
    const p = _b, dir = _c, prev = _d;
    const chestC = _e;
    const torsoAxis = new THREE.Vector3().copy(sol.J[I.spine]);
    for (let i = 0; i < S; i++) {
      const u = i / (S - 1);
      p.subVectors(this.anchors[i], rh).applyQuaternion(Wh).add(Jh);
      G.pts[i * P].copy(p);
      const d0 = _a.copy(this.dirs[i]).applyQuaternion(Wh);
      const side = (u - 0.5) * 2;
      for (let k = 1; k < P; k++) {
        const v = k / (P - 1);
        // from scalp tangent to gravity
        const g = Math.min(1, v * 3.2);
        dir.copy(d0).multiplyScalar(1 - g).add(_e.set(0, -1, 0).multiplyScalar(g));
        // outward spread at the sides, lag from motion, centrifugal swing in spins, idle sway
        const sway = (dyn.sway ?? 1) * (0.05 * Math.sin(t * 1.1 + u * 2.3) + 0.03 * Math.sin(t * 2.3 + u * 5.1));
        const dk = 0.32 * (dyn.drag ?? 1) * v;
        dir.x -= vel.x * dk; dir.z -= vel.z * dk; dir.y += Math.min(0.6, Math.hypot(vel.x, vel.z) * 0.12) * v;
        // spin: swing outward (away from the body axis) and lag
        const rx = p.x - torsoAxis.x, rz = p.z - torsoAxis.z, rl = Math.hypot(rx, rz) + 1e-4;
        const cf = Math.min(1.2, spin * spin * 0.06) * v;
        dir.x += (rx / rl) * cf + (rz / rl) * spin * 0.05 * v; dir.z += (rz / rl) * cf - (rx / rl) * spin * 0.05 * v;
        dir.x += sway * v + dyn.wind.x * 0.1 * v; dir.z += dyn.wind.z * 0.1 * v + side * 0.0;
        dir.normalize();
        prev.copy(G.pts[i * P + k - 1]);
        p.copy(prev).addScaledVector(dir, ds);
        for (let it = 0; it < 2; it++) {
          C.push(p, 0.012 * rig.s, 2);
          _e.subVectors(p, prev); const l = _e.length();
          if (l > 1e-6) p.copy(prev).addScaledVector(_e, ds / l);
        }
        C.push(p, 0.008 * rig.s, 2);
        G.pts[i * P + k].copy(p);
      }
    }
    const back = sol.J[I.chest];
    gridNormals(G, false, (q, n) => (q.x - back.x) * n.x + (q.z - back.z) * n.z + (q.y - back.y) * n.y * 0.2);
    for (let i = 0; i < S; i++) for (let k = 0; k < P; k++) { tex.setP(this.row0 + i, k, G.pts[i * P + k]); tex.setN(this.row0 + i, k, G.nrm[i * P + k]); }
  }
  sample(n, R) {
    const out = { pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), bon: new Float32Array(n * 4) };
    const strands = 72;
    for (let i = 0; i < n; i++) {
      const st = Math.floor(R() * strands);
      const u = (st + 0.5 + (R() - 0.5) * 0.18) / strands;
      // fewer particles toward the tips (taper)
      // density follows the sheet width (narrow at the scalp, wide over the back), thinning at the tips
      let v = Math.min(1, (-0.3 + Math.sqrt(0.09 + 2.47 * R())) / 1.3);
      if (v > 0.8 && R() < (v - 0.8) * 2.5) v = 0.8 * R() + 0.2;
      out.pos.set([Math.min(0.999, Math.max(0, u)), v, (R() - 0.5) * 0.004 * this.rig.s], i * 3);
      out.nrm.set([this.row0, this.rows, this.P], i * 3);
      out.bon.set([st, 0.0035 * this.rig.s, 2, 0], i * 4);
    }
    return out;
  }
}

// ---------------------------------------------------------------- Cape (Romeo)
export class Cape {
  constructor(rig, row0, { S = 17, P = 14, length = 0.62 } = {}) {
    this.rig = rig; this.row0 = row0; this.rows = S; this.P = Math.min(P, PMAX); this.name = 'cape';
    this.G = makeGrid(S, this.P);
    const s = rig.s;
    this.anchors = []; this.lens = [];
    // arc over the shoulders: front of the left shoulder -> behind the neck -> front of the right shoulder
    for (let i = 0; i < S; i++) {
      const u = i / (S - 1);
      const b = (u - 0.5) * 2 * 2.0; // -115..115 deg (0 = back)
      const rx = 0.178 * s, rz = 0.105 * s;
      const a = new THREE.Vector3(Math.sin(b) * rx, (1.488 - 0.018 * Math.abs(Math.sin(b))) * s, -Math.cos(b) * rz - 0.03 * s);
      this.anchors.push(a);
      const back = Math.cos(b);
      this.lens.push(length * s * (0.42 + 0.58 * Math.max(0, back) ** 0.7));
    }
  }
  solve(sol, C, dyn, t, tex) {
    const rig = this.rig, S = this.rows, P = this.P, G = this.G, I = rig.idx;
    const Wc = sol.W[I.chest], Jc = sol.J[I.chest], rc = rig.rest[I.chest];
    const vel = dyn.vel, speed = Math.hypot(vel.x, vel.z);
    const gust = (dyn.gust ?? 0) + speed * 0.5 + dyn.wind.length() * 0.6;
    const p = _b, dir = _c, prev = _d;
    const bodyC = sol.J[I.spine];
    for (let i = 0; i < S; i++) {
      const u = i / (S - 1);
      p.subVectors(this.anchors[i], rc).applyQuaternion(Wc).add(Jc);
      G.pts[i * P].copy(p);
      const ds = this.lens[i] / (P - 1);
      // initial direction: outward over the shoulder, then down
      const ox = p.x - bodyC.x, oz = p.z - bodyC.z, ol = Math.hypot(ox, oz) + 1e-4;
      for (let k = 1; k < P; k++) {
        const v = k / (P - 1);
        const g = Math.min(1, v * 2.5);
        dir.set((ox / ol) * (1 - g) * 0.9, -0.35 - g * 0.65, (oz / ol) * (1 - g) * 0.9);
        // drag: streams behind when moving; flutter: travelling waves (stronger with speed/wind)
        // drag grows with speed^2: a walk barely stirs it, a run streams it out behind
        const dk = 0.09 * (dyn.drag ?? 1) * v * (1 + speed * 0.35);
        dir.x -= vel.x * dk; dir.z -= vel.z * dk; dir.y += Math.min(0.5, speed * speed * 0.025) * v;
        const fl = Math.sin(v * 7.5 - t * (4 + speed * 2.5) + u * 4.2) * 0.12 + Math.sin(v * 4.1 - t * 2.3 + u * 7.7) * 0.07;
        const amp = (0.12 + gust * 0.5) * v;
        dir.x += (ox / ol) * fl * amp + dyn.wind.x * 0.12 * v; dir.z += (oz / ol) * fl * amp + dyn.wind.z * 0.12 * v;
        dir.y += fl * amp * 0.4;
        const spin = dyn.spin || 0;
        dir.x += (ox / ol) * Math.min(1, spin * spin * 0.05) * v; dir.z += (oz / ol) * Math.min(1, spin * spin * 0.05) * v;
        dir.normalize();
        prev.copy(G.pts[i * P + k - 1]);
        p.copy(prev).addScaledVector(dir, ds);
        for (let it = 0; it < 2; it++) {
          C.push(p, 0.03 * rig.s);
          _e.subVectors(p, prev); const l = _e.length();
          if (l > 1e-6) p.copy(prev).addScaledVector(_e, ds / l);
        }
        C.push(p, 0.024 * rig.s);
        G.pts[i * P + k].copy(p);
      }
    }
    gridNormals(G, false, (q, n) => (q.x - bodyC.x) * n.x + (q.z - bodyC.z) * n.z);
    for (let i = 0; i < S; i++) for (let k = 0; k < P; k++) { tex.setP(this.row0 + i, k, G.pts[i * P + k]); tex.setN(this.row0 + i, k, G.nrm[i * P + k]); }
  }
  sample(n, R) {
    const out = { pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), bon: new Float32Array(n * 4) };
    const nh = Math.round(n * 0.1);
    for (let i = 0; i < n; i++) {
      const u = R();
      let v = Math.sqrt(R()) * 0.98 + 0.02 * R(), tag = 1;
      if (i < nh) { v = 1 - R() * 0.025; tag = 3; }
      out.pos.set([u, v, (R() - 0.5) * 0.004 * this.rig.s], i * 3);
      out.nrm.set([this.row0, this.rows, this.P], i * 3);
      out.bon.set([7, 0.008 * this.rig.s, tag, 0], i * 4);
    }
    return out;
  }
}
