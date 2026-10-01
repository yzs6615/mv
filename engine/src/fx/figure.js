import * as THREE from 'three';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { buildRig, Solver, Pose, newSpec, skinMatrices, posePoint, SIDES } from './figure_rig.js';
import { buildBody, sampleBody } from './figure_body.js';
import { ClothTex, Colliders, Skirt, Hair, Cape } from './figure_cloth.js';
import { figureUniforms, figureMaterial } from './figure_shader.js';
import { PRESETS, setHand, handToward, HAND_SHAPES, rotateSpec } from './figure_pose.js';

export { HAND_SHAPES, PRESETS };
export { waltzPair, holdHands, runPair, embracePair } from './figure_pairs.js';
export { HandsCloseUp, LightRipple } from './figure_hands.js';

// ============================================================================================
// LightFigure — Romeo (amber gold) and Juliet (rose pearl) as figures of light.
//
// QUICK START
//   import { LightFigure, waltzPair, holdHands, runPair, embracePair, HandsCloseUp } from '../fx/figure.js';
//   const romeo = new LightFigure(e, { who: 'romeo' });             // 1.80 m, ~40k particles
//   const juliet = new LightFigure(e, { who: 'juliet' });           // 1.68 m, gown + long hair
//   scene.add(romeo.object, juliet.object);                         // renderOrder 100..104, depthWrite off
//   // in a shot's render(ctx): place the root, then update EVERY frame (pure function of t)
//   romeo.object.position.set(x, 0, z); romeo.object.rotation.y = yaw;   // model faces +z, origin = ground
//   romeo.update(ctx.t, { preset: 'walk', speed: 1.3 }, { brightness: 1.2, ground: 0.4 });
//
// CONSTRUCTOR  new LightFigure(e, { who, count = 40000, seed, height, part })
//   part: null (full figure) | 'armL' | 'armR' (forearm + hand, high detail, fades toward the shoulder)
//         | 'bust' (head, neck, shoulders + hair/cape, high detail, fades below the chest) — for close-ups.
//   Geometry is cached in e.cache per (who, height, count, seed, part): extra instances are cheap.
//
// POSE  fig.update(t, pose, look)   — pose is one of
//   'stand' | { preset: 'stand', ...params, ...modifiers }
//   { joints: { boneName: [pitch, yaw, roll], ... } }          additive local eulers on a neutral stand
//   { from: poseA, to: poseB, m }                              blend (slerp of solved local rotations)
//   PRESETS (params):
//     stand      weight (-1..1 contrapposto, + = weight on her/his left leg), arms 'hang'|'clasp', breath, idle
//     walk/run   speed (m/s; the root must move along +z at that speed, or pass path), phase, stride, armSwing
//     turn       yaw (current body yaw rad), rate (rad/s; head leads, skirt flares)
//     lookUp / lookDown (amount), headYaw (yaw, pitch)
//     reach      arm 'L'|'R', target [x,y,z] (world; local:true for model space), amount 0..1, palm, hand
//     climb      speed (m/s up; the root rises), wallZ (model z of the wall face), step, phase
//     kneel      knee 'R'|'L' (down), offer 0..1 (offering arm raised, ring held at site 'ringR'/'ringL'), lookUp
//     sit        seat (m), hands 'lap'|'glass', arm, glass [x,y,z] world, glassNormal, slump, lean, headYaw
//     standWindow arm, target (hand on the frame, world), frameNormal, headYaw, headPitch
//     embrace    dist, partnerH, amount;  lean: dir [x,z], amount, tilt;  waltz: used by waltzPair
//   MODIFIERS (any pose object):
//     head {yaw, pitch(+up), roll} | lookAt [x,y,z] world (+lookAmount) | yaw (upper-body twist) | bodyYaw
//     armL/armR { target, amount, pole, palm 'down'|'up'|'in'|'out'|'wall'|'frame', fingers, palmDir }
//              or FK { flex, abd, twist, elbow, pron, wflex, wdev, clav:[elev, fwd] }
//     legL/legR { ankle [x,y,z] (IK), pole, footYaw, footPitch } or FK { flex, abd, twist, knee, ankle, toe }
//     handL/handR shape name (relaxed, open, reach, soft, fist, point, hold, grip, clasp, adam, god) or
//              { curl:[thumb..pinky], spread, thumbOpp, thumbCurl };  hands: shape for both
//     motion { vel [x,y,z] world m/s, spin rad/s, wind [x,y,z] }  (drives skirt flare, hair/cape drag, spark trails)
//     cloth { flare, swirl, ripple, drag, sway, gust }
//     path (tau) => ({ position:[x,y,z], yaw })  — the figure places its own .object at t, derives velocity and
//              spin, and walk/run/waltz plant their feet along the path (no foot sliding on curves).
//
// LOOK  (all optional; defaults restored every call)
//   brightness 1, color 'romeo'|'juliet'|'union'|[r,g,b] (+ colorMix 0..1, halo), aura 0.35, sparks 0..1,
//   sparkRise, dissolve 0..1 (particles drift up and fade), collapse { point [x,y,z] world, k 0..1, radius },
//   dim 0..1 (her light fading: dimmer, sparser, flickering), focus (m from camera) + aperture (m, 0 = no DOF),
//   pulse { point world, age | t0, speed, width, strength } (a ring of light running through the body),
//   ground 0..1 (light pool cast on the floor at y = 0), size, rim, face, back, inner, shimmer, glint, keep.
//
// QUERIES  getJointWorld(name, out?, local?) — bones (head, handR, footL, indexTipL ...), sites (headTop, eyes,
//   chestFront, back, palmL/R, ringL/R, <finger>TipL/R, toeTipL/R, heelL/R) and cloth points (hem, hemBack,
//   hemL, hemR, hairTip, capeTip).  getJointQuat(boneName).
// PAIRS  waltzPair, holdHands, runPair, embracePair (figure_pairs.js); HandsCloseUp + LightRipple (figure_hands.js).
// ============================================================================================

