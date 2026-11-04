// DEFAULTS and resolveConfig(), which deep-merges a user config over them,
// rejects unknown keys and checks types and ranges: a typo fails loudly instead
// of rendering something subtly wrong. Preset options (field.options,
// reveal.options) merge over their preset's defaults, not over DEFAULTS.
import { isAbsolute, resolve } from "node:path";
import { BUNDLED_FONTS, LAYOUTS, PATH_FONT_DEFAULTS, isBundledFont, packagePath } from "./fonts.mjs";
import { FIELD_PRESETS } from "./fields/index.mjs";
import { GLYPH_SETS } from "./glyphsets.mjs";
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

/** size.height of a canvas as tall as its laid-out blocks. */
export const AUTO = "auto";
/** px, the header's (taglines over the field) height when tagline.height is null, unless it fills a card-less canvas. */
export const HEADER_HEIGHT = 240;
/** The keyword widths of the header and of a card; any other width is px. */
const BLOCK_WIDTHS = ["full", "half"];

export const DEFAULTS = {
  // viewBox size; README scales it down responsively. height: AUTO = as tall as
  // the blocks (header and cards) laid out; px = a fixed canvas they must fit.
  size: { width: 880, height: AUTO },
  // the base hue: field, taglines and shadows are all this colour at different
  // alphas unless field.colors / field.gradient / tagline.color say otherwise
  accent: "#E62D42",
  // rotation order; [] for a pure field
  taglines: ["hello world", "ascii banner", "make it yours"],
  tagline: {
    fill: 0.92, // the widest tagline spans at most this fraction of the width...
    maxHeight: 0.34, // ...and the letters at most this fraction of the height — short
    // lines would otherwise grow until the knockout swallows the field
    x: 0.5, // centre of each tagline as a fraction of the width; a line that would cross an edge stops a column short
    lineHeight: 1.2, // tagline row pitch, em; █ spans -0.3..1.02em so ≤1.32 stays seamless
    shadowAlpha: 0.5, // alpha of the shadow strokes vs solid blocks
    color: null, // #rrggbb of the letters and of whatever the reveal draws with them; null = accent
    shadowColor: null, // #rrggbb of the shadow strokes, still at shadowAlpha; null = tagline.color
    knockout: 6, // stroke px the field is cleared around the letters; 0 = off
    font: "ansi-shadow", // BUNDLED_FONTS name, or a path to any .flf
    layout: null, // one of LAYOUTS; null = the font's default
    shadowGlyphs: null, // figlet glyphs drawn at shadowAlpha; null = the font's default
    width: "full", // the header block: "full", "half" or px
    // px; null = HEADER_HEIGHT, or the whole canvas when there are no cards and size.height is px,
    // or 0 (no header) when there are cards and no taglines
    height: null,
  },
  reveal: {
    preset: "scramble", // REVEAL_PRESETS name; "none" = each line shown settled for its slot
    seconds: 2.2, // seconds a line spends revealing
    hold: 5.8, // seconds a settled line holds before the next one starts
    fps: 20, // step rate of stepped reveals; scramble reads as noise below ~15
    pool: null, // glyphs of the scramble / decrypt / glitch noise: a GLYPH_SETS name or your own string; null = the field's ramp
    // Merged over the preset's defaults. A top-level `decode: {...}` is the
    // legacy spelling of preset "scramble" with these options.
    options: {},
  },
  field: {
    fontSize: 14, // field glyph font-size, px
    rowPitch: 16, // row pitch, px
    fps: 10, // flipbook rate; about half a column of motion per flip, the finest the grid can show; 0 = one still frame at stillAt
    loopSeconds: 20, // loop length — wave speeds are integer cycles per loop, so the seam is exact
    stillAt: 7, // second of the loop shown under prefers-reduced-motion
    alpha: { lo: 0.3, hi: 0.95 }, // field alpha across the ramp
    colors: null, // 1–3 #rrggbb, dim band → bright band, the last one filling the rest; null = [accent]
    gradient: null, // 2–8 #rrggbb stops spread left → right over the width, in place of colors
    bands: null, // alpha bands the ramp folds into: 3 = lo / mid / hi, 2 = lo / hi, 1 = hi; null = the preset's
    // Brightness ramp, dim → bright: space-separated levels whose characters are
    // interchangeable, so bands don't degrade into rings of one character.
    // Level 0 (empty) is implicit. A GLYPH_SETS name stands for its ramp; null = the preset's ramp.
    ramp: null,
    gamma: null, // >1 deepens the dark side of the gradient (presets only); null = the preset's, 1.35 unless it sets one
    dither: 0, // 0 = quantise with a little per-cell jitter; 2 / 4 / 8 = Bayer matrix size
    // "ramp" = one ramp glyph per cell; "half" = each cell split into a top and
    // a bottom sample drawn as ▀ ▄ █, each its own pixel: twice the resolution,
    // no ramp. Block rows must overlap by at least 1 px (Firefox snaps each row
    // to whole device pixels and opens hairline gaps otherwise): rowPitch ≤
    // fontSize × font.blockHeight − 1. The bundled font at fontSize 10, rowPitch
    // 12 gives square 6 × 6 px samples.
    cells: "ramp",
    preset: "waves", // FIELD_PRESETS name, or "none" (NO_FIELD) for taglines only
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
    blockHeight: 1.32, // full block █ height in em (JetBrains Mono = 1.32); field.cells "half" bounds rowPitch by it
  },
  budget: {
    // fail the build above this many raw bytes; null = 1 MiB per 240 px of the
    // canvas height (src/index.mjs AUTO_BUDGET), 0 = no limit
    maxBytes: null,
  },
  // The snapshot of every card that `ascii-banner fetch` takes of GitHub and
  // `build` reads, relative to this config.
  data: "banner.data.json",
  // Info cards inside the banner, each an object of CARD_DEFAULTS keys, laid
  // out after the header in rows (src/blocks.mjs).
  cards: [],
};

