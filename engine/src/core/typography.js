import * as THREE from 'three';
import { clamp, smoothstep, ease } from './math.js';
import { BEAT } from './music.js';

// Bilingual cinematic title cards, drawn on a 2D canvas per frame and composited after tonemapping.
// Typefaces: Cinzel (Roman capitals, for titles/acts/credits), Cormorant Garamond italic (Shakespeare),
// Noto Serif SC (Chinese), Courier Prime (the author's typewriter, for the cursor sequences).

export const STYLES = {
  title:  { family: 'Cinzel', weight: 500, italic: false, tracking: 0.34, color: '#F6EEDF', glow: 'rgba(255,196,120,0.55)', glowBlur: 26, upper: true },
  act:    { family: 'Cinzel', weight: 500, italic: false, tracking: 0.52, color: '#EFE5D4', glow: 'rgba(255,200,140,0.35)', glowBlur: 14, upper: true },
  actsub: { family: 'Cinzel', weight: 400, italic: false, tracking: 0.6, color: '#D9CBB5', glow: null, upper: true },
  quote:  { family: 'Cormorant Garamond', weight: 500, italic: true, tracking: 0.01, color: '#F4ECDF', glow: 'rgba(0,0,0,0.65)', glowBlur: 18 },
  cn:     { family: 'Noto Serif SC', weight: 500, italic: false, tracking: 0.14, color: '#EDE3D3', glow: 'rgba(0,0,0,0.7)', glowBlur: 16 },
  cnTitle:{ family: 'Noto Serif SC', weight: 600, italic: false, tracking: 0.42, color: '#F6EEDF', glow: 'rgba(255,196,120,0.45)', glowBlur: 22 },
  mono:   { family: 'Courier Prime', weight: 400, italic: false, tracking: 0.02, color: '#EDE6DA', glow: 'rgba(255,220,170,0.25)', glowBlur: 10 },
  credit: { family: 'Cinzel', weight: 400, italic: false, tracking: 0.28, color: '#E9DFCF', glow: null, upper: true },
  creditName: { family: 'Cinzel', weight: 600, italic: false, tracking: 0.22, color: '#FFF4E2', glow: 'rgba(255,190,110,0.4)', glowBlur: 16, upper: true },
  small:  { family: 'Cormorant Garamond', weight: 500, italic: true, tracking: 0.04, color: '#E3D8C6', glow: null },
};

const fontOf = (st, size) => `${st.italic ? 'italic ' : ''}${st.weight} ${size}px "${st.family}"`;

