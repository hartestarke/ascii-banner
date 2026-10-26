<img src="banner.svg" width="880" alt="ascii-banner demo: a drifting ASCII wave field with decoding block-letter taglines">

# ascii-banner

An animated ASCII banner for your GitHub README, baked into one self-contained SVG. A brightness field is pushed through a glyph ramp and precomputed into a CSS frame-flip loop, because README images allow no JavaScript. Taglines set in a figlet font appear on top, one after another. Eleven field presets (or your own function, or none), seven reveals (or none), twenty bundled fonts and eight glyph sets, all picked in one config file. Zero dependencies, Node ≥ 20.

## Examples

Four looks from [`docs/examples/`](docs/examples), each with its config; `npm run examples` rebuilds them.

<img src="docs/examples/stars-3d.svg" width="880" alt="stars field drawn in dots under a four-colour gradient, two-tone blocks-3d taglines falling in">

```js
export default {
  taglines: ["counting stars", "blocks 3d"],
  tagline: { font: "blocks-3d", maxHeight: 0.45, color: "#2D8CE6", shadowColor: "#8A5CF6" },
  field: {
    preset: "stars", loopSeconds: 12, ramp: "dots", bands: 1, options: { density: 0.08, drift: 2 },
    gradient: ["#14A38B", "#2D8CE6", "#8A5CF6", "#E62D42"],
  },
  reveal: { preset: "fall", seconds: 1.8, hold: 3.6 },
};
```

<img src="docs/examples/caustics-wipe.svg" width="880" alt="caustics field in three shades of cyan, slanted taglines wiped in from the centre">

```js
export default {
  taglines: ["caustics", "wipe center"],
  tagline: { font: "slant", color: "#2D8CE6" },
  field: { preset: "caustics", loopSeconds: 12, colors: ["#0E7490", "#0891B2", "#06B6D4"] },
  reveal: { preset: "wipe", seconds: 1.4, hold: 3.6, options: { direction: "center" } },
};
```

<img src="docs/examples/rain-pool.svg" width="880" alt="green rain field, taglines scrambled in with classic ASCII noise">

```js
export default {
  accent: "#3FB950",
  taglines: ["rain field", "classic pool"],
  tagline: { font: "standard" },
  field: { preset: "rain", loopSeconds: 12 },
  reveal: { preset: "scramble", seconds: 2, hold: 3.6, pool: "classic" },
};
```

<img src="docs/examples/vortex-glitch.svg" width="880" alt="vortex field in the default red, big taglines glitching in">

```js
export default {
  taglines: ["vortex", "glitch out"],
  tagline: { font: "big" },
  field: { preset: "vortex", loopSeconds: 12 },
  reveal: { preset: "glitch", seconds: 1.8, hold: 3.6 },
};
```

## Quick start A: template repo

1. Click **Use this template** on this repo.
2. Edit `banner.config.mjs` (taglines, accent, size; every knob is listed there with its default).
3. Push. The `banner` workflow rebuilds `banner.svg` and commits it back.

## Quick start B: an existing repo

```sh
npx --yes github:hartestarke/ascii-banner init     # writes banner.config.mjs
# edit banner.config.mjs
npx --yes github:hartestarke/ascii-banner build    # writes banner.svg
```

Then put `<img src="banner.svg" width="880" alt="">` in your README. To rebuild on push, add `.github/workflows/banner.yml`:

```yaml
name: banner
on:
  push:
    branches: [main]
    paths: [banner.config.mjs]
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: banner
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx --yes github:hartestarke/ascii-banner#v0.3.0 build
      - run: |
          git add banner.svg
          git diff --cached --quiet -- banner.svg && exit 0
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -m "Rebuild banner" && git push
```

## Pick a look

The previews are animated SVGs: 440 × 120, a 6 s field loop at 6 fps, default options, the `ansi-shadow` font. `npm run gallery` rebuilds them; the [gallery page](docs/gallery/README.md) lists their sizes and shows all twenty fonts.