export const PALETTE = {
  romeo: { core: [2.6, 1.45, 0.55], halo: [1.0, 0.55, 0.18], irid: 0.12 },
  juliet: { core: [2.4, 1.2, 1.45], halo: [0.95, 0.42, 0.55], irid: 0.55 },
  union: { core: [3.0, 2.5, 1.9], halo: [1.15, 0.86, 0.55], irid: 0.2 },
};

const PART_SIZE = 0.26;     // particle size factor of the high-detail arm figures
const BUST_SIZE = 0.42;     // ... and of the high-detail bust (head & shoulders) figures
const REF_COVERAGE = 0.5;   // coverage of the reference full figure (brightness calibration)

const LOOK_DEFAULTS = {
  brightness: 1, color: null, colorMix: 1, halo: null, aura: 0.35, dissolve: 0, collapse: null, dim: 0,
  sparks: 1, sparkRise: 1, focus: 6, aperture: 0, pulse: null, shimmer: 0.28, glint: 1, rim: 1, back: 0.32,
  face: 0.17, inner: 0.28, size: 1, minPx: 2.2, maxPx: 22, keep: 1, irid: null, hot: 0.22, ground: 0, fade: null,
};

function cachedGeo(e, key, fn) { if (!e.cache) e.cache = new Map(); if (!e.cache.has(key)) e.cache.set(key, fn()); return e.cache.get(key); }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _q = new THREE.Quaternion();

const GROUND_VERT = /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const GROUND_FRAG = /* glsl */`varying vec2 vP; uniform vec3 uCol; uniform float uI, uR;
void main(){ float r = length(vP) / uR; float g = exp(-r * r * 3.2) * 0.75 + exp(-r * 2.2) * 0.25; g *= smoothstep(1.6, 1.1, r);
  gl_FragColor = vec4(uCol * g * uI, g * uI * 0.25); }`;

/**
 * new LightFigure(e, { who: 'romeo'|'juliet', count = 40000, seed, height, part: null|'armL'|'armR' })
 *   .object         THREE.Group to add to a scene (move/rotate it; model origin = ground between the feet, facing +z)
 *   .update(t, pose, look)   pose: preset name | { preset, ...params, ...modifiers } | { joints } | { from, to, m }
 *   .getJointWorld(name, out?)  bone/site/cloth point in world space
 * See PRESETS in figure_pose.js and the report for the full parameter reference.
 */
