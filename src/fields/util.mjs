// Helpers shared by the field presets. A preset is a pure function of
// (col, row, frame) whose only randomness is field.mjs `jitter`, so a config
// always bakes the same SVG.
import { jitter } from "../field.mjs";

export const TAU = Math.PI * 2;

/** jitter() keyed by several integers (seed, item, slot…) → [0, 1) in 1/1024 steps. */
export const rnd = (...parts) => {
  let h = 0x811c9dc5;
  for (const p of parts) h = Math.imul(h ^ (p | 0), 0x01000193);
  // jitter() multiplies in doubles: below 2^20 its first product stays under
  // 2^53, so the low 32 bits its mixing uses survive
  return jitter((h >>> 0) % (1 << 20));
};

/** Fractional part, always in [0, 1). */
export const frac = (v) => v - Math.floor(v);

/**
 * Cell centre in banner widths on both axes, so circles stay round: x in
 * [0, 1], y in [0, H/W] including the y0 offset. cx, cy = the banner centre.
 */
export const space = (g) => ({
  x: (col) => ((col + 0.5) * g.PX) / g.W,
  y: (row) => (g.y0 + (row + 0.5) * g.PY) / g.W,
  cx: 0.5,
  cy: g.H / (2 * g.W),
});

/**
 * Sampler over per-frame buffers: build(t, f) returns COLS × ROWS cells
 * (row-major), cached by frame. Frame NF is built from its own t = 1, not
 * aliased to frame 0, or the seam check would always read 0.
 */
export function perFrame(g, build) {
  const cache = new Map();
  return (col, row, f) => {
    let buf = cache.get(f);
    if (!buf) cache.set(f, (buf = build(f / g.NF, f)));
    return buf[row * g.COLS + col];
  };
}
