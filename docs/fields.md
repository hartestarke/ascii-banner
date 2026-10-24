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
  fps: 10,            // flipbook rate
  loopSeconds: 20,    // loop length; frames = fps × loopSeconds
  stillAt: 7,         // second shown under prefers-reduced-motion
  alpha: { lo: 0.3, hi: 0.95 },
  bands: null,        // 1 | 2 | 3 alpha bands; null = the preset's default
  ramp: null,         // glyph ramp string; null = the preset's default
  gamma: 1.35,        // applied to every preset's output (not to `sample`)
  dither: 0,          // 0 = jittered quantising; 2 | 4 | 8 = Bayer ordered dither
  preset: "waves",
  options: {},        // merged over the preset's defaults
  sample: null,       // (x, y, t) => [0, 1]; replaces the preset
}
```

- **`ramp`**: levels dim → bright, separated by spaces. Characters within a
  level are interchangeable variants, fixed per cell. Level 0 (blank) is
  implicit. Every glyph must be in the bundled font subset (ASCII, Box
  Drawing U+2500–257F, Block Elements U+2580–259F), or the build fails and
  names the missing glyphs. `null` takes the preset's ramp.
- **`bands`**: how many fill classes the levels fold into. 3 = lo / mid / hi
  (each band coloured as its middle level, the original look). 2 = `alpha.lo` /
  `alpha.hi`. 1 = everything at `alpha.hi`, the smallest file. `null` takes the
  preset's default.
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

**Loop seam.** The build samples one full loop later (frame NF; for `sample`,
t = loopSeconds) against frame 0 and warns when any cell jumps by more than
0.02. All built-in presets are exactly periodic.

**Size.** Each frame row is written in whichever of two layouts is shorter.
One layout is a `<text>` per band. The other is a single `<text>` with a
`<tspan>` per glyph run. Dense, banded presets favour the first, sparse ones
the second. Raw size grows with lit cells and with band changes along a row.
`bands: 1` roughly halves a dense field.

## Presets

### waves (default)
A few travelling plane waves interfere into one or two giant soft lobes: a
slow liquid gradient.
- `waves`: `[{ fx: 0.75, fy: 0.55, k: 1 }, { fx: -0.35, fy: 0.95, k: -1 }, { fx: 0.95, fy: -0.4, k: 0 }]`.
  `fx`/`fy` are cycles per banner width on both axes, `k` is integer cycles
  per loop. Keep every `k` distinct.
- `drive`: 2.4, the wave-sum divisor; lower = more saturated.
- ramp `:. !/ \| 1? 7* 25 %0 &# 8@`, bands 3. **877,686 bytes**.

### stars
A sparse starfield, each star twinkling on its own cycle; optional sideways
parallax drift at two depths.
- `density`: 0.06, the fraction of cells holding a star.
- `twinkle`: 3; each star gets 1..twinkle (integer) twinkle cycles per loop.
- `drift`: 0 (still). Columns the near layer drifts per loop (integer); the
  far layer drifts half that, rounded. A drifting star fades in and out over
  its slide, so the loop stays exact and the sky never tiles.
- `seed`: 1.
- ramp `. : + *`, bands 3. **651,034 bytes**.

### rain
Streaks falling at three depths (speed ×1, ×2, ×3; nearer = brighter), with
a heavy head and a dashed fading tail.
- `columns`: 0.35, the fraction of columns with a streak.
- `speed`: 2, falls per loop of the slowest depth (integer).
- `tail`: 6 rows.
- `seed`: 1.
- ramp `┊ ┆ ╎ │ ┃`, bands 3. **870,582 bytes**.

### caustics
Classic plasma: sines along x, y, the diagonal and an off-centre radius, all
with integer cycles. Only the bright network where the sum crosses zero
shows, like light on a pool floor.
- `scale`: 1, the spatial frequency multiplier.
- `speed`: 1, an integer multiplier of every term's cycles per loop.
- ramp = waves', bands 3. **974,363 bytes**.

### ripples
Rings expanding from a few seeded points, fading with distance. Only the
crests are lit, and they cross where the ring sets meet.
- `centers`: 3.
- `wavelength`: 0.12 of the banner width.
- `decay`: 1.5; amplitude is `exp(-decay × distance in widths)`.
- `rings`: 3 rings per loop from the first centre; centre i emits rings + i.
- `seed`: 1.
- ramp = waves', bands 3. **944,525 bytes**.

### interference
Two ring gratings whose centres orbit the middle in mirror image. Their
product beats into moiré beads that open as the centres part and close as
they meet.
- `spacing`: 0.08 of the width (ring spacing).
- `orbit`: 0.15 of the width (orbit radius).
- `cycles`: 1 orbit per loop.
- ramp = waves', bands 3. **928,827 bytes**.

### halo
A breathing corona: dim inside the ring (taglines sit there), brightest on
it, glowing off outward, with a fixed per-cell grain. On the 4:1 banner the
ring shows as two bright arcs at the ends.
- `radius`: 0.42 of the width.
- `breath`: 0.12, the radius swing as a fraction of the radius.
- `cycles`: 2 breaths per loop.
- `softness`: 0.35, the outward falloff in widths.
- ramp = waves', bands 3. **941,464 bytes**.

### mesh
Soft lights on closed Lissajous paths (integer frequencies) sum into a slowly
drifting gradient, like a design-tool mesh gradient.
- `lights`: 4.
- `radius`: 0.22, the glow radius in widths.
- `seed`: 1.
- ramp = waves', bands 3. **888,734 bytes**.

### contour
Survey lines over slowly morphing terrain (three integer-cycle sines), with
every `index`-th line bright. Lines widen on steep ground so they stay
unbroken.
- `step`: 0.12, the contour interval as a fraction of the terrain's range.
- `thickness`: 0.25, the line width as a fraction of the interval.
- `index`: 5 (0 = no index lines).
- ramp `. : + #`, bands 2 (minor lines at `alpha.lo`, index lines at
  `alpha.hi`). **721,387 bytes**.

### vortex
A polar spiral, `sin(angle·arms + ln(r)·twist − 2π·cycles·t)`, turning about
the centre. Only the arms show, with a dark core and a fade towards the
banner ends.
- `arms`: 3 (integer).
- `twist`: 5, radians of winding per e-fold of radius.
- `cycles`: 1 turn per loop.
- ramp = waves', bands 3. **872,285 bytes**.

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
