import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from '../fx/sky.js';
import { cached, paper } from './verona.js';
import * as V from './verona_art.js';
import { PaperLayer } from '../fx/paper.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import * as A from './ballroom_art.js';
import * as F from './ballroom_fx.js';
import { buildIsland } from './ballroom_island.js';

// =====================================================================================================
// THE GREAT HALL OF PALAZZO CAPULET — masquerade ball (shots 1.3 – 1.10)
// A pop-up-book interior in strict one-point symmetry: paper-cut arcades on hinges, folded-paper
// columns, five candle chandeliers, a polished black-marble floor with mirror reflections, fifty
// masked couples as paper puppets on rods waltzing in a deterministic line of dance.
// World: 1 unit = 1 m, y up, floor y = 0, centre line x = 0, the hall runs along z (camera at the
// front looks toward -z, the great window). Hall centre (the medallion) at z = -14.
// =====================================================================================================

const H = A.HALL;
export const BALLROOM = {
  floorY: 0,
  centreX: 0,
  centre: [0, 0, H.zc],                          // the floor medallion: where the lovers dance (1.9)
  hall: { xMin: -H.outerX, xMax: H.outerX, zFront: H.zFront, zBack: H.zBack, ceilY: H.ceilY },
  nave: { halfWidth: H.naveX },
  entrance: [0, 0, H.zFront - 1.0],              // Romeo's doorway (front wall, warm light behind him)
  entranceLook: [0, 1.6, H.zc],
  juliet: [0, 0, H.zBack + 6.5],                 // Juliet across the hall, in front of the great window
  window: { x: 0, z: H.zBack, y0: H.win.y0, top: 17.2, width: H.win.w },
  // parallel walk (1.6): a row of columns separates the two lanes
  colonnadeX: H.naveX,                           // inner colonnade (columns at x = +-7.5)
  aisleLaneX: 10.6,                              // walk lane inside the side aisle (behind the columns)
  naveLaneX: 5.4,                                // walk lane in the nave, in front of the columns
  outerColumnsX: H.outerX,                       // outer wall (pilasters)
  columnZ: Array.from({ length: 8 }, (_, i) => H.zc + 21 - i * 6), // free-standing columns, front -> back
  walkZ: [H.zc + 18, H.zc - 18],
  chandelierZ: [H.zc + 20, H.zc + 10, H.zc, H.zc - 10, H.zc - 20],
  chandelierY: 9.0,
  island: { centre: [0, 0, H.zc], radius: 11.5 },
};

// ---- dance clock: integrate speed(t) * (1 - freeze(t)); specs are numbers, [[t, v], ...] keys or functions
const evalSpec = (s, t, d) => (s === undefined || s === null ? d : typeof s === 'number' ? s : typeof s === 'function' ? s(t) : keyAt(s, t));
function keyAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length; if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1]; const u = (t - t0) / (t1 - t0);
  return v0 + (v1 - v0) * (u * u * (3 - 2 * u));
}
/** dance-clock seconds at film time t. Constant numbers integrate analytically (v * t); keyframes/functions
 *  are integrated numerically from `from` (default 0) so slowing down never makes dancers jump. */
export function danceClock(t, speed = 1, freeze = 0, from = 0) {
  const sNum = typeof speed !== 'object' && typeof speed !== 'function', fNum = typeof freeze !== 'object' && typeof freeze !== 'function';
  if (sNum && fNum) return (speed ?? 1) * (1 - (freeze ?? 0)) * t;
  // piecewise: constant before the first key, numerical inside, linear after the last key
  const f = (x) => evalSpec(speed, x, 1) * (1 - clamp(evalSpec(freeze, x, 0)));
  const kt = (s) => (Array.isArray(s) ? [s[0][0], s[s.length - 1][0]] : null);
  const ks = [kt(speed), kt(freeze)].filter(Boolean);
  let a = ks.length ? Math.min(...ks.map((k) => k[0])) : from, b = ks.length ? Math.max(...ks.map((k) => k[1])) : t;
  if (typeof speed === 'function' || typeof freeze === 'function') { a = Math.min(a, from); b = Math.max(b, t); }
  let acc = f(a - 1) * Math.min(t, a);           // before the varying region (constant rate from 0)
  const t1 = Math.min(t, b);
  if (t1 > a) { const n = Math.max(8, Math.ceil((t1 - a) / 0.02)); const h = (t1 - a) / n; let s = 0; for (let i = 0; i < n; i++) s += f(a + (i + 0.5) * h); acc += s * h; }
  if (t > b) acc += f(b + 1) * (t - b);
  return acc;
}

// stadium lane (two straights along z joined by semicircles), parameterised by arc length
function lanePoint(L, s) {
  const { a, h, cz } = L, P = 4 * h + 2 * Math.PI * a;
  s = ((s % P) + P) % P;
  if (s < 2 * h) return [a, cz + h - s, -Math.PI / 2];                                      // right side, moving -z
  s -= 2 * h; if (s < Math.PI * a) { const q = s / a; return [a * Math.cos(q), cz - h - a * Math.sin(q), -Math.PI / 2 - q]; }
  s -= Math.PI * a; if (s < 2 * h) return [-a, cz - h + s, Math.PI / 2];                     // left side, moving +z
  s -= 2 * h; const q = s / a; return [-a * Math.cos(q), cz + h + a * Math.sin(q), Math.PI / 2 - q];
}

const flop = (u) => { u = clamp(u); const g = u * u * (3 - 2 * u * 0.6) / 2.4 * 2.4; const k = Math.min(1, g); return k < 1 ? k : 1 + Math.sin((u - 1) * 20) * 0; };
const fold = (c, a, b) => { const u = clamp((c - a) / (b - a)); return u < 0.82 ? Math.pow(u / 0.82, 2.2) : 1 + 0.05 * Math.sin((u - 0.82) / 0.18 * Math.PI) ; };

