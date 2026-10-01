import * as THREE from 'three';
import { clamp, smoothstep, lerp, ease } from '../core/math.js';

// Two-figure choreography helpers for LightFigure (pure functions of film time).
// They place both figures' .object in world space and pose them; extra look params pass through.

const _v = new THREE.Vector3();
const TAU = Math.PI * 2;

/** couple-frame helper: local (x, y, z) in a frame at c rotated by yaw psi -> world array */
function cw(c, psi, x, y, z) {
  const cs = Math.cos(psi), sn = Math.sin(psi);
  return [c[0] + cs * x + sn * z, c[1] + y, c[2] - sn * x + cs * z];
}

/**
 * Closed-hold waltz. The couple's centre travels on a circle (center, radius, speed m/s) while the couple
 * rotates about it (spin rad/s; negative = clockwise seen from above, the natural turn). Her skirt flares
 * with the angular velocity; feet are planted from the analytic paths.
 * o: { center:[x,y,z], radius=1.1, speed=0.45, spin=-2.4, t0=0, phase=0, yaw0=0, stepTime=0.5, sep=0.33, hold=1 }
 * returns { center, yaw } of the couple at t
 */
export function waltzPair(romeo, juliet, t, o = {}, lookR = {}, lookJ = {}) {
  const center = o.center || [0, 0, 0], radius = o.radius ?? 1.1, speed = o.speed ?? 0.45, spin = o.spin ?? -2.4;
  const t0 = o.t0 ?? 0, ph0 = o.phase ?? 0, yaw0 = o.yaw0 ?? 0;
  const d = (o.sep ?? 0.33) / 2, off = 0.055;
  const couple = (tau) => {
    const a = ph0 + (radius > 0 ? (speed / radius) * (tau - t0) : 0);
    return { c: [center[0] + radius * Math.cos(a), center[1], center[2] + radius * Math.sin(a)], psi: yaw0 + spin * (tau - t0) };
  };
  const rootOf = (who) => (tau) => {
    const { c, psi } = couple(tau);
    const p = who === 'R' ? cw(c, psi, off, 0, -d) : cw(c, psi, -off, 0, d);
    return { position: p, yaw: who === 'R' ? psi : psi + Math.PI };
  };
  const { c, psi } = couple(t);
  const hR = romeo.height, hJ = juliet.height;
  const hold = o.hold ?? 1;
  // hold points (world)
  const joined = cw(c, psi, off + 0.36, hR * 0.775, 0.02);
  const herBack = cw(c, psi, -off - 0.075, hJ * 0.745, d + 0.07);
  const hisShoulder = cw(c, psi, off - 0.17, hR * 0.79, -d + 0.03);
  const herEyes = cw(c, psi, -off, hJ * 0.93, d);
  const hisEyes = cw(c, psi, off, hR * 0.935, -d);
  const toward = (a, b) => [b[0] - a[0], 0, b[2] - a[2]];
  const fwd = [Math.sin(psi), 0, Math.cos(psi)], back = [-fwd[0], 0, -fwd[2]];
  const st = o.stepTime ?? 0.5;
  const poseR = {
    preset: 'waltz', role: 'lead', path: rootOf('R'), stepTime: st, t0,
    armL: { target: joined, amount: hold, palm: 'wall', palmDir: fwd, pole: cw([0, 0, 0], psi, 0.6, -0.8, -0.2) },
    armR: { target: herBack, amount: hold, palm: 'wall', palmDir: fwd, pole: cw([0, 0, 0], psi, -0.9, -0.3, 0.1) },
    handL: 'clasp', handR: 'soft',
    lookAt: herEyes, lookAmount: 0.8,
  };
  const poseJ = {
    preset: 'waltz', role: 'follow', path: rootOf('J'), stepTime: st, t0,
    armR: { target: joined, amount: hold, palm: 'wall', palmDir: back, pole: cw([0, 0, 0], psi, 0.6, -0.8, 0.2) },
    armL: { target: hisShoulder, amount: hold, palm: 'down', fingers: cw([0, 0, 0], psi, -0.4, -0.1, -1), pole: cw([0, 0, 0], psi, -0.8, -0.6, 0.0) },
    handR: 'clasp', handL: 'soft',
    lookAt: hisEyes, lookAmount: 0.85,
  };
  if (o.poseR) Object.assign(poseR, o.poseR);
  if (o.poseJ) Object.assign(poseJ, o.poseJ);
  romeo.update(t, poseR, lookR);
  juliet.update(t, poseJ, lookJ);
  return { center: c, yaw: psi, joined };
}

/**
 * Two figures (already placed) hold their inner hands. a is on the left of b as seen from behind them
 * (i.e. b stands to a's right). poseA/poseB: any poses; the inner arms are overridden.
 * o: { height (fraction of a's height for the hands, default 0.47), poseA, poseB, lookA, lookB, amount }
 */
