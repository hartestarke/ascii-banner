// static: TV noise, a fresh hash per cell per frame.
import { rnd } from "./util.mjs";

// Hash keys: whether a cell is lit this frame, and how bright.
const KEY_ON = 0x5741, KEY_LEVEL = 0x5742;
// Lit cells span this brightness range (before gamma).
const LO = 0.3;

export default {
  defaults: {
    density: 0.5, // fraction of cells lit per frame
  },
  // the four shade blocks, light → full
  ramp: "░ ▒ ▓ █",
  // one band: per-cell band changes would need a <tspan> per cell
  bands: 1,
  validate(o, v) {
    v.fraction("density");
  },
  make(g, o) {
    return (col, row, f) => {
      const fi = f % g.NF; // the noise is a loop of NF frames: frame NF is frame 0
      const cell = row * g.COLS + col;
      return rnd(KEY_ON, fi, cell) < o.density ? LO + (1 - LO) * rnd(KEY_LEVEL, fi, cell) : 0;
    };
  },
};
