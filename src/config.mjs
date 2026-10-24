// DEFAULTS and resolveConfig(), which deep-merges a user config over them,
// rejects unknown keys and checks types and ranges: a typo fails loudly instead
// of rendering something subtly wrong. Preset options (field.options,
// reveal.options) merge over their preset's defaults, not over DEFAULTS.
import { isAbsolute, resolve } from "node:path";
import { BUNDLED_FONTS, LAYOUTS, PATH_FONT_DEFAULTS, isBundledFont, packagePath } from "./fonts.mjs";
import { FIELD_PRESETS } from "./fields/index.mjs";
import { REVEAL_PRESETS } from "./reveals/index.mjs";

/** The embedded JetBrains Mono subset and the characters it covers. */
export const BUNDLED_FONT = packagePath("fonts/jetbrains-mono.woff2");
export const BUNDLED_GLYPHS = packagePath("fonts/glyphs.txt");

/** A problem the user can fix in their config or invocation (CLI exit 1). */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

export const DEFAULTS = {
  // viewBox size; README scales it down responsively
  size: { width: 880, height: 240 },
  // the only hue: field, taglines and shadows are all this colour at different alphas
  accent: "#E62D42",
  // rotation order; [] for a pure field
  taglines: ["hello world", "ascii banner", "make it yours"],
  tagline: {
    fill: 0.92, // the widest tagline spans at most this fraction of the width...
    maxHeight: 0.34, // ...and the letters at most this fraction of the height — short
    // lines would otherwise grow until the knockout swallows the field
    lineHeight: 1.2, // tagline row pitch, em; █ spans -0.3..1.02em so ≤1.32 stays seamless
    shadowAlpha: 0.5, // alpha of the shadow strokes vs solid blocks
    knockout: 6, // stroke px the field is cleared around the letters; 0 = off
    font: "ansi-shadow", // BUNDLED_FONTS name, or a path to any .flf
    layout: null, // one of LAYOUTS; null = the font's default
    shadowGlyphs: null, // figlet glyphs drawn at shadowAlpha; null = the font's default
  },
  reveal: {
    preset: "scramble", // REVEAL_PRESETS name
    seconds: 2.2, // seconds a line spends revealing
    hold: 5.8, // seconds a settled line holds before the next one starts
    fps: 20, // step rate of stepped reveals; scramble reads as noise below ~15
    // Merged over the preset's defaults. A top-level `decode: {...}` is the
    // legacy spelling of preset "scramble" with these options.
    options: {},
  },
  field: {
    fontSize: 14, // field glyph font-size, px
    rowPitch: 16, // row pitch, px
    fps: 10, // flipbook rate; about half a column of motion per flip, the finest the grid can show
    loopSeconds: 20, // loop length — wave speeds are integer cycles per loop, so the seam is exact
    stillAt: 7, // second of the loop shown under prefers-reduced-motion
    alpha: { lo: 0.3, hi: 0.95 }, // field alpha across the ramp
    bands: null, // alpha bands the ramp folds into: 3 = lo / mid / hi, 2 = lo / hi, 1 = hi; null = the preset's
    // Brightness ramp, dim → bright: space-separated levels whose characters are
    // interchangeable, so bands don't degrade into rings of one character.
    // Level 0 (empty) is implicit; null = the preset's ramp.
    ramp: null,
    gamma: 1.35, // >1 deepens the dark side of the gradient (presets only)
    dither: 0, // 0 = quantise with a little per-cell jitter; 2 / 4 / 8 = Bayer matrix size
    preset: "waves", // FIELD_PRESETS name
    // Merged over the preset's defaults. field.waves and field.drive are legacy
    // aliases of the waves options.
    options: {},
    // (x, y, t) => brightness in [0, 1] replacing the preset; x, y = cell centre
    // in px, t = seconds into the loop. Periodic in t over loopSeconds, or the seam jumps.
    sample: null,
  },
  font: {
    file: null, // null = bundled JetBrains Mono subset; or a path to your own .woff2
    advance: 0.6, // glyph advance in em (JetBrains Mono = 0.6); sets the column pitch
  },
  budget: {
    maxBytes: 1048576, // fail the build above this many raw bytes; 0 = no limit
  },
};

