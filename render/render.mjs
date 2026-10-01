#!/usr/bin/env node
// Frame-accurate offline renderer.
// Launches headless Chromium (SwiftShader WebGL), loads engine/index.html, renders frames by index
// (the engine is a pure function of time) and streams raw RGBA over a WebSocket straight into ffmpeg.
//
//   node render/render.mjs --stills 0,240,480            # PNG stills -> build/stills
//   node render/render.mjs --times 12.5,40.2 --sheet qa  # stills at film times + contact sheet
//   node render/render.mjs --range 0:1056 --out build/chunks/p0.mp4
//   node render/render.mjs --all --chunk 480 --workers 2  # whole film in chunks (resumable)
//   add --scale 0.5 for half-resolution previews, --every 2 for half frame-rate previews

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const scale = parseFloat(args.scale || '1');
const W = Math.round(1920 * scale / 2) * 2, H = Math.round(1080 * scale / 2) * 2;
const FPS = 24;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serve(port) {
  return http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(port);
}

async function openWorker(id, httpPort) {
  const wsPort = 9100 + id + Math.floor(Math.random() * 500) * 4;
  const wss = new WebSocketServer({ port: wsPort, maxPayload: 64 * 1024 * 1024 });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--js-flags=--max-old-space-size=4096'] });
  const page = await browser.newPage({ viewport: { width: Math.min(W, 1920), height: Math.min(H, 1080) } });
  page.on('console', (m) => { const s = m.text(); if (!/Failed to load resource|GPU stall|swiftshader/i.test(s)) console.log(`[w${id}]`, s); });
  page.on('pageerror', (e) => console.log(`[w${id}] PAGE ERROR`, e.message));
  let onFrame = null;
  wss.on('connection', (sock) => sock.on('message', (data) => { if (onFrame) onFrame(Buffer.from(data)); }));
  const extra = args.params ? `&${args.params}` : '';
  await page.goto(`http://localhost:${httpPort}/engine/index.html?w=${W}&h=${H}&ws=ws://localhost:${wsPort}${extra}`);
  await page.waitForFunction('window.ready === true || window.initError', null, { timeout: 600000 });
  const err = await page.evaluate('window.initError');
  if (err) throw new Error(err);
  const info = await page.evaluate('({frames: LS.frames, duration: LS.duration, rt: LS.rtType})');
  return { id, browser, page, wss, info, setHandler: (fn) => { onFrame = fn; } };
}

function ffmpegVideo(out, fps) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const crf = args.crf || (scale < 1 ? '23' : '16');
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
    '-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', args.preset || (scale < 1 ? 'veryfast' : 'slow'),
    '-crf', crf, '-tune', 'film', '-x264-params', 'keyint=48:min-keyint=24', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  return p;
}

function writePng(buf, file) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-vf', 'vflip', '-frames:v', '1', file]);
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('png ' + c))));
    p.stdin.end(buf.subarray(8));
  });
}

async function renderFrames(worker, frames, sink) {
  let pending = null;
  const t0 = Date.now();
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const got = new Promise((res) => worker.setHandler(res));
    await worker.page.evaluate((x) => window.LS.capture(x), f);
    const buf = await got;
    if (pending) await pending;
    pending = sink(buf, f);
    if ((i + 1) % 24 === 0 || i === frames.length - 1) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`[w${worker.id}] ${i + 1}/${frames.length} frames  ${(el / (i + 1)).toFixed(2)} s/frame  eta ${(((frames.length - i - 1) * el) / (i + 1) / 60).toFixed(1)} min\n`);
    }
  }
  if (pending) await pending;
}

async function main() {
  const httpPort = 8800 + Math.floor(Math.random() * 400);
  const srv = serve(httpPort);
  const nW = parseInt(args.workers || '1');
  const workers = [];
  for (let i = 0; i < nW; i++) workers.push(await openWorker(i, httpPort));
  const { frames: total } = workers[0].info;
  console.log(`engine ready: ${total} frames (${(total / FPS).toFixed(2)} s), ${W}x${H}, rt=${workers[0].info.rt}`);
  const every = parseInt(args.every || '1');

  if (args.stills || args.times) {
    const list = args.stills ? String(args.stills).split(',').map(Number) : String(args.times).split(',').map((s) => Math.round(parseFloat(s) * FPS));
    const dir = path.join(ROOT, 'build', 'stills', args.sheet && args.sheet !== true ? args.sheet : '');
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    const per = Math.ceil(list.length / nW);
    await Promise.all(workers.map((w, k) => renderFrames(w, list.slice(k * per, (k + 1) * per), async (buf, f) => {
      const file = path.join(dir, `f${String(f).padStart(5, '0')}.png`); files.push([f, file]); await writePng(buf, file);
    })));
    if (args.sheet) {
      files.sort((a, b) => a[0] - b[0]);
      execFileSync('python3', [path.join(ROOT, 'render', 'sheet.py'), path.join(dir, 'sheet.jpg'), ...files.map(([f, p]) => `${p}@${(f / FPS).toFixed(2)}`)], { stdio: 'inherit' });
    }
  } else {
    // video: explicit range or the whole film split into resumable chunks
    let [a, b] = args.range ? String(args.range).split(':').map((s) => (s.includes('.') ? Math.round(parseFloat(s) * FPS) : parseInt(s))) : [0, total];
    b = Math.min(b, total);
    const chunk = parseInt(args.chunk || String(b - a));
    const jobs = [];
    for (let s = a; s < b; s += chunk) jobs.push([s, Math.min(b, s + chunk)]);
    const outDir = path.join(ROOT, 'build', args.dir || 'chunks');
    const queue = jobs.map(([s, e]) => ({ s, e, out: args.out && jobs.length === 1 ? path.resolve(args.out) : path.join(outDir, `c_${String(s).padStart(5, '0')}_${String(e).padStart(5, '0')}${scale < 1 ? '_p' : ''}.mp4`) }))
      .filter((j) => args.force || !fs.existsSync(j.out));
    console.log(`${queue.length} chunk(s) to render`);
    await Promise.all(workers.map(async (w) => {
      while (queue.length) {
        const j = queue.shift();
        const tmp = j.out.replace(/\.mp4$/, '.part.mp4');
        const ff = ffmpegVideo(tmp, FPS / every);
        const done = new Promise((res) => ff.on('close', res));
        const list = []; for (let f = j.s; f < j.e; f += every) list.push(f);
        await renderFrames(w, list, (buf) => new Promise((res) => { if (!ff.stdin.write(buf.subarray(8))) ff.stdin.once('drain', res); else res(); }));
        ff.stdin.end(); await done;
        fs.renameSync(tmp, j.out);
        console.log(`chunk done ${path.basename(j.out)}`);
      }
    }));
  }
  for (const w of workers) { await w.browser.close(); w.wss.close(); }
  srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
