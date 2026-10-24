// waves: a few travelling plane waves interfering into one or two giant soft
// lobes (the original, and default, field).
import { TAU, isInt, need } from "./util.mjs";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export default {
  defaults: {
    // fx/fy are cycles per banner WIDTH on both axes (pixel-isotropic — per-axis
    // normalisation on a 4:1 banner squashes the lobes flat); k is integer
    // cycles per loop, which keeps the seam exact. Keep every k distinct —
    // components sharing a speed freeze into a shape that merely translates;
    // k=0 is legal.
    waves: [
      { fx: 0.75, fy: 0.55, k: 1 },
      { fx: -0.35, fy: 0.95, k: -1 },
      { fx: 0.95, fy: -0.4, k: 0 },
    ],
    // A sum of 3 sines rarely hits ±3; dividing by less (with a clamp)
    // restores saturated highlights and deep troughs.
    drive: 2.4,
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  check({ waves, drive }, path, field) {
    need(waves.length > 0 || field.sample, `${path}.waves`, "needs at least one wave (or a field.sample function)");
    waves.forEach((w, i) => {
      const p = `${path}.waves[${i}]`;
      need(isObj(w), p, `expected { fx, fy, k }, got ${w === null ? "null" : Array.isArray(w) ? "array" : typeof w}`);
      for (const k of Object.keys(w)) need(["fx", "fy", "k"].includes(k), `${p}.${k}`, "unknown config key");
      need(Number.isFinite(w.fx) && Number.isFinite(w.fy), p, "fx and fy must be finite numbers");
      need(isInt(w.k), `${p}.k`, `must be an integer (cycles per loop) or the loop seam jumps, got ${w.k}`);
    });
    need(drive > 0, `${path}.drive`, `must be > 0, got ${drive}`);
  },
  // x, y in units of banner width, measured from the field's top-left cell
  // edge (no y0 offset: kept as the original generator had it).
  make(g, { waves, drive }) {
    return (col, row, f) => {
      const x = ((col + 0.5) * g.PX) / g.W;
      const y = ((row + 0.5) * g.PY) / g.W;
      const t = f / g.NF;
      let v = 0;
      for (const { fx, fy, k } of waves) v += Math.sin(TAU * (fx * x + fy * y + k * t));
      return (v / drive + 1) / 2;
    };
  },
};
