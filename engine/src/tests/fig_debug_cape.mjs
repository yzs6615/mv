const { LightFigure } = await import('../fx/figure.js');
const e = { W: 1920, H: 1080, px: 1, cache: new Map() };
const fig = new LightFigure(e, { who: 'romeo', count: 4000 });
fig.update(1.0, { preset: process.argv[2] || 'stand' });
const f = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
const G = fig.cape.G;
for (const i of [0, 2, 4, 8, 12, 14, 16]) { console.log('strand', i); for (let k = 0; k < G.P; k += 3) console.log('  ', k, f(G.pts[i * G.P + k]), 'n', f(G.nrm[i * G.P + k])); }
