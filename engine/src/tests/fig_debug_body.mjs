import { buildRig } from '../fx/figure_rig.js';
import { buildBody, evalSDF } from '../fx/figure_body.js';
import { rng } from '../core/math.js';
const who = process.argv[2] || 'romeo';
const rig = buildRig(who === 'juliet' ? 'f' : 'm', who === 'juliet' ? 1.68 : 1.8);
const body = buildBody(rig, who);
const R = rng(3);
const leaves = body.leaves.filter((l) => l.sampled);
let totA = 0, totV = 0;
const rows = [];
for (const L of leaves) {
  let acc = 0, n = 2000;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = L.sample(R);
    const f = evalSDF(body.root, x, y, z);
    // visible if not inside the union deeper than 1mm and it is the closest leaf at that point and kept
    let best = 1e9, bestL = null;
    for (const M of body.leaves) { const d = M.f(x, y, z); if (d < best) { best = d; bestL = M; } }
    if (f > -0.002 && bestL === L && body.keep(x, y, z)) acc++;
  }
  const vis = L.area * acc / n;
  totA += L.area; totV += vis;
  rows.push([rig.names[L.bone] + ':' + L.tag, L.area.toFixed(4), (acc / n).toFixed(2), vis.toFixed(4)]);
}
rows.sort((a, b) => b[3] - a[3]);
for (const r of rows.slice(0, 25)) console.log(r.join('\t'));
console.log('total leaf area', totA.toFixed(3), 'visible approx', totV.toFixed(3), 'leaves', leaves.length);