export function holdHands(a, b, t, o = {}) {
  a.object.updateMatrixWorld(); b.object.updateMatrixWorld();
  const pa = a.object.getWorldPosition(new THREE.Vector3()), pb = b.object.getWorldPosition(new THREE.Vector3());
  // which hand is inner: the one on the side facing the partner
  const ra = _v.set(1, 0, 0).transformDirection(a.object.matrixWorld).clone(); // a's left
  const toB = pb.clone().sub(pa);
  const aSide = ra.dot(toB) > 0 ? 'L' : 'R';
  const rb = new THREE.Vector3(1, 0, 0).transformDirection(b.object.matrixWorld);
  const bSide = rb.dot(pa.clone().sub(pb)) > 0 ? 'L' : 'R';
  const hy = (o.height ?? 0.47) * Math.min(a.height, b.height) + (o.lift ?? 0);
  const m = pa.clone().lerp(pb, 0.5);
  if (o.offset) m.add(new THREE.Vector3(...o.offset));
  m.y += hy;
  const amt = o.amount ?? 1;
  const fwdA = new THREE.Vector3(0, 0, 1).transformDirection(a.object.matrixWorld);
  const PA = { ...(typeof o.poseA === 'string' ? { preset: o.poseA } : (o.poseA || { preset: 'stand' })) };
  const PB = { ...(typeof o.poseB === 'string' ? { preset: o.poseB } : (o.poseB || { preset: 'stand' })) };
  const tgt = [m.x, m.y, m.z];
  const nA = toB.clone().normalize(), nB = nA.clone().negate();
  PA['arm' + aSide] = { target: tgt, amount: amt, palm: 'wall', palmDir: [nA.x, 0.25, nA.z], pole: [-fwdA.x * 0.3, -1, -fwdA.z * 0.3] };
  PB['arm' + bSide] = { target: tgt, amount: amt, palm: 'wall', palmDir: [nB.x, -0.25, nB.z], pole: [-fwdA.x * 0.3, -1, -fwdA.z * 0.3] };
  PA['hand' + aSide] = 'clasp'; PB['hand' + bSide] = 'clasp';
  a.update(t, PA, o.lookA || {});
  b.update(t, PB, o.lookB || {});
  return m;
}

/**
 * Running together hand in hand (2.5: the elopement). path(tau) -> { position, yaw } is the couple's centre
 * path (world). Romeo runs slightly ahead on her right, reaching back for her hand.
 * o: { path, gap=0.62, lead=0.28, t0=0, lookR, lookJ }
 */
export function runPair(romeo, juliet, t, o = {}) {
  const path = o.path, gap = o.gap ?? 0.62, lead = o.lead ?? 0.28;
  const side = (who) => (tau) => {
    const r = path(tau), yw = r.yaw ?? 0;
    const sx = who === 'R' ? -gap / 2 : gap / 2, sz = who === 'R' ? lead / 2 : -lead / 2;
    const cs = Math.cos(yw), sn = Math.sin(yw);
    return { position: [r.position[0] + cs * sx + sn * sz, r.position[1], r.position[2] - sn * sx + cs * sz], yaw: yw };
  };
  const pr = side('R'), pj = side('J');
  const a = pr(t), b = pj(t);
  const mid = [(a.position[0] + b.position[0]) / 2, Math.min(romeo.height, juliet.height) * 0.5, (a.position[2] + b.position[2]) / 2];
  const yw = path(t).yaw ?? 0, fwd = [Math.sin(yw), 0, Math.cos(yw)];
  const left = [Math.cos(yw), 0, -Math.sin(yw)];
  const PR = { preset: 'run', path: pr, t0: o.t0 ?? 0, phase: 0.0, armSwing: 1,
    armL: { target: [mid[0] - fwd[0] * 0.05, mid[1], mid[2] - fwd[2] * 0.05], palm: 'wall', palmDir: [left[0] * 0.7 - fwd[0] * 0.7, 0, left[2] * 0.7 - fwd[2] * 0.7], pole: [left[0] * 0.5, -1, left[2] * 0.5] }, handL: 'clasp' };
  const PJ = { preset: 'run', path: pj, t0: o.t0 ?? 0, phase: 0.31, armSwing: 0.7,
    armR: { target: [mid[0] - fwd[0] * 0.05, mid[1], mid[2] - fwd[2] * 0.05], palm: 'wall', palmDir: [-left[0] * 0.7 + fwd[0] * 0.7, 0, -left[2] * 0.7 + fwd[2] * 0.7], pole: [-left[0] * 0.5, -1, -left[2] * 0.5] }, handR: 'clasp' };
  if (o.speed) { PR.speed = o.speed; PJ.speed = o.speed; }
  romeo.update(t, PR, o.lookR || {});
  juliet.update(t, PJ, o.lookJ || {});
  return mid;
}

/** Embrace: b stands in front of a (placed at a's position + a's forward * dist), both posed 'embrace'. */
export function embracePair(romeo, juliet, t, o = {}) {
  const c = o.center || [0, 0, 0], yaw = o.yaw ?? 0, dist = o.dist ?? 0.26, k = o.amount ?? 1;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  romeo.object.position.set(c[0] - sn * dist / 2, c[1], c[2] - cs * dist / 2); romeo.object.rotation.set(0, yaw, 0);
  juliet.object.position.set(c[0] + sn * dist / 2, c[1], c[2] + cs * dist / 2); juliet.object.rotation.set(0, yaw + Math.PI, 0);
  romeo.update(t, { preset: 'embrace', dist, partnerH: juliet.height, amount: k, ...(o.poseR || {}) }, o.lookR || {});
  juliet.update(t, { preset: 'embrace', dist, partnerH: romeo.height, amount: k, ...(o.poseJ || {}) }, o.lookJ || {});
}
