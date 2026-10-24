// halo: a breathing corona around the centre. Inside the ring the field stays
// dim, so taglines sit in a quiet pocket; outside it glows off softly.
import { TAU, rnd, space } from "./util.mjs";

export default {
  defaults: {
    radius: 0.42, // banner widths
    breath: 0.12, // radius swing, fraction of the radius
    cycles: 2, // breaths per loop
    softness: 0.35, // outward falloff, banner widths
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  validate(o, v) {
    v.positive("radius");
    v.check(o.breath >= 0 && o.breath < 1, "breath", `must be within [0, 1), got ${o.breath}`);
    v.int("cycles", null, "breaths per loop");
    v.positive("softness");
  },
  make(g, o) {
    const sp = space(g);
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      const R = o.radius * (1 + o.breath * Math.sin(TAU * o.cycles * t));
      const r = Math.hypot(x - sp.cx, y - sp.cy);
      const v = r < R ? Math.pow(r / R, 4) : Math.exp(-(((r - R) / o.softness) ** 2));
      // per-cell grain, fixed over the loop: a texture, not flicker
      return v * (1 + 0.25 * (rnd(0x4a10, col, row) - 0.5));
    };
  },
};
