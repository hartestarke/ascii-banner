// Figlet: the FIGfont version 2 (.flf) format, enough to set taglines.
// Horizontal layout follows the FIGfont standard as figlet.c implements it,
// left to right only: full width (glyphs butted together, what block fonts like
// ANSI Shadow are drawn for), fitting (glyphs moved together until they touch)
// and smushing (one column further where the touching characters merge, by the
// six controlled rules or by universal smushing). Vertical layout, right-to-left
// fonts and the code-tagged glyphs past '~' are not supported.
import { readFileSync } from "node:fs";
import { ConfigError } from "./config.mjs";
import { LAYOUTS } from "./fonts.mjs";

// Horizontal bits of the header's full_layout field (figlet.c names).
const SM_EQUAL = 1; // rule 1: equal characters merge
const SM_LOWLINE = 2; // rule 2: '_' gives way to a hierarchy character
const SM_HIERARCHY = 4; // rule 3: of two HIERARCHY classes the later one wins
const SM_PAIR = 8; // rule 4: opposite brackets become '|'
const SM_BIGX = 16; // rule 5: "/\" -> '|', "\/" -> 'Y', "><" -> 'X'
const SM_HARDBLANK = 32; // rule 6: two hardblanks become one
const SM_KERN = 64; // fitting
const SM_SMUSH = 128; // smushing; wins over SM_KERN
const SM_RULES = 63;
const RULE_COUNT = 6;
// old_layout (header field 4) carries rules 1-5 only: figlet.c and pyfiglet mask it with 31.
const OLD_LAYOUT_RULES = 31;

const LOWLINE_PARTNERS = "|/\\[]{}()<>";
const HIERARCHY = ["|", "/\\", "[]", "{}", "()", "<>"];
const PAIRS = ["[]", "][", "{}", "}{", "()", ")("];

/**
 * Header: "flf2a" + hardblank, then height baseline maxLength oldLayout
 * commentLines, optionally printDirection fullLayout codetagCount.
 */
function parseHeader(line, path) {
  const [height, baseline, maxLength, oldLayout, commentLines, printDirection, fullLayout, codetagCount] = line
    .slice(6)
    .trim()
    .split(/\s+/)
    .map(Number);
  if (!/^flf2a./.test(line) || !(height > 0)) throw new ConfigError(`tagline.font: ${path} is not a figlet (.flf) font`);
  if (![height, oldLayout, commentLines].every(Number.isInteger) || commentLines < 0)
    throw new ConfigError(`tagline.font: ${path} has a malformed header (${JSON.stringify(line)})`);
  const opt = (v) => (Number.isInteger(v) ? v : undefined);
  return {
    hardblank: line[5],
    height,
    baseline,
    maxLength,
    oldLayout,
    commentLines,
    printDirection: opt(printDirection),
    fullLayout: opt(fullLayout),
    codetagCount: opt(codetagCount),
  };
}

/** Horizontal smush mode the header asks for: full_layout if present, else derived from old_layout. */
function headerSmushMode({ oldLayout, fullLayout }) {
  if (fullLayout !== undefined) return fullLayout & (SM_RULES | SM_KERN | SM_SMUSH);
  if (oldLayout < 0) return 0;
  return oldLayout === 0 ? SM_KERN : (oldLayout & OLD_LAYOUT_RULES) | SM_SMUSH;
}

/** Smush mode for a `tagline.layout` value; "smush" keeps the font's rules, like figlet -s. */
function layoutSmushMode(layout, headerMode) {
  switch (layout) {
    case "full":
      return 0;
    case "fit":
      return SM_KERN;
    case "smush":
      return SM_SMUSH | (headerMode & SM_RULES);
    case "header":
      return headerMode;
    default:
      throw new ConfigError(`tagline.layout: must be one of ${LAYOUTS.join(", ")}, got ${JSON.stringify(layout)}`);
  }
}

/** Human-readable smush mode, e.g. "smush (rules 1,2,3,4)". */
export function describeLayout(mode) {
  if (!(mode & SM_SMUSH)) return mode & SM_KERN ? "fit" : "full";
  const rules = Array.from({ length: RULE_COUNT }, (_, i) => i + 1).filter((r) => mode & (1 << (r - 1)));
  return rules.length ? `smush (rules ${rules.join(",")})` : "smush (universal)";
}

/**
 * Parse an .flf file: the header, `commentLines` comment lines, then the
 * printable ASCII glyphs (32..126) as `height` lines each. Every line ends in
 * an endmark — its own last character (usually '@'), doubled on a glyph's last
 * row — which is stripped after trailing whitespace, as figlet does. Glyphs keep
 * their hardblanks (spaces that block smushing) until figlet() lays them out.
 * `name` labels errors; `layout` is a `tagline.layout` value other than null.
 */
export function loadFlf(path, name = path, { layout = "full" } = {}) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new ConfigError(`tagline.font: cannot read ${path} (${e.code ?? e.message})`);
  }
  const lines = text.split(/\r?\n/);
  const header = parseHeader(lines[0], path);
  const { height, hardblank } = header;
  const chars = new Map();
  let i = 1 + header.commentLines;
  for (let code = 32; code <= 126 && i + height <= lines.length; code++, i += height)
    chars.set(String.fromCharCode(code), lines.slice(i, i + height).map(stripEndmark));
  if (!chars.has("?")) throw new ConfigError(`tagline.font: ${path} has too few glyphs (needs at least ' ' through '?')`);
  const headerMode = headerSmushMode(header);
  return { name, height, chars, hardblank, header, headerMode, smushMode: layoutSmushMode(layout, headerMode) };
}

