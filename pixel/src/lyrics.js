// Lyric overlay. Each character types on at the moment it is sung, hops one pixel, and is lit
// yellow while it is being sung (karaoke); the line clears left to right after it ends.
// Scenes can restyle or hide it with scene.lyric(t, line) -> {y, x, align, hide, box, color, hi}.
import { P } from './core/pal.js';
import { text, measure } from './core/font.js';

export class Lyrics {
  constructor(ctx) {
    this.lines = (ctx.lyrics && ctx.lyrics.lines) || [];
    this.W = ctx.W;
    this.H = ctx.H;
  }
  current(t) {
    let cur = null;
    for (const l of this.lines) if (t >= l.t0 - 0.05 && t < l.t1 + 0.6) cur = l;
    return cur;
  }
  draw(g, t, scene) {
    const l = this.current(t);
    if (!l) return;
    const st = (scene && scene.lyric && scene.lyric(t, l)) || {};
    if (st.hide) return;
    // build display units: characters plus the spaces between phrases
    const units = [];
    for (const c of l.chars) {
      if (c.c.length > 1) {
        // Latin word: one unit per letter, timed together
        [...c.c].forEach((ch) => units.push({ ch, t: c.t, d: c.d }));
      } else units.push({ ch: c.c, t: c.t, d: c.d });
      if (c.brk) units.push({ ch: ' ', t: c.t, d: 0 });
    }
    const str = units.map((u) => u.ch).join('');
    const y = st.y ?? this.H - 27;
    const align = st.align || 'center';
    const x = st.x ?? this.W / 2;
    const clearT = l.t1 + 0.35;
    const w = measure(str);
    if (st.box) {
      const bx = Math.round(align === 'center' ? x - w / 2 : x) - 8, by = y - 5;
      box(g, bx, by, w + 16, 22);
    }
    text(g, str, x, y, {
      font: 'zh',
      outline: st.outline ?? P.ink,
      shadow: st.shadow ?? (st.box ? null : P.ink),
      align,
      each: (i, ch) => {
        const u = units[i];
        if (t < u.t - 0.03) return { hide: true };
        // clear-out sweep
        if (t > clearT && i / units.length < (t - clearT) / 0.22) return { hide: true };
        const age = t - u.t;
        const singing = age >= 0 && age < Math.max(0.12, u.d * 0.9);
        return { dy: age < 0.05 ? -2 : age < 0.1 ? -1 : 0, color: singing ? st.hi || P.yellow : st.color || P.white };
      },
    });
  }
}

// RPG dialog box: navy fill, double border with rounded corners
export function box(g, x, y, w, h, fill = P.g5, edge = P.white) {
  g.rect(x + 1, y, w - 2, h, P.ink);
  g.rect(x, y + 1, w, h - 2, P.ink);
  g.rect(x + 2, y + 1, w - 4, h - 2, edge);
  g.rect(x + 1, y + 2, w - 2, h - 4, edge);
  g.rect(x + 2, y + 2, w - 4, h - 4, fill);
}
