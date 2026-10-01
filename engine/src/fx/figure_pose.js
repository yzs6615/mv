import * as THREE from 'three';
import { clamp, lerp, smoothstep, fract } from '../core/math.js';
import { newSpec, eulerQ, SIDES } from './figure_rig.js';

// Parametric pose presets. Every preset is a pure function of (t, params) that fills a pose spec:
//   spec.root / rootQ (pelvis), spine/chest/neck/head eulers [pitch(+ forward), yaw(+ to her left), roll(+ toward her right)],
//   spec.arm[L|R]  { flex, abd, twist, elbow, pron, wflex, wdev, clav:[elev, fwd], ik:{target,pole}, handQ }
//   spec.leg[L|R]  { flex, abd, twist, knee, ankle, toe, ik:{ankle,pole}, footQ }
//   spec.hand[L|R] { curl:[thumb,index,middle,ring,pinky], spread, thumbOpp, thumbCurl }
//   spec.dyn       { vel (model m/s), spin (rad/s), wind, flare, swirl, drag, sway, stride, seat }
// Model space: metres, y up, facing +z, her left = +x. Targets given in world space are converted by ctx.toLocal.

const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const Yax = new THREE.Vector3(0, 1, 0), Xax = new THREE.Vector3(1, 0, 0);
const wave = (t, f, ph = 0) => Math.sin(t * f * TAU + ph);

// smooth idle noise (deterministic sum of sines)
const idle = (t, seed) => 0.5 * Math.sin(t * 0.37 + seed * 1.7) + 0.3 * Math.sin(t * 0.83 + seed * 3.1) + 0.2 * Math.sin(t * 1.61 + seed * 5.3);

export const HAND_SHAPES = {
  relaxed: { curl: [0.22, 0.2, 0.26, 0.32, 0.38], spread: 0.12, thumbOpp: 0.18, thumbCurl: 0.2 },
  open:    { curl: [0.04, 0.03, 0.04, 0.06, 0.08], spread: 0.55, thumbOpp: 0.0, thumbCurl: 0.02 },
  reach:   { curl: [0.06, 0.04, 0.08, 0.12, 0.16], spread: 0.32, thumbOpp: 0.05, thumbCurl: 0.06 },
  soft:    { curl: [0.12, 0.12, 0.18, 0.24, 0.3], spread: 0.2, thumbOpp: 0.12, thumbCurl: 0.12 },
  fist:    { curl: [0.6, 0.95, 1.0, 1.0, 1.0], spread: 0.0, thumbOpp: 0.6, thumbCurl: 0.6 },
  point:   { curl: [0.45, 0.0, 0.85, 0.95, 1.0], spread: 0.05, thumbOpp: 0.45, thumbCurl: 0.45 },
  hold:    { curl: [0.32, 0.36, 0.62, 0.72, 0.8], spread: 0.08, thumbOpp: 0.55, thumbCurl: 0.3 }, // ring between thumb and index
  grip:    { curl: [0.5, 0.75, 0.8, 0.82, 0.85], spread: 0.1, thumbOpp: 0.5, thumbCurl: 0.45 },
  clasp:   { curl: [0.3, 0.45, 0.5, 0.55, 0.6], spread: 0.05, thumbOpp: 0.3, thumbCurl: 0.3 },
  adam:    { curl: [0.18, 0.22, 0.42, 0.5, 0.56], spread: 0.18, thumbOpp: 0.1, thumbCurl: 0.12 }, // languid, index slightly lower
  god:     { curl: [0.28, 0.0, 0.18, 0.3, 0.38], spread: 0.22, thumbOpp: 0.2, thumbCurl: 0.2 },   // index reaching
};

export function setHand(h, shape, m = 1) {
  const S = typeof shape === 'string' ? HAND_SHAPES[shape] || HAND_SHAPES.relaxed : shape;
  if (m >= 1) { h.curl = S.curl.slice(); h.spread = S.spread; h.thumbOpp = S.thumbOpp; h.thumbCurl = S.thumbCurl; return h; }
  h.curl = h.curl.map((c, i) => lerp(c, S.curl[i], m)); h.spread = lerp(h.spread, S.spread, m);
  h.thumbOpp = lerp(h.thumbOpp, S.thumbOpp, m); h.thumbCurl = lerp(h.thumbCurl, S.thumbCurl, m);
  return h;
}

// ------------------------------------------------------------------ feet
/** flat-foot ankle position A0 (model), yaw, pitch (+ heel up about the ball, - toes up about the heel) -> spec leg */
function footPlace(rig, spec, side, A0, yaw, pitch, lift = 0) {
  const Lg = rig.leg[side];
  const s = rig.s;
  const ank = Lg.ankleRest;
  const ball = rig.rest[Lg.toe], heel = rig.site['heel' + side].pos;
  const qy = _q.setFromAxisAngle(Yax, yaw);
  const qp = _q2.setFromAxisAngle(Xax, pitch);
  const pivot = pitch >= 0 ? ball : heel;
  const off = _v.subVectors(pivot, ank); // ankle -> pivot (rest)
  // pivot world point when flat, then ankle = pivot - R(yaw)R(pitch) off
  const P = _w.copy(off).applyQuaternion(qy).add(A0);
  const rot = off.clone().applyQuaternion(qp).applyQuaternion(qy);
  const ankle = P.sub(rot);
  ankle.y += lift;
  const l = spec.leg[side];
  l.ik = { ankle: ankle.clone(), pole: (l.ik && l.ik.pole) || new THREE.Vector3(Math.sin(yaw) + rig.leg[side].sg * 0.08, 0, Math.cos(yaw)) };
  l.footQ = new THREE.Quaternion().setFromAxisAngle(Yax, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(Xax, pitch));
  l.toe = pitch > 0 && lift < 0.01 * s ? Math.min(pitch, 0.9) : Math.max(0, pitch * 0.3);
  return l;
}