function stripEndmark(line) {
  const l = line.trimEnd();
  const mark = l.at(-1);
  let end = l.length;
  while (end > 0 && l[end - 1] === mark) end--;
  return l.slice(0, end);
}

/**
 * Render text as equal-length rows; trailing blank rows are dropped. Characters
 * the font lacks render as its '?' glyph (reported via `missing`). Text that
 * renders all blank is a ConfigError naming `label`.
 */
export function figlet(font, text, missing = new Set(), label = JSON.stringify(text)) {
  const glyphs = [...text].map((ch) => {
    const g = font.chars.get(ch);
    if (g) return g;
    missing.add(ch);
    return font.chars.get("?");
  });
  const laid = font.smushMode & (SM_SMUSH | SM_KERN) ? layOut(font, glyphs) : concat(font.height, glyphs);
  const rows = laid.map((r) => r.replaceAll(font.hardblank, " "));
  while (rows.length && !rows.at(-1).trim()) rows.pop();
  if (!rows.length) throw new ConfigError(`${label} renders blank in ${font.name}`);
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(cols));
}

/** Full width: glyph rows concatenated as they are. */
function concat(height, glyphs) {
  const rows = Array.from({ length: height }, () => "");
  for (const g of glyphs) for (let r = 0; r < height; r++) rows[r] += g[r];
  return rows;
}

/**
 * Fitting / smushing, figlet.c's addchar(): each glyph moves left by the
 * overlap smushAmount() allows, the overlapped columns merge via smushem().
 * Rows are arrays of code points; each glyph is padded to its widest row so
 * the output stays rectangular (figlet assumes that of a well-formed font).
 */
function layOut(font, glyphs) {
  const out = Array.from({ length: font.height }, () => []);
  let prevWidth = 0;
  for (const g of glyphs) {
    const rows = g.map((r) => [...r]);
    const width = Math.max(...rows.map((r) => r.length));
    for (const r of rows) while (r.length < width) r.push(" ");
    const ctx = { mode: font.smushMode, hard: font.hardblank, prevWidth, width };
    const amt = smushAmount(out, rows, ctx);
    for (let r = 0; r < font.height; r++) {
      const line = out[r];
      for (let k = 0; k < amt; k++) {
        const idx = line.length - amt + k;
        // smushAmount() guarantees the pair merges; the fallback is never taken.
        if (idx >= 0) line[idx] = smushem(line[idx], rows[r][k], ctx) ?? rows[r][k];
      }
      for (let k = amt; k < width; k++) line.push(rows[r][k]);
    }
    prevWidth = width;
  }
  return out.map((r) => r.join(""));
}

/** figlet.c smushamt(): the most columns the glyph can move left on every row. */
function smushAmount(out, rows, ctx) {
  let max = ctx.width;
  for (let r = 0; r < out.length; r++) {
    const left = out[r];
    const right = rows[r];
    let lb = left.length;
    let ch1 = left[lb];
    while (lb > 0 && (ch1 === undefined || ch1 === " ")) ch1 = left[--lb];
    let rb = 0;
    while (right[rb] === " ") rb++;
    const ch2 = right[rb];
    let amt = rb + left.length - 1 - lb;
    if (ch1 === undefined || ch1 === " ") amt++;
    else if (ch2 !== undefined && smushem(ch1, ch2, ctx) !== null) amt++;
    if (amt < max) max = amt;
  }
  return max;
}

const hierarchyClass = (c) => HIERARCHY.findIndex((cls) => cls.includes(c));

/** figlet.c smushem(): the character l and r merge into, or null if they don't. */
function smushem(l, r, { mode, hard, prevWidth, width }) {
  if (l === " ") return r;
  if (r === " ") return l;
  if (prevWidth < 2 || width < 2) return null; // never overlap a glyph 0 or 1 wide
  if (!(mode & SM_SMUSH)) return null; // fitting
  if (!(mode & SM_RULES)) {
    // universal smushing: visible beats hardblank, otherwise the later glyph wins
    if (l === hard) return r;
    if (r === hard) return l;
    return r;
  }
  if (mode & SM_HARDBLANK && l === hard && r === hard) return l;
  if (l === hard || r === hard) return null;
  if (mode & SM_EQUAL && l === r) return l;
  if (mode & SM_LOWLINE) {
    if (l === "_" && LOWLINE_PARTNERS.includes(r)) return r;
    if (r === "_" && LOWLINE_PARTNERS.includes(l)) return l;
  }
  if (mode & SM_HIERARCHY) {
    const a = hierarchyClass(l);
    const b = hierarchyClass(r);
    if (a >= 0 && b >= 0 && a !== b) return a > b ? l : r;
  }
  if (mode & SM_PAIR && PAIRS.includes(l + r)) return "|";
  if (mode & SM_BIGX) {
    if (l === "/" && r === "\\") return "|";
    if (l === "\\" && r === "/") return "Y";
    if (l === ">" && r === "<") return "X";
  }
  return null;
}