// Keys whose default is null, with the type they may hold instead.
const NULLABLE = {
  "field.sample": "function",
  "field.ramp": "string",
  "field.bands": "number",
  "font.file": "string",
  "tagline.layout": "string",
  "tagline.shadowGlyphs": "string",
};

// C0 controls other than tab, LF and CR, and DEL: XML 1.0 forbids the former.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const describe = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "string" ? JSON.stringify(v) : typeof v);

function check(ok, path, msg) {
  if (!ok) throw new ConfigError(`${path}: ${msg}`);
}
const expectObject = (v, path) => check(isObj(v), path, `expected an object, got ${describe(v)}`);
const positive = (v, path) => check(v > 0, path, `must be > 0, got ${v}`);
const nonNeg = (v, path) => check(v >= 0, path, `must be >= 0, got ${v}`);
const unit = (v, path) => check(v >= 0 && v <= 1, path, `must be within [0, 1], got ${v}`);
const fraction = (v, path) => check(v > 0 && v <= 1, path, `must be within (0, 1], got ${v}`);
const int = (v, path, min, hint) =>
  check(Number.isInteger(v) && (min == null || v >= min), path,
    `must be an integer${min == null ? "" : ` >= ${min}`}${hint ? ` (${hint})` : ""}, got ${v}`);
const oneOf = (v, path, values) =>
  check(values.includes(v), path, `must be one of ${values.map((x) => JSON.stringify(x)).join(", ")}, got ${JSON.stringify(v)}`);

/** `user` deep-merged over `def`. Arrays and NULLABLE values replace the default whole. */
function merge(def, user, path) {
  if (user === undefined) return typeof def === "function" ? def : structuredClone(def);
  if (isObj(def)) {
    expectObject(user, path || "config");
    for (const key of Object.keys(user))
      if (!Object.hasOwn(def, key)) throw new ConfigError(`unknown config key "${path ? `${path}.` : ""}${key}"`);
    const out = {};
    for (const key of Object.keys(def)) out[key] = merge(def[key], user[key], path ? `${path}.${key}` : key);
    return out;
  }
  if (def === null) {
    if (user !== null && typeof user !== NULLABLE[path])
      throw new ConfigError(`${path}: expected ${NULLABLE[path]} or null, got ${describe(user)}`);
    return user;
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(user)) throw new ConfigError(`${path}: expected an array, got ${describe(user)}`);
    return user;
  }
  if (typeof user !== typeof def) throw new ConfigError(`${path}: expected ${typeof def}, got ${describe(user)}`);
  if (typeof def === "number" && !Number.isFinite(user)) throw new ConfigError(`${path}: expected a finite number, got ${user}`);
  return user;
}

/**
 * The `v` of a preset's validate(o, v): checks of o[key] that throw a
 * ConfigError naming `${path}.${key}`. Field presets also get v.field, the
 * resolved field config.
 */
function optionChecks(o, path, extra) {
  const at = (key) => `${path}.${key}`;
  return {
    ...extra,
    check: (ok, key, msg) => check(ok, at(key), msg),
    positive: (key) => positive(o[key], at(key)),
    nonNeg: (key) => nonNeg(o[key], at(key)),
    unit: (key) => unit(o[key], at(key)),
    fraction: (key) => fraction(o[key], at(key)),
    posInt: (key) => int(o[key], at(key), 1),
    int: (key, min, hint) => int(o[key], at(key), min, hint),
    oneOf: (key, values) => oneOf(o[key], at(key), values),
  };
}