/** flat-foot ankle position for a foot standing at ground point (x, z) */
function ankleAt(rig, side, x, z, out = new THREE.Vector3()) { return out.set(x, rig.leg[side].ankleRest.y, z); }

// ------------------------------------------------------------------ base: standing
function stand(rig, t, p, spec, ctx) {
  const s = rig.s, F = rig.sex === 'f';
  const w = p.weight ?? (F ? 0.7 : -0.55); // contrapposto: + weight on the left leg
  const br = wave(t, 1 / 4.6) * (p.breath ?? 1);
  const id = (p.idle ?? 1);
  const sw = idle(t, ctx.seed) * id;
  spec.root.set(rig.rest[0].x + w * 0.024 * s + sw * 0.006 * s, rig.rest[0].y - 0.012 * s - Math.abs(w) * 0.006 * s, rig.rest[0].z + 0.004 * s);
  spec.rootQ.copy(eulerQ(0.03, -w * 0.06 + sw * 0.02, w * 0.055));
  spec.spine = [0.01 - br * 0.008, w * 0.03, -w * 0.035];
  spec.chest = [-0.02 - br * 0.018, w * 0.03 + sw * 0.02, -w * 0.035];
  spec.neck = [0.04, 0, w * 0.02];
  spec.head = [-0.03 + idle(t * 0.7, ctx.seed + 2) * 0.03 * id, idle(t * 0.6, ctx.seed + 5) * 0.06 * id, w * 0.03];
  for (const [side, sg] of SIDES) {
    const a = spec.arm[side];
    const support = sg * w > 0; // this side carries the weight
    a.flex = 0.05 + (F ? 0.1 : 0.02) + sw * 0.02; a.abd = 0.11 + (F ? 0.04 : 0.03); a.twist = 0.0;
    a.elbow = (F ? 0.45 : 0.22) + br * 0.02; a.pron = F ? 0.55 : 0.3; a.wflex = F ? 0.12 : 0.06; a.wdev = F ? -0.1 : 0;
    a.clav = [br * 0.012, 0];
    setHand(spec.hand[side], F ? 'soft' : 'relaxed');
    // feet: weight leg straight under the hip, free leg slightly forward and turned out
    const fx = sg * (F ? 0.075 : 0.095) * s, fz = support ? -0.01 * s : 0.07 * s;
    const yaw = sg * (support ? 0.12 : 0.3);
    footPlace(rig, spec, side, ankleAt(rig, side, fx + (support ? 0 : sg * 0.02 * s), fz), yaw, support ? 0 : 0.0);
    // arms: 'hang' (relaxed), 'clasp' (hands lightly joined in front), set per figure
    const arms = p.arms ?? (F ? 'clasp' : 'hang');
    if (arms === 'clasp') {
      const hy = (F ? 0.985 : 1.02) * s + br * 0.003 * s, hz = (F ? 0.15 : 0.16) * s;
      a.ik = { target: new THREE.Vector3(sg * 0.012 * s + w * 0.01 * s, hy - (sg > 0 ? 0 : 0.012 * s), hz + (sg > 0 ? 0.008 : 0) * s), pole: new THREE.Vector3(sg * 0.8, -0.5, -0.5) };
      a.handQ = handToward(rig, side, new THREE.Vector3(-sg * 0.8, -0.55, 0.25), 'in', 1);
      setHand(spec.hand[side], 'soft');
    } else if (!support && !F) {
      // free side: the hand drifts forward, elbow softly bent
      a.flex += 0.1; a.elbow += 0.25; a.abd -= 0.02;
    }
  }
  spec.dyn.sway = 0.4;
}

// ------------------------------------------------------------------ locomotion
/**
 * walk / run: the root is expected to move along +z (model) at `speed` m/s (the shot moves .object,
 * or pass params.path to let the figure place itself — see LightFigure.update). Feet stay planted.
 */
