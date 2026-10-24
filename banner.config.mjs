// ascii-banner config. Every knob is listed with its default; delete any line
// to fall back to the default, or change it and rebuild:
//   npx --yes github:hartestarke/ascii-banner build
// Unknown keys are an error, so a typo can't silently do nothing.
export default {
  // px, the viewBox; the README <img> scales it down responsively. File size
  // grows with width × height, so keep within the budget below.
  size: { width: 880, height: 240 },

  // The only hue: field, taglines and shadows are this colour at different
  // alphas, so the banner reads on light, dark and dimmed themes alike.
  accent: "#E62D42",

  // Lines revealed one after another, in this order; [] = field only. The
  // default font, ANSI Shadow, is caps only (lowercase renders as caps); the
  // other bundled fonts have lowercase. A character the font lacks renders as
  // its "?" glyph, with a build warning.
  taglines: ["hello world", "ascii banner", "make it yours"],

  tagline: {
    fill: 0.92, // fraction of the width the widest tagline spans at most...
    maxHeight: 0.34, // ...and fraction of the height the letters span at most
    lineHeight: 1.2, // em, row pitch; block glyphs span -0.3..1.02em, so ≤ 1.32 stays seamless
    shadowAlpha: 0.5, // alpha of the shadow strokes vs the solid blocks
    knockout: 6, // px the field is cleared around the letters; 0 = off
    // A bundled figlet font (`ascii-banner fonts` lists them: standard, slant,
    // big, small, shadow, ...) or a path to any .flf, relative to this file.
    font: "ansi-shadow",
    // Glyph spacing: "full" (butted together), "fit" (moved together until they
    // touch), "smush" (merged where they touch) or "header" (as the .flf says).
    // null = the font's default: "full" for ansi-shadow and the block faces,
    // whose spacing is drawn in; "header" for the FIGlet fonts and paths.
    layout: null,
    // Figlet glyphs drawn at shadowAlpha; all others are solid. null = the
    // font's default: "═║╔╗╚╝" for ansi-shadow, "░" for blocks-shadow, ""
    // (single tone) for every other font and for paths.
    shadowGlyphs: null,
  },

  // How each line appears. Every preset hides the line outside its slot, holds
  // it settled for `hold` and opens the knockout with the letters. A top-level
  // `decode: {...}` block is an alias of preset "scramble" with those knobs.
  reveal: {
    // "scramble" | "typewriter" | "wipe" | "dissolve" | "fall" | "glitch"
    preset: "scramble",
    seconds: 2.2, // s a line spends revealing
    hold: 5.8, // s a settled line holds before the next one starts
    fps: 20, // steps per second of stepped reveals; scramble reads as noise below ~15
    // The preset's own knobs: omitted ones keep its defaults, unknown ones are
    // an error, so replace these when you switch preset. Shown: scramble's.
    // The others, with their defaults:
    //   typewriter: cursor ("█"; "" = none), blink (0 = the cursor leaves at
    //               settle; > 0 = blink period in s during the hold)
    //   wipe:       direction ("right" | "left" | "down" | "up" | "center" | "edges"),
    //               steps (0 = smooth; n > 0 = n discrete steps)
    //   dissolve:   matrix (4; 2 | 4 | 8 dither tile), order ("bayer" | "random")
    //   fall:       from ("top" | "bottom" | "scatter"), group ("letter" | "column"),
    //               stagger (0.6 = fraction of seconds the start times spread over)
    //   glitch:     slices (3 rows jumped per tick), shift (2 = max jump, columns),
    //               flashes (4 noise flashes), noiseAlpha (0.65)
    options: {
      noiseFrames: 6, // distinct scramble frames cycled during the reveal
      lead: 16, // columns of scramble running ahead of the settled text
      leadVar: 0.35, // per-row spread of lead, as a fraction of it
      rag: 3, // columns a row's front may stray either side of the mean front
      ragTicks: 3, // reveal ticks between a row's wander knots; lower = twitchier
      burst: 0.85, // pace jitter of the front: 0 = even, 1 = from a stall to a double step
      noiseAlpha: 0.65, // alpha of not-yet-decoded glyphs
    },
  },

  field: {
    fontSize: 14, // px, field glyph size; bigger = fewer cells = smaller file
    rowPitch: 16, // px between field rows
    fps: 10, // flipbook rate; ~half a column of motion per flip, the finest the grid shows
    loopSeconds: 20, // s, loop length; the file holds fps × loopSeconds frames
    stillAt: 7, // s into the loop, the frame prefers-reduced-motion visitors see
    alpha: { lo: 0.3, hi: 0.95 }, // field alpha of the dimmest and the brightest band
    // Alpha bands the ramp levels fold into: 3 = lo / mid / hi, 2 = lo / hi,
    // 1 = all at hi (smallest file). null = the preset's default.
    bands: null,
    // Brightness ramp, dim → bright: levels separated by spaces, the characters
    // of a level interchangeable; level 0 (empty) is implicit. null = the
    // preset's ramp (waves: ":. !/ \\| 1? 7* 25 %0 &# 8@").
    ramp: null,
    gamma: 1.35, // > 1 deepens the dark side of the gradient (not applied to `sample`)
    // 0 = plain quantising with a little per-cell jitter; 2, 4 or 8 = ordered
    // (Bayer) dither of that size, which turns gradients into regular patterns.
    dither: 0,
    // The brightness field: waves, stars, rain, caustics, ripples, interference,
    // halo, mesh, contour or vortex (see docs/fields.md). `options` tunes
    // the chosen preset: omitted keys keep its defaults, unknown keys are an
    // error. Shown: waves' options, with their defaults.
    preset: "waves",
    options: {
      // Plane waves summed into the field. fx, fy = cycles per banner WIDTH (on
      // both axes, so lobes stay round); k = whole cycles per loop, which keeps
      // the seam exact. Keep every k distinct; k = 0 is a standing component.
      waves: [
        { fx: 0.75, fy: 0.55, k: 1 },
        { fx: -0.35, fy: 0.95, k: -1 },
        { fx: 0.95, fy: -0.4, k: 0 },
      ],
      drive: 2.4, // wave-sum divisor; lower = more saturated highlights and deeper troughs
    },
    // Your own brightness function in place of the preset:
    //   (x, y, t) => number in [0, 1]; x, y = cell centre in px, t = s into the loop.
    // Make it periodic in t over loopSeconds, or the loop seam jumps (the build
    // warns). Example:
    //   sample: (x, y, t) => 0.5 + 0.5 * Math.sin(x / 60 + (2 * Math.PI * t) / 20),
    // Lighting every cell costs more bytes than the waves preset: pair it with
    // bands: 1 or a shorter loopSeconds to stay under the budget.
    sample: null,
  },

  font: {
    file: null, // a .woff2 path, relative to this file; null = the bundled JetBrains Mono subset
    advance: 0.6, // em, that font's glyph advance (JetBrains Mono: 0.6)
  },

  budget: {
    maxBytes: 1048576, // raw bytes above which the build fails; 0 = no limit
  },
};
