import * as THREE from 'three';
import { rng } from '../core/math.js';
import { SIDES } from './figure_rig.js';

// Body model of a figure of light: a signed-distance field built from anatomical primitives (ellipsoids,
// round cones, rounded boxes, tori) blended with smooth-min, in the rig's rest pose. Particles are sampled
// on its surface (area weighted, Newton-projected onto the iso-surface, each region owned by the closest
// primitive so density stays even across blends) plus a sparse inner volume. Each sample gets two bones.
//
// Tags: 0 skin, 1 garment, 2 hair, 3 accent (jewel/belt/cuff lines), 4 face

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// ------------------------------------------------------------------ primitives (leaves)
let LEAF_ID = 0;
function leaf(o) { o.type = 0; o.id = LEAF_ID++; o.imp = o.imp ?? 1; o.tag = o.tag ?? 0; o.sampled = o.sampled ?? true; return o; }

function frameFrom(q) { // columns of rotation matrix as arrays
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q || new THREE.Quaternion()).elements;
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]; // ex, ey, ez
}

export function ell(c, r, o = {}) {
  const [cx, cy, cz] = [c.x, c.y, c.z], [rx, ry, rz] = r;
  const F = frameFrom(o.q);
  const rot = !!o.q;
  const f = (x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (rot) { const a = px * F[0] + py * F[1] + pz * F[2], b = px * F[3] + py * F[4] + pz * F[5], d = px * F[6] + py * F[7] + pz * F[8]; px = a; py = b; pz = d; }
    const ax = px / rx, ay = py / ry, az = pz / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / rx, by = ay / ry, bz = az / rz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
  const p = 1.6075, ap = Math.pow(rx, p), bp = Math.pow(ry, p), cp = Math.pow(rz, p);
  const area = 4 * Math.PI * Math.pow((ap * bp + ap * cp + bp * cp) / 3, 1 / p);
  const amax = Math.max(ry * rz, rx * rz, rx * ry);
  const sample = (R) => {
    for (let i = 0; i < 30; i++) {
      const u = 2 * R() - 1, ph = 2 * Math.PI * R(), s = Math.sqrt(1 - u * u);
      const ux = s * Math.cos(ph), uy = u, uz = s * Math.sin(ph);
      const w = Math.sqrt((ry * rz * ux) ** 2 + (rx * rz * uy) ** 2 + (rx * ry * uz) ** 2) / amax;
      if (R() > w) continue;
      let lx = rx * ux, ly = ry * uy, lz = rz * uz;
      if (rot) { const a = lx * F[0] + ly * F[3] + lz * F[6], b = lx * F[1] + ly * F[4] + lz * F[7], d = lx * F[2] + ly * F[5] + lz * F[8]; lx = a; ly = b; lz = d; }
      return [cx + lx, cy + ly, cz + lz];
    }
    return [cx + rx, cy, cz];
  };
  const vol = (4 / 3) * Math.PI * rx * ry * rz;
  return leaf({ f, sample, area, vol, bc: [cx, cy, cz], br: Math.max(rx, ry, rz), ...o });
}

export function rcone(a, b, ra, rb, o = {}) {
  const [ax, ay, az] = [a.x, a.y, a.z];
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz, L = Math.sqrt(l2);
  const rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const f = (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
  };
  // frame
  const ex = new THREE.Vector3(bax, bay, baz).normalize();
  const e1 = Math.abs(ex.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(ex).normalize() : new THREE.Vector3(1, 0, 0).cross(ex).normalize();
  const e2 = new THREE.Vector3().crossVectors(ex, e1);
  const lat = Math.PI * (ra + rb) * Math.sqrt(l2 + rr * rr), capA = 2 * Math.PI * ra * ra, capB = 2 * Math.PI * rb * rb;
  const area = lat + capA + capB;
  const sample = (R) => {
    const u = R() * area;
    if (u < lat) {
      // pdf along the axis proportional to radius
      let t;
      if (Math.abs(rb - ra) < 1e-6) t = R();
      else { const q = R(); t = (-ra + Math.sqrt(ra * ra + q * (rb * rb - ra * ra))) / (rb - ra); }
      const r = ra + (rb - ra) * t, ph = 2 * Math.PI * R();
      const c = Math.cos(ph) * r, s = Math.sin(ph) * r;
      return [ax + bax * t + e1.x * c + e2.x * s, ay + bay * t + e1.y * c + e2.y * s, az + baz * t + e1.z * c + e2.z * s];
    }
    const atA = u < lat + capA, r = atA ? ra : rb;
    const u2 = 2 * R() - 1, ph = 2 * Math.PI * R(), sq = Math.sqrt(1 - u2 * u2);
    let dx = sq * Math.cos(ph), dy = u2, dz = sq * Math.sin(ph);
    const dd = dx * ex.x + dy * ex.y + dz * ex.z;
    if ((atA && dd > 0) || (!atA && dd < 0)) { dx -= 2 * dd * ex.x; dy -= 2 * dd * ex.y; dz -= 2 * dd * ex.z; }
    const ox = atA ? ax : b.x, oy = atA ? ay : b.y, oz = atA ? az : b.z;
    return [ox + dx * r, oy + dy * r, oz + dz * r];
  };
  const vol = Math.PI * L * (ra * ra + ra * rb + rb * rb) / 3 + (2 / 3) * Math.PI * (ra ** 3 + rb ** 3);
  return leaf({ f, sample, area, vol, bc: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], br: L / 2 + Math.max(ra, rb), ...o });
}

/** oriented rounded box: c centre, axes (Vector3 x3), h half sizes, rr rounding */
export function rbox(c, axes, h, rr, o = {}) {
  const [ex, ey, ez] = axes;
  const [cx, cy, cz] = [c.x, c.y, c.z];
  const f = (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const qx = Math.abs(px * ex.x + py * ex.y + pz * ex.z) - h[0] + rr;
    const qy = Math.abs(px * ey.x + py * ey.y + pz * ey.z) - h[1] + rr;
    const qz = Math.abs(px * ez.x + py * ez.y + pz * ez.z) - h[2] + rr;
    const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
    return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - rr;
  };
  const A = [h[1] * h[2], h[0] * h[2], h[0] * h[1]];
  const area = 8 * (A[0] + A[1] + A[2]);
  const sample = (R) => {
    const u = R() * (A[0] + A[1] + A[2]);
    const ax = u < A[0] ? 0 : u < A[0] + A[1] ? 1 : 2;
    const s = R() < 0.5 ? -1 : 1;
    const l = [(2 * R() - 1) * h[0], (2 * R() - 1) * h[1], (2 * R() - 1) * h[2]];
    l[ax] = s * h[ax];
    return [cx + ex.x * l[0] + ey.x * l[1] + ez.x * l[2], cy + ex.y * l[0] + ey.y * l[1] + ez.y * l[2], cz + ex.z * l[0] + ey.z * l[1] + ez.z * l[2]];
  };
  return leaf({ f, sample, area, vol: 8 * h[0] * h[1] * h[2], bc: [cx, cy, cz], br: Math.hypot(h[0], h[1], h[2]), ...o });
}

/** torus around `axis` through c, major radius R, minor r */
export function torus(c, axis, R, r, o = {}) {
  const n = axis.clone().normalize();
  const e1 = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(n).normalize() : new THREE.Vector3(1, 0, 0).cross(n).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1);
  const f = (x, y, z) => {
    const px = x - c.x, py = y - c.y, pz = z - c.z;
    const yy = px * n.x + py * n.y + pz * n.z;
    const rx = px - n.x * yy, ry = py - n.y * yy, rz = pz - n.z * yy;
    const q = Math.sqrt(rx * rx + ry * ry + rz * rz) - R;
    return Math.sqrt(q * q + yy * yy) - r;
  };
  const sample = (Rn) => {
    const th = 2 * Math.PI * Rn();
    let ph;
    for (let i = 0; i < 20; i++) { ph = 2 * Math.PI * Rn(); if (Rn() < (R + r * Math.cos(ph)) / (R + r)) break; }
    const rad = R + r * Math.cos(ph), hgt = r * Math.sin(ph);
    const cx = Math.cos(th) * rad, cz = Math.sin(th) * rad;
    return [c.x + e1.x * cx + e2.x * cz + n.x * hgt, c.y + e1.y * cx + e2.y * cz + n.y * hgt, c.z + e1.z * cx + e2.z * cz + n.z * hgt];
  };
  return leaf({ f, sample, area: 4 * Math.PI * Math.PI * R * r, vol: 2 * Math.PI * Math.PI * R * r * r, bc: [c.x, c.y, c.z], br: R + r, ...o });
}