/** One entry of `cards`: a GitHub user (`user`) or repository (`repo`); exactly one of them. */
export const CARD_DEFAULTS = {
  user: null, // GitHub login: mode "person"
  repo: null, // "owner/name": mode "project"
  title: null, // the header's leading name; null = the name on GitHub, else the login / repo
  rows: [], // your own [key, value] rows, shown before GitHub's
  show: null, // GitHub's rows in order, from CARD_ROWS[mode]; null = all of them
  activity: null, // mode "person", the last year: "sparkline" (per week), "calendar" (per day, as on GitHub) or "none"; null = sparkline for a person, none for a project
  layout: "dots", // rows as "key ···· value" (value right-aligned) or "colon": "key: value", neofetch's
  // #rrggbb of the values, the handle and the description: a grey that reads
  // on light and dark pages alike; null = the accent, like the keys
  ink: "#7d8590",
  swatches: false, // a row of colour blocks under the rows, as neofetch ends
  portrait: null, // "avatar", "solid" (a turning torus) or "none"; null = avatar for a person, solid for a project
  avatarColors: "accent", // the avatar in four tones of the accent, "natural" (its own colours, 16) or "gray" (8 greys)
  screen: "#0d1117", // #rrggbb behind the portrait, so its light-as-ink tones read on light pages too; null = none
  textSize: 13, // px
  width: "full", // "full", "half" or px (at least CARD_MIN_WIDTH)
  at: null, // { x, y } px: placed there, out of the flow of rows; null = in the flow
  // Under the card the field is "window" (cleared), "dim" (faint) or "cut"
  // (cleared around the card's glyphs, by tagline.knockout px).
  backdrop: "window",
  // How the card comes in: "wave", "drops" or "crystal" (out of the field, as
  // a whole), or line by line: "type" (at a cursor), "decode" (out of noise), "slide" or "glitch".
  // null = "wave", or "type" when there is no field to come out of.
  reveal: null,
  intro: "once", // "once", "loop" (again every `period` s) or "none" (still, shown from the start)
  period: null, // s, one cycle of intro "loop"; null = field.loopSeconds
  delay: null, // s, when the intro starts; null = CARD_DELAY + CARD_STAGGER × the card's index
};

