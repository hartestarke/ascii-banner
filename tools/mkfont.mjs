#!/usr/bin/env node
// mkfont: bake a hand-drawn glyph bitmap into FIGlet (.flf) fonts, one per
// "face" (a way of drawing the bitmap's pixels with Block Elements).
//
//   node tools/mkfont.mjs <bitmap.txt> --face <name> --out <file.flf>
//   node tools/mkfont.mjs --all
//
// --all regenerates every bundled face into fonts/block/. Output is a pure
// function of the bitmap: no dates, no absolute paths. Format and faces are
// described in docs/block-fonts.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_BITMAP = "fonts/block/src/hairline.txt"; // relative to ROOT
const BUNDLED_DIR = "fonts/block"; // --all writes <face>.flf here

const DESIGN_ROWS = 7; // every bitmap glyph is this many rows tall
const DESIGN_MAX_COLS = 5; // and at most this many columns wide
const GAP_COLS = 1; // blank design columns appended after every glyph
const FIRST_CODE = 32; // .flf glyphs run from ' '...
const LAST_CODE = 126; // ...to '~', in order
const ENDMARK = "@";
const HARDBLANK = "$"; // declared in the header; full-width layout never needs one
const OLD_LAYOUT = -1; // full width: glyphs butt together exactly as drawn
const ON = "#";
const OFF = ".";
const PIXEL_ROW = new RegExp(`^[${ON}${OFF}]+$`);

// Block Elements, all inside the embedded JetBrains Mono subset.
const FULL = "█";
const UPPER = "▀";
const LOWER = "▄";
const SHADE = "░"; // light shade; the shadow glyph of blocks-shadow
const HALF = [" ", LOWER, UPPER, FULL]; // indexed by top * 2 + bottom

class MkfontError extends Error {}
const fail = (msg) => {
  throw new MkfontError(msg);
};

/**
 * Faces: `render(bits)` turns one glyph's pixels (DESIGN_ROWS rows of
 * booleans, gap column included) into its text rows; every glyph of a face
 * renders to the same number of rows. `baseline` is the .flf header's
 * baseline row (rows above it carry the letters; default = every row); the
 * shadow glyphs a face wants dimmed are declared in src/fonts.mjs.
 */
const FACES = {
  blocks: {
    about: "two full blocks per pixel (square pixels), 7 rows",
    render: (bits) => bits.map((row) => row.map((on) => (on ? FULL + FULL : "  ")).join("")),
  },
  "blocks-shadow": {
    about: "block plus a light-shade drop shadow one column right and one row down, 8 rows",
    baseline: (height) => height - 1, // the last row is only the shadow
    render: (bits) => dropShadow(FACES.blocks.render(bits)),
  },
  pixel: {
    about: "half blocks, two pixel rows per text row (square pixels), 4 rows",
    render: (bits) => halfBlocks(bits),
  },
  "blocks-thin": {
    about: "one full block per pixel (tall narrow pixels), 7 rows",
    render: (bits) => bits.map((row) => row.map((on) => (on ? FULL : " ")).join("")),
  },
};

/** The glyph shifted one column right and one row down, in SHADE, wherever the glyph itself is blank. */
function dropShadow(rows) {
  const cols = rows[0].length;
  const out = [...rows.map((r) => [...r]), Array(cols).fill(" ")];
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch !== FULL) return;
      if (x + 1 >= cols) fail(`blocks-shadow: a pixel touches the right edge; the shadow needs GAP_COLS >= 1`);
      if (out[y + 1][x + 1] === " ") out[y + 1][x + 1] = SHADE;
    }),
  );
  return out.map((r) => r.join(""));
}

/** Two design rows per text row; an odd row count gets a blank row at the bottom. */
function halfBlocks(bits) {
  const rows = bits.length % 2 ? [...bits, bits[0].map(() => false)] : bits;
  const out = [];
  for (let y = 0; y < rows.length; y += 2) out.push(rows[y].map((top, x) => HALF[(top ? 2 : 0) + (rows[y + 1][x] ? 1 : 0)]).join(""));
  return out;
}

/**
 * Parse a glyph atlas: "# <char>" (or "# space") headers, each followed by
 * DESIGN_ROWS rows of ON/OFF, glyphs separated by blank lines, "//" comments.
 * Returns Map(char -> boolean[][]). `label` names the file in errors.
 */
function parseBitmap(text, label) {
  const glyphs = new Map();
  let cur = null;
  const close = () => {
    if (!cur) return;
    const { ch, rows, at } = cur;
    const name = ch === " " ? "space" : JSON.stringify(ch);
    if (rows.length !== DESIGN_ROWS) fail(`${at}: glyph ${name} has ${rows.length} rows, needs ${DESIGN_ROWS}`);
    const w = rows[0].length;
    if (rows.some((r) => r.length !== w)) fail(`${at}: glyph ${name} has rows of different widths`);
    if (w > DESIGN_MAX_COLS) fail(`${at}: glyph ${name} is ${w} columns wide, at most ${DESIGN_MAX_COLS}`);
    glyphs.set(ch, rows.map((r) => [...r].map((c) => c === ON)));
    cur = null;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trimEnd();
    const at = `${label}:${i + 1}`;
    if (line.startsWith("//")) return;
    if (line === "") return close();
    const head = /^# (.+)$/.exec(line);
    if (head) {
      close();
      const ch = head[1] === "space" ? " " : head[1];
      const code = ch.charCodeAt(0);
      if (ch.length !== 1 || code < FIRST_CODE || code > LAST_CODE)
        fail(`${at}: "# ${head[1]}" must name one printable ASCII character, or "space"`);
      if (glyphs.has(ch)) fail(`${at}: glyph ${JSON.stringify(ch)} is drawn twice`);
      cur = { ch, rows: [], at };
      return;
    }
    if (!PIXEL_ROW.test(line))
      fail(`${at}: expected "# <char>", a row of "${ON}"/"${OFF}" or a blank line, got ${JSON.stringify(line)}`);
    if (!cur) fail(`${at}: pixel row outside a glyph (missing "# <char>" header?)`);
    cur.rows.push(line);
  });
  close();
  if (!glyphs.has(" ")) fail(`${label}: no "# space" glyph; it sets the width of undrawn characters`);
  return glyphs;
}

