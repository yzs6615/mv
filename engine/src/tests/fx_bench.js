import * as THREE from 'three';
import { renderSet } from '../core/director.js';
import { track, ease, clamp, smoothstep, lerp } from '../core/math.js';
import { VeronaSet, paper } from '../sets/verona.js';
import { Sky } from '../fx/sky.js';
import { Art } from '../fx/art.js';
import { PaperLayer } from '../fx/paper.js';
import { ConstellationIdent, IDENT_CARD } from '../fx/ident.js';
import { LightMotes, Fireflies, Snow, Petals, Lanterns, InkRain, InkToLight, Trail, lemniscate, RingOfLight, Shockwave, LightVine, Lightning, InkBleed, PALETTE } from '../fx/particles.js';

// FX bench. ?part=ident | gallery | all (default) | <segment name> (one gallery segment, starting at 0 s)
//   ident   : 0–20 s, the real prologue timings — typed cards (copy of film.js P1), the text → dust → stars
//             dissolve, the OPUS 5.5 constellation (13 eighth-note strokes, flare at 13.94), tilt-down to Verona.
//   gallery : every FX of fx/particles*.js in context (segments listed in GALLERY below), after the ident.

const BLACK = { band: [0, 0, 0], zenith: [0, 0, 0], horizon: [0, 0, 0], ground: [0, 0, 0], stars: 0, milky: 0, moonColor: [0, 0, 0], glow: [0, 0, 0], horizonGlow: 0, clouds: 0, cloudColor: [0, 0, 0], cloudShadow: [0, 0, 0], sunColor: [0, 0, 0] };

