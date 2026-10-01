import * as THREE from 'three';
import { Sky } from '../fx/sky.js';
import { PaperLayer, sortLayers } from '../fx/paper.js';
import { paperTexture } from '../fx/art.js';
import * as V from './verona_art.js';

// Verona at world scale: a multiplane stage seen across the Adige.
// z is depth (camera looks toward -z), y up, 1 unit = 1 m.

export function cached(e, key, fn) { if (!e.cache.has(key)) e.cache.set(key, fn()); return e.cache.get(key); }
export const paper = (e) => cached(e, 'paperTex', () => paperTexture());

const WATER_VERT = /* glsl */`varying vec3 vW; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mv = viewMatrix * w; vV = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const WATER_FRAG = /* glsl */`
uniform vec3 uDeep, uSheen, uFog; uniform float uTime, uFogDensity; uniform vec3 uMoonDir;
varying vec3 vW; varying vec3 vV;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 p = vW.xz;
  float w = n(p * vec2(0.08, 0.5) + vec2(uTime * 0.05, uTime * 0.3)) * 0.6 + n(p * vec2(0.3, 1.6) - vec2(0., uTime * 0.6)) * 0.4;
  vec3 V = normalize(-vV);
  float fres = pow(1. - abs(normalize(cameraPosition - vW).y), 4.);
  // moon glitter column: bright streaks where ripples face the moon
  vec3 toCam = normalize(cameraPosition - vW);
  vec2 md = normalize(uMoonDir.xz);
  float along = dot(normalize(vW.xz - cameraPosition.xz), md);
  float glit = pow(max(0., along), 60.) * smoothstep(0.62, 0.9, w) * 3.0;
  vec3 col = uDeep + uSheen * (fres * 0.6 + w * 0.15) + vec3(1.0, 0.95, 0.85) * glit;
  float d = length(vV);
  col = mix(col, uFog, 1. - exp(-uFogDensity * d));
  gl_FragColor = vec4(col, 0.);
}`;

export class VeronaSet {
  constructor(e) {
    this.e = e;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, e.W / e.H, 0.5, 4000);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    const P = paper(e);
    const T = (k, f) => cached(e, k, f);
    const L = (tex, o) => new PaperLayer(tex, P, o);
    this.layers = {
      hills: L(T('art.hills', () => V.hillsArt()), { z: -900, x: 0, fogDensity: 0.0011, paper: 0.15 }),
      skyline: L(T('art.skyline', () => V.skylineArt()), { z: -500, x: 0, fogDensity: 0.0011, mirror: true }),
      mid: L(T('art.mid', () => V.cityMidArt()), { z: -260, x: 10, fogDensity: 0.0011, mirror: true }),
      near: L(T('art.near', () => V.cityNearArt()), { z: -140, x: -20, y: 0, fogDensity: 0.0011, mirror: true }),
      bridge: L(T('art.bridge', () => V.bridgeArt()), { z: -120, x: 75, fogDensity: 0.0011, mirror: true }),
      bank: L(T('art.bank', () => V.nearBankArt()), { z: -14, x: -4, fogDensity: 0.0011 }),
    };
    this.layerList = Object.values(this.layers);
    for (const l of this.layerList) this.scene.add(l.pivot);
    sortLayers(this.layerList);
    // the river
    this.waterU = { uDeep: { value: new THREE.Color(0.004, 0.006, 0.014) }, uSheen: { value: new THREE.Color(0.03, 0.04, 0.07) },
      uFog: { value: new THREE.Color() }, uTime: { value: 0 }, uFogDensity: { value: 0.0016 }, uMoonDir: { value: this.sky.uniforms.uMoonDir.value } };
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1200), new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: this.waterU, depthWrite: false }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(0, 0, -560); this.water.renderOrder = -100;
    this.scene.add(this.water);
    this.extras = new THREE.Group(); this.scene.add(this.extras);
  }

  /** time-of-day look: 'night' | 'storm' | 'dawn' (+ blend) */
  look(name, t, { winOn = 0.4, flicker = 0.12, b = null, m = 0 } = {}) {
    this.sky.apply(name, b, m);
    const looks = {
      night: { ink: [0.003, 0.004, 0.009], inkTop: [0.008, 0.01, 0.02], rim: [0.09, 0.1, 0.15], fog: [0.016, 0.02, 0.036], fogTop: [0.01, 0.014, 0.03], win: [3.6, 1.75, 0.55], deep: [0.003, 0.005, 0.012], sheen: [0.03, 0.045, 0.08] },
      storm: { ink: [0.006, 0.006, 0.007], inkTop: [0.014, 0.014, 0.016], rim: [0.03, 0.03, 0.035], fog: [0.07, 0.068, 0.065], fogTop: [0.05, 0.05, 0.052], win: [1.6, 0.9, 0.35], deep: [0.004, 0.004, 0.005], sheen: [0.04, 0.04, 0.045] },
      dawn: { ink: [0.05, 0.03, 0.045], inkTop: [0.1, 0.06, 0.08], rim: [1.2, 0.6, 0.3], fog: [0.9, 0.5, 0.38], fogTop: [0.35, 0.3, 0.45], win: [3.0, 1.9, 0.9], deep: [0.04, 0.03, 0.05], sheen: [0.5, 0.3, 0.25] },
    };
    const A = looks[name] || looks.night, B = b ? looks[b] : A;
    const mix = (k) => A[k].map((v, i) => v + (B[k][i] - v) * m);
    for (const l of this.layerList) {
      l.set('uInk', mix('ink')); l.set('uInkTop', mix('inkTop')); l.set('uRim', mix('rim'));
      l.set('uFogColor', mix('fog')); l.set('uFogTop', mix('fogTop')); l.set('uWin', mix('win'));
      l.set('uWinOn', winOn); l.set('uWinFlicker', flicker); l.set('uTime', t);
    }
    this.waterU.uDeep.value.setRGB(...mix('deep')); this.waterU.uSheen.value.setRGB(...mix('sheen'));
    this.waterU.uFog.value.setRGB(...mix('fog')); this.waterU.uTime.value = t;
    this.sky.uniforms.uTime.value = t;
  }

  frame(cam) {
    this.sky.follow(this.camera);
  }
}
