import * as THREE from 'three';

// Procedural skeleton for the figures of light.
// Model space: metres, y up, the figure faces +z, its LEFT side is +x, origin on the ground between the feet.
// Every bone's rest frame is the identity (axes = model axes), so a bone's world rotation maps rest geometry
// to posed geometry directly and the skinning matrix is  S = T(J) * R(W) * T(-rest).
// The rest pose is an "A-pose": arms 35 deg out from the body, palms facing the thighs, thumbs forward.

export const ARM_REST = 35 * Math.PI / 180;
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const SIDES = [['L', 1], ['R', -1]];

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const toV = (a, out = new THREE.Vector3()) => (a.isVector3 ? out.copy(a) : out.set(a[0], a[1], a[2]));
/** rotation whose columns are (a, h, a x h) */
const _bq = new THREE.Vector3(), _bm = new THREE.Matrix4();
export function basisQuat(a, h, out) { _bq.crossVectors(a, h); _bm.makeBasis(a, h, _bq); return out.setFromRotationMatrix(_bm); }
export function eulerQ(x, y, z, out = new THREE.Quaternion()) { _e.set(x, y, z, 'YXZ'); return out.setFromEuler(_e); }
export function axisQ(axis, ang, out = new THREE.Quaternion()) { return out.setFromAxisAngle(axis, ang); }
/** swing given as a rotation vector (exponential map), no gimbal trouble for |w| < pi */
export function expQ(wx, wy, wz, out = new THREE.Quaternion()) {
  const a = Math.hypot(wx, wy, wz);
  if (a < 1e-7) return out.identity();
  return out.setFromAxisAngle(_d.set(wx / a, wy / a, wz / a), a);
}

// --------------------------------------------------------------------------------------------
// Skeleton construction
// --------------------------------------------------------------------------------------------

// reference proportions (metres) — male at 1.80 m, female at 1.68 m (~7.4-7.5 heads)
const PROP = {
  m: {
    ref: 1.80,
    pelvis: [0, 0.955, 0], spine: [0, 1.065, -0.012], chest: [0, 1.225, -0.02], neck: [0, 1.468, -0.036], head: [0, 1.592, -0.016],
    clav: [0.024, 1.448, 0.016], sh: [0.184, 1.438, -0.026], upper: 0.322, fore: 0.262,
    hip: [0.088, 0.955, 0], knee: [0.094, 0.515, 0.004], ankle: [0.1, 0.082, -0.022], ball: [0.11, 0.026, 0.128], toe: [0.116, 0.022, 0.205],
    hand: 1.0, finger: 1.0,
  },
  f: {
    ref: 1.68,
    pelvis: [0, 0.895, 0], spine: [0, 0.99, -0.012], chest: [0, 1.135, -0.02], neck: [0, 1.368, -0.032], head: [0, 1.482, -0.014],
    clav: [0.021, 1.35, 0.013], sh: [0.158, 1.343, -0.024], upper: 0.292, fore: 0.232,
    hip: [0.084, 0.895, 0], knee: [0.088, 0.48, 0.002], ankle: [0.09, 0.076, -0.02], ball: [0.098, 0.022, 0.116], toe: [0.103, 0.018, 0.176],
    hand: 0.89, finger: 0.86,
  },
};

// finger table (male reference hand, wrist-relative, in the hand frame f = along fingers, t = thumb side, n = palm normal)
//  base: [along f, along t, along n], fan: tilt of the finger direction toward t, len: phalanx lengths, r: radii (base..tip)
const FTAB = {
  thumb:  { base: [0.026, 0.024, 0.014], len: [0.046, 0.033, 0.029], r: [0.0128, 0.0112, 0.0102, 0.0094] },
  index:  { base: [0.094, 0.025, 0.002], fan: 0.10, len: [0.043, 0.025, 0.021], r: [0.0102, 0.0092, 0.0085, 0.0076] },
  middle: { base: [0.097, 0.005, 0.002], fan: 0.0, len: [0.047, 0.029, 0.023], r: [0.0106, 0.0096, 0.0088, 0.0078] },
  ring:   { base: [0.092, -0.014, 0.002], fan: -0.07, len: [0.044, 0.027, 0.022], r: [0.0098, 0.0089, 0.0082, 0.0073] },
  pinky:  { base: [0.083, -0.031, 0.001], fan: -0.16, len: [0.034, 0.021, 0.02], r: [0.0086, 0.0078, 0.0072, 0.0064] },
};

