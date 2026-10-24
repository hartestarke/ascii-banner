// ascii-banner config. Every knob is listed with its default; delete any line
// to fall back to the default, or change it and rebuild:
//   npx --yes github:hartestarke/ascii-banner build
// Unknown keys are an error, so a typo can't silently do nothing.
export default {
  // viewBox size in px; the README <img> scales it down responsively.
  // Raw file size grows with width × height, so keep within the budget below.
  size: { width: 880, height: 240 },

  // The only hue. Field, taglines and shadows are all this colour at different
  // alphas, so the banner reads on light, dark and dimmed themes alike.
  accent: "#E62D42",

  // Lines decoded one after another, in this order. [] = pure field, no text.
  // The default font, ANSI Shadow, is caps only (lowercase renders as caps);
  // the other bundled fonts have lowercase. Characters a font lacks render as
  // its "?" glyph and the build prints a warning.
  taglines: ["hello world", "ascii banner", "make it yours"],

  tagline: {
    fill: 0.92, // the widest tagline spans at most this fraction of the width...
    maxHeight: 0.34, // ...and the letters at most this fraction of the height
    lineHeight: 1.2, // row pitch, em; block glyphs span -0.3..1.02em, so ≤ 1.32 stays seamless
    shadowAlpha: 0.5, // alpha of the shadow strokes vs the solid blocks
    knockout: 6, // px the field is cleared around the letters; 0 = off
    // Bundled figlet font (`ascii-banner fonts` lists them: standard, slant,
    // big, small, shadow, ...), or a path to any .flf (relative to this file).
    font: "ansi-shadow",
    // Glyph spacing: "full" (butted together), "fit" (moved together until they
    // touch), "smush" (merged where they touch), "header" (as the .flf says).
    // null = the font's default: "full" for ansi-shadow, "header" otherwise.
    layout: null,
    // Figlet glyphs drawn at shadowAlpha; all others are solid. null = the
    // font's default: "═║╔╗╚╝" for ansi-shadow, "" (single tone) otherwise.
    shadowGlyphs: null,
  },

  decode: {
    seconds: 2.2, // seconds a line spends decoding
    hold: 5.8, // seconds a settled line holds before the next one starts
    fps: 20, // decode step rate; reads as noise below ~15
    noiseFrames: 6, // distinct scramble frames cycled during decode
    lead: 16, // columns of scramble running ahead of the settled text
    leadVar: 0.35, // per-row spread of lead, as a fraction of it
    rag: 3, // columns a row's front may stray either side of the mean front
    ragTicks: 3, // decode ticks between a row's wander knots; lower = twitchier
    burst: 0.85, // pace jitter of the front: 0 = even, 1 = from a stall to a double step
    noiseAlpha: 0.65, // alpha of not-yet-decoded glyphs
  },

  field: {
    fontSize: 14, // field glyph size, px (bigger = fewer cells = smaller file)
    rowPitch: 16, // px between field rows
    fps: 10, // flipbook rate; ~half a column of motion per flip, the finest the grid shows
    loopSeconds: 20, // loop length; fps × loopSeconds frames, and file size scales with it
    stillAt: 7, // second of the loop shown to prefers-reduced-motion visitors
    alpha: { lo: 0.3, hi: 0.95 }, // field alpha from the dimmest to the brightest band
    // Alpha bands the ramp levels fold into: 3 = lo / mid / hi, 2 = lo / hi,
    // 1 = all at hi (smallest file). null = the preset's own default.
    bands: null,
    // Brightness ramp, dim → bright. Levels are separated by spaces; the
    // characters of one level are interchangeable variants. Empty = level 0.
    // null = the preset's own ramp (waves: ":. !/ \\| 1? 7* 25 %0 &# 8@").
    ramp: null,
    gamma: 1.35, // > 1 deepens the dark side of the gradient (not applied to `sample`)
    // 0 = plain quantising with a little per-cell jitter; 2, 4 or 8 = ordered
    // (Bayer) dither of that size: gradients turn into regular patterns.
    dither: 0,
    // The brightness field: waves, stars, rain, caustics, ripples, interference,
    // halo, mesh, contour, vortex or static (see docs/fields.md). `options`
    // tunes the chosen preset; omitted keys keep its defaults, unknown keys are
    // an error. waves' options, with their defaults:
    preset: "waves",
    options: {
      // Plane waves summed into the field. fx/fy = cycles per banner WIDTH (on
      // both axes, so lobes stay round), k = whole cycles per loop (keeps the
      // seam exact). Keep every k distinct; k = 0 is a standing component.
      waves: [
        { fx: 0.75, fy: 0.55, k: 1 },
        { fx: -0.35, fy: 0.95, k: -1 },
        { fx: 0.95, fy: -0.4, k: 0 },
      ],
      drive: 2.4, // wave-sum divisor; lower = more saturated highlights and deeper troughs
    },
    // Replace the preset with your own brightness function:
    //   (x, y, t) => number in [0, 1]; x, y = cell centre in px, t = seconds into the loop.
    // Make it periodic in t over loopSeconds, or the loop seam will jump (the
    // build warns). Example:
    //   sample: (x, y, t) => 0.5 + 0.5 * Math.sin(x / 60 + (2 * Math.PI * t) / 20),
    sample: null,
  },

  font: {
    file: null, // null = bundled JetBrains Mono subset; or a path to your own .woff2
    advance: 0.6, // that font's glyph advance in em (JetBrains Mono: 0.6)
  },

  budget: {
    maxBytes: 1048576, // build fails above this many raw bytes; 0 = no limit
  },
};
