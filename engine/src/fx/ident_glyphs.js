// OPUS 5.5 — hand-placed star skeletons, drawn like a celestial atlas plate (not a font outline).
// Units: cap height = 1, baseline y = 0, x grows to the right inside each glyph box of width `w`.
// Each star is [x, y, magnitude]; smaller magnitude = brighter (0 ≈ Vega, 3 ≈ a faint naked-eye star).
// `strokes` lists star indices joined by fine lines; every stroke is drawn on one eighth note of the motif
// (2 strokes per letter, 1 for the decimal point => 13 connections). A one-star stroke simply ignites.
// The irregular spacing and the spread of magnitudes are deliberate: real asterisms are never even.

export const GLYPHS = {
  O: {
    w: 0.84,
    stars: [
      [0.45, 1.00, 1.5],   // 0 crown
      [0.08, 0.78, 2.6],   // 1
      [0.00, 0.30, 2.1],   // 2
      [0.36, -0.02, 1.3],  // 3 keel (bright)
      [0.80, 0.20, 2.8],   // 4
      [0.84, 0.66, 2.3],   // 5
    ],
    strokes: [[0, 1, 2, 3], [3, 4, 5, 0]],
  },
  P: {
    w: 0.62,
    stars: [
      [0.02, 1.00, 1.8],   // 0 stem head
      [0.00, 0.45, 2.9],   // 1 waist
      [0.05, -0.02, 2.2],  // 2 foot
      [0.40, 0.98, 2.7],   // 3
      [0.62, 0.75, 2.0],   // 4 bowl
      [0.37, 0.47, 3.2],   // 5
    ],
    strokes: [[0, 1, 2], [0, 3, 4, 5, 1]],
  },
  U: {
    w: 0.66,
    stars: [
      [0.00, 1.00, 2.0],
      [0.02, 0.36, 2.7],
      [0.15, 0.01, 2.5],
      [0.45, -0.02, 1.4],  // the cup
      [0.64, 0.31, 3.0],
      [0.66, 1.00, 2.2],
    ],
    strokes: [[0, 1, 2, 3], [3, 4, 5]],
  },
  S: {
    w: 0.62,
    stars: [
      [0.60, 0.88, 3.0],
      [0.33, 1.00, 1.9],
      [0.05, 0.86, 2.8],
      [0.03, 0.63, 2.4],
      [0.31, 0.50, 2.1],   // the turn
      [0.60, 0.37, 2.9],
      [0.61, 0.12, 2.5],
      [0.31, -0.02, 1.7],
      [0.01, 0.11, 3.1],
    ],
    strokes: [[0, 1, 2, 3, 4], [4, 5, 6, 7, 8]],
  },
  5: {
    w: 0.62,
    stars: [
      [0.60, 1.00, 2.7],
      [0.05, 1.00, 1.9],
      [0.01, 0.55, 2.4],
      [0.35, 0.65, 3.1],
      [0.62, 0.33, 1.8],
      [0.30, -0.02, 2.3],
      [0.00, 0.11, 3.0],
    ],
    strokes: [[0, 1, 2], [2, 3, 4, 5, 6]],
  },
  '.': {
    w: 0.1,
    stars: [[0.05, 0.0, 0.45]],  // the brightest star of the figure
    strokes: [[0]],
  },
  '5b': { // the second five: same letter, different stars
    w: 0.62,
    stars: [
      [0.58, 1.00, 2.9],
      [0.03, 1.01, 2.1],
      [0.00, 0.57, 2.2],
      [0.33, 0.67, 3.2],
      [0.62, 0.35, 1.7],
      [0.32, 0.00, 2.5],
      [0.02, 0.13, 2.8],
    ],
    strokes: [[0, 1, 2], [2, 3, 4, 5, 6]],
  },
};

// left-to-right setting with optical spacing (gap BEFORE each glyph)
export const OPUS_SETTING = [['O', 0], ['P', 0.36], ['U', 0.36], ['S', 0.36], ['5', 0.98], ['.', 0.2], ['5b', 0.22]];