/**
 * The glyph for `ch`: drawn, else (a-z) its capital, else a blank as wide
 * as the space, so every printable ASCII character renders.
 */
function glyphFor(glyphs, ch) {
  if (glyphs.has(ch)) return glyphs.get(ch);
  if (ch >= "a" && ch <= "z" && glyphs.has(ch.toUpperCase())) return glyphs.get(ch.toUpperCase());
  return glyphs.get(" ").map((row) => row.map(() => false));
}

/** The .flf text of one face. `source` is the bitmap path shown in the comment. */
function buildFlf(glyphs, faceName, source) {
  const face = FACES[faceName];
  const gap = Array(GAP_COLS).fill(false);
  const chars = [];
  for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
    const bits = glyphFor(glyphs, String.fromCharCode(code)).map((row) => [...row, ...gap]);
    chars.push(face.render(bits));
  }
  const height = chars[0].length;
  if (chars.some((rows) => rows.length !== height)) fail(`${faceName}: glyphs render to different heights`);
  // Parsers strip trailing endmarks and turn hardblanks into spaces, so a face must draw neither.
  if (chars.flat().some((r) => r.endsWith(ENDMARK) || r.includes(HARDBLANK)))
    fail(`${faceName}: a glyph row ends in "${ENDMARK}" or contains "${HARDBLANK}"`);
  const maxLength = Math.max(...chars.flat().map((r) => r.length)) + 2 * ENDMARK.length;
  const comments = [
    `${basename(source, extname(source))} ${faceName}: ${face.about}.`,
    `Generated by tools/mkfont.mjs from ${source}; do not edit by hand.`,
    `Edit the bitmap and run: node tools/mkfont.mjs --all`,
    `Lowercase a-z repeat the capitals; undrawn characters are blank.`,
    `Original work for ascii-banner, MIT licence (see fonts/block/NOTICE.md).`,
  ];
  const baseline = face.baseline ? face.baseline(height) : height;
  const lines = [`flf2a${HARDBLANK} ${height} ${baseline} ${maxLength} ${OLD_LAYOUT} ${comments.length} 0 0`, ...comments];
  for (const rows of chars) rows.forEach((r, i) => lines.push(r + ENDMARK + (i === rows.length - 1 ? ENDMARK : "")));
  return `${lines.join("\n")}\n`;
}

/** Bitmap path as written into the font: repo-relative with "/", else the bare file name. */
function sourceLabel(path) {
  const rel = relative(ROOT, path);
  return rel.startsWith("..") || isAbsolute(rel) ? basename(path) : rel.split(sep).join("/");
}

function makeFont(bitmapPath, faceName, outPath) {
  let text;
  try {
    text = readFileSync(bitmapPath, "utf8");
  } catch (e) {
    fail(`cannot read ${bitmapPath} (${e.code ?? e.message})`);
  }
  const source = sourceLabel(bitmapPath);
  const flf = buildFlf(parseBitmap(text, source), faceName, source);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, flf);
  const shown = relative(process.cwd(), outPath);
  console.log(`wrote ${shown.startsWith("..") ? outPath : shown} (${faceName}, ${Buffer.byteLength(flf)} bytes)`);
}

const USAGE = `usage:
  node tools/mkfont.mjs <bitmap.txt> --face <name> --out <file.flf>
  node tools/mkfont.mjs --all      regenerate ${BUNDLED_DIR}/<face>.flf from ${BUNDLED_BITMAP}
faces: ${Object.keys(FACES).join(", ")}`;

function main(argv) {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { all: { type: "boolean" }, face: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
    });
  } catch (e) {
    fail(`${e.message}\n${USAGE}`);
  }
  const { values: v, positionals: pos } = args;
  if (v.help || !argv.length) return void console.log(USAGE);
  if (v.all) {
    if (pos.length || v.face || v.out) fail(`--all takes no other arguments\n${USAGE}`);
    for (const face of Object.keys(FACES)) makeFont(resolve(ROOT, BUNDLED_BITMAP), face, resolve(ROOT, BUNDLED_DIR, `${face}.flf`));
    return;
  }
  if (pos.length !== 1 || !v.face || !v.out) fail(`need one bitmap, --face and --out\n${USAGE}`);
  if (!Object.hasOwn(FACES, v.face)) fail(`unknown face "${v.face}"; faces: ${Object.keys(FACES).join(", ")}`);
  makeFont(resolve(pos[0]), v.face, resolve(v.out));
}

try {
  main(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof MkfontError)) throw e;
  console.error(`mkfont: ${e.message}`);
  process.exitCode = 1;
}
