// Minimal figlet: enough of the FLF format to set taglines in a block font.
// No smushing/kerning — glyphs are butted together at full width, which is
// what block fonts like ANSI Shadow are drawn for.
import { readFileSync } from "node:fs";
import { ConfigError } from "./config.mjs";

/**
 * Parse an .flf file. Header "flf2a$ height baseline maxLen oldLayout
 * commentLines ...", then the printable ASCII glyphs (32..126) as `height`
 * lines each. Every line ends in an endmark — its own last character (usually
 * '@'), doubled on a glyph's last row — which is stripped after trailing
 * whitespace, as figlet does. The hardblank ('$' here) is a space that
 * survives smushing, so it is plain space for us. `name` labels errors.
 */
export function loadFlf(path, name = path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new ConfigError(`tagline.font: cannot read ${path} (${e.code ?? e.message})`);
  }
  const lines = text.split(/\r?\n/);
  const hdr = lines[0].split(" ");
  if (!/^flf2a./.test(hdr[0]) || !(+hdr[1] > 0)) throw new ConfigError(`tagline.font: ${path} is not a figlet (.flf) font`);
  const hard = hdr[0].slice(-1);
  const height = +hdr[1];
  const chars = new Map();
  let i = 1 + +hdr[5];
  for (let code = 32; code <= 126 && i + height <= lines.length; code++, i += height)
    chars.set(String.fromCharCode(code), lines.slice(i, i + height).map((l) => stripEndmark(l).replaceAll(hard, " ")));
  if (!chars.has("?")) throw new ConfigError(`tagline.font: ${path} has too few glyphs (needs at least ' ' through '?')`);
  return { name, height, chars };
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
  const rows = Array.from({ length: font.height }, () => "");
  for (const ch of text) {
    let g = font.chars.get(ch);
    if (!g) {
      missing.add(ch);
      g = font.chars.get("?");
    }
    for (let r = 0; r < font.height; r++) rows[r] += g[r];
  }
  while (rows.length && !rows.at(-1).trim()) rows.pop();
  if (!rows.length) throw new ConfigError(`${label} renders blank in ${font.name}`);
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(cols));
}
