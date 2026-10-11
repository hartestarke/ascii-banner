// Wave field: travelling plane waves (or a user sampler) pushed through a glyph
// ramp, sampled once per flipbook frame. Output is plain data — per frame, per
// row, one string per colour band; svg.mjs turns it into markup.
import { ConfigError, parseRamp } from "./config.mjs";

/** Deterministic integer hash → [0, 1) in 1/1024 steps. Every "random" choice uses it. */
export const jitter = (i) => {
  let x = (i + 1) * 2654435761;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (((x ^ (x >>> 16)) >>> 0) % 1024) / 1024;
};
const TAU = Math.PI * 2;

/**
 * Collapse the ramp's levels into three fill classes: glyph weight already
 * carries most of the gradient, and per-run <tspan>s would triple the size.
 * Levels 1..L split into thirds; each band is coloured as its middle level.
 * (For the default 9 levels: 1–3 as 2, 4–6 as 5, 7–9 as 8.)
 */
function bands(levels) {
  const L = levels - 1;
  return [0, 1, 2].map((b) => {
    const lo = 1 + Math.floor((b * L) / 3);
    const hi = Math.floor(((b + 1) * L) / 3);
    return { lo, hi, rep: Math.round((lo + hi) / 2) };
  });
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
  };
}

/**
 * Brightness sampler for cell (col, row) at frame f, in [0, 1] before dither.
 * The built-in waves take x, y in units of banner width and t in [0, 1) of the
 * loop; a user `field.sample` gets the cell centre in banner px (the field
 * starts at x=0 and is centred vertically, offset y0) and seconds instead.
 */
function sampler(cfg, g) {
  const W = cfg.size.width;
  const { waves, gamma, drive, sample, fps } = cfg.field;
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
  const wave = (x, y, t) => {
    let v = 0;
    for (const { fx, fy, k } of waves) v += Math.sin(TAU * (fx * x + fy * y + k * t));
    return Math.pow(Math.min(1, Math.max(0, (v / drive + 1) / 2)), gamma);
  };
  return (col, row, f) => wave(((col + 0.5) * g.PX) / W, ((row + 0.5) * g.PY) / W, f / g.NF);
}

/**
 * Bake the flipbook: frames[f] = [{ row, band, text }], text right-trimmed and
 * empty runs dropped. One string per colour band per row: band glyphs in place,
 * spaces elsewhere; the monospace grid keeps the three layers in register.
 */
export function bakeField(cfg, g) {
  const RAMP = parseRamp(cfg.field.ramp);
  const BANDS = bands(RAMP.length);
  const at = sampler(cfg, g);
  const { COLS, ROWS, NF } = g;
  const frames = [];
  for (let f = 0; f < NF; f++) {
    const out = [];
    for (let row = 0; row < ROWS; row++) {
      const level = [];
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        // ±0.05 dither keeps level boundaries from drawing hard contour lines
        const b = at(col, row, f) + jitter(i) * 0.1 - 0.05;
        level.push(Math.min(RAMP.length - 1, Math.max(0, Math.floor(b * RAMP.length))));
      }
      for (let bi = 0; bi < BANDS.length; bi++) {
        const { lo, hi } = BANDS[bi];
        let s = "";
        for (let col = 0; col < COLS; col++) {
          const lv = level[col];
          if (lv >= lo && lv <= hi) {
            const v = RAMP[lv];
            s += v[Math.floor(jitter((row * COLS + col) * 3 + 1) * v.length)];
          } else s += " ";
        }
        s = s.replace(/\s+$/, "");
        if (s) out.push({ row, band: bi, text: s });
      }
    }
    frames.push(out);
  }
  return { frames, ramp: RAMP, bands: BANDS };
}
