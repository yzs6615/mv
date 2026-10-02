// Game HUD pieces: stage cards, HP bars, LEVEL UP, item-get banners, rank tags, combo counters,
// score cards, damage numbers, a typewriter caption. All are functions of an age (seconds since the
// event) so scenes just pass times.
import { P, RAINBOW } from '../core/pal.js';
import { text, measure } from '../core/font.js';
import { box } from '../lyrics.js';

export { box };

// "LEVEL UP!" rising and flashing through the rainbow
export function levelUp(g, x, y, age, label = 'LEVEL UP!') {
  if (age < 0 || age > 1.8) return;
  const rise = Math.min(10, Math.floor(age * 40));
  const col = RAINBOW[Math.floor(age * 16) % RAINBOW.length];
  const vis = age < 1.4 || Math.floor(age * 20) % 2 === 0;
  if (vis) text(g, label, x, y - rise, { font: 'en', align: 'center', color: col, outline: P.ink });
}

// item get banner (dialog box at the top with an icon slot)
export function itemBanner(g, line1, line2, age, icon) {
  if (age < 0 || age > 3.2) return;
  const W = 260, x = (g.W - W) / 2;
  const open = Math.min(1, age / 0.12), close = age > 2.9 ? 1 - (age - 2.9) / 0.3 : 1;
  const h = Math.round(38 * Math.min(open, close));
  if (h < 4) return;
  const y = 14 + (38 - h) / 2;
  box(g, x, y, W, h);
  if (h < 38) return;
  if (icon) g.spr(icon, x + 22, y + 26);
  const n = Math.floor((age - 0.15) * 30);
  text(g, [...line1].slice(0, Math.max(0, n)).join(''), x + 40, y + 6, { color: P.yellow });
  text(g, [...line2].slice(0, Math.max(0, n - [...line1].length)).join(''), x + 40, y + 21, { color: P.white });
}

// HP bar with label, numbers, and a damage flash
export function hpBar(g, x, y, hp, max, o = {}) {
  const w = o.w || 80;
  text(g, o.label || 'HP', x, y, { font: 'en', color: P.white, outline: P.ink });
  const bx = x + 20;
  g.rect(bx - 1, y - 1, w + 2, 10, P.ink);
  g.rect(bx, y, w, 8, P.g5);
  const f = Math.max(0, Math.min(1, hp / max));
  const fw = Math.round(w * f);
  const col = f > 0.5 ? P.green : f > 0.25 ? P.gold : P.red;
  g.rect(bx, y, fw, 8, col);
  g.rect(bx, y, fw, 2, f > 0.5 ? P.yellow : P.peach);
  if (o.ghost && o.ghost > hp) g.rect(bx + fw, y, Math.round(w * (o.ghost - hp) / max), 8, P.white);
  text(g, `${Math.ceil(hp)}`, bx + w + 6, y, { font: 'en', color: P.white, outline: P.ink });
}

// floating damage number ("-3") or status text ("GUTS!")
export function popText(g, x, y, str, age, col = P.red, o = {}) {
  if (age < 0 || age > (o.life || 0.9)) return;
  const dy = age < 0.15 ? -Math.round(age * 60) : -9 - Math.round((age - 0.15) * 6);
  if (age > (o.life || 0.9) - 0.2 && Math.floor(age * 30) % 2) return;
  text(g, str, x, y + dy, { font: o.font || 'en', align: 'center', color: col, outline: P.ink, scale: o.scale || 1 });
}

