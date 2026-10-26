# Block fonts

Six tagline fonts drawn from one original bitmap, `fonts/block/src/hairline.txt`:
a classic 5×7 pixel matrix with one-pixel strokes and proportional widths.
`tools/mkfont.mjs` renders that bitmap into FIGlet (`.flf`) files, one per
*face*. A face is a way of drawing pixels with Block Elements. All of it is
original work for this project, under the repo's MIT licence. See
[`fonts/block/NOTICE.md`](../fonts/block/NOTICE.md).

The faces are caps only. Lowercase `a`–`z` repeat the capitals (the same
convention as ANSI Shadow), so `Ab1?` sets as `AB1?`. Every printable ASCII
character has a glyph: the bitmap draws space, `A`–`Z`, `0`–`9` and all 32
punctuation marks, and anything it leaves out is a blank as wide as a space.

## Faces

A text cell is 0.6 em wide and 1.2 em tall (1:2), and that shape sets each face's pixel.

| Face | File | Rows | One pixel is | `shadowGlyphs` |
| --- | --- | --- | --- | --- |
| `blocks` | `fonts/block/blocks.flf` | 7 | two full blocks `██`, square | `""` |
| `blocks-shadow` | `fonts/block/blocks-shadow.flf` | 8 | as `blocks`, plus a light-shade drop shadow | `"░"` (U+2591) |
| `pixel` | `fonts/block/pixel.flf` | 4 | a half block `▀` / `▄`, square; two pixel rows per text row | `""` |
| `blocks-thin` | `fonts/block/blocks-thin.flf` | 7 | one full block `█`, twice as tall as wide | `""` |
| `blocks-3d` | `fonts/block/blocks-3d.flf` | 8 | as `blocks`, receding one column right and one row up: the top of every stroke in `▇`, its right side in `▉` | `"▇▉"` (U+2587, U+2589) |
| `blocks-iso` | `fonts/block/blocks-iso.flf` | 9 | as `blocks`, leaning right half a pixel per row, plus a two-row extrusion straight down in `▓` then `▒` | `"▓▒"` (U+2593, U+2592) |

- **blocks**: the bitmap at ANSI Shadow's scale. A one-pixel gap separates the glyphs.
- **blocks-shadow**: the glyph shifted one column right and one row down,
  drawn in `░` wherever the glyph itself is blank. List `░` in
  `tagline.shadowGlyphs` so the shadow draws at `tagline.shadowAlpha`. This is
  our own ANSI-Shadow-like face. The shadow takes the first column of the
  one-pixel glyph gap, so one blank column remains before the next letter.
- **pixel**: the most compact face. The 7 design rows are padded to 8 with a
  blank bottom row, then paired into 4 text rows (`▀` top pixel, `▄` bottom
  pixel, `█` both).
- **blocks-thin**: the cheap variant, with tall narrow letters.
- **blocks-3d**: the letters as solid blocks receding one column right and
  one row up, drawn as the faces in view: the front in `█`, the top of every
  stroke in `▇` (lower seven-eighths block) and its right side in `▉` (left
  seven-eighths block). Those two are solid tones, unlike the shades, and
  the eighth they leave clear runs along each face's far edge. The generator
  traces every text cell back along the depth: the first pixel the trace
  enters is the one in view, through its top edge for a top face, through
  its right edge for a right face, and a cell shows the face most of its
  samples see. The depth rises above the letters, so the baseline stays on
  the last row, and each glyph grows by one column so one blank pixel still
  separates it from the next letter.
- **blocks-iso**: `blocks` sheared so that each text row sits one column
  right of the row below it (about 27°, close to an isometric lean), then the
  same two levels extruded straight down, which under the lean read as the
  underside and right side of a slab. The depth fills the one-pixel glyph
  gap, and each glyph grows by 2 columns so one blank pixel still separates it
  from the next letter. Full-width layout cannot overlap glyphs, so each glyph
  carries its own lean as 8 columns of blank padding, one per row below the
  top. The face therefore defaults to layout `fit`, which closes the padding
  up between letters and keeps the blank pixel after the depth.

List the depth glyphs in `tagline.shadowGlyphs` (the bundled defaults: `▇▉`
for `blocks-3d`, `▓▒` for `blocks-iso`) so the depth draws at
`tagline.shadowAlpha` and reads as a side plane rather than as part of the
letter.

