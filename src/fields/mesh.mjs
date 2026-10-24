// mesh: soft lights travelling closed Lissajous paths; their glows add up to
// a slowly drifting gradient, like a design-tool mesh gradient.
import { TAU, rnd, space } from "./util.mjs";
import { GLYPH_SETS } from "../glyphsets.mjs";

export default {
  defaults: {
    lights: 4,
    radius: 0.22, // 1/e glow radius, banner widths
    seed: 1,
  },
  ramp: GLYPH_SETS.classic,
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
        p: 1 + Math.floor(r(1) * 2), q: 1 + Math.floor(r(2) * 3),
        ph: r(3), ps: r(4), w: 0.6 + 0.4 * r(5),
      };
    });
    return (col, row, f) => {
      const x = sp.x(col), y = sp.y(row), t = f / g.NF;
      let sum = 0;
      for (const l of lights) {
        // amplitude in half-widths and half-heights
        const lx = sp.cx * (1 + 0.85 * Math.sin(TAU * (l.p * t + l.ph)));
        const ly = sp.cy * (1 + 0.9 * Math.sin(TAU * (l.q * t + l.ps)));
        sum += l.w * Math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / o.radius ** 2);
      }
      return 1 - Math.exp(-0.9 * sum); // saturates softly where lights overlap
    };
  },
};