/** The GitHub rows each card mode can show, in their default order. */
export const CARD_ROWS = {
  person: ["uptime", "repos", "languages", "contributions"],
  project: ["release", "license", "stats", "commits", "languages"],
};
/** Card reveals that bring the whole card out of the field; they need one. */
export const FIELD_REVEALS = ["wave", "drops", "crystal"];
const LINE_REVEALS = ["type", "decode", "slide", "glitch"];
export const CARD_REVEALS = [...FIELD_REVEALS, ...LINE_REVEALS];
const CARD_PORTRAITS = ["avatar", "solid", "none"];
const CARD_ACTIVITIES = ["sparkline", "calendar", "none"];
const CARD_INTROS = ["once", "loop", "none"];
const CARD_BACKDROPS = ["window", "dim", "cut"];
const CARD_LAYOUTS = ["dots", "colon"];
const CARD_AVATAR_COLORS = ["accent", "natural", "gray"];
/** px, the narrowest card; the renderer shrinks the portrait below 600 px to keep the text column. */
export const CARD_MIN_WIDTH = 360;
// s: the first card's intro starts at CARD_DELAY, each next one CARD_STAGGER later.
const CARD_DELAY = 1.2;
const CARD_STAGGER = 0.8;
// Card delays are rounded to whole ms, so the stagger's float error never reaches the CSS.
const MS_PER_S = 1000;

/** field.gamma for a preset that sets none. */
export const PRESET_GAMMA = 1.35;
/** Block rows' overlap under field.cells "half": at least MIN px, at most a MAX share of a block. */
const BLOCK_OVERLAP_MIN = 1;
const BLOCK_OVERLAP_MAX = 0.25;

/** field.preset value that draws no field: taglines only, no knockout. */
export const NO_FIELD = "none";

// What field.preset "none" validates field.options, ramp and bands against: no
// options, and the default preset's look, so a null reveal.pool keeps its noise.
const NO_FIELD_PRESET = {
  defaults: {},
  ramp: FIELD_PRESETS[DEFAULTS.field.preset].ramp,
  bands: FIELD_PRESETS[DEFAULTS.field.preset].bands,
};

// Keys whose default is null, with the type they may hold instead. `cards[]`
// stands for every card (`cards[0]`, `cards[1]`, ...).
const NULLABLE = {
  "field.sample": "function",
  "field.ramp": "string",
  "reveal.pool": "string",
  "field.bands": "number",
  "field.gamma": "number",
  "font.file": "string",
  "budget.maxBytes": "number",
  "cards[].user": "string",
  "cards[].repo": "string",
  "cards[].title": "string",
  "cards[].show": "array",
  "cards[].activity": "string",
  "cards[].ink": "string",
  "cards[].portrait": "string",
  "cards[].screen": "string",
  "cards[].at": "object",
  "cards[].period": "number",
  "cards[].delay": "number",
  "cards[].reveal": "string",
  "tagline.height": "number",
  "tagline.layout": "string",
  "tagline.shadowGlyphs": "string",
  "tagline.color": "string",
  "tagline.shadowColor": "string",
  "field.colors": "array",
  "field.gradient": "array",
};
// Keys that hold a keyword or a number of px; resolveConfig checks which.
const KEYWORD_OR_PX = new Set(["size.height", "tagline.width", "cards[].width"]);

// C0 controls other than tab, LF and CR, and DEL: XML 1.0 forbids the former.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const describe = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "string" ? JSON.stringify(v) : typeof v);
/** typeof, with arrays told apart from objects: the type names NULLABLE uses. */
const kind = (v) => (Array.isArray(v) ? "array" : typeof v);

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
const hexColour = (v, path) =>
  check(typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v), path, `must be a #rrggbb hex colour, got ${describe(v)}`);
const plainText = (v, path) =>
  check(!CONTROL_CHARS.test(v), path, `must not contain control characters (not allowed in XML), got ${describe(v)}`);
