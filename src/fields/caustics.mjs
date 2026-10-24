// caustics: classic plasma — four sines along x, y, the diagonal and the
// radius — shown as the bright network where the sum crosses zero, like light
// on a pool floor.
import { TAU, isInt, need, space } from "./util.mjs";

// Per term: spatial cycles per banner width (× scale) and cycles per loop (× speed).
// Distinct speeds keep the network reshaping instead of sliding rigidly.
const TERMS = { x: [2.1, 1], y: [3.4, -1], diag: [1.5, 2], radial: [2.6, -2] };
// Off-centre origin of the radial term, in banner widths from the centre.
const RADIAL_ORIGIN = { dx: 0.17, dy: 0.04 };
// |sum| below this lights up; the network's line width.
const RIDGE = 0.4;
const SHARPNESS = 1.6;

export default {
  defaults: {
    scale: 1, // spatial frequency multiplier: > 1 = finer network
    speed: 1, // integer multiplier of every term's cycles per loop
  },
  ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  bands: 3,
  check(o, path) {
    need(o.scale > 0, `${path}.scale`, `must be > 0, got ${o.scale}`);
    need(isInt(o.speed), `${path}.speed`, `must be an integer (cycles per loop), got ${o.speed}`);
  },
  make(g, { scale, speed }) {
    const sp = space(g);
    const ox = sp.cx + RADIAL_ORIGIN.dx, oy = sp.cy + RADIAL_ORIGIN.dy;
    return (col, row, f) => {
      const x = sp.x(col) - sp.cx, y = sp.y(row) - sp.cy;
      const t = (f / g.NF) * speed;
      const r = Math.hypot(x + sp.cx - ox, y + sp.cy - oy);
      const s =
        Math.sin(TAU * (TERMS.x[0] * scale * x + TERMS.x[1] * t)) +
        Math.sin(TAU * (TERMS.y[0] * scale * y + TERMS.y[1] * t)) +
        Math.sin(TAU * (TERMS.diag[0] * scale * (x + y) + TERMS.diag[1] * t)) +
        Math.sin(TAU * (TERMS.radial[0] * scale * r + TERMS.radial[1] * t));
      return Math.pow(Math.max(0, 1 - Math.abs(s) / RIDGE), SHARPNESS);
    };
  },
};
