// Config: DEFAULTS (the original generator's knobs, verbatim) and
// resolveConfig(), which deep-merges a user config over them, rejects unknown
// keys and checks types/ranges so a typo fails loudly instead of rendering
// something subtly wrong.
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_FONTS, LAYOUTS, PATH_FONT_DEFAULTS, isBundledFont, packagePath } from "./fonts.mjs";
import { FIELD_PRESETS } from "./fields/index.mjs";
import { REVEAL_PRESETS } from "./reveals/index.mjs";

const fontsDir = (name) => fileURLToPath(new URL(`../fonts/${name}`, import.meta.url));

/** Bundled assets. Bundled figlet fonts: see fonts.mjs. */
export const BUNDLED_FONT = fontsDir("jetbrains-mono.woff2");
export const BUNDLED_GLYPHS = fontsDir("glyphs.txt");

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
    font: "ansi-shadow", // bundled figlet font name (fonts.mjs), or a path to any .flf
    // "full" | "fit" | "smush" | "header" (as the .flf header says); null = the
    // bundled font's default ("full" for ansi-shadow), "header" for a path
    layout: null,
    // figlet glyphs drawn at shadowAlpha; every other one is solid. null = the
    // bundled font's set (ansi-shadow: "═║╔╗╚╝"), "" (single tone) for a path
    shadowGlyphs: null,
  },
  reveal: {
    preset: "scramble", // how a line appears: a REVEAL_PRESETS name (reveals/index.mjs)
    seconds: 2.2, // seconds a line spends revealing
    hold: 5.8, // seconds a settled line holds before the next one starts
    fps: 20, // step rate of stepped reveals; scramble reads as noise below ~15
    // The preset's own knobs, merged over its defaults (reveals/<preset>.mjs).
    // The legacy top-level `decode: {...}` maps to preset "scramble".
    options: {},
  },
  field: {
    fontSize: 14, // field glyph font-size, px
    rowPitch: 16, // row pitch, px
    fps: 10, // flipbook rate; steps the field about half a column per flip,
    // the finest motion the character grid can express
    loopSeconds: 20, // loop length — wave speeds are integer cycles per loop, so the seam is exact
    stillAt: 7, // second of the loop shown under prefers-reduced-motion
    alpha: { lo: 0.3, hi: 0.95 }, // field alpha across the ramp
    // Alpha bands the ramp levels fold into: 3 = lo / mid / hi, 2 = lo / hi,
    // 1 = everything at hi. null = the preset's default.
    bands: null,
    // Brightness ramp, dim → bright: levels separated by spaces, the characters
    // of one level are interchangeable variants (so bands don't degrade into
    // rings of one character). An empty level 0 is implicit. null = the
    // preset's default ramp.
    ramp: null,
    gamma: 1.35, // >1 deepens the dark side of the gradient (presets only)
    // 0 = quantise with a little per-cell jitter; 2 / 4 / 8 = ordered (Bayer)
    // dither of that matrix size, so gradients become regular patterns.
    dither: 0,
    // Brightness field: a preset from src/fields/ (waves, stars, rain, …) and
    // its options, merged over the preset's defaults. Legacy field.waves and
    // field.drive are still accepted as aliases of the waves options.
    preset: "waves",
    options: {},
    // Optional (x, y, t) => brightness in [0, 1] replacing the preset;
    // x, y = cell centre in px, t = seconds into the loop. Make it periodic
    // in t over loopSeconds or the loop seam will jump.
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

// Keys whose default is null, with the types they may hold instead.
const NULLABLE = {
  "field.sample": "function",
  "field.ramp": "string",
  "field.bands": "number",
  "font.file": "string",
  "tagline.layout": "string",
  "tagline.shadowGlyphs": "string",
};

// Pre-preset field keys, now options of LEGACY_PRESET; still accepted on `field`.
const LEGACY_PRESET = "waves";
const LEGACY_FIELD_KEYS = ["waves", "drive"];
const FIELD_BANDS = [1, 2, 3];
const DITHER_SIZES = [0, 2, 4, 8];

// C0 controls other than tab/LF/CR, and DEL: XML 1.0 forbids the former.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function merge(def, user, path) {
  if (user === undefined) return structuredCloneSafe(def);
  if (isObj(def)) {
    if (!isObj(user)) throw new ConfigError(`${path || "config"}: expected an object, got ${describe(user)}`);
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

const structuredCloneSafe = (v) => (typeof v === "function" ? v : structuredClone(v));
const describe = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "string" ? JSON.stringify(v) : typeof v);

function check(ok, path, msg) {
  if (!ok) throw new ConfigError(`${path}: ${msg}`);
}
const positive = (v, path) => check(v > 0, path, `must be > 0, got ${v}`);
const unit = (v, path) => check(v >= 0 && v <= 1, path, `must be within [0, 1], got ${v}`);
const posInt = (v, path) => check(Number.isInteger(v) && v >= 1, path, `must be an integer >= 1, got ${v}`);

/**
 * The `v` that field and reveal presets alike get in validate(o, v): each
 * helper checks o[key] and throws a ConfigError naming `${path}.${key}`.
 * `extra` adds context a preset needs (field presets get `field`, the resolved
 * field config).
 */
function optionChecks(o, path, extra) {
  const at = (key) => `${path}.${key}`;
  return {
    ...extra,
    check: (ok, key, msg) => check(ok, at(key), msg),
    positive: (key) => positive(o[key], at(key)),
    nonNeg: (key) => check(o[key] >= 0, at(key), `must be >= 0, got ${o[key]}`),
    unit: (key) => unit(o[key], at(key)),
    fraction: (key) => check(o[key] > 0 && o[key] <= 1, at(key), `must be within (0, 1], got ${o[key]}`),
    posInt: (key) => posInt(o[key], at(key)),
    // min: optional lower bound; hint: optional unit for the message, e.g. "cycles per loop"
    int: (key, min, hint) => check(Number.isInteger(o[key]) && (min == null || o[key] >= min), at(key),
      `must be an integer${min == null ? "" : ` >= ${min}`}${hint ? ` (${hint})` : ""}, got ${o[key]}`),
    oneOf: (key, values) => check(values.includes(o[key]), at(key),
      `must be one of ${values.map((x) => JSON.stringify(x)).join(", ")}, got ${JSON.stringify(o[key])}`),
  };
}

/**
 * Pull the reveal options out of a user config (they merge over the chosen
 * preset's defaults, not over DEFAULTS) and map the legacy top-level
 * `decode: {...}` to preset "scramble": seconds/hold/fps → reveal, the rest →
 * options. Returns the config without options, the options and their path.
 */
function splitReveal(user) {
  if (!isObj(user)) return { rest: user, options: undefined, optionsPath: "reveal.options" };
  const { decode, ...rest } = user;
  if (decode !== undefined) {
    if (user.reveal !== undefined) throw new ConfigError('give either "reveal" or the legacy "decode", not both');
    if (!isObj(decode)) throw new ConfigError(`decode: expected an object, got ${describe(decode)}`);
    const { seconds, hold, fps, ...options } = decode;
    const timing = Object.fromEntries(Object.entries({ seconds, hold, fps }).filter(([, v]) => v !== undefined));
    return { rest: { ...rest, reveal: { preset: "scramble", ...timing } }, options, optionsPath: "decode" };
  }
  if (!isObj(user.reveal)) return { rest: user, options: undefined, optionsPath: "reveal.options" };
  const { options, ...reveal } = user.reveal;
  return { rest: { ...user, reveal }, options, optionsPath: "reveal.options" };
}

/** Merge reveal options over the preset's defaults, then range-check them. */
function revealOptions(preset, user, path) {
  const { defaults, validate } = REVEAL_PRESETS[preset];
  if (user !== undefined && !isObj(user)) throw new ConfigError(`${path}: expected an object, got ${describe(user)}`);
  for (const key of Object.keys(user ?? {}))
    if (!Object.hasOwn(defaults, key))
      throw new ConfigError(
        `unknown option "${path}.${key}" for reveal preset "${preset}" ` +
        `(it takes ${Object.keys(defaults).join(", ") || "no options"})`,
      );
  const o = merge(defaults, user, path);
  validate?.(o, optionChecks(o, path));
  return o;
}

/** Split the ramp string into levels; level 0 (empty) is implicit. */
export function parseRamp(ramp) {
  return [[], ...ramp.trim().split(/\s+/).filter(Boolean).map((lv) => [...lv])];
}

/**
 * field.options merged over the preset's defaults with merge()'s rules, plus
 * the legacy field.waves / field.drive aliases; then the preset's own checks.
 */
function presetOptions(name, user, legacy, field) {
  const preset = FIELD_PRESETS[name];
  const path = "field.options";
  if (user !== undefined && !isObj(user)) throw new ConfigError(`${path}: expected an object, got ${describe(user)}`);
  const opts = { ...user };
  for (const key of LEGACY_FIELD_KEYS) {
    if (legacy[key] === undefined) continue;
    check(name === LEGACY_PRESET, `field.${key}`,
      `is a legacy alias of the "${LEGACY_PRESET}" preset's options; for field.preset "${name}" use field.options`);
    check(!Object.hasOwn(opts, key), `field.${key}`, `given both as field.${key} (legacy) and ${path}.${key}; keep one`);
    opts[key] = legacy[key];
  }
  for (const key of Object.keys(opts))
    check(Object.hasOwn(preset.defaults, key), `${path}.${key}`,
      `unknown option for preset "${name}" (it takes ${Object.keys(preset.defaults).join(", ")})`);
  const out = merge(preset.defaults, opts, path);
  preset.validate?.(out, optionChecks(out, path, { field }));
  return out;
}

/**
 * Deep-merge `user` over DEFAULTS and validate. Relative paths (font.file,
 * tagline.font) resolve against `baseDir` (default: cwd).
 */
export function resolveConfig(user = {}, { baseDir = process.cwd() } = {}) {
  // field.options depend on the chosen preset and the legacy waves keys alias
  // into them, so both skip the generic merge and resolve below.
  const userField = isObj(user) && isObj(user.field) ? user.field : null;
  const { options: userOptions, ...fieldRest } = userField ?? {};
  const legacy = {};
  for (const key of LEGACY_FIELD_KEYS) {
    legacy[key] = fieldRest[key];
    delete fieldRest[key];
  }
  // reveal.options (or the legacy decode block) likewise resolve against their preset.
  const { rest, options, optionsPath } = splitReveal(userField ? { ...user, field: fieldRest } : user);
  const c = merge(DEFAULTS, rest, "");

  positive(c.size.width, "size.width");
  positive(c.size.height, "size.height");
  check(/^#[0-9a-fA-F]{6}$/.test(c.accent), "accent", `must be a #rrggbb hex colour, got ${JSON.stringify(c.accent)}`);
  c.taglines.forEach((t, i) => {
    check(typeof t === "string" && t.trim() !== "", `taglines[${i}]`, `must be a non-empty string, got ${describe(t)}`);
    check(!CONTROL_CHARS.test(t), `taglines[${i}]`, `must not contain control characters (not allowed in XML), got ${describe(t)}`);
  });

  const t = c.tagline;
  positive(t.fill, "tagline.fill");
  positive(t.maxHeight, "tagline.maxHeight");
  positive(t.lineHeight, "tagline.lineHeight");
  unit(t.shadowAlpha, "tagline.shadowAlpha");
  check(t.knockout >= 0, "tagline.knockout", `must be >= 0, got ${t.knockout}`);
  check(t.font !== "", "tagline.font", "must name a bundled figlet font or a .flf path");
  check(t.layout === null || LAYOUTS.includes(t.layout), "tagline.layout",
    `must be one of ${LAYOUTS.map((l) => JSON.stringify(l)).join(", ")} or null, got ${describe(t.layout)}`);

  const d = c.reveal;
  const dp = optionsPath === "decode" ? "decode" : "reveal"; // name the key the user wrote
  check(Object.hasOwn(REVEAL_PRESETS, d.preset), "reveal.preset",
    `must be one of ${Object.keys(REVEAL_PRESETS).map((n) => JSON.stringify(n)).join(", ")}, got ${JSON.stringify(d.preset)}`);
  positive(d.seconds, `${dp}.seconds`);
  check(d.hold >= 0, `${dp}.hold`, `must be >= 0, got ${d.hold}`);
  positive(d.fps, `${dp}.fps`);
  check(Math.round(d.seconds * d.fps) >= 1, `${dp}.fps`,
    `seconds × fps must round to at least one reveal tick, got ${d.seconds * d.fps}`);
  d.options = revealOptions(d.preset, options, optionsPath);

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
  f.options = presetOptions(f.preset, userOptions, legacy, f);
  // null picks the preset's default; resolved in place so a resolved config resolves to itself
  if (f.ramp === null) f.ramp = FIELD_PRESETS[f.preset].ramp;
  if (f.bands === null) f.bands = FIELD_PRESETS[f.preset].bands;
  check(parseRamp(f.ramp).length >= 2, "field.ramp", "needs at least one level of glyphs");
  check(FIELD_BANDS.includes(f.bands), "field.bands", `must be one of ${FIELD_BANDS.join(", ")} (or null), got ${f.bands}`);
  check(DITHER_SIZES.includes(f.dither), "field.dither", `must be one of ${DITHER_SIZES.join(", ")}, got ${f.dither}`);
  positive(f.gamma, "field.gamma");

  positive(c.font.advance, "font.advance");
  check(Number.isInteger(c.budget.maxBytes) && c.budget.maxBytes >= 0, "budget.maxBytes", `must be an integer >= 0, got ${c.budget.maxBytes}`);

  // Paths become absolute in place, so a resolved config resolves to itself.
  const abs = (p) => (isAbsolute(p) ? p : resolve(baseDir, p));
  if (c.font.file !== null) c.font.file = abs(c.font.file);
  // A registry name wins over a same-named file; null layout/shadowGlyphs take the font's defaults.
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