// ------------------------------------------------------------------ composition tree
const T_SMIN = 1, T_MIN = 2, T_HAND = 3;
function bound(ch) {
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const c of ch) { cx += c.bc[0]; cy += c.bc[1]; cz += c.bc[2]; n++; }
  cx /= n; cy /= n; cz /= n;
  let r = 0;
  for (const c of ch) r = Math.max(r, Math.hypot(c.bc[0] - cx, c.bc[1] - cy, c.bc[2] - cz) + c.br);
  return { bc: [cx, cy, cz], br: r };
}
export const sminN = (k, ch) => ({ type: T_SMIN, k, ch: ch.filter(Boolean), ...bound(ch.filter(Boolean)) });
export const minN = (ch) => ({ type: T_MIN, k: 0, ch: ch.filter(Boolean), ...bound(ch.filter(Boolean)) });
export const handN = (k, palm, fingers) => ({ type: T_HAND, k, palm, ch: fingers, ...bound([palm, ...fingers]) });

export function evalSDF(n, x, y, z) {
  if (n.type === 0) return n.f(x, y, z);
  if (n.type === T_HAND) {
    const dp = evalSDF(n.palm, x, y, z);
    let d = dp;
    for (const c of n.ch) {
      const dx = x - c.bc[0], dy = y - c.bc[1], dz = z - c.bc[2];
      const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - c.br;
      if (lb - n.k > d) continue;
      d = Math.min(d, smin(dp, evalSDF(c, x, y, z), n.k));
    }
    return d;
  }
  let d = 1e9;
  const k = n.k;
  const ch = n.ch;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    const dx = x - c.bc[0], dy = y - c.bc[1], dz = z - c.bc[2];
    const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - c.br;
    if (lb - k > d) continue;
    const dc = evalSDF(c, x, y, z);
    d = n.type === T_MIN ? Math.min(d, dc) : smin(d, dc, k);
  }
  return d;
}

