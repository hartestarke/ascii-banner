// ripples: rings expanding from a few points, fading with distance and
// interfering where they meet.
import { TAU, rnd, space } from "./util.mjs";

export default {
  defaults: {
    centers: 3,
    wavelength: 0.12, // banner widths
    decay: 1.5, // amplitude falls as exp(-decay × distance in banner widths)
    rings: 3, // per loop, from the first centre
    seed: 1,
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  validate(o, v) {
    v.posInt("centers");
    v.positive("wavelength");
    v.nonNeg("decay");
    v.int("rings", null, "rings per loop");
    v.int("seed");
  },
  make(g, o) {
    const sp = space(g);
    // centres keep 12% of each side clear; k differs per centre so the ring
    // sets never lock together
    const centres = Array.from({ length: o.centers }, (_, i) => ({
      x: 0.12 + 0.76 * rnd(o.seed, i, 1),
      y: (0.12 + 0.76 * rnd(o.seed, i, 2)) * 2 * sp.cy,
      k: o.rings + i,
    }));
    const drive = 0.55 * o.centers; // lower = more saturated crests
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      let s = 0;
      for (const c of centres) {
        const r = Math.hypot(x - c.x, y - c.y);
        s += Math.exp(-o.decay * r) * Math.cos(TAU * (r / o.wavelength - c.k * t));
      }
      // crests only, narrowed: troughs stay blank, a lighter file
      return Math.max(0, s / drive) ** 1.5;
    };
  },
};
