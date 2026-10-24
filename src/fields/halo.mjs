// halo: a breathing corona around the centre. Inside the ring the field stays
// dim, so taglines sit in a quiet pocket; outside it glows off softly.
import { TAU, isInt, need, rnd, space } from "./util.mjs";

// Rise of the inner glow towards the ring: brightness ∝ (r / R)^INNER_POWER.
const INNER_POWER = 4;
// Per-cell grain amplitude (static: a texture, not flicker), and its hash key.
const GRAIN = 0.25;
const GRAIN_KEY = 0x4a10;

export default {
  defaults: {
    radius: 0.42, // ring radius, fraction of the banner width
    breath: 0.12, // ring radius swing, fraction of the radius
    cycles: 2, // breaths per loop (integer)
    softness: 0.35, // outward glow falloff, fraction of the banner width
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  check(o, path) {
    need(o.radius > 0, `${path}.radius`, `must be > 0, got ${o.radius}`);
    need(o.breath >= 0 && o.breath < 1, `${path}.breath`, `must be within [0, 1), got ${o.breath}`);
    need(isInt(o.cycles), `${path}.cycles`, `must be an integer (breaths per loop), got ${o.cycles}`);
    need(o.softness > 0, `${path}.softness`, `must be > 0, got ${o.softness}`);
  },
  make(g, o) {
    const sp = space(g);
    const grain = (col, row) => GRAIN * (rnd(GRAIN_KEY, col, row) - 0.5);
    return (col, row, f) => {
      const R = o.radius * (1 + o.breath * Math.sin(TAU * o.cycles * (f / g.NF)));
      const r = Math.hypot(sp.x(col) - sp.cx, sp.y(row) - sp.cy);
      const v = r < R ? Math.pow(r / R, INNER_POWER) : Math.exp(-(((r - R) / o.softness) ** 2));
      return v * (1 + grain(col, row));
    };
  },
};