function collectLeaves(n, out = [], seen = new Set()) {
  if (n.type === 0) { if (!seen.has(n)) { seen.add(n); out.push(n); } }
  else { if (n.palm) collectLeaves(n.palm, out, seen); for (const c of n.ch) collectLeaves(c, out, seen); }
  return out;
}

// ------------------------------------------------------------------ the two bodies
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Build the SDF tree of a figure in the rig's rest pose.
 * who: 'romeo' | 'juliet'. Returns { root, leaves, keep(x,y,z) clip predicate }
 */
export function buildBody(rig, who) {
  const s = rig.s, I = rig.idx, R = rig.rest;
  const F = who === 'juliet';
  const S = (x, y, z) => V(x * s, y * s, z * s);
  const J = (n) => R[I[n]].clone();
  const B = (n) => I[n];

  // ---------------- head: cranium/face/hair masses blended softly, facial features added crisply on top
  const head = [], feat = [], soft = [];
  const hd = { bone: B('head'), tag: 4, imp: 1.6, part: 'bust' };
  const hf = { bone: B('head'), tag: 4, imp: 2.2, part: 'bust' };
  if (F) {
    head.push(ell(S(0, 1.578, -0.014), [0.069 * s, 0.096 * s, 0.086 * s], hd));
    head.push(ell(S(0, 1.522, 0.01), [0.053 * s, 0.066 * s, 0.064 * s], hd));
    // hair volume: crown, sides down to the nape (long hair continues as a cloth sheet)
    head.push(ell(S(0, 1.594, -0.028), [0.078 * s, 0.098 * s, 0.097 * s], { ...hd, tag: 2, imp: 1.3 }));
    head.push(ell(S(0, 1.52, -0.057), [0.073 * s, 0.07 * s, 0.068 * s], { ...hd, tag: 2, imp: 1.3 }));
    soft.push(ell(S(0, 1.585, 0.036), [0.05 * s, 0.018 * s, 0.032 * s], hf));                         // brow
    feat.push(rcone(S(0, 1.566, 0.07), S(0, 1.533, 0.09), 0.006 * s, 0.0092 * s, hf));                // nose
    feat.push(ell(S(0, 1.528, 0.078), [0.013 * s, 0.0075 * s, 0.009 * s], hf));                       // nostrils
    feat.push(ell(S(0, 1.511, 0.074), [0.02 * s, 0.0068 * s, 0.009 * s], hf));                        // upper lip
    feat.push(ell(S(0, 1.496, 0.072), [0.018 * s, 0.0072 * s, 0.009 * s], hf));                       // lower lip
    feat.push(ell(S(0, 1.475, 0.056), [0.019 * s, 0.015 * s, 0.015 * s], hf));                        // chin
    for (const [, sg] of SIDES) {
      soft.push(rcone(S(sg * 0.05, 1.515, -0.012), S(sg * 0.013, 1.468, 0.05), 0.013 * s, 0.012 * s, hf)); // jaw
      soft.push(ell(S(sg * 0.04, 1.546, 0.036), [0.022 * s, 0.016 * s, 0.024 * s], hf));             // cheekbone
    }
  } else {
    head.push(ell(S(0, 1.692, -0.016), [0.071 * s, 0.1 * s, 0.09 * s], hd));
    head.push(ell(S(0, 1.636, 0.01), [0.058 * s, 0.072 * s, 0.068 * s], hd));
    // short Renaissance bob: crown + nape volume
    head.push(ell(S(0, 1.706, -0.024), [0.079 * s, 0.098 * s, 0.098 * s], { ...hd, tag: 2, imp: 1.2 }));
    head.push(ell(S(0, 1.642, -0.056), [0.074 * s, 0.062 * s, 0.062 * s], { ...hd, tag: 2, imp: 1.2 }));
    soft.push(ell(S(0, 1.703, 0.04), [0.055 * s, 0.02 * s, 0.036 * s], hf));                          // brow
    feat.push(rcone(S(0, 1.684, 0.075), S(0, 1.645, 0.099), 0.0075 * s, 0.011 * s, hf));             // nose
    feat.push(ell(S(0, 1.639, 0.085), [0.016 * s, 0.009 * s, 0.01 * s], hf));                         // nostrils
    feat.push(ell(S(0, 1.621, 0.079), [0.022 * s, 0.0075 * s, 0.01 * s], hf));                        // upper lip
    feat.push(ell(S(0, 1.605, 0.077), [0.02 * s, 0.0075 * s, 0.0095 * s], hf));                       // lower lip
    feat.push(ell(S(0, 1.578, 0.066), [0.024 * s, 0.018 * s, 0.018 * s], hf));                        // chin
    for (const [, sg] of SIDES) {
      soft.push(rcone(S(sg * 0.057, 1.63, -0.015), S(sg * 0.016, 1.572, 0.055), 0.016 * s, 0.015 * s, hf)); // jaw
      soft.push(ell(S(sg * 0.045, 1.663, 0.039), [0.025 * s, 0.019 * s, 0.026 * s], hf));             // cheekbone
    }
  }
  const headN = sminN(0.006 * s, [sminN(0.016 * s, [sminN(0.018 * s, head), ...soft]), ...feat]);
  const neck = F ? rcone(S(0, 1.355, -0.03), S(0, 1.5, -0.008), 0.043 * s, 0.036 * s, { bone: B('neck'), part: 'bust' })
                 : rcone(S(0, 1.455, -0.036), S(0, 1.615, -0.012), 0.055 * s, 0.048 * s, { bone: B('neck'), part: 'bust' });

  // ---------------- torso
  const torso = [];
  if (F) {
    torso.push(ell(S(0, 1.245, -0.01), [0.12 * s, 0.135 * s, 0.09 * s], { bone: B('chest'), tag: 1 }));
    torso.push(ell(S(0, 1.21, 0.034), [0.11 * s, 0.072 * s, 0.07 * s], { bone: B('chest'), tag: 1 }));
    torso.push(ell(S(0, 1.315, -0.03), [0.145 * s, 0.06 * s, 0.07 * s], { bone: B('chest'), tag: 1 }));
    for (const [, sg] of SIDES) torso.push(rcone(S(0, 1.38, -0.032), S(sg * 0.14, 1.345, -0.028), 0.044 * s, 0.04 * s, { bone: B('chest'), tag: 0 }));
    torso.push(ell(S(0, 1.06, -0.006), [0.098 * s, 0.12 * s, 0.074 * s], { bone: B('spine'), tag: 1 }));
    torso.push(ell(S(0, 0.93, -0.01), [0.16 * s, 0.11 * s, 0.105 * s], { bone: B('pelvis'), sampled: false }));
  } else {
    torso.push(ell(S(0, 1.33, -0.004), [0.152 * s, 0.17 * s, 0.106 * s], { bone: B('chest'), tag: 1 }));
    torso.push(ell(S(0, 1.31, 0.036), [0.138 * s, 0.09 * s, 0.08 * s], { bone: B('chest'), tag: 1 }));
    torso.push(ell(S(0, 1.4, -0.036), [0.165 * s, 0.068 * s, 0.078 * s], { bone: B('chest'), tag: 1 }));
    for (const [, sg] of SIDES) torso.push(rcone(S(0, 1.49, -0.036), S(sg * 0.158, 1.43, -0.03), 0.054 * s, 0.047 * s, { bone: B('chest'), tag: 1 }));
    torso.push(ell(S(0, 1.135, 0.0), [0.116 * s, 0.13 * s, 0.094 * s], { bone: B('spine'), tag: 1 }));
    torso.push(ell(S(0, 0.975, -0.005), [0.146 * s, 0.1 * s, 0.102 * s], { bone: B('pelvis'), tag: 1 }));
    torso.push(ell(S(0, 0.928, -0.04), [0.142 * s, 0.085 * s, 0.085 * s], { bone: B('pelvis'), tag: 1 }));
  }
  const torsoN = sminN(0.05 * s, torso);

  // ---------------- arms + hands
  const arms = [];
  const hands = {};
  for (const [side, sg] of SIDES) {
    const A = rig.arm[side], H = rig.hand[side];
    const sh = J('upperArm' + side), el = J('foreArm' + side), wr = J('hand' + side);
    const d = A.a;
    const parts = [];
    if (F) {
      parts.push(ell(sh.clone().add(S(sg * 0.012, 0.008, 0)), [0.05 * s, 0.05 * s, 0.05 * s], { bone: B('upperArm' + side), tag: 1, part: 'arm' + side }));
      parts.push(rcone(sh, el, 0.037 * s, 0.03 * s, { bone: B('upperArm' + side), tag: 1, part: 'arm' + side }));
      parts.push(rcone(el, wr.clone().addScaledVector(d, -0.012 * s), 0.031 * s, 0.022 * s, { bone: B('foreArm' + side), tag: 1, part: 'arm' + side }));
      parts.push(ell(el.clone().addScaledVector(d, 0.06 * s), [0.033 * s, 0.033 * s, 0.033 * s], { bone: B('foreArm' + side), tag: 1, part: 'arm' + side, q: new THREE.Quaternion() }));
    } else {
      parts.push(ell(sh.clone().add(S(sg * 0.01, 0.006, 0)), [0.054 * s, 0.054 * s, 0.054 * s], { bone: B('upperArm' + side), tag: 1, part: 'arm' + side }));
      parts.push(rcone(sh, el, 0.046 * s, 0.037 * s, { bone: B('upperArm' + side), tag: 1, part: 'arm' + side }));
      parts.push(rcone(el, wr.clone().addScaledVector(d, -0.012 * s), 0.041 * s, 0.028 * s, { bone: B('foreArm' + side), tag: 1, part: 'arm' + side }));
      parts.push(ell(el.clone().addScaledVector(d, 0.065 * s), [0.043 * s, 0.043 * s, 0.043 * s], { bone: B('foreArm' + side), tag: 1, part: 'arm' + side }));
    }
    arms.push(sminN(0.02 * s, parts));
    // hand: palm box + fingers (min over fingers of smin(palm, finger) -> no webbing)
    const hs = H.scale;
    const pc = wr.clone().addScaledVector(H.f, 0.052 * hs).addScaledVector(H.t, -0.002 * hs).addScaledVector(H.n, 0.001 * hs);
    const palm = [];
    palm.push(rbox(pc, [H.f, H.t, H.n], [0.046 * hs, 0.037 * hs, 0.0125 * hs], 0.0105 * hs, { bone: B('hand' + side), imp: 2.2, part: 'arm' + side }));
    // thenar eminence (thumb muscle) and wrist
    palm.push(ell(wr.clone().addScaledVector(H.f, 0.035 * hs).addScaledVector(H.t, 0.02 * hs).addScaledVector(H.n, 0.009 * hs), [0.022 * hs, 0.026 * hs, 0.014 * hs],
      { bone: B('hand' + side), imp: 2.2, part: 'arm' + side, q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), H.f) }));
    palm.push(rcone(wr.clone().addScaledVector(H.f, -0.012 * hs), wr.clone().addScaledVector(H.f, 0.012 * hs), (F ? 0.022 : 0.027) * s, 0.026 * hs, { bone: B('hand' + side), imp: 2.2, part: 'arm' + side }));
    const palmN = sminN(0.012 * hs, palm);
    const fingers = [];
    for (const fi of rig.finger[side]) {
      const ph = [];
      for (let k = 0; k < 3; k++) {
        const a = R[fi.ids[k]].clone();
        const b = k < 2 ? R[fi.ids[k + 1]].clone() : a.clone().addScaledVector(fi.dir, fi.len[2]);
        ph.push(rcone(a, b, fi.r[k], fi.r[k + 1], { bone: fi.ids[k], imp: 2.2, part: 'arm' + side }));
        // knuckle volume at the joint
        if (k > 0) ph.push(ell(a, [fi.r[k] * 1.06, fi.r[k] * 1.06, fi.r[k] * 1.06], { bone: fi.ids[k], imp: 2.2, part: 'arm' + side }));
      }
      fingers.push(sminN(0.003 * hs, ph));
    }
    hands[side] = handN(0.009 * hs, palmN, fingers);
  }

  // ---------------- legs (Romeo: hose + boots; Juliet's legs are under the gown and only used for cloth collisions)
  const legs = [];
  if (!F) {
    for (const [side, sg] of SIDES) {
      const hip = J('thigh' + side), knee = J('shin' + side), ank = J('foot' + side), ball = J('toe' + side);
      const tip = rig.site['toeTip' + side].pos.clone();
      const p = [];
      p.push(rcone(hip.clone().add(S(sg * 0.006, 0.02, 0)), knee, 0.082 * s, 0.052 * s, { bone: B('thigh' + side), tag: 1 }));
      p.push(ell(knee.clone().add(S(0, 0.0, 0.006)), [0.05 * s, 0.056 * s, 0.05 * s], { bone: B('shin' + side), tag: 1 }));
      p.push(rcone(knee, ank.clone().add(S(0, 0.03, 0)), 0.05 * s, 0.035 * s, { bone: B('shin' + side), tag: 1 }));
      p.push(ell(knee.clone().add(S(0, -0.115, -0.024)), [0.05 * s, 0.1 * s, 0.054 * s], { bone: B('shin' + side), tag: 1 }));
      // boot shaft
      p.push(rcone(knee.clone().lerp(ank, 0.22), ank.clone().add(S(0, 0.02, 0)), 0.055 * s, 0.044 * s, { bone: B('shin' + side), tag: 1 }));
      // foot: heel, instep, toes (flat soles are cut by the ground in keep())
      p.push(ell(ank.clone().add(S(0, -0.04, -0.03)), [0.036 * s, 0.045 * s, 0.05 * s], { bone: B('foot' + side), tag: 1 }));
      p.push(rcone(ank.clone().add(S(0, -0.02, 0.01)), ball.clone().add(S(0, 0.006, 0)), 0.042 * s, 0.034 * s, { bone: B('foot' + side), tag: 1 }));
      p.push(rcone(ball.clone().add(S(0, 0.004, 0)), tip, 0.033 * s, 0.022 * s, { bone: B('toe' + side), tag: 1 }));
      legs.push(sminN(0.03 * s, p));
    }
  }

  // ---------------- accents: crisp bright lines (hard union)
  const accents = [];
  if (F) {
    // circlet on the brow, higher at the back
    accents.push(torus(S(0, 1.627, -0.016), V(0, 1, 0.3), 0.08 * s, 0.003 * s, { bone: B('head'), tag: 3, imp: 2.4, part: 'bust' }));
    // girdle at the waist (bodice point is shaped by keep())
    accents.push(torus(S(0, 1.032, -0.004), V(0, 1, -0.12), 0.098 * s, 0.0035 * s, { bone: B('spine'), tag: 3, imp: 2.0 }));
    for (const [side] of SIDES) {
      const wr = J('hand' + side), d = rig.arm[side].a;
      accents.push(torus(wr.clone().addScaledVector(d, -0.03 * s), d, 0.026 * s, 0.003 * s, { bone: B('foreArm' + side), tag: 3, imp: 2.2, part: 'arm' + side }));
    }
  } else {
    accents.push(torus(S(0, 1.07, 0.003), V(0, 1, 0.04), 0.121 * s, 0.006 * s, { bone: B('spine'), tag: 3, imp: 2.0 }));
    // standing collar
    accents.push(rcone(S(0, 1.462, -0.034), S(0, 1.51, -0.03), 0.066 * s, 0.062 * s, { bone: B('neck'), tag: 1, imp: 1.2 }));
    for (const [side] of SIDES) {
      const wr = J('hand' + side), d = rig.arm[side].a;
      accents.push(torus(wr.clone().addScaledVector(d, -0.032 * s), d, 0.031 * s, 0.0045 * s, { bone: B('foreArm' + side), tag: 3, imp: 2.0, part: 'arm' + side }));
      // boot cuffs
      const knee = J('shin' + side), ank = J('foot' + side);
      const c = knee.clone().lerp(ank, 0.2);
      accents.push(torus(c, knee.clone().sub(ank), 0.058 * s, 0.009 * s, { bone: B('shin' + side), tag: 3, imp: 1.6 }));
    }
  }

  const core = sminN(0.03 * s, [torsoN, neck, ...arms, ...legs]);
  const withHead = sminN(0.022 * s, [core, headN]);
  const handsBlend = sminN(0.014 * s, [withHead, hands.L, hands.R]);
  const root = minN([handsBlend, ...accents]);
  const leaves = collectLeaves(root);

  const keep = F
    ? (x, y, z) => {
        // the gown covers everything below the bodice (V point at the front)
        const ys = y / s, xs = Math.abs(x / s);
        const waist = 1.032 - (z > 0 ? 0.055 * Math.max(0, 1 - xs / 0.1) : 0);
        if (ys < waist && xs < 0.24) return false;
        return true;
      }
    : (x, y, z) => {
        const ys = y / s, xs = Math.abs(x / s);
        if (y < 0.004) return false; // soles
        if (ys > 0.86 && ys < 1.07 && xs < 0.2) return false; // under the doublet skirt
        return true;
      };
  return { root, leaves, keep };
}