/** `user` merged over a preset's defaults, then its validate(o, v). `unknown(key, takes)` words a stray key's error. */
function presetOptions({ defaults, validate }, user, path, unknown, extra) {
  if (user !== undefined) expectObject(user, path);
  const takes = Object.keys(defaults).join(", ");
  for (const key of Object.keys(user ?? {})) if (!Object.hasOwn(defaults, key)) throw new ConfigError(unknown(key, takes));
  const o = merge(defaults, user, path);
  validate?.(o, optionChecks(o, path, extra));
  return o;
}

// Preset options leave the user config before the generic merge, along with
// their legacy spellings: field.waves / field.drive (options of preset "waves")
// and a top-level `decode: {...}` (preset "scramble"; its seconds, hold and fps
// belong to reveal).
function splitField(user) {
  if (!isObj(user) || !isObj(user.field)) return { rest: user, aliases: {} };
  const { options, waves, drive, ...field } = user.field;
  return { rest: { ...user, field }, options, aliases: { waves, drive } };
}

function splitReveal(user) {
  if (!isObj(user)) return { rest: user, path: "reveal.options" };
  const { decode, ...rest } = user;
  if (decode !== undefined) {
    if (user.reveal !== undefined) throw new ConfigError('give either "reveal" or the legacy "decode", not both');
    expectObject(decode, "decode");
    const { seconds, hold, fps, ...options } = decode;
    const timing = Object.fromEntries(Object.entries({ seconds, hold, fps }).filter(([, v]) => v !== undefined));
    return { rest: { ...rest, reveal: { preset: "scramble", ...timing } }, options, path: "decode" };
  }
  if (!isObj(user.reveal)) return { rest: user, path: "reveal.options" };
  const { options, ...reveal } = user.reveal;
  return { rest: { ...user, reveal }, options, path: "reveal.options" };
}

/** field.options with the legacy aliases folded in; they only apply to preset "waves". */
function withAliases(preset, options, aliases) {
  if (options !== undefined) expectObject(options, "field.options");
  const o = { ...options };
  for (const [key, value] of Object.entries(aliases)) {
    if (value === undefined) continue;
    check(preset === "waves", `field.${key}`,
      `is a legacy alias of the "waves" preset's options; for field.preset "${preset}" use field.options`);
    check(!Object.hasOwn(o, key), `field.${key}`, `given both as field.${key} (legacy) and field.options.${key}; keep one`);
    o[key] = value;
  }
  return o;
}

/** Split the ramp string into levels; level 0 (empty) is implicit. */
export function parseRamp(ramp) {
  return [[], ...ramp.trim().split(/\s+/).filter(Boolean).map((lv) => [...lv])];
}

/**
 * Deep-merge `user` over DEFAULTS and validate. Relative paths (font.file,
 * tagline.font) resolve against `baseDir`. Nulls with a default are filled in
 * and paths made absolute in place, so a resolved config resolves to itself.
 */
