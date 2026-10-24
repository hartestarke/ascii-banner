// contour: survey lines over slowly morphing terrain, every `index`-th line
// bright like an index contour on a map.
import { TAU, space } from "./util.mjs";

// fx, fy in cycles per banner width; k in cycles per loop, integer and
// distinct so the relief morphs rather than slides.
const TERRAIN = [
  { fx: 0.9, fy: 1.6, k: 1 },
  { fx: -0.6, fy: 2.3, k: -1 },
  { fx: 1.4, fy: -0.8, k: 0 },
];

export default {
  defaults: {
    step: 0.12, // contour interval, fraction of the terrain's height range
    thickness: 0.25, // fraction of the interval
    index: 5, // 0 = no index lines
  },
  // dotted glyphs: contours run in every direction, and horizontal strokes on
  // a steep line read as scattered dashes
  ramp: ". : + #",
  bands: 2,
  validate(o, v) {
    v.fraction("step");
    v.fraction("thickness");
    v.int("index", 0);
  },
  make(g, o) {
    const sp = space(g);
    const half = o.thickness / 2;
    const cw = g.PX / g.W, ch = g.PY / g.W; // one cell, in banner widths
    // terrain height in contour intervals
    const level = (x, y, t) => {
      let h = 0;
      for (const { fx, fy, k } of TERRAIN) h += Math.sin(TAU * (fx * x + fy * y + k * t));
      return (h / TERRAIN.length + 1) / 2 / o.step;
    };
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      const s = level(x, y, t);
      const n = Math.round(s);
      const d = Math.abs(s - n); // to the nearest line, in intervals
      // A line narrower than the terrain's change per cell skips cells on
      // steep ground: keep its half-width at 0.6 cell or more.
      const slope = Math.max(
        Math.abs(level(x + cw, y, t) - level(x - cw, y, t)),
        Math.abs(level(x, y + ch, t) - level(x, y - ch, t)),
      ) / 2;
      const w = Math.max(half, slope * 0.6);
      if (d >= w) return 0;
      const major = o.index > 0 && n % o.index === 0;
      return (1 - d / w) * (major ? 1 : 0.7);
    };
  },
};
