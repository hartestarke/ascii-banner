# The info card

neofetch for your GitHub profile: a second SVG for under the banner, with a
portrait at the left and rows of facts at the right. It shows a GitHub user
(`mode: "person"`) or a repository (`mode: "project"`), puts your own rows
above GitHub's, and builds itself up on load in CSS alone.

<img src="examples/card-person.svg" width="880" alt="info card of hartestarke: an avatar in four red tones, rows decoding out of noise, a contribution calendar">

<img src="examples/card-project.svg" width="880" alt="info card of hartestarke/ascii-banner: a solid torus, rows typing in at a cursor, the release, licence, stats, commits and a language bar">

Both come from [`examples/`](examples), each config next to the snapshot it was
built from: [`card-person.config.mjs`](examples/card-person.config.mjs) and
[`card-project.config.mjs`](examples/card-project.config.mjs).

## How it works

A card takes two steps, so the network stays out of the build:

1. `ascii-banner fetch` asks GitHub for the data, in one GraphQL query plus the
   avatar, and writes a snapshot, `card.data.json` by default.
2. `ascii-banner card` renders `card.svg` from that snapshot, offline. A
   snapshot always renders to the same bytes: ages such as "2y 8m" or "6 days
   ago" count to the moment of the fetch, not of the build.

## Quick start

In your profile repository (`<you>/<you>`), next to `banner.config.mjs`:

```js
export default {
  // ...the banner's keys...
  card: {
    user: "your-login",
    rows: [["role", "backend engineer"], ["stack", "Go · Postgres · k8s"]],
  },
};
```

```sh
export GITHUB_TOKEN="$(gh auth token)"   # any token; it needs no scopes
npx --yes github:hartestarke/ascii-banner#v0.4.0 fetch   # writes card.data.json
npx --yes github:hartestarke/ascii-banner#v0.4.0 card    # writes card.svg
```

Commit `card.svg` and put `<img src="card.svg" width="880" alt="">` in the
README. The snapshot is only the build's input and need not be committed; it
carries its fetch time, so it changes on every fetch.

To keep the numbers fresh, let a workflow fetch and render once a day,
`.github/workflows/card.yml`:

```yaml
name: card
on:
  schedule:
    - cron: "17 4 * * *" # daily, at an off-peak minute
  push:
    branches: [main]
    paths: [banner.config.mjs]
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: card
  cancel-in-progress: true
jobs:
  card:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx --yes github:hartestarke/ascii-banner#v0.4.0 fetch
        env:
          GITHUB_TOKEN: ${{ github.token }}
      - run: npx --yes github:hartestarke/ascii-banner#v0.4.0 card
      - run: |
          git add card.svg
          git diff --cached --quiet -- card.svg && exit 0
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -m "Refresh card" && git push
```

The workflow's own token is enough, since everything the card shows is public,
and a day that changes nothing on the card commits nothing. GitHub disables a
public repository's scheduled workflows after 60 days without activity in it;
if yours stops, enable it again in the Actions tab.

## What it shows

**The header** is `title login@github` for a person and the repository's name
for a project. `title` defaults to the name on GitHub.

**The rows** are yours first (`rows`, `[key, value]` pairs), then GitHub's, in
the order `show` gives them (all of them by default):

