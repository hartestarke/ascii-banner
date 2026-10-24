// stars: a sparse twinkling starfield, optionally drifting sideways at two
// depths (parallax).
import { TAU, frac, isInt, need, perFrame, rnd } from "./util.mjs";

// Share of stars on the near (faster, brighter) layer.
const NEAR_SHARE = 0.4;
// Brightness at the bottom of a twinkle, as a fraction of the star's peak.
const TWINKLE_FLOOR = 0.3;

export default {
  defaults: {
    density: 0.06, // fraction of cells holding a star
    twinkle: 3, // max twinkle cycles per loop; each star gets an integer 1..twinkle
    drift: 0, // columns the near layer drifts per loop (far layer: half, rounded); 0 = still
    seed: 1,
  },
  ramp: ". : + *",
  bands: 3,
  check(o, path) {
    need(o.density > 0 && o.density <= 1, `${path}.density`, `must be within (0, 1], got ${o.density}`);
    need(isInt(o.twinkle) && o.twinkle >= 1, `${path}.twinkle`, `must be an integer >= 1, got ${o.twinkle}`);
    need(isInt(o.drift) && o.drift >= 0, `${path}.drift`, `must be an integer >= 0 (columns per loop), got ${o.drift}`);
    need(isInt(o.seed), `${path}.seed`, `must be an integer, got ${o.seed}`);
  },
  make(g, o) {
    const { COLS, ROWS } = g;
    const layers = [o.drift, Math.round(o.drift / 2)];
    const stars = Array.from({ length: Math.max(1, Math.round(o.density * COLS * ROWS)) }, (_, k) => {
      const r = (slot) => rnd(o.seed, k, slot);
      const near = r(1) < NEAR_SHARE;
      return {
        row: Math.floor(r(2) * ROWS),
        x: r(3) * COLS,
        drift: layers[near ? 0 : 1],
        cycles: 1 + Math.floor(r(4) * o.twinkle),
        phase: r(5),
        life: r(6), // phase of the drift sawtooth, so stars don't respawn in step
        peak: near ? 0.85 + 0.15 * r(7) : 0.55 + 0.25 * r(7),
      };
    });
    // A drifting star slides `drift` columns over one loop, fading in and out
    // (sin envelope) so its jump back to the start is invisible: every star's
    // path is exactly periodic whatever the drift, and the sky never repeats
    // across the width the way a wrapped tile would.
    return perFrame(g, (t) => {
      const buf = new Float32Array(COLS * ROWS);
      for (const s of stars) {
        const u = frac(t + s.life);
        const col = Math.floor(s.x + s.drift * (u - 0.5));
        if (col < 0 || col >= COLS) continue;
        const env = s.drift ? Math.sin(Math.PI * u) : 1;
        const tw = 0.5 + 0.5 * Math.cos(TAU * (s.cycles * t + s.phase));
        const v = s.peak * env * (TWINKLE_FLOOR + (1 - TWINKLE_FLOOR) * tw);
        const i = s.row * COLS + col;
        if (v > buf[i]) buf[i] = v;
      }
      return buf;
    });
  },
};