export async function buildFilm(e) {
  const D = e.director, T = e.type;
  const part = (e.Q && e.Q.get('part')) || 'all';
  let duration = 0;
  const warmers = [];

  if (part === 'all' || part === 'ident') {
    // ---- P1 typed cards (identical to film.js) ----
    T.add({ t0: 1.6, t1: 6.6, fadeIn: 0.01, fadeOut: 0.7, anchor: [0.5, 0.5], valign: 0.5, lines: [
      { text: 'This story has been told for over four hundred years.', style: 'mono', size: 40, type: { dur: 2.6, cps: 20 }, delay: 0.25 },
      { text: '这个故事，已被讲述了四百多年。', style: 'cn', size: 32, gap: 22, delay: 3.0, fadeIn: 0.9 },
    ] });
    T.add(IDENT_CARD);

    const verona = new VeronaSet(e);
    const ident = new ConstellationIdent(e);
    verona.scene.add(ident.object);
    ident.place({ az: -6, el: 30, width: 42 });
    warmers.push(() => ident.prepare());
    const factory = () => verona;
    const show = (s, on) => { for (const l of s.layerList) l.pivot.visible = on; s.water.visible = on; };
    const MOON = verona.sky.uniforms.uMoonDir.value.clone();
    // deepNight has no moon, but its black moon disc would still occlude stars: park it below the horizon
    const moon = (s, on) => s.sky.uniforms.uMoonDir.value.copy(on ? MOON : new THREE.Vector3(0.05, -0.25, 1.0).normalize());

    // camera: P1/P2 look up into the sky with a slow push; P3 tilts down to the river view of P4
    const aim = (el, az = 0) => { const a = az * Math.PI / 180, b = el * Math.PI / 180; return new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b)); };
    const camAt = (c, t) => {
      const el = track([[0, 23.5], [9.91, 23.5], [17.97, 25.5, ease.inOutSine], [19.99, 3.0, ease.glide]], t);
      const fov = track([[0, 46], [9.91, 46], [17.97, 40.5, ease.inOutSine], [19.99, 28, ease.glide]], t);
      c.fov = fov; c.updateProjectionMatrix();
      c.position.set(-18, 6.5, 0);
      const d = aim(el, track([[17.97, -6], [19.99, 2]], t) + (t < 17.97 ? -6 : 0) * 0);
      c.lookAt(c.position.x + d.x * 100, c.position.y + d.y * 100, c.position.z + d.z * 100);
      c.updateMatrixWorld();
    };
    const identGrade = (ctx) => {
      const f = ident.flare(ctx.t);
      return { bloom: 0.8 + 0.5 * f, bloomThreshold: 0.55, bloomRadius: 1.0, streak: 0.18 + 0.4 * f, streakThreshold: 2.2, vignette: 0.45, grain: 0.04, contrast: 0.1, aspect: 2.39 };
    };
    D.add({
      id: 'P1', start: 0, end: 9.91, setName: 'identVerona', setFactory: factory,
      grade: (ctx) => ({ bloom: 0.5, bloomThreshold: 0.6, vignette: 0.3, grain: 0.04, aspect: 2.39, streak: 0 }),
      render(ctx, target) {
        const r = ctx.e.renderer;
        if (ctx.t < 8.6) { r.setRenderTarget(target); r.setClearColor(0x000000, 0); r.clear(); return; }
        const s = ctx.set, c = s.camera;
        s.look('night', ctx.t); s.sky.apply(BLACK); show(s, false); moon(s, false);
        camAt(c, ctx.t); s.frame(c);
        ident.update(ctx.t, { camera: c });
        renderSet(ctx, target, s, c);
      },
    });
    D.add({
      id: 'P2', start: 9.91, end: 17.97, setName: 'identVerona', setFactory: factory,
      grade: identGrade,
      render(ctx, target) {
        const s = ctx.set, c = s.camera;
        s.look('night', ctx.t); show(s, false); moon(s, false);
        s.sky.apply(BLACK, 'deepNight', e.Q.get('nosky') ? 0 : smoothstep(9.75, 12.2, ctx.t));
        s.sky.uniforms.uStars.value *= 0.32; s.sky.uniforms.uMilky.value *= 0.8; s.sky.uniforms.uStarSize.value = 0.75;
        camAt(c, ctx.t); s.frame(c);
        ident.update(ctx.t, { camera: c });
        renderSet(ctx, target, s, c);
      },
    });
    D.add({
      id: 'P3', start: 17.97, end: 20.0, setName: 'identVerona', setFactory: factory,
      grade: (ctx) => ({ ...identGrade(ctx), streak: 0.22, bloom: 0.78 }),
      render(ctx, target) {
        const s = ctx.set, c = s.camera;
        s.look('night', ctx.t, { winOn: 0.42 }); show(s, true); moon(s, ctx.t > 19.3);
        const m = smoothstep(18.2, 19.99, ctx.t);
        s.sky.apply('deepNight', 'night', m);
        s.sky.uniforms.uStars.value *= lerp(0.32, 1, m); s.sky.uniforms.uMilky.value *= lerp(0.8, 1, m); s.sky.uniforms.uStarSize.value = lerp(0.75, 1, m);
        camAt(c, ctx.t); s.frame(c);
        ident.update(ctx.t, { camera: c });
        renderSet(ctx, target, s, c);
      },
    });
    duration = 20;
  }

  // ======================================================================================================
  //  GALLERY
  // ======================================================================================================
  const segs = gallery(e);
  const pick = part === 'all' || part === 'gallery' ? segs : segs.filter((g) => g.name === part);
  for (const g of pick) {
    const t0 = duration;
    D.add({ id: 'G.' + g.name, start: t0, end: t0 + g.dur, setName: g.setName, setFactory: g.factory,
      grade: (ctx) => g.grade(ctx.t - t0, ctx),
      render(ctx, target) {
        const s = ctx.set;
        for (const f of s.fx || []) f.object.visible = false;
        g.render(ctx.t - t0, s, ctx);
        renderSet(ctx, target, s, s.camera);
      } });
    duration += g.dur;
  }
  return { duration, glyphs: [], warm: async () => { for (const w of warmers) await w(); } };
}

