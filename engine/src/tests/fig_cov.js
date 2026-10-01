import { LightFigure } from '../fx/figure.js';
export async function buildFilm(e) {
  const t0 = performance.now();
  for (const o of [{ who: 'romeo' }, { who: 'juliet' }, { who: 'romeo', part: 'armR' }, { who: 'juliet', part: 'armL' }]) {
    const a = performance.now();
    const f = new LightFigure(e, o);
    console.log(JSON.stringify(o), 'coverage', f.geo.coverage.toFixed(3), 'areaVis', f.geo.areaVis.toFixed(3), 'counts', JSON.stringify(f.geo.counts), 'build ms', (performance.now() - a).toFixed(0));
  }
  e.director.add({ id: 'x', start: 0, end: 1, render(ctx, target) { const r = ctx.e.renderer; r.setRenderTarget(target); r.clear(); } });
  return { duration: 1 };
}