const colourList = (v, path, min, max) => {
  check(v.length >= min && v.length <= max, path, `must hold ${min} to ${max} #rrggbb colours, got ${v.length}`);
  v.forEach((x, i) => hexColour(x, `${path}[${i}]`));
};
/** A KEYWORD_OR_PX value: one of `keywords`, or a number of px that `px(v)` accepts, as `range` words it. */
const keywordOrPx = (v, path, keywords, px, range) =>
  typeof v === "number"
    ? check(px(v), path, `must be ${range}, got ${v}`)
    : check(keywords.includes(v), path, `must be ${keywords.map((k) => JSON.stringify(k)).join(", ")} or ${range}, got ${describe(v)}`);
const finite = (v, path) => {
  if (typeof v === "number" && !Number.isFinite(v)) throw new ConfigError(`${path}: expected a finite number, got ${v}`);
  return v;
};

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
  const key = path.replace(/\[\d+\]/g, "[]"); // the NULLABLE / KEYWORD_OR_PX name of a card's key
  if (def === null) {
    if (user !== null && kind(user) !== NULLABLE[key])
      throw new ConfigError(`${path}: expected ${NULLABLE[key]} or null, got ${describe(user)}`);
    return finite(user, path);
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(user)) throw new ConfigError(`${path}: expected an array, got ${describe(user)}`);
    return user;
  }
  if (user === null && NULLABLE[key]) return null; // e.g. cards[].screen: null = none
  if (KEYWORD_OR_PX.has(key)) return finite(user, path);
  if (typeof user !== typeof def) throw new ConfigError(`${path}: expected ${typeof def}, got ${describe(user)}`);
  return finite(user, path);
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

// A lone lowercase word is read as a set name, so a misspelt name fails instead
// of drawing its letters as a one-level ramp; a single glyph stays the user's own.
const SET_NAME = /^[a-z]{2,}$/;

/** A GLYPH_SETS name → that set's ramp string; any other string is returned as given. */
function glyphSet(value, path) {
  const name = value.trim();
  if (!SET_NAME.test(name)) return value;
  check(Object.hasOwn(GLYPH_SETS, name), path,
    `unknown glyph set ${JSON.stringify(name)}; use one of ${Object.keys(GLYPH_SETS).join(", ")} ` +
    `or a string of your own glyphs (a single lowercase word is read as a set name)`);
  return GLYPH_SETS[name];
}

/**
 * Deep-merge `user` over DEFAULTS and validate. Relative paths (font.file,
 * tagline.font, data) resolve against `baseDir`. Nulls with a default are filled in
 * and paths made absolute in place, so a resolved config resolves to itself.
 * size.height stays AUTO only with cards: their heights decide it (src/blocks.mjs).
 */