// --------------------------------------------------------------------------------------------------------
//  gallery sets & segments. Each segment: { name, dur, setName, factory, grade(lt), render(lt, set) }.
//  FX objects live in their set's scene (registered in set.fx) and are hidden unless a segment updates them.
// --------------------------------------------------------------------------------------------------------
function gallery(e) {
  const V = () => {
    const s = new VeronaSet(e);
    const camR = () => s.camera;
    s.fx = [];
    const add = (f) => { s.fx.push(f); s.scene.add(f.object); return f; };
    s.fireflies = add(new Fireflies(e, { count: 260, box: { center: [0, 2.4, -9], size: [30, 5, 22] }, focus: 15, aperture: 8, soft: 0.65 }));
    s.motes = add(new LightMotes(e, { count: 900, box: { center: [0, 4, -16], size: [30, 9, 20] }, size: 0.02, focus: 17, aperture: 8 }));
    s.rain = add(new InkRain(e, { count: 16000 }));
    s.bolts = add(new Lightning(e, { strikes: [
      { t: 0.75, from: [-170, 340, -720], to: [-128, 30, -520], seed: 7, strength: 1, branches: 6 },
      { t: 2.45, from: [240, 380, -820], to: [196, 24, -585], seed: 19, strength: 0.85, branches: 5 },
      { t: 3.6, from: [40, 360, -900], to: [70, 60, -640], seed: 23, strength: 0.6, branches: 4 },
    ], sheets: [{ t: 1.6, strength: 0.35 }, { t: 3.0, strength: 0.25 }] }));
    s.invert = add(new InkToLight(e, { count: 16000 }));
    s.lanterns = add(new Lanterns(e, { count: 4200, area: { x: [-420, 420], z: [-560, -125], y: 2 } }));
    s.lanternsNear = add(new Lanterns(e, { count: 260, area: { x: [-16, 16], z: [-34, -4], y: 0.3 }, seed: 77 }));
    s.wave = add(new Shockwave(e, { center: [0, 0.6, -75], speed: 150, maxRadius: 1500 }));
    s.ring = add(new RingOfLight(e));
    const romeo = lemniscate([0, 42, -40], [15, 6.5], 4.2, 'xy', 0);
    const juliet = lemniscate([0, 42, -40], [15, 6.5], 4.2, 'xy', Math.PI);
    s.trailR = add(new Trail(e, { path: romeo, color: PALETTE.romeo, window: 1.7, width: 0.18 }));
    s.trailJ = add(new Trail(e, { path: juliet, color: PALETTE.juliet, window: 1.7, width: 0.18, hot: [3.0, 2.4, 2.6] }));
    s.petals = add(new Petals(e, { count: 1000, center: [0, 0, -5], radius: 3.4, height: 10, size: 0.1 }));
    s.snow = add(new Snow(e, { count: 11000, intensity: 1.3 }));
    s.bleed = add(new InkBleed(e, { width: 260, height: 150, mode: 'water', sources: [[0.08, 0.5, 1.0, 0.6], [0.7, 0.12, 0.7, 1]], edges: 0.8, scale: 2.6, seed: 3 }));
    s.bleed.object.rotation.x = -Math.PI / 2; s.bleed.object.position.set(10, 0.03, -66);
    return s;
  };
  const look = (s, name, t, o = {}) => {
    s.look(name, t, o);
    // storm/dawn presets have no moon, but sky.js would still draw a dark disc: park it below the horizon
    const moonOn = (name === 'night' && (!o.b || o.m < 0.5)) || (o.b === 'night' && o.m >= 0.5);
    // (never straight down: verona's water normalises uMoonDir.xz; behind the camera so no glitter column)
    s.sky.uniforms.uMoonDir.value.set(...(moonOn ? [-0.26, 0.2, -0.94] : [0.05, -0.25, 1.0])).normalize();
  };
  const cam = (s, pos, at, fov) => { const c = s.camera; c.fov = fov; c.updateProjectionMatrix(); c.position.set(...pos); c.lookAt(...at); c.updateMatrixWorld(); s.frame(c); return c; };
  const segs = [];
  const G = (name, dur, grade, render, setName = 'galleryVerona', factory = V) => segs.push({ name, dur, grade, render, setName, factory });

  // --- Act II garden: fireflies blinking over the river bank, a little gold dust; shallow focus
  G('fireflies', 4, () => ({ bloom: 0.8, bloomThreshold: 0.6, vignette: 0.55, grain: 0.035, contrast: 0.12, aspect: 2.39, gain: [0.95, 1.0, 1.08] }), (lt, s) => {
    look(s, 'night', 20 + lt, { winOn: 0.5 });
    const c = cam(s, [-4 + lt * 0.4, 2.2, 7], [0, 4.5, -60], 36);
    s.fireflies.update(20 + lt, { camera: c });
    s.motes.update(20 + lt, { intensity: 0.5, camera: c });
  });

  // --- Act III storm: ink rain + lightning; the flash feeds the sky, the rain and the grade
  G('storm', 4.5, (lt, ctx) => { const f = ctx.set.bolts.flash(lt);
    return { bloom: 0.75 + 0.3 * f, bloomThreshold: 0.65, vignette: 0.6, grain: 0.05, contrast: 0.18, sat: 0.7, exposure: 1 + 0.55 * f, aspect: 2.39, streak: 0.15 * f, streakThreshold: 2 }; },
  (lt, s) => {
    look(s, 'storm', 40 + lt, { winOn: 0.25 });
    const f = s.bolts.flash(lt);
    Lightning.skyFlash(s.sky, f);
    const c = cam(s, [12 - lt * 0.6, 5.5, 2], [0, 28, -300], 36);
    s.rain.update(40 + lt, { camera: c, flash: f });
    s.bolts.update(lt);
  });

  // --- 4.1 the rain inverts: ink falls, decelerates, ignites, rises as gold; storm → dawn
  G('invert', 5.5, (lt) => { const m = smoothstep(1.4, 4.6, lt);
    return { bloom: 0.7 + 0.4 * m, bloomThreshold: 0.7, vignette: 0.5, grain: 0.04, contrast: 0.14, sat: lerp(0.65, 1.1, m), aspect: 2.39 }; },
  (lt, s) => {
    const m = smoothstep(1.4, 4.6, lt);
    look(s, 'storm', 60 + lt, { winOn: lerp(0.2, 0.9, m), b: 'dawn', m });
    const c = cam(s, [0, 6, 8], [0, 24, -220], 40);
    s.invert.update(60 + lt, { camera: c, turn: 60 + 1.6, origin: [0, 0, -20] });
  });

  // --- 4.3/4.4 dawn: the colour shockwave sweeps the city, windows light as it passes; thousands of lanterns rise
  G('dawn', 6, () => ({ bloom: 0.75, bloomThreshold: 0.8, vignette: 0.45, grain: 0.03, contrast: 0.12, sat: 1.05, aspect: 2.39, streak: 0.12, streakThreshold: 2.5 }), (lt, s) => {
    look(s, 'dawn', 80 + lt, { winOn: 0.15 });
    const tt = 80 + lt;
    const wp = { t0: 80.4 };
    for (const l of s.layerList) { const a = s.wave.arrival(l.pivot.position.x, l.pivot.position.z, wp); l.set('uWinOn', lerp(0.12, 0.95, smoothstep(a, a + 0.8, tt))); }
    const c = cam(s, [0, 34 + lt * 2.5, 90], [0, 22, -400], 42);
    s.wave.update(tt, { ...wp, camera: c });
    s.lanterns.update(tt, { launch: [52, 86], speed: 3, camera: c });
  });

  // --- 4.4 (start) lanterns lit on the ground around the camera, then lifting off past the lens
  G('lanternsNear', 4, () => ({ bloom: 0.8, bloomThreshold: 0.8, vignette: 0.5, grain: 0.035, contrast: 0.12, aspect: 2.39 }), (lt, s) => {
    look(s, 'night', 90 + lt, { winOn: 0.6, b: 'dawn', m: 0.35 });
    const c = cam(s, [0, 1.6, 6], [0, 5.5 + lt * 0.8, -30], 44);
    s.lanternsNear.update(90 + lt, { launch: [87.5, 92.5], speed: 1.4, accel: 2, camera: c, intensity: 2.2 });
  });

  // --- 4.2 the ring held up at the hilltop (close-up, low angle against the dawn)
  G('ring', 3, () => ({ bloom: 0.9, bloomThreshold: 0.75, vignette: 0.5, grain: 0.03, contrast: 0.1, aspect: 2.39, keepColor: 1, sat: 0.8 }), (lt, s) => {
    look(s, 'dawn', 100 + lt, { winOn: 0.3 });
    const c = cam(s, [0.05, 3.55, 4.8], [0, 3.02, 3.2], 32);
    s.ring.object.position.set(0, 3.02 + 0.01 * Math.sin(lt * 1.3), 3.2);
    s.ring.object.lookAt(c.position); s.ring.object.rotateX(0.5); s.ring.object.rotateY(0.35 + 0.1 * lt);
    s.ring.update(100 + lt, { radius: 0.055 });
  });

  // --- 4.3 …then laid flat, it expands into a city-sized halo of light
  G('halo', 4, () => ({ bloom: 0.85, bloomThreshold: 0.8, vignette: 0.45, grain: 0.03, contrast: 0.1, aspect: 2.39, keepColor: 1, sat: 0.9 }), (lt, s) => {
    look(s, 'dawn', 110 + lt, { winOn: 0.4 });
    const c = cam(s, [0, 55, 150], [0, 0, -250], 42);
    const R = 0.5 * Math.exp(lt * 1.85);
    s.ring.object.position.set(0, 2, 20); s.ring.object.rotation.set(-Math.PI / 2, 0, 0);
    s.ring.update(110 + lt, { radius: R, thick: 0.004 + R * 0.004, glowPx: 6 + Math.min(10, R * 0.05), intensity: 1.2, halo: 0, glint: 0 });
  });

  // --- 4.5 the waltz above the clouds: two lights painting ∞
  G('trail', 5, () => ({ bloom: 0.9, bloomThreshold: 0.6, vignette: 0.5, grain: 0.035, contrast: 0.1, aspect: 2.39, keepColor: 1, sat: 0.8 }), (lt, s) => {
    look(s, 'night', 120 + lt, { winOn: 0.6 });
    s.sky.apply('night', 'deepNight', 0.4);
    const c = cam(s, [0, 30, 36], [0, 40, -40], 38);
    s.trailR.update(120 + lt, { start: 120 }); s.trailJ.update(120 + lt, { start: 120 });
  });

  // --- 3.6 waiting: snow over the night city
  G('snow', 3.5, () => ({ bloom: 0.7, bloomThreshold: 0.7, vignette: 0.55, grain: 0.04, contrast: 0.12, sat: 0.8, aspect: 2.39 }), (lt, s) => {
    look(s, 'night', 140 + lt, { winOn: 0.35 });
    const c = cam(s, [-10 + lt * 0.5, 6.5, 0], [0, 20, -300], 32);
    s.snow.update(140 + lt, { camera: c, aperture: 4, focus: 30 });
  });

  // --- 1.9 ink dancers become rising light petals
  G('petals', 4, () => ({ bloom: 0.85, bloomThreshold: 0.6, vignette: 0.55, grain: 0.035, contrast: 0.1, aspect: 2.39 }), (lt, s) => {
    look(s, 'night', 160 + lt, { winOn: 0.5 });
    const c = cam(s, [0, 1.8, 6.5], [0, 4.2, -5], 46);
    s.petals.update(160 + lt, { camera: c });
  });

  // --- 3.1 ink seeps into the river from the edges
  G('bleedWater', 4, () => ({ bloom: 0.7, bloomThreshold: 0.7, vignette: 0.55, grain: 0.04, contrast: 0.14, aspect: 2.39 }), (lt, s) => {
    look(s, 'night', 180 + lt, { winOn: 0.45 });
    const c = cam(s, [0, 46, 30], [0, 0, -90], 44);
    s.bleed.update(180 + lt, { growth: lerp(0.18, 0.95, smoothstep(0, 4, lt)) });
  });

  // --- 2.3 a vine of light grows up the wall to the balcony (custom wall set)
  G('vine', 5, () => ({ bloom: 0.85, bloomThreshold: 0.6, vignette: 0.55, grain: 0.035, contrast: 0.12, aspect: 2.39, keepColor: 1, sat: 0.85 }), (lt, s) => {
    s.sky.apply('night'); s.sky.uniforms.uTime.value = 200 + lt; s.sky.follow(s.camera);
    const c = s.camera; c.fov = 42; c.updateProjectionMatrix(); c.position.set(-0.9 + lt * 0.1, 1.3, 11.5); c.lookAt(0, 5.0, 0); c.updateMatrixWorld(); s.sky.follow(c);
    s.vine.update(200 + lt, { growth: smoothstep(0.2, 4.8, lt) });
    s.wall.set('uTime', 200 + lt);
  }, 'galleryWall', () => wallSet(e));

  // --- the candle-lit page: ink drop bleeding into paper; gold dust in the candle light
  G('bleedPaper', 4.5, () => ({ bloom: 0.6, bloomThreshold: 0.9, vignette: 0.6, grain: 0.04, contrast: 0.12, aspect: 2.39 }), (lt, s) => {
    const c = s.camera; c.fov = 40; c.updateProjectionMatrix(); c.position.set(0.05, 0.95, 0.32); c.lookAt(0, 0, -0.02); c.updateMatrixWorld();
    s.bleed.update(220 + lt, { growth: lerp(0.03, 0.42, smoothstep(0, 4.5, lt)) });
    s.motes.update(220 + lt, {});
  }, 'galleryDesk', () => deskSet(e));
  return segs;
}