`blocks` and `blocks-shadow` spend two text columns per pixel, and `pixel` and
`blocks-thin` spend one. At the same banner width the first two therefore set at about
half the font size. A 26-glyph punctuation line is 240 columns in `blocks` and
5.6 px on the 880 px template, just under the build's 6 px warning. Short
taglines are fine.

The 3-D faces cost both ways. Width: a 5-pixel letter takes 13 columns in
`blocks-3d` against 12 in `blocks`, and `blocks-iso` takes 14 plus 6
columns of lean once per line (22 per letter under `full`); `hello world` is
139 and 156 columns, which the 880 px template's width alone sets at 9.7 and
8.6 px. Height: `blocks-3d` is 8 rows (the face's 7 plus 1 of depth) and
`blocks-iso` 9 (7 plus 2), and `tagline.maxHeight` (0.34 of the banner
height by default) caps them all, so a tagline bound by height sets its
letters at 7/8 or 7/9 of the size `blocks` gets. For a single tagline, set
`tagline.maxHeight: 0.39` for `blocks-3d` or `0.45` for `blocks-iso` (0.34 ×
8/7 and × 9/7) to give the face its height back. That pays off for up to
about ten letters in `blocks-3d` and nine in `blocks-iso` on the template;
longer taglines are bound by the width anyway.

The letter gap and the space glyph are drawn in hardblanks (`$`), which
render as spaces but are never kerned away, so `tagline.layout: "fit"` keeps
the one-pixel letter gap and the word gap: it sets every block face exactly
as `full` does, except `blocks-iso`, where it removes the lean padding.

## Samples

`Ab1?`, rendered from the generated `.flf` files by `src/figlet.mjs` (the
[gallery](gallery/README.md#fonts) shows each face in a banner):

### blocks

<!-- sample:blocks -->

```text
  ██████    ████████      ██      ██████
██      ██  ██      ██  ████    ██      ██
██      ██  ██      ██    ██            ██
██████████  ████████      ██          ██
██      ██  ██      ██    ██        ██
██      ██  ██      ██    ██
██      ██  ████████    ██████      ██
```

<!-- /sample -->

### blocks-shadow

<!-- sample:blocks-shadow -->

```text
  ██████    ████████      ██      ██████
██ ░░░░░██  ██░░░░░░██  ████░   ██ ░░░░░██
██░     ██░ ██░     ██░  ░██░    ░░     ██░
██████████░ ████████ ░░   ██░         ██ ░░
██░░░░░░██░ ██░░░░░░██    ██░       ██ ░░
██░     ██░ ██░     ██░   ██░        ░░
██░     ██░ ████████ ░░ ██████      ██
 ░░      ░░  ░░░░░░░░    ░░░░░░      ░░
```

<!-- /sample -->

### pixel

<!-- sample:pixel -->

```text
▄▀▀▀▄ █▀▀▀▄ ▄█  ▄▀▀▀▄
█▄▄▄█ █▄▄▄▀  █     ▄▀
█   █ █   █  █    ▀
▀   ▀ ▀▀▀▀  ▀▀▀   ▀
```

<!-- /sample -->

### blocks-thin

<!-- sample:blocks-thin -->

```text
 ███  ████   █   ███
█   █ █   █ ██  █   █
█   █ █   █  █      █
█████ ████   █     █
█   █ █   █  █    █
█   █ █   █  █
█   █ ████  ███   █
```

<!-- /sample -->

### blocks-3d

<!-- sample:blocks-3d -->

```text
  ▇▇▇▇▇▇▇    ▇▇▇▇▇▇▇▇▇      ▇▇▇      ▇▇▇▇▇▇▇
▇▇██████▇▇▇  ████████▇▇▇  ▇▇██▉    ▇▇██████▇▇▇
██▉     ██▉  ██▉     ██▉  ████▉    ██▉     ██▉
██▇▇▇▇▇▇██▉  ██▇▇▇▇▇▇██▉    ██▉          ▇▇██▉
██████████▉  ████████▇▇▇    ██▉        ▇▇██▉
██▉     ██▉  ██▉     ██▉    ██▉        ██▉
██▉     ██▉  ██▇▇▇▇▇▇██▉  ▇▇██▇▇▇      ▇▇▇
██▉     ██▉  ████████▉    ██████▉      ██▉
```

<!-- /sample -->

### blocks-iso

<!-- sample:blocks-iso -->

```text
          ██████              ████████                ██                ██████
       ██ ▓▓▓▓▓██            ██▓▓▓▓▓▓██            ████▓             ██ ▓▓▓▓▓██
      ██▓ ▒▒▒▒██▓           ██▓▒▒▒▒▒██▓            ▓██▓▒             ▓▓ ▒▒▒▒██▓
     ██████████▓▒          ████████ ▓▓▒            ██▓▒              ▒▒  ██ ▓▓▒
    ██▓▓▓▓▓▓██▓▒          ██▓▓▓▓▓▓██▒▒            ██▓▒                ██ ▓▓ ▒▒
   ██▓▒▒▒▒▒██▓▒          ██▓▒▒▒▒▒██▓             ██▓▒                 ▓▓ ▒▒
  ██▓▒    ██▓▒          ████████ ▓▓▒          ██████                ██▒▒
  ▓▓▒     ▓▓▒           ▓▓▓▓▓▓▓▓ ▒▒           ▓▓▓▓▓▓                ▓▓
  ▒▒      ▒▒            ▒▒▒▒▒▒▒▒              ▒▒▒▒▒▒                ▒▒
```

<!-- /sample -->

To preview any text in a face:

```sh
node --input-type=module -e 'import { loadFlf, figlet } from "./src/figlet.mjs";
console.log(figlet(loadFlf("fonts/block/blocks-shadow.flf"), "Hello").join("\n"))'
```

## Bitmap format

`fonts/block/src/hairline.txt` is a plain-text glyph atlas:

```text
// comment lines start with "//"

# A
.###.
#...#
#...#
#####
#...#
#...#
#...#

# space
...
```

- A glyph starts with a header line `# <char>`, written `# space` for the
  space. The char is one printable ASCII character, so `# #` is the hash glyph.
- The header is followed by exactly 7 rows of `#` (pixel on) and `.` (off).
  All rows of a glyph have the same width, 1 to 5 columns. Widths are
  proportional, e.g. `I` and `1` are 3 wide, `!`, `.` and `|` are 1 wide.
- A blank line ends the glyph. A pixel row after a blank line without a new
  header is an error.
- Draw no spacing. The generator appends one blank pixel column after every
  glyph, including the space, which is 3 wide, so a word gap is 5 pixels.
- Row 7 is the baseline. There are no descenders: `,` and `;` hang their tail
  on row 7, and their dot sits on row 6.
- Lowercase is optional. An undrawn `a`–`z` falls back to its capital.

`mkfont` fails loudly, naming the file and line, on a malformed header, a
wrong row count, ragged rows, a glyph wider than 5, a glyph drawn twice or a
missing space glyph.

## Generator

```sh
node tools/mkfont.mjs --all                                   # regenerate fonts/block/<face>.flf
node tools/mkfont.mjs <bitmap.txt> --face <name> --out <file.flf>
```

Zero dependencies, Node >= 20. The output depends only on the bitmap and the
face: there are no dates or absolute paths, so running `--all` twice leaves
`git status` clean. Each file has the header
`flf2a$ <height> <baseline> <maxLength> -1 <comments> 0 0`, where the
baseline is the face's last row, above any shadow or depth. Old layout -1 and
full layout 0 mean full width, so glyphs butt together exactly as designed.
After the header come 5 comment lines (source, face, licence), then the glyphs
for ASCII 32–126 in order, with endmark `@` and `@@` on each glyph's last row.
The faces use only Block Elements (U+2580–259F), which are inside the embedded
JetBrains Mono subset.

## Registration

The six faces are registered in `src/fonts.mjs` as `blocks`, `blocks-shadow`,
`blocks-thin`, `pixel`, `blocks-3d` and `blocks-iso`, with layout `full`
(`fit` for `blocks-iso`) and
the `shadowGlyphs` from the table above, so `tagline: { font: "blocks-shadow" }`
is all a config needs. For a single tagline in a 3-D face, add
`maxHeight: 0.39` (`blocks-3d`) or `0.45` (`blocks-iso`), see [Faces](#faces).
