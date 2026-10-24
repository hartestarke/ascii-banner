// stars: a sparse twinkling starfield, optionally drifting sideways at two
// depths (parallax).
import { TAU, frac, perFrame, rnd } from "./util.mjs";

export default {
  defaults: {
    density: 0.06, // fraction of cells holding a star
    twinkle: 3, // max cycles per loop; each star gets 1..twinkle
    drift: 0, // columns per loop on the near layer, half on the far one
    seed: 1,
  },
  ramp: ". : + *",
  bands: 3,
  validate(o, v) {
    v.fraction("density");
    v.posInt("twinkle");
    v.int("drift", 0, "columns per loop");
    v.int("seed");
  },
  make(g, o) {
    const { COLS, ROWS } = g;
    const stars = Array.from({ length: Math.max(1, Math.round(o.density * COLS * ROWS)) }, (_, k) => {
      const r = (slot) => rnd(o.seed, k, slot);
      const near = r(1) < 0.4;
      return {
        row: Math.floor(r(2) * ROWS),
        x: r(3) * COLS,
        drift: near ? o.drift : Math.round(o.drift / 2),
        cycles: 1 + Math.floor(r(4) * o.twinkle),
        phase: r(5),
        life: r(6), // drift phase, so stars don't respawn in step
        peak: near ? 0.85 + 0.15 * r(7) : 0.55 + 0.25 * r(7),
      };
    });
    // A drifting star slides `drift` columns per loop and fades in and out
    // (sin envelope) to hide its jump back: its path is exactly periodic for
    // any drift, and the sky never repeats across the width as a wrapped tile
    // would.
    return perFrame(g, (t) => {
      const buf = new Float32Array(COLS * ROWS);
      for (const s of stars) {
        const u = frac(t + s.life);
        const col = Math.floor(s.x + s.drift * (u - 0.5));
        if (col < 0 || col >= COLS) continue;
        const env = s.drift ? Math.sin(Math.PI * u) : 1;
        const tw = 0.5 + 0.5 * Math.cos(TAU * (s.cycles * t + s.phase));
        const v = s.peak * env * (0.3 + 0.7 * tw);
        const i = s.row * COLS + col;
        if (v > buf[i]) buf[i] = v;
      }
      return buf;
    });
  },
};