export class LightFigure {
  constructor(e, opts = {}) {
    this.e = e;
    this.who = opts.who === 'juliet' ? 'juliet' : 'romeo';
    const F = this.who === 'juliet';
    this.F = F;
    this.height = opts.height ?? (F ? 1.68 : 1.8);
    this.part = opts.part || null;
    this.seed = opts.seed ?? (F ? 7 : 3);
    const count = opts.count ?? (this.part ? 50000 : 40000);
    this.count = count;
    const rig = (this.rig = buildRig(F ? 'f' : 'm', this.height));
    this.solver = new Solver(rig);
    this.pose = new Pose(rig.nb);
    this.poseStack = [];
    this.spec = newSpec(rig);
    this.bones = new Float32Array(rig.nb * 16);
    this.colliders = new Colliders();

    // ---- garments (per instance: they hold solved guides)
    this.garments = [];
    let row = 0;
    if (this.part === 'bust') {
      // close-up bust: hair (Juliet) / cape (Romeo) only
      if (F) { this.hair = new Hair(rig, row, { S: 20, P: 16, length: 0.6 }); row += this.hair.rows; this.garments.push(this.hair); }
      else { this.cape = new Cape(rig, row, { S: 17, P: 14, length: 0.66 }); row += this.cape.rows; this.garments.push(this.cape); }
    } else if (!this.part) {
      if (F) {
        const s = rig.s;
        const prof = [[0.098, 1.032], [0.15, 0.965], [0.2, 0.875], [0.235, 0.76], [0.29, 0.55], [0.36, 0.34], [0.43, 0.14], [0.47, 0.03]].map(([r, y]) => [r * s, y * s]);
        this.skirt = new Skirt(rig, row, { M: 48, P: 22, profile: prof, ellip: [0.8, 0.97], vFront: 0.055 * s, train: 0.1, pleatK: 15, pleatAmp: 0.02 });
        row += this.skirt.rows; this.garments.push(this.skirt);
        this.hair = new Hair(rig, row, { S: 20, P: 16, length: 0.6 });
        row += this.hair.rows; this.garments.push(this.hair);
      } else {
        const s = rig.s;
        const prof = [[0.124, 1.072], [0.152, 1.02], [0.17, 0.965], [0.178, 0.925]].map(([r, y]) => [r * s, y * s]);
        this.skirt = new Skirt(rig, row, { M: 36, P: 8, profile: prof, ellip: [0.8, 0.86], vFront: 0, train: 0, pleatK: 14, pleatAmp: 0.005, name: 'doublet' });
        row += this.skirt.rows; this.garments.push(this.skirt);
        this.cape = new Cape(rig, row, { S: 17, P: 14, length: 0.66 });
        row += this.cape.rows; this.garments.push(this.cape);
      }
    }
    this.clothTex = new ClothTex(Math.max(1, row));

    // ---- particles (geometry cached and shared between instances with the same key)
    const key = `fig:${this.who}:${this.height}:${count}:${this.seed}:${this.part}`;
    const geo = cachedGeo(e, key, () => this.buildGeometry(count));
    this.geo = geo;

    // ---- materials (shared uniforms) & draw objects
    const u = (this.u = figureUniforms());
    u.uBones.value = this.bones;
    u.uCloth.value = this.clothTex.tex;
    this.object = new THREE.Group();
    this.object.name = 'LightFigure:' + this.who;
    const mk = (g, mode, order) => {
      if (!g) return null;
      const pts = new THREE.Points(g, figureMaterial(u, mode, rig.nb));
      pts.frustumCulled = false; pts.renderOrder = order;
      this.object.add(pts);
      return pts;
    };
    this.points = {
      aura: mk(geo.aura, 3, 101),
      cloth: mk(geo.cloth, 1, 102),
      body: mk(geo.body, 0, 103),
      sparks: mk(geo.sparks, 2, 104),
    };
    // ground glow (light cast on the paper floor), off by default
    this.groundU = { uCol: { value: new THREE.Color() }, uI: { value: 0 }, uR: { value: 0.6 } };
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: this.groundU, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = 0.004; this.ground.renderOrder = 100; this.ground.visible = false; this.ground.frustumCulled = false;
    this.object.add(this.ground);
    this.update(0, 'stand');
  }

