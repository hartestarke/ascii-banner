// Field preset registry. Each preset:
//   defaults  its options (field.options is merged over them; unknown keys and
//             type mismatches are config errors)
//   ramp      default glyph ramp (field.ramp: null picks it), dim → bright
//   bands     default alpha band count (field.bands: null picks it)
//   validate  optional (opts, v) => void; range-checks opts through v (config.mjs
//             optionChecks, shared with reveal presets; v.field = the field config)
//   make      (g, opts, cfg) => (col, row, f) => brightness in [0, 1]
//             g = fieldGrid(cfg); f = frame 0..NF-1, t = f / NF. The sampler must
//             be exactly periodic: frame NF must equal frame 0 (integer cycle
//             counts, integer drifts per loop). field.gamma is applied after it.
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
import staticNoise from "./static.mjs";

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
  static: staticNoise,
};