export class Typography {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.premultiplyAlpha = true;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.flipY = true;
    this.cards = [];
  }

  add(card) { this.cards.push(card); return card; }

  /** preload every glyph used by every card (fontsource splits CJK into unicode-range subsets) */
  async preload(extra = []) {
    const jobs = [];
    const want = (style, text, size = 40) => jobs.push(document.fonts.load(fontOf(STYLES[style], size), text));
    for (const c of this.cards) for (const l of c.lines) want(l.style, l.text);
    for (const [style, text] of extra) want(style, text);
    for (const s of Object.keys(STYLES)) want(s, 'ABCabc');
    await Promise.all(jobs);
    await document.fonts.ready;
  }

  /** draw all cards active at film time t; returns texture or null when nothing is visible */
  render(t, letterboxFrac) {
    const active = this.cards.filter((c) => t >= c.t0 && t < c.t1);
    if (!active.length) return null;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const top = this.H * letterboxFrac, ph = this.H * (1 - 2 * letterboxFrac);
    for (const c of active) this.drawCard(c, t, top, ph);
    this.tex.needsUpdate = true;
    return this.tex;
  }

  drawCard(c, t, top, ph) {
    const ctx = this.ctx;
    const fi = c.fadeIn ?? 0.9, fo = c.fadeOut ?? 0.9;
    const cardA = clamp((t - c.t0) / fi) * clamp((c.t1 - t) / fo);
    const [ax, ay] = c.anchor || [0.5, 0.5];
    let y = top + ph * ay;
    // total block height for vertical centring
    const heights = c.lines.map((l) => l.size * (l.lh ?? 1.25) + (l.gap ?? 0));
    const blockH = heights.reduce((a, b) => a + b, 0);
    y -= blockH * (c.valign ?? 0.5);
    for (let i = 0; i < c.lines.length; i++) {
      const l = c.lines[i];
      const st = STYLES[l.style];
      y += (l.gap ?? 0);
      const lineT0 = c.t0 + (l.delay ?? 0);
      let a = cardA * clamp((t - lineT0) / (l.fadeIn ?? fi));
      if (l.until !== undefined) a *= clamp((c.t0 + l.until - t) / (l.fadeOut ?? 0.6));
      const baseY = y + l.size;
      y += l.size * (l.lh ?? 1.25);
      if (a <= 0.001 && !l.type) continue;
      let text = st.upper ? l.text.toUpperCase() : l.text;
      // typing: reveal characters progressively; cursor blinks on the beat
      let cursorX = null;
      ctx.font = fontOf(st, l.size);
      ctx.letterSpacing = `${(st.tracking + (l.trackingAnim ? (1 - ease.outCubic(clamp((t - lineT0) / 3))) * l.trackingAnim : 0)) * l.size}px`;
      const fullW = ctx.measureText(text).width;
      const align = l.align ?? c.align ?? 'center';
      const x0 = align === 'center' ? this.W * ax - fullW / 2 : align === 'left' ? this.W * ax : this.W * ax - fullW;
      if (l.type) {
        const n = Math.floor(clamp((t - lineT0) / (l.type.dur ?? text.length / (l.type.cps ?? 20))) * text.length + 1e-6);
        const shown = text.slice(0, n);
        cursorX = x0 + ctx.measureText(shown).width;
        text = shown;
        a = cardA * (l.until !== undefined ? clamp((c.t0 + l.until - t) / (l.fadeOut ?? 0.6)) : 1);
      }
      const rise = (c.rise ?? 10) * (1 - ease.outCubic(clamp((t - lineT0) / ((l.fadeIn ?? fi) * 1.6))));
      const blur = c.blurIn ? (1 - ease.outCubic(clamp((t - lineT0) / ((l.fadeIn ?? fi) * 1.3)))) * 10 : 0;
      ctx.save();
      ctx.globalAlpha = a * (l.alpha ?? 1);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;
      if (st.glow && (l.glow ?? true)) {
        ctx.shadowColor = st.glow; ctx.shadowBlur = st.glowBlur;
        ctx.fillStyle = l.color || st.color;
        ctx.fillText(text, x0, baseY + rise);
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      }
      ctx.fillStyle = l.color || st.color;
      ctx.fillText(text, x0, baseY + rise);
      if (l.strike && t > lineT0 + l.strike.at) this.strike(l, text, x0, baseY + rise, t - lineT0 - l.strike.at);
      ctx.restore();
      if (l.type && l.type.cursor !== false) {
        const typing = t < lineT0 + (l.type.dur ?? text.length / (l.type.cps ?? 20));
        const ph = ((t - (l.type.blinkPhase ?? 0)) / BEAT) % 2;
        const on = typing || ph < 1.0;
        const hideAfter = l.type.hideCursorAt !== undefined && t > c.t0 + l.type.hideCursorAt;
        if (on && !hideAfter && t >= lineT0 - (l.type.lead ?? 0)) this.cursor(cursorX + 4, baseY, l.size, cardA);
      }
    }
  }

  cursor(x, baseline, size, a) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(255,200,120,0.9)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#FFE7C2';
    ctx.fillRect(x, baseline - size * 0.82, Math.max(2, size * 0.075), size * 1.0);
    ctx.restore();
  }

  strike(l, text, x0, y, dt) {
    const ctx = this.ctx;
    const w = ctx.measureText(text).width;
    const p = ease.outCubic(clamp(dt / 0.35));
    ctx.shadowColor = 'rgba(255,190,90,1)'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFD9A0';
    ctx.fillRect(x0, y - l.size * 0.32, w * p, Math.max(2, l.size * 0.06));
  }
}

/** helper: a standard bilingual card (English line(s) + Chinese line) */
export function bilingual(t0, t1, en, cn, opts = {}) {
  const enLines = Array.isArray(en) ? en : [en];
  const lines = enLines.map((text, i) => ({ text, style: opts.enStyle || 'quote', size: opts.enSize || 46, delay: (opts.stagger ?? 0.45) * i, lh: 1.22 }));
  const cnLines = Array.isArray(cn) ? cn : [cn];
  cnLines.forEach((text, i) => lines.push({ text, style: opts.cnStyle || 'cn', size: opts.cnSize || 30, gap: i === 0 ? (opts.cnGap ?? 16) : 0,
    delay: (opts.stagger ?? 0.45) * enLines.length + 0.25 + 0.3 * i, alpha: 0.92, lh: 1.45 }));
  return { t0, t1, lines, anchor: opts.anchor || [0.5, 0.8], fadeIn: opts.fadeIn ?? 1.1, fadeOut: opts.fadeOut ?? 1.0, blurIn: opts.blurIn ?? true, rise: opts.rise ?? 8, valign: opts.valign ?? 1 };
}
