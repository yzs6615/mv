// Boot: data, fonts, textures, then either the live player (audio-synced) or the offline capture API
// used by mg/render.mjs.
import { Film } from './film.js';
import { loadFonts } from './core/text.js';
import { initPost } from './core/post.js';

const q = new URLSearchParams(location.search);
const RENDER = q.has('render');
const W = +(q.get('w') || 1920), H = +(q.get('h') || 1080);
const FPS = +(q.get('fps') || 60);
if (RENDER) document.body.classList.add('render');

const canvas = document.getElementById('c');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: RENDER });

async function json(url, fallback) {
  try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

async function boot() {
  const [map, lyrics] = await Promise.all([json('data/music_map.json'), json('data/lyrics.json', { lines: [], outroSyllables: [] })]);
  const film = new Film(map, lyrics);
  await loadFonts([...lyrics.lines.map((l) => l.text), ...film.texts()]);
  initPost(W, H);
  const frames = Math.ceil(film.duration * FPS);
  const draw = (t, f) => film.render(ctx, t, f, W / 1920);

  let ws = null;
  if (q.get('ws')) {
    ws = new WebSocket(q.get('ws'));
    ws.binaryType = 'arraybuffer';
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  }
  window.MG = {
    fps: FPS, frames, duration: film.duration,
    renderAt(t) { draw(t, Math.round(t * FPS)); },
    capture(f) {
      draw(f / FPS, f);
      ws.send(ctx.getImageData(0, 0, W, H).data.buffer);
    },
    time(t) { const t0 = performance.now(); draw(t, Math.round(t * FPS)); return performance.now() - t0; },
  };
  window.ready = true;
  if (RENDER) return;

  // ---- live player ----
  const audio = document.getElementById('audio');
  const bar = document.getElementById('bar'), btn = document.getElementById('play'), tl = document.getElementById('time');
  let scrub = +(q.get('t') || 0);
  audio.currentTime = scrub;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const toggle = () => {
    if (audio.paused) { audio.play(); document.body.classList.remove('paused'); btn.textContent = '暂停'; }
    else { audio.pause(); document.body.classList.add('paused'); btn.textContent = '播放'; }
  };
  btn.onclick = toggle;
  canvas.onclick = toggle;
  document.onkeydown = (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight') audio.currentTime = Math.min(film.duration, audio.currentTime + 5);
    if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  };
  bar.oninput = () => { audio.currentTime = (bar.value / 1000) * film.duration; };
  const loop = () => {
    const t = audio.currentTime;
    draw(t, Math.round(t * FPS));
    bar.value = Math.round((t / film.duration) * 1000);
    tl.textContent = `${fmt(t)} / ${fmt(film.duration)}`;
    requestAnimationFrame(loop);
  };
  loop();
}

boot().catch((e) => { console.error(e); window.initError = String(e && e.stack || e); });