export function resolveConfig(user = {}, { baseDir = process.cwd() } = {}) {
  const field = splitField(user);
  const reveal = splitReveal(field.rest);
  const c = merge(DEFAULTS, reveal.rest, "");

  positive(c.size.width, "size.width");
  positive(c.size.height, "size.height");
  check(/^#[0-9a-fA-F]{6}$/.test(c.accent), "accent", `must be a #rrggbb hex colour, got ${JSON.stringify(c.accent)}`);
  c.taglines.forEach((line, i) => {
    check(typeof line === "string" && line.trim() !== "", `taglines[${i}]`, `must be a non-empty string, got ${describe(line)}`);
    check(!CONTROL_CHARS.test(line), `taglines[${i}]`, `must not contain control characters (not allowed in XML), got ${describe(line)}`);
  });

  const t = c.tagline;
  positive(t.fill, "tagline.fill");
  positive(t.maxHeight, "tagline.maxHeight");
  positive(t.lineHeight, "tagline.lineHeight");
  unit(t.shadowAlpha, "tagline.shadowAlpha");
  nonNeg(t.knockout, "tagline.knockout");
  check(t.font !== "", "tagline.font", "must name a bundled figlet font or a .flf path");
  check(t.layout === null || LAYOUTS.includes(t.layout), "tagline.layout",
    `must be one of ${LAYOUTS.map((l) => JSON.stringify(l)).join(", ")} or null, got ${describe(t.layout)}`);

  const d = c.reveal;
  const at = reveal.path === "decode" ? "decode" : "reveal"; // errors name the key the user wrote
  oneOf(d.preset, "reveal.preset", Object.keys(REVEAL_PRESETS));
  positive(d.seconds, `${at}.seconds`);
  nonNeg(d.hold, `${at}.hold`);
  positive(d.fps, `${at}.fps`);
  check(Math.round(d.seconds * d.fps) >= 1, `${at}.fps`,
    `seconds × fps must round to at least one reveal tick, got ${d.seconds * d.fps}`);
  d.options = presetOptions(REVEAL_PRESETS[d.preset], reveal.options, reveal.path, (key, takes) =>
    `unknown option "${reveal.path}.${key}" for reveal preset "${d.preset}" (it takes ${takes || "no options"})`);

  const f = c.field;
  positive(f.fontSize, "field.fontSize");
  positive(f.rowPitch, "field.rowPitch");
  check(f.rowPitch <= c.size.height, "field.rowPitch", `must fit at least one row into size.height (${c.size.height})`);
  positive(f.fps, "field.fps");
  positive(f.loopSeconds, "field.loopSeconds");
  check(Number.isInteger(f.fps * f.loopSeconds), "field.fps", `fps × loopSeconds must be a whole frame count, got ${f.fps * f.loopSeconds}`);
  check(f.stillAt >= 0 && f.stillAt < f.loopSeconds, "field.stillAt",
    `must be within [0, loopSeconds) = [0, ${f.loopSeconds}), got ${f.stillAt}`);
  unit(f.alpha.lo, "field.alpha.lo");
  unit(f.alpha.hi, "field.alpha.hi");
  check(Object.hasOwn(FIELD_PRESETS, f.preset), "field.preset",
    `must be one of ${Object.keys(FIELD_PRESETS).join(", ")}; got ${describe(f.preset)}`);
  f.options = presetOptions(FIELD_PRESETS[f.preset], withAliases(f.preset, field.options, field.aliases), "field.options",
    (key, takes) => `field.options.${key}: unknown option for preset "${f.preset}" (it takes ${takes})`, { field: f });
  f.ramp ??= FIELD_PRESETS[f.preset].ramp;
  f.bands ??= FIELD_PRESETS[f.preset].bands;
  check(parseRamp(f.ramp).length >= 2, "field.ramp", "needs at least one level of glyphs");
  check([1, 2, 3].includes(f.bands), "field.bands", `must be one of 1, 2, 3 (or null), got ${f.bands}`);
  oneOf(f.dither, "field.dither", [0, 2, 4, 8]);
  positive(f.gamma, "field.gamma");

  positive(c.font.advance, "font.advance");
  int(c.budget.maxBytes, "budget.maxBytes", 0);

  const abs = (p) => (isAbsolute(p) ? p : resolve(baseDir, p));
  if (c.font.file !== null) c.font.file = abs(c.font.file);
  // A registry name wins over a same-named file.
  const fontDefaults = isBundledFont(t.font) ? BUNDLED_FONTS[t.font] : PATH_FONT_DEFAULTS;
  if (!isBundledFont(t.font)) t.font = abs(t.font);
  t.layout ??= fontDefaults.layout;
  t.shadowGlyphs ??= fontDefaults.shadowGlyphs;
  return c;
}

/** Absolute paths of the font files a resolved config draws with. */
export const assetPaths = (c) => ({
  font: c.font.file ?? BUNDLED_FONT,
  fontBundled: c.font.file === null,
  flf: isBundledFont(c.tagline.font) ? packagePath(BUNDLED_FONTS[c.tagline.font].file) : c.tagline.font,
});
