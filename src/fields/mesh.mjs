// mesh: soft lights travelling closed Lissajous paths; their glows add up
// to a slowly drifting gradient, like a design-tool mesh gradient.
import { TAU, rnd, space } from "./util.mjs";

// Path amplitude, fraction of the banner's half-width / half-height.
const SWEEP = { x: 0.85, y: 0.9 };
// Max integer frequency of a light's path on each axis.
const MAX_FREQ = { x: 2, y: 3 };
// Summed glow g maps to brightness 1 - exp(-GAIN · g): soft saturation where lights overlap.
const GAIN = 0.9;

export default {
  defaults: {
    lights: 4, // number of lights
    radius: 0.22, // glow radius (1/e), fraction of the banner width
    seed: 1,
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  validate(o, v) {
    v.posInt("lights");
    v.positive("radius");
    v.int("seed");
  },
  make(g, o) {
    const sp = space(g);
    const lights = Array.from({ length: o.lights }, (_, i) => {
      const r = (slot) => rnd(o.seed, i, slot);
      return {
        p: 1 + Math.floor(r(1) * MAX_FREQ.x), q: 1 + Math.floor(r(2) * MAX_FREQ.y),
        ph: r(3), ps: r(4), w: 0.6 + 0.4 * r(5),
      };
    });
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      let sum = 0;
      for (const l of lights) {
        const lx = sp.cx * (1 + SWEEP.x * Math.sin(TAU * (l.p * t + l.ph)));
        const ly = sp.cy * (1 + SWEEP.y * Math.sin(TAU * (l.q * t + l.ps)));
        sum += l.w * Math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / o.radius ** 2);
      }
      return 1 - Math.exp(-GAIN * sum);
    };
  },
};
