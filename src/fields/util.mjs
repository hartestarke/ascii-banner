// Shared helpers for field presets. Every preset is a pure function of
// (col, row, frame); randomness comes only from field.mjs `jitter`, so the
// output is deterministic.
import { jitter } from "../field.mjs";

export const TAU = Math.PI * 2;

// jitter() multiplies its index by a 32-bit constant in float arithmetic, so
// indices are kept below 2^20 where that product stays exact.
const RND_SPACE = 1 << 20;

/** jitter() keyed by several integers (seed, item, slot…) → [0, 1) in 1/1024 steps. */
export const rnd = (...parts) => {
  let h = 0x811c9dc5;
  for (const p of parts) h = Math.imul(h ^ (p | 0), 0x01000193);
  return jitter((h >>> 0) % RND_SPACE);
};

/** Fractional part, always in [0, 1). */
export const frac = (v) => v - Math.floor(v);

/**
 * Cell centre in banner-width units on both axes (pixel-isotropic, so circles
 * stay round): x in [0, 1], y in [0, H/W]. cx, cy = the banner centre.
 */
export const space = (g) => ({
  x: (col) => ((col + 0.5) * g.PX) / g.W,
  y: (row) => (g.y0 + (row + 0.5) * g.PY) / g.W,
  cx: 0.5,
  cy: g.H / (2 * g.W),
});

/**
 * Memoise a per-frame buffer builder: build(f) fills a Float32Array of
 * COLS × ROWS cells. Any f is computed from its own t = f / NF, so frame NF is
 * genuinely evaluated (the loop-seam check depends on that).
 */
export function perFrame(g, build) {
  const cache = new Map();
  return (col, row, f) => {
    let buf = cache.get(f);
    if (!buf) cache.set(f, (buf = build(f / g.NF, f)));
    return buf[row * g.COLS + col];
  };
}