  // ------------------------------------------------------------------ geometry
  buildGeometry(count) {
    const rig = this.rig, F = this.F, R = rng(this.seed * 7919 + 13);
    const body = buildBody(rig, this.who);
    let fr;
    if (this.part === 'bust') fr = { surf: F ? 0.72 : 0.8, int: 0.02, cloth: F ? 0.24 : 0.16, sparks: 0.015, aura: 0.005 };
    else if (this.part) fr = { surf: 0.989, int: 0.0, cloth: 0, sparks: 0.006, aura: 0.005 };
    else if (F) fr = { surf: 0.37, int: 0.025, cloth: 0.575, sparks: 0.022, aura: 0.006 };
    else fr = { surf: 0.66, int: 0.05, cloth: 0.26, sparks: 0.022, aura: 0.006 };
    const S = sampleBody(rig, body, { surface: Math.round(count * fr.surf), interior: Math.round(count * fr.int), seed: this.seed, part: this.part });
    const mkSkinned = (idx, n) => {
      const g = new THREE.BufferGeometry();
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), B = new Float32Array(n * 4), A = new Float32Array(n * 4), E = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const j = idx ? idx(i) : i;
        P.set(S.pos.subarray(j * 3, j * 3 + 3), i * 3); N.set(S.nrm.subarray(j * 3, j * 3 + 3), i * 3);
        B.set(S.bon.subarray(j * 4, j * 4 + 4), i * 4); E[i] = S.ene[j];
        A.set([R(), R(), R(), R()], i * 4);
      }
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('aB', new THREE.BufferAttribute(B, 4));
      g.setAttribute('aR', new THREE.BufferAttribute(A, 4));
      g.setAttribute('aE', new THREE.BufferAttribute(E, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
      return g;
    };
    // particle coverage of the surface (particles x size^2 / area): brightness is normalised by it so a dense
    // close-up arm and a full figure have the same surface radiance
    const sizeW = 0.0055 * this.sizeFactor() * rig.s;
    const geo = { counts: { surface: S.nSurf, interior: S.nInt }, coverage: (S.nSurf * sizeW * sizeW) / Math.max(1e-4, S.areaVis), areaVis: S.areaVis };
    geo.body = mkSkinned(null, S.count);
    const nsp = Math.round(count * fr.sparks), nau = Math.round(count * fr.aura);
    // sparks prefer the upper body (light rises from the shoulders, head and hands)
    const hostIdx = [];
    for (let i = 0; hostIdx.length < nsp && i < nsp * 20; i++) {
      const j = Math.floor(R() * S.nSurf);
      const y = S.pos[j * 3 + 1] / rig.H;
      if (R() < 0.35 + y * 0.8) hostIdx.push(j);
    }
    while (hostIdx.length < nsp) hostIdx.push(Math.floor(R() * S.nSurf));
    geo.sparks = mkSkinned((i) => hostIdx[i], nsp);
    geo.aura = mkSkinned(() => Math.floor(R() * S.nSurf), nau);
    geo.counts.sparks = nsp; geo.counts.aura = nau;
    // cloth particles
    if (this.garments.length) {
      const nc = Math.round(count * fr.cloth);
      const share = this.garments.length === 1 ? [1] : F ? [0.73, 0.27] : [0.3, 0.7];
      const parts = this.garments.map((g, k) => g.sample(Math.round(nc * share[k]), R));
      const n = parts.reduce((a, p) => a + p.pos.length / 3, 0);
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), B = new Float32Array(n * 4), A = new Float32Array(n * 4), E = new Float32Array(n);
      let o = 0;
      for (const p of parts) {
        const m = p.pos.length / 3;
        P.set(p.pos, o * 3); N.set(p.nrm, o * 3); B.set(p.bon, o * 4);
        for (let i = 0; i < m; i++) { A.set([R(), R(), R(), R()], (o + i) * 4); E[o + i] = 1; }
        o += m;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('aB', new THREE.BufferAttribute(B, 4));
      g.setAttribute('aR', new THREE.BufferAttribute(A, 4));
      g.setAttribute('aE', new THREE.BufferAttribute(E, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
      geo.cloth = g; geo.counts.cloth = n;
    }
    geo.counts.total = S.count + nsp + nau + (geo.counts.cloth || 0);
    return geo;
  }

  sizeFactor() { return this.part === 'bust' ? BUST_SIZE : this.part ? PART_SIZE : 1; }

  // ------------------------------------------------------------------ pose resolution
  _ctx() {
    const fig = this, rig = this.rig;
    this.object.updateMatrixWorld();
    _mi.copy(this.object.matrixWorld).invert();
    return {
      seed: this.seed,
      target(a, local) { const v = Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a.clone(); return local ? v : v.applyMatrix4(_mi); },
      dir(a, local) { const v = Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a.clone(); return local ? v : v.transformDirection(_mi); },
      restJoint(name) { return rig.rest[rig.idx[name]].clone(); },
      armRestHand(side) { const sg = side === 'L' ? 1 : -1; return new THREE.Vector3(sg * 0.24 * rig.s, 0.86 * rig.s, 0.06 * rig.s); },
    };
  }

  _resolve(t, pose, out, depth, ctx) {
    if (typeof pose === 'string') pose = { preset: pose };
    if (pose && (pose.from !== undefined || pose.to !== undefined)) {
      while (this.poseStack.length < (depth + 1) * 2) this.poseStack.push(new Pose(this.rig.nb));
      const A = this.poseStack[depth * 2], B = this.poseStack[depth * 2 + 1];
      this._resolve(t, pose.from ?? 'stand', A, depth + 1, ctx);
      this._resolve(t, pose.to ?? 'stand', B, depth + 1, ctx);
      const m = clamp(pose.m ?? 0.5);
      out.blend(A, B, m);
      // modifiers on the blend node apply on top
      if (pose.joints) this.solver.applyJoints(pose.joints, out); else this.solver.forward(out);
      return out;
    }
    const rig = this.rig;
    const spec = newSpec(rig);
    const name = pose.preset || (pose.joints ? 'joints' : 'stand');
    const fn = PRESETS[name] || PRESETS.stand;
    fn(rig, t, pose, spec, ctx);
    this._modifiers(t, pose, spec, ctx);
    this.solver.solve(spec, out);
    return out;
  }

  _modifiers(t, p, spec, ctx) {
    const rig = this.rig;
    if (p.yaw) { spec.spine[1] += p.yaw * 0.3; spec.chest[1] += p.yaw * 0.4; spec.head[1] += p.yaw * 0.3; }
    if (p.bodyYaw) rotateSpec(spec, p.bodyYaw);
    if (p.head) {
      const h = p.head;
      const pit = -(h.pitch ?? 0), yw = h.yaw ?? 0, rl = h.roll ?? 0;
      spec.neck[0] += pit * 0.4; spec.head[0] += pit * 0.6; spec.neck[1] += yw * 0.4; spec.head[1] += yw * 0.6; spec.head[2] += rl;
      if (pit < 0) spec.chest[0] += pit * 0.15;
    }
    if (p.lookAt) {
      const tgt = ctx.target(p.lookAt, p.local);
      const eye = posePointRest(rig, 'eyes', spec);
      const d = _v.subVectors(tgt, eye);
      const bodyYaw = new THREE.Euler().setFromQuaternion(spec.rootQ, 'YXZ').y + spec.spine[1] + spec.chest[1];
      let yw = Math.atan2(d.x, d.z) - bodyYaw;
      yw = Math.atan2(Math.sin(yw), Math.cos(yw));
      yw = clamp(yw, -1.2, 1.2);
      const pit = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.8, 0.7);
      const k = p.lookAmount ?? 1;
      // the gaze replaces the preset's head direction (keeps its roll)
      spec.neck[1] = lerp(spec.neck[1], yw * 0.4, k); spec.head[1] = lerp(spec.head[1], yw * 0.6, k);
      spec.neck[0] = lerp(spec.neck[0], -pit * 0.4 + 0.03, k); spec.head[0] = lerp(spec.head[0], -pit * 0.6, k);
      if (Math.abs(yw) > 0.8) spec.chest[1] += (yw - Math.sign(yw) * 0.8) * 0.6 * k;
    }
    for (const [side, sg] of SIDES) {
      const ao = p['arm' + side];
      if (ao) {
        const a = spec.arm[side];
        if (ao.target) {
          const tgt = ctx.target(ao.target, ao.local);
          const k = ao.amount ?? 1;
          const from = a.ik ? a.ik.target.clone() : ctx.armRestHand(side);
          a.ik = { target: from.lerp(tgt, smoothstep(0, 1, k)), pole: ao.pole ? ctx.dir(ao.pole, ao.local) : new THREE.Vector3(sg * 0.6, -0.7, -0.4) };
          const sh = ctx.restJoint('upperArm' + side);
          if (ao.palm !== null) {
            const dir = ao.fingers ? ctx.dir(ao.fingers, ao.local) : _v2.subVectors(tgt, sh);
            a.handQ = handToward(rig, side, dir, ao.palm || 'down', 1, ao.palmDir ? ctx.dir(ao.palmDir, ao.local) : null);
            a.handBlend = k;
          }
        }
        let fk = false;
        for (const key of ['flex', 'abd', 'twist', 'elbow', 'pron', 'wflex', 'wdev']) if (ao[key] !== undefined) { a[key] = ao[key]; fk = true; }
        if (fk && !ao.target) { a.ik = null; a.handQ = null; } // explicit joint angles replace the preset's IK
        if (ao.clav) a.clav = ao.clav;
      }
      const lo = p['leg' + side];
      if (lo) {
        const l = spec.leg[side];
        const ikA = lo.ankle && (Array.isArray(lo.ankle) || lo.ankle.isVector3);
        if (ikA) { l.ik = { ankle: ctx.target(lo.ankle, lo.local), pole: lo.pole ? ctx.dir(lo.pole, lo.local) : new THREE.Vector3(sg * 0.1, 0, 1) }; if (lo.footYaw !== undefined || lo.footPitch !== undefined) l.footQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(lo.footPitch ?? 0, lo.footYaw ?? 0, 0, 'YXZ')); }
        let fk = false;
        for (const key of ['flex', 'abd', 'twist', 'knee', 'ankle', 'toe']) if (typeof lo[key] === 'number') { l[key] = lo[key]; fk = true; }
        if (fk && !ikA) { l.ik = null; l.footQ = null; }
      }
      const ho = p['hand' + side];
      if (ho) setHand(spec.hand[side], ho.shape ?? ho, ho.m ?? 1);
      if (ho && ho.curl) Object.assign(spec.hand[side], ho);
    }
    if (p.hands) for (const side of ['L', 'R']) setHand(spec.hand[side], p.hands);
    if (p.joints) spec.joints = p.joints;
    const mo = p.motion;
    if (mo) {
      if (mo.vel) spec.dyn.vel.copy(ctx.dir(mo.vel, mo.local));
      if (mo.spin !== undefined) spec.dyn.spin = mo.spin;
      if (mo.wind) spec.dyn.wind.copy(ctx.dir(mo.wind, mo.local));
    }
    const cl = p.cloth;
    if (cl) for (const k of ['flare', 'swirl', 'ripple', 'drag', 'sway', 'gust']) if (cl[k] !== undefined) spec.dyn[k] = cl[k];
  }

