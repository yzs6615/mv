// Host environment: the browser player and the Node (Skia) renderer share all film code.
export const env = {
  createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
};
