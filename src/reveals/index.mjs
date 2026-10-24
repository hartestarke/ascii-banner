// Reveal presets: how a tagline appears in its slot. name → { defaults,
// validate(options, v), render(ctx) }; ctx and the render result are
// documented at svg.mjs renderReveal. `reveal.options` merges over `defaults`
// (same rules as the config: no unknown keys, types must match), then
// `validate` range-checks it. Each preset prefixes its classes/ids (tw, wp, dv,
// dp, gx, op; scramble keeps its original names) so presets never collide with
// each other or with the field (.f, .b<n>, k).
import scramble from "./scramble.mjs";
import typewriter from "./typewriter.mjs";
import wipe from "./wipe.mjs";
import dissolve from "./dissolve.mjs";
import fall from "./fall.mjs";
import glitch from "./glitch.mjs";
import fade from "./fade.mjs";

export const REVEAL_PRESETS = { scramble, typewriter, wipe, dissolve, fall, glitch, fade };
