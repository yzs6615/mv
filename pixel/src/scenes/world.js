// 212.57 - 232.0  Coda in 3D: the world map, with no HUD at all.
//  L36 "每一朵花 都有自己的枝丫"  from the gardener's flower the camera climbs and pulls back over a voxel
//                               island covered in flowers, every one built differently
//  (L37-L38 are 2D: party.js plays on top)
//  L39 "我们全都是 唯一 Only one" an extreme pull-back to straight overhead: the island itself is a flower,
//                               five petals of colour around a meadow, floating in a blue sea
import { P, HUES, RAINBOW } from '../core/pal.js';
import { THREE, renderInto, voxelMaterial } from '../core/three.js';
import { quantizePass } from '../core/post.js';
import { hash2, hash3, E, prog, lerp, rng, noise2 } from '../core/math.js';
import { titleText } from '../art/ui.js';
import { burst } from '../art/fx.js';

const C = (h) => new THREE.Color(h);
const PETAL_HUES = [[P.red, P.pink, P.hot], [P.gold, P.yellow, P.orange], [P.cyan, P.blue, P.white], [P.magenta, P.pink, P.purple], [P.orange, P.red, P.gold]];

export default (ctx) => {
  const { m } = ctx;
  const T0 = 212.45, T_L39 = 227.0, T_ONLY = 229.83, T1 = 232.4;
  let scene, cam, clouds, sea, bigHead;
  ctx.cue(T0 + 0.1, 'whoosh', { v: 0.6, p: 0.8 });
  ctx.cue(T_L39, 'whoosh', { v: 0.7, p: 0.6 });

  // island radius at angle a: five petals
  const coast = (a) => 46 + 14 * Math.cos(5 * a) + 3 * Math.sin(3 * a + 1);
  function build() {
    scene = new THREE.Scene();
    const skyCol = P.cyan;
    scene.background = C(skyCol);
    cam = new THREE.PerspectiveCamera(50, 480 / 270, 0.5, 2000);
    const mat = voxelMaterial(skyCol, 140, 900);
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    // terrain columns (2x2 cells)
    const cells = [];
    for (let x = -64; x <= 64; x += 2) for (let z = -64; z <= 64; z += 2) {
      const r = Math.hypot(x, z), a = Math.atan2(z, x);
      const R = coast(a);
      if (r > R) continue;
      const h = 1 + Math.round(2 * (1 - r / R) + noise2(x * 0.08, z * 0.08, 3));
      cells.push({ x, z, r, a, R, h: Math.max(1, h) });
    }
    const land = new THREE.InstancedMesh(box, mat, cells.length);
    cells.forEach((c, i) => {
      M.makeScale(2, c.h, 2); M.setPosition(c.x, 0, c.z);
      land.setMatrixAt(i, M);
      const beach = c.r > c.R - 3;
      const center = c.r < 13;
      land.setColorAt(i, col.set(beach ? P.peach : center ? P.green : (hash2(c.x, c.z) < 0.5 ? P.greenM : P.green)));
    });
    scene.add(land);
    // flowers: stems and plus-shaped heads, coloured by petal with personal variation
    const stems = [], heads = [];
    cells.forEach((c) => {
      if (c.r > c.R - 3 || c.r < 3) return;
      const n = c.r < 13 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        if (hash3(c.x, c.z, k) < (c.r < 13 ? 0.55 : 0.25)) continue;
        const fx = c.x - 0.5 + hash3(c.x, c.z, k + 7) * 1.4, fz = c.z - 0.5 + hash3(c.z, c.x, k + 9) * 1.4;
        const fh = 0.8 + hash3(c.x, k, c.z) * 1.6;
        const petal = ((Math.round((c.a / (Math.PI * 2)) * 5) % 5) + 5) % 5;
        const pal = c.r < 13 ? HUES : PETAL_HUES[petal];
        const hc = hash3(c.x * 3, c.z * 5, k) < 0.15 ? HUES[Math.floor(hash3(c.z, c.x, 11) * HUES.length)] : pal[Math.floor(hash3(c.x, c.z, k + 3) * pal.length)];
        stems.push([fx, c.h, fz, fh]);
        heads.push([fx, c.h + fh, fz, hc, 0.5 + hash3(c.x, c.z, 21) * 0.5]);
      }
    });
    const stemM = new THREE.InstancedMesh(box, mat, stems.length);
    stems.forEach(([x, y, z, h], i) => { M.makeScale(0.25, h, 0.25); M.setPosition(x, y, z); stemM.setMatrixAt(i, M); stemM.setColorAt(i, col.set(P.greenM)); });
    scene.add(stemM);
    const plus = new THREE.BoxGeometry(1, 0.5, 0.34).translate(0, 0.25, 0);
    const plus2 = new THREE.BoxGeometry(0.34, 0.5, 1).translate(0, 0.25, 0);
    const headM = new THREE.InstancedMesh(plus, mat, heads.length);
    const headM2 = new THREE.InstancedMesh(plus2, mat, heads.length);
    heads.forEach(([x, y, z, c, s], i) => { M.makeScale(s * 1.4, s, s * 1.4); M.setPosition(x, y, z); headM.setMatrixAt(i, M); headM2.setMatrixAt(i, M); headM.setColorAt(i, col.set(c)); headM2.setColorAt(i, col.set(c)); });
    scene.add(headM); scene.add(headM2);
    // the gardener's flower at the centre: a big lopsided voxel bloom
    bigHead = new THREE.Group();
    const hm = (w, h, d, c, x, y, z) => { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, d), mat, 1); im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, y, z)); im.setColorAt(0, C(c)); bigHead.add(im); };
    hm(0.8, 9, 0.8, P.greenM, 0, 7, 0);
    hm(2.2, 0.6, 1, P.green, -1.4, 5, 0);
    hm(2, 0.6, 1, P.cyan, 1.3, 7.5, 0);
    const petalsC = [P.red, P.orange, P.gold, P.green, P.cyan, P.blue, P.magenta];
    petalsC.forEach((c, i) => { const a = (i / 7) * Math.PI * 2; const s = 1.4 + (i % 3) * 0.6; hm(s, 0.8, s, c, Math.cos(a) * 2.2, 11.5 + (i % 2) * 0.3, Math.sin(a) * 2.2); });
    hm(1.6, 1, 1.6, P.gold, 0, 11.8, 0);
    scene.add(bigHead);
    // sea with a shallow ring
    sea = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshBasicMaterial({ color: C(P.blue) }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0.2;
    scene.add(sea);
    const shallow = new THREE.Mesh(new THREE.RingGeometry(40, 75, 64), new THREE.MeshBasicMaterial({ color: C(P.cyan) }));
    shallow.rotation.x = -Math.PI / 2; shallow.position.y = 0.25;
    scene.add(shallow);
    // clouds
    clouds = new THREE.InstancedMesh(box, mat, 60);
    for (let i = 0; i < 60; i++) {
      const g = Math.floor(i / 6), k = i % 6;
      const a = hash2(g, 1) * Math.PI * 2, d = 50 + hash2(g, 2) * 120;
      M.makeScale(6 + hash2(i, 3) * 8, 2 + hash2(i, 4) * 2, 5 + hash2(i, 5) * 6);
      M.setPosition(Math.cos(a) * d + k * 4 - 10, 48 + hash2(g, 6) * 14, Math.sin(a) * d + (k % 3) * 3);
      clouds.setMatrixAt(i, M);
      clouds.setColorAt(i, col.set(P.white));
    }
    scene.add(clouds);
  }

  function cameraAt(t) {
    const look = new THREE.Vector3(0, 8, 0);
    let pos;
    if (t < T_L39) {
      // L36: from beside the big flower, climbing and orbiting out
      const k = prog(t, T0, T0 + 4.6, E.ioC);
      const a = lerp(-0.3, 0.9, k);
      const d = lerp(30, 120, k), h = lerp(16, 70, k);
      pos = new THREE.Vector3(Math.sin(a) * d, h, Math.cos(a) * d);
      look.set(0, lerp(9, 0, k), 0);
    } else {
      // L39: rise to straight overhead and pull far back
      const k = prog(t, T_L39, T_ONLY + 0.3, E.ioC);
      const a = lerp(0.9, 2.4, k);
      const d = lerp(120, 2, k), h = lerp(70, 300, k);
      pos = new THREE.Vector3(Math.sin(a) * d, h, Math.cos(a) * d);
      look.set(0, 0, 0);
    }
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    if (t >= T_L39 && prog(t, T_L39, T_ONLY + 0.3) > 0.85) cam.up.set(0, 0, -1);
    cam.lookAt(look);
    cam.updateProjectionMatrix();
  }

  return {
    id: 'world', t0: T0, t1: T1,
    enter: { type: 'dissolve', dur: 0.4 },
    init() { build(); },
    draw(g, t) {
      cameraAt(t);
      bigHead.rotation.y = Math.sin(t * 0.8) * 0.15;
      clouds.position.x = (t - T0) * 1.5;
      renderInto(g, scene, cam);
    },
    post(g) { quantizePass(g, 1); },
    over(g, t) { if (t > T_L39 && t < T_L39 + 0.35) g.drect(0, 0, g.W, g.H, P.white, 1 - prog(t, T_L39, T_L39 + 0.35, E.outQ)); },
    ui(g, t) {
      if (t > T_ONLY) {
        const a = t - T_ONLY;
        const drop = Math.round((1 - E.outBack(Math.min(1, a / 0.4))) * -60);
        titleText(g, 'ONLY ONE', g.W / 2, 96 + drop, { font: 'en', scale: 4, top: P.yellow, bot: P.orange, split: 4 });
        burst(g, g.W / 2, 112, a - 0.3, { n: 12, r: 120, sy: 0.4, cols: RAINBOW });
      }
    },
  };
};
