# Reveals

How each tagline appears is a pluggable **reveal preset**; the [gallery](gallery/README.md#reveals) renders each one small. Every preset obeys the same contract:

- tagline *p* owns the slot `[p × (seconds + hold), (p + 1) × (seconds + hold))` of the tagline loop and is fully hidden outside it;
- it reveals over `seconds`, then holds **settled** for `hold`, and the settled line is pixel-identical whichever preset drew it;
- the knockout (the field cleared around the letters, `tagline.knockout`) opens only where text is visible;
- under `prefers-reduced-motion` the first tagline shows settled, with its knockout, and the others stay hidden;
- CSS animations only, deterministic output (the same config always gives the same bytes).

## Config

```js
reveal: {
  preset: "scramble", // "scramble" | "typewriter" | "wipe" | "dissolve" | "fall" | "glitch" | "none"
  seconds: 2.2,       // seconds a line spends revealing
  hold: 5.8,          // seconds a settled line holds before the next one starts
  fps: 20,            // step rate of stepped reveals (round(seconds × fps) ticks)
  pool: null,         // noise glyphs of scramble and glitch; null = the field's ramp
  options: {},        // the preset's own knobs, merged over its defaults
},
```

`options` takes only the chosen preset's keys: an unknown key is an error that names the preset, and each value must have the default's type. Leave a key out to keep its default.

**Colour.** `tagline.color` (`#rrggbb`, `null` = `accent`) paints the letters and everything a preset draws in letter colour: the scramble noise, glitch's noise flashes and the typewriter cursor. `tagline.shadowColor` (`null` = `tagline.color`) paints the shadow strokes (`tagline.shadowGlyphs`), still at `tagline.shadowAlpha`. Left at `null`, the whole banner stays in the one `accent` hue, which is what keeps it theme-neutral on GitHub ([Fields → Colours](fields.md#colours)). The [gallery](gallery/README.md#colours) has a two-tone sample.

**Noise glyphs.** `pool` is what scramble's noise band and glitch's flashes draw from: a glyph set name (`classic`, `digits`, `dots`, `squares`, `shapes`, `shade`, `binary`, `lines`; see [fields.md](fields.md#the-field-block)) or a string of your own glyphs, spaces ignored, each one in the font. `null` takes the field's ramp, so the noise matches the field: over `field.preset: "rain"` that is vertical bars only, and `pool: "classic"` gives the line the mixed ASCII noise of the default banner instead. The other presets draw no noise and ignore it. The [gallery](gallery/README.md#glyph-sets) shows each set as field and noise.

**Legacy `decode`.** Configs written before presets existed used a top-level `decode: { seconds, hold, fps, noiseFrames, lead, leadVar, rag, ragTicks, burst, noiseAlpha }`. It still works and means `preset: "scramble"`: `seconds`/`hold`/`fps` go to `reveal`, the rest to `options`. Giving both `decode` and `reveal` is an error.

Sizes below are for the template config (3 taglines, 880 × 240, default options). "Reveal" counts what the preset adds on top of the same banner with no taglines (822,303 bytes). Keyframe counts leave out the field's one. The budget is 1,048,576 bytes.

| preset | file bytes | reveal bytes | reveal @keyframes |
| --- | ---: | ---: | ---: |
| scramble | 877,686 | 55.4 KB | 13 |
| typewriter | 855,508 | 33.2 KB | 9 |
| wipe | 855,049 | 32.7 KB | 3 |
| dissolve | 860,356 | 38.1 KB | 18 |
| fall | 884,702 | 62.4 KB | 26 |
| glitch | 856,924 | 34.6 KB | 12 |

## scramble (default)

The line decodes left to right behind a torn front. Each figlet row steps in whole columns along a shared, uneven pace with its own bounded wander. A band of cycling noise glyphs (`pool`) runs ahead of the settled text.

| option | default | meaning |
| --- | --- | --- |
| `noiseFrames` | `6` | distinct scramble frames cycled during the reveal |
| `lead` | `16` | columns of scramble running ahead of the settled text |
| `leadVar` | `0.35` | per-row spread of `lead`, as a fraction of it, in [0, 1) |
| `rag` | `3` | columns a row's front may stray either side of the mean front |
| `ragTicks` | `3` | ticks between a row's wander knots; lower = twitchier |
| `burst` | `0.85` | pace jitter: 0 = even, 1 = from a stall to a double step |
| `noiseAlpha` | `0.65` | alpha of the not-yet-decoded glyphs |

877,686 bytes, 13 keyframes.

## typewriter

All figlet rows advance together, whole columns per tick, left to right over `seconds`, so a glyph cell is never sliced. A cursor block rides the front, and the knockout follows the front and the cursor.

| option | default | meaning |
| --- | --- | --- |
| `cursor` | `"█"` | one character drawn down every row at the front; `""` = no cursor. It must exist in the font (the bundled one has the box and block glyphs) |
| `blink` | `0` | 0 = the cursor leaves when the line settles; > 0 = it stays and blinks with this period (seconds) during the hold |

855,508 bytes, 9 keyframes (3 per tagline).

## wipe

One window per tagline sweeps over the line, and the knockout shares the window. The window is a mask rect that scales from zero about the edge the wipe starts from, so one keyframes set serves every line.

| option | default | meaning |
| --- | --- | --- |
| `direction` | `"right"` | way the edge travels: `"right"`, `"left"`, `"down"`, `"up"`, `"center"` (opens outwards), `"edges"` (closes inwards) |
| `steps` | `0` | 0 = smooth linear sweep; *n* > 0 = *n* discrete steps |

855,049 bytes, 3 keyframes.

## dissolve

Glyph cells switch on in ordered-dither order until the line is whole. Each tagline's mask is filled with a `<pattern>` of matrix × matrix cells, one glyph cell each, aligned to the tagline grid. Every pattern cell is a white rect that turns opaque at its threshold tick, so there are matrix² animations however long the text is. Firefox does repaint animated pattern children. The knockout uses the same mask.

| option | default | meaning |
| --- | --- | --- |
| `matrix` | `4` | dither tile in cells: `2`, `4` or `8` (4, 16 or 64 switch-on steps) |
| `order` | `"bayer"` | `"bayer"` = ordered dither; `"random"` = shuffled thresholds |

860,356 bytes, 18 keyframes (matrix 8: 874,066 bytes, 45 keyframes).

## fall

Glyph groups drop into place with an ease-out, their start times staggered left to right, and the knockout copies drop with them.

| option | default | meaning |
| --- | --- | --- |
| `from` | `"top"` | `"top"`, `"bottom"`, or `"scatter"` (each group picks top or bottom and a drop distance) |
| `group` | `"letter"` | `"letter"` = runs of inked columns between blank ones. Fonts that butt letters together (like the bundled ANSI Shadow) leave fewer runs than letters, so those runs are cut into 6-column chunks. `"column"` = every inked column falls on its own |
| `stagger` | `0.6` | fraction of `seconds` the start times spread over, in [0, 1] |

884,702 bytes, 26 keyframes. `group: "column"` is the heaviest option: 983,066 bytes at the template size, 65,510 bytes under the 1 MiB budget, so a larger banner or longer taglines can push it over.

## glitch

The line appears at once. Then, for `seconds`, a few rows per tick jump sideways by whole columns, the jumps dying out, while short flashes swap the line for scramble noise. It settles exactly on the grid. The knockout follows the row jumps and stays open through the flashes.

| option | default | meaning |
| --- | --- | --- |
| `slices` | `3` | rows displaced per tick |
| `shift` | `2` | largest jump in columns, decaying to 0 over `seconds` |
| `flashes` | `4` | one-tick noise flashes during the reveal; 0 = none |
| `noiseAlpha` | `0.65` | alpha of the noise glyphs |

856,924 bytes, 12 keyframes.

## none

No reveal: each line shows settled for its whole slot (`seconds + hold`, the same rhythm as the other presets) and cuts straight to the next, its knockout open with it. A single tagline never animates, so over no field or a still one the banner is a static image ([Text only, field only, a still field](fields.md#text-only-field-only-a-still-field)). No options; `pool` is unused.

On the template (three taglines) it adds 16.1 KB and one @keyframes to the bare field; a single tagline adds neither keyframes nor animation.

## Writing a preset

A preset is a module in `src/reveals/` registered in `src/reveals/index.mjs`. It exports `{ defaults, validate(options, v), render(ctx) }`. Field presets validate the same way: `v` comes from `optionChecks` in `src/config.mjs` (`check`, `positive`, `nonNeg`, `unit`, `fraction`, `posInt`, `int`, `oneOf`), and every error names the option's full path.

- `render` returns `{ defs, css, overlay, knockout, reducedMotionCss: { stop, settle }, extraGlyphs }`.
- `ctx` is documented at `renderReveal` in `src/svg.mjs`.
- Prefix every class and id with the preset's own letters so it can't collide with another preset or the field.
- Hide with transforms, clips or masks, never with visibility on nested groups.
- Put the per-slot delay rules after the `animation` shorthands, because the shorthand resets the delay.
