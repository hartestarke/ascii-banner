// interference: two ring gratings whose centres orbit the middle in mirror
// image; their product beats into moiré bands that open as the centres part
// and close as they meet.
import { TAU, space } from "./util.mjs";

export default {
  defaults: {
    spacing: 0.08, // ring spacing, banner widths
    orbit: 0.15, // orbit radius, banner widths
    cycles: 1, // orbits per loop
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  validate(o, v) {
    v.positive("spacing");
    v.nonNeg("orbit");
    v.int("cycles", null, "orbits per loop");
  },
  make(g, o) {
    const sp = space(g);
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      const a = TAU * o.cycles * t;
      // a flat ellipse for a wide, short banner; mirrored across the vertical
      // axis, so the gap swings 0 → 2·orbit → 0
      const dx = o.orbit * Math.cos(a), dy = o.orbit * 0.35 * Math.sin(a);
      const r1 = Math.hypot(x - (sp.cx + dx), y - (sp.cy + dy));
      const r2 = Math.hypot(x - (sp.cx - dx), y - (sp.cy + dy));
      // positive lobes only, narrowed: fewer lit cells, a lighter file
      return Math.max(0, Math.cos((TAU * r1) / o.spacing) * Math.cos((TAU * r2) / o.spacing)) ** 1.4;
    };
  },
};
