// waves, the default field: a few travelling plane waves interfering into one
// or two giant soft lobes.
import { TAU } from "./util.mjs";
import { GLYPH_SETS } from "../glyphsets.mjs";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export default {
  defaults: {
    // fx, fy: cycles per banner width on both axes; per-axis normalisation
    // squashes the lobes flat on a 4:1 banner. k: integer cycles per loop, and
    // distinct, or the waves sharing a k lock into one shape that only slides.
    waves: [
      { fx: 0.75, fy: 0.55, k: 1 },
      { fx: -0.35, fy: 0.95, k: -1 },
      { fx: 0.95, fy: -0.4, k: 0 },
    ],
    // Divisor of the wave sum. Three sines rarely reach ±3, so dividing by less
    // and letting the clamp cut the rest gives saturated highlights and troughs.
    drive: 2.4,
  },
  ramp: GLYPH_SETS.classic,
  bands: 3,
  validate(o, v) {
    v.check(o.waves.length > 0 || v.field.sample, "waves", "needs at least one wave (or a field.sample function)");
    o.waves.forEach((w, i) => {
      const p = `waves[${i}]`;
      v.check(isObj(w), p, `expected { fx, fy, k }, got ${w === null ? "null" : Array.isArray(w) ? "array" : typeof w}`);
      for (const k of Object.keys(w)) v.check(["fx", "fy", "k"].includes(k), `${p}.${k}`, "unknown config key");
      v.check(Number.isFinite(w.fx) && Number.isFinite(w.fy), p, "fx and fy must be finite numbers");
      v.check(Number.isInteger(w.k), `${p}.k`, `must be an integer (cycles per loop) or the loop seam jumps, got ${w.k}`);
    });
    v.positive("drive");
  },
  make(g, o) {
    return (col, row, f) => {
      // y from the field's top edge, without space()'s y0 offset: switching to
      // space() shifts every waves banner
      const x = ((col + 0.5) * g.PX) / g.W, y = ((row + 0.5) * g.PY) / g.W, t = f / g.NF;
      let v = 0;
      for (const { fx, fy, k } of o.waves) v += Math.sin(TAU * (fx * x + fy * y + k * t));
      return (v / o.drive + 1) / 2;
    };
  },
};