/**
 * buildRig('m'|'f', heightMetres) -> rig
 * rig.names[i], rig.parent[i], rig.rest[i] (joint rest position), rig.idx[name], rig.site{name:{bone,pos}}
 * rig.arm[side] / rig.leg[side]: rest axes for IK, rig.hand[side]: hand frame, rig.finger[side][k]: finger meta
 */
export function buildRig(sex, H) {
  const P = PROP[sex === 'f' ? 'f' : 'm'];
  const s = H / P.ref;
  const S = (a) => new THREE.Vector3(a[0] * s, a[1] * s, a[2] * s);
  const rig = { sex: sex === 'f' ? 'f' : 'm', H, s, names: [], parent: [], rest: [], idx: {}, site: {}, arm: {}, leg: {}, hand: {}, finger: {} };
  const add = (name, par, pos) => {
    rig.idx[name] = rig.names.length; rig.names.push(name); rig.parent.push(par == null ? -1 : rig.idx[par]); rig.rest.push(pos.clone());
    return rig.idx[name];
  };
  const site = (name, bone, pos) => { rig.site[name] = { bone: rig.idx[bone], pos: pos.clone() }; };
  add('pelvis', null, S(P.pelvis));
  add('spine', 'pelvis', S(P.spine));
  add('chest', 'spine', S(P.chest));
  add('neck', 'chest', S(P.neck));
  add('head', 'neck', S(P.head));
  site('headTop', 'head', new THREE.Vector3(0, H, S(P.head).z));
  site('eyes', 'head', new THREE.Vector3(0, H * 0.935, S(P.head).z + 0.075 * s));
  site('chestFront', 'chest', S([0, P.chest[1] + 0.07, 0.11]));
  site('back', 'chest', S([0, P.chest[1] + 0.05, -0.13]));
  const hs = s * P.hand, fs = s * P.finger;
  for (const [side, sg] of SIDES) {
    const sh = S([sg * P.sh[0], P.sh[1], P.sh[2]]);
    add('clav' + side, 'chest', S([sg * P.clav[0], P.clav[1], P.clav[2]]));
    add('upperArm' + side, 'clav' + side, sh);
    const d = new THREE.Vector3(sg * Math.sin(ARM_REST), -Math.cos(ARM_REST), 0);
    const el = sh.clone().addScaledVector(d, P.upper * s);
    add('foreArm' + side, 'upperArm' + side, el);
    const wr = el.clone().addScaledVector(d, P.fore * s);
    add('hand' + side, 'foreArm' + side, wr);
    // hand frame: f along the fingers, n palm normal (medial at rest), t thumb side (anterior)
    const f = d.clone(), n = new THREE.Vector3(-sg * Math.cos(ARM_REST), -Math.sin(ARM_REST), 0), t = new THREE.Vector3(0, 0, 1);
    const hp = (a, b, c) => wr.clone().addScaledVector(f, a * hs).addScaledVector(t, b * hs).addScaledVector(n, c * hs);
    rig.hand[side] = { f, n, t, wrist: wr.clone(), flexAxis: new THREE.Vector3().crossVectors(f, n).normalize(), scale: hs };
    rig.arm[side] = {
      sg, up: rig.idx['upperArm' + side], fore: rig.idx['foreArm' + side], hand: rig.idx['hand' + side], clav: rig.idx['clav' + side],
      L1: P.upper * s, L2: P.fore * s, a: d.clone(), h: new THREE.Vector3().crossVectors(d, Z).normalize(),
      neutral: new THREE.Quaternion().setFromAxisAngle(Z, -sg * ARM_REST), // rest -> hanging straight down
    };
    rig.finger[side] = [];
    for (const name of FINGERS) {
      const T = FTAB[name];
      const base = hp(...T.base);
      let dir;
      if (name === 'thumb') dir = new THREE.Vector3().addScaledVector(f, 0.62).addScaledVector(t, 0.66).addScaledVector(n, 0.42).normalize();
      else dir = f.clone().addScaledVector(t, T.fan).normalize();
      const ids = [];
      let p = base.clone();
      for (let k = 0; k < 3; k++) {
        ids.push(add(name + (k + 1) + side, k === 0 ? 'hand' + side : name + k + side, p));
        p = p.clone().addScaledVector(dir, T.len[k] * fs);
      }
      site(name + 'Tip' + side, name + '3' + side, p.clone().addScaledVector(dir, T.r[3] * fs * 0.6));
      // flexion axis: rotating dir toward the palm normal; for the thumb, toward the palm and across it
      let flexAxis, spreadAxis;
      if (name === 'thumb') {
        const toward = n.clone().multiplyScalar(0.75).addScaledVector(t, -0.66).normalize();
        flexAxis = new THREE.Vector3().crossVectors(dir, toward).normalize();
        spreadAxis = new THREE.Vector3().crossVectors(flexAxis, dir).normalize();
      } else {
        flexAxis = new THREE.Vector3().crossVectors(dir, n).normalize();
        spreadAxis = n.clone();
      }
      rig.finger[side].push({ name, ids, dir, base, flexAxis, spreadAxis, len: T.len.map((l) => l * fs), r: T.r.map((r) => r * fs), fan: T.fan || 0 });
    }
    site('palm' + side, 'hand' + side, hp(0.055, 0.0, 0.03));
    site('ring' + side, 'hand' + side, hp(0.085, 0.045, 0.045)); // held between thumb and index when 'hold'
    // legs
    const hip = S([sg * P.hip[0], P.hip[1], P.hip[2]]), knee = S([sg * P.knee[0], P.knee[1], P.knee[2]]);
    const ank = S([sg * P.ankle[0], P.ankle[1], P.ankle[2]]), ball = S([sg * P.ball[0], P.ball[1], P.ball[2]]);
    add('thigh' + side, 'pelvis', hip);
    add('shin' + side, 'thigh' + side, knee);
    add('foot' + side, 'shin' + side, ank);
    add('toe' + side, 'foot' + side, ball);
    site('toeTip' + side, 'toe' + side, S([sg * P.toe[0], P.toe[1], P.toe[2]]));
    site('heel' + side, 'foot' + side, S([sg * P.ankle[0], 0.02, P.ankle[2] - 0.04]));
    const a = new THREE.Vector3().subVectors(knee, hip).normalize();
    const b = new THREE.Vector3().subVectors(ank, knee).normalize();
    const hA = new THREE.Vector3().crossVectors(a, new THREE.Vector3(0, 0, -1)).normalize();
    const hB = hA.clone().addScaledVector(b, -hA.dot(b)).normalize();
    rig.leg[side] = { sg, th: rig.idx['thigh' + side], sh: rig.idx['shin' + side], ft: rig.idx['foot' + side], toe: rig.idx['toe' + side],
      L1: hip.distanceTo(knee), L2: knee.distanceTo(ank), a, b, hA, hB, ankleRest: ank.clone(), hipRest: hip.clone() };
  }
  // fore arm rest axes (same line as upper arm at rest)
  for (const [side] of SIDES) { const A = rig.arm[side]; A.b = A.a.clone(); A.hB = A.h.clone(); }
  rig.nb = rig.names.length;
  rig.rest0 = rig.rest.map((p) => p.clone());
  // useful measurements
  rig.footLen = S(P.toe).z - (S(P.ankle).z - 0.04 * s);
  rig.legLen = rig.leg.L.L1 + rig.leg.L.L2;
  return rig;
}