function gait(rig, t, p, spec, ctx, run) {
  const s = rig.s, F = rig.sex === 'f';
  const speed = Math.max(0.01, p.speed ?? (run ? 3.6 : (F ? 1.05 : 1.3)));
  const H = rig.H;
  const stepLen = run ? (0.62 + 0.18 * Math.min(speed, 5)) * (H / 1.8) * (F ? 0.88 : 1)
    : (F ? 0.5 : 0.6) * Math.pow(speed / 1.2, 0.45) * (H / 1.8) * (p.stride ?? 1);
  const cyc = 2 * stepLen; // metres per gait cycle
  const ph = fract((p.dist ?? t * speed) / cyc + (p.phase ?? 0));
  const beta = run ? 0.36 : 0.61; // stance fraction
  const Tc = cyc / speed; // seconds per cycle
  const D = speed * beta * Tc; // foot travel during stance
  const lift = run ? 0.2 * s : 0.07 * s;
  const bob = (run ? 0.045 : (F ? 0.012 : 0.02)) * s;
  // pelvis
  const yBase = rig.rest[0].y - (run ? 0.05 : 0.018) * s;
  const bobPh = run ? Math.cos(TAU * 2 * (ph - beta / 2)) : -Math.cos(TAU * 2 * ph);
  const lat = (F ? 0.016 : 0.022) * s * Math.sin(TAU * ph) * (run ? 0.6 : 1);
  spec.root.set(lat, yBase + bob * (run ? -bobPh : bobPh), (run ? 0.06 : 0.015) * s);
  const pyaw = -(F ? 0.06 : 0.08) * Math.cos(TAU * ph) * (run ? 1.6 : 1);
  const proll = (F ? 0.06 : 0.04) * Math.sin(TAU * ph) * (run ? 0.6 : 1);
  const lean = run ? 0.16 + Math.min(0.12, speed * 0.015) : (F ? 0.0 : 0.04);
  spec.rootQ.copy(eulerQ(lean * 0.6 + 0.03, pyaw, proll));
  spec.spine = [lean * 0.25, -pyaw * 0.5, -proll * 0.5];
  spec.chest = [lean * 0.2 - 0.02, -pyaw * 0.9, -proll * 0.6];
  spec.neck = [-lean * 0.4 + 0.02, -pyaw * 0.2, 0];
  spec.head = [-lean * 0.5 - 0.02, -pyaw * 0.2, 0];
  for (const [side, sg] of SIDES) {
    const off = side === 'L' ? 0 : 0.5;
    const q = fract(ph - off); // 0 = this foot's heel strike
    const fx = sg * (run ? 0.06 : (F ? 0.05 : 0.07)) * s;
    let z, y = 0, pitch;
    if (q < beta) {
      const u = q / beta;
      z = D / 2 - D * u;
      // heel strike -> flat -> heel off -> toe push
      pitch = run ? lerp(-0.1, 0.0, smoothstep(0, 0.2, u)) + smoothstep(0.45, 1, u) * 0.75
        : -0.26 * (1 - smoothstep(0, 0.16, u)) + smoothstep(0.55, 1, u) * 0.62;
    } else {
      const u = (q - beta) / (1 - beta);
      const e = u * u * (3 - 2 * u);
      z = -D / 2 + (D + 0.0) * e;
      if (run) {
        // heel kicks back and up, knee drives forward
        const back = Math.sin(Math.PI * Math.min(1, u * 1.6)) * 0.22 * s * (1 - u);
        z -= back;
        y = lift * Math.pow(Math.sin(Math.PI * u), 0.8) * (1.1 - 0.4 * u);
      } else y = lift * Math.pow(Math.sin(Math.PI * u), 1.3) + 0.012 * s * Math.sin(Math.PI * u);
      pitch = lerp(run ? 0.75 : 0.62, run ? -0.1 : -0.28, smoothstep(0.0, 0.9, u)) + (run ? 0.3 * Math.sin(Math.PI * u) : 0.25 * Math.sin(Math.PI * u));
    }
    footPlace(rig, spec, side, ankleAt(rig, side, fx, z), sg * (run ? 0.05 : 0.1), pitch, y);
    // arms swing opposite to the legs
    const a = spec.arm[side];
    const swing = -Math.cos(TAU * (ph - off)) * (run ? 0.62 : (F ? 0.16 : 0.3)) * (p.armSwing ?? 1);
    a.flex = swing + (run ? 0.15 : 0.04);
    a.abd = run ? 0.16 : (F ? 0.16 : 0.12);
    a.twist = run ? -0.15 : 0;
    a.elbow = run ? 1.45 + 0.25 * Math.max(0, swing) : (F ? 0.45 : 0.22) + Math.max(0, swing) * 0.6;
    a.pron = run ? 0.7 : (F ? 0.55 : 0.35);
    a.wflex = F ? 0.15 : 0.05;
    a.clav = [run ? 0.03 : 0, 0];
    setHand(spec.hand[side], run ? 'clasp' : (F ? 'soft' : 'relaxed'));
  }
  spec.dyn.vel.set(0, 0, speed);
  spec.dyn.stride = ph;
  spec.dyn.sway = run ? 0.4 : 0.8;
}

/**
 * Footsteps planned from an analytic root path (world): path(tau) -> { position:[x,y,z], yaw }.
 * Each foot is planted where the path will be at mid-stance, so feet never slide even while the body
 * pivots (waltz) or curves. Writes ankle IK targets in the model frame of path(t).
 */
