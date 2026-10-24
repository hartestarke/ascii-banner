# Block fonts: provenance and licence

The fonts in this directory are original work for ascii-banner:

- `src/hairline.txt` is a 5×7 glyph bitmap drawn by hand for this project.
  It covers space, `A`–`Z`, `0`–`9` and the 32 ASCII punctuation marks. It was
  not traced or converted from any existing font.
- `block.flf`, `block-shadow.flf`, `pixel.flf` and `thin.flf` are generated from
  that bitmap by `tools/mkfont.mjs`. Each is a different way of drawing the same
  pixels with Unicode Block Elements.

They are covered by the repository's MIT licence (see `LICENSE` at the repo
root). This is unlike `../ansi-shadow.flf`, whose licence is unclear (see
`../ANSI-SHADOW-NOTICE.md`).

Format, faces and samples are documented in `docs/block-fonts.md`.

## Regenerate

The `.flf` files are build output. Never edit them by hand. Change the bitmap
or the generator, then run:

```sh
node tools/mkfont.mjs --all
```

The output is deterministic, so if `git status` shows no change to the `.flf`
files, nothing changed.

## Edit or add a glyph

Edit `src/hairline.txt`. Each glyph is a `# <char>` header (`# space` for the
space) followed by 7 rows of `#`/`.`, at most 5 wide, with a blank line after.
Do not draw the gap between glyphs; the generator adds it. Undrawn lowercase
letters reuse the capitals, and any other undrawn character renders blank.
Regenerate, then look at the result through every face before committing.

## Add a face

1. In `tools/mkfont.mjs`, add an entry to `FACES`: `about` (one line, written
   into the font's comment block), `shadowGlyphs` (the glyphs a config should
   list in `tagline.shadowGlyphs`, `""` for none) and `render(bits)`. `render`
   takes one glyph as 7 rows of booleans, with the gap column already
   appended. It returns the text rows, the same number of rows for every glyph.
2. Use only characters the embedded font covers: printable ASCII, Box Drawing
   (U+2500–257F) and Block Elements (U+2580–259F). The banner build rejects
   anything else.
3. Run `node tools/mkfont.mjs --all`. It writes `<face>.flf` here.
4. Add the face to the table and samples in `docs/block-fonts.md`, and give the
   integrator its registry entry (`name`, `file`, `shadowGlyphs`, `layout: "full"`).
