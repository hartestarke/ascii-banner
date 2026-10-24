// Config: DEFAULTS (the original generator's knobs, verbatim) and
// resolveConfig(), which deep-merges a user config over them, rejects unknown
// keys and checks types/ranges so a typo fails loudly instead of rendering
// something subtly wrong.
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_FONTS, LAYOUTS, PATH_FONT_DEFAULTS, isBundledFont, packagePath } from "./fonts.mjs";

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
  decode: {
    seconds: 2.2, // seconds a line spends decoding
    hold: 5.8, // seconds a settled line holds before the next one starts
    fps: 20, // decode step rate; reads as noise below ~15
    noiseFrames: 6, // distinct scramble frames cycled during decode
    lead: 16, // tagline columns of scramble running ahead of the settled text
    leadVar: 0.35, // per-row spread of lead, as a fraction of it
    rag: 3, // columns a row's front may stray either side of the mean front
    ragTicks: 3, // decode ticks between a row's wander knots; lower = twitchier
    burst: 0.85, // pace jitter of the mean front: 0 = even, 1 = from a stall to a double step
    noiseAlpha: 0.65, // alpha of not-yet-decoded glyphs
  },
  field: {
    fontSize: 14, // field glyph font-size, px
    rowPitch: 16, // row pitch, px
    fps: 10, // flipbook rate; steps the field about half a column per flip,
    // the finest motion the character grid can express
    loopSeconds: 20, // loop length — wave speeds are integer cycles per loop, so the seam is exact
    stillAt: 7, // second of the loop shown under prefers-reduced-motion
    alpha: { lo: 0.3, hi: 0.95 }, // field alpha across the ramp
    // Brightness ramp, dim → bright: levels separated by spaces, the characters
    // of one level are interchangeable variants (so bands don't degrade into
    // rings of one character). An empty level 0 is implicit.
    ramp: ":. !/ \\| 1? 7* 25 %0 &# 8@",
    // Liquid-gradient field: a few plane waves, each under one period across
    // the banner and pointed in different directions, interfere into one or
    // two giant soft lobes. fx/fy are cycles per banner WIDTH on both axes
    // (pixel-isotropic — per-axis normalisation on a 4:1 banner squashes the
    // lobes flat); k is integer cycles per loop, which keeps the seam exact.
    // Keep every k distinct — components sharing a speed freeze into a shape
    // that merely translates; k=0 is legal.
    waves: [
      { fx: 0.75, fy: 0.55, k: 1 },
      { fx: -0.35, fy: 0.95, k: -1 },
      { fx: 0.95, fy: -0.4, k: 0 },
    ],
    gamma: 1.35, // >1 deepens the dark side of the gradient
    drive: 2.4, // a sum of 3 sines rarely hits ±3; dividing by less (with a
    // clamp) restores saturated highlights and deep troughs
    // Optional (x, y, t) => brightness in [0, 1] replacing the wave sum;
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
const NULLABLE = { "field.sample": "function", "font.file": "string", "tagline.layout": "string", "tagline.shadowGlyphs": "string" };

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

/** Split the ramp string into levels; level 0 (empty) is implicit. */
export function parseRamp(ramp) {
  return [[], ...ramp.trim().split(/\s+/).filter(Boolean).map((lv) => [...lv])];
}

/**
 * Deep-merge `user` over DEFAULTS and validate. Relative paths (font.file,
 * tagline.font) resolve against `baseDir` (default: cwd).
 */
export function resolveConfig(user = {}, { baseDir = process.cwd() } = {}) {
  const c = merge(DEFAULTS, user, "");

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

  const d = c.decode;
  positive(d.seconds, "decode.seconds");
  check(d.hold >= 0, "decode.hold", `must be >= 0, got ${d.hold}`);
  positive(d.fps, "decode.fps");
  check(Math.round(d.seconds * d.fps) >= 1, "decode.fps",
    `seconds × fps must round to at least one decode tick, got ${d.seconds * d.fps}`);
  posInt(d.noiseFrames, "decode.noiseFrames");
  positive(d.lead, "decode.lead");
  check(d.leadVar >= 0 && d.leadVar < 1, "decode.leadVar", `must be within [0, 1), got ${d.leadVar}`);
  check(d.rag >= 0, "decode.rag", `must be >= 0, got ${d.rag}`);
  posInt(d.ragTicks, "decode.ragTicks");
  unit(d.burst, "decode.burst");
  unit(d.noiseAlpha, "decode.noiseAlpha");

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
  check(parseRamp(f.ramp).length >= 2, "field.ramp", "needs at least one level of glyphs");
  check(f.waves.length > 0 || f.sample, "field.waves", "needs at least one wave (or a field.sample function)");
  f.waves.forEach((w, i) => {
    const p = `field.waves[${i}]`;
    check(isObj(w), p, `expected { fx, fy, k }, got ${describe(w)}`);
    for (const k of Object.keys(w)) check(["fx", "fy", "k"].includes(k), `${p}.${k}`, "unknown config key");
    check(Number.isFinite(w.fx) && Number.isFinite(w.fy), p, "fx and fy must be finite numbers");
    check(Number.isInteger(w.k), `${p}.k`, `must be an integer (cycles per loop) or the loop seam jumps, got ${w.k}`);
  });
  positive(f.gamma, "field.gamma");
  positive(f.drive, "field.drive");

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
