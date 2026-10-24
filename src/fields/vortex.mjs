// vortex: a polar spiral, sin(angle·arms + ln(r)·twist − 2π·cycles·t),
// turning about the banner centre.
import { TAU, space } from "./util.mjs";

// Radius (banner widths) inside which the arms wind too tightly for the grid;
// the field fades to dark there instead of aliasing into noise.
const CORE = 0.06;
// > 1 narrows each arm (fewer lit cells, a lighter file).
const ARM_POWER = 2;
// Radius (banner widths) of the swirl's Gaussian fade.
const FADE = 0.3;

export default {
  defaults: {
    arms: 3, // spiral arms (integer, or the arms tear along one angle)
    twist: 5, // winding: radians of phase per e-fold of radius; 0 = straight spokes
    cycles: 1, // turns of the pattern per loop (integer)
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  validate(o, v) {
    v.posInt("arms");
    v.check(Number.isFinite(o.twist), "twist", `must be a finite number, got ${o.twist}`);
    v.int("cycles", null, "turns per loop");
  },
  make(g, o) {
    const sp = space(g);
    return (col, row, f) => {
      const x = sp.x(col) - sp.cx, y = sp.y(row) - sp.cy;
      const r = Math.hypot(x, y);
      const core = Math.min(1, r / CORE);
      const a = Math.atan2(y, x);
      const s = Math.sin(a * o.arms + Math.log(Math.max(r, 1e-6)) * o.twist - TAU * o.cycles * (f / g.NF));
      // arms only, narrowed: the gaps between them stay blank; the whole
      // swirl fades out towards the banner ends
      return Math.max(0, s) ** ARM_POWER * core * core * Math.exp(-((r / FADE) ** 2));
    };
  },
};
