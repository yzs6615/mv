import * as THREE from 'three';
import { VeronaSet } from '../sets/verona.js';
import { ConstellationIdent } from '../fx/ident.js';
import { LightMotes, Fireflies, Snow, Petals, Lanterns, InkRain, InkToLight, Trail, lemniscate, RingOfLight, Shockwave, LightVine, Lightning, InkBleed, PALETTE } from '../fx/particles.js';

// Perf bench: for each FX, render the Verona night scene with and without it (gl.finish() around each) and log
// the difference. Run at full resolution, e.g.:
//   node render/render.mjs --params film=./tests/fx_perf.js --range 0:120 --out <scratch>/perf.mp4
// and read the PERF lines. (performance.now() is used for measurement only — never for visuals.)

const N = 8; // frames per FX (first one warms the shader)

export async function buildFilm(e) {
  const D = e.director, gl = e.gl;
  const s = new VeronaSet(e);
  const cam = s.camera;
  const fx = {
    ident: () => { const f = new ConstellationIdent(e); f.place({ az: 0, el: 12, width: 40 }); return { f, up: (t) => f.update(13.5 + t * 0.01, { camera: cam }) }; },
    identDust: () => { const f = new ConstellationIdent(e); f.place({ az: 0, el: 12, width: 40 }); return { f, up: (t) => f.update(10.6 + t * 0.01, { camera: cam }) }; },
    motes1500: () => { const f = new LightMotes(e, { count: 1500, box: { center: [0, 4, -16], size: [30, 9, 20] }, size: 0.02, focus: 17, aperture: 8 }); return { f, up: (t) => f.update(t) }; },
    fireflies260: () => { const f = new Fireflies(e, { count: 260, box: { center: [0, 2.4, -9], size: [30, 5, 22] }, focus: 15, aperture: 8 }); return { f, up: (t) => f.update(t) }; },
    snow11k: () => { const f = new Snow(e, { count: 11000 }); return { f, up: (t) => f.update(t, { camera: cam }) }; },
    petals1600: () => { const f = new Petals(e, { count: 1600, center: [0, 0, -5], radius: 3.4, height: 10 }); return { f, up: (t) => f.update(t) }; },
    lanterns4200: () => { const f = new Lanterns(e, { count: 4200, area: { x: [-420, 420], z: [-560, -125], y: 2 } }); return { f, up: (t) => f.update(80 + t, { launch: [52, 86], speed: 3 }) }; },
    inkRain16k: () => { const f = new InkRain(e, { count: 16000 }); return { f, up: (t) => f.update(t, { camera: cam }) }; },
    inkToLight11k: () => { const f = new InkToLight(e, { count: 11000 }); return { f, up: (t) => f.update(63 + t, { camera: cam, turn: 61.5, origin: [0, 0, -20] }) }; },
    trail2: () => { const a = new Trail(e, { path: lemniscate([0, 20, -60], [15, 6.5], 4.2, 'xy', 0), width: 0.18 }); const b = new Trail(e, { path: lemniscate([0, 20, -60], [15, 6.5], 4.2, 'xy', Math.PI), width: 0.18 });
      const g = { object: new THREE.Group() }; g.object.add(a.object, b.object); return { f: g, up: (t) => { a.update(3 + t); b.update(3 + t); } }; },
    ring: () => { const f = new RingOfLight(e); f.object.position.set(0, 6.5, -1.5); return { f, up: (t) => f.update(t) }; },
    halo: () => { const f = new RingOfLight(e); f.object.position.set(0, 1, -60); f.object.rotation.x = -Math.PI / 2; return { f, up: (t) => f.update(t, { radius: 80, thick: 0.8, glowPx: 30, halo: 0 }) }; },
    shockwave: () => { const f = new Shockwave(e, { center: [0, 0.6, -260], speed: 170 }); return { f, up: (t) => f.update(1 + t, { camera: cam }) }; },
    vine: () => { const f = new LightVine(e, { height: 7.6 }); f.object.position.set(0, 0, -12); return { f, up: (t) => f.update(t, { growth: 0.8 }) }; },
    lightning: () => { const f = new Lightning(e, { strikes: [{ t: 0, from: [-170, 340, -720], to: [-128, 30, -520], branches: 6 }] }); return { f, up: (t) => f.update(0.09 + t * 0.001) }; },
    bleedWater: () => { const f = new InkBleed(e, { width: 260, height: 150, edges: 0.8 }); f.object.rotation.x = -Math.PI / 2; f.object.position.set(10, 0.03, -66); return { f, up: (t) => f.update(t, { growth: 0.6 }) }; },
  };
  // variants for profiling (?only=a,b,c)
  fx.rain4k = () => { const f = new InkRain(e, { count: 4000, splashes: 0 }); return { f, up: (t) => f.update(t, { camera: cam }) }; };
  fx.rain16kNoSplash = () => { const f = new InkRain(e, { count: 16000, splashes: 0 }); return { f, up: (t) => f.update(t, { camera: cam }) }; };
  fx.rain16kThin = () => { const f = new InkRain(e, { count: 16000, splashes: 0, maxPx: 1.5, near: 6 }); return { f, up: (t) => f.update(t, { camera: cam }) }; };
  fx.rain16kShort = () => { const f = new InkRain(e, { count: 16000, splashes: 0, shutter: 0.005 }); return { f, up: (t) => f.update(t, { camera: cam }) }; };
  fx.splashOnly = () => { const f = new InkRain(e, { count: 1, splashes: 3000 }); return { f, up: (t) => f.update(t, { camera: cam }) }; };
  fx.shockDisc = () => { const f = new Shockwave(e, { center: [0, 0.6, -260], speed: 170, curtain: 0 }); return { f, up: (t) => f.update(1 + t, { camera: cam }) }; };
  fx.shockCurtain = () => { const f = new Shockwave(e, { center: [0, 0.6, -260], speed: 170 }); f.disc.material.depthTest = true; return { f, up: (t) => { f.update(1 + t, { camera: cam }); f.disc.visible = false; } }; };
  const only = e.Q.get('only');
  const names = only ? only.split(',') : Object.keys(fx);
  const res = {};
  names.forEach((name, k) => {
    let inst = null;
    D.add({ id: 'perf.' + name, start: k * N / 24, end: (k + 1) * N / 24, setName: 'perfVerona', setFactory: () => s,
      grade: { bloom: 0.6, aspect: 2.39 },
      render(ctx, target) {
        const r = ctx.e.renderer;
        if (!inst) { inst = fx[name](); s.scene.add(inst.f.object); }
        for (const o of s.scene.children) if (o.userData.perfFx) o.visible = false;
        inst.f.object.userData.perfFx = true;
        s.look('night', ctx.t, { winOn: 0.5 });
        cam.fov = 34; cam.updateProjectionMatrix(); cam.position.set(0, 6.5, 0); cam.lookAt(0, 14, -300); cam.updateMatrixWorld(); s.frame(cam);
        inst.up(ctx.lt);
        // a 1-pixel readback forces the GPU process to finish (gl.finish() does not block in Chrome)
        const px = new Float32Array(4);
        const sync = () => r.readRenderTargetPixels(target, 0, 0, 1, 1, px);
        // isolate the FX: hide the set's own objects (sky, paper, water) so the timing is the FX alone
        const own = s.scene.children.filter((o) => !o.userData.perfFx);
        const go = (on) => {
          for (const o of own) o.visible = false;
          inst.f.object.visible = on;
          r.setRenderTarget(target); sync();
          const t0 = performance.now();
          for (let k = 0; k < 2; k++) { r.setRenderTarget(target); r.setClearColor(0, 0); r.clear(true, true, true); r.render(s.scene, cam); }
          sync();
          for (const o of own) o.visible = true;
          return (performance.now() - t0) / 2;
        };
        const base = go(false), withFx = go(true);
        const f = Math.round(ctx.lt * 24);
        if (f > 0) { (res[name] = res[name] || []).push([base, withFx]); }
        if (f === N - 1) {
          const a = res[name].map((x) => x[0]).sort((p, q) => p - q), b = res[name].map((x) => x[1]).sort((p, q) => p - q);
          const med = (v) => v[Math.floor(v.length / 2)];
          console.log(`PERF ${name.padEnd(14)} empty ${med(a).toFixed(1)} ms   fx alone ${med(b).toFixed(1)} ms   cost ≈ ${(med(b) - med(a)).toFixed(1)} ms  @${e.W}x${e.H}`);
        }
      } });
  });
  return { duration: names.length * N / 24 };
}