export class BallroomSet {
  constructor(e) {
    this.e = e;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, e.W / e.H, 0.1, 4000);
    this.anchors = BALLROOM;
    const rig = this.rig = F.createRig();
    rig.uPx.value = e.px;
    const P = paper(e);
    const N = cached(e, 'int.noise', () => A.noiseTex());
    this.noise = N;
    const T = (k, f) => cached(e, k, f);
    const tex = {
      arcade: T('bal.arcade', () => A.arcadeBayArt()), outer: T('bal.outer', () => A.outerBayArt()), back: T('bal.back', () => A.backWallArt()),
      front: T('bal.front', () => A.frontWallArt()), ceil: T('bal.ceil', () => A.ceilingArt()), banner: T('bal.banner', () => A.bannerArt()),
      marble: T('int.marble', () => A.marbleTex()),
    };
    this.tex = tex;
    const card = (t, o) => F.cardMaterial(rig, t, P, N, o);
    this.cardMats = [];
    const addCard = (t, o) => { const m = card(t, o); m.userData.glowK0 = m.uniforms.uGlowK.value; this.cardMats.push(m); return m; };
    this.embers = [];
    const addEmbers = (mesh, t, n, seed, { w, h, uvScale = [1, 1], x0 = null, y0 = 0, plane = 'xy', size = [w, h] }) => {
      const smp = F.samplePaper(t, n, seed, { w, h, uvScale, x0, y0 });
      const pos = smp.pos;
      if (plane === 'xz') for (let i = 0; i < pos.length; i += 3) { const y = pos[i + 1]; pos[i + 1] = 0; pos[i + 2] = y; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aUV', new THREE.BufferAttribute(smp.uv, 2));
      const sd = new Float32Array((pos.length / 3) * 2); const rr = rng(seed + 5); for (let i = 0; i < sd.length; i++) sd[i] = rr(); g.setAttribute('aS', new THREE.BufferAttribute(sd, 2));
      const mat = F.emberMaterial(rig, N, size);
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 113; mesh.add(pts); this.embers.push(pts);
      return pts;
    };

    // ---- sky (open hall) and cheap night backdrop (closed hall, seen through windows) -------------
    this.sky = new Sky({ radius: 2500 });
    this.sky.apply('night');
    this.sky.mesh.onBeforeRender = (r, s, cam) => { this.sky.mesh.position.copy(cam.position); this.sky.mesh.updateMatrixWorld(); this.sky.uniforms.uCenter.value.copy(cam.position); };
    this.scene.add(this.sky.mesh);
    this.backMat = F.backdropMaterial();
    this.backdrop = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.backMat);
    this.backdrop.renderOrder = 90; this.backdrop.frustumCulled = false;
    this.backdrop.onBeforeRender = (r, s, cam) => { this.backdrop.position.copy(cam.position); this.backdrop.updateMatrixWorld(); this.backMat.uniforms.uCenter.value.copy(cam.position); };
    this.scene.add(this.backdrop);
    // Verona outside the great window (shares the cached skyline art with the Verona set)
    this.skyline = new PaperLayer(cached(e, 'art.skyline', () => V.skylineArt()), P, { z: H.zBack - 210, x: 6, y: 4.5, scale: 0.3, fogDensity: 0.0016,
      ink: [0.003, 0.004, 0.009], inkTop: [0.008, 0.01, 0.02], rim: [0.09, 0.1, 0.15], fog: [0.02, 0.026, 0.05], fogTop: [0.012, 0.016, 0.034], win: [3.6, 1.75, 0.55], winOn: 0.42 });
    this.skyline.mesh.renderOrder = 2;
    this.scene.add(this.skyline.pivot);

    // ---- floor + planar reflection --------------------------------------------------------------
    this.floorMat = F.floorMaterial(rig, tex.marble, N);
    const fl = new THREE.PlaneGeometry(2 * H.outerX, H.zFront - H.zBack, 28, 54); fl.rotateX(-Math.PI / 2); fl.translate(0, 0, (H.zFront + H.zBack) / 2);
    this.floor = new THREE.Mesh(fl, this.floorMat);
    this.floor.renderOrder = -50; this.floor.frustumCulled = false;
    this.scene.add(this.floor);
    this.refl = new F.PlanarReflection(e, this.floor, this.floorMat, rig, { scale: 1 / 3 });

