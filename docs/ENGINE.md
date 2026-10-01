# Engine guide — LOVE STORY Op. 5.5

Every frame of the film is computed by `engine/` in headless Chromium (WebGL2 via SwiftShader, **no GPU**, 4 CPU cores)
and streamed to ffmpeg by `render/render.mjs`. Read `docs/TREATMENT.md` first: it is the creative bible
(story, visual grammar, colour script, shot list, title cards).

## 1. Architecture

```
engine/index.html            fonts (Cinzel, Cormorant Garamond, Noto Serif SC, Courier Prime) + import map (three)
engine/src/main.js           boot: renderer, Post, Typography, Director; loads ?film= module (default ./film.js)
engine/src/film.js           THE EDIT (owned by the director/lead — do not edit from component work)
engine/src/core/
  math.js                    clamp/lerp/smoothstep/ease/rng(seed)/noise1/fbm1/track(keys,t)/catmull/handheld
  music.js                   SONG_START=44.0; bar(n) -> film time of bar n downbeat; beat(b); env(name,t); beatPulse(t)
  post.js                    HDR bloom (Karis 13-tap chain), anamorphic streak, transitions, final composite/grade
  typography.js              bilingual 2D title cards (overlay after tonemapping)
  director.js                shots, transitions, renderSet(ctx, target, set, camera)
engine/src/fx/
  sky.js                     Sky dome (presets night/deepNight/storm/dawn/golden; moon, stars, clouds, sun)
  art.js                     Art: Canvas2D paper-cut silhouette toolkit (metres), packs RGBA (A sil, R window, G rim, B window id)
  paper.js                   PaperLayer: hinged paper card + reflection twin; paperMaterial()
engine/src/sets/
  verona.js / verona_art.js  Verona at night/storm/dawn, multiplane across the Adige (reference implementation)
engine/src/tests/            component test benches (any agent may add files here)
render/render.mjs            offline renderer; render/sheet.py contact sheets
```

## 2. Time and determinism (non-negotiable)

* A frame is a **pure function of film time `t`** (seconds, 24 fps). Frames are rendered out of order and in
  parallel. Never accumulate state across frames, never use `Math.random()` or `Date`/`performance.now()` for visuals.
* Use `rng(seed)` from `core/math.js` at construction time for layouts; animate with analytic functions of `t`
  (positions computed in vertex shaders from per-particle seeds + `uTime` are ideal).
* If something needs simulation, make it closed-form (e.g. ballistic arcs, curl-noise advection evaluated as an
  analytic path) or re-simulate from a fixed start inside the frame call with a bounded step count.
* Sets are constructed once and reused by many shots. A shot's render call must set **every** parameter it relies on.

## 3. Shots and sets

```js
D.add({
  id: '1.3', start: bar(8), end: bar(12),              // film seconds; cut points sit on bar downbeats
  setName: 'ballroom', setFactory: (e) => new BallroomSet(e),
  grade: { bloom: .7, sat: .9, aspect: 2.39 },         // or (ctx) => ({...}); see DEFAULT_GRADE in post.js
  transIn: { type: 'dissolve' | 'lightDissolve' | 'ink' | 'light', dur: 1.0 },   // optional
  render(ctx, target, grade) {                         // ctx: { t, lt (local time), u (0..1), dur, set, e, music }
    const s = ctx.set; s.update(ctx.t, {...});          // configure the set completely for this frame
    s.camera.position.set(...); s.camera.lookAt(...);
    renderSet(ctx, target, s, s.camera);                // renders into the HDR float target
  },
});
```

A **set** is a class with `scene` (THREE.Scene), `camera` (PerspectiveCamera, aspect `e.W/e.H`) and an
`update(t, params)` method (name it as you like, document the params). Lazily cache heavy assets with
`cached(e, key, fn)` from `sets/verona.js`.

## 4. Render targets, colour, blending conventions

