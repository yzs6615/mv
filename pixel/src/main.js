// Entry point: loads fonts and song data, builds the film, and exposes window.PX for the offline
// renderer. Without ?render it is a player: the picture follows the audio element.
import { Music } from './core/music.js';
import { Gfx } from './core/gfx.js';
import { ctx2d } from './core/env.js';
import { Film } from './film.js';

const W = 480, H = 270;
const q = new URLSearchParams(location.search);
const RENDER = q.has('render');
if (RENDER) document.body.classList.add('render');

async function loadFont(family, url) {
  const f = new FontFace(family, `url(${url})`);
  await f.load();
  document.fonts.add(f);
}

async function getJSON(url, fallback) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    return fallback;
  }
}

const screen = document.getElementById('screen');
const main = new Gfx(W, H, screen);
let film = null;

async function init() {
  const fs = '../node_modules/@fontsource/';
  await Promise.all([
    loadFont('Fusion Pixel 12px Proportional SC', fs + 'fusion-pixel-12px-proportional-sc/files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2'),
    loadFont('Fusion Pixel 8px Proportional SC', fs + 'fusion-pixel-8px-proportional-sc/files/fusion-pixel-8px-proportional-sc-latin-400-normal.woff2'),
    loadFont('Press Start 2P', fs + 'press-start-2p/files/press-start-2p-latin-400-normal.woff2'),
  ]);
  const map = await getJSON('../mg/data/music_map.json', null);
  const lyrics = await getJSON('../mg/data/lyrics.json', { lines: [], outroSyllables: [] });
  const music = new Music(map);
  film = new Film({ music, lyrics, W, H });
  await film.init();
  return { duration: music.duration, W, H };
}

function frame(t) {
  film.draw(main, t);
}

window.PX = {
  init,
  frame,
  cues: () => film.cues(),
  // draw frames f0..f1-1 and POST each one's RGBA bytes to url (the server answers when written)
  async renderRange(f0, f1, fps, url) {
    for (let f = f0; f < f1; f++) {
      frame(f / fps);
      const buf = main.ctx.getImageData(0, 0, W, H).data.buffer;
      const r = await fetch(`${url}?f=${f}`, { method: 'POST', body: buf });
      if (!r.ok) throw new Error('frame post failed ' + r.status);
    }
    return f1 - f0;
  },
  // PNG of one frame, scaled up with nearest neighbour
  still(t, scale = 2) {
    frame(t);
    const c = document.createElement('canvas');
    c.width = W * scale;
    c.height = H * scale;
    const x = ctx2d(c);
    x.drawImage(screen, 0, 0, W * scale, H * scale);
    return c.toDataURL('image/png');
  },
  // contact sheet of several times with captions
  sheet(times, cols = 4, scale = 1) {
    const rows = Math.ceil(times.length / cols), cw = W * scale, ch = H * scale + 14;
    const c = document.createElement('canvas');
    c.width = cols * cw + (cols - 1) * 4;
    c.height = rows * ch;
    const x = ctx2d(c);
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
    times.forEach((t, i) => {
      frame(t);
      const X = (i % cols) * (cw + 4), Y = Math.floor(i / cols) * ch;
      x.drawImage(screen, X, Y, cw, H * scale);
      x.fillStyle = '#fff';
      x.font = '11px monospace';
      x.fillText(t.toFixed(2) + 's', X + 2, Y + H * scale + 11);
    });
    return c.toDataURL('image/png');
  },
};

if (!RENDER) {
  const audio = new Audio('../assets/song.mp3');
  let t0 = parseFloat(q.get('t') || '0');
  init().then(() => {
    audio.currentTime = t0;
    frame(t0);
    const loop = () => {
      frame(audio.paused ? audio.currentTime : audio.currentTime);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const toggle = () => (audio.paused ? audio.play() : audio.pause());
  addEventListener('click', toggle);
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight') audio.currentTime += 5;
    if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });
}