**Fields** (`field.preset`; tune with `field.options`, see [docs/fields.md](docs/fields.md)):

<table>
<tr>
<td align="center"><img src="docs/gallery/field-waves.svg" width="440" alt="waves field"><br><code>waves</code></td>
<td align="center"><img src="docs/gallery/field-stars.svg" width="440" alt="stars field"><br><code>stars</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/field-rain.svg" width="440" alt="rain field"><br><code>rain</code></td>
<td align="center"><img src="docs/gallery/field-caustics.svg" width="440" alt="caustics field"><br><code>caustics</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/field-ripples.svg" width="440" alt="ripples field"><br><code>ripples</code></td>
<td align="center"><img src="docs/gallery/field-interference.svg" width="440" alt="interference field"><br><code>interference</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/field-halo.svg" width="440" alt="halo field"><br><code>halo</code></td>
<td align="center"><img src="docs/gallery/field-mesh.svg" width="440" alt="mesh field"><br><code>mesh</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/field-contour.svg" width="440" alt="contour field"><br><code>contour</code></td>
<td align="center"><img src="docs/gallery/field-vortex.svg" width="440" alt="vortex field"><br><code>vortex</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/field-sharks.svg" width="440" alt="sharks field"><br><code>sharks</code></td>
<td></td>
</tr>
</table>

**Reveals** (`reveal.preset`; tune with `reveal.options`, see [docs/reveals.md](docs/reveals.md)):

<table>
<tr>
<td align="center"><img src="docs/gallery/reveal-scramble.svg" width="440" alt="scramble reveal"><br><code>scramble</code></td>
<td align="center"><img src="docs/gallery/reveal-decrypt.svg" width="440" alt="decrypt reveal"><br><code>decrypt</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/reveal-typewriter.svg" width="440" alt="typewriter reveal"><br><code>typewriter</code></td>
<td align="center"><img src="docs/gallery/reveal-wipe.svg" width="440" alt="wipe reveal"><br><code>wipe</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/reveal-dissolve.svg" width="440" alt="dissolve reveal"><br><code>dissolve</code></td>
<td align="center"><img src="docs/gallery/reveal-fall.svg" width="440" alt="fall reveal"><br><code>fall</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/reveal-glitch.svg" width="440" alt="glitch reveal"><br><code>glitch</code></td>
<td align="center"><img src="docs/gallery/reveal-none.svg" width="440" alt="no reveal"><br><code>none</code></td>
</tr>
</table>

