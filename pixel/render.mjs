// Offline renderer for the pixel MV. Chromium draws each frame at 480x270 (Canvas 2D + three.js on
// SwiftShader), posts the raw RGBA bytes to this process, and ffmpeg stores them losslessly in
// chunks. The final pass scales the native frames up 4x with nearest neighbour and adds the audio.
//
//   node pixel/render.mjs --sheet 12.6,31.7,96.4 --name look      contact sheet -> pixel/build/stills/look.png
//   node pixel/render.mjs --still 96.4 --scale 3                   single frame(s)
//   node pixel/render.mjs --range 90:112                           1080p clip of a range, with audio
//   node pixel/render.mjs --all                                    the whole film -> pixel/build/only_one_pixel_1080p60.mp4
//   node pixel/render.mjs --cues                                   SFX cue list -> pixel/build/cues.json
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUILD = path.join(HERE, 'build');
const W = 480, H = 270;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]; };
const FPS = parseFloat(arg('fps', 60));
const WORKERS = parseInt(arg('workers', Math.min(4, os.cpus().length)), 10);
const CHUNK = parseInt(arg('chunk', 600), 10);
const CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
const FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas', '--disable-gpu-rasterization'];
fs.mkdirSync(BUILD, { recursive: true });

// ---------- static server + frame sink ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.png': 'image/png' };
const sinks = new Map(); // id -> {write(buf) -> Promise}
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && url.startsWith('/frame/')) {
    const id = url.slice(7);
    const parts = [];
    req.on('data', (d) => parts.push(d));
    req.on('end', async () => {
      const sink = sinks.get(id);
      if (!sink) { res.writeHead(404); res.end(); return; }
      await sink.write(Buffer.concat(parts));
      res.writeHead(200);
      res.end();
    });
    return;
  }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

async function openPage() {
  const browser = await chromium.launch({ executablePath: CHROME, args: FLAGS });
  const page = await browser.newPage({ viewport: { width: 520, height: 300 } });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || argv.includes('--verbose')) console.log('[page]', m.text()); });
  await page.goto(`${BASE}/pixel/index.html?render`);
  const info = await page.evaluate(() => window.PX.init());
  return { browser, page, info };
}

function ffmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [opts.stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    if (opts.onSpawn) opts.onSpawn(p);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg exited ' + c))));
  });
}

// a frame sink that writes into an ffmpeg process with back-pressure
function makeSink(id, outArgs) {
  let proc;
  const done = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0', ...outArgs], {
    stdin: true,
    onSpawn: (p) => (proc = p),
  });
  const sink = {
    write: (buf) => new Promise((r) => (proc.stdin.write(buf) ? r() : proc.stdin.once('drain', r))),
    async close() { proc.stdin.end(); await done; sinks.delete(id); },
  };
  sinks.set(id, sink);
  return sink;
}

const LOSSLESS = ['-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', '-pix_fmt', 'rgb24'];