| Mode | Row | Value |
| --- | --- | --- |
| person | `uptime` | the account's age |
| person | `repos` | public repositories (forks not counted), the stars of the 100 most-starred, followers |
| person | `languages` | the four largest by bytes across those repositories |
| person | `contributions` | contributions in the last year |
| project | `release` | the latest release's tag and date |
| project | `license` | its SPDX id (`other` when GitHub can't tell) |
| project | `stats` | stars, forks, open issues |
| project | `commits` | commits on the default branch, and how long ago the last one landed |
| project | `languages` | a bar split by language, and the two largest |

A project's description wraps under the header, two lines at most. A value too
long for its row is cut with `..` and a warning.

**The activity** (`activity`, a person only) is the last year of
contributions:

- `"sparkline"` (the default): a block per week, its height on a log scale, `·`
  for a week without any.
- `"calendar"`: a square per day, Sunday to Saturday down each week, in the
  five shades GitHub gives each day.
- `"none"`.

A narrow card shows the latest weeks that fit.

**The portrait** (`portrait`):

- `"avatar"` (a person's default): the GitHub avatar, on a dark screen
  (`screen`) so that it reads as a photo on light pages too. PNG and baseline
  JPEG avatars are decoded without dependencies.
- `"solid"` (a project's default): the [`solid`](fields.md#solid) field's
  torus, frozen.
- `"none"`: rows only.

## Make it yours

**Layout** (`layout`):

- `"dots"` (the default): `key ········ value`, each value right-aligned at the
  column's end, the header ruled to it.
- `"colon"`: neofetch's own `key: value`, under an underlined header.

**Colours.** The card draws in the banner's `accent` at different alphas, so
it reads on light and dark pages alike. The keys, the title, the activity and
the portrait take the accent; the values, the handle and the description take
`ink`, a grey (`#7d8590`) that reads on both. `ink: null` draws them in the
accent too, and the keys step back to a dimmer shade of it.

**Swatches** (`swatches: true`) end the rows with eight colour blocks, as
neofetch does: the accent from faint to full, or, with a `"natural"` or
`"gray"` avatar, the portrait's own palette from dark to light.

**Avatar colours** (`avatarColors`, with `portrait: "avatar"`):

- `"accent"` (the default): four tones of the accent.
- `"natural"`: the avatar's own colours, cut to a palette of 16 and dithered.
  It costs about twice the bytes (see [Size](#size)).
- `"gray"`: eight greys.

## The intro

On load the card builds itself up. The screen fades in, the portrait develops
top to bottom one tone at a time, darkest first, the rows come in one after
another, and each number counts up once its row is in. Then a band of light
keeps crossing the activity, lifting every week or day two shades as it
passes. All of it is over in under 3 s.

How a row comes in (`reveal`):

| `reveal` | The row |
| --- | --- |
| `"type"` (the default) | is typed a column at a time behind a cursor |
| `"decode"` | starts as noise over its words, which locks into the text from left to right; the leader dots appear behind the front |
| `"slide"` | slides in from the right, fading up |
| `"glitch"` | flickers in, jumping sideways |

The calendar always wipes in week by week.

When it plays (`intro`):

- `"once"` (the default): on every page load.
- `"loop"`: every `period` seconds. The card holds, goes away in the order it
  came in (a typed row is backspaced out, the screen leaves last), and comes
  back. A `period` too short for the card is an error that names the shortest
  one that fits.
- `"none"`: no animation at all.

Under `prefers-reduced-motion` the card is always still: the markup itself is
the finished card, and the animations only hide parts of it for a while.

## Config

Every key of the `card` block, with its default:

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `"person"` | `"person"`: a GitHub user; `"project"`: a repository |
| `user` | `null` | the GitHub login, mode `"person"` |
| `repo` | `null` | `"owner/name"`, mode `"project"` |
| `data` | `"card.data.json"` | the snapshot `fetch` writes and `card` reads, relative to the config |
| `title` | `null` | the header's leading name; `null` = the name on GitHub, else the login or repo |
| `rows` | `[]` | your own `[key, value]` rows, shown first |
| `show` | `null` | GitHub's rows in order; `null` = all of the mode's |
| `activity` | `null` | `"sparkline"`, `"calendar"` or `"none"`; `null` = sparkline for a person, none for a project |
| `intro` | `"once"` | `"once"`, `"loop"` or `"none"` |
| `period` | `12` | s, one cycle of `intro: "loop"` |
| `reveal` | `"type"` | how a row comes in: `"type"`, `"decode"`, `"slide"` or `"glitch"` |
| `layout` | `"dots"` | `"dots"` (`key ··· value`) or `"colon"` (`key: value`) |
| `ink` | `"#7d8590"` | `#rrggbb` of the values, the handle and the description; `null` = the accent |
| `swatches` | `false` | a row of colour blocks under the rows |
| `portrait` | `null` | `"avatar"`, `"solid"` or `"none"`; `null` = avatar for a person, solid for a project |
| `avatarColors` | `"accent"` | `"accent"`, `"natural"` or `"gray"`; anything but `"accent"` needs `portrait: "avatar"` |
| `screen` | `"#0d1117"` | `#rrggbb` behind the avatar; `null` = none |
| `width` | `880` | px, at least 600 |
| `textSize` | `13` | px; the text column needs room for 30 characters |

The card uses the banner's `accent` and embedded font (`font.file`,
`font.advance`, `font.blockHeight`). Your own text must stay within the font's
glyphs, or an error names the missing ones; text from GitHub outside them is
drawn as `?`, with a warning.

## Privacy

A card is public, so the snapshot holds only public data, and only what the
card draws. A person's repositories count only if they are public and not
forks; a private repository in mode `"project"` is refused. A person's
snapshot keeps the login, name, account date, follower, repository and star
counts, languages and the contribution calendar, plus the avatar image when
the portrait is `"avatar"`.

## Size

The cards above are 64 KB (the person, with the avatar, the calendar and
`decode`) and 22 KB (the project) raw, 17 KB and 10 KB gzipped. The intro adds
7 to 14 KB raw to a person's card, 1 to 2 KB gzipped; `decode` costs the most,
for its noise frames. A `"natural"` avatar about doubles the raw size, to
118 KB (23 KB gzipped); a `"gray"` one comes to 91 KB (20 KB).
