# Block fonts

Four tagline fonts drawn from one original bitmap, `fonts/block/src/hairline.txt`:
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

- **blocks**: the bitmap at ANSI Shadow's scale. A one-pixel gap separates the glyphs.
- **blocks-shadow**: the glyph shifted one column right and one row down,
  drawn in `░` wherever the glyph itself is blank. List `░` in
  `tagline.shadowGlyphs` so the shadow draws at `tagline.shadowAlpha`. This is
  our own ANSI-Shadow-like face.
- **pixel**: the most compact face. The 7 design rows are padded to 8 with a
  blank bottom row, then paired into 4 text rows (`▀` top pixel, `▄` bottom
  pixel, `█` both).
- **blocks-thin**: the cheap variant, with tall narrow letters.

`blocks` and `blocks-shadow` spend two text columns per pixel, and `pixel` and
`blocks-thin` spend one. At the same banner width the first two therefore set at about
half the font size. A 26-glyph punctuation line is 240 columns in `blocks` and
5.6 px on the 880 px template, just under the build's 6 px warning. Short
taglines are fine.

## Samples

`Ab1?`, rendered from the generated `.flf` files by `src/figlet.mjs`:

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
`flf2a$ <height> <height> <maxLength> -1 <comments> 0 0`. Old layout -1 and
full layout 0 mean full width, so glyphs butt together exactly as designed.
After the header come 5 comment lines (source, face, licence), then the glyphs
for ASCII 32–126 in order, with endmark `@` and `@@` on each glyph's last row.
The faces use only Block Elements (U+2580–259F), which are inside the embedded
JetBrains Mono subset.

## Registry entries

For `src/fonts.mjs` (paths relative to the repo root):

```js
{ name: "blocks",        file: "fonts/block/blocks.flf",        shadowGlyphs: "",       layout: "full" },
{ name: "blocks-shadow", file: "fonts/block/blocks-shadow.flf", shadowGlyphs: "░", layout: "full" }, // ░
{ name: "pixel",        file: "fonts/block/pixel.flf",        shadowGlyphs: "",       layout: "full" },
{ name: "blocks-thin",         file: "fonts/block/blocks-thin.flf",         shadowGlyphs: "",       layout: "full" },
```

Until the fonts are registered, a config can point at a file directly:

```js
tagline: { font: "fonts/block/blocks-shadow.flf", shadowGlyphs: "░" },
```
