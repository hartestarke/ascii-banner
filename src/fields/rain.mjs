// rain: streaks falling at three depths, a bright head over a fading tail.
import { rnd } from "./util.mjs";

export default {
  defaults: {
    columns: 0.35, // fraction of columns carrying a streak
    speed: 2, // falls per loop of the far depth; nearer depths fall ×2, ×3
    tail: 6, // rows
    seed: 1,
  },
  ramp: "┊ ┆ ╎ │ ┃",
  bands: 3,
  validate(o, v) {
    v.fraction("columns");
    v.int("speed", 1, "falls per loop");
    v.posInt("tail");
    v.int("seed");
  },
  make(g, o) {
    // the head runs on past the last row until its tail has left the bottom
    const span = g.ROWS + o.tail;
    const streaks = Array.from({ length: g.COLS }, (_, col) => {
      if (rnd(o.seed, col, 1) >= o.columns) return null;
      const depth = Math.floor(rnd(o.seed, col, 2) * 3); // far → near: faster, brighter
      return { k: o.speed * (depth + 1), bright: 0.5 + 0.25 * depth, phase: rnd(o.seed, col, 3) * span };
    });
    return (col, row, f) => {
      const s = streaks[col];
      if (!s) return 0;
      const t = f / g.NF;
      const head = Math.floor((s.phase + t * s.k * span) % span);
      const dist = head - row;
      return dist >= 0 && dist < o.tail ? s.bright * (1 - dist / o.tail) : 0;
    };
  },
};
