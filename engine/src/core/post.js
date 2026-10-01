import * as THREE from 'three';

// Cinematic post pipeline, tuned for software WebGL (SwiftShader):
//  HDR scene -> Karis-averaged 13-tap downsample chain -> tent upsample (physically based bloom)
//            -> anamorphic streak from a squashed mip -> one full-res composite pass
//  The composite does CA, bloom/streak add, exposure, filmic tonemap, CDL grade, split toning,
//  selective desaturation (lovers keep colour), vignette, title overlay, letterbox, fades, grain, dither.

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const DOWN = /* glsl */`
uniform sampler2D src; uniform vec2 texel; uniform float threshold, knee; uniform int karis;
varying vec2 vUv;
vec3 q(vec2 o){ return texture2D(src, vUv + texel * o).rgb; }
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 kw(vec3 c){ return c / (1. + lum(c)); }
void main(){
  vec3 a=q(vec2(-2,2)), b=q(vec2(0,2)), c=q(vec2(2,2)), d=q(vec2(-2,0)), e=q(vec2(0,0)), f=q(vec2(2,0));
  vec3 g=q(vec2(-2,-2)), h=q(vec2(0,-2)), i=q(vec2(2,-2)), j=q(vec2(-1,1)), k=q(vec2(1,1)), l=q(vec2(-1,-1)), m=q(vec2(1,-1));
  vec3 o;
  float al = texture2D(src, vUv).a * .125 + (texture2D(src, vUv + texel * vec2(-1,1)).a + texture2D(src, vUv + texel * vec2(1,1)).a
           + texture2D(src, vUv + texel * vec2(-1,-1)).a + texture2D(src, vUv + texel * vec2(1,-1)).a) * .21875;
  if (karis == 1) {
    vec3 g0=(a+b+d+e)*.25, g1=(b+c+e+f)*.25, g2=(d+e+g+h)*.25, g3=(e+f+h+i)*.25, g4=(j+k+l+m)*.25;
    float w0=1./(1.+lum(g0)), w1=1./(1.+lum(g1)), w2=1./(1.+lum(g2)), w3=1./(1.+lum(g3)), w4=1./(1.+lum(g4));
    o = (g0*w0*.125 + g1*w1*.125 + g2*w2*.125 + g3*w3*.125 + g4*w4*.5) / (w0*.125 + w1*.125 + w2*.125 + w3*.125 + w4*.5);
    float br = max(o.r, max(o.g, o.b));
    float rq = clamp(br - threshold + knee, 0., 2. * knee); rq = rq * rq / (4. * knee + 1e-5);
    o *= max(rq, br - threshold) / max(br, 1e-5);
  } else {
    o = e*.125 + (a+c+g+i)*.03125 + (b+d+f+h)*.0625 + (j+k+l+m)*.125;
  }
  gl_FragColor = vec4(o, al);
}`;

const UP = /* glsl */`
uniform sampler2D src; uniform vec2 texel; uniform float radius; varying vec2 vUv;
vec4 q(vec2 o){ return texture2D(src, vUv + texel * o * radius); }
void main(){
  vec4 s = q(vec2(0))*4. + (q(vec2(0,1))+q(vec2(-1,0))+q(vec2(1,0))+q(vec2(0,-1)))*2. + q(vec2(-1,1))+q(vec2(1,1))+q(vec2(-1,-1))+q(vec2(1,-1));
  gl_FragColor = s / 16.;
}`;

const STREAK = /* glsl */`
uniform sampler2D src; uniform vec2 texel; uniform float stepPx, threshold; uniform int first; varying vec2 vUv;
vec3 tap(float k){ vec3 c = texture2D(src, vUv + vec2(texel.x * stepPx * k, 0.)).rgb;
  if (first == 1) { float br = max(c.r, max(c.g, c.b)); c *= smoothstep(threshold, threshold * 2.5, br); } return c; }
void main(){
  vec3 s = vec3(0.); float wsum = 0.;
  for (int i = -3; i <= 3; i++) { float k = float(i); float w = exp(-abs(k) * 0.55); s += tap(k) * w; wsum += w; }
  gl_FragColor = vec4(s / wsum, 1.);
}`;

