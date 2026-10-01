import * as THREE from 'three';
import { clamp, smoothstep, lerp, rng } from '../core/math.js';
import { LightFigure } from './figure.js';

// Shot 1.7 — two hands of light reaching for each other in extreme close-up (after Michelangelo's
// Creation of Adam). Each hand is a high-detail LightFigure limited to the arm ('part'), ~50k particles,
// fading into darkness toward the shoulder. The index fingertips meet exactly at `contactTime`; at contact
// a pulse of light runs up both arms and a LightRipple expands from the contact point.

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// --------------------------------------------------------------------------------------------
// LightRipple: concentric rings + outward dust from a point, camera-facing (or in a given plane)
// --------------------------------------------------------------------------------------------
const RIP_VERT = /* glsl */`
uniform float uAge, uSpeed, uPx, uResY, uBright, uDelay, uLife, uKeep;
uniform vec3 uCenter, uE1, uE2; uniform vec3 uCol;
attribute vec4 aR;
varying vec3 vCol; varying float vA;
void main(){
  float ring = position.x, th = position.y, kind = position.z; // kind 0 ring, 1 dust, 2 contact flash
  float age = uAge - ring * uDelay;
  if (kind > 1.5) age = uAge + 0.06; // the flash starts just before the touch completes
  if (age <= 0.) { gl_Position = vec4(0., 0., -2., 1.); gl_PointSize = 0.; vCol = vec3(0.); vA = 0.; return; }
  float r, I, size;
  if (kind > 1.5) {
    // a star at the point of contact: tight, very bright, gone in a third of a second
    r = 0.012 * pow(aR.x, 2.) * (1. + age * 2.);
    I = 6. * exp(-age / 0.12) * smoothstep(0.0, 0.03, age) * (0.4 + 0.6 * aR.y);
    size = 1.5 + 2.5 * aR.z;
  } else if (kind < 0.5) {
    r = uSpeed * age * (1. - 0.12 * ring) + (aR.x - 0.5) * 0.004 * (1. + age * 5.);
    I = exp(-age / uLife) * (0.35 + 0.65 * aR.y) * smoothstep(0.0, 0.06, r) * 0.9 / (1. + ring * 0.35);
    size = 1.6 + aR.z * 1.6;
  } else {
    float sp = uSpeed * (0.25 + 1.1 * aR.x);
    r = sp * age * (1. - 0.25 * age);
    I = exp(-age / (uLife * 0.7)) * pow(aR.y, 3.) * 0.3 * smoothstep(0.0, 0.03, r);
    size = 1.4 + aR.z * 2.2;
  }
  float tw = 0.75 + 0.25 * sin(age * 30. * aR.w + aR.x * 50.);
  vec3 p = uCenter + (uE1 * cos(th) + uE2 * sin(th)) * r;
  vec4 mv = viewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, size * uPx);
  vCol = uCol * I * tw * uBright;
  vA = clamp(min(1., I * 8.) * uKeep, 0., 1.); // coverage: the rings carry the colour-keep mask outward
}`;
const RIP_FRAG = /* glsl */`
varying vec3 vCol; varying float vA;
void main(){ vec2 c = gl_PointCoord * 2. - 1.; float r2 = dot(c, c); if (r2 > 1.) discard; float g = exp(-r2 * 3.5); gl_FragColor = vec4(vCol * g, vA * g); }`;

