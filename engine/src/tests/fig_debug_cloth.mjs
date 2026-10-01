import * as THREE from 'three';
import { buildRig, Solver, Pose, newSpec } from '../fx/figure_rig.js';
import { PRESETS } from '../fx/figure_pose.js';
import { ClothTex, Colliders, Skirt, Hair, Cape } from '../fx/figure_cloth.js';
const rig = buildRig('f', 1.68);
const sol = new Solver(rig), pose = new Pose(rig.nb), spec = newSpec(rig);
const ctx = { seed: 1, target: (a) => new THREE.Vector3(...a), dir: (a) => new THREE.Vector3(...a), restJoint: (n) => rig.rest[rig.idx[n]].clone(), armRestHand: (s) => new THREE.Vector3(s === 'L' ? 0.24 : -0.24, 0.86, 0.06) };
PRESETS[process.argv[2] || 'stand'](rig, 0, {}, spec, ctx);
sol.solve(spec, pose); sol.forward(pose);
const s = rig.s;
const prof = [[0.098, 1.032], [0.15, 0.965], [0.2, 0.875], [0.235, 0.76], [0.29, 0.55], [0.36, 0.34], [0.43, 0.14], [0.49, 0.0]].map(([r, y]) => [r * s, y * s]);
const sk = new Skirt(rig, 0, { M: 48, P: 22, profile: prof, ellip: [0.8, 0.97], vFront: 0.055 * s, train: 0.14 });
const hair = new Hair(rig, 48, {});
const tex = new ClothTex(48 + 20);
const C = new Colliders(); C.reset();
for (const side of ['L', 'R']) { const L = rig.leg[side]; C.cap(sol.J[L.th], sol.J[L.sh], 0.078); C.cap(sol.J[L.sh], sol.J[L.ft], 0.052); }
sk.solve(sol, C, pose.dyn, 0, tex);
hair.solve(sol, C, pose.dyn, 0, tex);
const f = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
for (const m of [0, 12, 24, 36]) { console.log('meridian', m); for (let k = 0; k < 22; k += 3) console.log('  ', k, f(sk.G.pts[m * 22 + k]), 'n', f(sk.G.nrm[m * 22 + k])); }
for (const i of [0, 10, 19]) { console.log('strand', i); for (let k = 0; k < 16; k += 3) console.log('  ', k, f(hair.G.pts[i * 16 + k])); }
console.log('L', sk.L, 'tex row0 col0', Array.from(tex.data.slice(0, 8)));
