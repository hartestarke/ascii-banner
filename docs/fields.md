# Fields

The field is the animated glyph layer behind the taglines. A brightness
function is sampled for every cell (105 × 15 at the template's 880 × 240,
14 px glyphs) and every flipbook frame (`fps × loopSeconds`, 200 by default).
Each value in [0, 1] is quantised onto a glyph ramp, and the ramp's levels
fold into one to three alpha bands. The brightness comes from a **preset**
(`field.preset` + `field.options`) or from your own `field.sample` function.
The [gallery](gallery/README.md#fields) renders every preset small.

Byte figures below are full banners built from `banner.config.mjs` (three
taglines) with only `field.preset` changed and `field.options: {}`. The
default budget is 1 MiB (1,048,576 bytes).

## The `field` block

```js
field: {
  fontSize: 14,       // glyph size, px (bigger = fewer cells = smaller file)
  rowPitch: 16,       // px between rows
  fps: 10,            // flipbook rate; 0 = one still frame, at stillAt
  loopSeconds: 20,    // loop length; frames = fps × loopSeconds
  stillAt: 7,         // second shown under prefers-reduced-motion
  alpha: { lo: 0.3, hi: 0.95 },
  colors: null,       // 1–3 #rrggbb, dimmest band first; null = [accent]
  gradient: null,     // 2–8 #rrggbb stops, left → right; not with colors
  bands: null,        // 1 | 2 | 3 alpha bands; null = the preset's default
  ramp: null,         // glyph ramp string or glyph set name; null = the preset's default
  gamma: 1.35,        // applied to every preset's output (not to `sample`)
  dither: 0,          // 0 = jittered quantising; 2 | 4 | 8 = Bayer ordered dither
  preset: "waves",    // or "none": no field, taglines only
  options: {},        // merged over the preset's defaults
  sample: null,       // (x, y, t) => [0, 1]; replaces the preset
}
```

- **`ramp`**: levels dim → bright, separated by spaces. Characters within a
  level are interchangeable variants, fixed per cell. Level 0 (blank) is
  implicit. Instead of a string you can name a glyph set: `classic` (the
  waves ramp below), `digits` `7 4 1 2 6 3 9 5 0 8`, `dots` `· • ○ ◉ ●`,
  `squares` `▫ ▪ □ ■`, `shapes` `◇ △ ◆ ▲`, `shade` `░ ▒ ▓ █`, `binary` `0 1`,
  `lines` `┊ ┆ │ ┃` (`ascii-banner presets` lists them). A single lowercase
  word is read as a set name, so a misspelt one is an error. A glyph beyond
  ASCII takes 3 bytes of the file: on a field that lights most cells, like
  waves at the template size, every set but `classic`, `digits` and `binary`
  goes over the 1 MiB budget (1.28–1.34 MB) unless `bands: 1` (888–917 KB).
  Every glyph must
  be in the bundled font subset (ASCII, `°` `·` `•` `∘` `∙`, Box Drawing
  U+2500–257F, Block Elements U+2580–259F, and the Geometric Shapes
  U+25A0–25FF that JetBrains Mono has), or the build fails and names the
  missing glyphs. `null` takes the preset's ramp. The
  [gallery](gallery/README.md#glyph-sets) shows each set on waves.
- **`bands`**: how many fill classes the levels fold into. 3 = lo / mid / hi
  (each band coloured as its middle level, the original look). 2 = `alpha.lo` /
  `alpha.hi`. 1 = everything at `alpha.hi`, the smallest file. `null` takes the
  preset's default. The count is capped at the ramp's number of levels, so
  `binary` (two levels) gets at most 2 bands and `colors` is checked against,
  and drawn on, the bands that exist.
- **`gamma`**: `pow(v, gamma)` on the preset's value; > 1 deepens the darks.
- **`dither`**: `0` quantises as `floor((v ± 0.05 jitter) × levels)`. A
  matrix size `n` replaces the jitter with an n × n Bayer threshold,
  `floor(v × levels + bayer(col, row))`, so a gradient turns into a regular
  ordered-dither pattern. Try `dither: 4` with waves.
- **`options`**: unknown keys are a config error that names the preset, and
  each value must have the default's type. The legacy keys `field.waves` and
  `field.drive` are still accepted as aliases of the waves options. Giving
  both forms of one key, or a legacy key with another preset, is an error.
- **`sample`**: when set, it wins over the preset (see below).
- **`colors`**, **`gradient`**: the field's hues, see [Colours](#colours).

**Loop seam.** The build samples one full loop later (frame NF; for `sample`,
t = loopSeconds) against frame 0 and warns when any cell jumps by more than
0.02. All built-in presets are exactly periodic.

**Size.** Each frame row is written in whichever of two layouts is shorter.
One layout is a `<text>` per band. The other is a single `<text>` with a
`<tspan>` per glyph run. Dense, banded presets favour the first, sparse ones
the second. Raw size grows with lit cells and with band changes along a row.
`bands: 1` roughly halves a dense field.

## Text only, field only, a still field

- **Text only**: `field: { preset: "none" }`. No frames and no knockout mask
  (there is nothing to cut). The other `field` keys are still checked but do
  nothing, and a null `reveal.pool` takes the `classic` set. `taglines: []`
  with it is an error: nothing would be drawn.
- **Field only**: `taglines: []`.
- **A still field**: `field: { fps: 0 }`. One frame, the loop at `stillAt`
  seconds: pixel for pixel the frame reduced-motion visitors see. No flipbook
  animation and no seam check; `stillAt` must still lie within `loopSeconds`.
  The template config shrinks to 69 KB (one frame instead of 200).

Text only or a still field, with one tagline and `reveal: { preset: "none" }`
([reveals.md](reveals.md#none)), is a static image: no `@keyframes` and no CSS
animation at all. `{ taglines: ["hello world"], field: { preset: "none" },
reveal: { preset: "none" } }` is 14 KB, most of it the embedded font.

## Colours

By default the field, the taglines and their shadows are all `accent` at
different alphas. That one hue is what keeps the banner theme-neutral on
GitHub: `<picture>` follows the OS colour scheme, not the GitHub theme, so a
transparent banner has to read on light, dark and dimmed pages alike. Extra
hues work as long as each one reads on both white and near-black. Taglines
take `tagline.color` and `tagline.shadowColor` (see
[Reveals](reveals.md#config)). The [gallery](gallery/README.md#colours) has a
sample of each.

- **`colors`**: 1–3 `#rrggbb`, dimmest band first. Band *i* takes entry *i*
  and bands past the end take the last entry, so `["#2D8CE6", "#E62D42"]` on
  3 bands is blue / red / red. More entries than the resolved `bands` is an
  error. Each band keeps its alpha from `alpha.lo`..`alpha.hi`. `null` =
  `[accent]`. A few bytes.
- **`gradient`**: 2–8 `#rrggbb` stops, spread evenly left → right across the
  banner width. Every band fills with the same horizontal gradient at its own
  alpha, so the hue follows x and the brightness still comes from the band.
  Giving both `colors` and `gradient` is an error. About 200 bytes.
- The knockout is a mask and takes no colour.

## Presets

### waves (default)
A few travelling plane waves interfere into one or two giant soft lobes: a
slow liquid gradient.
- `waves`: `[{ fx: 0.75, fy: 0.55, k: 1 }, { fx: -0.35, fy: 0.95, k: -1 }, { fx: 0.95, fy: -0.4, k: 0 }]`.
  `fx`/`fy` are cycles per banner width on both axes, `k` is integer cycles
  per loop. Keep every `k` distinct.
- `drive`: 2.4, the wave-sum divisor; lower = more saturated.
- ramp `:. !/ \| 1? 7* 25 %0 &# 8@`, bands 3. **879,018 bytes**.

### stars
A sparse starfield, each star twinkling on its own cycle; optional sideways
parallax drift at two depths.
- `density`: 0.06, the fraction of cells holding a star.
- `twinkle`: 3; each star gets 1..twinkle (integer) twinkle cycles per loop.
- `drift`: 0 (still). Columns the near layer drifts per loop (integer); the
  far layer drifts half that, rounded. A drifting star fades in and out over
  its slide, so the loop stays exact and the sky never tiles.
- `seed`: 1.
- ramp `. : + *`, bands 3. **652,366 bytes**.

### rain
Streaks falling at three depths (speed ×1, ×2, ×3; nearer = brighter), with
a heavy head and a dashed fading tail.
- `columns`: 0.35, the fraction of columns with a streak.
- `speed`: 2, falls per loop of the slowest depth (integer).
- `tail`: 6 rows.
- `seed`: 1.
- ramp `┊ ┆ ╎ │ ┃`, bands 3. **871,914 bytes**.

### caustics
Classic plasma: sines along x, y, the diagonal and an off-centre radius, all
with integer cycles. Only the bright network where the sum crosses zero
shows, like light on a pool floor.
- `scale`: 1, the spatial frequency multiplier.
- `speed`: 1, an integer multiplier of every term's cycles per loop.
- ramp = waves', bands 3. **975,695 bytes**.

### ripples
Rings expanding from a few seeded points, fading with distance. Only the
crests are lit, and they cross where the ring sets meet.
- `centers`: 3.
- `wavelength`: 0.12 of the banner width.
- `decay`: 1.5; amplitude is `exp(-decay × distance in widths)`.
- `rings`: 3 rings per loop from the first centre; centre i emits rings + i.
- `seed`: 1.
- ramp = waves', bands 3. **945,857 bytes**.

### interference
Two ring gratings whose centres orbit the middle in mirror image. Their
product beats into moiré beads that open as the centres part and close as
they meet.
- `spacing`: 0.08 of the width (ring spacing).
- `orbit`: 0.15 of the width (orbit radius).
- `cycles`: 1 orbit per loop.
- ramp = waves', bands 3. **930,159 bytes**.

### halo
A breathing corona: dim inside the ring (taglines sit there), brightest on
it, glowing off outward, with a fixed per-cell grain. On the 4:1 banner the
ring shows as two bright arcs at the ends.
- `radius`: 0.42 of the width.
- `breath`: 0.12, the radius swing as a fraction of the radius.
- `cycles`: 2 breaths per loop.
- `softness`: 0.35, the outward falloff in widths.
- ramp = waves', bands 3. **942,796 bytes**.

### mesh
Soft lights on closed Lissajous paths (integer frequencies) sum into a slowly
drifting gradient, like a design-tool mesh gradient.
- `lights`: 4.
- `radius`: 0.22, the glow radius in widths.
- `seed`: 1.
- ramp = waves', bands 3. **890,066 bytes**.

### contour
Survey lines over slowly morphing terrain (three integer-cycle sines), with
every `index`-th line bright. Lines widen on steep ground so they stay
unbroken.
- `step`: 0.12, the contour interval as a fraction of the terrain's range.
- `thickness`: 0.25, the line width as a fraction of the interval.
- `index`: 5 (0 = no index lines).
- ramp `. : + #`, bands 2 (minor lines at `alpha.lo`, index lines at
  `alpha.hi`). **722,719 bytes**.

### vortex
A polar spiral, `sin(angle·arms + ln(r)·twist − 2π·cycles·t)`, turning about
the centre. Only the arms show, with a dark core and a fade towards the
banner ends.
- `arms`: 3 (integer).
- `twist`: 5, radians of winding per e-fold of radius.
- `cycles`: 1 turn per loop.
- ramp = waves', bands 3. **873,617 bytes**.

### sharks
Sharks seen from above cruise across the banner, alternating left → right and
right → left, each in its own lane and at its own depth: farther ones are
smaller, dimmer and at most as fast. A tail-beat wave runs down each body.
Edge cells dim with coverage, the first dorsal shows as a bright ridge and
the fins sit a little dimmer than the back. Outlines after
[ascii-sharks](https://github.com/stackedlol/ascii-sharks) (MIT).
- `sharks`: 3, the count (integer ≥ 1).
- `length`: 0.45, the nearest shark's length as a fraction of the width; the
  others are 0.85 down to 0.6 of it, dimming to 0.55 brightness.
- `speed`: 1, crossings per loop of the nearest shark (integer); farther ones
  make at most as many, still whole.
- `species`: `"classic"`, or `hammerhead`, `tiger`, `zebra`, `greathammer`,
  `mako`, `thresher`, `nurse`; `"mix"` = a different one per shark.
- `fish`: 0, the fraction of cells holding a one-cell fish drifting right →
  left, against the nearest shark (try 0.015).
- `seed`: 1.
- ramp `: ; t % S X 8 # @`, bands 3. **557,854 bytes**.

## Writing your own

**A `sample` function** (in your config, no code changes):

```js
field: {
  // x, y = cell centre in banner px; t = seconds into the loop.
  // Must be periodic over loopSeconds (here 20 s) or the seam warning fires.
  sample: (x, y, t) => 0.5 + 0.5 * Math.sin(x / 60 + (2 * Math.PI * t) / 20),
  // A function that lights every cell writes more bytes than the waves preset
  // (this one is ~1.25 MB at the template size with three bands): one band
  // or a shorter loop keeps it under the budget.
  bands: 1,
}
```

The value is used as is: no gamma, clamped to [0, 1] by the quantiser.

**A preset** (a code change): add `src/fields/<name>.mjs` and register it in
`src/fields/index.mjs`:

```js
import { TAU, space } from "./util.mjs";
export default {
  defaults: { speed: 1 },          // field.options are merged over these
  ramp: ". : + *",                 // default ramp (inside the font subset)
  bands: 3,                        // default band count
  validate(o, v) {                 // optional: range checks through v, as in reveal presets
    v.int("speed");                // error names the path: field.options.speed
  },
  make(g, o, cfg) {                // g = fieldGrid: PX, PY, COLS, ROWS, NF, y0, W, H
    const sp = space(g);           // cell centres in banner widths
    return (col, row, f) => 0.5 + 0.5 * Math.sin(TAU * (3 * sp.x(col) + o.speed * f / g.NF));
  },
};
```

Rules: return [0, 1] (gamma is applied on top), and be exactly periodic. With
t = f / NF, use integer cycle counts and integer drifts per loop, so frame NF
equals frame 0. For randomness use `rnd(...ints)` from `util.mjs`, which is
keyed `jitter()`. Never use `Math.random`: output must be deterministic.
