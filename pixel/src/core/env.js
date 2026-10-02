// Canvas factory (the film runs in Chromium; every 2D context is created for CPU readback).
export const env = {
  createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
};
export const ctx2d = (c) => {
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  return x;
};
