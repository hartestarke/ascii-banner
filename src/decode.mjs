// Tagline decode plan: sizing, per-row torn fronts, front shuffles and the
// scramble glyphs. Pure numbers and strings; svg.mjs renders them.
//
// Each line decodes left to right behind a torn front: every figlet row has
// its own clip windows, stepping in whole columns along a shared uneven pace
// plus a bounded per-row wander. A band of cycling ramp glyphs (`lead`
// columns) runs ahead of the settled text, so the scramble itself sweeps in
// rather than standing there as a placeholder.
import { jitter } from "./field.mjs";
import { num } from "./svg.mjs";

/**
 * @param figs  figlet rows per tagline (figlet.mjs)
 * @param pool  glyphs the scramble draws from (the flattened ramp)
 */
export function planDecode(cfg, figs, pool) {
  const { width: W, height: H } = cfg.size;
  const t = cfg.tagline;
  const d = cfg.decode;
  const adv = cfg.font.advance;
  // Every tagline gets the same row count so row i means the same thing in all
  // of them (fonts can end some glyphs with blank rows that figlet() drops).
  const TROWS = Math.max(0, ...figs.map((r) => r.length));
  for (const rows of figs) while (rows.length < TROWS) rows.push(" ".repeat(rows[0].length));
  const maxCols = Math.max(0, ...figs.map((r) => r[0].length));
  // Font size: fit the widest line, capped by the height budget; rounded to
  // 0.1px because that is what the SVG carries, and the pitch derives from it.
  // No taglines → 0, so the unused tagline CSS stays finite.
  const TFONT = !TROWS ? 0 : +num(Math.min((W * t.fill) / maxCols / adv, (H * t.maxHeight) / (TROWS * t.lineHeight)));
  const TPX = TFONT * adv;
  const TPY = TFONT * t.lineHeight;
  const rowY = (r) => H / 2 - (TROWS * TPY) / 2 + TPY / 2 + r * TPY;
  const SLOT_T = d.seconds + d.hold;
  const TDUR = figs.length * SLOT_T || cfg.field.loopSeconds;
  const NT = Math.round(d.seconds * d.fps);
  // Tick k's time: NT ticks spread over exactly `seconds`, so rounding NT can
  // never push the last tick past the slot into the next line.
  const tickT = (k) => (k * d.seconds) / NT;
  const { lead: LEAD, leadVar: LEAD_VAR, rag: RAG, ragTicks: RAG_TICKS, burst: BURST } = d;

  // Decode geometry, in whole tagline columns so a window never slices a glyph.
  // Each tagline sits in a wrapper translated to its own left edge, so text
  // starts at local x=0 and one set of keyframes serves every line: a front
  // travels TRAVEL columns from START_COLS left of the text (scramble band and
  // knockout margin still off the letters) to the widest line's right edge.
  // Shorter lines simply finish sooner — the pace per column is constant.
  const leads = Array.from({ length: TROWS }, (_, i) => Math.max(1, Math.round(LEAD * (1 + LEAD_VAR * (2 * jitter(i * 61 + 7) - 1)))));
  const START_COLS = Math.max(0, ...leads) + 2; // +1 column of knockout margin, +1 for its stroke
  const TRAVEL = START_COLS + maxCols;
  const START = START_COLS * TPX;
  const END = TRAVEL * TPX;
  const FAR = START + END; // left reach of the open-ended clips: covers the text at full travel

  // Mean front: uneven pace, over-travelling by RAG at both ends so every row
  // starts hidden and lands on its own tick instead of snapping on the last one.
  const meanFront = (() => {
    const pace = Array.from({ length: NT }, (_, k) => 1 + BURST * (2 * jitter(k * 53 + 11) - 1));
    const total = pace.reduce((a, b) => a + b, 0);
    let acc = 0;
    return [-RAG, ...pace.map((v) => -RAG + ((acc += v) / total) * (TRAVEL + 2 * RAG))];
  })();
  // Row front per tick: the mean plus a wander interpolated between random
  // knots, clamped to the travel; a row only ever advances.
  const rowFront = (pattern) => {
    const knot = (j) => 2 * jitter(pattern * 4099 + j * 61 + 3) - 1;
    const out = [0];
    for (let k = 1; k <= NT; k++) {
      const j = Math.floor(k / RAG_TICKS);
      const u = (k % RAG_TICKS) / RAG_TICKS;
      const wander = RAG * (knot(j) * (1 - u) + knot(j + 1) * u);
      out.push(Math.min(TRAVEL, Math.max(out[k - 1], Math.round(meanFront[k] + wander))));
    }
    return out;
  };
  const fronts = Array.from({ length: TROWS }, (_, i) => rowFront(i));

  // Which front pattern each row rides is reshuffled per tagline, so the tear
  // doesn't repeat line after line at no cost in keyframes.
  const shuffled = (n, seed) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(jitter(seed * 101 + i * 7 + 29) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const patterns = figs.map((_, p) => shuffled(TROWS, p));

  // Scramble frame k of tagline p, row i: ramp glyphs where the row has ink.
  const noise = (p, i, k, row) => {
    let s = "";
    for (let c = 0; c < row.length; c++)
      s += row[c] === " " ? " " : pool[Math.floor(jitter(p * 7919 + k * 131 + i * 977 + c * 31 + 5) * pool.length)];
    return s;
  };

  return {
    TROWS, maxCols, TFONT, TPX, TPY, rowY, SLOT_T, TDUR, NT, tickT,
    leads, START, END, FAR, fronts, patterns, noise,
    // Scramble frames sit in a vertical strip that steps behind the row's band
    // clip: one animation per row instead of one per frame. Two row pitches
    // keep the neighbouring frames' glyphs clear of the band.
    STRIP: Math.ceil(2 * TPY),
    BAND: 1.5 * TFONT, // band clip height; the em box spans 1.32em
  };
}
