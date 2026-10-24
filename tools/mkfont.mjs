#!/usr/bin/env node
// mkfont: bake a hand-drawn glyph bitmap into FIGlet (.flf) fonts, one per
// "face" (a way of drawing the bitmap's pixels with Block Elements). Output is
// a pure function of the bitmap, with no dates or absolute paths, so --all
// leaves git status clean. Format and faces: docs/block-fonts.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_BITMAP = "fonts/block/src/hairline.txt";
const BUNDLED_DIR = "fonts/block";

const DESIGN_ROWS = 7;
const DESIGN_MAX_COLS = 5;
const GAP_COLS = 1; // blank design columns after every glyph
const FIRST_CODE = 32; // ' '
const LAST_CODE = 126; // '~'
const ENDMARK = "@";
const HARDBLANK = "$"; // fills the space glyph; renders as a space
const OLD_LAYOUT = -1; // full width: glyphs butt together exactly as drawn
const ON = "#";
const OFF = ".";
const PIXEL_ROW = new RegExp(`^[${ON}${OFF}]+$`);

// Block Elements, all inside the embedded JetBrains Mono subset.
const FULL = "█";
const UPPER = "▀";
const LOWER = "▄";
const SHADE = "░";
const MEDIUM_SHADE = "▒";
const DARK_SHADE = "▓";
const HALF = [" ", LOWER, UPPER, FULL]; // indexed by top * 2 + bottom

// Depth of the 3-D faces, nearest level first. Two text columns and one row
// is one square design pixel, so blocks-3d recedes at 45 degrees.
const DEPTH_GLYPHS = [DARK_SHADE, MEDIUM_SHADE];
const EXTRUDE_3D = { dx: 2, dy: 1, glyphs: DEPTH_GLYPHS };
const EXTRUDE_ISO = { dx: 0, dy: 1, glyphs: DEPTH_GLYPHS };
// Full-width layout cannot overlap glyphs, so each blocks-iso glyph carries
// its own lean as (DESIGN_ROWS - 1) * ISO_SHEAR plain blank columns, which a
// "fit" layout closes up again (its registry default).
const ISO_SHEAR = 1; // text columns each design row sits right of the row below it

// A design pixel is on (true), off (false) or GAP: blank like off, but written
// as hardblanks, which render as spaces yet count as drawn when "fit" and
// "smush" layouts kern. The spacing after every glyph and the whole space
// glyph are GAP, so those layouts keep the one-pixel letter gap and the word gap.
const GAP = null;
const isBlank = (ch) => ch === " " || ch === HARDBLANK;
/** One pixel: `ink` when on, as many hardblanks when GAP, else spaces. */
const paint = (px, ink) => (px ? ink : (px === GAP ? HARDBLANK : " ").repeat(ink.length));

class MkfontError extends Error {}
const fail = (msg) => {
  throw new MkfontError(msg);
};

// render(bits) turns one glyph's pixels (DESIGN_ROWS rows of true / false /
// GAP, gap column included) into text rows, the same number for every glyph
// of a face. Which glyphs a face dims is declared in src/fonts.mjs, not here.
const FACES = {
  blocks: {
    about: "two full blocks per pixel (square pixels), 7 rows",
    render: (bits) => bits.map((row) => row.map((px) => paint(px, FULL + FULL)).join("")),
  },
  "blocks-shadow": {
    about: "block plus a light-shade drop shadow one column right and one row down, 8 rows",
    baseline: (height) => height - 1, // the last row is only the shadow
    render: (bits) => dropShadow(FACES.blocks.render(bits)),
  },
  pixel: {
    about: "half blocks, two pixel rows per text row (square pixels), 4 rows",
    render: halfBlocks,
  },
  "blocks-thin": {
    about: "one full block per pixel (tall narrow pixels), 7 rows",
    render: (bits) => bits.map((row) => row.map((px) => paint(px, FULL)).join("")),
  },
  "blocks-3d": {
    about: "blocks extruded two pixels back to the lower right, dark then medium shade, 9 rows",
    baseline: (height) => height - EXTRUDE_3D.glyphs.length * EXTRUDE_3D.dy, // the depth hangs below
    render: (bits) => extrude(FACES.blocks.render(bits), EXTRUDE_3D),
  },
  "blocks-iso": {
    about: "blocks leaning right one column per row, extruded two rows down, dark then medium shade, 9 rows",
    baseline: (height) => height - EXTRUDE_ISO.glyphs.length * EXTRUDE_ISO.dy,
    render: (bits) => extrude(shear(FACES.blocks.render(bits), ISO_SHEAR), EXTRUDE_ISO),
  },
};