    // ---- architecture rig ----------------------------------------------------------------------------
    const hallLen = H.zFront - H.zBack, zc = H.zc;
    const solid = this.solidMat = F.solidMaterial(rig, P, { albedo: 0.55, fresK: 0.9 });
    this.parts = [];
    const mkSide = (s) => { // s = -1 left, +1 right
      const inner = new THREE.Group(); inner.position.set(s * H.naveX, 0, zc);
      const outer = new THREE.Group(); outer.position.set(s * H.outerX, 0.0, zc);
      // arcade card (faces the nave)
      const g = new THREE.PlaneGeometry(hallLen, H.ceilY, 54, 19); g.translate(0, H.ceilY / 2, 0);
      const am = addCard(tex.arcade, { uvScale: [hallLen / H.bay, 1], rimPx: 3, albedo: 0.1, rimK: 1.1, size: [hallLen, H.ceilY] });
      const arc = new THREE.Mesh(g, am); arc.rotation.y = -s * Math.PI / 2; arc.frustumCulled = false; arc.renderOrder = 20;
      inner.add(arc);
      addEmbers(arc, tex.arcade, 700, 11 + s, { w: hallLen, h: H.ceilY, uvScale: [hallLen / H.bay, 1] });
      // outer wall card
      const go = new THREE.PlaneGeometry(hallLen, H.ceilY, 27, 10); go.translate(0, H.ceilY / 2, 0);
      const om = addCard(tex.outer, { uvScale: [hallLen / H.bay, 1], uvOff: [0, 0], rimPx: 2, albedo: 0.1, glowK: 1.0, flicker: 0.15, size: [hallLen, H.ceilY], sconce: 6.0 });
      const ow = new THREE.Mesh(go, om); ow.rotation.y = -s * Math.PI / 2; ow.frustumCulled = false; ow.renderOrder = 10;
      outer.add(ow);
      addEmbers(ow, tex.outer, 450, 21 + s, { w: hallLen, h: H.ceilY, uvScale: [hallLen / H.bay, 1] });
      // ceiling half hinged at the top of the outer wall
      const hinge = new THREE.Group(); hinge.position.set(0, H.ceilY, 0); outer.add(hinge);
      const gc = new THREE.PlaneGeometry(H.outerX, hallLen, 7, 27); gc.rotateX(Math.PI / 2); gc.translate(-s * H.outerX / 2, 0, 0);
      const cm = addCard(tex.ceil, { uvScale: [0.5, hallLen / H.bay], uvOff: [s < 0 ? 0 : 0.5, 0], rimPx: 2, albedo: 0.22, wrap: 0.0, height: 1e9, giltK: 1.1, size: [H.outerX, hallLen] });
      const ceil = new THREE.Mesh(gc, cm); ceil.frustumCulled = false; ceil.renderOrder = 5;
      hinge.add(ceil);
      addEmbers(ceil, tex.ceil, 450, 31 + s, { w: H.outerX, h: hallLen, x0: -s * H.outerX / 2 - H.outerX / 2, y0: -hallLen / 2, plane: 'xz', size: [H.outerX, hallLen] });
      // transverse beams (half spans) under the ceiling
      const beams = [];
      for (let k = 0; k <= 9; k++) {
        const bz = (H.zFront - zc) - k * H.bay;
        const b = new THREE.BoxGeometry(H.outerX, 0.75, 0.55); b.translate(-s * H.outerX / 2, -0.375, bz);
        beams.push(b.toNonIndexed());
      }
      const bg = mergeGeometries(beams); bg.computeVertexNormals(); F.withCol(bg, [0.8, 0.7, 0.62]);
      const bm = new THREE.Mesh(bg, this.beamSolid || (this.beamSolid = F.solidMaterial(rig, P, { albedo: 0.25, fresK: 0.05 }))); bm.frustumCulled = false; hinge.add(bm);
      // columns (folded-paper octagonal prisms)
      const colGeo = cached(e, 'bal.colGeo', () => columnGeometry());
      const cols = [];
      for (let k = 0; k <= 9; k++) {
        const cz = (H.zFront - zc) - k * H.bay;
        const c = colGeo.clone(); c.translate(0, 0, cz); cols.push(c);
      }
      const cg = mergeGeometries(cols);
      const cmesh = new THREE.Mesh(cg, solid); cmesh.frustumCulled = false; inner.add(cmesh);
      // arch soffits (intrados ribbons through the wall thickness)
      const sof = [];
      for (let k = 0; k < 9; k++) sof.push(soffitGeometry((H.zFront - zc) - (k + 0.5) * H.bay, H.imposTop, (H.bay - 1.1) / 2, 0.45));
      const sg = mergeGeometries(sof); sg.computeVertexNormals(); F.withCol(sg, [1.25, 1.1, 1.0]);
      const smesh = new THREE.Mesh(sg, solid); smesh.frustumCulled = false; inner.add(smesh);
      // banners on the free-standing columns
      const banners = [];
      BALLROOM.columnZ.forEach((z, i) => {
        const bmat = addCard(tex.banner, { cloth: true, sway: 0.06, swayPhase: i * 1.7 + s, rimPx: 2, albedo: 0.35, wrap: 0.6, rimK: 0.8, height: 1e9, giltK: 1.3, size: [1.7, 6.2] });
        const geo = new THREE.PlaneGeometry(1.7, 6.2, 2, 10); geo.translate(0, -3.1, 0);
        const m = new THREE.Mesh(geo, bmat); m.scale.setScalar(0.74); m.position.set(-s * 0.78, 12.3, z - zc); m.rotation.y = -s * Math.PI / 2; m.frustumCulled = false; m.renderOrder = 30;
        inner.add(m); banners.push(m);
      });
      this.scene.add(inner); this.scene.add(outer);
      return { s, inner, outer, hinge, arc, ow, ceil, banners, solids: [cmesh, smesh, bm] };
    };
    this.left = mkSide(-1); this.right = mkSide(1);
    // back wall (great window) and front wall (grand doorway)
    this.backPivot = new THREE.Group(); this.backPivot.position.set(0, 0, H.zBack); this.scene.add(this.backPivot);
    const gb = new THREE.PlaneGeometry(2 * H.outerX, H.ceilY, 28, 19); gb.translate(0, H.ceilY / 2, 0);
    this.backWall = new THREE.Mesh(gb, addCard(tex.back, { rimPx: 2.5, albedo: 0.1, glowK: 1.0, flicker: 0.08, size: [2 * H.outerX, H.ceilY] }));
    this.backWall.frustumCulled = false; this.backWall.renderOrder = 12; this.backPivot.add(this.backWall);
    addEmbers(this.backWall, tex.back, 600, 41, { w: 2 * H.outerX, h: H.ceilY });
    for (const bx of [-4.6, 4.6]) {
      const geo = new THREE.PlaneGeometry(1.7, 6.2, 2, 10); geo.translate(0, -3.1, 0);
      const m = new THREE.Mesh(geo, addCard(tex.banner, { cloth: true, sway: 0.05, swayPhase: bx, rimPx: 2, albedo: 0.35, wrap: 0.6, rimK: 0.8, height: 1e9, giltK: 1.3, size: [1.7, 6.2] }));
      m.position.set(bx, 15.8, 0.35); m.frustumCulled = false; m.renderOrder = 31; this.backPivot.add(m);
    }
    this.frontPivot = new THREE.Group(); this.frontPivot.position.set(0, 0, H.zFront); this.scene.add(this.frontPivot);
    const gfw = new THREE.PlaneGeometry(2 * H.outerX, H.ceilY, 28, 19); gfw.translate(0, H.ceilY / 2, 0);
    this.frontWall = new THREE.Mesh(gfw, addCard(tex.front, { rimPx: 2.5, albedo: 0.1, glowK: 1.0, flicker: 0.1, size: [2 * H.outerX, H.ceilY] }));
    this.frontWall.rotation.y = Math.PI; this.frontWall.frustumCulled = false; this.frontWall.renderOrder = 12; this.frontPivot.add(this.frontWall);
    addEmbers(this.frontWall, tex.front, 600, 51, { w: 2 * H.outerX, h: H.ceilY });