**Glyph sets** (`field.ramp`, `reveal.pool`; the sets beyond ASCII with `field.bands: 1`, see [docs/fields.md](docs/fields.md#the-field-block)):

<table>
<tr>
<td align="center"><img src="docs/gallery/set-classic.svg" width="440" alt="classic glyph set"><br><code>classic</code></td>
<td align="center"><img src="docs/gallery/set-digits.svg" width="440" alt="digits glyph set"><br><code>digits</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/set-dots.svg" width="440" alt="dots glyph set"><br><code>dots</code></td>
<td align="center"><img src="docs/gallery/set-squares.svg" width="440" alt="squares glyph set"><br><code>squares</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/set-shapes.svg" width="440" alt="shapes glyph set"><br><code>shapes</code></td>
<td align="center"><img src="docs/gallery/set-shade.svg" width="440" alt="shade glyph set"><br><code>shade</code></td>
</tr>
<tr>
<td align="center"><img src="docs/gallery/set-binary.svg" width="440" alt="binary glyph set"><br><code>binary</code></td>
<td align="center"><img src="docs/gallery/set-lines.svg" width="440" alt="lines glyph set"><br><code>lines</code></td>
</tr>
</table>

**Colours** (`field.colors`, `field.gradient`, `tagline.color`, `tagline.shadowColor`, see [docs/fields.md](docs/fields.md#colours); the gallery page lists the hues):

<table>
<tr>
<td align="center"><img src="docs/gallery/color-bands.svg" width="290" alt="per-band field colours"><br><code>field.colors</code></td>
<td align="center"><img src="docs/gallery/color-gradient.svg" width="290" alt="field gradient"><br><code>field.gradient</code></td>
<td align="center"><img src="docs/gallery/color-two-tone.svg" width="290" alt="two-tone tagline"><br><code>tagline.color</code> + <code>shadowColor</code></td>
</tr>
</table>

To use one:

```js
export default {
  field: { preset: "rain", options: { tail: 8 } },
  reveal: { preset: "wipe", options: { direction: "center" } },
  tagline: { font: "blocks-shadow" },
};
```

## Config reference

`banner.config.mjs` lists every key with its default and a comment; this is the same list in tables. Leave a key out to keep its default. Unknown keys and wrong types fail the build with the key's name.

### Size, accent, taglines

| Key | Default | Meaning |
| --- | --- | --- |
| `size.width`, `size.height` | `880`, `240` | viewBox in px; the `<img>` scales it. Raw file size grows with width × height |
| `accent` | `"#E62D42"` | the base hue: field, taglines and shadows default to this colour at different alphas, so the banner reads on every theme. `tagline.color` / `shadowColor` and `field.colors` / `gradient` override it per part |
| `taglines` | `["hello world", "ascii banner", "make it yours"]` | lines revealed one after another; `[]` = pure field. A character the font lacks renders as its `?` and the build warns |

### `tagline`

| Key | Default | Meaning |
| --- | --- | --- |
| `tagline.fill` | `0.92` | the widest tagline spans at most this fraction of the width... |
| `tagline.maxHeight` | `0.34` | ...and the letters at most this fraction of the height |
| `tagline.lineHeight` | `1.2` | row pitch in em; block glyphs span -0.3..1.02 em, so ≤ 1.32 stays seamless |
| `tagline.shadowAlpha` | `0.5` | alpha of the shadow glyphs vs the solid ones |
| `tagline.color` | `null` | `#rrggbb` of the letters and of what a reveal draws in letter colour (scramble and decrypt noise, glitch flashes, typewriter cursor); `null` = `accent` |
| `tagline.shadowColor` | `null` | `#rrggbb` of the shadow glyphs, still at `shadowAlpha`; `null` = `tagline.color` |
| `tagline.knockout` | `6` | px of field cleared around the letters; `0` = off |
| `tagline.font` | `"ansi-shadow"` | a bundled font (`ascii-banner fonts` lists them) or a path to any `.flf`, relative to the config file; an unknown name fails with the list. `ansi-shadow` and the block faces are caps only |
| `tagline.layout` | `null` | glyph spacing: `"full"` (butted), `"fit"` (moved until they touch), `"smush"` (merged where they touch), `"header"` (as the `.flf` says); `null` = the font's default: `"fit"` for `blocks-iso`, `"full"` for `ansi-shadow` and the other block faces, `"header"` for the FIGlet fonts and paths |
| `tagline.shadowGlyphs` | `null` | figlet glyphs drawn at `shadowAlpha`; `null` = the font's set (`"═║╔╗╚╝"` for `ansi-shadow`, `"░"` for `blocks-shadow`, `"▓▒"` for `blocks-3d` and `blocks-iso`, `""` = single tone otherwise) |

### `reveal`

| Key | Default | Meaning |
| --- | --- | --- |
| `reveal.preset` | `"scramble"` | `"scramble"`, `"decrypt"`, `"typewriter"`, `"wipe"`, `"dissolve"`, `"fall"`, `"glitch"`, or `"none"`: each line shown settled for its slot, no animation |
| `reveal.seconds` | `2.2` | seconds a line spends revealing |
| `reveal.hold` | `5.8` | seconds a settled line holds before the next one starts |
| `reveal.fps` | `20` | step rate of stepped reveals; scramble reads as noise below ~15 |
| `reveal.pool` | `null` | glyphs of scramble's and decrypt's noise and glitch's flashes: a glyph set name (see `field.ramp`) or your own string, spaces ignored; `null` = the field's ramp (over `rain` that is all bars; `"classic"` mixes the noise up) |
| `reveal.options` | the preset's | the preset's own knobs, merged over its defaults; unknown ones are an error, so replace them when you switch preset. `ascii-banner presets` lists them, [docs/reveals.md](docs/reveals.md) explains them |

### `field`

| Key | Default | Meaning |
| --- | --- | --- |
| `field.fontSize` | `14` | field glyph size, px; bigger = fewer cells = smaller file |
| `field.rowPitch` | `16` | px between field rows |
| `field.fps` | `10` | flipbook rate; about half a column of motion per flip, the finest the grid shows. `0` = a still field: one frame, the one at `stillAt` |
| `field.loopSeconds` | `20` | loop length; `fps × loopSeconds` frames, and file size scales with it |
| `field.stillAt` | `7` | second of the loop shown under `prefers-reduced-motion` and by `fps: 0`; must be below `loopSeconds` |
| `field.alpha.lo`, `field.alpha.hi` | `0.3`, `0.95` | field alpha from the dimmest to the brightest band |
| `field.colors` | `null` | 1–3 `#rrggbb`, dimmest band first, the last filling the bands past it; `null` = `[accent]` ([docs/fields.md](docs/fields.md#colours)) |
| `field.gradient` | `null` | 2–8 `#rrggbb` stops spread left → right across the width, every band at its own alpha; not with `colors` |
| `field.bands` | `null` | alpha bands the ramp levels fold into: `3` = lo / mid / hi, `2` = lo / hi, `1` = all at hi (smallest file); `null` = the preset's |
| `field.ramp` | `null` | glyph ramp, dim → bright, levels separated by spaces, the characters of one level interchangeable variants. Or a glyph set: `classic`, `digits`, `dots`, `squares`, `shapes`, `shade`, `binary`, `lines` (a single lowercase word is read as a set name). A glyph beyond ASCII costs 3 bytes: on a dense field pair those sets with `bands: 1`. `null` = the preset's (waves: `classic`, `":. !/ \\\| 1? 7* 25 %0 &# 8@"`) |
| `field.gamma` | `1.35` | > 1 deepens the dark side of the gradient (not applied to `sample`) |
| `field.dither` | `0` | `0` = plain quantising with a little per-cell jitter; `2`, `4` or `8` = ordered (Bayer) dither of that size |
| `field.preset` | `"waves"` | `waves`, `stars`, `rain`, `caustics`, `ripples`, `interference`, `halo`, `mesh`, `contour`, `vortex` or `sharks`; `"none"` = no field and no knockout mask, taglines only |
| `field.options` | the preset's | the preset's own knobs, merged over its defaults; unknown keys are an error. `ascii-banner presets` lists them, [docs/fields.md](docs/fields.md) explains them |
| `field.sample` | `null` | `(x, y, t) => [0, 1]` replacing the preset; x, y = cell centre in px, t = seconds into the loop. Keep it periodic over `loopSeconds` or the build warns |

### `font` and `budget`

| Key | Default | Meaning |
| --- | --- | --- |
| `font.file` | `null` | `null` = the bundled JetBrains Mono subset; or a path to your own `.woff2` |
| `font.advance` | `0.6` | that font's glyph advance in em |
| `budget.maxBytes` | `1048576` | the build fails above this many raw bytes; `0` = no limit |

**Legacy keys.** Configs from before the presets still build: a top-level `decode: { seconds, hold, fps, ...options }` means `reveal: { preset: "scramble", ... }` (giving both is an error), and `field.waves` / `field.drive` are aliases of the waves preset's options.

## CLI

```sh
ascii-banner init [dir] [--force]                    # write the commented banner.config.mjs into dir (default .)
ascii-banner build [--config <path>] [--out <path>]  # render it (default ./banner.config.mjs → ./banner.svg)
ascii-banner fonts [--sample <text>]                 # list the bundled tagline fonts; --sample renders <text> in each
ascii-banner presets [--json]                        # list the field and reveal presets with their option defaults
```

Run it as `npx --yes github:hartestarke/ascii-banner <command>`, or `node bin/ascii-banner.mjs <command>` in a clone. `--config` and `--out` are relative to the current directory, asset paths inside the config (`tagline.font`, `font.file`) to the config file. Exit codes: 0 ok, 1 config/user error, 2 bug.

## Docs

- [docs/fields.md](docs/fields.md): every field preset, its options and bytes; glyph sets, colours, no field and a still field; writing a `sample` function or a preset.
- [docs/reveals.md](docs/reveals.md): the reveal contract, every preset's options and bytes, `tagline.color`, `reveal.pool`; writing a preset.
- [docs/fonts.md](docs/fonts.md): the bundled fonts, `tagline.font`, `tagline.layout`, `tagline.shadowGlyphs`.
- [docs/block-fonts.md](docs/block-fonts.md): the six original block faces, their bitmap format and generator.
- [docs/gallery/README.md](docs/gallery/README.md): every field, reveal, font and glyph set rendered small, and three colour samples.
- [CHANGELOG.md](CHANGELOG.md): what changed in each version and what breaks a config on upgrade.

## Hacking

**Your own field.** `field.sample` gets the cell centre in px and the time in seconds and returns brightness in [0, 1]; the ramp, dither, bands and animation stay the same. Keep it periodic over `loopSeconds`:

```js
const LOOP = 12; // busy patterns cost more bytes per frame: a shorter loop keeps it under budget
export default {
  field: {
    loopSeconds: LOOP,
    // concentric ripples drifting out from the left third
    sample: (x, y, t) => {
      const r = Math.hypot(x - 300, (y - 120) * 2);
      return 0.5 + 0.5 * Math.sin(r / 40 - (2 * Math.PI * t) / LOOP);
    },
  },
};
```

A reusable field or reveal is a preset: a module in `src/fields/` or `src/reveals/` plus one registry line; [docs/fields.md](docs/fields.md) and [docs/reveals.md](docs/reveals.md) give the contract.

**Another figlet font.** `tagline.font: "./fonts/doom.flf"` (relative to the config file). Glyphs not in the font render as its `?`; set `tagline.shadowGlyphs` to whatever that font uses for its shadow, or leave it `null` for a single tone.

**Custom font.** The bundled subset covers printable ASCII, a few dots, Box Drawing, Block Elements and the Geometric Shapes JetBrains Mono has (303 glyphs, listed in `fonts/NOTICE.md`). For anything else, subset your own monospace font and point `font.file` at it (set `font.advance` if it isn't 0.6 em):

```sh
pyftsubset YourMono.ttf --text-file=glyphs.txt --flavor=woff2 \
  --no-hinting --layout-features='' --output-file=my-font.woff2
```

`--layout-features=''` matters: it strips ligatures and contextual alternates, so runs like `//`, `||` and `??` in the field never fuse into one glyph and break the grid. With a custom font the glyph-coverage check is skipped (the build prints what it must contain).

## How it works

- **No background.** GitHub's `<picture>`/`prefers-color-scheme` follows the OS, not the GitHub theme setting, so a per-theme image is unreliable. A transparent banner blends with every theme (including dark dimmed); the default palette is theme-neutral: accent hue only, glyph weight plus alpha carry the gradient, no lift towards white. Extra hues (`field.colors`, `tagline.color`, ...) keep that only if each reads on both white and near-black.
- **Embedded font.** A JetBrains Mono subset is inlined as base64: identical rendering everywhere and an exact column pitch, so no overscan columns. Its layout tables are stripped (and `font-variant-ligatures:none` is set), so `//` `||` `??` never ligate.
- **Field.** The preset (or `field.sample`) gives a brightness in [0, 1] for every cell of every frame. Presets use whole cycles and whole drifts per loop, so the seam is exact; the build checks it. Each value lands on a ramp level, and the levels fold into one to three alpha bands. Every frame row is written in whichever of two encodings is shorter: one `<text>` per band, or one `<text>` with a `<tspan>` per glyph run. Dense, banded fields favour the first, sparse ones the second. A CSS animation flips the frames. Each band fills with its `field.colors` entry, or with one horizontal `<linearGradient>` across the width at the band's alpha when `field.gradient` is set.
- **No field, a still field.** `field.preset: "none"` writes no frames and no knockout mask; `field.fps: 0` writes the one frame at `stillAt` and no flipbook animation, so with a single tagline and `reveal.preset: "none"` the SVG has no `@keyframes` at all.
- **Taglines.** Figlet rows, two-tone: the font's shadow glyphs at `shadowAlpha` in `tagline.shadowColor`, the rest solid in `tagline.color` (both the accent by default). Each line owns a slot in the tagline loop, is hidden outside it, reveals over `seconds` and then holds settled; the settled line is identical whichever reveal drew it.
- **Reveals.** Each preset hides and shows with CSS-animated clips, masks and transforms. `scramble` gives every figlet row its own clip window, stepping in whole columns along a shared uneven pace plus a bounded per-row wander, with a band of cycling ramp glyphs running ahead. `decrypt` shows the whole line as cycling noise from the first tick and locks cells in a left-to-right sweep that is ragged cell by cell: every cell belongs to one of a few interleaved lanes whose fronts trail each other. `typewriter` types the line letter by letter behind a cursor. `wipe` scales one mask rect from the edge it starts at. `dissolve` fills the mask with a dither `<pattern>` whose cells switch on at their threshold tick, so it costs matrix² animations however long the line is. `fall` drops glyph groups into place, and `glitch` jumps rows sideways and flashes noise.
- **Firefox.** Firefox ignores CSS transforms on a `clipPath`'s children, so the clipped group moves and an inner group counter-moves the glyphs.
- **Knockout.** A mask clears the field around the letters (stroke dilation), which keeps the tagline legible on any page colour and over the field's hot zones. It opens only where text is visible: with the scramble front, under the wipe window, with each falling group. Opened up front, the letter-shaped hole would give the line away before it appears.
- **Budget.** Keep the SVG under 1 MiB raw; the default banner is 858 KB raw, 90 KB gzipped. Raw size ∝ frames × rows × columns; gzip barely grows with frames. What visitors actually pay is DOM (about 5.5k text nodes by default) and repaint rate, so keep `fps × loopSeconds` modest. The build fails over `budget.maxBytes`.
- **Reduced motion.** Under `prefers-reduced-motion` the field freezes at `stillAt` and the first tagline is shown settled, with its knockout.

## Fonts & licences

- `fonts/jetbrains-mono.woff2`: subset of JetBrains Mono, SIL Open Font License 1.1 (`fonts/OFL.txt`, details in `fonts/NOTICE.md`).
- `fonts/figlet/*.flf`: thirteen fonts verbatim from the official FIGlet distribution, BSD-3-Clause (`fonts/figlet/LICENSE`); `fonts/figlet/NOTICE.md` records the source commit and every author named in the headers.
- `fonts/block/*.flf`: `blocks`, `blocks-shadow`, `blocks-thin`, `pixel`, `blocks-3d` and `blocks-iso`, drawn for this project and generated from `fonts/block/src/hairline.txt` by `tools/mkfont.mjs`; MIT like the rest of the repo (`fonts/block/NOTICE.md`).
- `fonts/ansi-shadow.flf`: figlet "ANSI Shadow", author unknown, no explicit licence found; see `fonts/ANSI-SHADOW-NOTICE.md`. Swap it via `tagline.font`.
- `src/fields/sharks.mjs`: shark outlines after [ascii-sharks](https://github.com/stackedlol/ascii-sharks) by drewdi, MIT (`THIRD-PARTY.md`).

## License

MIT, see [LICENSE](LICENSE).
