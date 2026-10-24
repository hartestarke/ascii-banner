// rain: streaks falling at three depths, a bright head over a fading tail.
import { isInt, need, rnd } from "./util.mjs";

// Per depth (far → near): speed multiplier and head brightness.
const DEPTHS = [
  { speed: 1, bright: 0.5 },
  { speed: 2, bright: 0.75 },
  { speed: 3, bright: 1 },
];

export default {
  defaults: {
    columns: 0.35, // fraction of columns carrying a streak
    speed: 2, // falls per loop of the slowest depth (integer; nearer depths ×2, ×3)
    tail: 6, // rows of fading tail behind the head
    seed: 1,
  },
  // dashed light verticals for the tail, solid then heavy for the head
  ramp: "┊ ┆ ╎ │ ┃",
  bands: 3,
  check(o, path) {
    need(o.columns > 0 && o.columns <= 1, `${path}.columns`, `must be within (0, 1], got ${o.columns}`);
    need(isInt(o.speed) && o.speed >= 1, `${path}.speed`, `must be an integer >= 1 (falls per loop), got ${o.speed}`);
    need(isInt(o.tail) && o.tail >= 1, `${path}.tail`, `must be an integer >= 1, got ${o.tail}`);
    need(isInt(o.seed), `${path}.seed`, `must be an integer, got ${o.seed}`);
  },
  make(g, o) {
    const { ROWS, NF } = g;
    // A streak's head runs through rows 0 .. ROWS + tail - 1, so the tail fully
    // leaves the bottom before the head re-enters at the top.
    const span = ROWS + o.tail;
    const streaks = Array.from({ length: g.COLS }, (_, col) => {
      if (rnd(o.seed, col, 1) >= o.columns) return null;
      const d = DEPTHS[Math.floor(rnd(o.seed, col, 2) * DEPTHS.length)];
      return { k: o.speed * d.speed, bright: d.bright, phase: rnd(o.seed, col, 3) * span };
    });
    return (col, row, f) => {
      const s = streaks[col];
      if (!s) return 0;
      // integer falls per loop: at f = NF the head is back where it started
      const head = Math.floor((s.phase + (f / NF) * s.k * span) % span);
      const dist = head - row;
      return dist >= 0 && dist < o.tail ? s.bright * (1 - dist / o.tail) : 0;
    };
  },
};