export function resolveConfig(user = {}, { baseDir = process.cwd() } = {}) {
  if (isObj(user) && Object.hasOwn(user, "card"))
    throw new ConfigError('"card" became "cards: [{ ... }]", a list of cards inside the banner: move its keys into an entry ' +
      'of cards (mode follows from user / repo; card.data is the top-level data)');
  const field = splitField(user);
  const reveal = splitReveal(field.rest);
  const c = merge(DEFAULTS, reveal.rest, "");

  const s = c.size;
  positive(s.width, "size.width");
  keywordOrPx(s.height, "size.height", [AUTO], (v) => v > 0, "px > 0");
  hexColour(c.accent, "accent");
  c.taglines.forEach((line, i) => {
    check(typeof line === "string" && line.trim() !== "", `taglines[${i}]`, `must be a non-empty string, got ${describe(line)}`);
    plainText(line, `taglines[${i}]`);
  });

  const t = c.tagline;
  positive(t.fill, "tagline.fill");
  positive(t.maxHeight, "tagline.maxHeight");
  unit(t.x, "tagline.x");
  positive(t.lineHeight, "tagline.lineHeight");
  unit(t.shadowAlpha, "tagline.shadowAlpha");
  nonNeg(t.knockout, "tagline.knockout");
  check(t.font !== "", "tagline.font", "must name a bundled figlet font or a .flf path");
  // A bare word can only be meant as a bundled name: a path has a slash or a dot.
  check(isBundledFont(t.font) || /[/\\.]/.test(t.font), "tagline.font",
    `must be one of ${Object.keys(BUNDLED_FONTS).join(", ")}, or a path to a .flf; got ${describe(t.font)}`);
  check(t.layout === null || LAYOUTS.includes(t.layout), "tagline.layout",
    `must be one of ${LAYOUTS.map((l) => JSON.stringify(l)).join(", ")} or null, got ${describe(t.layout)}`);
  if (t.color !== null) hexColour(t.color, "tagline.color");
  if (t.shadowColor !== null) hexColour(t.shadowColor, "tagline.shadowColor");
  t.color ??= c.accent;
  t.shadowColor ??= t.color;
  keywordOrPx(t.width, "tagline.width", BLOCK_WIDTHS, (v) => v > 0 && v <= s.width, `px within (0, size.width = ${s.width}]`);
  // Without cards a px size.height is the pre-cards banner: the header fills it.
  const fixed = typeof s.height === "number";
  // Cards without taglines have no header: they start at the top.
  const headless = c.taglines.length === 0 && c.cards.length > 0;
  t.height ??= headless ? 0 : fixed && c.cards.length === 0 ? s.height : HEADER_HEIGHT;
  (headless ? nonNeg : positive)(t.height, "tagline.height");
  if (fixed) check(t.height <= s.height, "tagline.height", `must fit into size.height (${s.height}), got ${t.height}`);
  // Without cards an auto canvas is the header; with them buildBanner resolves it from their heights.
  if (!fixed && c.cards.length === 0) s.height = t.height;

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
  // An auto canvas with cards is at least their rows plus the bottom margin tall.
  if (typeof s.height === "number")
    check(f.rowPitch <= s.height, "field.rowPitch",
      `must fit at least one row into ${fixed ? "size.height" : "tagline.height, the banner's height here"} (${s.height})`);
  nonNeg(f.fps, "field.fps");
  positive(f.loopSeconds, "field.loopSeconds");
  // fps 0 bakes one still frame, so there is no frame count to keep whole.
  check(f.fps === 0 || Number.isInteger(f.fps * f.loopSeconds), "field.fps",
    `fps × loopSeconds must be a whole frame count, got ${f.fps * f.loopSeconds}`);
  check(f.stillAt >= 0 && f.stillAt < f.loopSeconds, "field.stillAt",
    `must be within [0, loopSeconds) = [0, ${f.loopSeconds}), got ${f.stillAt}`);
  unit(f.alpha.lo, "field.alpha.lo");
  unit(f.alpha.hi, "field.alpha.hi");
  const fieldNames = [...Object.keys(FIELD_PRESETS), NO_FIELD];
  check(fieldNames.includes(f.preset), "field.preset", `must be one of ${fieldNames.join(", ")}; got ${describe(f.preset)}`);
  check(f.preset !== NO_FIELD || c.taglines.length > 0 || c.cards.length > 0, "field.preset",
    `"${NO_FIELD}" with taglines: [] and no cards leaves nothing to draw; give a tagline, a card or a field preset`);
  const preset = f.preset === NO_FIELD ? NO_FIELD_PRESET : FIELD_PRESETS[f.preset];
  f.options = presetOptions(preset, withAliases(f.preset, field.options, field.aliases), "field.options",
    (key, takes) => `field.options.${key}: unknown option for preset "${f.preset}" (it takes ${takes || "no options"})`, { field: f });
  oneOf(f.cells, "field.cells", ["ramp", "half"]);
  check(f.cells === "ramp" || f.ramp === null, "field.ramp",
    `has no effect with field.cells "${f.cells}", which draws block glyphs; remove it or set cells: "ramp"`);
  if (f.cells !== "ramp") {
    // Blocks span the font's full ascent + descent. Rows a block apart still
    // gap in Firefox, which snaps each row to whole device pixels, so they
    // overlap by 1 px or more; past a quarter block the samples drift off their cells.
    positive(c.font.blockHeight, "font.blockHeight");
    const block = f.fontSize * c.font.blockHeight;
    const lo = block * (1 - BLOCK_OVERLAP_MAX), hi = block - BLOCK_OVERLAP_MIN;
    check(f.rowPitch >= lo && f.rowPitch <= hi, "field.rowPitch",
      `must be within [${+lo.toFixed(2)}, ${+hi.toFixed(2)}] with field.cells "${f.cells}" (blocks are ` +
      `fontSize × font.blockHeight = ${+block.toFixed(2)} px tall, and rows overlap by 1 px to a quarter of that); got ${f.rowPitch}`);
  }
  f.ramp = glyphSet(f.ramp ?? preset.ramp, "field.ramp");
  f.bands ??= preset.bands;
  f.gamma ??= preset.gamma ?? PRESET_GAMMA;
  plainText(f.ramp, "field.ramp");
  check(parseRamp(f.ramp).length >= 2, "field.ramp", "needs at least one level of glyphs");
  d.pool = d.pool === null ? f.ramp : glyphSet(d.pool, "reveal.pool");
  plainText(d.pool, "reveal.pool");
  check(parseRamp(d.pool).length >= 2, "reveal.pool", "needs at least one glyph");
  check([1, 2, 3].includes(f.bands), "field.bands", `must be one of 1, 2, 3 (or null), got ${f.bands}`);
  // Bands split the ramp's levels; past one band per level some would hold no
  // level, and the colours handed to them would never draw.
  const levels = parseRamp(f.ramp).length - 1;
  const capped = f.bands > levels;
  if (capped) f.bands = levels;
  oneOf(f.dither, "field.dither", [0, 2, 4, 8]);
  positive(f.gamma, "field.gamma");
  if (f.colors !== null && f.gradient !== null) throw new ConfigError("give either field.colors or field.gradient, not both");
  if (f.colors !== null) {
    colourList(f.colors, "field.colors", 1, 3);
    check(f.colors.length <= f.bands, "field.colors",
      `${f.colors.length} colours for ${f.bands} band${f.bands > 1 ? "s" : ""} ` +
      `(field.bands${capped ? `, capped at the ramp's ${levels} level${levels > 1 ? "s" : ""}` : ""}); give at most one per band`);
  }
  if (f.gradient !== null) colourList(f.gradient, "field.gradient", 2, 8);
  else f.colors ??= [c.accent];

  positive(c.font.advance, "font.advance");
  if (c.budget.maxBytes !== null) int(c.budget.maxBytes, "budget.maxBytes", 0);

  const abs = (p) => (isAbsolute(p) ? p : resolve(baseDir, p));
  if (c.font.file !== null) c.font.file = abs(c.font.file);
  // A registry name wins over a same-named file.
  const fontDefaults = isBundledFont(t.font) ? BUNDLED_FONTS[t.font] : PATH_FONT_DEFAULTS;
  if (!isBundledFont(t.font)) t.font = abs(t.font);
  t.layout ??= fontDefaults.layout;
  t.shadowGlyphs ??= fontDefaults.shadowGlyphs;
  check(c.data.trim() !== "", "data", "must be a path to the cards' snapshot, relative to the config");
  c.data = abs(c.data);
  c.cards = c.cards.map((card, i) => resolveCard(card, i, f));
  return c;
}

/**
 * cards[i] merged over CARD_DEFAULTS and checked; adds mode and fills show,
 * activity, portrait, period and delay. Which login or repo fetch needs is
 * checked there; whether the width fits the canvas, by layoutBlocks.
 */
function resolveCard(user, i, field) {
  const path = `cards[${i}]`;
  const at = (key) => `${path}.${key}`;
  // A resolved card carries its mode: let it through when it still matches,
  // so a resolved config resolves to itself.
  const { mode, ...rest } = isObj(user) ? user : {};
  const k = merge(CARD_DEFAULTS, isObj(user) ? rest : user, path);
  check((k.user === null) !== (k.repo === null), path,
    k.user === null ? 'needs "user" (a GitHub login) or "repo" ("owner/name")' : 'give either "user" or "repo", not both');
  k.mode = k.user !== null ? "person" : "project";
  check(mode === undefined || mode === k.mode, at("mode"), `follows from user / repo ("${k.mode}" here); remove it, got ${describe(mode)}`);
  if (k.user !== null) check(/^[A-Za-z0-9-]{1,39}$/.test(k.user), at("user"), `must be a GitHub login, got ${describe(k.user)}`);
  if (k.repo !== null) check(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(k.repo), at("repo"), `must be "owner/name", got ${describe(k.repo)}`);
  k.rows.forEach((r, j) => {
    const p = at(`rows[${j}]`);
    check(Array.isArray(r) && r.length === 2 && r.every((s) => typeof s === "string" && s.trim()), p,
      `must be a [key, value] pair of non-empty strings, got ${JSON.stringify(r)}`);
    r.forEach((s) => plainText(s, p));
  });
  if (k.title !== null) plainText(k.title, at("title"));
  const rows = CARD_ROWS[k.mode];
  if (k.show === null) k.show = [...rows];
  k.show.forEach((s, j) => oneOf(s, at(`show[${j}]`), rows));
  check(new Set(k.show).size === k.show.length, at("show"), `names a row twice: ${JSON.stringify(k.show)}`);
  k.activity ??= k.mode === "person" ? "sparkline" : "none";
  oneOf(k.activity, at("activity"), CARD_ACTIVITIES);
  check(k.mode === "person" || k.activity === "none", at("activity"), `mode "project" has no contribution activity; use "none", got ${JSON.stringify(k.activity)}`);
  oneOf(k.layout, at("layout"), CARD_LAYOUTS);
  if (k.ink !== null) hexColour(k.ink, at("ink"));
  k.portrait ??= k.mode === "person" ? "avatar" : "solid";
  oneOf(k.portrait, at("portrait"), CARD_PORTRAITS);
  oneOf(k.avatarColors, at("avatarColors"), CARD_AVATAR_COLORS);
  check(k.avatarColors === "accent" || k.portrait === "avatar", at("avatarColors"),
    `colours an avatar, but ${at("portrait")} is "${k.portrait}"`);
  if (k.screen !== null) hexColour(k.screen, at("screen"));
  positive(k.textSize, at("textSize"));
  keywordOrPx(k.width, at("width"), BLOCK_WIDTHS, (v) => v >= CARD_MIN_WIDTH, `px >= ${CARD_MIN_WIDTH}`);
  if (k.at !== null) {
    const keys = Object.keys(k.at);
    check(keys.length === 2 && keys.includes("x") && keys.includes("y"), at("at"), `must be { x, y } in px, got ${JSON.stringify(k.at)}`);
    for (const [key, v] of Object.entries(k.at))
      check(Number.isFinite(v) && v >= 0, at(`at.${key}`), `must be a number of px >= 0, got ${typeof v === "number" ? v : describe(v)}`);
    k.at = { x: k.at.x, y: k.at.y };
  }
  oneOf(k.backdrop, at("backdrop"), CARD_BACKDROPS);
  k.reveal ??= field.preset === NO_FIELD ? "type" : "wave";
  oneOf(k.reveal, at("reveal"), CARD_REVEALS);
  check(field.preset !== NO_FIELD || !FIELD_REVEALS.includes(k.reveal), at("reveal"),
    `"${k.reveal}" brings the card out of the field, but field.preset is "${NO_FIELD}"; ` +
    `use a line reveal: ${LINE_REVEALS.map((r) => JSON.stringify(r)).join(", ")}`);
  oneOf(k.intro, at("intro"), CARD_INTROS);
  k.period ??= field.loopSeconds;
  positive(k.period, at("period"));
  k.delay ??= Math.round((CARD_DELAY + i * CARD_STAGGER) * MS_PER_S) / MS_PER_S;
  nonNeg(k.delay, at("delay"));
  return k;
}

/** Absolute paths of the font files a resolved config draws with. */
export const assetPaths = (c) => ({
  font: c.font.file ?? BUNDLED_FONT,
  fontBundled: c.font.file === null,
  flf: isBundledFont(c.tagline.font) ? packagePath(BUNDLED_FONTS[c.tagline.font].file) : c.tagline.font,
});