export class LightRipple {
  constructor(e, { rings = 4, perRing = 1400, dust = 1400, flash = 240, seed = 5 } = {}) {
    this.e = e;
    const R = rng(seed);
    const n = rings * perRing + dust + flash;
    const P = new Float32Array(n * 3), A = new Float32Array(n * 4);
    let i = 0;
    for (let k = 0; k < rings; k++) for (let j = 0; j < perRing; j++, i++) { P.set([k, (j / perRing) * Math.PI * 2 + R() * 0.004, 0], i * 3); A.set([R(), R(), R(), R()], i * 4); }
    for (let j = 0; j < dust; j++, i++) { P.set([R() * 0.6, R() * Math.PI * 2, 1], i * 3); A.set([R(), R(), R(), R()], i * 4); }
    for (let j = 0; j < flash; j++, i++) { P.set([0, R() * Math.PI * 2, 2], i * 3); A.set([R(), R(), R(), R()], i * 4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(A, 4));
    this.u = {
      uAge: { value: 0 }, uSpeed: { value: 0.3 }, uPx: { value: 1 }, uResY: { value: 1080 }, uBright: { value: 1 }, uDelay: { value: 0.22 }, uLife: { value: 1.2 }, uKeep: { value: 1 },
      uCenter: { value: new THREE.Vector3() }, uE1: { value: new THREE.Vector3(1, 0, 0) }, uE2: { value: new THREE.Vector3(0, 1, 0) }, uCol: { value: new THREE.Color(3.0, 2.5, 1.9) },
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: RIP_VERT, fragmentShader: RIP_FRAG, uniforms: this.u, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 110;
    this.object = this.points;
  }
  /** age (s since trigger; <=0 hidden), center (world), camera (rings face it) or plane {e1,e2}, speed m/s, color, brightness */
  update(age, { center, camera = null, e1 = null, e2 = null, speed = 0.3, color = [3.0, 2.5, 1.9], brightness = 1, life = 1.2, delay = 0.22, keep = 1 } = {}) {
    const u = this.u;
    this.points.visible = age > -0.06 && age < life * 6;
    u.uAge.value = age; u.uSpeed.value = speed; u.uBright.value = brightness; u.uLife.value = life; u.uDelay.value = delay; u.uKeep.value = keep;
    u.uPx.value = this.e.px ?? this.e.H / 1080; u.uResY.value = this.e.H;
    u.uCenter.value.copy(center.isVector3 ? center : _v.set(...center));
    u.uCol.value.setRGB(...color);
    if (camera) {
      camera.updateMatrixWorld();
      u.uE1.value.set(1, 0, 0).transformDirection(camera.matrixWorld);
      u.uE2.value.set(0, 1, 0).transformDirection(camera.matrixWorld);
    } else if (e1 && e2) { u.uE1.value.set(...e1).normalize(); u.uE2.value.set(...e2).normalize(); }
  }
}

// --------------------------------------------------------------------------------------------
// HandsCloseUp
// --------------------------------------------------------------------------------------------
/**
 * new HandsCloseUp(e, { count = 50000 })  — .object (Group; position it anywhere), .romeo/.juliet (arm figures),
 * .ripple, .contactPoint (world Vector3, valid after update)
 * update(t, { contactTime, approach = 4, gap0 = 0.11, camera, focus?, aperture = 0.006, after = 0.5, ripple = true }, lookR, lookJ)
 */
export class HandsCloseUp {
  constructor(e, { count = 50000 } = {}) {
    this.e = e;
    this.object = new THREE.Group();
    this.romeo = new LightFigure(e, { who: 'romeo', part: 'armR', count });
    this.juliet = new LightFigure(e, { who: 'juliet', part: 'armL', count });
    this.ripple = new LightRipple(e);
    this.object.add(this.romeo.object, this.juliet.object, this.ripple.object);
    this.contactPoint = new THREE.Vector3();
    this.tipR = new THREE.Vector3(); this.tipJ = new THREE.Vector3();
  }

  /** suggested camera: side-on, slightly below and in front, framing both forearms */
  frame(camera, { dist = 0.62, height = -0.03, side = 0.0, fov = 30, roll = 0 } = {}) {
    this.object.updateMatrixWorld();
    const c = _v.set(side, height, dist).applyMatrix4(this.object.matrixWorld);
    camera.position.copy(c);
    camera.fov = fov; camera.updateProjectionMatrix();
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(_w.set(0, 0, 0).applyMatrix4(this.object.matrixWorld));
    camera.up.set(0, 1, 0);
    return camera;
  }

  update(t, o = {}, lookR = {}, lookJ = {}) {
    const tc = o.contactTime ?? 0, appr = o.approach ?? 4, gap0 = o.gap0 ?? 0.11;
    const u = clamp((t - (tc - appr)) / appr);
    // decelerating approach with a breath of hesitation, contact exactly at tc
    const e = 1 - Math.pow(1 - u, 2.2);
    const hes = Math.sin(t * 2.1) * 0.004 * (1 - u) * u;
    let gap = gap0 * (1 - e) + hes;
    const after = clamp((t - tc) / 2.5);
    if (t >= tc) gap = -0.0015 * smoothstep(0, 0.4, t - tc);
    const breathe = Math.sin(t * 1.3) * 0.004;
    this.object.updateMatrixWorld();
    const M = this.object.matrixWorld;
    // contact point (group local origin) and fingertip targets
    const C = this.contactPoint.set(0, breathe * 0.3, 0).applyMatrix4(M);
    const tR = new THREE.Vector3(-gap / 2, breathe * 0.3, 0).applyMatrix4(M);
    const tJ = new THREE.Vector3(gap / 2, breathe * 0.3, 0).applyMatrix4(M);
    // figures placed so that the shoulders sit off-frame
    const R = this.romeo, J = this.juliet;
    const shR = R.rig.rest[R.rig.idx.upperArmR], shJ = J.rig.rest[J.rig.idx.upperArmL];
    const sR = new THREE.Vector3(-0.66, 0.1 + breathe, -0.1), sJ = new THREE.Vector3(0.62, 0.07 - breathe, -0.08);
    R.object.position.set(sR.x - shR.z, sR.y - shR.y, sR.z + shR.x); R.object.rotation.set(0, Math.PI / 2, 0);
    J.object.position.set(sJ.x + shJ.z, sJ.y - shJ.y, sJ.z - shJ.x); J.object.rotation.set(0, -Math.PI / 2, 0);
    // hand orientations (group space -> world): his languid (Adam), hers reaching (God)
    const dirW = (x, y, z) => new THREE.Vector3(x, y, z).transformDirection(M).toArray();
    const openK = smoothstep(0, 1, after) * (o.after ?? 0.5);
    // his: languid (Adam) — index leading, the others falling away in a soft cascade; hers: reaching (God)
    const shapeR = { curl: [0.1, 0.1 - 0.04 * openK, 0.24 - 0.08 * openK, 0.32 - 0.1 * openK, 0.38 - 0.12 * openK], spread: 0.22 + 0.1 * openK, thumbOpp: 0.05, thumbCurl: 0.1 };
    const shapeJ = { curl: [0.22, 0.0, 0.2 - 0.08 * openK, 0.3 - 0.12 * openK, 0.38 - 0.15 * openK], spread: 0.2 + 0.1 * openK, thumbOpp: 0.15, thumbCurl: 0.16 };
    const poseR = (wr) => ({ preset: 'stand', idle: 0, breath: 0,
      armR: { target: wr, palm: 'frame', palmDir: dirW(0.08, -0.62, -0.78), fingers: dirW(1, -0.24, 0.0), pole: dirW(0, -1, -0.6) }, handR: shapeR });
    const poseJ = (wr) => ({ preset: 'stand', idle: 0, breath: 0,
      armL: { target: wr, palm: 'frame', palmDir: dirW(-0.02, -0.9, -0.42), fingers: dirW(-1, 0.06, 0.03), pole: dirW(0, -1, -0.5) }, handL: shapeJ });
    // fingertip-driven IK: the hand frame is fixed, so the wrist target is corrected by the measured tip error
    const solve = (fig, side, tip, poseFn, look) => {
      let wr = tip.clone().add(new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0).transformDirection(M).multiplyScalar(0.16));
      for (let it = 0; it < 3; it++) {
        fig.update(t, poseFn(wr.toArray()), look);
        const tipNow = fig.getJointWorld('indexTip' + side, _w);
        wr = wr.add(_v.subVectors(tip, tipNow));
      }
      return fig.getJointWorld('indexTip' + side, side === 'R' ? this.tipR : this.tipJ);
    };
    // look: DOF + contact pulse
    const cam = o.camera;
    const focus = o.focus ?? (cam ? cam.position.distanceTo(C) : 0.6);
    const pulse = t >= tc ? { point: C.toArray(), age: t - tc, speed: 0.5, width: 0.035, strength: 1.6 } : null;
    const base = { aperture: o.aperture ?? 0.006, focus, sparks: 0.6, pulse, ...{} };
    solve(R, 'R', tR, poseR, { ...base, ...lookR });
    solve(J, 'L', tJ, poseJ, { ...base, ...lookJ });
    // ripple
    if (o.ripple !== false) this.ripple.update(t - tc, { center: C, camera: cam, speed: o.rippleSpeed ?? 0.32, brightness: o.rippleBright ?? 1.2, life: 1.1 });
    else this.ripple.update(-1, { center: C });
    return C;
  }
}