async function renderChunks(f0, f1, tag, force) {
  const dir = path.join(BUILD, 'chunks');
  fs.mkdirSync(dir, { recursive: true });
  const jobs = [];
  for (let a = f0; a < f1; a += CHUNK) {
    const b = Math.min(f1, a + CHUNK);
    const file = path.join(dir, `${tag}_${String(a).padStart(6, '0')}_${String(b).padStart(6, '0')}.mkv`);
    jobs.push({ a, b, file });
  }
  const todo = jobs.filter((j) => force || !fs.existsSync(j.file));
  console.log(`${todo.length}/${jobs.length} chunk(s) to render, ${WORKERS} worker(s)`);
  let next = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(WORKERS, todo.length) }, async (_, w) => {
    const { browser, page } = await openPage();
    while (next < todo.length) {
      const j = todo[next++];
      const id = `w${w}_${j.a}`;
      const tmp = j.file + '.part.mkv';
      const sink = makeSink(id, [...LOSSLESS, tmp]);
      const s = Date.now();
      await page.evaluate(([a, b, fps, url]) => window.PX.renderRange(a, b, fps, url), [j.a, j.b, FPS, `${BASE}/frame/${id}`]);
      await sink.close();
      fs.renameSync(tmp, j.file);
      console.log(`[w${w}] ${path.basename(j.file)}  ${((Date.now() - s) / (j.b - j.a)).toFixed(0)} ms/frame  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    await browser.close();
  }));
  return jobs.map((j) => j.file);
}

async function concatAndEncode(files, out, t0, dur, audio) {
  const list = path.join(BUILD, 'chunks', 'list.txt');
  fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
  const scale = parseInt(arg('scale', 4), 10);
  const args = ['-f', 'concat', '-safe', '0', '-i', list];
  if (audio) args.push('-ss', String(t0), '-t', String(dur), '-i', audio);
  // nearest-neighbour upscale in RGB, then an explicit BT.709 conversion (tagged, so players do not guess)
  args.push('-vf', `scale=${W * scale}:${H * scale}:flags=neighbor,scale=out_color_matrix=bt709:out_range=tv:flags=neighbor,format=yuv420p`,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', arg('preset', 'slow'), '-crf', String(arg('crf', 18)), '-tune', 'animation', '-r', String(FPS));
  if (audio) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  args.push('-movflags', '+faststart', out);
  await ffmpeg(args);
}

function pickAudio() {
  const mixed = path.join(BUILD, 'audio', 'mix.wav');
  if (fs.existsSync(mixed) && !argv.includes('--song-only')) return mixed;
  const song = path.join(ROOT, 'assets', 'song.mp3');
  return fs.existsSync(song) ? song : null;
}

const saveDataURL = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
const times = (s) => String(s).split(',').map(Number);

try {
  if (arg('sheet')) {
    const { browser, page } = await openPage();
    const dir = path.join(BUILD, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const url = await page.evaluate(([ts, cols, sc]) => window.PX.sheet(ts, cols, sc), [times(arg('sheet')), parseInt(arg('cols', 4), 10), parseInt(arg('scale', 1), 10)]);
    const file = path.join(dir, `${arg('name', 'sheet')}.png`);
    saveDataURL(url, file);
    console.log(file);
    await browser.close();
  } else if (arg('still')) {
    const { browser, page } = await openPage();
    const dir = path.join(BUILD, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of times(arg('still'))) {
      const url = await page.evaluate(([tt, sc]) => window.PX.still(tt, sc), [t, parseInt(arg('scale', 2), 10)]);
      const file = path.join(dir, `${arg('name', 'still')}_${t.toFixed(2)}.png`);
      saveDataURL(url, file);
      console.log(file);
    }
    await browser.close();
  } else if (arg('bench')) {
    const { browser, page } = await openPage();
    const res = await page.evaluate((ts) => ts.map((t) => {
      window.PX.frame(t);
      const t0 = performance.now();
      for (let i = 1; i <= 12; i++) window.PX.frame(t + i / 60);
      return [t, (performance.now() - t0) / 12];
    }), times(arg('bench')));
    for (const [t, ms] of res) console.log(`${t.toFixed(2).padStart(7)} s  ${ms.toFixed(1).padStart(6)} ms/frame`);
    await browser.close();
  } else if (arg('cues')) {
    const { browser, page } = await openPage();
    const cues = await page.evaluate(() => window.PX.cues());
    fs.writeFileSync(path.join(BUILD, 'cues.json'), JSON.stringify(cues, null, 1));
    console.log(`${cues.length} cues -> pixel/build/cues.json`);
    await browser.close();
  } else if (arg('range')) {
    const [a, b] = String(arg('range')).split(':').map(Number);
    const f0 = Math.round(a * FPS), f1 = Math.round(b * FPS);
    const files = await renderChunks(f0, f1, `r${FPS}`, argv.includes('--force'));
    const out = arg('out', path.join(BUILD, `range_${a}_${b}.mp4`));
    await concatAndEncode(files, out, f0 / FPS, (f1 - f0) / FPS, pickAudio());
    console.log(out);
  } else if (arg('all')) {
    const { browser, info } = await openPage();
    await browser.close();
    const f1 = Math.ceil(info.duration * FPS);
    console.log(`film: ${f1} frames @${FPS}fps (${info.duration.toFixed(2)} s)`);
    const files = await renderChunks(0, f1, `a${FPS}`, argv.includes('--force'));
    const out = arg('out', path.join(BUILD, `only_one_pixel_${H * parseInt(arg('scale', 4), 10)}p${FPS}.mp4`));
    await concatAndEncode(files, out, 0, f1 / FPS, pickAudio());
    console.log(out);
  }
} finally {
  server.close();
}
