// Reveal presets: how a tagline appears in its slot. Each is { defaults,
// validate(o, v), render(ctx) }: `reveal.options` merges over `defaults` with
// the config's rules (no unknown keys, matching types), then `validate`
// range-checks it through `v` (config.mjs optionChecks). ctx and the render
// result are documented at svg.mjs renderReveal. Classes and ids carry a
// per-preset prefix (tw, wp, dv, dp, gx, nr) clear of the field's (.f, .b<n>,
// k); scramble's unprefixed names are part of the default banner's bytes.
import scramble from "./scramble.mjs";
import typewriter from "./typewriter.mjs";
import wipe from "./wipe.mjs";
import dissolve from "./dissolve.mjs";
import fall from "./fall.mjs";
import glitch from "./glitch.mjs";
import none from "./none.mjs";

export const REVEAL_PRESETS = { scramble, typewriter, wipe, dissolve, fall, glitch };

/**
 * Every reveal.preset value. "none" stays out of REVEAL_PRESETS, which the
 * gallery renders one SVG per entry from, since it has no reveal to show.
 */
export const REVEALS = { ...REVEAL_PRESETS, none };