// --------------------------------------------------------------------------------------------
// Pose specification (what presets produce) and resolved poses (local rotations; blendable)
// --------------------------------------------------------------------------------------------

export function armSpec() { return { flex: 0, abd: 0, twist: 0, elbow: 0.15, pron: 0, wflex: 0, wdev: 0, clav: [0, 0], ik: null, handQ: null, handBlend: 1 }; }
export function legSpec() { return { flex: 0, abd: 0, twist: 0, knee: 0, ankle: 0, toe: 0, ik: null, footQ: null }; }
export function handSpec() { return { curl: [0.25, 0.25, 0.28, 0.32, 0.36], spread: 0.15, thumbOpp: 0.15, thumbCurl: 0.2 }; }

export function newSpec(rig) {
  return {
    root: rig.rest[0].clone(), rootQ: new THREE.Quaternion(),
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    arm: { L: armSpec(), R: armSpec() }, leg: { L: legSpec(), R: legSpec() }, hand: { L: handSpec(), R: handSpec() },
    joints: null,
    dyn: newDyn(),
  };
}

export function newDyn() {
  return { vel: new THREE.Vector3(), spin: 0, wind: new THREE.Vector3(), flare: 0, swirl: 0, sway: 1, ripple: 1, drag: 1, gust: 0, seat: null, stride: 0 };
}