// a wall with a balcony (paper-cut silhouette against the night sky) for the vine
function wallSet(e) {
  const s = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(38, e.W / e.H, 0.1, 4000), fx: [] };
  s.sky = new Sky(); s.scene.add(s.sky.mesh);
  const a = new Art(9, 12, 60, { seed: 3, rimPx: 3 });
  a.rect(0, 0, 9, 9.2);                                   // the wall
  a.rect(2.6, 7.6, 3.8, 0.28);                            // balcony slab
  a.merlons(2.6, 6.4, 7.88, 0.12, 0.85, 0.22);            // balusters
  a.rect(2.55, 8.72, 3.9, 0.12);                          // rail
  a.window(3.7, 7.9, 1.6, 2.6, { arch: true, id: 0.97 }); // her window
  a.rect(0, 9.2, 9, 0.35); a.merlonsSwallow(0, 9, 9.55, 0.5, 0.6, 0.35);
  a.window(0.9, 2.2, 0.8, 1.6, { arch: true, id: 0.3, lit: 0 });
  const tex = a.pack();
  s.wall = new PaperLayer(tex, paper(e), { x: 0.2, z: 0, fogDensity: 0.002, ink: [0.006, 0.007, 0.014], inkTop: [0.012, 0.014, 0.028], rim: [0.1, 0.12, 0.2], winOn: 0.95 });
  s.wall.mesh.renderOrder = 10;
  s.scene.add(s.wall.pivot);
  s.vine = new LightVine(e, { height: 7.6, width: 2.4, seed: 21, branches: 10 });
  s.vine.object.position.set(-1.6, 0, 0.04);
  s.scene.add(s.vine.object); s.fx.push(s.vine);
  return s;
}