  // ------------------------------------------------------------------ per frame
  /**
   * t: film time (s). pose: see class doc. look: brightness, color ('romeo'|'juliet'|'union'|[r,g,b]), colorMix, halo,
   * aura, dissolve 0..1, collapse {point (world), k 0..1, radius}, dim 0..1, sparks 0..1, focus (m), aperture (m),
   * pulse {point (world), age (s) | t0, speed, width, strength}, size, ground, keep.
   */
  update(t, pose = 'stand', look = {}) {
    if (pose && pose.path) { pose = { ...pose }; this._applyPath(t, pose); }
    const ctx = this._ctx();
    this._resolve(t, pose, this.pose, 0, ctx);
    const P = this.pose;
    this.solver.forward(P);
    skinMatrices(this.rig, this.solver.W, this.solver.J, this.bones);
    this._lastT = t;
    // cloth
    if (this.garments.length) {
      this._buildColliders(P.dyn);
      for (const g of this.garments) g.solve(this.solver, this.colliders, P.dyn, t, this.clothTex);
      this.clothTex.tex.needsUpdate = true;
    }
    this._applyLook(t, look, P.dyn);
    return this;
  }

  _applyPath(t, pose) {
    const dt = 1 / 24;
    const a = pose.path(t), b = pose.path(t - dt);
    const o = this.object;
    o.position.set(a.position[0], a.position[1], a.position[2]);
    o.rotation.set(0, a.yaw ?? 0, 0);
    const vx = (a.position[0] - b.position[0]) / dt, vy = (a.position[1] - b.position[1]) / dt, vz = (a.position[2] - b.position[2]) / dt;
    let dyaw = (a.yaw ?? 0) - (b.yaw ?? 0); dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    pose.motion = { ...(pose.motion || {}), vel: [vx, vy, vz], spin: dyaw / dt };
    if (pose.preset === 'walk' || pose.preset === 'run') {
      // distance along the path drives the gait so feet stay planted on curves and speed changes
      if (pose.dist === undefined) {
        // arc length from t0 (any fixed reference works: it only shifts the gait phase)
        const t0 = pose.t0 ?? 0, span = t - t0;
        let d = 0; const N = Math.max(4, Math.ceil(Math.abs(span) * 8));
        let prev = pose.path(t0).position;
        for (let i = 1; i <= N; i++) { const q = pose.path(t0 + (span * i) / N).position; d += Math.hypot(q[0] - prev[0], q[2] - prev[2]) * Math.sign(span || 1); prev = q; }
        pose.dist = d;
      }
      if (pose.speed === undefined) pose.speed = Math.max(0.05, Math.hypot(vx, vz));
    }
  }

