// exercises the public API in node (no WebGL): every preset, blends, joint dictionaries, modifiers, pair helpers
const F = await import('../fx/figure.js');
const e = { W: 1920, H: 1080, px: 1, cache: new Map() };
const R = new F.LightFigure(e, { who: 'romeo', count: 3000 }), J = new F.LightFigure(e, { who: 'juliet', count: 3000 });
const ok = (name, fig) => { const p = fig.getJointWorld('head'); if (!isFinite(p.x + p.y + p.z)) throw new Error('NaN in ' + name); return p; };
const presets = ['stand', 'walk', 'run', 'turn', 'lookUp', 'lookDown', 'headYaw', 'reach', 'climb', 'kneel', 'sit', 'standWindow', 'embrace', 'lean', 'waltz', 'joints'];
let ms = 0, n = 0;
for (const fig of [R, J]) for (const pr of presets) for (const t of [0, 1.3, 7.7]) {
  const a = performance.now();
  fig.update(t, { preset: pr, target: [0.4, 1.4, 0.5], arm: 'R', glass: [-0.4, 1.2, 0.1], hands: undefined });
  ms += performance.now() - a; n++;
  ok(pr, fig);
}
console.log('presets ok, avg update ms', (ms / n).toFixed(2));
R.update(2, { from: 'stand', to: { preset: 'kneel', offer: 1 }, m: 0.5 }); ok('blend', R);
R.update(2, { joints: { head: [0.2, 0.5, 0], upperArmL: [0, 0, 0.3] } }); ok('joints', R);
R.update(2, { preset: 'stand', armL: { flex: 1.4, elbow: 0.3 }, legR: { flex: 0.6, knee: 1.0 }, head: { yaw: 0.4, pitch: 0.2 }, handL: 'point' }); ok('mods', R);
J.update(2, { preset: 'stand', armR: { target: [0.2, 1.5, 0.6], palm: 'up' }, lookAt: [0, 1.6, 2] }, { dissolve: 0.5, dim: 0.3, collapse: { point: [0, 1, 0], k: 0.5 }, pulse: { point: [0, 1, 0], age: 0.3 } }); ok('look', J);
F.waltzPair(R, J, 3.3, { radius: 1 }); ok('waltz', R); ok('waltz', J);
F.holdHands(R, J, 3.3, {}); F.runPair(R, J, 3.3, { path: (t) => ({ position: [t, 0, 0], yaw: Math.PI / 2 }) }); F.embracePair(R, J, 3.3, {});
for (const nm of ['head', 'handL', 'indexTipR', 'ringR', 'hem', 'hemBack', 'hairTip', 'capeTip', 'toeTipL', 'eyes', 'chestFront']) {
  const f = nm === 'hairTip' || nm.startsWith('hem') ? J : R; const p = f.getJointWorld(nm); console.log(nm.padEnd(10), p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3));
}
// CPU cost per update (full Juliet with gown + hair cloth; Romeo with cape + doublet skirt)
for (const fig of [R, J]) { const a = performance.now(); for (let i = 0; i < 200; i++) fig.update(i / 24, { preset: 'walk', speed: 1.2 }); console.log(fig.who, 'walk update ms', ((performance.now() - a) / 200).toFixed(2)); }
