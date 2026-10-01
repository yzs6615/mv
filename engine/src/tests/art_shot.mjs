// node engine/src/tests/art_shot.mjs <fn> <out.png> [scale] [mod]
// Screenshots the Canvas2D art preview (no WebGL) for fast iteration on paper-cut drawings.
import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
const root = '/home/user/mv';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const port = 8600 + Math.floor(Math.random() * 300);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(port);
const [fn, out, s = '1', mod = '', bg = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 4000, height: 3000 } });
p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => console.log('LOG', m.text()));
await p.goto(`http://localhost:${port}/engine/src/tests/art_preview.html?fn=${fn}&s=${s}${mod ? '&mod=' + mod : ''}${bg ? '&bg=' + encodeURIComponent(bg) : ''}`);
await p.waitForFunction('window.done', null, { timeout: 120000 });
const d = await p.evaluate('window.done'); console.log(d);
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: Math.min(4000, d[0]), height: Math.min(3000, d[1]) } });
await b.close(); srv.close();
