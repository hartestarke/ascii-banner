// contour: survey lines over slowly drifting terrain, every `index`-th line
// drawn bright like an index contour on a map.
import { TAU, isInt, need, space } from "./util.mjs";

// Terrain: three sines, fx/fy in cycles per banner width, k in cycles per loop
// (integers, distinct, so the relief morphs rather than slides).
const TERRAIN = [
  { fx: 0.9, fy: 1.6, k: 1 },
  { fx: -0.6, fy: 2.3, k: -1 },
  { fx: 1.4, fy: -0.8, k: 0 },
];
// Brightness of an ordinary line vs an index line (1).
const MINOR = 0.7;
// Minimum line half-width in cells, so lines stay unbroken on steep ground.
const MIN_HALF_WIDTH_CELLS = 0.6;

export default {
  defaults: {
    step: 0.12, // contour interval, fraction of the terrain's full height range
    thickness: 0.25, // line width, fraction of the interval
    index: 5, // every index-th line is bright; 0 = none
  },
  // dotted glyphs: contours run in every direction, and horizontal strokes on a
  // steep line read as scattered dashes
  ramp: ". : + #",
  bands: 2,
  check(o, path) {
    need(o.step > 0 && o.step <= 1, `${path}.step`, `must be within (0, 1], got ${o.step}`);
    need(o.thickness > 0 && o.thickness <= 1, `${path}.thickness`, `must be within (0, 1], got ${o.thickness}`);
    need(isInt(o.index) && o.index >= 0, `${path}.index`, `must be an integer >= 0, got ${o.index}`);
  },
  make(g, o) {
    const sp = space(g);
    const half = o.thickness / 2;
    const cw = g.PX / g.W, ch = g.PY / g.W; // one cell, in banner widths
    // terrain in contour intervals
    const level = (x, y, t) => {
      let h = 0;
      for (const { fx, fy, k } of TERRAIN) h += Math.sin(TAU * (fx * x + fy * y + k * t));
      return (h / TERRAIN.length + 1) / 2 / o.step;
    };
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      const s = level(x, y, t);
      const n = Math.round(s);
      const d = Math.abs(s - n); // distance to the nearest line, in intervals
      // On steep ground a line would skip cells: widen it to at least half a
      // cell either side (the terrain's change per cell, from neighbours).
      const slope = Math.max(
        Math.abs(level(x + cw, y, t) - level(x - cw, y, t)),
        Math.abs(level(x, y + ch, t) - level(x, y - ch, t)),
      ) / 2;
      const w = Math.max(half, slope * MIN_HALF_WIDTH_CELLS);
      if (d >= w) return 0;
      const major = o.index > 0 && n % o.index === 0;
      return (1 - d / w) * (major ? 1 : MINOR);
    };
  },
};
