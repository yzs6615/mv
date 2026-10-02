// 51.36 - 56.6  "世界上的人 美丽都是洋洋洒洒": the camera cranes up from the flower shop into a voxel
// city. Every block is the same gray box, every roof carries the same smiling rose billboard, and
// the tiny voxel people march in lockstep down every street. They stay gray. In front of the shop
// the gardener's odd seed throws a glitching column of light into the sky; its light runs out
// through the streets, and from every gray head it passes a small flower pops out, each one a
// different shape and colour, and floats up over the roofs. On "洋洋洒洒" ripples run through
// the sky of flowers; diving back down to the street they melt away and the city is gray again.
// Rendered with three.js at 480x270 and snapped to the palette with ordered dithering.
import { P } from '../core/pal.js';
import { THREE, renderInto, pixelTexture } from '../core/three.js';
import { quantizePass } from '../core/post.js';
import { hash2, E, prog, lerp } from '../core/math.js';
import { env, ctx2d } from '../core/env.js';

const hex = (h) => new THREE.Color(h);

const BUILDING_VS = `
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying float vD;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vC = instanceColor;
  vec4 mv = viewMatrix * wp;
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const BUILDING_FS = `
uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform vec3 winCol; uniform vec3 litCol; uniform float windows;
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying float vD;
void main() {
  vec3 n = normalize(vN);
  float shade = n.y > 0.5 ? 1.0 : (abs(n.x) > 0.5 ? (n.x > 0.0 ? 0.8 : 0.6) : (n.z > 0.0 ? 0.7 : 0.5));
  vec3 col = vC * shade;
  if (windows > 0.5 && abs(n.y) < 0.5 && vW.y > 1.2) {
    float u = abs(n.x) > 0.5 ? vW.z : vW.x;
    float fu = fract(u * 0.5), fv = fract(vW.y * 0.5);
    if (fu > 0.3 && fu < 0.7 && fv > 0.35 && fv < 0.8) {
      float h = fract(sin(dot(floor(vec3(u * 0.5, vW.y * 0.5, n.x + n.z * 3.0)), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
      col = h > 0.94 ? litCol : winCol * shade;
    }
  }
  float f = clamp((vD - fogNear) / (fogFar - fogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
}`;

// the hidden flowers: 16x16 pixel heads in four shapes, ink outlined, one texture per shape and colour
const BEAM_COLS = [P.red, P.orange, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink];
const FLOWER_COLS = [P.red, P.orange, P.gold, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink, P.hot, P.peach, P.white];
function flowerCanvas(shape, col) {
  const S = 16, grid = new Array(S * S).fill(null);
  const put = (i, j, c) => { if (i >= 1 && j >= 1 && i < S - 1 && j < S - 1) grid[j * S + i] = c; };
  const disc = (cx, cy, r, c) => { for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r * r) put(i, j, c); };
  const centre = col === P.yellow || col === P.gold || col === P.white ? P.orange : P.yellow;
  const c = 8;
  if (shape === 0) { // five round petals
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; disc(c + Math.cos(a) * 3.4, c + Math.sin(a) * 3.4, 2.7, col); }
    disc(c, c, 1.9, centre);
  } else if (shape === 1) { // daisy: eight thin petals round a big centre
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; for (let r = 2; r <= 6.2; r += 0.5) put(Math.floor(c + Math.cos(a) * r), Math.floor(c + Math.sin(a) * r), col); }
    disc(c, c, 2.6, centre);
  } else if (shape === 2) { // tulip cup
    disc(c, c + 1, 4.6, col);
    for (let j = 0; j < 5; j++) for (let i = 2; i < 14; i++) grid[j * S + i] = null;
    for (const i of [4, 8, 12]) { put(i - 1, 5, col); put(i, 5, col); put(i, 4, col); put(i - 1, 4, col); put(i, 3, col); }
    put(c, 13, P.green); put(c, 14, P.green);
  } else { // four big petals in a cross
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) disc(c + dx * 3.3, c + dy * 3.3, 2.9, col);
    disc(c, c, 1.6, centre);
  }
  const cv = env.createCanvas(S, S), x = ctx2d(cv);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    let col2 = grid[j * S + i];
    if (!col2) {
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const a = i + dx, b = j + dy; if (a >= 0 && b >= 0 && a < S && b < S && grid[b * S + a]) { edge = true; break; } }
      if (!edge) continue;
      col2 = P.ink;
    }
    x.fillStyle = col2; x.fillRect(i, j, 1, 1);
  }
  return cv;
}

export default (ctx) => {
  const { m } = ctx;
  const T0 = 51.36, T1 = 56.6;
  // the seed's light: a column from the street in front of the shop, then a ring through the city
  const T_BEAM = 52.0, T_REL = 52.1, SPEED = 52, SRC = [4, 12];
  const SYL = [53.75, 54.17, 54.64, 54.97]; // 洋 洋 洒 洒
  const T_FADE = 55.4;
  let scene, cam, people, roses, N_PEOPLE, lines, beam, blooms, bloomOf;
  const SHOP = new THREE.Vector3(0, 0, 0);
  ctx.cue(T0, 'whoosh', { v: 0.5 });
  ctx.cue(T_BEAM, 'shine', { v: 0.55 });
  for (let i = 0; i < 7; i++) ctx.cue(T_REL + 0.12 + i * 0.34, 'twinkle', { v: 0.22 + 0.03 * (i % 3), p: 1 + i * 0.07 });
  SYL.forEach((t, i) => ctx.cue(t, 'pop', { v: 0.32, p: 1 + i * 0.18 }));
  ctx.cue(SYL[3] + 0.1, 'sparkle', { v: 0.3 });
  ctx.cue(T1 - 0.5, 'whoosh', { v: 0.6, p: 0.7 });

  function build() {
    scene = new THREE.Scene();
    const fog = hex(P.g2);
    scene.background = fog;
    cam = new THREE.PerspectiveCamera(50, 480 / 270, 0.5, 600);
    const bmat = new THREE.ShaderMaterial({
      vertexShader: BUILDING_VS, fragmentShader: BUILDING_FS,
      uniforms: { fogColor: { value: fog }, fogNear: { value: 40 }, fogFar: { value: 220 }, winCol: { value: hex(P.g5) }, litCol: { value: hex(P.yellow) }, windows: { value: 1 } },
    });
    // ground texture: streets, sidewalks, crossings (1 texel = 0.5 unit), grid of 12-unit blocks
    const G = 480, cv = env.createCanvas(G, G), x = ctx2d(cv);
    x.fillStyle = P.g4; x.fillRect(0, 0, G, G);
    for (let i = 0; i < G; i += 24) {
      x.fillStyle = P.g3; x.fillRect(i, 0, 2, G); x.fillRect(0, i, G, 2); x.fillRect(i + 14, 0, 2, G); x.fillRect(0, i + 14, G, 2);
      x.fillStyle = P.g5; x.fillRect(i + 2, 0, 12, G);
      x.fillRect(0, i + 2, G, 12);
    }
    for (let i = 0; i < G; i += 24) for (let j = 0; j < G; j += 24) { x.fillStyle = P.g2; x.fillRect(i + 16, j + 16, 8, 8); }
    for (let i = 0; i < G; i += 24) for (let k = 0; k < G; k += 4) { x.fillStyle = P.g1; x.fillRect(i + 7, k, 2, 2); }
    const tex = pixelTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-1, 0, -1);
    scene.add(ground);
    scene.fog = new THREE.Fog(fog, 40, 220);

    // buildings on 12-unit blocks (footprint 8x8 on the lot), mostly the same height
    const lots = [];
    for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) {
      if (i === 0 && j === 0) continue;
      let h = [10, 10, 10, 12, 10, 14, 10, 8][Math.floor(hash2(i + 20, j + 40) * 8)];
      if (Math.abs(i) <= 1 && Math.abs(j) <= 1) h = 5;
      lots.push([i * 12 + 4, j * 12 + 4, h]);
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const blds = new THREE.InstancedMesh(box, bmat, lots.length + 1);
    const M = new THREE.Matrix4(), col = new THREE.Color();
    lots.forEach(([bx, bz, h], k) => {
      M.makeScale(8, h, 8); M.setPosition(bx, 0, bz);
      blds.setMatrixAt(k, M);
      blds.setColorAt(k, col.set([P.g3, P.g3, P.g2, P.g3][k % 4]));
    });
    // the flower shop: a low peach building at the origin
    M.makeScale(8, 6, 8); M.setPosition(4, 0, 4);
    blds.setMatrixAt(lots.length, M);
    blds.setColorAt(lots.length, col.set(P.peach));
    scene.add(blds);
    SHOP.set(4, 3, 8);
    // neon + window of the shop
    const neon = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 0.3), new THREE.MeshBasicMaterial({ color: hex(P.pink), fog: true }));
    neon.position.set(4, 4.4, 8.2);
    scene.add(neon);
    const win = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.3), new THREE.MeshBasicMaterial({ color: hex(P.red), fog: true }));
    win.position.set(3, 1.6, 8.2);
    scene.add(win);

    // rose billboards on every other roof: pole + red head with a face
    const rose = new THREE.PlaneGeometry(3, 3);
    // rose face texture (the same smiley on every roof)
    const rc = env.createCanvas(16, 16), rx = ctx2d(rc);
    const ROSE = ['....kkkkkkkk....', '..kkRRRRrRRRkk..', '.kRRRRRrrRRRRRk.', '.kRRRrrrrrrRRRk.', 'kRRRRRRRRRRRRRRk', 'kRRRkkRRRRkkRRRk', 'kRRRkkRRRRkkRRRk', 'kRRRRRRRRRRRRRRk', 'kRRkRRRRRRRRkRRk', 'kRRRkRRRRRRkRRRk', '.kRRRkkkkkkRRRk.', '.kRRRRRRRRRRRRk.', '..kkRRRRRRRRkk..', '....kkkkkkkk....', '.......kk.......', '.......kk.......'];
    ROSE.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '.') return; rx.fillStyle = ch === 'k' ? P.redD : ch === 'r' ? P.redD : P.red; rx.fillRect(i, j, 1, 1); }));
    const rmat = new THREE.MeshBasicMaterial({ map: pixelTexture(rc), transparent: false, alphaTest: 0.5, fog: true, side: THREE.DoubleSide });
    const rlots = lots.filter((_, k) => k % 2 === 0);
    roses = new THREE.InstancedMesh(rose, rmat, rlots.length);
    roses.userData.lots = rlots;
    scene.add(roses);
    const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 2, 0.3), new THREE.MeshBasicMaterial({ color: hex(P.g4), fog: true }), rlots.length);
    rlots.forEach(([bx, bz, h], k) => { M.makeTranslation(bx, h + 1, bz); poles.setMatrixAt(k, M); });
    scene.add(poles);

    // people marching along the sidewalks in lines
    lines = [];
    for (let i = -9; i <= 9; i++) {
      lines.push({ axis: 'x', c: i * 12 - 1.5, v: 1.6, dir: i % 2 ? 1 : -1 });
      lines.push({ axis: 'z', c: i * 12 - 1.5, v: 1.6, dir: i % 2 ? -1 : 1 });
    }
    const PER = 26;
    N_PEOPLE = lines.length * PER;
    people = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 1.8, 0.8).translate(0, 0.9, 0), new THREE.MeshLambertMaterial({ color: hex(P.g4), fog: true }), N_PEOPLE);
    people.userData.PER = PER;
    scene.add(people);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 0.7).translate(0, 2.15, 0), new THREE.MeshLambertMaterial({ color: hex(P.g1), fog: true }), N_PEOPLE);
    people.userData.heads = heads;
    scene.add(heads);
    scene.add(new THREE.HemisphereLight(hex(P.white), hex(P.g4), 2.2));

    // the seed's column of light: a white core in a glitching rainbow sleeve (two planes turned to
    // the camera, the core a hair in front)
    beam = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 90).translate(0, 45, 0), new THREE.MeshBasicMaterial({ color: hex(P.yellow), fog: false, side: THREE.DoubleSide }));
    const core = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 90).translate(0, 45, 0.08), new THREE.MeshBasicMaterial({ color: hex(P.white), fog: false, side: THREE.DoubleSide }));
    beam.add(sleeve, core);
    beam.userData.sleeve = sleeve;
    beam.position.set(SRC[0], 0, SRC[1]);
    beam.visible = false;
    scene.add(beam);

    // one hidden flower per person, released when the light reaches them; grouped by shape+colour
    const quad = new THREE.PlaneGeometry(1, 1);
    const groups = new Map();
    bloomOf = [];
    const pos = [0, 0];
    for (let k = 0; k < N_PEOPLE; k++) {
      personAt(k, T_REL, pos);
      const rel = T_REL + Math.hypot(pos[0] - SRC[0], pos[1] - SRC[1]) / SPEED;
      personAt(k, rel, pos);
      const b = {
        rel, x: pos[0], z: pos[1], d: Math.hypot(pos[0] - SRC[0], pos[1] - SRC[1]),
        hgt: 9 + hash2(k, 31) * 13, ph: hash2(k, 37) * 6.283, size: 1.5 + hash2(k, 41) * 0.7, fade: hash2(k, 43),
      };
      bloomOf.push(b);
      const key = Math.floor(hash2(k, 7) * 4) * 100 + Math.floor(hash2(k, 13) * FLOWER_COLS.length);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(k);
    }
    blooms = [];
    for (const [key, ks] of groups) {
      const mat = new THREE.MeshBasicMaterial({ map: pixelTexture(flowerCanvas(Math.floor(key / 100), FLOWER_COLS[key % 100])), alphaTest: 0.5, fog: false, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(quad, mat, ks.length);
      mesh.frustumCulled = false;
      scene.add(mesh);
      blooms.push({ mesh, ks });
    }
  }

  // where person k is at time t (the same lockstep march as update())
  function personAt(k, t, out) {
    const PER = 26, L = lines[Math.floor(k / PER)], i = k % PER;
    const along = ((i / PER) * 228 + L.dir * L.v * (t - T0) * 6) % 228;
    const a = ((along + 228) % 228) - 114;
    if (L.axis === 'x') { out[0] = a; out[1] = L.c; } else { out[0] = L.c; out[1] = a; }
    return out;
  }

  function updateBlooms(t) {
    const M = new THREE.Matrix4(), p = new THREE.Vector3(), sv = new THREE.Vector3(), q = cam.quaternion;
    for (const { mesh, ks } of blooms) {
      ks.forEach((k, j) => {
        const b = bloomOf[k], age = t - b.rel;
        let s = 0;
        if (age > 0) {
          const pop = age < 0.3 ? E.outBack(age / 0.3, 2.4) : 1;
          // ripples through the sky of flowers on 洋 洋 洒 洒
          let rip = 0;
          for (const ts of SYL) if (t > ts) rip = Math.max(rip, Math.exp(-(((t - ts) * 115 - b.d) ** 2) / 180));
          const fade = 1 - prog(t, T_FADE + b.fade * 0.45, T_FADE + 0.25 + b.fade * 0.45, E.inQ);
          s = b.size * pop * (1 + 0.75 * rip) * fade;
          const w = Math.min(1, age);
          p.set(
            b.x + 0.9 * Math.sin(1.1 * t + b.ph) * w,
            2.6 + b.hgt * (1 - Math.exp(-age * 1.15)) + 0.35 * Math.sin(2.3 * t + b.ph) + 1.6 * rip,
            b.z + 0.9 * Math.cos(0.9 * t + b.ph * 1.3) * w,
          );
        }
        sv.set(Math.max(s, 1e-4), Math.max(s, 1e-4), 1);
        M.compose(p, q, sv);
        mesh.setMatrixAt(j, M);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    // the column of light: snaps on, flickers through the rainbow, thins away
    const on = t > T_BEAM && t < 54.9;
    beam.visible = on;
    if (on) {
      const w = prog(t, T_BEAM, T_BEAM + 0.15, E.outBack) * (1 - prog(t, 54.2, 54.9, E.inQ)) * (1 + 0.18 * Math.sin(t * 40));
      beam.scale.set(Math.max(w, 1e-3), 1, 1);
      beam.rotation.y = Math.atan2(cam.position.x - SRC[0], cam.position.z - SRC[1]);
      beam.userData.sleeve.material.color.set(BEAM_COLS[Math.floor(t * 12) % BEAM_COLS.length]);
    }
  }

  function update(t) {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const PER = people.userData.PER, heads = people.userData.heads;
    const step = m.pulse(t, 10);
    let k = 0;
    for (const L of lines) {
      for (let i = 0; i < PER; i++) {
        const along = ((i / PER) * 228 + L.dir * L.v * (t - T0) * 6) % 228;
        const a = ((along + 228) % 228) - 114;
        if (L.axis === 'x') p.set(a, step * 0.15, L.c); else p.set(L.c, step * 0.15, a);
        M.compose(p, q, s);
        people.setMatrixAt(k, M);
        heads.setMatrixAt(k, M);
        k++;
      }
    }
    people.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    // roses: every billboard pulses together on the beat, the one standard smile
    const rl = roses.userData.lots;
    rl.forEach(([bx, bz, h], j) => {
      const sc = 1 + 0.25 * m.pulse(t, 8);
      p.set(bx, h + 3.2, bz);
      const yaw = Math.atan2(cam.position.x - bx, cam.position.z - bz);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      M.compose(p, q, new THREE.Vector3(sc, sc, sc));
      roses.setMatrixAt(j, M);
    });
    roses.instanceMatrix.needsUpdate = true;
  }

  function cameraAt(t) {
    // crane up from the shop, orbit, dive
    const k1 = prog(t, T0, 53.4, E.ioC);
    const k2 = prog(t, 52.8, 55.5, E.ioQ);
    const k3 = prog(t, 55.3, 56.4, E.inQ);
    const start = new THREE.Vector3(6, 13, 26), high = new THREE.Vector3(-30, 52, 60);
    const ang = lerp(0.45, 1.25, k2), R = 78;
    const orbit = new THREE.Vector3(Math.sin(ang) * R - 6, 50 - 6 * k2, Math.cos(ang) * R);
    const pos = start.clone().lerp(high, k1);
    if (t > 52.8) pos.lerp(orbit, k2);
    const look = new THREE.Vector3(4, 3.5, 6).lerp(new THREE.Vector3(0, 0, -10), k1);
    if (k3 > 0) {
      const dive = new THREE.Vector3(30, 3, 20);
      pos.lerp(dive, k3);
      look.lerp(new THREE.Vector3(30, 2, 0), k3);
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.fov = lerp(50, 60, k3);
    cam.updateProjectionMatrix();
  }

  return {
    id: 'flyover', t0: T0, t1: T1,
    enter: { type: 'mosaic' },
    init() { build(); },
    draw(g, t) {
      cameraAt(t);
      update(t);
      updateBlooms(t);
      renderInto(g, scene, cam);
    },
    post(g) { quantizePass(g, 1, [P.ink, P.g5, P.g4, P.g3, P.g2, P.g1, P.white, P.red, P.redD, P.hot, P.yellow, P.gold, P.peach, P.tan, P.pink, P.orange, P.green, P.cyan, P.blue, P.magenta]); },
  };
};
