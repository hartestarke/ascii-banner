// Field: a brightness sampler (a preset from src/fields/, or the user's
// field.sample) pushed through a glyph ramp, sampled once per flipbook frame.
// Output is plain data — per frame, per row, one glyph and one colour band per
// cell; svg.mjs turns it into markup.
import { ConfigError, parseRamp } from "./config.mjs";
import { FIELD_PRESETS } from "./fields/index.mjs";

/** Deterministic integer hash → [0, 1) in 1/1024 steps. Every "random" choice uses it. */
export const jitter = (i) => {
  let x = (i + 1) * 2654435761;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (((x ^ (x >>> 16)) >>> 0) % 1024) / 1024;
};

/**
 * Split ramp levels 1..L into n runs { lo, hi, rep, a }, one fill each: glyph
 * weight already carries most of the gradient. `a` places the run on
 * field.alpha lo → hi: 3 or more runs at their middle level (9 levels: 1–3 as
 * 2, 4–6 as 5, 7–9 as 8), 2 runs at lo and hi, 1 run at hi.
 */
function bands(levels, n) {
  const L = levels - 1;
  return Array.from({ length: n }, (_, b) => {
    const lo = 1 + Math.floor((b * L) / n);
    const hi = Math.floor(((b + 1) * L) / n);
    const rep = Math.round((lo + hi) / 2);
    return { lo, hi, rep, a: n >= 3 ? rep / L : n === 1 ? 1 : b / (n - 1) };
  });
}

/** Normalised n × n Bayer threshold matrix (n a power of two), values in [0, 1). */
function bayer(n) {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length;
    m = Array.from({ length: 2 * s }, (_, y) =>
      Array.from({ length: 2 * s }, (_, x) => 4 * m[y % s][x % s] + [0, 2, 3, 1][(y >= s) * 2 + (x >= s)]));
  }
  return m.map((r) => r.map((v) => v / (n * n)));
}

/** Grid geometry of the field. */
export function fieldGrid(cfg) {
  const { width: W, height: H } = cfg.size;
  const f = cfg.field;
  const PX = f.fontSize * cfg.font.advance; // column pitch = the font's advance
  const ROWS = Math.floor(H / f.rowPitch);
  return {
    PX,
    PY: f.rowPitch,
    COLS: Math.ceil(W / PX),
    ROWS,
    NF: f.fps * f.loopSeconds,
    STILL: Math.round(f.stillAt * f.fps) % (f.fps * f.loopSeconds),
    y0: (H - ROWS * f.rowPitch) / 2,
    W,
    H,
  };
}

/**
 * Brightness sampler for cell (col, row) at frame f, in [0, 1] before dither.
 * A preset's sampler (see src/fields/index.mjs) gets field.gamma applied on
 * top; a user `field.sample` gets the cell centre in banner px (the field
 * starts at x=0 and is centred vertically, offset y0) and seconds instead, and
 * its value is used as is.
 */
function sampler(cfg, g) {
  const { gamma, sample, fps, preset, options } = cfg.field;
  if (sample)
    return (col, row, f) => {
      const x = (col + 0.5) * g.PX;
      const y = g.y0 + (row + 0.5) * g.PY;
      let v;
      try {
        v = sample(x, y, f / fps);
      } catch (e) {
        throw new ConfigError(`field.sample threw: ${e?.message ?? e}`);
      }
      if (!Number.isFinite(v)) throw new ConfigError(`field.sample returned ${v} at x=${x}, y=${y}; expected a number in [0, 1]`);
      return v;
    };
  const raw = FIELD_PRESETS[preset].make(g, options, cfg);
  return (col, row, f) => Math.pow(Math.min(1, Math.max(0, raw(col, row, f))), gamma);
}

/**
 * Bake the flipbook: frames[f] = [{ row, chars, bands }] for the non-empty
 * rows, chars = one glyph per column (" " for blank), bands = each cell's
 * colour band (-1 for blank), both right-trimmed. Also `seam`: the largest
 * brightness jump between frame 0 and one full loop later (0 for an exactly
 * periodic sampler).
 */
export function bakeField(cfg, g) {
  const RAMP = parseRamp(cfg.field.ramp);
  const N = RAMP.length;
  const BANDS = bands(N, cfg.field.bands);
  const bandOf = RAMP.map((_, lv) => BANDS.findIndex((b) => lv >= b.lo && lv <= b.hi));
  const at = sampler(cfg, g);
  const { COLS, ROWS, NF } = g;
  const D = cfg.field.dither;
  const BAYER = D ? bayer(D) : null;
  const frames = [];
  for (let f = 0; f < NF; f++) {
    const out = [];
    for (let row = 0; row < ROWS; row++) {
      const chars = [];
      const cellBands = [];
      let end = 0;
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        const v = at(col, row, f);
        // A Bayer threshold turns a gradient into a regular pattern; without
        // dither, ±0.05 of per-cell jitter keeps level boundaries from drawing
        // hard contour lines.
        const x = BAYER ? v * N + BAYER[row % D][col % D] : (v + jitter(i) * 0.1 - 0.05) * N;
        const lv = Math.min(N - 1, Math.max(0, Math.floor(x)));
        const band = bandOf[lv];
        if (band < 0) {
          chars.push(" ");
          cellBands.push(-1);
          continue;
        }
        const glyphs = RAMP[lv];
        chars.push(glyphs[Math.floor(jitter(i * 3 + 1) * glyphs.length)]);
        cellBands.push(band);
        end = col + 1;
      }
      if (end) out.push({ row, chars: chars.slice(0, end), bands: cellBands.slice(0, end) });
    }
    frames.push(out);
  }
  let seam = 0;
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) seam = Math.max(seam, Math.abs(at(col, row, NF) - at(col, row, 0)));
  return { frames, ramp: RAMP, bands: BANDS, seam };
}
