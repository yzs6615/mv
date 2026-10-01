import * as THREE from 'three';

// A paper-cut layer: a vertical card carrying an Art texture, hinged at its base (pop-up book),
// lit by an ink gradient + rim light + glowing windows + depth fog. Optional mirrored twin for water.

const VERT = /* glsl */`
varying vec2 vUv; varying vec3 vView; varying vec3 vWorld;
uniform float uMirror;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform sampler2D map, paperTex;
uniform vec3 uInk, uInkTop, uRim, uWin, uFogColor, uFogTop, uLight;
uniform float uWinOn, uFogDensity, uFogHeight, uOpacity, uTime, uPaper, uMirror, uWaterY, uRipple, uWinFlicker, uFront, uKeep;
varying vec2 vUv; varying vec3 vView; varying vec3 vWorld;
float h(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  if (uMirror > 0.5) { // reflection twin: ripple distortion, fade with depth below the waterline
    float dy = max(0., uWaterY - vWorld.y);
    uv.x += (sin(vWorld.y * 0.9 + uTime * 1.3) * 0.6 + sin(vWorld.y * 2.3 - uTime * 1.9 + vWorld.x * 0.05) * 0.4) * uRipple * (0.3 + dy * 0.04);
  }
  vec4 m = texture2D(map, uv);
  if (uMirror > 0.5) { // streaky reflections: smear vertically, more with distance below the waterline
    float dy = max(0., uWaterY - vWorld.y);
    float sp = (0.012 + dy * 0.002);
    m = m * 0.3 + texture2D(map, uv + vec2(0., sp)) * 0.2 + texture2D(map, uv + vec2(0., sp * 2.)) * 0.18 + texture2D(map, uv + vec2(0., -sp)) * 0.17 + texture2D(map, uv + vec2(0., sp * 3.5)) * 0.15;
  }
  if (m.a < 0.015) discard;
  vec3 col = mix(uInk, uInkTop, smoothstep(0., 1., vUv.y));
  float pf = texture2D(paperTex, vWorld.xy * 0.035 + vWorld.z * 0.01).r;
  col *= 1. + (pf - 0.5) * uPaper;
  col += uRim * m.g;
  col += uLight * uFront * (0.6 + 0.4 * pf); // flat front light (candle on the pop-up, dawn sun)
  float id = m.b;
  float lit = smoothstep(1. - uWinOn, 1. - uWinOn + 0.03, id) * step(0.01, id);
  float flick = 1. - uWinFlicker * (0.5 + 0.5 * sin(uTime * (5. + 9. * h(id * 91.)) + id * 70.)) * h(id * 13.);
  float wv = h(id * 37.); col += uWin * m.r * lit * flick * (0.25 + 1.4 * wv * wv * wv) * mix(vec3(1.), vec3(0.75, 0.85, 1.15), step(0.93, h(id * 5.)));
  // height-aware exponential fog (thicker low, thinner high)
  float d = length(vView);
  float fh = exp(-max(vWorld.y, 0.) * uFogHeight);
  float f = 1. - exp(-uFogDensity * d * (0.35 + 0.65 * fh));
  col = mix(col, mix(uFogTop, uFogColor, fh), clamp(f, 0., 1.));
  float a = m.a * uOpacity;
  if (uMirror > 0.5) { float dy = max(0., uWaterY - vWorld.y); a *= 0.55 * exp(-dy * 0.03); col *= 0.7; }
  gl_FragColor = vec4(col, a);
}`;

export function paperMaterial(tex, paperTex, opts = {}) {
  const u = {
    map: { value: tex }, paperTex: { value: paperTex },
    uInk: { value: new THREE.Color(...(opts.ink || [0.01, 0.012, 0.02])) },
    uInkTop: { value: new THREE.Color(...(opts.inkTop || opts.ink || [0.02, 0.024, 0.04])) },
    uRim: { value: new THREE.Color(...(opts.rim || [0.2, 0.22, 0.3])) },
    uWin: { value: new THREE.Color(...(opts.win || [3.2, 1.7, 0.6])) },
    uLight: { value: new THREE.Color(...(opts.light || [0, 0, 0])) }, uFront: { value: opts.front ?? 0 },
    uFogColor: { value: new THREE.Color(...(opts.fog || [0.03, 0.045, 0.09])) },
    uFogTop: { value: new THREE.Color(...(opts.fogTop || opts.fog || [0.02, 0.03, 0.06])) },
    uFogDensity: { value: opts.fogDensity ?? 0.004 }, uFogHeight: { value: opts.fogHeight ?? 0.02 },
    uWinOn: { value: opts.winOn ?? 0.7 }, uWinFlicker: { value: opts.flicker ?? 0.15 },
    uOpacity: { value: 1 }, uTime: { value: 0 }, uPaper: { value: opts.paper ?? 0.35 },
    uMirror: { value: opts.mirror ? 1 : 0 }, uWaterY: { value: 0 }, uRipple: { value: 0.0025 }, uKeep: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthWrite: !opts.mirror, depthTest: true, side: THREE.DoubleSide,
    // colour: normal alpha blend; alpha: erase the lovers' colour-keep mask behind opaque paper
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

/**
 * PaperLayer: pivot (Group at the base line) -> mesh. Art is anchored bottom-centre.
 * opts: x, z, y, scale, ink, inkTop, rim, win, fog..., mirror (adds reflection twin at waterY)
 */
export class PaperLayer {
  constructor(tex, paperTex, opts = {}) {
    const { wm, hm } = tex.userData;
    const s = opts.scale ?? 1;
    this.pivot = new THREE.Group();
    this.pivot.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    const geo = new THREE.PlaneGeometry(wm * s, hm * s);
    geo.translate(0, (hm * s) / 2, 0);
    this.mat = paperMaterial(tex, paperTex, { ...opts, mirror: false });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.pivot.add(this.mesh);
    this.u = this.mat.uniforms;
    if (opts.mirror) {
      this.mirrorMat = paperMaterial(tex, paperTex, { ...opts, mirror: true });
      this.twin = new THREE.Mesh(geo, this.mirrorMat);
      this.twin.scale.y = -1;
      this.twin.frustumCulled = false;
      this.pivot.add(this.twin);
      this.mu = this.mirrorMat.uniforms;
    }
    this.z = opts.z ?? 0;
  }
  /** hinge angle in [0,1]: 0 = folded flat (lying back), 1 = standing */
  fold(k) { this.pivot.rotation.x = -(1 - k) * Math.PI / 2; }
  set(key, value) {
    for (const u of [this.u, this.mu]) {
      if (!u) continue;
      const v = u[key].value;
      if (v && v.setRGB && Array.isArray(value)) v.setRGB(...value); else u[key].value = value;
    }
  }
}

/** order layers back-to-front (paper first, particles later use renderOrder >= 100) */
export function sortLayers(layers) {
  const sorted = [...layers].sort((a, b) => a.z - b.z);
  sorted.forEach((l, i) => { l.mesh.renderOrder = i + 1; if (l.twin) l.twin.renderOrder = i - 60; });
}