  _buildColliders(dyn) {
    const C = this.colliders, rig = this.rig, J = this.solver.J, W = this.solver.W, I = rig.idx, s = rig.s, F = this.F;
    C.reset();
    for (const side of ['L', 'R']) {
      const L = rig.leg[side];
      C.cap(J[L.th], J[L.sh], (F ? 0.078 : 0.075) * s, 1);
      C.cap(J[L.sh], J[L.ft], (F ? 0.052 : 0.05) * s, 1);
      const tip = posePoint(rig, W, J, rig.idx['toe' + side], rig.site['toeTip' + side].pos, _v);
      C.cap(J[L.ft], tip, 0.04 * s, 1);
      const A = rig.arm[side];
      C.cap(J[A.up], J[A.fore], (F ? 0.04 : 0.05) * s, 2);
      C.cap(J[A.fore], J[A.hand], (F ? 0.03 : 0.04) * s, 2);
    }
    if (F) {
      // the gown spans the gap between the legs: a midline capsule (hips -> knees) keeps the front panel over the lap
      const hm = _v.copy(J[rig.leg.L.th]).add(J[rig.leg.R.th]).multiplyScalar(0.5);
      const km = _v2.copy(J[rig.leg.L.sh]).add(J[rig.leg.R.sh]).multiplyScalar(0.5);
      C.cap(hm, km, 0.085 * s, 1);
    }
    // torso / head ellipsoids (posed by their bones)
    const E = (bone, c, r, g) => { posePoint(rig, W, J, I[bone], _v.set(c[0] * s, c[1] * s, c[2] * s), _v2); C.ell(_v2, W[I[bone]], r.map((x) => x * s), g); };
    if (F) {
      E('pelvis', [0, 0.93, -0.01], [0.17, 0.12, 0.115], 1);
      E('spine', [0, 1.06, -0.006], [0.105, 0.13, 0.08], 3);
      E('chest', [0, 1.245, -0.01], [0.128, 0.145, 0.098], 2);
      E('chest', [0, 1.315, -0.03], [0.155, 0.065, 0.078], 2);
      E('head', [0, 1.575, -0.012], [0.082, 0.105, 0.1], 2);
      C.cap(J[I.neck], J[I.head], 0.045 * s, 2);
    } else {
      E('pelvis', [0, 0.975, -0.005], [0.16, 0.105, 0.11], 1);
      E('spine', [0, 1.135, 0], [0.135, 0.135, 0.104], 3);
      E('chest', [0, 1.33, -0.004], [0.163, 0.178, 0.116], 2);
      E('chest', [0, 1.405, -0.036], [0.18, 0.075, 0.087], 2);
      E('head', [0, 1.69, -0.016], [0.09, 0.11, 0.105], 2);
      C.cap(J[I.neck], J[I.head], 0.058 * s, 2);
    }
    if (dyn.seat) C.seat = dyn.seat;
  }

