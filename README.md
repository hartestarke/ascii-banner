<img src="banner.svg" width="880" alt="ascii-banner demo: a drifting ASCII wave field with decoding block-letter taglines">

# ascii-banner

An animated ASCII banner for your GitHub README, baked into one self-contained SVG. Travelling sine waves are pushed through a glyph ramp and precomputed into a CSS frame-flip loop, because README images allow no JavaScript. Taglines in a figlet block font decode on top behind a torn front. One config file, zero dependencies, Node ≥ 20.

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
      - run: npx --yes github:hartestarke/ascii-banner#v0.1.0 build
      - run: |
          git add banner.svg
          git diff --cached --quiet -- banner.svg && exit 0
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -m "Rebuild banner" && git push
```

CLI: `ascii-banner init [dir] [--force]`, `ascii-banner build [--config <path>] [--out <path>]`; `--config`/`--out` are relative to the current directory, asset paths inside the config to the config file. Exit codes: 0 ok, 1 config/user error, 2 bug.

## Config reference

Defaults shown. Unknown keys and wrong types fail the build with the key's name.

| Key | Default | Meaning |
| --- | --- | --- |
| `size.width`, `size.height` | `880`, `240` | viewBox in px; the `<img>` scales it |
| `accent` | `"#E62D42"` | the only hue; everything else is alpha |
| `taglines` | 3 demo lines | decoded in order; `[]` = pure field |
| `tagline.fill` | `0.92` | widest line spans at most this fraction of the width |
| `tagline.maxHeight` | `0.34` | letters span at most this fraction of the height |
| `tagline.lineHeight` | `1.2` | row pitch in em; ≤ 1.32 keeps blocks seamless |
| `tagline.shadowAlpha` | `0.5` | alpha of shadow strokes vs solid blocks |
| `tagline.knockout` | `6` | px of field cleared around the letters; `0` = off |
| `tagline.font` | `"ansi-shadow"` | bundled figlet font or a path to a `.flf` |
| `tagline.shadowGlyphs` | `"═║╔╗╚╝"` | figlet glyphs drawn at `shadowAlpha` |
| `decode.seconds` / `.hold` | `2.2` / `5.8` | decode time / hold time per line, s |
| `decode.fps` | `20` | decode step rate; reads as noise below ~15 |
| `decode.noiseFrames` | `6` | distinct scramble frames |
| `decode.lead` / `.leadVar` | `16` / `0.35` | scramble columns ahead of the text / per-row spread |
| `decode.rag` / `.ragTicks` | `3` / `3` | per-row front wander in columns / ticks between knots |
| `decode.burst` | `0.85` | pace jitter: 0 = even, 1 = stall to double step |
| `decode.noiseAlpha` | `0.65` | alpha of undecoded glyphs |
| `field.fontSize` / `.rowPitch` | `14` / `16` | glyph size / row pitch, px |
| `field.fps` / `.loopSeconds` | `10` / `20` | flipbook rate / loop length; frames = product |
| `field.stillAt` | `7` | second shown under `prefers-reduced-motion` |
| `field.alpha` | `{ lo: 0.3, hi: 0.95 }` | alpha across the ramp |
| `field.ramp` | `":. !/ \\\| 1? 7* 25 %0 &# 8@"` | levels dim → bright, space-separated; chars in a level are variants |
| `field.waves` | 3 waves | `{ fx, fy, k }`: cycles per width, whole cycles per loop |
| `field.gamma` / `.drive` | `1.35` / `2.4` | contrast curve / wave-sum divisor |
| `field.sample` | `null` | `(x, y, t) => [0, 1]` replacing the waves |
| `font.file` / `.advance` | `null` / `0.6` | custom `.woff2` / its advance in em |
| `budget.maxBytes` | `1048576` | fail above this raw size; `0` = off |

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

**Another figlet font.** `tagline.font: "./fonts/doom.flf"` (relative to the config file). Glyphs not in the font render as its `?`; set `tagline.shadowGlyphs` to whatever that font uses for its shadow, or `""`.

**Custom font.** The bundled subset covers printable ASCII, Box Drawing and Block Elements. For anything else, subset your own monospace font and point `font.file` at it (set `font.advance` if it isn't 0.6 em):

```sh
pyftsubset YourMono.ttf --text-file=glyphs.txt --flavor=woff2 \
  --no-hinting --layout-features='' --output-file=my-font.woff2
```

`--layout-features=''` matters: it strips ligatures and contextual alternates, so runs like `//`, `||` and `??` in the field never fuse into one glyph and break the grid. With a custom font the glyph-coverage check is skipped (the build prints what it must contain).

## How it works

- **No background.** GitHub's `<picture>`/`prefers-color-scheme` follows the OS, not the GitHub theme setting, so a per-theme image is unreliable. A transparent banner blends with every theme (including dark dimmed); the palette is theme-neutral: accent hue only, glyph weight plus alpha carry the gradient, no lift towards white.
- **Embedded font.** A JetBrains Mono subset is inlined as base64: identical rendering everywhere and an exact column pitch, so no overscan columns. Its layout tables are stripped (and `font-variant-ligatures:none` is set), so `//` `||` `??` never ligate.
- **Field.** A few plane waves, each under one period across the banner and pointed in different directions, interfere into one or two soft lobes. Frequencies are per banner *width* on both axes (per-axis normalisation squashes lobes flat on a 4:1 banner); speeds are integer cycles per loop, so the seam is exact. Ten ramp levels collapse into three fill classes, one `<text>` per class per row, because per-run `<tspan>`s would triple the size.
- **Taglines.** Figlet rows, two-tone: solid blocks in the accent, the shadow strokes dimmer. Each line decodes left to right behind a torn front: every figlet row has its own clip windows, stepping in whole columns along a shared uneven pace plus a bounded per-row wander. A band of cycling ramp glyphs runs ahead of the settled text, so the scramble sweeps in instead of standing there as a placeholder. Settled text, scramble band and knockout ride the same per-row keyframes; only their clip rects differ.
- **Firefox.** Firefox ignores CSS transforms on a `clipPath`'s children, so the clipped group moves and an inner group counter-moves the glyphs.
- **Knockout.** A mask clears the field around the letters (stroke dilation), which keeps the tagline legible on any page colour and over the field's hot zones. It opens with the scramble front; opened up front, the letter-shaped hole would give the line away before it decodes.
- **Budget.** Keep the SVG under 1 MiB raw. Raw size ∝ frames × rows × columns; gzip barely grows with frames. What visitors actually pay is DOM (~8k text nodes) and repaint rate, so keep `fps × loopSeconds` modest. The build fails over `budget.maxBytes`.
- **Reduced motion.** Under `prefers-reduced-motion` the field freezes at `stillAt` and the first tagline is shown settled.

## Fonts & licences

- `fonts/jetbrains-mono.woff2`: subset of JetBrains Mono, SIL Open Font License 1.1 (`fonts/OFL.txt`, details in `fonts/NOTICE.md`).
- `fonts/ansi-shadow.flf`: figlet "ANSI Shadow", author unknown, no explicit licence found; see `fonts/ANSI-SHADOW-NOTICE.md`. Swap it via `tagline.font`.

## License

MIT, see [LICENSE](LICENSE).
