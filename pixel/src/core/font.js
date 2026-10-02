// Bitmap text from pixel fonts. Glyphs are rasterized once at the font's design size, thresholded
// to hard pixels, and cached per (font, char, fill, outline, shadow). Drawing a string is one blit
// per character, which keeps per-character animation (typewriter, bounce, karaoke colour) cheap.
import { env, ctx2d } from './env.js';

export const FONTS = {
  // Fusion Pixel 12px (CJK + Latin), proportional
  zh: { family: "'Fusion Pixel 12px Proportional SC'", size: 12 },
  // Fusion Pixel 8px for small labels
  zh8: { family: "'Fusion Pixel 8px Proportional SC'", size: 8 },
  // Press Start 2P, 8px arcade capitals
  en: { family: "'Press Start 2P'", size: 8 },
};

const glyphs = new Map();
const composed = new Map();
let probe = null;

function metrics(f) {
  if (f.asc !== undefined) return f;
  probe = probe || ctx2d(env.createCanvas(64, 64));
  probe.font = `${f.size}px ${f.family}`;
  const m = probe.measureText('国Hg');
  f.asc = Math.round(m.fontBoundingBoxAscent);
  f.desc = Math.round(m.fontBoundingBoxDescent);
  f.h = f.asc + f.desc;
  return f;
}

// white mask of one glyph: {c, adv, h}
export function glyph(fk, ch) {
  const key = fk + ch;
  let gl = glyphs.get(key);
  if (gl) return gl;
  const f = metrics(FONTS[fk]);
  probe.font = `${f.size}px ${f.family}`;
  const adv = Math.round(probe.measureText(ch).width);
  const w = Math.max(1, adv + 2), h = f.h;
  const c = env.createCanvas(w, h);
  const x = ctx2d(c);
  x.font = `${f.size}px ${f.family}`;
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  x.fillText(ch, 0, f.asc);
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] >= 110;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = on ? 255 : 0;
  }
  x.putImageData(img, 0, 0);
  gl = { c, adv, w, h };
  glyphs.set(key, gl);
  return gl;
}

// glyph tinted with fill, optional 1px outline (8-neighbour) and drop shadow (+1,+1 below/right)
function compose(fk, ch, fill, outline, shadow) {
  const key = fk + ch + fill + (outline || '') + (shadow || '');
  let r = composed.get(key);
  if (r) return r;
  const gl = glyph(fk, ch);
  const pad = outline ? 1 : 0, sh = shadow ? 1 : 0;
  const w = gl.w + pad * 2 + sh, h = gl.h + pad * 2 + sh;
  const c = env.createCanvas(w, h);
  const x = ctx2d(c);
  const tint = (col) => {
    const t = env.createCanvas(gl.w, gl.h);
    const tx = ctx2d(t);
    tx.drawImage(gl.c, 0, 0);
    tx.globalCompositeOperation = 'source-in';
    tx.fillStyle = col;
    tx.fillRect(0, 0, gl.w, gl.h);
    return t;
  };
  if (shadow) {
    const ts = tint(shadow);
    if (outline) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) x.drawImage(ts, pad + dx + 1, pad + dy + 1);
    else x.drawImage(ts, 1, 1);
  }
  if (outline) {
    const to = tint(outline);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) x.drawImage(to, pad + dx, pad + dy);
  }
  x.drawImage(tint(fill), pad, pad);
  r = { c, adv: gl.adv, pad, w, h };
  composed.set(key, r);
  return r;
}

export function lineHeight(fk) { return metrics(FONTS[fk]).h; }

export function measure(str, o = {}) {
  const fk = o.font || 'zh', sc = o.scale || 1, sp = o.spacing || 0;
  let w = 0;
  for (const ch of str) w += (glyph(fk, ch).adv + sp) * sc;
  return Math.max(0, w - sp * sc);
}

// draw a string. o: {font, color, outline, shadow, align ('left'|'center'|'right'), scale, spacing,
// each(i, ch) -> {dy, dx, color, hide}}. Returns the drawn width.
export function text(g, str, x, y, o = {}) {
  const fk = o.font || 'zh', sc = o.scale || 1, sp = o.spacing || 0;
  const chars = [...str];
  const W = measure(str, o);
  let cx = Math.round(o.align === 'center' ? x - W / 2 : o.align === 'right' ? x - W : x);
  const ctx = g.ctx;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const fx = o.each ? o.each(i, ch) || {} : {};
    const gl = glyph(fk, ch);
    if (!fx.hide && ch !== ' ') {
      const r = compose(fk, ch, fx.color || o.color || '#ffffff', fx.outline ?? o.outline, fx.shadow ?? o.shadow);
      const dx = Math.round(fx.dx || 0) * sc, dy = Math.round(fx.dy || 0) * sc;
      ctx.drawImage(r.c, cx - r.pad * sc + dx + g.ox, Math.round(y) - r.pad * sc + dy + g.oy, r.w * sc, r.h * sc);
    }
    cx += (gl.adv + sp) * sc;
  }
  return W;
}
