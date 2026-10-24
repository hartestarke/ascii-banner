// vortex: a polar spiral, sin(angle·arms + ln(r)·twist − 2π·cycles·t),
// turning about the banner centre.
import { TAU, space } from "./util.mjs";

export default {
  defaults: {
    arms: 3, // integer, or the arms tear along one angle
    twist: 5, // radians of phase per e-fold of radius; 0 = straight spokes
    cycles: 1, // turns per loop
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
      const x = sp.x(col) - sp.cx, y = sp.y(row) - sp.cy, t = f / g.NF;
      const r = Math.hypot(x, y);
      // within 0.06 banner widths of the centre the arms wind tighter than the
      // grid can draw: fade to dark there instead of aliasing into noise
      const core = Math.min(1, r / 0.06);
      const a = Math.atan2(y, x);
      const s = Math.sin(a * o.arms + Math.log(Math.max(r, 1e-6)) * o.twist - TAU * o.cycles * t);
      // arms only, narrowed so the gaps stay blank; the swirl fades out
      // towards the banner ends
      return Math.max(0, s) ** 2 * core * core * Math.exp(-((r / 0.3) ** 2));
    };
  },
};