    // ---- moon beam through the great window -------------------------------------------------------
    this.beamMat = F.beamMaterial(rig, N);
    const bgeo = new THREE.BoxGeometry(1, 1, 1); bgeo.translate(0.5, 0.5, 0.5);
    this.beam = new THREE.Mesh(bgeo, this.beamMat); this.beam.matrixAutoUpdate = false; this.beam.frustumCulled = false; this.beam.renderOrder = 120;
    this.scene.add(this.beam);

    // ---- chandeliers ----------------------------------------------------------------------------------
    this.chandeliers = BALLROOM.chandelierZ.map((z, i) => this.makeChandelier(z, i));

    // ---- dancers ----------------------------------------------------------------------------------------
    this.buildDancers();

    // ---- golden dust ------------------------------------------------------------------------------------
    {
      const n = 2600, r = rng(4242), seeds = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) seeds[i] = r();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
      this.dustMat = F.dustMaterial(rig, { min: [-13, 0, H.zBack + 1], size: [26, 17.5, H.zFront - H.zBack - 2] });
      this.dust = new THREE.Points(g, this.dustMat); this.dust.frustumCulled = false; this.dust.renderOrder = 110;
      this.scene.add(this.dust);
    }

    // ---- floating island, cloud sea, Verona's lights far below (shots 1.9 - 1.10) ---------------------
    this.island = buildIsland(e, rig, this);
    this.scene.add(this.island.group);
    this.refl.hide.push(...this.island.hideInReflection);

    this.extra = [];
    this._v = new THREE.Vector3();
    // camera-dependent sorting happens right before Three uploads attributes (works with any camera
    // the shot renders with; skipped for the mirror pass, which shares the main camera's x/z)
    this.scene.onBeforeRender = (r, sc, cam) => { if (!this.refl.busy) this.frame(cam); };
  }

  // ------------------------------------------------------------------------------------------------------
  makeChandelier(z, idx) {
    const e = this.e, rig = this.rig;
    const pivot = new THREE.Group(); pivot.position.set(0, H.ceilY, z); this.scene.add(pivot);
    const body = new THREE.Group(); pivot.add(body);
    const chainLen = H.ceilY - BALLROOM.chandelierY - 2.2;
    const chain = new THREE.Mesh(withColGeo(new THREE.CylinderGeometry(0.022, 0.022, 1, 4, 1), [0.5, 0.45, 0.4]), this.solidMat);
    chain.frustumCulled = false; pivot.add(chain);
    const geo = cached(e, 'bal.chandGeo', () => chandelierGeometry());
    const frame = new THREE.Mesh(geo.frame, this.chandMat || (this.chandMat = F.solidMaterial(rig, paper(e), { albedo: 0.5, fresK: 1.2, near: 6.0, ink: [0.03, 0.022, 0.014], inkB: [0.06, 0.035, 0.012], emis: 0.02 })));
    frame.frustumCulled = false; body.add(frame);
    const flames = new THREE.Points(geo.flames, this.flameMat || (this.flameMat = F.flameMaterial(rig, { size: 0.16 })));
    flames.frustumCulled = false; flames.renderOrder = 115; body.add(flames);
    const glints = new THREE.Points(geo.crystals, this.glintMat || (this.glintMat = F.glintMaterial(rig, { size: 0.09 })));
    glints.frustumCulled = false; glints.renderOrder = 116; body.add(glints);
    return { pivot, body, chain, chainLen, z, idx, frame, flames, glints, nCandles: geo.nCandles };
  }

  buildDancers() {
    const e = this.e, rig = this.rig;
    const atlas = cached(e, 'bal.dancers', () => A.dancerAtlas());
    this.atlas = atlas;
    const r = rng(1717);
    const lanes = [{ a: 6.0, h: 14, n: 21, v: 0.78 }, { a: 4.25, h: 12, n: 17, v: 0.7 }, { a: 2.5, h: 10, n: 12, v: 0.62 }];
    const couples = [];
    lanes.forEach((L, li) => {
      L.cz = H.zc;
      const per = 4 * L.h + 2 * Math.PI * L.a;
      for (let k = 0; k < L.n; k++) {
        couples.push({
          lane: L, s0: (k + 0.35 * (r() - 0.5)) / L.n * per, v: L.v * (0.94 + 0.12 * r()), off: (r() - 0.5) * 0.5,
          spin0: r() * Math.PI * 2, spinW: (Math.PI * 2 / 4.03) * (0.9 + 0.2 * r()) * (r() < 0.12 ? -1 : 1),
          variant: Math.floor(r() * 8), mirror: r() < 0.5 ? -1 : 1, seed: r(), scale: 0.94 + 0.12 * r(), side: r() < 0.5 ? -1 : 1,
          pal: [Math.floor(r() * 8), Math.floor(r() * 4)], li,
        });
      }
    });
    this.couples = couples;
    const n = couples.length;
    const base = new THREE.PlaneGeometry(A.CELL_W, A.CELL_H, 4, 6); base.translate(0, A.CELL_H / 2, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv; g.attributes.normal = base.attributes.normal;
    this.dPose = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.dInfo = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.dPal = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    this.dPose.setUsage(THREE.DynamicDrawUsage); this.dInfo.setUsage(THREE.DynamicDrawUsage); this.dPal.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPose', this.dPose); g.setAttribute('aInfo', this.dInfo); g.setAttribute('aPal', this.dPal);
    g.instanceCount = n;
    this.dancerMat = F.dancerMaterial(rig, atlas.tex, this.noise);
    this.dancers = new THREE.Mesh(g, this.dancerMat); this.dancers.frustumCulled = false; this.dancers.renderOrder = 60;
    this.scene.add(this.dancers);
    // petals: 36 per couple, origins sampled inside each variant's silhouette
    const per = 36, m = n * per;
    const pet = new Float32Array(m * 4), cid = new Float32Array(m), rp = rng(3131);
    couples.forEach((c, i) => {
      const smp = atlas.samples[c.variant];
      for (let k = 0; k < per; k++) {
        const [u, v] = smp[(k * 7 + i) % smp.length];
        const j = i * per + k;
        pet[j * 4] = u; pet[j * 4 + 1] = v * A.CELL_H / A.CELL_H; pet[j * 4 + 2] = rp() * 0.8; pet[j * 4 + 3] = rp();
        cid[j] = i;
      }
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 3), 3));
    pg.setAttribute('aPet', new THREE.BufferAttribute(pet, 4)); pg.setAttribute('aCouple', new THREE.BufferAttribute(cid, 1));
    this.petalMat = F.petalMaterial(rig, { size: 0.09 });
    this.petals = new THREE.Points(pg, this.petalMat); this.petals.frustumCulled = false; this.petals.renderOrder = 112;
    this.scene.add(this.petals);
  }

  // ------------------------------------------------------------------------------------------------------
  /**
   * Configure the whole set for film time t. Every shot must pass every parameter it relies on.
   * params (all optional):
   *   danceSpeed  number | [[t, v], ...] | fn(t)   time warp of the waltz (1 = normal; ramp to ~0.05 for 1.5)
   *   freeze      number | keys | fn               0..1 multiplier holding the dance (integrated with danceSpeed)
   *   danceClock  number                           explicit dance-clock seconds (overrides the two above)
   *   part        0..1      couples drift aside to open a corridor along partFrom -> partTo (default centre line)
   *   partFrom, partTo  [x, z]   corridor ends (default Romeo's doorway -> Juliet)
   *   dissolve    0..1      couples burn into rising light petals, spreading from dissolveOrigin [x, z]
   *   colourBleed 0..1      warm colour seeps through the ink world from bleedOrigin [x, z] (default hall centre)
   *   chandelierLift metres the chandeliers rise (1.8); crown 0..1 gathers them into a ring above the centre
   *   sway        0..1      chandelier pendulum amplitude multiplier (default 1)
   *   candles     0..1+     candle intensity (default 1);  flicker 0..1 (default 1)
   *   collapse    0..1      pop-up collapse: ceiling opens, walls fold flat and burn into light, sky revealed
   *   island      0..1      floor shrinks to the floating island (1.10); clouds 0..1; city 0..1
   *   sky         'night' | 'deepNight' (sky preset when open), skyBlend [b, m]
   *   haze        multiplier (default 1); moon 0..1 moonlight through the great window; dust 0..1
   *   dancers     0..1      dancer opacity (0 hides them)
   *   extraLights [{ pos:[x,y,z], color:[r,g,b], intensity }]  up to 3 (the lovers' glow lights the hall)
   *   light       global multiplier on all practical light (fades)
   */
  update(t, p = {}) {
    const rig = this.rig, e = this.e;
    rig.uTime.value = t; rig.uPx.value = e.px;
    const collapse = clamp(p.collapse ?? 0), island = clamp(p.island ?? 0);
    const light = p.light ?? 1;
    const clock = p.danceClock ?? danceClock(t, p.danceSpeed ?? 1, p.freeze ?? 0, p.danceFrom ?? 0);
    this.clock = clock;
    // ---- chandeliers -----------------------------------------------------------------------------------
    const lift = p.chandelierLift ?? 0, crown = clamp(p.crown ?? 0), sway = p.sway ?? 1;
    const candles = (p.candles ?? 1) * light;
    const ccol = [1.0, 0.6, 0.28];
    this.chandeliers.forEach((c, i) => {
      const ang = (i / this.chandeliers.length) * Math.PI * 2 + 0.3;
      const ringR = 11.5;
      const lx = lerp(0, Math.cos(ang) * ringR, crown), lz = lerp(c.z, H.zc + Math.sin(ang) * ringR, crown);
      const ly = H.ceilY + lift + crown * 4;
      c.pivot.position.set(lx, ly, lz);
      const ph = i * 1.37;
      c.pivot.rotation.x = sway * 0.018 * Math.sin(t * 0.55 + ph) * (1 + 0.6 * crown);
      c.pivot.rotation.z = sway * 0.014 * Math.sin(t * 0.43 + ph * 2.1) * (1 + 0.6 * crown);
      c.body.position.y = -c.chainLen - 2.2;
      c.chain.scale.y = c.chainLen; c.chain.position.y = -c.chainLen / 2;
      c.chain.visible = collapse < 0.15 && crown < 0.5;
      c.body.rotation.y = 0.15 * Math.sin(t * 0.21 + ph);
      // the chandelier's light: centre of the candle rings
      c.body.updateWorldMatrix(true, false);
      const wp = this._v.set(0, 0.55, 0).applyMatrix4(c.body.matrixWorld);
      const fl = 1 + 0.04 * Math.sin(t * 7.3 + i * 3.1) * Math.sin(t * 3.1 + i) * (p.flicker ?? 1);
      rig.uLP.value[i].copy(wp);
      rig.uLC.value[i].set(ccol[0], ccol[1], ccol[2]).multiplyScalar(70 * candles * fl);
    });
    this.flameMat.uniforms.uGain.value = Math.min(1.5, candles); this.flameMat.uniforms.uFlick.value = p.flicker ?? 1;
    this.glintMat.uniforms.uGain.value = candles;
    // extra lights (lovers)
    for (let k = 0; k < 3; k++) {
      const L = (p.extraLights || [])[k];
      const i = 5 + k;
      if (L) { rig.uLP.value[i].set(...L.pos); rig.uLC.value[i].set(...L.color).multiplyScalar(L.intensity ?? 1); }
      else rig.uLC.value[i].set(0, 0, 0);
    }
    // ---- look: haze, moon, bleed ---------------------------------------------------------------------
    const open = smoothstep(0.0, 0.5, collapse);
    const haze = (p.haze ?? 1) * (1 - 0.85 * open);
    rig.uScat.value = 0.0003 * haze; rig.uScatT.value = 0.0062 * haze; rig.uFogD.value = 0.011 * haze + 0.0005;
    rig.uHazeMax.value = 90;
    rig.uMoonOn.value = (p.moon ?? 1) * (1 - smoothstep(0.1, 0.4, collapse));
    rig.uBleed.value = clamp(p.colourBleed ?? p.colorBleed ?? 0);
    const bo = p.bleedOrigin || [0, H.zc]; rig.uBleedO.value.set(bo[0], 0, bo[1]);
    rig.uAmb.value.setRGB(0.006, 0.0055, 0.0055).multiplyScalar(light * (1 + 1.5 * rig.uBleed.value));
    // ---- pop-up collapse -------------------------------------------------------------------------------
    this.applyCollapse(collapse, island, t);
    // ---- dancers --------------------------------------------------------------------------------------
    this.updateDancers(t, clock, p);
    // ---- dust --------------------------------------------------------------------------------------------
    this.dustMat.uniforms.uGain.value = (p.dust ?? 1) * light * (1 - 0.7 * open);
    this.dust.visible = (p.dust ?? 1) > 0;
    // ---- sky / backdrop ---------------------------------------------------------------------------------
    const skyName = p.sky || 'night';
    if (p.skyBlend) this.sky.apply(skyName, p.skyBlend[0], p.skyBlend[1]); else this.sky.apply(skyName);
    this.sky.uniforms.uTime.value = t;
    this.sky.mesh.visible = collapse > 0.001 || island > 0;
    this.backdrop.visible = !this.sky.mesh.visible;
    this.backMat.uniforms.uTime.value = t;
    this.backMat.uniforms.uMoonD.value.copy(rig.uMoonDir.value);
    this.sky.uniforms.uMoonDir.value.copy(p.moonDir ? this._v.set(...p.moonDir).normalize() : rig.uMoonDir.value);
    // moon beam box: window rectangle extruded into the hall against the moon direction
    const md = rig.uMoonDir.value, W = H.win, len = 46;
    const m = this.beam.matrix;
    m.set(W.w + 0.4, 0, -md.x * len, -W.w / 2 - 0.2,
      0, 14.4, -md.y * len, W.y0 - 0.1,
      0, 0, -md.z * len, H.zBack + 0.05,
      0, 0, 0, 1);
    this.beam.matrixWorldNeedsUpdate = true;
    this.beamMat.uniforms.uInv.value.copy(m).invert();
    this.beamMat.uniforms.uGain.value = 0.022 * (p.moon ?? 1) * (p.beam ?? 1) * (1 - smoothstep(0.05, 0.3, collapse));
    this.beam.visible = this.beamMat.uniforms.uGain.value > 0;
    // island / clouds / city
    this.island.update(t, { island, collapse, clouds: p.clouds ?? island, city: p.city ?? island, light });
    this.floorMat.uniforms.uIsland.value = island;
    this.floorMat.uniforms.uReflK.value = (p.reflect ?? 0.85);
    for (const mt of this.cardMats) mt.uniforms.uTime.value = t;
    this.skyline.set('uTime', t);
    if (island > 0 || collapse > 0) this.sky.uniforms.uClouds.value = 0;
    const cl = p.clouds ?? island;
    if (cl > 0) { // horizon matches the moonlit cloud sea
      const su = this.sky.uniforms, k = clamp(cl);
      su.uBand.value.lerp(new THREE.Color(0.012, 0.012, 0.018), k);
      su.uHorizon.value.lerp(new THREE.Color(0.034, 0.04, 0.072), k);
      su.uGround.value.lerp(new THREE.Color(0.03, 0.036, 0.065), k);
    }
    if (p.moonSize) this.sky.uniforms.uMoonSize.value = p.moonSize;
    this.skyline.pivot.visible = collapse < 0.5 && island < 0.01;
  }

  applyCollapse(c, island, t) {
    // 0 .. 0.35  ceiling halves swing open (hinged at the outer wall tops)
    // 0.2 .. 0.8 arcades, outer walls, end walls fold outward like a pop-up book closing
    // 0.62 .. 1  the flattened paper burns into rising light
    const ceilA = Math.PI / 2 * fold(c, 0.0, 0.35);
    const inA = Math.PI / 2 * fold(c, 0.18, 0.62), outA = Math.PI / 2 * fold(c, 0.3, 0.78);
    const endA = Math.PI / 2 * fold(c, 0.24, 0.72);
    for (const S of [this.left, this.right]) {
      const s = S.s;
      S.hinge.rotation.z = -s * ceilA;
      S.inner.rotation.z = -s * inA; S.inner.scale.x = 1 - 0.97 * smoothstep(0.0, 1.0, inA / (Math.PI / 2));
      S.inner.position.y = 0.03;
      S.outer.rotation.z = -s * outA;
    }
    this.backPivot.rotation.x = -endA; this.frontPivot.rotation.x = endA;
    const burn = smoothstep(0.42, 0.92, c);
    const glowFade = 1 - smoothstep(0.12, 0.4, c);
    for (const m of this.cardMats) { m.uniforms.uBurn.value = burn; m.uniforms.uBurnSeed.value = 0.37; m.uniforms.uGlowK.value = m.userData.glowK0 * glowFade; if (m.userData.sconce0 === undefined) m.userData.sconce0 = m.uniforms.uSconce.value; m.uniforms.uSconce.value = m.userData.sconce0 * glowFade; }
    for (const em of this.embers) { em.material.uniforms.uBurn.value = burn; em.visible = burn > 0 && burn < 1.2; }
    this.solidMat.uniforms.uOpacity.value = 1;
    this.beamSolid.uniforms.uOpacity.value = 1;
    this.solidMat.uniforms.uOpacity.value = 1;
    // solid pieces (columns, soffits, beams) shrink into the paper as it burns
    const keep = 1 - smoothstep(0.45, 0.85, c);
    for (const S of [this.left, this.right]) { S.solids.forEach((m) => { m.visible = keep > 0.02; m.scale.y = Math.max(0.001, keep); }); }
    const vis = c < 0.995;
    for (const S of [this.left, this.right]) { S.inner.visible = vis; S.outer.visible = vis; }
    this.backPivot.visible = vis; this.frontPivot.visible = vis;
    this.beam.visible = this.beam.visible && c < 0.3;
    void island; void t;
  }

  updateDancers(t, clock, p) {
    const cs = this.couples, n = cs.length;
    const part = clamp(p.part ?? 0), dissolve = clamp(p.dissolve ?? 0);
    const pa = p.partFrom || [BALLROOM.entrance[0], BALLROOM.entrance[2]], pb = p.partTo || [BALLROOM.juliet[0], BALLROOM.juliet[2]];
    const ax = pb[0] - pa[0], az = pb[1] - pa[1], al = Math.hypot(ax, az) || 1, ux = ax / al, uz = az / al;
    const dO = p.dissolveOrigin || [0, H.zc];
    const vis = p.dancers ?? 1;
    this.dancers.visible = vis > 0; this.petals.visible = vis > 0 && dissolve > 0;
    this.dancerMat.uniforms.uOpacity.value = clamp(vis);
    const cam = p.camera || null;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      const s = c.s0 + c.v * clock;
      let [x, z, heading] = lanePoint(c.lane, s);
      // small lateral wander so lanes don't look like rails
      x += Math.cos(heading) * 0 + c.off * Math.cos(s * 0.3 + c.seed * 9);
      // parting: push away from the corridor line, a wave travelling from Romeo toward Juliet
      if (part > 0) {
        const rx = x - pa[0], rz = z - pa[1];
        const along = clamp((rx * ux + rz * uz) / al);
        const perp = rx * -uz + rz * ux;
        const lp = smoothstep(0, 1, clamp(part * 1.5 - along * 0.5));
        const W = 2.4, sg = Math.abs(perp) < 0.05 ? c.side : Math.sign(perp);
        const push = sg * W * Math.exp(-(perp * perp) / (2.5 * 2.5)) * lp;
        x += -uz * push; z += ux * push;
      }
      const spin = c.spin0 + c.spinW * clock;
      // local dissolve front spreading from the origin
      const dd = Math.hypot(x - dO[0], z - dO[1]);
      const ld = clamp(dissolve * 1.6 - dd / 28 - c.seed * 0.15);
      rows.push({ i, x, z, spin, ld, d2: 0 });
    }
    // sort back-to-front for clean edge blending
    if (cam) for (const r of rows) r.d2 = -((r.x - cam.position.x) ** 2 + (r.z - cam.position.z) ** 2);
    const order = cam ? [...rows].sort((a, b) => a.d2 - b.d2) : rows;
    const P = this.dPose.array, I = this.dInfo.array, C = this.dPal.array;
    const pu = this.petalMat.uniforms;
    order.forEach((r, k) => {
      const c = cs[r.i];
      P[k * 4] = r.x; P[k * 4 + 1] = r.z; P[k * 4 + 2] = r.spin; P[k * 4 + 3] = c.scale;
      I[k * 4] = c.variant; I[k * 4 + 1] = c.mirror; I[k * 4 + 2] = c.seed; I[k * 4 + 3] = r.ld;
      C[k * 2] = c.pal[0]; C[k * 2 + 1] = c.pal[1];
    });
    rows.forEach((r) => { const c = cs[r.i]; pu.uPose.value[r.i].set(r.x, r.z, r.spin, c.scale); pu.uInfo.value[r.i].set(c.variant, c.mirror, c.seed, r.ld); });
    pu.uSpiralO.value.set(dO[0], 0, dO[1]);
    this.dPose.needsUpdate = true; this.dInfo.needsUpdate = true; this.dPal.needsUpdate = true;
  }

  /** sorts dancers and cloud billboards back-to-front for this camera (called automatically before rendering) */
  frame(camera = this.camera) {
    this.island.sort(camera);
    const cs = this.couples;
    const P = this.dPose.array, I = this.dInfo.array, C = this.dPal.array, n = cs.length;
    const rows = [];
    for (let k = 0; k < n; k++) rows.push([P[k * 4], P[k * 4 + 1], P[k * 4 + 2], P[k * 4 + 3], I[k * 4], I[k * 4 + 1], I[k * 4 + 2], I[k * 4 + 3], C[k * 2], C[k * 2 + 1]]);
    const cx = camera.position.x, cz = camera.position.z;
    rows.sort((a, b) => ((b[0] - cx) ** 2 + (b[1] - cz) ** 2) - ((a[0] - cx) ** 2 + (a[1] - cz) ** 2));
    rows.forEach((r, k) => { for (let j = 0; j < 4; j++) { P[k * 4 + j] = r[j]; I[k * 4 + j] = r[4 + j]; } C[k * 2] = r[8]; C[k * 2 + 1] = r[9]; });
    this.dPose.needsUpdate = true; this.dInfo.needsUpdate = true; this.dPal.needsUpdate = true;
  }
}

