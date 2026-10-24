// Bundled figlet fonts. `tagline.font` takes one of these names, or a path to
// any .flf (relative to the config file). Each entry carries the defaults a
// null `tagline.layout` / `tagline.shadowGlyphs` falls back to:
//   file          the .flf, relative to the package root
//   shadowGlyphs  figlet glyphs drawn at tagline.shadowAlpha; "" = single tone
//   layout        one of LAYOUTS
//   notice        provenance and licence, relative to the package root
import { fileURLToPath } from "node:url";

/**
 * `tagline.layout` values: "full" butts glyphs together at full width, "fit"
 * moves them together until they touch, "smush" one column further where the
 * font's smushing rules (universal smushing if it has none) merge the touching
 * characters, "header" does what the .flf header asks for (figlet's default).
 */
export const LAYOUTS = ["full", "fit", "smush", "header"];

/** What a null layout / shadowGlyphs means for a `tagline.font` given as a path. */
export const PATH_FONT_DEFAULTS = { layout: "header", shadowGlyphs: "" };

const ANSI_SHADOW_NOTICE = "fonts/ANSI-SHADOW-NOTICE.md";
const FIGLET_NOTICE = "fonts/figlet/NOTICE.md";

// One-line licence/source summary per notice file, for `ascii-banner fonts`.
const SOURCES = {
  [ANSI_SHADOW_NOTICE]: "TheDraw font converted by patorjk.com; no explicit licence",
  [FIGLET_NOTICE]: "BSD-3-Clause, official FIGlet distribution (cmatsuoka/figlet)",
};

// The FIGlet fonts draw face and shadow edges with the same ASCII strokes, so
// there is no shadow-only glyph set to dim: they render single tone.
const figletFont = (name) => ({ file: `fonts/figlet/${name}.flf`, shadowGlyphs: "", layout: "header", notice: FIGLET_NOTICE });

export const BUNDLED_FONTS = {
  // Full width by default: the default banner is tuned to it (its header asks
  // for fitting; layout "fit" gives figlet's own spacing).
  "ansi-shadow": { file: "fonts/ansi-shadow.flf", shadowGlyphs: "═║╔╗╚╝", layout: "full", notice: ANSI_SHADOW_NOTICE },
  standard: figletFont("standard"),
  big: figletFont("big"),
  slant: figletFont("slant"),
  small: figletFont("small"),
  shadow: figletFont("shadow"),
  block: figletFont("block"),
  lean: figletFont("lean"),
  mini: figletFont("mini"),
  script: figletFont("script"),
  digital: figletFont("digital"),
  banner: figletFont("banner"),
  bubble: figletFont("bubble"),
  smslant: figletFont("smslant"),
  smshadow: figletFont("smshadow"),
  smscript: figletFont("smscript"),
};

/** Absolute path of a package-relative file. */
export const packagePath = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

export const isBundledFont = (name) => Object.hasOwn(BUNDLED_FONTS, name);

/** Registry entries in listing order, with the absolute .flf path and a source one-liner. */
export const listFonts = () =>
  Object.entries(BUNDLED_FONTS).map(([name, f]) => ({ name, ...f, path: packagePath(f.file), source: SOURCES[f.notice] }));
