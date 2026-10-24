// static: TV noise, a fresh hash per cell per frame.
import { rnd } from "./util.mjs";

export default {
  defaults: {
    density: 0.5, // fraction of cells lit per frame
  },
  ramp: "░ ▒ ▓ █",
  // one band: per-cell band changes would cost a <tspan> per cell
  bands: 1,
  validate(o, v) {
    v.fraction("density");
  },
  make(g, o) {
    return (col, row, f) => {
      const fi = f % g.NF; // frame NF hashes as frame 0, closing the loop
      const cell = row * g.COLS + col;
      return rnd(0x5741, fi, cell) < o.density ? 0.3 + 0.7 * rnd(0x5742, fi, cell) : 0;
    };
  },
};
