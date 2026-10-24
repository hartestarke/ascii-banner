// interference: two ring gratings whose centres orbit the middle in
// opposition; their product beats into moiré bands that open as the centres
// part and close as they meet. Only the positive lobes of the product light up.
import { TAU, space } from "./util.mjs";

// Vertical extent of the orbit relative to its horizontal radius: the banner
// is wide and short, so the centres sweep a flat ellipse.
const ORBIT_ASPECT = 0.35;
// > 1 narrows each lobe (fewer lit cells, a lighter file).
const LOBE = 1.4;

export default {
  defaults: {
    spacing: 0.08, // ring spacing, fraction of the banner width
    orbit: 0.15, // orbit radius of each centre, fraction of the banner width
    cycles: 1, // orbits per loop (integer)
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
      const a = TAU * o.cycles * (f / g.NF);
      // mirrored across the vertical axis: the gap swings 0 → 2·orbit → 0
      const dx = o.orbit * Math.cos(a), dy = o.orbit * ORBIT_ASPECT * Math.sin(a);
      const x = sp.x(col), y = sp.y(row);
      const r1 = Math.hypot(x - (sp.cx + dx), y - (sp.cy + dy));
      const r2 = Math.hypot(x - (sp.cx - dx), y - (sp.cy + dy));
      // only where the gratings agree: the other half stays blank (and cheap)
      return Math.max(0, Math.cos((TAU * r1) / o.spacing) * Math.cos((TAU * r2) / o.spacing)) ** LOBE;
    };
  },
};
