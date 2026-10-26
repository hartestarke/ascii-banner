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
const LEFT_SEVEN_EIGHTHS = "▉";
const LOWER_SEVEN_EIGHTHS = "▇";
const HALF = [" ", LOWER, UPPER, FULL]; // indexed by top * 2 + bottom
const BLOCK = FULL + FULL; // one square design pixel of the full-block faces

// blocks-3d: the letters recede half a design pixel (one column) right and one
// row up, so every stroke shows its top in LOWER_SEVEN_EIGHTHS and its right
// side in LEFT_SEVEN_EIGHTHS: solid tones, unlike the shades, with the eighth
// left clear along each face's far edge. Deeper or wider looked worse: a
// depth as wide as the one-pixel strokes outweighs the letters.
const VOXEL = { dx: 0.5, dy: 1, top: LOWER_SEVEN_EIGHTHS, right: LEFT_SEVEN_EIGHTHS };
// Depth of blocks-iso, nearest level first, one design pixel (two text
// columns, one row) per level.
const DEPTH_GLYPHS = [DARK_SHADE, MEDIUM_SHADE];
// Full-width layout cannot overlap glyphs, so each blocks-iso glyph carries
// its own lean as (height - 1) * ISO_SHEAR plain blank columns, depth rows
// included, which a "fit" layout closes up again (its registry default).
const ISO_SHEAR = 1; // text columns each row sits right of the row below it
// blocks-iso is extruded upright and leant afterwards, so its letter gap moves
// with the depth as blocks-3d's does. ISO_SHEAR columns right per row down
// cancel the lean: the depth falls straight down.
const EXTRUDE_ISO = { dx: ISO_SHEAR, dy: 1, glyphs: DEPTH_GLYPHS };

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
// `gap` is how many hardblank columns every row must end in, before any
// plain-blank lean: what keeps the next letter clear under "fit" (checkGap).
const FACES = {
  blocks: {
    about: "two full blocks per pixel (square pixels), 7 rows",
    gap: GAP_COLS * BLOCK.length,
    render: (bits) => bits.map((row) => row.map((px) => paint(px, BLOCK)).join("")),
  },
  "blocks-shadow": {
    about: "block plus a light-shade drop shadow one column right and one row down, 8 rows",
    gap: GAP_COLS * BLOCK.length - 1, // the shadow takes the first gap column
    baseline: (height) => height - 1, // the last row is only the shadow
    render: (bits) => dropShadow(FACES.blocks.render(bits)),
  },
  pixel: {
    about: "half blocks, two pixel rows per text row (square pixels), 4 rows",
    gap: GAP_COLS,
    render: halfBlocks,
  },
  "blocks-thin": {
    about: "one full block per pixel (tall narrow pixels), 7 rows",
    gap: GAP_COLS,
    render: (bits) => bits.map((row) => row.map((px) => paint(px, FULL)).join("")),
  },
  "blocks-3d": {
    about: "blocks receding one column right and one row up, the top of every stroke in a lower seven-eighths block and its right side in a left seven-eighths block, 8 rows",
    gap: GAP_COLS * BLOCK.length,
    render: (bits) => voxel(bits, VOXEL),
  },
  "blocks-iso": {
    about: "blocks leaning right one column per row, extruded two rows down, dark then medium shade, 9 rows",
    gap: GAP_COLS * BLOCK.length,
    baseline: (height) => height - EXTRUDE_ISO.glyphs.length * EXTRUDE_ISO.dy,
    render: (bits) => shear(extrude(FACES.blocks.render(bits), EXTRUDE_ISO), ISO_SHEAR),
  },
};

/** A row as wide as `row`, blank but for `row`'s trailing hardblank run: the letter gap carried into a row added below the glyph. */
function blankBelow(row) {
  let run = 0;
  while (run < row.length && row[row.length - 1 - run] === HARDBLANK) run++;
  return " ".repeat(row.length - run) + HARDBLANK.repeat(run);
}

/**
 * blocks-iso's depth: the glyph plus one copy of its silhouette per level,
 * level n moved n * dx columns right and n * dy rows down and drawn in
 * glyphs[n - 1] where nothing nearer is drawn. The canvas grows to hold the
 * deepest level; a row that ends in hardblank spacing grows in hardblanks,
 * and the rows added below carry that run, so the spacing stays behind the
 * depth and "fit" cannot pull the next letter onto it.
 */
