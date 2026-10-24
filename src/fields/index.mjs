// Field preset registry. Each preset is
//   defaults  its options; field.options merges over them, and unknown keys or
//             type mismatches are config errors
//   ramp      glyph ramp for a null field.ramp, dim → bright
//   bands     alpha band count for a null field.bands
//   validate  optional (o, v) => void, range checks through v (config.mjs
//             optionChecks; v.field is the field config)
//   make      (g, o, cfg) => (col, row, f) => brightness in [0, 1], where
//             g = fieldGrid(cfg) and f runs 0..NF. Frame NF must equal frame 0
//             (integer cycles and drifts per loop) or the loop seam jumps.
//             field.gamma is applied on top.
import waves from "./waves.mjs";
import stars from "./stars.mjs";
import rain from "./rain.mjs";
import caustics from "./caustics.mjs";
import ripples from "./ripples.mjs";
import interference from "./interference.mjs";
import halo from "./halo.mjs";
import mesh from "./mesh.mjs";
import contour from "./contour.mjs";
import vortex from "./vortex.mjs";

export const FIELD_PRESETS = {
  waves,
  stars,
  rain,
  caustics,
  ripples,
  interference,
  halo,
  mesh,
  contour,
  vortex,
};
