# Changelog

Notable changes per version, newest first. Versions are git tags `vX.Y.Z` and follow [Semantic Versioning](https://semver.org/); before 1.0 a minor version may still break a config, and such changes are marked **Breaking**. The layout follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Four worked examples at the top of the README, each with its config under `docs/examples/`; `npm run examples` rebuilds them.
- New reveal `decrypt`: from the first tick the whole line is cycling noise, and the cells lock into their glyphs in a left-to-right sweep that is ragged cell by cell (`lanes`, `spread`, `wander`, `burst`, `noiseFrames`, `noiseAlpha`).
- `typewriter` types letter by letter: each tagline character is one keystroke showing its whole figlet glyph, keystrokes land at uneven intervals (new option `jitter`) and the cursor sits after the last typed letter. `figletLaid()` in `src/figlet.mjs` reports every character's column span, and reveal presets get it as `ctx.spans`.
- New field preset `sharks`: sharks seen from above cruise across the banner, each bending along its own meandering course at its own depth and turning round off-screen between crossings, eight species or `mix`, an optional school of one-cell fish. Outlines after [ascii-sharks](https://github.com/stackedlol/ascii-sharks) by drewdi, MIT (`THIRD-PARTY.md`).
- Docs: the byte figures in `docs/reveals.md` and `docs/fields.md` are re-measured on the current build (each was 1,332 bytes low).
- **Breaking:** `blocks-3d` is redrawn. The letters recede one column right and one row up as solid blocks, the top of every stroke in `▇` and its right side in `▉`: 8 rows (was 9), `shadowGlyphs` default `"▇▉"` (was `"▓▒"`), 13 columns per 5-pixel letter (was 16). A config that pinned `shadowGlyphs: "▓▒"` for it now draws the depth solid; drop the key. `tools/mkfont.mjs` gains the voxel renderer behind it.
- **Breaking:** `blocks-iso` is removed; a config naming it fails. Nineteen bundled fonts, five block faces.

## [0.3.0] - 2026-10-24

- **Breaking:** the `static` field, the `fade` reveal and the `digital` and `bubble` fonts are removed; a config naming them fails. Ten field presets, six reveals plus `none`, twenty bundled fonts.
- Colours: `field.colors` (1–3 per band, dim to bright) or `field.gradient` (2–8 stops, left → right), `tagline.color` (letters, scramble noise, glitch flashes, typewriter cursor) and `tagline.shadowColor`. Each defaults to `accent`.
- Glyph sets: `field.ramp` takes `classic`, `digits`, `dots`, `squares`, `shapes`, `shade`, `binary` or `lines`. A glyph beyond ASCII costs 3 bytes, so a dense field in `dots`, `squares`, `shapes`, `shade` or `lines` needs `field.bands: 1` to stay under 1 MiB. The embedded font subset grows to 303 glyphs.
- `reveal.pool`: the glyphs of scramble's noise and glitch's flashes, a set name or a string; `null` = the field's ramp.
- `field.preset: "none"` draws no field, `field.fps: 0` one still frame (the one at `stillAt`), `reveal.preset: "none"` shows each line for its slot without animation. One line over no field or a still one is a static SVG.
- Two extruded block faces, `blocks-3d` and `blocks-iso` (default layout `fit`). Block faces draw their gaps as hardblanks, so `tagline.layout: "fit"` keeps letters and words apart.
- An unknown `tagline.font` name fails with the list of bundled names.

## [0.2.0] - 2026-10-24

- Twenty bundled tagline fonts: `ansi-shadow`, 15 BSD-3 FIGlet fonts and 4 original block faces (`ascii-banner fonts` lists them).
- Eleven field presets (`field.preset`, `field.options`) and seven reveal presets (`reveal.preset`, `reveal.options`); `ascii-banner presets` lists them.
- `reveal` replaces `decode`, and `field.preset` / `field.options` replace `field.waves` / `field.drive`. The old keys are still accepted.
- Each field row is now written as per-band texts or tspan runs, whichever is shorter: the default banner went from 951,285 to 877,686 bytes with pixel-identical output.
- **Breaking:** a `tagline.font` given as a path now defaults to `layout: "header"` and no dimmed shadow glyphs. Set `layout: "full", shadowGlyphs: "═║╔╗╚╝"` to get the 0.1 look.

## [0.1.0] - 2026-10-12

- First release: a config-driven generator of animated ASCII-field SVG banners for GitHub READMEs. A travelling wave field precomputed into a CSS frame-flip loop, `ansi-shadow` taglines with a `decode` reveal, one config file, zero dependencies, Node ≥ 20.

[Unreleased]: https://github.com/hartestarke/ascii-banner/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/hartestarke/ascii-banner/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/hartestarke/ascii-banner/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hartestarke/ascii-banner/releases/tag/v0.1.0
