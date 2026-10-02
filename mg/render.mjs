#!/usr/bin/env node
// Offline renderer for the MG edition (Node + Skia, several worker processes).
// The film is a pure function of time, so frames can be rendered in any order and in parallel.
//
//   node mg/render.mjs --times 3,12.6,40 --sheet look        stills + contact sheet in mg/build/stills/look
//   node mg/render.mjs --bench 3,40,95                         ms per frame (draw + pixel readback)
//   node mg/render.mjs --range 90:112 --fps 30 --scale 0.5     preview clip with the song
//   node mg/render.mjs --all                                   whole film, chunked and resumable, muxed with the song
//   options: --workers 3, --scale 0.5, --fps 60, --crf 16, --preset medium, --chunk 20 (s), --force

import fs from 'fs';
import path from 'path';
import { fork, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'build');
const SONG = path.join(ROOT, 'assets', 'song.mp3');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const scale = parseFloat(args.scale || '1');
const W = Math.round((1920 * scale) / 2) * 2, H = Math.round((1080 * scale) / 2) * 2;
const FPS = parseInt(args.fps || '60');
const cfg = { W, H, FPS, crf: args.crf || (scale < 1 ? 23 : 16), preset: args.preset || (scale < 1 ? 'veryfast' : 'medium'), ffThreads: 2 };

function startWorker(id) {
  const p = fork(path.join(HERE, 'render_worker.mjs'), [JSON.stringify(cfg)], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
  let ready, pending = null;
  const r = new Promise((res) => (ready = res));
  p.on('message', (m) => {
    if (m.ready) ready(m);
    else if (m.progress) process.stdout.write(`[w${id}] ${m.out} ${m.progress}/${m.of}  ${m.ms.toFixed(0)} ms/frame\n`);
    else if (pending) { const f = pending; pending = null; m.error ? f.rej(new Error(m.error)) : f.res(m); }
  });
  p.on('exit', (c) => { if (c && pending) pending.rej(new Error(`worker ${id} exited ${c}`)); });
  return { id, p, ready: r, run: (j) => new Promise((res, rej) => { pending = { res, rej }; p.send(j); }) };
}

async function main() {
  const nW = parseInt(args.workers || (args.times || args.bench ? '1' : '3'));
  const workers = Array.from({ length: nW }, (_, i) => startWorker(i));
  const info = await workers[0].ready;
  await Promise.all(workers.map((w) => w.ready));
  const total = info.frames;
  console.log(`ready: ${total} frames @${FPS}fps (${info.duration.toFixed(2)} s), ${W}x${H}, ${nW} worker(s)`);

  if (args.bench) {
    const frames = String(args.bench).split(',').flatMap((s) => { const f = Math.round(parseFloat(s) * FPS); return [f, f, f + 1, f + 2, f + 3]; });
    const r = await workers[0].run({ kind: 'bench', frames });
    for (let i = 0; i < frames.length; i += 5) console.log(`t=${(frames[i] / FPS).toFixed(2)}s  ${r.ms.slice(i + 1, i + 5).map((v) => v.toFixed(0)).join(' ')} ms`);
  } else if (args.times) {
    const list = String(args.times).split(',').map((s) => Math.round(parseFloat(s) * FPS));
    const dir = path.join(OUT, 'stills', args.sheet && args.sheet !== true ? args.sheet : 'misc');
    const per = Math.ceil(list.length / nW);
    const res = await Promise.all(workers.map((w, k) => w.run({ kind: 'stills', frames: list.slice(k * per, (k + 1) * per), dir })));
    const files = res.flatMap((r) => r.files).sort((a, b) => a[0] - b[0]);
    console.log(`stills: ${files.length}, ${res[0].ms.toFixed(0)} ms/frame`);
    if (args.sheet) execFileSync('python3', [path.join(ROOT, 'render', 'sheet.py'), path.join(dir, 'sheet.jpg'), ...files.map(([f, p]) => `${p}@${(f / FPS).toFixed(2)}`)], { stdio: 'inherit' });
  } else {
    let [a, b] = args.range ? String(args.range).split(':').map((s) => Math.round(parseFloat(s) * FPS)) : [0, total];
    b = Math.min(b, total);
    const chunk = Math.round(parseFloat(args.chunk || '20') * FPS);
    const jobs = [];
    for (let s = a; s < b; s += chunk) jobs.push({ kind: 'chunk', s, e: Math.min(b, s + chunk), out: path.join(OUT, 'chunks', `c_${FPS}_${W}_${String(s).padStart(6, '0')}_${String(Math.min(b, s + chunk)).padStart(6, '0')}.mp4`) });
    const queue = jobs.filter((j) => args.force || !fs.existsSync(j.out));
    console.log(`${queue.length}/${jobs.length} chunk(s) to render`);
    const t0 = Date.now();
    await Promise.all(workers.map(async (w) => { while (queue.length) { const j = queue.shift(); const r = await w.run(j); console.log(`[w${w.id}] done ${path.basename(r.out)} ${r.ms.toFixed(0)} ms/frame`); } }));
    console.log(`rendered ${b - a} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    const out = args.out ? path.resolve(args.out) : path.join(OUT, args.all ? `only_one_${H}p${FPS}.mp4` : `clip_${(a / FPS).toFixed(1)}_${(b / FPS).toFixed(1)}.mp4`);
    const list = path.join(OUT, 'chunks', `list_${process.pid}.txt`);
    fs.writeFileSync(list, jobs.map((j) => `file '${j.out}'`).join('\n'));
    const video = path.join(OUT, 'chunks', `video_${process.pid}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video], { stdio: 'inherit' });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-ss', String(a / FPS), '-t', String((b - a) / FPS), '-i', SONG,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
    fs.rmSync(list); fs.rmSync(video);
    console.log('wrote', out);
  }
  for (const w of workers) w.p.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
