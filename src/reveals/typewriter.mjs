// Typewriter: the line is typed letter by letter. Each tagline character is one
// keystroke that shows its whole figlet glyph, every row at once, and a cursor
// block sits right after the last typed letter. Keystrokes land on reveal ticks
// at uneven but deterministic intervals over `seconds`, the last on the final
// tick. A glyph's columns come from the figlet layout's spans: fitting and
// smushing leave no blank column between letters to find them by. The window
// works like scramble's (Firefox ignores transforms on a clipPath's children):
// the clipped group slides right, the inner group counter-slides the glyphs.
// The knockout copy rides the same window plus a black cursor, so the hole in
// the field follows the typing.
import { EMPTY, animate, keyframes, slideKeyframes } from "./common.mjs";

// Seeds of a stroke's interval draw: keep taglines and strokes on distinct jitter() inputs.
const SEED_TAGLINE = 1009;
const SEED_STROKE = 37;
const SEED_OFFSET = 3;

/**
 * Columns typed after each tick k = 0..NT. Keystroke i lands where the running
 * sum of the interval weights weight(i) reaches its share of ticks 1..NT,
 * rounded and never before the previous stroke, so the last one lands on NT.
 */
function typedCols(spans, NT, weight) {
  let total = 0;
  const cum = spans.map((_, i) => (total += weight(i)));
  let tick = 1;
  // With every weight 0 (jitter 1 can draw zeros) there is no pace to follow: all strokes land on NT.
  const strokes = cum.map((c) => (tick = Math.max(tick, total > 0 ? Math.round((NT * c) / total) : NT)));
  const typed = [];
  for (let k = 0, j = -1; k <= NT; k++) {
    while (j + 1 < strokes.length && strokes[j + 1] <= k) j++;
    typed.push(j < 0 ? 0 : spans[j][1]);
  }
  return typed;
}

export default {
  defaults: {
    cursor: "█",
    blink: 0, // period in seconds; 0 = the cursor leaves when the line settles
    jitter: 0.5, // spread of the keystroke intervals: 0 = even, 1 = from almost nothing to twice the mean
  },

  validate(o, v) {
    // One code point fills one column; control characters can't go into XML.
    v.check([...o.cursor].length <= 1 && !/[\x00-\x1F\x7F]/.test(o.cursor), "cursor",
      `must be one character or "", got ${JSON.stringify(o.cursor)}`);
    v.nonNeg("blink");
    v.check(o.blink === 0 || o.blink >= 0.1, "blink", `must be 0 or at least 0.1 s, got ${o.blink}`);
    v.unit("jitter");
  },

  render(ctx) {
    const { o, cfg, layout, figs, spans, H, CUT, esc, num, num2, pct, jitter, wrap, textRows, knockRows, delays } = ctx;
    if (!figs.length) return EMPTY;
    const { TROWS, maxCols, TPX, rowY, SLOT_T, TDUR, NT, tickT } = layout;
    const S = cfg.reveal.seconds;
    // Margin columns between the window edge and the text, enough to keep the
    // knockout stroke hidden before the first tick and uncut once settled.
    const MC = Math.max(1, Math.ceil((CUT / 2 + 1) / TPX));
    const LW = (maxCols + 2 * MC) * TPX;
    const defs = `<clipPath id="tw"><rect x="${num2(-MC * TPX - LW)}" width="${num2(LW)}" height="${H}"/></clipPath>`;
    const tx = (x) => (x ? `transform:translateX(${num2(x)}px)` : "transform:none");

    let css = "";
    const overlay = [];
    const cuts = [];
    const settle = [];
    figs.forEach((rows, p) => {
      const cols = rows[0].length;
      const typed = typedCols(spans[p], NT, (i) =>
        1 + o.jitter * (2 * jitter(p * SEED_TAGLINE + i * SEED_STROKE + SEED_OFFSET) - 1));
      // typed[k] is also the cursor's column; tick NT opens the right margin.
      const front = (k) => (k === 0 ? 0 : k < NT ? MC + typed[k] : cols + 2 * MC);
      css += animate(`tw${p}`, TDUR) + animate(`twi${p}`, TDUR) +
        slideKeyframes(ctx, `tw${p}`, (k) => tx(front(k) * TPX), "transform:none") +
        slideKeyframes(ctx, `twi${p}`, (k) => tx(-front(k) * TPX), "transform:none");
      if (p === 0) settle.push(`.tw0{${tx(front(NT) * TPX)}}.twi0{${tx(-front(NT) * TPX)}}`);

      let cursor = "";
      let knockCursor = "";
      if (o.cursor) {
        const stops = [["0", "opacity:1;transform:none"]];
        for (let k = 1; k < NT; k++) if (typed[k] !== typed[k - 1]) stops.push([pct(tickT(k)), tx(typed[k] * TPX)]);
        stops.push([pct(S), `${tx(cols * TPX)};opacity:${o.blink > 0 ? 1 : 0}`]);
        if (o.blink > 0)
          for (let j = 1, t = S + o.blink / 2; t < SLOT_T - 1e-9; j++, t = S + (j * o.blink) / 2)
            stops.push([pct(t), `opacity:${j % 2 ? 0 : 1}`]);
        stops.push([pct(SLOT_T), "opacity:0"], ["100", "opacity:0"]);
        css += animate(`twc${p}`, TDUR) + keyframes(`twc${p}`, stops);
        // One <text> for the whole column: the x/y lists place a glyph per row.
        const block = (cls) =>
          `<g class="twc twc${p} twd${p}"><text class="${cls}" x="${Array(TROWS).fill(0).join(" ")}" y="${rows.map((_, i) => num(rowY(i))).join(" ")}">${esc(o.cursor.repeat(TROWS))}</text></g>`;
        cursor = block("tg tx");
        knockCursor = block("tg");
      }
      const win = (body) => `<g class="tw${p} twd${p}" clip-path="url(#tw)"><g class="twi${p} twd${p}">${body}</g></g>`;
      overlay.push(wrap(p, win(textRows(p)) + cursor));
      if (CUT > 0) cuts.push(wrap(p, win(knockRows(p)) + knockCursor));
    });
    return {
      defs,
      css: `\n.twc{opacity:0}\n${css}\n${delays("twd")}`,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: { stop: ["[class^=tw]"], settle: settle.join("") },
      extraGlyphs: o.cursor,
    };
  },
};
