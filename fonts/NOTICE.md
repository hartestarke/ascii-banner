# Font notice

`jetbrains-mono.woff2` is a subset of **JetBrains Mono Regular, version 2.304**.

- Source: https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304
  (asset `JetBrainsMono-2.304.zip`, file `fonts/ttf/JetBrainsMono-Regular.ttf`)
- Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
- Licence: SIL Open Font License, Version 1.1 — full text in `OFL.txt`.

## Subset

Covered Unicode ranges (303 code points):

- `U+0020–007E` — printable ASCII, including space
- `U+00B0`, `U+00B7` — degree sign, middle dot
- `U+2022` — bullet
- `U+2218`, `U+2219` — ring operator, bullet operator
- `U+2500–257F` — Box Drawing
- `U+2580–259F` — Block Elements
- `U+25A0–25FF` — Geometric Shapes: only the 43 that JetBrains Mono has (pyftsubset
  keeps what exists); `glyphs.txt` lists them

Every other range is present in full.

Every mapped glyph has an advance of 600 at 1000 units per em (0.6 em column pitch).
All OpenType layout features (ligatures, contextual alternates, kerning) are removed,
so runs such as `//`, `||` and `??` render as individual glyphs.

Command used (fonttools 4.66.1, with brotli):

```
pyftsubset JetBrainsMono-Regular.ttf --unicodes='U+0020-007E,U+00B0,U+00B7,U+2022,U+2218,U+2219,U+2500-257F,U+2580-259F,U+25A0-25FF' --flavor=woff2 --no-hinting --layout-features='' --output-file=jetbrains-mono.woff2
```

`glyphs.txt` lists every code point in the subset as its character, sorted, on one line.

## Reserved Font Name

The JetBrains Mono copyright notice declares no Reserved Font Name, so the OFL
renaming requirement does not restrict this Modified Version. It is distributed only as
the file `jetbrains-mono.woff2` and is used solely as a font embedded in generated SVGs;
it is not offered as a standalone font.
