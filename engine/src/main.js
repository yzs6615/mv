import * as THREE from 'three';
import { Post } from './core/post.js';
import { Typography } from './core/typography.js';
import { Director } from './core/director.js';
import * as music from './core/music.js';

// Engine bootstrap. The page exposes window.LS:
//   LS.init()           -> { frames, fps, duration }
//   LS.capture(f)       -> renders frame f and streams raw RGBA (bottom-up) over the WebSocket
//   LS.render(f)        -> renders frame f to the canvas only (for debugging)

const Q = new URLSearchParams(location.search);
const W = parseInt(Q.get('w') || '1920'), H = parseInt(Q.get('h') || '1080');

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  document.body.appendChild(renderer.domElement);
  const gl = renderer.getContext();
  const floatBlend = !!gl.getExtension('EXT_float_blend');
  const rtType = floatBlend ? THREE.FloatType : THREE.HalfFloatType;

  const mm = await (await fetch('data/music_map.json')).json();
  music.setMusicMap(mm);

  const e = {
    THREE, renderer, gl, W, H, px: H / 1080, music, rtType, floatBlend, Q,
    post: new Post(renderer, W, H, rtType),
    type: new Typography(W, H),
    cache: new Map(),
  };
  e.director = new Director(e);
  // ?film=./tests/foo.js loads an alternative edit (component test benches); default is the real film
  const { buildFilm } = await import(Q.get('film') || './film.js');
  const film = await buildFilm(e);
  await e.type.preload(film.glyphs || []);
  if (film.warm) await film.warm();
  e.film = film;
  window.__E = e;

  const buf = new Uint8Array(8 + W * H * 4);
  const pix = buf.subarray(8);
  const hdr = new DataView(buf.buffer);
  let ws = null;
  const wsUrl = Q.get('ws');
  if (wsUrl) {
    ws = new WebSocket(wsUrl); ws.binaryType = 'arraybuffer';
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  }

  const render = (f) => {
    const t = f / music.FPS;
    e.frame = f; e.t = t;
    e.director.frame(t, f);
  };

  window.LS = {
    frames: Math.round(film.duration * music.FPS), fps: music.FPS, duration: film.duration,
    floatBlend, rtType: floatBlend ? 'float' : 'half',
    render,
    async capture(f) {
      render(f);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pix);
      hdr.setUint32(0, f, true); hdr.setUint32(4, W * H * 4, true);
      ws.send(buf);
      while (ws.bufferedAmount > 64 * 1024 * 1024) await new Promise((r) => setTimeout(r, 5));
      return true;
    },
    shots: () => e.director.shots.map((s) => ({ id: s.id, start: s.start, end: s.end })),
  };
  window.ready = true;
}

init().catch((err) => { console.error('INIT FAILED', err && (err.stack || err.message || err)); window.initError = String(err && (err.stack || err)); });
