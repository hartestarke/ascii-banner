// Named glyph sets that field.ramp and reveal.pool take in place of a string of
// their own. Each is written as a ramp, levels dim → bright separated by spaces,
// and every glyph is in the bundled font subset (fonts/glyphs.txt). Levels are
// ordered by eye, dim to bright, not by measured ink; binary is 0 then 1 by
// convention, though 0 inks more.
export const GLYPH_SETS = {
  classic: ":. !/ \\| 1? 7* 25 %0 &# 8@",
  digits: "7 4 1 2 6 3 9 5 0 8",
  // · and ∙ are the same dot 20 units apart, so only one of them is a level;
  // ◉ inks less than ●, so the solid dot is the brightest.
  dots: "· • ○ ◉ ●",
  squares: "▫ ▪ □ ■",
  shapes: "◇ △ ◆ ▲",
  shade: "░ ▒ ▓ █",
  binary: "0 1",
  lines: "┊ ┆ │ ┃",
};
