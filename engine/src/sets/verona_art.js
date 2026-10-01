import { Art } from '../fx/art.js';

// Verona, drawn as paper-cut silhouettes. Real landmarks, simplified: Torre dei Lamberti, the Duomo
// campanile, Sant'Anastasia's spire, Castelvecchio's swallowtail battlements, Ponte Pietra's arches,
// the Torricelle hills with Castel San Pietro, cypresses of Giardino Giusti.

export function hillsArt(seed = 11) {
  const a = new Art(1400, 210, 2.9, { seed, rimPx: 2 });
  const pts = [];
  for (let x = 0; x <= 1400; x += 20) {
    const y = 70 + 45 * Math.sin(x / 210 + 1.2) + 28 * Math.sin(x / 83 + 0.3) + 10 * Math.sin(x / 31);
    pts.push([x, Math.max(25, y)]);
  }
  a.hills(pts);
  // Castel San Pietro on the crest + cypress rows
  const cx = 610, cy = 70 + 45 * Math.sin(cx / 210 + 1.2) + 28 * Math.sin(cx / 83 + 0.3) + 10 * Math.sin(cx / 31) - 3;
  a.rect(cx - 30, cy, 60, 14); a.merlonsSwallow(cx - 30, cx + 30, cy + 14, 1.6, 2.2, 1.2);
  a.rect(cx + 18, cy, 9, 26); a.merlonsSwallow(cx + 17.5, cx + 27.5, cy + 26, 1.4, 2, 1);
  a.windowGrid(cx - 26, cy + 4, 10, 1, 1.6, 3, 3.4, 0, { arch: true, skip: 0.3 });
  for (let i = 0; i < 70; i++) {
    const x = (i * 97.3) % 1400; const y = 70 + 45 * Math.sin(x / 210 + 1.2) + 28 * Math.sin(x / 83 + 0.3) + 10 * Math.sin(x / 31);
    a.cypress(x, 9 + a.r() * 9, null, Math.max(25, y) - 2);
  }
  return a.pack();
}

export function skylineArt(seed = 21) {
  const a = new Art(800, 140, 5.1, { seed, rimPx: 2.5 });
  // background rooftops band
  for (let x = 0; x < 800;) { const w = 8 + a.r() * 16; a.house(x, w, 10 + a.r() * 12, { roof: a.r() < 0.6 ? 'gable' : 'hip', floors: 3, lit: 0.6 }); x += w + a.r() * 1.5; }
  // landmarks
  a.lamberti(398, 10, 74);
  a.church(250, 26, 22, { cw: 7, ch: 58 });                 // Sant'Anastasia (spire)
  a.domeChurch(520, 34, 18, 11);                             // domed church
  a.tower(470, 7, 46, { top: 'swallow', belfry: true });    // Torre del Gardello
  a.tower(160, 8, 40, { top: 'pyramid', belfry: true });     // Duomo campanile (simplified)
  a.tower(660, 6, 34, { top: 'swallow' });
  a.tower(90, 6, 30, { top: 'spire', belfry: true });
  a.domeChurch(720, 22, 14, 7);
  // Castelvecchio walls on the left
  a.rect(0, 0, 70, 16); a.merlonsSwallow(0, 70, 16, 1.2, 1.7, 0.9);
  a.tower(28, 10, 30, { top: 'swallow', windows: false });
  for (let i = 0; i < 26; i++) a.cypress(300 + i * 13.5 + a.r() * 6, 12 + a.r() * 10);
  return a.pack();
}

export function cityMidArt(seed = 31, { palace = true } = {}) {
  const a = new Art(420, 60, 9.7, { seed, rimPx: 3 });
  for (let x = 0; x < 420;) {
    const w = 7 + a.r() * 12; const h = 9 + a.r() * 13;
    a.house(x, w, h, { roof: a.r() < 0.7 ? 'gable' : 'flat', floors: Math.round(h / 3.3), lit: 1, loggia: a.r() < 0.2 });
    x += w + (a.r() < 0.3 ? a.r() * 2 : 0);
  }
  if (palace) { // Palazzo Capulet: grand, warm, many windows (the ball is here)
    const px = 250, pw = 54, ph = 24;
    a.rect(px, 0, pw, ph); a.merlonsSwallow(px, px + pw, ph, 1.0, 1.4, 0.7);
    a.tower(px + pw - 8, 8, 40, { top: 'swallow', belfry: true });
    for (let f = 0; f < 4; f++) for (let i = 0; i < 12; i++) a.window(px + 2.4 + i * 4.2, 2.5 + f * 5.4, 1.5, 3.3, { arch: true, id: 0.9 + 0.1 * a.r() });
    a.rect(px + pw / 2 - 8, ph * 0.52, 16, 0.5); // balcony slab
  }
  a.tower(70, 6, 30, { top: 'swallow', belfry: true });
  a.tower(150, 5, 26, { top: 'pyramid' });
  a.tower(370, 6, 33, { top: 'cupola' });
  for (let i = 0; i < 9; i++) a.cypress(15 + i * 44 + a.r() * 20, 10 + a.r() * 8);
  return a.pack();
}

export function cityNearArt(seed = 41) {
  const a = new Art(240, 32, 17, { seed, rimPx: 3.5 });
  for (let x = 0; x < 240;) {
    const w = 6 + a.r() * 9; const h = 8 + a.r() * 9;
    a.house(x, w, h, { roof: a.r() < 0.75 ? 'gable' : 'hip', floors: Math.max(2, Math.round(h / 3.2)), lit: 1.1, loggia: a.r() < 0.35 });
    x += w + a.r() * 0.6;
  }
  for (let i = 0; i < 5; i++) a.cypress(20 + i * 50 + a.r() * 20, 11 + a.r() * 5);
  a.pine(130, 13, 12);
  return a.pack();
}

export function bridgeArt(seed = 51) { // Ponte Pietra
  const a = new Art(130, 18, 34, { seed, rimPx: 4 });
  a.bridgeArches(5, 125, 10.5, 5, { thick: 1.6, pierW: 3.4, parapet: 1.2 });
  a.tower(1, 7, 17, { top: 'swallow', windows: false });
  a.archHole(2.6, 0, 3.8, 6.5);
  for (const x of [30, 55, 80, 105]) a.lamp(x, 12.5);
  return a.pack();
}

export function nearBankArt(seed = 61) {
  const a = new Art(34, 12, 120, { seed, rimPx: 5 });
  a.rect(0, 0, 13, 1.2); a.merlons(0, 13, 1.2, 0.35, 0.25, 0.3);
  a.lamp(9.2, 3.2);
  a.cypress(2.4, 10.5, 1.9);
  a.cypress(4.6, 8.0, 1.5);
  a.rect(25, 0, 9, 1.0);
  a.cypress(31.5, 11.5, 2.0);
  return a.pack();
}