// =====================================================================================================
// geometry builders
// =====================================================================================================
function withColGeo(g, col) { return F.withCol(g, col); }

/** octagonal folded-paper column: plinth, torus, shaft with entasis, necking, bell capital, abacus */
function columnGeometry() {
  const prof = [[0.0, 0], [0.64, 0], [0.64, 0.3], [0.56, 0.33], [0.56, 0.4], [0.5, 0.44], [0.47, 0.52], [0.43, 0.6], [0.39, 0.64],
    [0.37, 0.7], [0.365, 2.4], [0.35, 4.4], [0.32, 6.05], [0.35, 6.1], [0.35, 6.2], [0.32, 6.23], [0.34, 6.4], [0.41, 6.6], [0.5, 6.76], [0.58, 6.84],
    [0.64, 6.86], [0.64, 7.0], [0.0, 7.0]].map(([r, y]) => new THREE.Vector2(r, y));
  let g = new THREE.LatheGeometry(prof, 8);
  g = g.toNonIndexed(); g.computeVertexNormals();
  // flutes: alternate facets slightly darker (paper scoring), via aCol
  const n = g.attributes.position.count, col = new Float32Array(n * 3), pos = g.attributes.position.array;
  for (let i = 0; i < n; i += 3) {
    const cx = (pos[i * 3] + pos[i * 3 + 3] + pos[i * 3 + 6]) / 3, cz = (pos[i * 3 + 2] + pos[i * 3 + 5] + pos[i * 3 + 8]) / 3;
    const a = Math.atan2(cz, cx); const k = Math.round(((a / (Math.PI * 2)) * 8 + 8)) % 2;
    for (let j = 0; j < 3; j++) { const v = k ? 1.0 : 0.82; col[(i + j) * 3] = v * 1.2; col[(i + j) * 3 + 1] = v * 1.1; col[(i + j) * 3 + 2] = v; }
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.rotateY(Math.PI / 8);
  return g;
}

/** arch intrados ribbon through the wall thickness (local: x across the wall, z along the hall) */
function soffitGeometry(zMid, ys, r, half) {
  const seg = 14, pos = [];
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg;
    const p0 = [ys + r * Math.sin(a0), zMid + r * Math.cos(a0)], p1 = [ys + r * Math.sin(a1), zMid + r * Math.cos(a1)];
    const v = (x, p) => [x, p[0], p[1]];
    const A0 = v(-half, p0), B0 = v(half, p0), A1 = v(-half, p1), B1 = v(half, p1);
    pos.push(...A0, ...B0, ...B1, ...A0, ...B1, ...A1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** chandelier: rings, arms, stem, finial (frame); candle-flame points; hanging crystal points */
function chandelierGeometry() {
  const parts = [], flames = [], fseed = [], crystals = [], cseed = [];
  const r = rng(808);
  const metal = [1.0, 0.85, 0.6], wax = [26, 23, 18];
  const add = (g, col) => { const gg = g.toNonIndexed(); gg.computeVertexNormals(); F.withCol(gg, col); parts.push(gg); };
  const rings = [{ R: 1.65, y: 0, n: 18 }, { R: 1.12, y: 0.78, n: 12 }, { R: 0.6, y: 1.5, n: 8 }];
  for (const ring of rings) {
    const t = new THREE.TorusGeometry(ring.R, 0.04, 5, 40); t.rotateX(Math.PI / 2); t.translate(0, ring.y, 0); add(t, metal);
    // drip pan under the ring
    const pan = new THREE.TorusGeometry(ring.R, 0.018, 4, 40); pan.rotateX(Math.PI / 2); pan.translate(0, ring.y - 0.1, 0); add(pan, metal);
    for (let k = 0; k < 6; k++) { // arms from the stem
      const a = (k / 6) * Math.PI * 2 + ring.y;
      const arm = new THREE.CylinderGeometry(0.018, 0.018, 1, 4, 1);
      const len = ring.R; arm.rotateZ(Math.PI / 2); arm.scale(len, 1, 1); arm.translate(len / 2, 0, 0); arm.rotateY(-a); arm.translate(0, ring.y - 0.22, 0);
      add(arm, metal);
      const up = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4, 1); up.translate(Math.cos(a) * ring.R, ring.y - 0.11, Math.sin(a) * ring.R); add(up, metal);
    }
    for (let k = 0; k < ring.n; k++) {
      const a = (k / ring.n) * Math.PI * 2 + ring.y * 0.7;
      const x = Math.cos(a) * ring.R, z = Math.sin(a) * ring.R;
      const cup = new THREE.CylinderGeometry(0.05, 0.03, 0.05, 6, 1); cup.translate(x, ring.y + 0.03, z); add(cup, metal);
      const h = 0.13 + 0.08 * r();
      const candle = new THREE.CylinderGeometry(0.022, 0.024, h, 6, 1); candle.translate(x, ring.y + 0.05 + h / 2, z); add(candle, wax);
      flames.push(x, ring.y + 0.06 + h + 0.035, z); fseed.push(r());
    }
    // crystal drops hanging below the ring
    const nd = Math.round(ring.R * 22);
    for (let k = 0; k < nd; k++) {
      const a = (k / nd) * Math.PI * 2;
      const sag = 0.12 + 0.1 * Math.abs(Math.sin(a * 3));
      crystals.push(Math.cos(a) * ring.R * 0.98, ring.y - 0.14 - sag, Math.sin(a) * ring.R * 0.98); cseed.push(r());
      if (k % 2 === 0) { crystals.push(Math.cos(a) * ring.R * 0.97, ring.y - 0.3 - sag, Math.sin(a) * ring.R * 0.97); cseed.push(r()); }
    }
  }
  const stem = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6, 1); stem.translate(0, 0.95, 0); add(stem, metal);
  for (const [y, rr] of [[-0.25, 0.16], [0.35, 0.12], [1.2, 0.1], [2.0, 0.09]]) { const b = new THREE.SphereGeometry(rr, 6, 4); b.translate(0, y, 0); add(b, metal); }
  const fin = new THREE.ConeGeometry(0.1, 0.5, 6, 1); fin.rotateX(Math.PI); fin.translate(0, -0.6, 0); add(fin, metal);
  // a cascade of crystals from the bottom finial
  for (let k = 0; k < 24; k++) { const a = k * 2.399; const rr = 0.05 + 0.35 * Math.sqrt(k / 24); crystals.push(Math.cos(a) * rr, -0.35 - 0.6 * (k / 24) - 0.1 * r(), Math.sin(a) * rr); cseed.push(r()); }
  const frame = mergeGeometries(parts);
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(flames, 3)); fg.setAttribute('aSeed', new THREE.Float32BufferAttribute(fseed, 1));
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(crystals, 3)); cg.setAttribute('aSeed', new THREE.Float32BufferAttribute(cseed, 1));
  return { frame, flames: fg, crystals: cg, nCandles: fseed.length };
}