// rank tag above a head: "1st", "2nd"... with a small pointer; crack (0..1) draws fracture lines
export function rankTag(g, x, y, rank, o = {}) {
  const s = rank + (rank % 10 === 1 && rank !== 11 ? 'st' : rank % 10 === 2 && rank !== 12 ? 'nd' : rank % 10 === 3 && rank !== 13 ? 'rd' : 'th');
  const font = o.small ? 'zh8' : 'en';
  const w = measure(s, { font }) + (o.small ? 4 : 6);
  const bx = Math.round(x - w / 2), by = Math.round(y - 13);
  const col = o.col || (rank === 1 ? P.gold : rank === 2 ? P.g1 : rank === 3 ? P.clay : P.cyan);
  g.rect(bx - 1, by - 1, w + 2, 12, P.ink);
  g.rect(bx, by, w, 10, col);
  g.rect(bx, by, w, 1, P.white);
  g.rect(Math.round(x) - 1, by + 11, 3, 1, P.ink);
  g.px(Math.round(x), by + 12, P.ink);
  text(g, s, bx + (o.small ? 2 : 3), by + (o.small ? 0 : 1), { font, color: P.ink });
  if (o.crack > 0) {
    const n = Math.ceil(o.crack * 4);
    for (let i = 0; i < n; i++) {
      const cx = bx + 2 + ((i * 7 + rank * 3) % (w - 4));
      g.line(cx, by, cx + (i % 2 ? 2 : -2), by + 4, P.white);
      g.line(cx + (i % 2 ? 2 : -2), by + 4, cx + (i % 2 ? 1 : -3), by + 9, P.white);
    }
  }
  return { x: bx, y: by, w, h: 10 };
}

// combo counter: "x12 COMBO!" with a punch scale on each increment
export function combo(g, x, y, n, sinceInc) {
  if (n < 2) return;
  const sc = sinceInc < 0.08 ? 3 : 2;
  const col = RAINBOW[n % RAINBOW.length];
  text(g, 'x' + n, x, y - (sc - 2) * 4, { font: 'en', scale: sc, color: col, outline: P.ink, align: 'right' });
  text(g, 'COMBO!', x, y + 18, { font: 'en', color: P.white, outline: P.ink, align: 'right' });
}

// judge score card
export function scoreCard(g, x, y, str, col = P.ink, bg = P.white, font = 'zh8') {
  const w = Math.max(12, measure(str, { font }) + 4);
  const h = font === 'zh8' ? 10 : 12;
  g.rect(Math.round(x - w / 2) - 1, y - 1, w + 2, h + 2, P.ink);
  g.rect(Math.round(x - w / 2), y, w, h, bg);
  g.rect(x - 1, y + h + 1, 2, 8, P.brown);
  text(g, str, x, y + (font === 'zh8' ? 1 : 2), { font, color: col, align: 'center' });
}

// typewriter caption: characters of str appear from t0 at cps; returns number shown
export function typewriter(g, str, x, y, t0, t, o = {}) {
  const n = Math.max(0, Math.floor((t - t0) * (o.cps || 14)));
  const chars = [...str];
  const shown = chars.slice(0, n).join('');
  const caret = t >= t0 && Math.floor(t * 4) % 2 === 0 && n <= chars.length;
  const w = measure(str, { font: o.font || 'en', scale: o.scale || 1 });
  const left = o.align === 'center' ? x - w / 2 : x;
  text(g, shown, left, y, { font: o.font || 'en', scale: o.scale || 1, color: o.color || P.white, outline: o.outline ?? P.ink, shadow: o.shadow });
  if (caret && o.caret !== false) {
    const cw = measure(shown, { font: o.font || 'en', scale: o.scale || 1 });
    g.rect(left + cw + 2, y, 6 * (o.scale || 1), 8 * (o.scale || 1), o.color || P.white);
  }
  return Math.min(n, chars.length);
}

// blinking label (PUSH START etc.)
export function blink(g, str, x, y, t, o = {}) {
  if (Math.floor(t * (o.rate || 2)) % 2 === 0) text(g, str, x, y, { font: 'en', align: 'center', color: P.white, outline: P.ink, ...o });
}

// big outlined title text with a two-colour vertical split (top light, bottom deep)
export function titleText(g, str, x, y, o = {}) {
  const sc = o.scale || 2, font = o.font || 'zh';
  const top = o.top || P.yellow, bot = o.bot || P.orange, edge = o.edge || P.ink;
  // shadow + outline
  text(g, str, x + sc, y + sc, { font, scale: sc, color: edge, outline: edge, align: o.align || 'center' });
  text(g, str, x, y, { font, scale: sc, color: bot, outline: edge, align: o.align || 'center' });
  // light top half via clipping
  const c = g.ctx;
  c.save();
  c.beginPath();
  c.rect(0, 0, g.W, Math.round(y + g.oy + (o.split || 6) * sc));
  c.clip();
  text(g, str, x, y, { font, scale: sc, color: top, outline: edge, align: o.align || 'center' });
  c.restore();
}
