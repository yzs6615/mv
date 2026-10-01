import * as THREE from 'three';

// Procedural sky dome: gradient + hashed starfield (2 layers, twinkle) + moon (phase, halo)
// + sun with Mie-like glow + cheap fbm clouds lit from the brightest light. Rendered first, no depth.

const VERT = /* glsl */`
varying vec3 vDir;
uniform vec3 uCenter;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vDir = normalize(wp.xyz - uCenter);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uBand, uZenith, uHorizon, uGround, uSunDir, uSunColor, uMoonDir, uMoonColor, uCloudColor, uCloudShadow, uGlowColor;
uniform float uStars, uTime, uMoonSize, uMoonPhase, uSunSize, uClouds, uCloudSpeed, uHorizonGlow, uMilky, uSeed, uStarSize, uKeep;
float h3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
vec3 starLayer(vec3 d, float scale, float prob, float bright, float sz){
  vec3 p = d * scale;
  vec3 c = floor(p);
  float r = h3(c + uSeed);
  if (r > prob) return vec3(0.);
  vec3 jit = vec3(h3(c + 11.3), h3(c + 27.1), h3(c + 43.7)) * 0.6 + 0.2;
  vec3 sp = normalize(c + jit);
  float ang = acos(clamp(dot(d, sp), -1., 1.)) * scale;
  float b = pow(h3(c + 5.5), 5.) * bright + 0.05;
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 4. * h3(c + 9.)) + 6.28 * h3(c + 3.));
  float core = exp(-ang * ang / (sz * sz));
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), h3(c + 77.));
  return tint * core * b * tw;
}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  // base gradient
  vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0., 1.), 0.55));
  col = mix(col, uGround, smoothstep(0.0, -0.25, y));
  col += uBand * exp(-abs(y) * 9.) ;
  // horizon glow toward the sun
  float sd = max(dot(d, uSunDir), 0.);
  col += uGlowColor * pow(sd, 6.) * uHorizonGlow * (1. - smoothstep(0., 0.6, y));
  col += uSunColor * (pow(sd, 900. / max(uSunSize, 0.05)) * 40. + pow(sd, 60.) * 0.6 + pow(sd, 8.) * 0.08);
  // stars (fade near horizon and under clouds)
  float starVis = smoothstep(-0.02, 0.25, y) * uStars;
  vec3 stars = vec3(0.);
  if (starVis > 0.001) {
    stars += starLayer(d, 260., 0.07, 2.2, 0.22 * uStarSize);
    stars += starLayer(d, 120., 0.035, 7.0, 0.2 * uStarSize);
    stars += starLayer(d, 60., 0.012, 16.0, 0.17 * uStarSize);
    // milky way band
    vec3 ax = normalize(vec3(0.35, 0.6, -0.72));
    float band = exp(-pow(dot(d, ax) * 3.2, 2.)) * (0.6 + 0.4 * fbm(vec2(atan(d.z, d.x) * 4., d.y * 6.) + uSeed));
    stars += vec3(0.55, 0.6, 0.85) * band * 0.06 * uMilky;
  }
  // moon
  float md = acos(clamp(dot(d, uMoonDir), -1., 1.));
  float disc = 1. - smoothstep(uMoonSize * 0.96, uMoonSize, md);
  if (disc > 0.) {
    // phase: lit side by offset circle
    vec3 up = vec3(0., 1., 0.);
    vec3 right = normalize(cross(uMoonDir, up));
    vec3 up2 = cross(right, uMoonDir);
    vec2 q = vec2(dot(d - uMoonDir, right), dot(d - uMoonDir, up2)) / uMoonSize;
    float lit = 1. - smoothstep(-0.05, 0.05, length(q - vec2(uMoonPhase * 2.0, 0.)) - 1.0) * step(0.001, abs(uMoonPhase));
    float mare = 0.82 + 0.18 * fbm(q * 3.5 + 4.);
    float limb = 0.75 + 0.25 * sqrt(max(0., 1. - dot(q, q)));
    col = mix(col, uMoonColor * mare * limb * mix(0.04, 1., lit), disc);
    starVis *= 1. - disc;
  }
  col += uMoonColor * 0.11 * exp(-md / (uMoonSize * 2.2)) + uMoonColor * 0.03 * exp(-md / (uMoonSize * 9.));
  // clouds
  if (uClouds > 0.001 && y > -0.05) {
    vec2 cp = d.xz / (y + 0.12) * 1.6 + vec2(uTime * uCloudSpeed, 0.);
    float c = fbm(cp * 0.9);
    c = smoothstep(1. - uClouds, 1.15 - uClouds * 0.6, c);
    float lightDot = max(dot(d, uMoonDir), dot(d, uSunDir));
    vec3 cc = mix(uCloudShadow, uCloudColor, 0.35 + 0.65 * pow(max(lightDot, 0.), 4.));
    col = mix(col, cc, c * smoothstep(-0.05, 0.12, y));
    starVis *= 1. - c;
  }
  col += stars * starVis;
  gl_FragColor = vec4(col, uKeep);
}`;