const MIX = /* glsl */`
uniform sampler2D tA, tB; uniform float uMix, uSeed; uniform int uMode; uniform vec3 uEdge; uniform vec2 uRes; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.07; a*=.5; } return s; }
void main(){
  vec3 A = texture2D(tA, vUv).rgb, B = texture2D(tB, vUv).rgb;
  vec3 o;
  if (uMode == 0) { o = mix(A, B, uMix); }
  else if (uMode == 1) { // bloom dissolve: brightness peaks mid-way (for light transitions)
    float k = sin(3.14159 * uMix); o = mix(A, B, smoothstep(0., 1., uMix)) * (1. + 2.5 * k) + uEdge * k * 0.6;
  } else { // ink / light bleed wipe: organic mask grows from the centre outwards
    vec2 p = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
    float m = fbm(p * 3.2 + uSeed) * 0.55 + (1. - length(p) * 0.9) * 0.45;
    float th = 1. - uMix * 1.25;
    float a = smoothstep(th, th + 0.04, m);
    float edge = smoothstep(th - 0.03, th, m) * (1. - a);
    o = mix(A, B, a) + uEdge * edge * (uMode == 2 ? 0. : 3.) - (uMode == 2 ? vec3(edge * 0.8) * A : vec3(0.));
  }
  gl_FragColor = vec4(max(o, 0.), 1.);
}`;

