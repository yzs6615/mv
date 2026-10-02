// three.js for the voxel shots: one shared WebGL renderer at pixel resolution (no anti-aliasing),
// copied into the scene's 2D buffer and snapped to the palette by the post pass.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

let renderer = null;
export function glRenderer(w, h) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  }
  const s = renderer.getSize(new THREE.Vector2());
  if (s.x !== w || s.y !== h) renderer.setSize(w, h, false);
  return renderer;
}

// render a scene/camera into a Gfx buffer (top-left), returns nothing
export function renderInto(g, scene, camera) {
  const r = glRenderer(g.W, g.H);
  r.render(scene, camera);
  g.ctx.drawImage(r.domElement, 0, 0);
}

// canvas texture with crisp pixels
export function pixelTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export { THREE };

// voxel material: per-instance colour, flat face shading by normal (top bright, sides darker), fog.
// Output stays close to the palette so the quantizer has little to do.
export function voxelMaterial(fog, near = 60, far = 400) {
  return new THREE.ShaderMaterial({
    uniforms: { fogColor: { value: new THREE.Color(fog) }, fogNear: { value: near }, fogFar: { value: far } },
    vertexShader: `
varying vec3 vN; varying vec3 vC; varying float vD;
void main() {
  mat4 im = mat4(1.0);
#ifdef USE_INSTANCING
  im = instanceMatrix;
#endif
  vec4 wp = modelMatrix * im * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix * im) * normal);
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#else
  vC = vec3(1.0);
#endif
  vec4 mv = viewMatrix * wp;
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
varying vec3 vN; varying vec3 vC; varying float vD;
void main() {
  vec3 n = normalize(vN);
  float shade = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.45 : (abs(n.x) > 0.5 ? (n.x > 0.0 ? 0.82 : 0.62) : (n.z > 0.0 ? 0.72 : 0.55)));
  vec3 col = vC * shade;
  float f = clamp((vD - fogNear) / (fogFar - fogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
}`,
  });
}