  _applyLook(t, look, dyn) {
    const L = { ...LOOK_DEFAULTS, ...look };
    const u = this.u, e = this.e;
    u.uTime.value = t;
    u.uResY.value = e.H;
    const base = PALETTE[this.who];
    let core = base.core, halo = base.halo, irid = base.irid;
    if (L.color) {
      const C = typeof L.color === 'string' ? PALETTE[L.color] : { core: L.color, halo: L.halo || L.color.map((x) => x * 0.38), irid: base.irid };
      const m = clamp(L.colorMix);
      core = core.map((x, i) => lerp(x, C.core[i], m)); halo = halo.map((x, i) => lerp(x, (L.halo || C.halo)[i], m)); irid = lerp(irid, C.irid ?? irid, m);
    }
    u.uCore.value.setRGB(core[0], core[1], core[2]);
    u.uHalo.value.setRGB(halo[0], halo[1], halo[2]);
    u.uIrid.value = L.irid ?? irid;
    const pxs = e.px ?? e.H / 1080;
    u.uSizeW.value = 0.0055 * L.size * this.sizeFactor() * this.rig.s;
    u.uMinPx.value = Math.max(1, L.minPx * pxs);
    u.uMaxPx.value = Math.max(4, L.maxPx * pxs);
    u.uBright.value = 0.4 * L.brightness * Math.min(2, REF_COVERAGE / Math.max(0.05, this.geo.coverage));
    u.uKeep.value = L.keep;
    u.uRimPow.value = 2.2; u.uRimGain.value = 1.1 * L.rim; u.uBack.value = L.back; u.uFace.value = L.face; u.uInner.value = L.inner;
    u.uShimmer.value = L.shimmer; u.uGlint.value = L.glint; u.uHot.value = L.hot;
    u.uDissolve.value = clamp(L.dissolve); u.uDim.value = clamp(L.dim); u.uAura.value = L.aura; u.uSparks.value = clamp(L.sparks) * (1 - clamp(L.dim) * 0.8);
    u.uSparkRise.value = L.sparkRise;
    u.uFocus.value = L.focus; u.uAperture.value = L.aperture;
    u.uVel.value.copy(dyn.vel);
    this.object.updateMatrixWorld();
    _mi.copy(this.object.matrixWorld).invert();
    if (L.collapse && L.collapse.k > 0) {
      const c = L.collapse;
      const p = Array.isArray(c.point) ? _v.set(c.point[0], c.point[1], c.point[2]) : _v.copy(c.point);
      p.applyMatrix4(_mi);
      u.uCollapse.value.set(p.x, p.y, p.z, clamp(c.k));
      u.uCollapseR.value = c.radius ?? 0.1;
    } else u.uCollapse.value.w = 0;
    if (L.pulse) {
      const pl = L.pulse;
      const p = Array.isArray(pl.point) ? _v.set(pl.point[0], pl.point[1], pl.point[2]) : _v.copy(pl.point);
      p.applyMatrix4(_mi);
      const age = pl.age ?? (t - (pl.t0 ?? t));
      u.uPulse.value.set(age > 0 ? age : 0, pl.speed ?? 1.2, pl.width ?? 0.08, age > 0 ? (pl.strength ?? 3) : 0);
      u.uPulseP.value.copy(p);
    } else u.uPulse.value.set(0, 1, 0.1, 0);
    if (L.fade) { const f = L.fade; const p = _v.copy(f.point).applyMatrix4(_mi); u.uFade.value.set(p.x, p.y, p.z, f.radius); }
    else if (this.part === 'bust') {
      // fade out below the chest: the bust dissolves into darkness (negative radius = keep near the point)
      const nk = this.solver.J[this.rig.idx.neck];
      u.uFade.value.set(nk.x, nk.y + 0.05 * this.rig.s, nk.z, -(L.fadeLen ?? 0.36) * this.rig.s);
    } else if (this.part) {
      // fade toward the shoulder: the arm dissolves into darkness
      const sh = this.solver.J[this.rig.arm[this.part === 'armL' ? 'L' : 'R'].up];
      u.uFade.value.set(sh.x, sh.y, sh.z, (L.fadeLen ?? 0.32) * this.rig.s);
    } else u.uFade.value.w = 0;
    // ground glow
    const g = L.ground;
    this.ground.visible = g > 0;
    if (g > 0) {
      this.groundU.uCol.value.setRGB(halo[0], halo[1], halo[2]);
      this.groundU.uI.value = g * L.brightness * (1 - clamp(L.dissolve)) * (1 - 0.8 * clamp(L.dim));
      const J0 = this.solver.J[0];
      this.ground.position.set(J0.x, 0.004, J0.z);
      this.groundU.uR.value = 0.55 * this.rig.s;
    }
  }