export function pathSteps(rig, spec, t, path, o = {}) {
  const s = rig.s;
  const stepTime = o.stepTime ?? 0.5, duty = o.duty ?? 0.62, lift = (o.lift ?? 0.06) * s, width = (o.width ?? 0.085) * s, toeOut = o.toeOut ?? 0.1;
  const phase = o.phase ?? 0, T2 = 2 * stepTime;
  const cur = path(t);
  const cy = Math.cos(cur.yaw ?? 0), sy = Math.sin(cur.yaw ?? 0);
  const toLocal = (x, z, out) => { const dx = x - cur.position[0], dz = z - cur.position[2]; return out.set(dx * cy - dz * sy, 0, dx * sy + dz * cy); };
  const plant = (side, sg, k, off, out) => {
    const tp = (k + duty / 2 - phase + off) * T2;
    const r = path(tp);
    const ry = r.yaw ?? 0;
    const wx = r.position[0] + Math.cos(ry) * sg * width, wz = r.position[2] - Math.sin(ry) * sg * width;
    toLocal(wx, wz, out);
    let yaw = ry + sg * toeOut - (cur.yaw ?? 0);
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    return yaw;
  };
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  let bob = 0;
  for (const [side, sg] of SIDES) {
    const off = side === 'L' ? 0 : 0.5;
    const c = t / T2 + phase - off;
    const k = Math.floor(c), q = c - k;
    const ya = plant(side, sg, k, off, A);
    let pitch, lft = 0, yaw, P;
    if (q < duty) {
      const u = q / duty;
      P = A; yaw = ya;
      pitch = -0.18 * (1 - smoothstep(0, 0.18, u)) + smoothstep(0.6, 1, u) * 0.45;
      bob += Math.sin(Math.PI * u) * 0.5;
    } else {
      const u = (q - duty) / (1 - duty);
      const yb = plant(side, sg, k + 1, off, B);
      const e = u * u * (3 - 2 * u);
      P = A.lerp(B, e);
      let dy = yb - ya; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw = ya + dy * e;
      lft = lift * Math.pow(Math.sin(Math.PI * u), 1.2);
      pitch = lerp(0.45, -0.18, smoothstep(0, 0.9, u)) + 0.2 * Math.sin(Math.PI * u);
    }
    footPlace(rig, spec, side, ankleAt(rig, side, P.x, P.z), yaw, pitch, lft);
  }
  return bob;
}

