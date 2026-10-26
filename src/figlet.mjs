// Figlet: the FIGfont version 2 (.flf) format, enough to set taglines, with
// horizontal layout as figlet.c does it, left to right only: full width (what
// block fonts like ANSI Shadow are drawn for), fitting, and smushing by the six
// controlled rules or universal smushing. Vertical layout, right-to-left fonts
// and the code-tagged glyphs past '~' are not supported.
import { readFileSync } from "node:fs";
import { ConfigError } from "./config.mjs";
import { LAYOUTS } from "./fonts.mjs";

// Horizontal bits of the header's full_layout (figlet.c names); 1..32 are smushing rules 1..6.
const SM_EQUAL = 1;
const SM_LOWLINE = 2;
const SM_HIERARCHY = 4;
const SM_PAIR = 8;
const SM_BIGX = 16;
const SM_HARDBLANK = 32;
const SM_RULES = 63;
const SM_KERN = 64;
const SM_SMUSH = 128;

const LOWLINE_PARTNERS = "|/\\[]{}()<>";
const HIERARCHY = ["|", "/\\", "[]", "{}", "()", "<>"];
const PAIRS = ["[]", "][", "{}", "}{", "()", ")("];

/** "flf2a<hardblank> height baseline maxLength oldLayout commentLines [printDirection fullLayout codetagCount]" */
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

function headerSmushMode({ oldLayout, fullLayout }) {
  if (fullLayout !== undefined) return fullLayout & (SM_RULES | SM_KERN | SM_SMUSH);
  if (oldLayout < 0) return 0;
  // figlet.c and pyfiglet mask old_layout with 31, so rule 6 only arrives
  // through full_layout; matched so fonts render as figlet renders them.
  return oldLayout === 0 ? SM_KERN : (oldLayout & 31) | SM_SMUSH;
}

/** Smush mode for a `tagline.layout` value; "smush" keeps the font's rules, like figlet -S. */
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
  const rules = [1, 2, 3, 4, 5, 6].filter((r) => mode & (1 << (r - 1)));
  return rules.length ? `smush (rules ${rules.join(",")})` : "smush (universal)";
}

/**
 * Parse an .flf file: the header, `commentLines` comment lines, then the
 * printable ASCII glyphs (32..126) as `height` lines each. Glyphs keep their
 * hardblanks (spaces that block smushing) until figlet() lays them out.
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

// Every line ends in an endmark: its own last character (usually '@'), doubled
// on a glyph's last row. As figlet does, it is stripped after trailing whitespace.
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
  return figletLaid(font, text, missing, label).rows;
}

/**
 * figlet() plus where each character landed: spans[i] = [a, b) is the column
 * range of the glyph of the i-th code point of `text`, b = a + its padded width.
 * Fitting and smushing move a glyph left over its neighbour, so spans overlap
 * by that amount, and a leading glyph whose blank columns fit away starts left
 * of column 0. Letter boundaries can't be read back from the rows: block fonts
 * butt letters together and smushing merges them.
 */
export function figletLaid(font, text, missing = new Set(), label = JSON.stringify(text)) {
  const glyphs = [...text].map((ch) => {
    const g = font.chars.get(ch);
    if (g) return g;
    missing.add(ch);
    return font.chars.get("?");
  });
  const laid = font.smushMode & (SM_SMUSH | SM_KERN) ? layOut(font, glyphs) : concat(font.height, glyphs);
  const rows = laid.rows.map((r) => r.replaceAll(font.hardblank, " "));
  while (rows.length && !rows.at(-1).trim()) rows.pop();
  if (!rows.length) throw new ConfigError(`${label} renders blank in ${font.name}`);
  const cols = Math.max(...rows.map((r) => r.length));
  // Only a dropped blank row of a malformed font can run past the kept rows.
  return { rows: rows.map((r) => r.padEnd(cols)), spans: laid.spans.map(([a, b]) => [a, Math.min(b, cols)]) };
}

// No padding here, so a font whose glyph rows differ in width shifts later
// glyphs per row; the span covers the glyph on every row.
function concat(height, glyphs) {
  const rows = Array.from({ length: height }, () => "");
  const spans = glyphs.map((g) => {
    const a = Math.min(...rows.map((r) => r.length));
    for (let r = 0; r < height; r++) rows[r] += g[r];
    return [a, Math.max(...rows.map((r) => r.length))];
  });
  return { rows, spans };
}

/**
 * figlet.c addchar(): each glyph moves left by the overlap smushAmount() allows
 * and the overlapped columns merge via smushem(). Each glyph is padded to its
 * widest row, which figlet assumes of a well-formed font.
 */
function layOut(font, glyphs) {
  const out = Array.from({ length: font.height }, () => []);
  const spans = [];
  let prevWidth = 0;
  for (const g of glyphs) {
    const rows = g.map((r) => [...r]);
    const width = Math.max(...rows.map((r) => r.length));
    for (const r of rows) while (r.length < width) r.push(" ");
    const ctx = { mode: font.smushMode, hard: font.hardblank, prevWidth, width };
    const amt = smushAmount(out, rows, ctx);
    // Every row grows by width - amt, so the rows stay equal length.
    spans.push([out[0].length - amt, out[0].length - amt + width]);
    for (let r = 0; r < font.height; r++) {
      const line = out[r];
      for (let k = 0; k < amt; k++) {
        const idx = line.length - amt + k;
        // smushAmount() made sure the pair merges; the fallback is never taken.
        if (idx >= 0) line[idx] = smushem(line[idx], rows[r][k], ctx) ?? rows[r][k];
      }
      for (let k = amt; k < width; k++) line.push(rows[r][k]);
    }
    prevWidth = width;
  }
  return { rows: out.map((r) => r.join("")), spans };
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
  if (!(mode & SM_SMUSH)) return null; // fitting: visible characters never merge
  // universal smushing: the later glyph wins unless it is a hardblank
  if (!(mode & SM_RULES)) return r === hard ? l : r;
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
