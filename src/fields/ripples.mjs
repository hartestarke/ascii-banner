// ripples: rings expanding from a few points, fading with distance and
// interfering where they meet.
import { TAU, rnd, space } from "./util.mjs";

// Centres stay inside this inset of the banner (fraction of each side).
const INSET = 0.12;
// Wave-sum divisor per centre: lower = more saturated crests.
const DRIVE_PER_CENTRE = 0.55;
// > 1 narrows each crest (fewer lit cells, a lighter file).
const CREST = 1.5;

export default {
  defaults: {
    centers: 3, // ring sources, placed by seed
    wavelength: 0.12, // ring spacing, fraction of the banner width
    decay: 1.5, // amplitude falls as exp(-decay × distance in banner widths)
    rings: 3, // rings each centre emits per loop (integer; centre i adds i so they don't lock)
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
    const H = 2 * sp.cy;
    const centres = Array.from({ length: o.centers }, (_, i) => ({
      x: INSET + (1 - 2 * INSET) * rnd(o.seed, i, 1),
      y: (INSET + (1 - 2 * INSET) * rnd(o.seed, i, 2)) * H,
      k: o.rings + i,
    }));
    const drive = DRIVE_PER_CENTRE * o.centers;
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      let s = 0;
      for (const c of centres) {
        const r = Math.hypot(x - c.x, y - c.y);
        s += Math.exp(-o.decay * r) * Math.cos(TAU * (r / o.wavelength - c.k * t));
      }
      return Math.max(0, s / drive) ** CREST; // crests only; troughs stay blank
    };
  },
};