export class Pose {
  constructor(nb) { this.local = Array.from({ length: nb }, () => new THREE.Quaternion()); this.root = new THREE.Vector3(); this.dyn = newDyn(); }
  copy(o) { for (let i = 0; i < this.local.length; i++) this.local[i].copy(o.local[i]); this.root.copy(o.root); copyDyn(this.dyn, o.dyn); return this; }
  blend(a, b, m) {
    for (let i = 0; i < this.local.length; i++) this.local[i].slerpQuaternions(a.local[i], b.local[i], m);
    this.root.lerpVectors(a.root, b.root, m);
    const A = a.dyn, B = b.dyn, D = this.dyn;
    D.vel.lerpVectors(A.vel, B.vel, m); D.wind.lerpVectors(A.wind, B.wind, m);
    for (const k of ['spin', 'flare', 'swirl', 'sway', 'ripple', 'drag', 'gust', 'stride']) D[k] = A[k] + (B[k] - A[k]) * m;
    D.seat = m < 0.5 ? A.seat : B.seat;
    return this;
  }
}
function copyDyn(D, A) {
  D.vel.copy(A.vel); D.wind.copy(A.wind);
  for (const k of ['spin', 'flare', 'swirl', 'sway', 'ripple', 'drag', 'gust', 'stride']) D[k] = A[k];
  D.seat = A.seat;
}

// --------------------------------------------------------------------------------------------
// Solver: spec -> Pose (local quaternions), with FK of the partial chain for IK
// --------------------------------------------------------------------------------------------

/** two-bone IK in a plane: returns middle joint into `mid`, reachable end into `end` (soft limit near full extension) */
export function twoBone(S, T, L1, L2, pole, mid, end) {
  const dir = _a.subVectors(T, S);
  let d = dir.length();
  if (d < 1e-6) { dir.set(0, -1, 0); d = 1e-6; } else dir.multiplyScalar(1 / d);
  const Lmax = L1 + L2, Lmin = Math.abs(L1 - L2) + 1e-4;
  // soft IK: approach full extension asymptotically (no knee/elbow snap)
  const soft = 0.012 * Lmax, ds = Lmax - soft;
  if (d > ds) d = ds + soft * (1 - Math.exp(-(d - ds) / soft));
  d = Math.max(Lmin, Math.min(d, Lmax - 1e-5));
  const ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  // perpendicular toward the pole
  const pp = _b.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (pp.lengthSq() < 1e-10) pp.set(0, 0, 1).addScaledVector(dir, -dir.z);
  pp.normalize();
  mid.copy(S).addScaledVector(dir, L1 * ca).addScaledVector(pp, L1 * sa);
  end.copy(S).addScaledVector(dir, d);
  return sa;
}

