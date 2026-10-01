// builds a real LightFigure-like rig+cloth without WebGL: reuse figure internals through a minimal fake engine
import * as THREE from 'three';
globalThis.document = undefined;
const { LightFigure } = await import('../fx/figure.js');
const e = { W: 1920, H: 1080, px: 1, cache: new Map() };
const preset = process.argv[2] || 'stand';
const fig = new LightFigure(e, { who: 'juliet', count: 4000 });
const params = JSON.parse(process.argv[3] || '{}');
fig.update(1.0, { preset, ...params });
const f = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
const H = fig.hair.G;
for (const i of [0, 5, 10, 15, 19]) { console.log('strand', i); for (let k = 0; k < H.P; k += 3) console.log('  ', k, f(H.pts[i * H.P + k]), 'n', f(H.nrm[i * H.P + k])); }
const G = fig.skirt.G;
for (const m of [0, 12, 24, 36]) { console.log('meridian', m); for (let k = 0; k < G.P; k += 3) console.log('  ', k, f(G.pts[m * G.P + k]), 'sup', fig.skirt.sup[m * G.P + k]); }