* Scenes render **linear HDR** into a FloatType target. Values > 1 bloom. No tonemapping inside materials.
  Use `ShaderMaterial` (Three's built-in lit materials are slow in software GL; avoid shadows maps).
* **Alpha channel = colour-keep mask.** The grade can desaturate the world (`sat`) while the lovers keep their colour
  (`keepColor` grade param). Therefore:
  * Sky writes alpha 0 (opaque, no blending).
  * Paper/world surfaces use CustomBlending with `blendSrcAlpha: ZeroFactor, blendDstAlpha: OneMinusSrcAlphaFactor`
    (they erase the mask behind them). See `paperMaterial()`.
  * The lovers' light (figures, their trails/sparks) use additive CustomBlending with
    `blendSrc: One, blendDst: One, blendSrcAlpha: One, blendDstAlpha: One` and output their coverage as alpha.
  * Other additive FX that are *not* the lovers output alpha 0 (or use AdditiveBlending with alpha 0).
* `renderOrder`: sky −1000, water −100, reflection twins −60.., paper layers 1..99 back-to-front, particles/figures ≥ 100.
  Paper layers write depth so particles behind them are hidden; particles use `depthWrite:false`.
* Canvas-generated colour textures: `colorSpace = SRGBColorSpace`; data textures: `NoColorSpace`.
* Point sprites: multiply sizes by `e.px` (= output height / 1080) so half-res previews match full-res framing.

## 5. Palette (linear HDR values)

| Role | Value |
|---|---|
| Romeo light (amber gold) | `[2.6, 1.45, 0.55]` core, halo `[1.0, 0.55, 0.18]` |
| Juliet light (rose pearl) | `[2.4, 1.2, 1.45]` core, halo `[0.95, 0.42, 0.55]` |
| Union (white gold) | `[3.0, 2.5, 1.9]` |
| Ink (night) | `[0.003, 0.004, 0.009]`; ink on paper `[0.02, 0.017, 0.015]` |
| Parchment (candle-lit) | `[0.55, 0.42, 0.28]` |
| Candle flame | `[6, 3.2, 1.1]` core |
| Window glow | `[3.6, 1.75, 0.55]` |
| Moonlight rim | `[0.09, 0.1, 0.15]` |

Visual grammar reminders: **ink falls, light rises**; separation = verticals, union = circles; the world loses
colour when the lovers are apart. Paper-cut / pop-up-book aesthetic; silhouettes with rim-lit edges; warm practical
lights; fog for depth; elegant, never cartoonish.

## 6. Performance budget

Target ≤ 1.5 s per 1080p frame for a full shot (measured steady state with `--range`). Known costs on this machine:
fullscreen pass ≈ 40–60 ms, 200k small additive points ≈ 90 ms, 6-octave fbm fullscreen ≈ 130 ms, a heavy
scene + post ≈ 1.6 s. Prefer: baked canvas textures over per-pixel fbm, fewer bigger-impact particles, analytic
motion in vertex shaders, small point sizes. Avoid shadow maps, MSAA, per-frame CPU work over ~30 ms, per-frame
texture uploads larger than ~1 MB (except the title overlay).

## 7. Testing (do this constantly; look at the images)

```bash
# write a bench film module, e.g. engine/src/tests/figure_bench.js exporting buildFilm(e) (same shape as film.js)
node render/render.mjs --params film=./tests/figure_bench.js --times 1,2.5,4 --sheet figure_a --scale 0.5
#   -> build/stills/figure_a/sheet.jpg (contact sheet) + per-frame PNGs; open them with the image viewer
node render/render.mjs --params film=./tests/figure_bench.js --range 0.0:4.0 --out build/debug/figure.mp4 --scale 0.5
```

`buildFilm(e)` must return `{ duration, glyphs? }`. `--times` takes film seconds; `--range a:b` takes seconds when
they contain a dot, else frame numbers. Several renders may run concurrently (other workers share the 4 cores):
keep benches short, use `--scale 0.5` while iterating and full resolution only for final checks.

## 8. Ownership rules for parallel work

* Only create/edit the files your task names, plus new files under `engine/src/tests/`.
* Never edit `engine/src/film.js`, `engine/src/main.js`, `engine/src/core/*`, `render/*` — if you need a core change,
  describe it in your final report instead.
* Do not commit or push; the lead integrates and commits.
