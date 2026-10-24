# Tagline fonts

Taglines are set in a figlet (`.flf`) font. Twenty are bundled; `ascii-banner
fonts` lists them, `ascii-banner fonts --sample "Hello"` renders a sample in
each, and the [gallery](gallery/README.md#fonts) shows each one in a banner.

| Name | Style | Author (from the font header) | Licence | Layout default | Lowercase |
|---|---|---|---|---|---|
| `ansi-shadow` | Solid `█` block letters with a box-drawing drop shadow | not named (`Font Author: ?`); a TheDraw font converted with patorjk.com's FIGfont editor | none stated, see [`fonts/ANSI-SHADOW-NOTICE.md`](../fonts/ANSI-SHADOW-NOTICE.md) | `full` (header: fit) | no, draws capitals |
| `standard` | The classic figlet face drawn with `_ \| / \` strokes | Glenn Chappell & Ian Chai | BSD-3-Clause | `header` = smush, rules 1-4 | yes |
| `big` | Standard drawn taller (8 rows) | Glenn Chappell | BSD-3-Clause | `header` = smush, rules 1-4 | yes |
| `slant` | Standard leaning to the right | Glenn Chappell | BSD-3-Clause | `header` = smush, rules 1-4 | yes |
| `small` | Compact Standard (5 rows) | Glenn Chappell | BSD-3-Clause | `header` = smush, rules 1-4 | yes |
| `shadow` | Open letters with a drop shadow to the lower right | Glenn Chappell | BSD-3-Clause | `header` = universal smush | yes |
| `block` | Heavy upright letters built from `_\|` cells | Glenn Chappell | BSD-3-Clause | `header` = fit | yes |
| `lean` | Block's letters slanted, built from `_/` cells | Glenn Chappell | BSD-3-Clause | `header` = fit | yes |
| `mini` | Tiny letters, three visible rows | Glenn Chappell | BSD-3-Clause | `header` = universal smush | yes |
| `script` | Cursive handwriting | Glenn Chappell | BSD-3-Clause | `header` = fit | yes |
| `digital` | Each character boxed in a `+-+` cell | Glenn Chappell | BSD-3-Clause | `header` = smush, rule 1 | yes |
| `banner` | Large letters made of `#`, like the Unix `banner` program | Ryan Youck | BSD-3-Clause | `header` = fit | yes |
| `bubble` | Each character inside a round bubble | Glenn Chappell | BSD-3-Clause | `header` = smush, rules 1-4 | yes |
| `smslant` | Small slanted letters | Glenn Chappell | BSD-3-Clause | `header` = smush, rules 1-4 | yes |
| `smshadow` | Small letters with a drop shadow | Glenn Chappell | BSD-3-Clause | `header` = universal smush | yes |
| `smscript` | Small cursive | Glenn Chappell | BSD-3-Clause | `header` = fit | yes |
| `blocks` | Square pixels drawn as `██` pairs, ANSI Shadow's scale | this project | MIT, see [`fonts/block/NOTICE.md`](../fonts/block/NOTICE.md) | `full` (header: full) | no, draws capitals |
| `blocks-shadow` | `blocks` with a `░` light-shade drop shadow | this project | MIT | `full` (header: full) | no, draws capitals |
| `blocks-thin` | One `█` per pixel: tall, narrow letters | this project | MIT | `full` (header: full) | no, draws capitals |
| `pixel` | Half blocks `▀` `▄`, two pixel rows per text row; the most compact | this project | MIT | `full` (header: full) | no, draws capitals |

The fifteen FIGlet fonts come verbatim from the official FIGlet distribution;
[`fonts/figlet/NOTICE.md`](../fonts/figlet/NOTICE.md) records the source
commit, the licence ([`fonts/figlet/LICENSE`](../fonts/figlet/LICENSE)) and
every author and modifier named in their headers. The four block faces are
original work for this project, generated from one bitmap by
`tools/mkfont.mjs`; [block-fonts.md](block-fonts.md) describes them.

## `tagline.font`

A bundled font name from the table, or a path to any `.flf` file, relative to
the config file (absolute paths work too). A bundled name wins over a file of
the same name in the config's directory: write `"./standard.flf"` to use such
a file.

Only the printable ASCII glyphs (`' '` to `'~'`) are read. A character outside
them renders as the font's `?` glyph and the build prints a warning. Every
character a font draws must also exist in the embedded web font (the bundled
JetBrains Mono subset covers ASCII, Box Drawing and Block Elements), or the
build stops with an error. All fifteen FIGlet fonts draw plain ASCII only, and
the block faces only Block Elements.
`ansi-shadow` draws `+ = | { }` as blanks, and its `$` uses `·`, which the
bundled subset lacks: a `$` in a tagline set in `ansi-shadow` needs your own
`font.file`.

## `tagline.layout`

How glyphs are spaced, as figlet does it (FIGfont version 2 horizontal layout,
left to right):

- `"full"`: glyphs butted together at their full drawn width.
- `"fit"`: glyphs moved together until they touch (kerning).
- `"smush"`: one column further, where the touching characters merge by the
  font's own smushing rules (equal character, underscore, hierarchy, opposite
  pair, big X, hardblank). A font that defines no rules gets universal
  smushing: the later glyph's character wins. This is figlet's `-S`.
- `"header"`: whatever the `.flf` header asks for. This is figlet's default.
  The full_layout header field decides when present, otherwise old_layout
  (-1 full, 0 fit, positive smush with those rules; like figlet, rule 6 is not
  taken from old_layout).
- `null` (the default): the bundled font's default from the table above, or
  `"header"` for a font given as a path.

With `"header"`, the fifteen FIGlet fonts render exactly as figlet and pyfiglet
render them.

`ansi-shadow` defaults to `"full"` although its header asks for fitting: the
tool has always set it full width and the default banner is tuned to that.
Set `layout: "fit"` to get figlet's own spacing for it.

## `tagline.shadowGlyphs`

Glyphs drawn at `tagline.shadowAlpha`; every other glyph is drawn solid. `null`
(the default) takes the bundled font's set: `"═║╔╗╚╝"` for `ansi-shadow`
(its box-drawing shadow), `"░"` for `blocks-shadow`, `""` (single tone) for
the other block faces, the fifteen FIGlet fonts and a font given as a path. The FIGlet `shadow` and `smshadow` fonts draw
their shadow with the same `_ | / \` strokes as the letter edges, so no glyph
set separates the two. Set an explicit string to override, `""` to turn the
second tone off.