// ------------------------------------------------------------------ sampling

function grad(root, x, y, z, h, out) {
  // tetrahedral gradient
  const a = evalSDF(root, x + h, y - h, z - h), b = evalSDF(root, x - h, y - h, z + h);
  const c = evalSDF(root, x - h, y + h, z - h), d = evalSDF(root, x + h, y + h, z + h);
  out[0] = a - b - c + d; out[1] = -a - b + c + d; out[2] = -a + b - c + d;
  return out;
}

function leafDists(leaves, x, y, z, cutoff, out) {
  // out: array of [dist, leaf] for leaves within cutoff (lower bound check)
  out.length = 0;
  for (let i = 0; i < leaves.length; i++) {
    const L = leaves[i];
    const dx = x - L.bc[0], dy = y - L.bc[1], dz = z - L.bc[2];
    const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - L.br;
    if (lb > cutoff) continue;
    out.push(L.f(x, y, z), L);
  }
  return out;
}

/**
 * Sample particles on the body.
 * opts: { surface: N, interior: N, seed, part: null|'armL'|'armR', partFade }
 * returns typed arrays for the skinned point cloud and lists of indices for sparks/aura hosts
 */
export function sampleBody(rig, body, opts) {
  const R = rng(opts.seed ?? 1);
  const { root, keep } = body;
  let leaves = body.leaves.filter((l) => l.sampled);
  if (opts.part === 'bust') {
    // head, neck, shoulders and upper chest (plus the upper arms); the figure fades out below the chest
    const bones = new Set(['head', 'neck', 'chest', 'clavL', 'clavR', 'upperArmL', 'upperArmR'].map((n) => rig.idx[n]));
    leaves = leaves.filter((l) => l.part === 'bust' || bones.has(l.bone));
  } else if (opts.part) leaves = leaves.filter((l) => l.part === opts.part);
  const N = opts.surface, NI = opts.interior ?? 0;
  const W = leaves.map((l) => l.area * l.imp);
  const tot = W.reduce((a, b) => a + b, 0);
  const cdf = []; let acc = 0; for (const w of W) { acc += w / tot; cdf.push(acc); }
  const pick = (u) => { let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return lo; };
  const allLeaves = body.leaves;
  const pos = new Float32Array((N + NI) * 3), nrm = new Float32Array((N + NI) * 3), bon = new Float32Array((N + NI) * 4), ene = new Float32Array(N + NI);
  const g = [0, 0, 0], tmp = [];
  const h = 0.0006 * rig.s;
  let n = 0, tries = 0, invImp = 0;
  const partBones = opts.part ? new Set(leaves.map((l) => l.bone)) : null;
  while (n < N && tries < N * 12) {
    tries++;
    const L = leaves[pick(R())];
    let [x, y, z] = L.sample(R);
    const f0 = evalSDF(root, x, y, z);
    if (f0 < -0.012 * rig.s) continue; // buried inside another primitive
    let f = f0;
    for (let it = 0; it < 8; it++) {
      grad(root, x, y, z, h, g);
      const gl2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (gl2 < 1e-14) break;
      const k = f / gl2 * (4 * h); // gradient scaled by 1/(4h)
      x -= g[0] * k; y -= g[1] * k; z -= g[2] * k;
      f = evalSDF(root, x, y, z);
      if (Math.abs(f) < 4e-5 * rig.s) break;
    }
    if (Math.abs(f) > 4e-4 * rig.s) continue;
    // ownership: the source primitive must be (nearly) the closest one here
    leafDists(allLeaves, x, y, z, 0.06 * rig.s, tmp);
    let best = 1e9, bestL = null;
    for (let i = 0; i < tmp.length; i += 2) if (tmp[i] < best) { best = tmp[i]; bestL = tmp[i + 1]; }
    const dl = L.f(x, y, z);
    if (dl > best + 1e-6) continue;
    if (!keep(x, y, z)) continue;
    // normal
    grad(root, x, y, z, h, g);
    const gl = Math.hypot(g[0], g[1], g[2]) || 1;
    pos.set([x, y, z], n * 3);
    nrm.set([g[0] / gl, g[1] / gl, g[2] / gl], n * 3);
    // two bones by soft nearest-primitive distance
    const bw = boneWeights(tmp, rig.s);
    if (partBones && !partBones.has(bw[0]) && bw[2] > 0.5) continue;
    bon.set([bw[0], bw[1], bw[2], bestL ? bestL.tag : L.tag], n * 4);
    ene[n] = 1 / Math.sqrt(L.imp);
    invImp += 1 / L.imp;
    n++;
  }
  const nSurf = n, nSurfTries = tries;
  // interior: inside the union, owned by a primitive
  const vols = leaves.filter((l) => l.tag !== 3 && l.tag !== 2);
  const VW = vols.map((l) => l.vol);
  const vt = VW.reduce((a, b) => a + b, 0) || 1;
  let ni = 0; tries = 0;
  while (ni < NI && tries < NI * 40) {
    tries++;
    let u = R() * vt, L = vols[0];
    for (let i = 0; i < vols.length; i++) { u -= VW[i]; if (u <= 0) { L = vols[i]; break; } }
    const x = L.bc[0] + (2 * R() - 1) * L.br, y = L.bc[1] + (2 * R() - 1) * L.br, z = L.bc[2] + (2 * R() - 1) * L.br;
    if (L.f(x, y, z) > -0.004 * rig.s) continue;
    const depth = -evalSDF(root, x, y, z);
    if (depth < 0.008 * rig.s) continue;
    // concentrate the inner light toward each limb's axis (a filament inside the glass figure)
    if (R() > Math.min(1, Math.pow(depth / (0.045 * rig.s), 1.6))) continue;
    if (!keep(x, y, z)) continue;
    leafDists(allLeaves, x, y, z, 0.06 * rig.s, tmp);
    const bw = boneWeights(tmp, rig.s);
    const i = n + ni;
    pos.set([x, y, z], i * 3); nrm.set([0, 0, 0], i * 3);
    bon.set([bw[0], bw[1], bw[2], 5], i * 4);
    ene[i] = 1;
    ni++;
  }
  const total = nSurf + ni;
  // visible (accepted) area estimate: total sampled-primitive area x acceptance ratio, importance-corrected
  const areaVis = (tot * invImp) / Math.max(1, nSurfTries);
  return { pos: pos.subarray(0, total * 3), nrm: nrm.subarray(0, total * 3), bon: bon.subarray(0, total * 4), ene: ene.subarray(0, total), nSurf, nInt: ni, count: total, areaVis };
}

function boneWeights(tmp, s) {
  // per-bone minimum distance, softmax over the two closest bones
  let b0 = -1, d0 = 1e9, b1 = -1, d1 = 1e9;
  const per = new Map();
  for (let i = 0; i < tmp.length; i += 2) {
    const L = tmp[i + 1], d = tmp[i];
    if (L.tag === 3) continue; // accents do not drive weights
    const cur = per.get(L.bone);
    if (cur === undefined || d < cur) per.set(L.bone, d);
  }
  for (const [b, d] of per) {
    if (d < d0) { b1 = b0; d1 = d0; b0 = b; d0 = d; } else if (d < d1) { b1 = b; d1 = d; }
  }
  if (b0 < 0) { b0 = 0; d0 = 0; }
  if (b1 < 0) { b1 = b0; d1 = d0 + 1; }
  const sig = 0.011 * s;
  const w1 = Math.exp(-(d1 - d0) / sig);
  const w0 = 1 / (1 + w1);
  return [b0, b1, w0];
}