/**
 * The glyph plus one copy of its silhouette per depth level, level n moved
 * n * dx columns right and n * dy rows down and drawn in glyphs[n - 1] where
 * nothing nearer is drawn. The canvas grows to hold the deepest level; a row
 * that ends in hardblank spacing grows in hardblanks, so the spacing stays
 * behind the depth and "fit" cannot pull the next letter onto it.
 */
function extrude(rows, { dx, dy, glyphs }) {
  if (dx < 0 || dy < 0) fail(`extrude: the depth recedes right and down; dx and dy must be >= 0`);
  const depth = glyphs.length;
  const grow = depth * dx;
  const out = [...rows.map((r) => r + (r.endsWith(HARDBLANK) ? HARDBLANK : " ").repeat(grow)), ...Array(depth * dy).fill(" ".repeat(rows[0].length + grow))].map((r) => [...r]);
  for (let level = 1; level <= depth; level++)
    rows.forEach((r, y) =>
      [...r].forEach((ch, x) => {
        const row = out[y + level * dy];
        if (!isBlank(ch) && isBlank(row[x + level * dx])) row[x + level * dx] = glyphs[level - 1];
      }),
    );
  return out.map((r) => r.join(""));
}

/** Each row `step` columns right of the row below it, so the glyph leans right; every row keeps the same width. */
function shear(rows, step) {
  const last = rows.length - 1;
  return rows.map((r, y) => " ".repeat((last - y) * step) + r + " ".repeat(y * step));
}

/** The glyph plus a SHADE copy one column right and one row down, behind it. */
function dropShadow(rows) {
  const cols = rows[0].length;
  const out = [...rows.map((r) => [...r]), Array(cols).fill(" ")];
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch !== FULL) return;
      if (x + 1 >= cols) fail(`blocks-shadow: a pixel touches the right edge; the shadow needs GAP_COLS >= 1`);
      if (isBlank(out[y + 1][x + 1])) out[y + 1][x + 1] = SHADE;
    }),
  );
  return out.map((r) => r.join(""));
}

/** Two design rows per text row; an odd row count gets a blank row at the bottom. A blank cell with a GAP pixel is a hardblank. */
function halfBlocks(bits) {
  const rows = bits.length % 2 ? [...bits, bits[0].map(() => false)] : bits;
  const cell = (top, bottom) => (top || bottom || (top !== GAP && bottom !== GAP) ? HALF[(top ? 2 : 0) + (bottom ? 1 : 0)] : HARDBLANK);
  const out = [];
  for (let y = 0; y < rows.length; y += 2) out.push(rows[y].map((top, x) => cell(top, rows[y + 1][x])).join(""));
  return out;
}

// The bitmap: "# <char>" (or "# space") headers, each followed by DESIGN_ROWS
// rows of ON/OFF, glyphs separated by blank lines, "//" comments.
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

/** The drawn glyph, else (a-z) its capital, else a blank as wide as the space: every printable ASCII character renders. */
function glyphFor(glyphs, ch) {
  if (glyphs.has(ch)) return glyphs.get(ch);
  if (ch >= "a" && ch <= "z" && glyphs.has(ch.toUpperCase())) return glyphs.get(ch.toUpperCase());
  return glyphs.get(" ").map((row) => row.map(() => false));
}

/** The .flf text of one face; `source` is the bitmap path its comments name. */
function buildFlf(glyphs, faceName, source) {
  const face = FACES[faceName];
  const gap = Array(GAP_COLS).fill(GAP);
  const chars = [];
  for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
    const ch = String.fromCharCode(code);
    const pixels = glyphFor(glyphs, ch).map((row) => (ch === " " ? row.map((on) => on || GAP) : row));
    chars.push(face.render(pixels.map((row) => [...row, ...gap])));
  }
  const height = chars[0].length;
  if (chars.some((rows) => rows.length !== height)) fail(`${faceName}: glyphs render to different heights`);
  // Parsers strip trailing endmarks, so a face must not end a row in one.
  if (chars.flat().some((r) => r.endsWith(ENDMARK))) fail(`${faceName}: a glyph row ends in "${ENDMARK}"`);
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

/** Bitmap path as written into the font: repo-relative with "/", else the bare file name, never absolute. */
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
  let v, pos;
  try {
    ({ values: v, positionals: pos } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { all: { type: "boolean" }, face: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
    }));
  } catch (e) {
    fail(`${e.message}\n${USAGE}`);
  }
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
