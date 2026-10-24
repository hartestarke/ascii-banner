// caustics: classic plasma, four sines along x, y, the diagonal and an
// off-centre radius, shown only as the bright network where their sum crosses
// zero, like light on a pool floor.
import { TAU, space } from "./util.mjs";
import { GLYPH_SETS } from "../glyphsets.mjs";

export default {
  defaults: {
    scale: 1,
    speed: 1, // integer, multiplies every term's cycles per loop
  },
  ramp: GLYPH_SETS.classic,
  bands: 3,
  validate(o, v) {
    v.positive("scale");
    v.int("speed", null, "cycles per loop");
  },
  make(g, o) {
    const sp = space(g);
    const ox = sp.cx + 0.17, oy = sp.cy + 0.04;
    return (col, row, f) => {
      const x = sp.x(col) - sp.cx, y = sp.y(row) - sp.cy, t = (f / g.NF) * o.speed;
      const r = Math.hypot(x + sp.cx - ox, y + sp.cy - oy);
      // each term: cycles per banner width, then cycles per loop; distinct
      // speeds keep the network reshaping instead of sliding rigidly
      const s =
        Math.sin(TAU * (2.1 * o.scale * x + t)) +
        Math.sin(TAU * (3.4 * o.scale * y - t)) +
        Math.sin(TAU * (1.5 * o.scale * (x + y) + 2 * t)) +
        Math.sin(TAU * (2.6 * o.scale * r - 2 * t));
      // |s| < 0.4 lights up: the width of the network's lines
      return Math.pow(Math.max(0, 1 - Math.abs(s) / 0.4), 1.6);
    };
  },
};
