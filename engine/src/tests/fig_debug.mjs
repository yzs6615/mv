// node debug harness for the figure rig (no WebGL): prints joints for a pose
import * as THREE from 'three';
import { buildRig, Solver, Pose, newSpec, skinMatrices } from '../fx/figure_rig.js';
import { PRESETS } from '../fx/figure_pose.js';
const who = process.argv[2] || 'm';
const preset = process.argv[3] || 'stand';
const t = parseFloat(process.argv[4] || '0');
const rig = buildRig(who, who === 'f' ? 1.68 : 1.8);
const sol = new Solver(rig), pose = new Pose(rig.nb), spec = newSpec(rig);
const ctx = { seed: 1, target: (a) => new THREE.Vector3(...a), dir: (a) => new THREE.Vector3(...a), restJoint: (n) => rig.rest[rig.idx[n]].clone(), armRestHand: (s) => new THREE.Vector3(s === 'L' ? 0.24 : -0.24, 0.86, 0.06) };
PRESETS[preset](rig, t, JSON.parse(process.argv[5] || '{}'), spec, ctx);
sol.solve(spec, pose); sol.forward(pose);
const f = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
for (const n of ['pelvis','spine','chest','neck','head','clavL','upperArmL','foreArmL','handL','upperArmR','foreArmR','handR','thighL','shinL','footL','toeL','thighR','shinR','footR','toeR'])
  console.log(n.padEnd(10), 'rest', f(rig.rest[rig.idx[n]]), ' posed', f(sol.J[rig.idx[n]]));
console.log('ankle targets', spec.leg.L.ik && f(spec.leg.L.ik.ankle), spec.leg.R.ik && f(spec.leg.R.ik.ankle));