export const SKY_PRESETS = {
  night: { band: [0.05, 0.03, 0.018], zenith: [0.003, 0.006, 0.022], horizon: [0.03, 0.04, 0.08], ground: [0.004, 0.005, 0.01], stars: 1, milky: 0.8, moonColor: [1.6, 1.55, 1.4], glow: [0.1, 0.12, 0.2], horizonGlow: 0.0, clouds: 0.18, cloudColor: [0.12, 0.13, 0.18], cloudShadow: [0.012, 0.015, 0.03], sunColor: [0, 0, 0] },
  deepNight: { band: [0, 0, 0], zenith: [0.0015, 0.003, 0.012], horizon: [0.012, 0.018, 0.04], ground: [0.002, 0.002, 0.005], stars: 1.3, milky: 1.2, moonColor: [0, 0, 0], glow: [0, 0, 0], horizonGlow: 0, clouds: 0, cloudColor: [0, 0, 0], cloudShadow: [0, 0, 0], sunColor: [0, 0, 0] },
  storm: { band: [0.02, 0.02, 0.02], zenith: [0.035, 0.035, 0.04], horizon: [0.09, 0.085, 0.08], ground: [0.01, 0.01, 0.01], stars: 0, milky: 0, moonColor: [0, 0, 0], glow: [0.2, 0.2, 0.22], horizonGlow: 0.3, clouds: 0.85, cloudColor: [0.16, 0.155, 0.15], cloudShadow: [0.02, 0.02, 0.022], sunColor: [0, 0, 0] },
  dawn: { band: [0.3, 0.12, 0.06], zenith: [0.09, 0.12, 0.3], horizon: [1.1, 0.55, 0.38], ground: [0.08, 0.05, 0.05], stars: 0.15, milky: 0, moonColor: [0.5, 0.48, 0.5], glow: [1.6, 0.7, 0.35], horizonGlow: 1.2, clouds: 0.38, cloudColor: [1.4, 0.75, 0.6], cloudShadow: [0.25, 0.16, 0.22], sunColor: [3.0, 1.9, 1.1] },
  golden: { band: [0.2, 0.12, 0.05], zenith: [0.18, 0.3, 0.6], horizon: [1.3, 0.85, 0.55], ground: [0.1, 0.07, 0.05], stars: 0, milky: 0, moonColor: [0, 0, 0], glow: [1.8, 1.0, 0.5], horizonGlow: 1.0, clouds: 0.3, cloudColor: [1.6, 1.15, 0.85], cloudShadow: [0.45, 0.35, 0.4], sunColor: [3.5, 2.6, 1.6] },
};

export class Sky {
  constructor({ radius = 2000, segments = 48 } = {}) {
    this.uniforms = {
      uCenter: { value: new THREE.Vector3() },
      uBand: { value: new THREE.Color(0, 0, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, -1, 0) }, uSunColor: { value: new THREE.Color(0, 0, 0) }, uSunSize: { value: 1 },
      uGlowColor: { value: new THREE.Color() }, uHorizonGlow: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(-0.26, 0.2, -0.94).normalize() }, uMoonColor: { value: new THREE.Color(1, 1, 1) },
      uMoonSize: { value: 0.024 }, uMoonPhase: { value: 0 },
      uStars: { value: 1 }, uStarSize: { value: 1 }, uMilky: { value: 1 }, uTime: { value: 0 }, uSeed: { value: 3 },
      uClouds: { value: 0 }, uCloudSpeed: { value: 0.01 }, uCloudColor: { value: new THREE.Color() }, uCloudShadow: { value: new THREE.Color() },
      uKeep: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), this.mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }
  /** blend between presets: apply(a) or apply(a, b, m) */
  apply(a, b = null, m = 0) {
    const A = SKY_PRESETS[a] || a, B = b ? (SKY_PRESETS[b] || b) : A;
    const L = (k) => A[k].map((v, i) => v + (B[k][i] - v) * m);
    const s = (k) => A[k] + (B[k] - A[k]) * m;
    const u = this.uniforms;
    u.uZenith.value.setRGB(...L('zenith')); u.uHorizon.value.setRGB(...L('horizon')); u.uGround.value.setRGB(...L('ground'));
    u.uStars.value = s('stars'); u.uMilky.value = s('milky'); u.uMoonColor.value.setRGB(...L('moonColor'));
    u.uGlowColor.value.setRGB(...L('glow')); u.uHorizonGlow.value = s('horizonGlow');
    u.uClouds.value = s('clouds'); u.uCloudColor.value.setRGB(...L('cloudColor')); u.uCloudShadow.value.setRGB(...L('cloudShadow'));
    u.uSunColor.value.setRGB(...L('sunColor'));
    u.uBand.value.setRGB(...(A.band ? L('band') : [0, 0, 0]));
  }
  follow(camera) { this.mesh.position.copy(camera.position); this.uniforms.uCenter.value.copy(camera.position); }
}
