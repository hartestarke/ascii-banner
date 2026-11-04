// Field: a brightness sampler (a preset from src/fields/, or the user's
// field.sample) pushed through a glyph ramp, sampled once per flipbook frame.
// Output is plain data — per frame, per row, one glyph and one colour band per
// cell; svg.mjs turns it into markup.
import { ConfigError, NO_FIELD, parseRamp } from "./config.mjs";
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
 * 2, 4–6 as 5, 7–9 as 8), 2 runs at lo and hi, 1 run at hi. n must not exceed
 * L (resolveConfig caps field.bands), or some runs hold no level.
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

// field.cells modes that split a cell into SX × SY samples: sample k (row-major
// within the cell) sets bit k of the index into glyphs.
const CELLS = {
  half: { SX: 1, SY: 2, glyphs: " ▀▄█" },
};

/** The grid a sampler sees: the cell grid, or its samples under field.cells "half". */
function sampleGrid(cfg, g) {
  const m = CELLS[cfg.field.cells];
  return m ? { ...g, PX: g.PX / m.SX, PY: g.PY / m.SY, COLS: g.COLS * m.SX, ROWS: g.ROWS * m.SY } : g;
}

/** Grid geometry of the field: no cells and no frames for NO_FIELD, one frame for fps 0. */
export function fieldGrid(cfg) {
  const { width: W, height: H } = cfg.size;
  const f = cfg.field;
  const on = f.preset !== NO_FIELD;
  const PX = f.fontSize * cfg.font.advance; // column pitch = the font's advance
  const ROWS = on ? Math.floor(H / f.rowPitch) : 0;
  const NF = !on ? 0 : f.fps ? f.fps * f.loopSeconds : 1;
  return {
    PX,
    PY: f.rowPitch,
    COLS: on ? Math.ceil(W / PX) : 0,
    ROWS,
    NF,
    STILL: on && f.fps ? Math.round(f.stillAt * f.fps) % NF : 0,
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
 * its value is used as is. At fps 0 the one frame is the loop at stillAt.
 */
function sampler(cfg, g) {
  const { gamma, sample, fps, preset, options, stillAt, loopSeconds } = cfg.field;
  if (sample)
    return (col, row, f) => {
      const x = (col + 0.5) * g.PX;
      const y = g.y0 + (row + 0.5) * g.PY;
      let v;
      try {
        v = sample(x, y, fps ? f / fps : stillAt);
      } catch (e) {
        throw new ConfigError(`field.sample threw: ${e?.message ?? e}`);
      }
      if (!Number.isFinite(v)) throw new ConfigError(`field.sample returned ${v} at x=${x}, y=${y}; expected a number in [0, 1]`);
      return v;
    };
  const raw = FIELD_PRESETS[preset].make(g, options, cfg);
  // Presets read the loop phase as f / NF, and NF is 1 at fps 0, so there f
  // carries the phase itself.
  const still = fps ? null : stillAt / loopSeconds;
  return (col, row, f) => Math.pow(Math.min(1, Math.max(0, raw(col, row, still ?? f))), gamma);
}

/**
 * The field's brightness per cell: (col, row, f) → [0, 1], gamma applied as
 * the bake applies it, f taken modulo the loop. Under field.cells "half" it is
 * the mean of the cell's samples. NO_FIELD has no cells: always 0.
 */
export function cellBrightness(cfg, g) {
  if (cfg.field.preset === NO_FIELD) return () => 0;
  const { SX, SY } = CELLS[cfg.field.cells] ?? { SX: 1, SY: 1 };
  const at = sampler(cfg, sampleGrid(cfg, g));
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return (col, row, f) => {
    const ff = ((f % g.NF) + g.NF) % g.NF;
    let sum = 0;
    for (let k = 0; k < SX * SY; k++) sum += clamp(at(col * SX + (k % SX), row * SY + Math.floor(k / SX), ff));
    return sum / (SX * SY);
  };
}

/**
 * Bake the flipbook: frames[f] = [{ row, chars, bands }] for the non-empty
 * rows, chars = one glyph per column (" " for blank), bands = each cell's
 * colour band (-1 for blank), both right-trimmed; block cells also left-trim
 * to `start`, the row's first drawn column. Also `seam`: the largest
 * brightness jump between frame 0 and one full loop later (0 for an exactly
 * periodic sampler, and for a still field, which never wraps).
 */
export function bakeField(cfg, g) {
  if (cfg.field.preset === NO_FIELD) return { frames: [], ramp: [], bands: [], seam: 0 };
  const sg = sampleGrid(cfg, g);
  const at = sampler(cfg, sg);
  const baked = CELLS[cfg.field.cells] ? bakeBlocks(cfg, g, at) : bakeRamp(cfg, g, at);
  let seam = 0;
  if (cfg.field.fps)
    for (let row = 0; row < sg.ROWS; row++)
      for (let col = 0; col < sg.COLS; col++) seam = Math.max(seam, Math.abs(at(col, row, sg.NF) - at(col, row, 0)));
  return { ...baked, seam };
}

/** field.cells "ramp": one ramp glyph per cell. */
function bakeRamp(cfg, g, at) {
  const RAMP = parseRamp(cfg.field.ramp);
  const N = RAMP.length;
  const BANDS = bands(N, cfg.field.bands);
  const bandOf = RAMP.map((_, lv) => BANDS.findIndex((b) => lv >= b.lo && lv <= b.hi));
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
  return { frames, ramp: RAMP, bands: BANDS };
}

/**
 * field.cells "half": every sample is thresholded on its own (Bayer on
 * the sample grid, else at 0.5) and the cell's lit samples pick its block
 * glyph. The band follows the mean of the cell's samples, so with field.bands
 * above 1 alpha carries the gradient on top of the dither. Rows start at their
 * first drawn column: block glyphs cost 3 bytes each, and a field drawn
 * off-centre would otherwise lead every row with blanks.
 */
function bakeBlocks(cfg, g, at) {
  const { SX, SY, glyphs } = CELLS[cfg.field.cells];
  const GLYPHS = [...glyphs];
  const S = SX * SY;
  const n = cfg.field.bands;
  const BANDS = Array.from({ length: n }, (_, b) => ({ a: n === 1 ? 1 : b / (n - 1) }));
  const D = cfg.field.dither;
  const BAYER = D ? bayer(D) : null;
  const { COLS, ROWS, NF } = g;
  const frames = [];
  for (let f = 0; f < NF; f++) {
    const out = [];
    for (let row = 0; row < ROWS; row++) {
      const chars = [];
      const cellBands = [];
      let start = -1, end = 0;
      for (let col = 0; col < COLS; col++) {
        let bits = 0, sum = 0;
        for (let k = 0; k < S; k++) {
          const sc = col * SX + (k % SX), sr = row * SY + Math.floor(k / SX);
          const v = at(sc, sr, f);
          sum += v;
          if (v > (BAYER ? BAYER[sr % D][sc % D] + 0.5 / (D * D) : 0.5)) bits |= 1 << k;
        }
        if (!bits) {
          chars.push(" ");
          cellBands.push(-1);
          continue;
        }
        if (start < 0) start = col;
        chars.push(GLYPHS[bits]);
        cellBands.push(Math.min(n - 1, Math.floor((sum / S) * n)));
        end = col + 1;
      }
      if (end) out.push({ row, start, chars: chars.slice(start, end), bands: cellBands.slice(start, end) });
    }
    frames.push(out);
  }
  return { frames, ramp: [[], GLYPHS.slice(1)], bands: BANDS };
}