// ------------------------------------------------------------------ preset table
export const PRESETS = {
  stand(rig, t, p, spec, ctx) { stand(rig, t, p, spec, ctx); },

  walk(rig, t, p, spec, ctx) { gait(rig, t, p, spec, ctx, false); },
  run(rig, t, p, spec, ctx) { gait(rig, t, p, spec, ctx, true); },

  /** turn in place: yaw = current body yaw (rad) relative to .object, rate = yaw rate (rad/s) for lead and skirt flare */
  turn(rig, t, p, spec, ctx) {
    stand(rig, t, { ...p, weight: (p.weight ?? 0.2) }, spec, ctx);
    const yaw = p.yaw ?? 0, rate = p.rate ?? 0;
    rotateSpec(spec, yaw);
    const lead = clamp(rate * 0.18, -0.45, 0.45) * (p.lead ?? 1);
    spec.chest[1] += lead * 0.35; spec.neck[1] += lead * 0.3; spec.head[1] += lead * 0.5;
    for (const [side, sg] of SIDES) { spec.arm[side].abd += Math.min(0.5, Math.abs(rate) * 0.08); spec.arm[side].elbow += Math.min(0.4, Math.abs(rate) * 0.05); }
    spec.dyn.spin = rate;
  },

  /** head turned: yaw (+ to her left), pitch (+ up) */
  headYaw(rig, t, p, spec, ctx) { stand(rig, t, p, spec, ctx); const y = p.yaw ?? p.amount ?? 0.6, pt = p.pitch ?? 0; spec.neck[1] += y * 0.4; spec.head[1] += y * 0.6; spec.chest[1] += y * 0.12; spec.neck[0] -= pt * 0.4; spec.head[0] -= pt * 0.6; },

  lookUp(rig, t, p, spec, ctx) { stand(rig, t, p, spec, ctx); const k = p.amount ?? 1; spec.chest[0] -= 0.1 * k; spec.neck[0] -= 0.25 * k; spec.head[0] -= 0.35 * k; },
  lookDown(rig, t, p, spec, ctx) { stand(rig, t, p, spec, ctx); const k = p.amount ?? 1; spec.chest[0] += 0.06 * k; spec.neck[0] += 0.22 * k; spec.head[0] += 0.3 * k; },

  /** reach: arm 'L'|'R', target (world, or model with local:true), amount 0..1, palm 'down'|'up'|'in', hand shape */
  reach(rig, t, p, spec, ctx) {
    stand(rig, t, { ...p, weight: p.weight ?? (p.arm === 'L' ? -0.3 : 0.3) }, spec, ctx);
    const side = p.arm || 'R', sg = side === 'L' ? 1 : -1;
    const amt = p.amount ?? 1;
    const tgt = ctx.target(p.target, p.local);
    const sh = ctx.restJoint('upperArm' + side);
    const to = _v.subVectors(tgt, sh);
    const dist = to.length(), reachLen = rig.arm[side].L1 + rig.arm[side].L2 + 0.06 * rig.s;
    // lean toward the target when it is beyond the arm
    const excess = Math.max(0, dist - reachLen * 0.92);
    const lean = Math.min(0.5, excess * 1.6) * amt;
    const hdir = Math.atan2(to.x, to.z);
    spec.spine[0] += lean * 0.45 * Math.cos(hdir); spec.chest[0] += lean * 0.55 * Math.cos(hdir);
    spec.spine[1] += clamp(hdir, -1, 1) * 0.15 * amt; spec.chest[1] += clamp(hdir, -1, 1) * 0.2 * amt;
    spec.chest[2] -= Math.sin(hdir) * lean * 0.4;
    spec.head[0] -= clamp(to.y / Math.max(dist, 0.1), -1, 1) * 0.35 * amt;
    const a = spec.arm[side];
    // blend from the relaxed arm toward the target
    const rest = ctx.armRestHand(side);
    a.ik = { target: rest.lerp(tgt, smoothstep(0, 1, amt)), pole: new THREE.Vector3(sg * 0.6, -0.7, -0.4) };
    if (p.pole) a.ik.pole.copy(ctx.dir(p.pole, p.local));
    a.handQ = handToward(rig, side, to, p.palm || 'down', amt);
    setHand(spec.hand[side], p.hand || 'reach', smoothstep(0, 0.6, amt));
    // the other arm counterbalances slightly
    const o = spec.arm[side === 'L' ? 'R' : 'L'];
    o.ik = null; o.handQ = null;
    o.flex -= 0.12 * amt; o.abd += 0.06 * amt;
  },

  /** climb a wall in front (wall face at z = wallZ model); root rises at `speed` m/s (or pass dist) */
  climb(rig, t, p, spec, ctx) {
    stand(rig, t, { weight: 0, idle: 0.3 }, spec, ctx);
    const s = rig.s;
    const step = (p.step ?? 0.26) * s * 2, speed = p.speed ?? 0.35;
    const wallZ = (p.wallZ ?? 0.3) * s;
    const ph = fract((p.dist ?? t * speed) / step + (p.phase ?? 0));
    const grip = 0.72;
    const limb = (off) => {
      const q = fract(ph - off);
      if (q < grip) return { u: q / grip, moving: false };
      return { u: (q - grip) / (1 - grip), moving: true };
    };
    spec.root.set(Math.sin(TAU * ph) * 0.03 * s, rig.rest[0].y - 0.06 * s + Math.sin(TAU * 2 * ph) * 0.02 * s, wallZ - 0.21 * s);
    spec.rootQ.copy(eulerQ(0.1, Math.sin(TAU * ph) * 0.06, Math.sin(TAU * ph) * 0.05));
    spec.spine = [0.06, 0, 0]; spec.chest = [-0.05, -Math.sin(TAU * ph) * 0.06, 0];
    spec.neck = [-0.2, 0, 0]; spec.head = [-0.3, Math.sin(TAU * ph + 1) * 0.12, 0];
    for (const [side, sg] of SIDES) {
      const off = side === 'L' ? 0 : 0.5;
      // hands: grip at the top and travel down while the body rises, then reach to the next hold
      const hL = limb(off);
      const top = 1.98 * s, bot = top - step * grip;
      let hy;
      if (!hL.moving) hy = lerp(top, bot, hL.u); else hy = lerp(bot, top, smoothstep(0, 1, hL.u)) + Math.sin(Math.PI * hL.u) * 0.06 * s;
      const hz = wallZ - (hL.moving ? Math.sin(Math.PI * hL.u) * 0.1 * s : 0.035 * s);
      const a = spec.arm[side];
      a.ik = { target: new THREE.Vector3(sg * 0.22 * s, hy, hz), pole: new THREE.Vector3(sg * 0.35, -1, -0.15) };
      // palm to the wall, fingers up (gripping the vine / ledge)
      a.handQ = handToward(rig, side, new THREE.Vector3(-sg * 0.15, 1, 0.12), 'frame', 1, new THREE.Vector3(0, -0.2, 1));
      setHand(spec.hand[side], hL.moving ? 'reach' : 'grip');
      // feet: opposite phase to the hand on the same side
      const fL = limb(off + 0.5 + 0.06);
      const ftop = 0.46 * s, fbot = ftop - step * grip;
      let fy;
      if (!fL.moving) fy = lerp(ftop, fbot, fL.u); else fy = lerp(fbot, ftop, smoothstep(0, 1, fL.u)) + Math.sin(Math.PI * fL.u) * 0.05 * s;
      const fz = wallZ - 0.16 * s - (fL.moving ? Math.sin(Math.PI * fL.u) * 0.07 * s : 0);
      footPlace(rig, spec, side, new THREE.Vector3(sg * 0.11 * s, fy, fz), sg * 0.15, fL.moving ? 0.3 : 0.2, 0);
      spec.leg[side].ik.pole = new THREE.Vector3(sg * 0.3, 0.2, 1);
    }
    spec.dyn.vel.set(0, speed, 0);
    spec.dyn.drag = 0.3;
  },

  /** kneel on one knee ('R' default) offering the hand forward (ring of light in the 'ring<side>' site) */
  kneel(rig, t, p, spec, ctx) {
    stand(rig, t, { weight: 0, idle: 0.5 }, spec, ctx);
    const s = rig.s;
    const down = p.knee || 'R', up = down === 'R' ? 'L' : 'R';
    const sgD = down === 'L' ? 1 : -1, sgU = -sgD;
    const offer = p.offer ?? 1;
    const L1 = rig.leg[down].L1;
    const kneeY = 0.055 * s;
    spec.root.set(sgU * 0.01 * s, kneeY + L1 * 0.975 + 0.004 * s, -0.04 * s);
    spec.rootQ.copy(eulerQ(-0.02, sgD * 0.05, 0));
    spec.spine = [0.02, 0, 0]; spec.chest = [0.04 + offer * 0.04, -sgD * 0.04, 0];
    const look = p.lookUp ?? 0.35;
    spec.neck = [-look * 0.4, 0, 0]; spec.head = [-look * 0.6, 0, sgD * 0.05];
    // down leg: knee on the ground, shin back along the ground, toes tucked
    const hipD = ctx.restJoint('thigh' + down);
    const kneeP = new THREE.Vector3(sgD * 0.11 * s, kneeY, spec.root.z + 0.07 * s);
    const L2 = rig.leg[down].L2;
    const ank = new THREE.Vector3(sgD * 0.12 * s, 0.1 * s, kneeP.z - L2 * 0.985);
    spec.leg[down].ik = { ankle: ank, pole: new THREE.Vector3(0, -0.6, 1) };
    spec.leg[down].footQ = new THREE.Quaternion().setFromAxisAngle(Xax, 1.15);
    spec.leg[down].toe = 1.0;
    // up leg: foot planted forward, knee up
    footPlace(rig, spec, up, ankleAt(rig, up, sgU * 0.13 * s, 0.4 * s), sgU * 0.1, 0);
    spec.leg[up].ik.pole = new THREE.Vector3(sgU * 0.2, 0.6, 1);
    // offering arm (same side as the down knee by default): forward at chest height, palm up, holding the ring
    const side = p.arm || down, sg = side === 'L' ? 1 : -1;
    const shR = ctx.restJoint('upperArm' + side).clone();
    shR.y = spec.root.y + (rig.rest[rig.idx['upperArm' + side]].y - rig.rest[0].y);
    const tgt = new THREE.Vector3(sg * 0.1 * s, shR.y - 0.12 * s + offer * 0.1 * s, spec.root.z + 0.48 * s);
    const relaxed = new THREE.Vector3(sg * 0.2 * s, spec.root.y + 0.05 * s, spec.root.z + 0.15 * s);
    const a = spec.arm[side];
    a.ik = { target: relaxed.lerp(tgt, smoothstep(0, 1, offer)), pole: new THREE.Vector3(sg * 0.5, -1, -0.3) };
    a.handQ = handToward(rig, side, new THREE.Vector3(-sg * 0.25, 0.35, 1), 'up', 1);
    setHand(spec.hand[side], 'hold');
    // other hand on the raised knee
    const o = side === 'L' ? 'R' : 'L', so = -sg;
    const ko = new THREE.Vector3(so * 0.1 * s, 0.56 * s, 0.33 * s);
    spec.arm[o].ik = { target: ko, pole: new THREE.Vector3(so * 1, -0.2, -0.4) };
    spec.arm[o].handQ = handToward(rig, o, new THREE.Vector3(0, -0.6, 1), 'down', 1);
    setHand(spec.hand[o], 'soft');
    spec.dyn.sway = 0.2;
  },

  /** sit on a ledge: seat height, hands 'lap' | 'glass' (glass target world), lean, look */
  sit(rig, t, p, spec, ctx) {
    stand(rig, t, { weight: 0, idle: 0.6 }, spec, ctx);
    const s = rig.s, F = rig.sex === 'f';
    const seat = (p.seat ?? 0.48);
    const br = wave(t, 1 / 5.2);
    spec.root.set(0, seat + 0.085 * s, 0);
    spec.rootQ.copy(eulerQ(-0.16, 0, 0));
    const slump = p.slump ?? 0.5;
    spec.spine = [0.1 + slump * 0.06, 0, (p.lean ?? 0) * 0.08]; spec.chest = [0.06 + slump * 0.08 - br * 0.012, 0, (p.lean ?? 0) * 0.1];
    spec.neck = [0.1 + slump * 0.1, (p.headYaw ?? 0) * 0.4, 0]; spec.head = [0.06 + slump * 0.12 + (p.headPitch ?? 0), (p.headYaw ?? 0) * 0.6, (p.lean ?? 0) * 0.1];
    for (const [side, sg] of SIDES) {
      const kx = sg * 0.075 * s;
      footPlace(rig, spec, side, ankleAt(rig, side, kx * 0.9, 0.47 * s + (sg > 0 ? 0.02 : -0.03) * s), sg * 0.05, 0.05);
      spec.leg[side].ik.pole = new THREE.Vector3(sg * 0.05, 0.4, 1);
    }
    const hands = p.hands || 'lap';
    for (const [side, sg] of SIDES) {
      const a = spec.arm[side];
      const glass = hands === 'glass' && (p.arm || 'R') === side;
      if (glass) {
        const tgt = ctx.target(p.glass, p.local);
        a.ik = { target: tgt, pole: new THREE.Vector3(sg * 0.3, -1, -0.2) };
        const sh = ctx.restJoint('upperArm' + side);
        a.handQ = handToward(rig, side, _w.subVectors(tgt, sh), 'glass', 1, p.glassNormal ? ctx.dir(p.glassNormal, p.local) : null);
        setHand(spec.hand[side], 'open');
      } else {
        // hands resting in the lap, one over the other
        const tgt = new THREE.Vector3(sg * 0.035 * s, seat + 0.135 * s, 0.24 * s + (sg > 0 ? 0.02 : -0.01) * s);
        a.ik = { target: tgt, pole: new THREE.Vector3(sg * 0.7, -0.6, -0.2) };
        a.handQ = handToward(rig, side, new THREE.Vector3(-sg * 0.9, -0.15, 0.55), 'down', 1);
        setHand(spec.hand[side], 'soft');
      }
    }
    spec.dyn.seat = { min: new THREE.Vector3(-0.4 * s, 0, -0.35 * s), max: new THREE.Vector3(0.4 * s, seat, 0.2 * s) };
    spec.dyn.sway = 0.15;
  },

  /** standing at a window, one hand on the frame (target world), looking out */
  standWindow(rig, t, p, spec, ctx) {
    const side = p.arm || 'R', sg = side === 'L' ? 1 : -1;
    stand(rig, t, { ...p, weight: p.weight ?? -sg * 0.6 }, spec, ctx);
    const tgt = ctx.target(p.target ?? [sg * 0.3, 1.25, 0.35], p.local ?? !p.target);
    const a = spec.arm[side];
    a.ik = { target: tgt, pole: new THREE.Vector3(sg * 0.7, -0.8, -0.3) };
    const sh = ctx.restJoint('upperArm' + side);
    a.handQ = handToward(rig, side, _w.subVectors(tgt, sh), 'wall', 1, p.frameNormal ? ctx.dir(p.frameNormal, p.local) : null);
    setHand(spec.hand[side], 'soft');
    const hy = p.headYaw ?? sg * 0.25;
    spec.neck[1] += hy * 0.4; spec.head[1] += hy * 0.6; spec.head[2] += sg * 0.12; spec.head[0] += p.headPitch ?? -0.05;
    spec.chest[1] += hy * 0.15;
  },

  /** embrace: arms around a partner standing `dist` in front; partnerH = partner height */
  embrace(rig, t, p, spec, ctx) {
    stand(rig, t, { weight: 0.1, idle: 0.4 }, spec, ctx);
    const s = rig.s, F = rig.sex === 'f';
    const dist = p.dist ?? 0.24;
    const ph = p.partnerH ?? (F ? 1.8 : 1.68);
    const k = p.amount ?? 1;
    spec.chest[0] += 0.06 * k; spec.spine[0] += 0.04 * k;
    // heads: turned and tilted, resting
    spec.neck[1] += (F ? 0.35 : -0.3) * k; spec.head[1] += (F ? 0.45 : -0.35) * k; spec.head[2] += (F ? -0.15 : 0.12) * k; spec.head[0] += (F ? 0.12 : 0.15) * k;
    for (const [side, sg] of SIDES) {
      const a = spec.arm[side];
      // F: hands meet behind his neck; M: hands meet on her lower back (the arms make two rings)
      const hy = F ? ph * 0.835 : ph * 0.6;
      const hz = dist + (F ? 0.035 : 0.075) * s;
      const hx = -sg * (F ? 0.025 : 0.03) * s;
      const rest = ctx.armRestHand(side);
      const tgt = new THREE.Vector3(hx, hy, hz).lerp(rest, 1 - k);
      a.ik = { target: tgt, pole: new THREE.Vector3(sg * 1, F ? -0.6 : -0.25, F ? -0.4 : -0.05) };
      // palms rest on the partner's back, fingers pointing across it
      a.handQ = handToward(rig, side, new THREE.Vector3(-sg, F ? 0.2 : -0.1, 0.25), 'frame', 1, new THREE.Vector3(0, 0, 1));
      a.handBlend = k;
      setHand(spec.hand[side], 'soft');
    }
    spec.dyn.sway = 0.3;
  },

  /** lean: toward direction [x,z] (model), amount, head rest tilt */
  lean(rig, t, p, spec, ctx) {
    stand(rig, t, p, spec, ctx);
    const d = p.dir || [0, 1], k = p.amount ?? 0.5;
    const pitch = d[1] * k * 0.35, roll = -d[0] * k * 0.3;
    spec.spine[0] += pitch * 0.4; spec.chest[0] += pitch * 0.6; spec.spine[2] += roll * 0.4; spec.chest[2] += roll * 0.5;
    spec.head[2] += (p.tilt ?? 0.18) * Math.sign(d[0] || 1);
    spec.root.z += d[1] * k * 0.05 * rig.s; spec.root.x += d[0] * k * 0.05 * rig.s;
  },

  /**
   * waltz: one partner of a closed-hold couple (use waltzPair to drive both). params: role 'lead'|'follow',
   * path (world root path), stepTime (s per step), rise (rise & fall amount), lean (frame lean-back)
   */
  waltz(rig, t, p, spec, ctx) {
    stand(rig, t, { weight: 0, idle: 0.2, breath: 0.5 }, spec, ctx);
    const s = rig.s, F = rig.sex === 'f';
    const st = p.stepTime ?? 0.5;
    if (p.path) pathSteps(rig, spec, t, p.path, { stepTime: st, duty: 0.6, lift: 0.05, width: F ? 0.07 : 0.085, toeOut: 0.12, phase: F ? 0.5 : 0 });
    // rise & fall: low on the step, rising through it
    const q = fract(t / st + (F ? 0.5 : 0));
    const rise = (p.rise ?? 1) * 0.022 * s;
    spec.root.y = rig.rest[0].y - 0.02 * s - rise * Math.cos(Math.PI * 2 * q) * 0.5 - rise * 0.5;
    // the frame: lean back from the partner, her head opening to the left
    const lean = p.lean ?? 1;
    spec.rootQ.copy(eulerQ(-0.03 * lean, 0, 0));
    spec.spine = [-0.04 * lean, 0, 0];
    spec.chest = [-(F ? 0.14 : 0.06) * lean, F ? 0.1 : 0, F ? -0.05 : 0];
    spec.neck = [F ? -0.08 : 0.04, F ? 0.12 : 0, 0];
    spec.head = [F ? -0.12 : 0.05, F ? 0.18 : 0, F ? -0.1 : 0.04];
    spec.dyn.sway = 0.5;
  },

  /** explicit pose from a joint dictionary only (on top of 'stand' with no idle) */
  joints(rig, t, p, spec, ctx) { stand(rig, t, { weight: 0, idle: 0, breath: 0 }, spec, ctx); },
};

