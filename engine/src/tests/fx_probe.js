import * as THREE from 'three';
import { renderSet } from '../core/director.js';
// probe: point sprite limits in SwiftShader (max size, clipping of points whose centre leaves the viewport)
export async function buildFilm(e) {
  const gl = e.gl;
  console.log('POINT RANGE', JSON.stringify(Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE))), 'MAXTEX', gl.getParameter(gl.MAX_TEXTURE_SIZE), 'VTF', gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, e.W / e.H, 0.1, 100); cam.position.set(0, 0, 10);
  const xs = [-1.02, -0.99, -0.9, 0.0, 0.95, 1.03];
  const pos = new Float32Array(xs.length * 3); xs.forEach((x, i) => { pos[i * 3] = x; pos[i * 3 + 1] = 0.3 * (i % 2); pos[i * 3 + 2] = 0; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({ uniforms: { uS: { value: 300 * e.px } },
    vertexShader: `uniform float uS; void main(){ gl_Position = vec4(position, 1.); gl_PointSize = uS; }`,
    fragmentShader: `void main(){ vec2 p = gl_PointCoord - .5; float r = length(p); gl_FragColor = vec4(vec3(1.,.6,.2) * smoothstep(.5,.45,r), 0.); }`,
    transparent: true, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  const set = { scene, camera: cam };
  e.director.add({ id: 'probe', start: 0, end: 2, grade: { bloom: 0, aspect: 1.7 }, render(ctx, target) { renderSet(ctx, target, set, cam); } });
  return { duration: 2 };
}