  // ------------------------------------------------------------------ queries
  /** world position of a bone joint, a site (headTop, eyes, chestFront, back, palmL, ringR, indexTipL, toeTipR, heelL...)
   *  or a cloth point ('hem' front hem, 'hemBack', 'hemL', 'hemR', 'hairTip', 'capeTip'); model space if local=true */
  getJointWorld(name, out = new THREE.Vector3(), local = false) {
    const rig = this.rig, J = this.solver.J, W = this.solver.W;
    if (rig.idx[name] !== undefined) out.copy(J[rig.idx[name]]);
    else if (rig.site[name]) posePoint(rig, W, J, rig.site[name].bone, rig.site[name].pos, out);
    else if (name.startsWith('hem') && this.skirt) {
      const th = { hem: 0, hemBack: Math.PI, hemL: Math.PI / 2, hemR: -Math.PI / 2 }[name] ?? 0;
      this.skirt.hemPoint(th, out);
    } else if (name === 'hairTip' && this.hair) { const G = this.hair.G; out.copy(G.pts[Math.floor(G.rows / 2) * G.P + G.P - 1]); }
    else if (name === 'capeTip' && this.cape) { const G = this.cape.G; out.copy(G.pts[Math.floor(G.rows / 2) * G.P + G.P - 1]); }
    else out.copy(J[0]);
    if (!local) { this.object.updateMatrixWorld(); out.applyMatrix4(this.object.matrixWorld); }
    return out;
  }

  /** world rotation of a bone */
  getJointQuat(name, out = new THREE.Quaternion()) {
    this.object.updateMatrixWorld();
    this.object.getWorldQuaternion(_q);
    return out.copy(_q).multiply(this.solver.W[this.rig.idx[name]]);
  }

  /** set/clear visibility of the whole figure */
  set visible(v) { this.object.visible = v; }
  get visible() { return this.object.visible; }
}

/** rest-space site position adjusted by the spec's root offset (cheap approximation used for look-at) */
function posePointRest(rig, site, spec) {
  const p = rig.site[site].pos.clone();
  p.sub(rig.rest[0]).applyQuaternion(spec.rootQ).add(spec.root);
  return p;
}