/** rotate a filled spec about the vertical axis through the model origin */
export function rotateSpec(spec, yaw) {
  if (!yaw) return spec;
  const q = new THREE.Quaternion().setFromAxisAngle(Yax, yaw);
  spec.root.applyQuaternion(q);
  spec.rootQ.premultiply(q);
  for (const side of ['L', 'R']) {
    const l = spec.leg[side], a = spec.arm[side];
    if (l.ik) { l.ik.ankle.applyQuaternion(q); if (l.ik.pole) l.ik.pole.applyQuaternion(q); }
    if (l.footQ) l.footQ.premultiply(q);
    if (a.ik) { a.ik.target.applyQuaternion(q); if (a.ik.pole) a.ik.pole.applyQuaternion(q); }
    if (a.handQ) a.handQ.premultiply(q);
  }
  spec.dyn.vel.applyQuaternion(q);
  return spec;
}

/**
 * world/model hand orientation: fingers along `dir` (model), palm facing 'down'|'up'|'in'|'out'|'wall'|'glass'
 * (wall/glass: palm faces along dir, fingers up). Returns a quaternion mapping the rest hand frame.
 */
export function handToward(rig, side, dir, palm = 'down', amt = 1, palmDir = null) {
  const H = rig.hand[side];
  const f = new THREE.Vector3().copy(dir).normalize();
  let n;
  const up = new THREE.Vector3(0, 1, 0);
  if (palm === 'frame' && palmDir) {
    // explicit frame: fingers along dir, palm normal along palmDir (orthogonalised)
    n = palmDir.clone().addScaledVector(f, -palmDir.dot(f));
    if (n.lengthSq() < 1e-8) n.set(0, -1, 0).addScaledVector(f, f.y);
    n.normalize();
  } else if (palm === 'wall' || palm === 'glass') {
    // palm pressed toward dir, fingers pointing up
    n = palmDir ? palmDir.clone().normalize().negate() : f.clone();
    const ff = up.clone().addScaledVector(n, -up.dot(n)).normalize();
    f.copy(ff);
  } else {
    const ref = palm === 'up' ? up.clone() : palm === 'down' ? up.clone().negate() : null;
    if (ref) n = ref.addScaledVector(f, -ref.dot(f));
    else { const sg = side === 'L' ? 1 : -1; n = new THREE.Vector3(-sg * (palm === 'in' ? 1 : -1), 0, 0); n.addScaledVector(f, -n.dot(f)); }
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1).addScaledVector(f, -f.z);
    n.normalize();
  }
  // rotation mapping rest (H.f, H.n) -> (f, n)
  const m1 = new THREE.Matrix4().makeBasis(H.f, H.n, new THREE.Vector3().crossVectors(H.f, H.n));
  const m2 = new THREE.Matrix4().makeBasis(f, n, new THREE.Vector3().crossVectors(f, n));
  const q = new THREE.Quaternion().setFromRotationMatrix(m2.multiply(m1.transpose()));
  return q;
}

export { newSpec };
