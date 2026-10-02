// Render worker (Node + Skia via @napi-rs/canvas). Receives jobs from mg/render.mjs over IPC:
//   { kind: 'stills', frames: [...], dir }  -> PNG files
//   { kind: 'chunk', s, e, out }            -> H.264 chunk (raw RGBA piped into ffmpeg)
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { env } from './src/core/env.js';
import { initPost } from './src/core/post.js';
import { Film } from './src/film.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(HERE, 'build', 'fonts');
const cfg = JSON.parse(process.argv[2]);
const { W, H, FPS } = cfg;

const need = ['LXGWWenKai-bold.ttf', 'LXGWWenKai-regular.ttf', 'Fraunces-latin-400-normal.ttf', 'Fraunces-latin-600-normal.ttf',
  'Fraunces-latin-400-italic.ttf', 'Fraunces-latin-500-italic.ttf', 'Fraunces-latin-600-italic.ttf'];
for (const f of need) {
  const p = path.join(FONTS, f);
  if (!fs.existsSync(p)) { console.error(`missing ${p}; run: python3 mg/tools/build_fonts.py`); process.exit(2); }
  GlobalFonts.registerFromPath(p, f.startsWith('LXGW') ? 'LXGW WenKai' : 'Fraunces');
}
env.createCanvas = (w, h) => createCanvas(w, h);

const read = (p, fb) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fb);
const map = read(path.join(HERE, 'data', 'music_map.json'));
const lyrics = read(path.join(HERE, 'data', 'lyrics.json'), { lines: [], outroSyllables: [] });
const film = new Film(map, lyrics);
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
initPost(W, H);
const k = W / 1920;
const draw = (f) => film.render(ctx, f / FPS, f, k);

function ffmpeg(out) {
  return spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', cfg.preset, '-crf', String(cfg.crf),
    '-tune', 'animation', '-g', String(FPS * 2), '-threads', String(cfg.ffThreads ?? 2), '-colorspace', 'bt709', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
}

async function job(j) {
  const t0 = Date.now();
  if (j.kind === 'stills') {
    fs.mkdirSync(j.dir, { recursive: true });
    const files = [];
    for (const f of j.frames) {
      draw(f);
      const file = path.join(j.dir, `t${(f / FPS).toFixed(2).padStart(7, '0')}.png`);
      fs.writeFileSync(file, canvas.toBuffer('image/png'));
      files.push([f, file]);
    }
    return { files, ms: (Date.now() - t0) / j.frames.length };
  }
  if (j.kind === 'bench') {
    const out = [];
    for (const f of j.frames) { const a = performance.now(); draw(f); canvas.data(); out.push(performance.now() - a); }
    return { ms: out };
  }
  // chunk
  const tmp = j.out.replace(/\.mp4$/, '.part.mp4');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  const ff = ffmpeg(tmp);
  const done = new Promise((res) => ff.on('close', res));
  for (let f = j.s; f < j.e; f++) {
    draw(f);
    const buf = canvas.data();
    if (!ff.stdin.write(Buffer.from(buf))) await new Promise((res) => ff.stdin.once('drain', res));
    if ((f - j.s + 1) % 300 === 0) process.send({ progress: f - j.s + 1, of: j.e - j.s, ms: (Date.now() - t0) / (f - j.s + 1), out: path.basename(j.out) });
  }
  ff.stdin.end();
  const code = await done;
  if (code !== 0) throw new Error('ffmpeg exit ' + code);
  fs.renameSync(tmp, j.out);
  return { out: j.out, ms: (Date.now() - t0) / (j.e - j.s) };
}

process.on('message', async (j) => {
  try { process.send({ done: true, id: j.id, ...(await job(j)) }); }
  catch (e) { process.send({ error: String(e && e.stack || e), id: j.id }); }
});
process.send({ ready: true, frames: Math.ceil(film.duration * FPS), duration: film.duration });
