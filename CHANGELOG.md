# Changelog

Notable changes per version, newest first. Versions are git tags `vX.Y.Z` and follow [Semantic Versioning](https://semver.org/); before 1.0 a minor version may still break a config, and such changes are marked **Breaking**. The layout follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Info cards inside the banner, laid out like neofetch (`cards: [...]`, any number), each of a GitHub user (`user`) or repository (`repo`): a portrait (the avatar in four tones on a dark screen, a frozen `solid` torus, or none), a header, your own rows (`rows`) and GitHub's (`show`), and for a person a year of contributions (`activity`: `sparkline`, `calendar` in GitHub's shades, or `none`). Cards flow after the taglines in rows on the field's grid, a whole row wide or two side by side (`width`: `full`, `half` or px), or sit where `at` puts them; the field under a card is cleared (`backdrop: "window"`), faint (`dim`) or cleared around its glyphs (`cut`). `ascii-banner fetch` snapshots every card into one file (`data`, `banner.data.json` by default; one GraphQL query per card; public, non-fork repositories only, a private repository is refused; only what the cards draw is kept) and `build` draws them from it offline and byte-identically (`--data <path>` reads another snapshot). Cards and nothing else (`taglines: []`, `field.preset: "none"`) make a plain card image. See `docs/card.md` and its three examples; `cardKey`, `fetchCards` and `readCards` are exported next to `buildBanner`.
- How a card comes in: out of the field as a whole (`reveal`: `wave`, a front bent by the field's brightness; `drops`, rings; `crystal`, scattered cells) or line by line (`type` behind a cursor, `decode` out of noise, `slide`, `glitch`); then its numbers count up and a band of light crosses the activity. `intro` plays it `once`, in a `loop` (back into the field and out again every `period` s, `field.loopSeconds` by default) or not at all (`none`), and `delay` staggers the cards (1.2 s, then 0.8 s more per card); under `prefers-reduced-motion` every card is still. Its looks: the values, the handle and the description in `ink` (a grey, `#7d8590`, by default; `null` = the accent), rows as `key ··· value` or neofetch's `key: value` (`layout`: `dots`, `colon`), a row of colour blocks (`swatches`), the avatar in its own colours or in greys (`avatarColors`: `accent`, `natural` with a 16-colour palette, `gray`).
- `size.height` defaults to `"auto"`: as tall as the taglines (240 px, as before) and the cards need; a number fixes the canvas. `tagline.width` (`full`, `half` or px) and `tagline.height` (`null` = 240, or the whole canvas when there are no cards and `size.height` is px) make the taglines a block that cards can sit beside. `budget.maxBytes` defaults to `null`, automatic: 1 MiB per 240 px of canvas height, never less than 1 MiB. A banner without cards builds byte-identically.
- Four worked examples at the top of the README, each with its config under `docs/examples/`; `npm run examples` rebuilds them.
- New reveal `decrypt`: from the first tick the whole line is cycling noise, and the cells lock into their glyphs in a left-to-right sweep that is ragged cell by cell (`lanes`, `spread`, `wander`, `burst`, `noiseFrames`, `noiseAlpha`).
- `typewriter` types letter by letter: each tagline character is one keystroke showing its whole figlet glyph, keystrokes land at uneven intervals (new option `jitter`) and the cursor sits after the last typed letter. `figletLaid()` in `src/figlet.mjs` reports every character's column span, and reveal presets get it as `ctx.spans`.
- New field preset `sharks`: sharks seen from above cruise across the banner, each bending along its own meandering course at its own depth and turning round off-screen between crossings, eight species or `mix`, an optional school of one-cell fish. Outlines after [ascii-sharks](https://github.com/stackedlol/ascii-sharks) by drewdi, MIT (`THIRD-PARTY.md`).
- New field preset `solid`: a lit torus, trefoil knot or rounded cube, ray-marched per sample through a perspective camera and turning whole turns per loop about x, y and z (`shape`, `x`, `y`, `size`, `turns`, `light`, `ambient`, `specular`, `shininess`). Twelve field presets.
- `field.cells: "half"` draws every field cell as a top and a bottom pixel (`▀ ▄ █`), each thresholded on its own (Bayer with `dither`): twice the resolution, square pixels at `fontSize: 10, rowPitch: 12`. Block rows must overlap by 1 px or more, since Firefox snaps text rows to whole device pixels and rows exactly a block apart show hairline gaps; `font.blockHeight` (1.32 em for JetBrains Mono) sets the bound. A block row starts at its first drawn cell, so a solid off to one side stays small.
- `field.gamma` defaults to `null`, the preset's own: 1.35 for every preset as before, 1 for `solid`. A preset may set `gamma` next to `ramp` and `bands`.
- `tagline.x` places the taglines across the width: each line centres on that fraction (0.5, centred, as before), and a line that would cross an edge stops a column short of it. With a lower `tagline.fill` it leaves room beside the text, e.g. for a `solid`.
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