// a candle-lit parchment page seen from above, with ink and gold dust
function deskSet(e) {
  const s = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, e.W / e.H, 0.02, 20), fx: [] };
  const mat = new THREE.ShaderMaterial({ uniforms: { uPaper: { value: paper(e) } }, depthWrite: true, vertexShader: /* glsl */`
    varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uPaper; varying vec2 vUv; varying vec3 vW;
    void main(){
      float pf = texture2D(uPaper, vW.xz * 1.7).r;
      vec3 parch = vec3(0.55, 0.42, 0.28);
      float candle = 1.25 * exp(-length(vW.xz - vec2(0.8, -0.45)) * 1.5) + 0.12;
      float gutter = mix(0.35, 1., smoothstep(0.0, 0.22, abs(vUv.x - 0.5)));
      float edge = smoothstep(0., 0.04, min(min(vUv.x, 1. - vUv.x), min(vUv.y, 1. - vUv.y)));
      gl_FragColor = vec4(parch * candle * gutter * edge * (0.85 + 0.3 * pf), 0.);
    }` });
  const page = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), mat);
  page.rotation.x = -Math.PI / 2; page.renderOrder = 1;
  s.scene.add(page);
  s.bleed = new InkBleed(e, { width: 0.8, height: 0.8, mode: 'paper', sources: [[0.55, 0.52, 1.0, 1], [0.32, 0.36, 0.5, 0.8], [0.62, 0.3, 0.32, 1.3]], scale: 2.2, seed: 7, reach: 1.1 });
  s.bleed.object.rotation.x = -Math.PI / 2; s.bleed.object.position.set(0.15, 0.0008, 0.0); s.bleed.object.renderOrder = 2;
  s.motes = new LightMotes(e, { count: 700, box: { center: [0.1, 0.22, 0.0], size: [1.4, 0.44, 0.9] }, size: 0.0012, rise: 0.008, wander: 0.025, wanderSpeed: 0.6,
    minPx: 1.1, focus: 0.9, aperture: 16, intensity: 0.8, far: 10 });
  s.scene.add(s.bleed.object, s.motes.object); s.fx.push(s.bleed, s.motes);
  return s;
}
