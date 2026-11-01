# ascii-banner

## Check and run
- `bash .claude/hooks/stop-check.sh` (~4 s in WSL, ~5 s from Windows over `\\wsl.localhost`): `node --check` on bin/, src/, tools/ plus a smoke build of `banner.config.mjs` and of each `docs/examples/card-*.config.mjs` card; it is also the project Stop hook. No tests, no linter, zero dependencies (nothing to install), Node >= 20.
- `node bin/ascii-banner.mjs build --out "$(mktemp --suffix=.svg)"` (~0.3 s) renders `banner.config.mjs`; without `--out` it overwrites `banner.svg`. `node bin/ascii-banner.mjs presets` and `node bin/ascii-banner.mjs fonts --sample "Hello"` (~0.1 s) list the presets and fonts.
- `npm run gallery` (~1 s), `npm run examples` (~1 s) and `node tools/mkfont.mjs --all` (~0.2 s) regenerate `docs/gallery/`, `docs/examples/` and `fonts/block/*.flf`. Output is deterministic: a rerun on an unchanged tree leaves `git status` clean. The example cards build offline from the committed snapshots `docs/examples/card-*.json`; `GITHUB_TOKEN=$(gh auth token) node bin/ascii-banner.mjs fetch --config docs/examples/card-<name>.config.mjs` refreshes one (network, a token with no scopes).

## Gotchas
- Generated, never hand-edited: `banner.svg` (CI rebuilds and commits it on push to `main`), `docs/gallery/`, `docs/examples/*.svg`, `fonts/block/*.flf` (source `fonts/block/src/hairline.txt`).
- The build fails over `budget.maxBytes` (1 MiB raw; the default banner is ~858 KB); gallery entries are capped at 200 KB. A field preset must be exactly periodic over the loop: the build only warns on a seam above 0.02.
- Every glyph a font or ramp draws must be in the embedded JetBrains Mono subset (`fonts/glyphs.txt`, ranges in `fonts/NOTICE.md`), or the build errors; a new subset keeps `--layout-features=''` so `//` and `||` never ligate.
- Before 1.0 a minor may break configs: mark it **Breaking** under `[Unreleased]` in CHANGELOG.md.
- README and docs state counts (eleven fields, seven reveals, nineteen fonts): update them with every preset or font change.
- Firefox draws glyphs in a `<tspan>` 1 px lower than bare text in the same `<text>` (never mix them in one row) and ignores CSS transforms on `<clipPath>` children (move the clipped group, counter-shift its content).
- A change to the snapshot's shape bumps `SNAPSHOT_VERSION` (src/card/fetch.mjs); older snapshots, the example fixtures included, then fail with "fetch again": refetch them. The snapshot keeps only what the card draws, since users commit what it renders and may commit it.
- Release X.Y.Z from `main`: bump package.json, turn `[Unreleased]` into `[X.Y.Z] - date` with its compare link, move the `#vX.Y.Z` pins (README, docs/card.md), push a signed tag `vX.Y.Z`, publish a GitHub release whose notes are that CHANGELOG section. Users pin tags: never move one.

## Decisions (do not re-open)
- Fonts: fully free licences only (BSD-3 FIGlet, OFL, the project's own MIT block faces); no TheDraw fonts. `ansi-shadow` (no licence found) stays with its provenance notice, swappable via `tagline.font`. No licence-clean isometric FIGlet exists; the 3D face is the voxel `blocks-3d`.
- Transparent background, theme-neutral palette from one `accent`: GitHub's `<picture>`/`prefers-color-scheme` follows the OS, not the GitHub theme, so per-theme SVGs break.
- Zero runtime dependencies; neutral default taglines; the default banner sitting near the 1 MiB budget is intended. Firefox's sub-pixel shift of the field with this subset was bisected without finding a cause and is accepted.