function extrude(rows, { dx, dy, glyphs }) {
  if (dx < 0 || dy < 0) fail(`extrude: the depth recedes right and down; dx and dy must be >= 0`);
  const depth = glyphs.length;
  const grow = depth * dx;
  const grown = rows.map((r) => r + (r.endsWith(HARDBLANK) ? HARDBLANK : " ").repeat(grow));
  const out = [...grown, ...Array(depth * dy).fill(blankBelow(grown.at(-1)))].map((r) => [...r]);
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

const NONE = 0;
const FRONT = 1;
const TOP = 2;
const RIGHT = 3;
// Where a text cell is sampled, as fractions of its width and height: a cell
// is half a design pixel wide and one tall, and a face has to cover half the
// samples to be drawn.
const VOXEL_SAMPLES = [0.25, 0.75].flatMap((fx) => [0.125, 0.375, 0.625, 0.875].map((fy) => [fx, fy]));

/**
 * The glyph swept `dx` pixels right and `dy` up, drawn as the faces in view:
 * the front in full blocks, the tops of the strokes in `top`, their right
 * sides in `right`. Tracing back from a point along the sweep, the first
 * pixel entered is the one in view; entered at t = 0 it is the front, through
 * its top edge (the trace comes down onto it) a top face, through its right
 * edge a right face. A text cell shows the face most of its samples see. The
 * letters sit on the last row with the depth rising above them, and the gap
 * columns stay hardblanks on every row, so "fit" keeps the letter gap.
 */
function voxel(bits, { dx, dy, top, right }) {
  if (!(dx > 0 && dy > 0)) fail("voxel: the depth recedes right and up; dx and dy must be > 0");
  const H = bits.length;
  const inkW = bits[0].length - GAP_COLS;
  const pixels = [];
  bits.forEach((row, y) => row.forEach((px, x) => px === true && x < inkW && pixels.push([x, y])));
  const faceAt = (px, py) => {
    let t = Infinity;
    let face = NONE;
    for (const [x, y] of pixels) {
      // t at which the trace enters the pixel's column and its row, and leaves them
      const tx = (px - x - 1) / dx;
      const ty = (y - py) / dy;
      const tIn = Math.max(tx, ty);
      const tOut = Math.min((px - x) / dx, (y + 1 - py) / dy);
      if (tIn >= tOut || tOut <= 0 || tIn > 1 || Math.max(0, tIn) >= t) continue;
      t = Math.max(0, tIn);
      face = tIn <= 0 ? FRONT : ty > tx ? TOP : RIGHT;
    }
    return face;
  };
  const ink = [" ", FULL, top, right];
  const blank = pixels.length ? " " : HARDBLANK; // a glyph without ink (the space, undrawn characters) is hardblank throughout
  const cols = BLOCK.length * (inkW + dx + GAP_COLS);
  if (!Number.isInteger(cols)) fail(`voxel: dx must be a multiple of 1/${BLOCK.length} pixel, got ${dx}`);
  const out = [];
  for (let r = 0; r < H + dy; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const x = c / BLOCK.length;
      if (x >= inkW + dx) {
        line += HARDBLANK;
        continue;
      }
      const seen = [0, 0, 0, 0];
      for (const [fx, fy] of VOXEL_SAMPLES) seen[faceAt(x + fx / BLOCK.length, r - dy + fy)]++;
      const [none, front, tops, rights] = seen;
      const face = none > VOXEL_SAMPLES.length / 2 ? NONE : front >= tops && front >= rights ? FRONT : tops >= rights ? TOP : RIGHT;
      line += face === NONE ? blank : ink[face];
    }
    out.push(line);
  }
  return out;
}

/** The glyph plus a SHADE copy one column right and one row down, behind it. */
function dropShadow(rows) {
  const cols = rows[0].length;
  const out = [...rows, blankBelow(rows.at(-1))].map((r) => [...r]);
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
  checkGap(chars, faceName, face.gap);
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

/**
 * Fail unless every row of every glyph, once its plain-blank lean is set
 * aside, ends in `gap` hardblanks: fitted layouts kern up to the first
 * non-space, so ink or depth in those columns would sit flush against the
 * next letter.
 */
function checkGap(chars, faceName, gap) {
  const clear = HARDBLANK.repeat(gap);
  chars.forEach((rows, i) =>
    rows.forEach((r, y) => {
      if (!r.replace(/ +$/, "").endsWith(clear))
        fail(`${faceName}: glyph ${JSON.stringify(String.fromCharCode(FIRST_CODE + i))}, row ${y + 1}, has ink in its last ${gap} gap column(s); "fit" would set the next letter against it`);
    }),
  );
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
