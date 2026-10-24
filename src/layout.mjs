// Tagline layout shared by every reveal preset: row count, font size, row
// positions and the slot timeline. Pure numbers; the preset turns them into markup.
import { num } from "./svg.mjs";

/** Side effect: pads every tagline in figs, in place, to the same row count. */
export function layoutTaglines(cfg, figs) {
  const { width: W, height: H } = cfg.size;
  const t = cfg.tagline;
  const r = cfg.reveal;
  const adv = cfg.font.advance;
  // Every tagline gets the same row count so row i means the same thing in all
  // of them (fonts can end some glyphs with blank rows that figlet() drops).
  const TROWS = Math.max(0, ...figs.map((rows) => rows.length));
  for (const rows of figs) while (rows.length < TROWS) rows.push(" ".repeat(rows[0].length));
  const maxCols = Math.max(0, ...figs.map((rows) => rows[0].length));
  // Font size: fit the widest line, capped by the height budget; rounded to
  // 0.1px because that is what the SVG carries, and the pitch derives from it.
  // No taglines → 0, so the unused tagline CSS stays finite.
  const TFONT = !TROWS ? 0 : +num(Math.min((W * t.fill) / maxCols / adv, (H * t.maxHeight) / (TROWS * t.lineHeight)));
  const TPX = TFONT * adv;
  const TPY = TFONT * t.lineHeight;
  const rowY = (i) => H / 2 - (TROWS * TPY) / 2 + TPY / 2 + i * TPY;
  // Tagline p owns the slot [p·SLOT_T, (p+1)·SLOT_T) of a TDUR loop: `seconds`
  // of reveal, then `hold` settled; outside its slot it is fully hidden.
  const SLOT_T = r.seconds + r.hold;
  const TDUR = figs.length * SLOT_T || cfg.field.loopSeconds;
  const NT = Math.round(r.seconds * r.fps);
  // Tick k's time: NT ticks spread over exactly `seconds`, so rounding NT can
  // never push the last tick past the slot into the next line.
  const tickT = (k) => (k * r.seconds) / NT;
  return { TROWS, maxCols, TFONT, TPX, TPY, rowY, SLOT_T, TDUR, NT, tickT };
}