export class Solver {
  constructor(rig) {
    this.rig = rig;
    const nb = rig.nb;
    this.W = Array.from({ length: nb }, () => new THREE.Quaternion());
    this.J = Array.from({ length: nb }, () => new THREE.Vector3());
    this.tmp = { mid: new THREE.Vector3(), end: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), h: new THREE.Vector3(), pole: new THREE.Vector3(),
      q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(), qi: new THREE.Quaternion() };
  }

  /** set local rotation of bone i and propagate its world transform (parent must be done) */
  fk(pose, i, q) {
    const rig = this.rig, p = rig.parent[i];
    pose.local[i].copy(q);
    if (p < 0) { this.W[i].copy(q); this.J[i].copy(pose.root); return; }
    this.W[i].multiplyQuaternions(this.W[p], q);
    this.J[i].subVectors(rig.rest[i], rig.rest[p]).applyQuaternion(this.W[p]).add(this.J[p]);
  }

  /** world rotation -> local, given parent world */
  localFromWorld(i, Wq, out) { const p = this.rig.parent[i]; return out.copy(this.W[p]).invert().multiply(Wq); }

  solve(sp, pose) {
    const rig = this.rig, I = rig.idx, T = this.tmp;
    pose.root.copy(sp.root);
    this.fk(pose, 0, sp.rootQ);
    this.fk(pose, I.spine, eulerQ(...sp.spine, T.q1));
    this.fk(pose, I.chest, eulerQ(...sp.chest, T.q1));
    this.fk(pose, I.neck, eulerQ(...sp.neck, T.q1));
    this.fk(pose, I.head, eulerQ(...sp.head, T.q1));
    for (const [side, sg] of SIDES) this.solveArm(sp, pose, side, sg);
    for (const [side, sg] of SIDES) this.solveLeg(sp, pose, side, sg);
    if (sp.joints) this.applyJoints(sp.joints, pose);
    copyDyn(pose.dyn, sp.dyn);
    return pose;
  }

  applyJoints(joints, pose) {
    // additive local euler offsets (radians), applied after the preset; recompute world transforms
    const rig = this.rig;
    for (const name in joints) {
      const i = rig.idx[name]; if (i == null) continue;
      const j = joints[name];
      pose.local[i].multiply(eulerQ(j[0] || 0, j[1] || 0, j[2] || 0, this.tmp.q3));
    }
    this.forward(pose);
  }

  /** full FK from local rotations (fills W, J) */
  forward(pose) {
    const rig = this.rig;
    for (let i = 0; i < rig.nb; i++) {
      const p = rig.parent[i];
      if (p < 0) { this.W[i].copy(pose.local[i]); this.J[i].copy(pose.root); continue; }
      this.W[i].multiplyQuaternions(this.W[p], pose.local[i]);
      this.J[i].subVectors(rig.rest[i], rig.rest[p]).applyQuaternion(this.W[p]).add(this.J[p]);
    }
  }

  solveArm(sp, pose, side, sg) {
    const rig = this.rig, A = rig.arm[side], a = sp.arm[side], T = this.tmp, I = rig.idx;
    let clavE = a.clav[0], clavF = a.clav[1];
    if (a.ik) {
      // shoulder girdle follows high / far reaches (scapulohumeral rhythm)
      const shRest = _c.subVectors(rig.rest[A.up], rig.rest[I.chest]).applyQuaternion(this.W[I.chest]).add(this.J[I.chest]);
      const to = _d.subVectors(a.ik.target, shRest);
      const len = to.length() + 1e-6;
      const up = to.y / len; // -1 hanging .. 1 straight up
      clavE += Math.max(0, up + 0.15) * 0.26;
      const fw = _b.set(0, 0, 1).applyQuaternion(this.W[I.chest]).dot(to) / len;
      clavF += Math.max(0, fw) * Math.min(1, len / (A.L1 + A.L2)) * 0.18;
    }
    // clavicle: elevation about the forward axis, protraction about the vertical axis
    const qc = T.q1.setFromAxisAngle(Z, sg * clavE);
    qc.multiply(T.q2.setFromAxisAngle(Y, -sg * clavF));
    this.fk(pose, A.clav, qc);
    if (a.ik) {
      const S = this.J[A.up].subVectors(rig.rest[A.up], rig.rest[A.clav]).applyQuaternion(this.W[A.clav]).add(this.J[A.clav]);
      const pole = T.pole.copy(a.ik.pole || T.pole.set(sg * 0.35, -0.55, -1)).normalize();
      twoBone(S, a.ik.target, A.L1, A.L2, pole, T.mid, T.end);
      const ap = T.a.subVectors(T.mid, S).normalize();
      const bp = T.b.subVectors(T.end, T.mid).normalize();
      const hp = T.h.crossVectors(ap, bp);
      // near-straight: use the pole-defined plane
      hp.addScaledVector(_c.crossVectors(pole, ap), 0.02);
      if (hp.lengthSq() < 1e-10) hp.copy(A.h);
      hp.normalize();
      const Wu = basisQuat(ap, hp, T.q1).multiply(basisQuat(A.a, A.h, T.q2).invert());
      this.fk(pose, A.up, this.localFromWorld(A.up, Wu, T.q3));
      const hb = _c.copy(hp).addScaledVector(bp, -hp.dot(bp)).normalize();
      const Wf = basisQuat(bp, hb, T.q1).multiply(basisQuat(A.b, A.hB, T.q2).invert());
      this.fk(pose, A.fore, this.localFromWorld(A.fore, Wf, T.q3));
    } else {
      // anatomical FK relative to the chest: swing (flex forward / abd outward) + twist, from the hanging arm
      const q = expQ(-a.flex, 0, sg * a.abd, T.q1).multiply(T.q2.setFromAxisAngle(Y, sg * a.twist));
      const Wu = T.q3.copy(this.W[I.chest]).multiply(q).multiply(A.neutral);
      this.fk(pose, A.up, this.localFromWorld(A.up, Wu, T.q2));
      this.fk(pose, A.fore, T.q1.setFromAxisAngle(A.h, a.elbow));
    }
    // wrist / hand
    const H = rig.hand[side];
    const q = T.q1.setFromAxisAngle(H.f, sg * a.pron);
    q.multiply(T.q2.setFromAxisAngle(H.flexAxis, a.wflex)).multiply(T.q2.setFromAxisAngle(H.n, a.wdev));
    if (a.handQ) {
      const hb = a.handBlend ?? 1;
      const ql = this.localFromWorld(A.hand, a.handQ, T.q3);
      if (hb >= 1) q.copy(ql); else q.slerp(ql, Math.max(0, hb));
    }
    this.fk(pose, A.hand, q);
    this.solveFingers(sp.hand[side], pose, side);
  }

  solveFingers(h, pose, side) {
    const rig = this.rig, T = this.tmp;
    const F = rig.finger[side];
    for (let k = 0; k < 5; k++) {
      const fi = F[k];
      const c = Array.isArray(h.curl) ? h.curl[k] : h.curl;
      if (k === 0) {
        const opp = h.thumbOpp ?? 0.15, tc = h.thumbCurl ?? c;
        // CMC: opposition swings the thumb across the palm; MCP/IP flex
        const q0 = T.q1.setFromAxisAngle(rig.hand[side].f, -(side === 'L' ? 1 : -1) * opp * 0.9);
        q0.multiply(T.q2.setFromAxisAngle(fi.flexAxis, tc * 0.35 + opp * 0.25));
        this.fk(pose, fi.ids[0], q0);
        this.fk(pose, fi.ids[1], T.q1.setFromAxisAngle(fi.flexAxis, tc * 0.75));
        this.fk(pose, fi.ids[2], T.q1.setFromAxisAngle(fi.flexAxis, tc * 0.95));
      } else {
        const spr = (h.spread ?? 0.15) * [0, 0.22, 0.0, -0.18, -0.36][k];
        // natural cascade: the PIP leads, MCP and DIP follow (a relaxed hand curls in a soft spiral)
        const q0 = T.q1.setFromAxisAngle(fi.spreadAxis, spr).multiply(T.q2.setFromAxisAngle(fi.flexAxis, c * 1.15));
        this.fk(pose, fi.ids[0], q0);
        this.fk(pose, fi.ids[1], T.q1.setFromAxisAngle(fi.flexAxis, c * 1.55));
        this.fk(pose, fi.ids[2], T.q1.setFromAxisAngle(fi.flexAxis, c * 0.9));
      }
    }
  }

  solveLeg(sp, pose, side, sg) {
    const rig = this.rig, Lg = rig.leg[side], l = sp.leg[side], T = this.tmp;
    if (l.ik) {
      const S = this.J[Lg.th].subVectors(rig.rest[Lg.th], rig.rest[0]).applyQuaternion(this.W[0]).add(this.J[0]);
      const pole = T.pole.copy(l.ik.pole || T.pole.set(sg * 0.12, 0, 1)).normalize();
      twoBone(S, l.ik.ankle, Lg.L1, Lg.L2, pole, T.mid, T.end);
      const ap = T.a.subVectors(T.mid, S).normalize();
      const bp = T.b.subVectors(T.end, T.mid).normalize();
      const hp = T.h.crossVectors(ap, bp);
      hp.addScaledVector(_c.crossVectors(pole, ap), 0.02);
      if (hp.lengthSq() < 1e-10) hp.copy(Lg.hA);
      hp.normalize();
      const ha = _c.copy(hp).addScaledVector(ap, -hp.dot(ap)).normalize();
      const Wt = basisQuat(ap, ha, T.q1).multiply(basisQuat(Lg.a, Lg.hA, T.q2).invert());
      this.fk(pose, Lg.th, this.localFromWorld(Lg.th, Wt, T.q3));
      const hb = _c.copy(hp).addScaledVector(bp, -hp.dot(bp)).normalize();
      const Ws = basisQuat(bp, hb, T.q1).multiply(basisQuat(Lg.b, Lg.hB, T.q2).invert());
      this.fk(pose, Lg.sh, this.localFromWorld(Lg.sh, Ws, T.q3));
    } else {
      const q = expQ(-l.flex, 0, sg * l.abd, T.q1).multiply(T.q2.setFromAxisAngle(Y, sg * l.twist));
      this.fk(pose, Lg.th, this.localFromWorld(Lg.th, T.q3.copy(this.W[0]).multiply(q), T.q2));
      this.fk(pose, Lg.sh, T.q1.setFromAxisAngle(X, l.knee));
    }
    if (l.footQ) this.fk(pose, Lg.ft, this.localFromWorld(Lg.ft, l.footQ, T.q1));
    else this.fk(pose, Lg.ft, T.q1.setFromAxisAngle(X, l.ankle));
    this.fk(pose, Lg.toe, T.q1.setFromAxisAngle(X, -l.toe));
  }
}

/** write skinning matrices (S = T(J) R(W) T(-rest)) into a Float32Array(nb*16) */
export function skinMatrices(rig, W, J, out) {
  const m = _m;
  for (let i = 0; i < rig.nb; i++) {
    m.makeRotationFromQuaternion(W[i]);
    const r = rig.rest[i];
    _a.copy(r).applyQuaternion(W[i]);
    m.elements[12] = J[i].x - _a.x; m.elements[13] = J[i].y - _a.y; m.elements[14] = J[i].z - _a.z;
    out.set(m.elements, i * 16);
  }
  return out;
}

/** transform a rest-space point attached to bone i into posed model space */
export function posePoint(rig, W, J, i, restP, out) {
  return out.subVectors(restP, rig.rest[i]).applyQuaternion(W[i]).add(J[i]);
}