const COMPOSITE = /* glsl */`
uniform sampler2D tScene, tBloom, tStreak, tOverlay;
uniform vec2 uRes; uniform float uFrame;
uniform float uBloom, uStreak, uExposure, uSat, uContrast, uVignette, uGrain, uCA, uLetterbox, uFade, uWhite, uOverlay, uKeepColor, uTear, uTearSeed, uTearGap;
uniform vec3 uLift, uGamma, uGain, uStreakTint, uShadowTint, uHighTint, uFadeColor;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(h(vec2(i,uTearSeed)), h(vec2(i+1.,uTearSeed)), f); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// paper tear: a vertical jagged seam; halves drift apart by uTearGap (in uv)
float tearX(float y){ return 0.5 + (n1(y * 9.) - .5) * 0.06 + (n1(y * 37.) - .5) * 0.018 + (h(vec2(floor(y*220.), uTearSeed)) - .5) * 0.004; }
void main(){
  vec2 uv = vUv;
  float torn = 0.; float fiber = 0.;
  if (uTear > 0.) {
    float sx = tearX(uv.y);
    float g = uTearGap * uTear;
    if (uv.x < sx - g) { uv.x += g; }
    else if (uv.x > sx + g) { uv.x -= g; }
    else { torn = 1.; }
    // white fibrous paper edge either side of the seam
    float dEdge = min(abs(uv.x - (sx - g)), abs(uv.x - (sx + g)));
    fiber = (1. - smoothstep(0., 0.004 + 0.004 * h(vec2(floor(vUv.y * 400.), 3.)), dEdge)) * step(0.0001, uTear) * (1. - torn);
  }
  vec2 d = uv - .5; float r2 = dot(d, d);
  vec3 col;
  if (uCA > 0.) { vec2 off = d * r2 * uCA; col = vec3(texture2D(tScene, uv - off).r, texture2D(tScene, uv).g, texture2D(tScene, uv + off).b); }
  else col = texture2D(tScene, uv).rgb;
  vec4 bl = texture2D(tBloom, uv);
  float keep = clamp(texture2D(tScene, uv).a + bl.a * 0.6, 0., 1.); // lovers write a colour-keep mask into alpha
  col += bl.rgb * uBloom;
  col += texture2D(tStreak, uv).rgb * uStreak * uStreakTint;
  col *= uExposure;
  col = aces(col);
  // CDL-style grade
  col = pow(max(vec3(0.), col * uGain + uLift * (1. - col)), 1. / uGamma);
  float L = luma(col);
  col = mix(vec3(L), col, mix(uSat, max(uSat, 1.05), clamp(keep * uKeepColor, 0., 1.)));
  col = mix(col, col * col * (3. - 2. * col), uContrast);
  col *= mix(uShadowTint, vec3(1.), smoothstep(0.0, 0.45, L));
  col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, L));
  // vignette (elliptical, filmic falloff)
  vec2 vv = (vUv - .5) * vec2(uRes.x / uRes.y, 1.) * 0.85;
  col *= mix(1., smoothstep(1.05, 0.15, length(vv)), uVignette);
  col = clamp(col, 0., 1.);
  col = toSRGB(col);
  // torn gap is inky dark with paper fibres
  if (uTear > 0.) { col = mix(col, vec3(0.015, 0.012, 0.01), torn); col = mix(col, vec3(0.93, 0.89, 0.8), fiber * 0.85); }
  // title overlay (premultiplied sRGB)
  vec4 ov = texture2D(tOverlay, vec2(vUv.x, vUv.y));
  col = col * (1. - ov.a * uOverlay) + ov.rgb * uOverlay;
  // fades
  col = mix(col, uFadeColor, uFade);
  col = mix(col, vec3(1.), uWhite);
  // grain (luminance-weighted, animated, deterministic)
  vec2 px = vUv * uRes;
  float g1 = h(px + uFrame * 17.13), g2 = h(px * 1.37 + uFrame * 3.71 + 7.), g3 = h(px * 0.71 - uFrame * 9.1);
  float gr = (g1 + g2 + g3 - 1.5) * 0.8;
  float lw = 1. - abs(luma(col) - 0.45) * 1.2;
  col += gr * uGrain * clamp(lw, 0.25, 1.);
  // letterbox
  float bar = uLetterbox;
  if (vUv.y < bar || vUv.y > 1. - bar) col = vec3(0.);
  // dither against banding
  col += (h(px + 0.5 + uFrame) - 0.5) / 255.;
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

export const DEFAULT_GRADE = {
  bloom: 0.6, bloomThreshold: 0.9, bloomKnee: 0.5, bloomRadius: 1.0,
  streak: 0.0, streakThreshold: 1.5, streakTint: [0.6, 0.75, 1.0],
  exposure: 1.0, sat: 1.0, contrast: 0.15, vignette: 0.55, grain: 0.035, ca: 0.0,
  lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
  shadowTint: [1, 1, 1], highTint: [1, 1, 1],
  aspect: 2.39, fade: 0, fadeColor: [0, 0, 0], white: 0, overlay: 1, keepColor: 0,
  tear: 0, tearSeed: 1, tearGap: 0.0,
};

export class Post {
  constructor(renderer, W, H, type) {
    this.r = renderer; this.W = W; this.H = H;
    this.type = type;
    const mk = (w, h, opts = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type, format: THREE.RGBAFormat, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, ...opts });
    this.mk = mk;
    this.sceneA = mk(W, H, { depthBuffer: true });
    this.sceneB = mk(W, H, { depthBuffer: true });
    this.mixT = mk(W, H);
    this.mips = [];
    let w = W, h = H;
    for (let i = 0; i < 6; i++) { w = Math.floor(w / 2); h = Math.floor(h / 2); this.mips.push(mk(w, h)); }
    this.streakA = mk(W / 4, H / 8); this.streakB = mk(W / 4, H / 8);
    this.quadScene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    const sm = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.down = sm(DOWN, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.5 }, karis: { value: 0 } });
    this.up = sm(UP, { src: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    // additive in both colour and alpha (alpha carries the blurred colour-keep mask of the lovers)
    Object.assign(this.up, { transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
    this.streak = sm(STREAK, { src: { value: null }, texel: { value: new THREE.Vector2() }, stepPx: { value: 1 }, threshold: { value: 1.5 }, first: { value: 0 } });
    this.mix = sm(MIX, { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uMode: { value: 0 }, uSeed: { value: 0 }, uEdge: { value: new THREE.Color(1, 0.8, 0.5) }, uRes: { value: new THREE.Vector2(W, H) } });
    this.comp = sm(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, tStreak: { value: null }, tOverlay: { value: null },
      uRes: { value: new THREE.Vector2(W, H) }, uFrame: { value: 0 },
      uBloom: { value: 0 }, uStreak: { value: 0 }, uExposure: { value: 1 }, uSat: { value: 1 }, uContrast: { value: 0 },
      uVignette: { value: 0 }, uGrain: { value: 0 }, uCA: { value: 0 }, uLetterbox: { value: 0 }, uFade: { value: 0 }, uWhite: { value: 0 },
      uOverlay: { value: 1 }, uKeepColor: { value: 0 }, uTear: { value: 0 }, uTearSeed: { value: 1 }, uTearGap: { value: 0 },
      uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uStreakTint: { value: new THREE.Vector3(1, 1, 1) }, uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) },
      uFadeColor: { value: new THREE.Vector3() },
    });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.black.needsUpdate = true;
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.quadScene, this.cam);
  }

  bloomChain(src, g) {
    const m = this.mips;
    // downsample: first pass prefilters (threshold + Karis average against fireflies)
    let s = src;
    for (let i = 0; i < m.length; i++) {
      const u = this.down.uniforms;
      u.src.value = s.texture; u.texel.value.set(1 / s.width, 1 / s.height);
      u.karis.value = i === 0 ? 1 : 0; u.threshold.value = g.bloomThreshold; u.knee.value = g.bloomKnee;
      this.pass(this.down, m[i]);
      s = m[i];
    }
    // upsample with additive tent filter
    for (let i = m.length - 1; i > 0; i--) {
      const u = this.up.uniforms;
      u.src.value = m[i].texture; u.texel.value.set(1 / m[i].width, 1 / m[i].height); u.radius.value = g.bloomRadius;
      this.r.autoClear = false;
      this.pass(this.up, m[i - 1]);
      this.r.autoClear = true;
    }
    return m[0].texture;
  }

  streakChain(g) {
    // squash quarter-res mip into a wide, short target and blur horizontally with growing steps
    const u = this.streak.uniforms;
    const src = this.mips[1];
    u.src.value = src.texture; u.texel.value.set(1 / this.streakA.width, 1 / this.streakA.height);
    u.first.value = 1; u.threshold.value = g.streakThreshold; u.stepPx.value = 1;
    this.pass(this.streak, this.streakA);
    u.first.value = 0;
    let a = this.streakA, b = this.streakB;
    for (const st of [3, 9, 27]) { u.src.value = a.texture; u.stepPx.value = st; this.pass(this.streak, b); [a, b] = [b, a]; }
    return a.texture;
  }

  transition(texA, texB, mix, mode, seed = 0, edge = [1, 0.8, 0.5]) {
    const u = this.mix.uniforms;
    u.tA.value = texA; u.tB.value = texB; u.uMix.value = mix; u.uMode.value = mode; u.uSeed.value = seed;
    u.uEdge.value.setRGB(...edge);
    this.pass(this.mix, this.mixT);
    return this.mixT;
  }

  composite(srcRT, overlayTex, g, frame) {
    const bloom = g.bloom > 0 ? this.bloomChain(srcRT, g) : this.black;
    const streak = g.streak > 0 ? this.streakChain(g) : this.black;
    const u = this.comp.uniforms;
    u.tScene.value = srcRT.texture; u.tBloom.value = bloom; u.tStreak.value = streak; u.tOverlay.value = overlayTex || this.black;
    u.uFrame.value = frame % 997;
    u.uBloom.value = g.bloom; u.uStreak.value = g.streak; u.uExposure.value = g.exposure; u.uSat.value = g.sat;
    u.uContrast.value = g.contrast; u.uVignette.value = g.vignette; u.uGrain.value = g.grain; u.uCA.value = g.ca;
    const A = this.W / this.H;
    u.uLetterbox.value = g.aspect > A ? (1 - A / g.aspect) / 2 : 0;
    u.uFade.value = g.fade; u.uWhite.value = g.white; u.uOverlay.value = g.overlay; u.uKeepColor.value = g.keepColor;
    u.uTear.value = g.tear; u.uTearSeed.value = g.tearSeed; u.uTearGap.value = g.tearGap;
    u.uLift.value.set(...g.lift); u.uGamma.value.set(...g.gamma); u.uGain.value.set(...g.gain);
    u.uStreakTint.value.set(...g.streakTint); u.uShadowTint.value.set(...g.shadowTint); u.uHighTint.value.set(...g.highTint);
    u.uFadeColor.value.set(...g.fadeColor);
    this.pass(this.comp, null);
  }
}
