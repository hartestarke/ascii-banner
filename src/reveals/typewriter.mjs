// Typewriter: every figlet row advances in lockstep, whole columns at a time
// on the reveal ticks, left to right over `seconds`; a cursor block rides the
// front. Same window mechanics as scramble (Firefox ignores transforms on a
// clipPath's children): the clipped group slides right, the inner group
// counter-slides the glyphs. The knockout copy rides the same window, plus a
// black cursor, so the hole in the field follows the front.
import { EMPTY, animate, keyframes } from "./common.mjs";

// Control characters can't go into XML; one code point fills one column.
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

export default {
  defaults: {
    cursor: "█", // cursor glyph riding the front (full block); "" = no cursor
    blink: 0, // 0 = the cursor leaves when the line settles; > 0 = blink period in seconds during the hold
  },

  validate(o, v) {
    v.check([...o.cursor].length <= 1 && !CONTROL_CHARS.test(o.cursor), "cursor",
      `must be one character or "", got ${JSON.stringify(o.cursor)}`);
    v.nonNeg("blink");
  },

  render(ctx) {
    const { o, cfg, layout, figs, H, CUT, esc, num, num2, pct, wrap, textRows, knockRows, delays } = ctx;
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
      // Columns shown after tick k (k = NT also opens the right margin) and
      // the cursor's column.
      const caret = (k) => (k < NT ? Math.round((k * cols) / NT) : cols);
      const front = (k) => (k === 0 ? 0 : k < NT ? MC + caret(k) : cols + 2 * MC);
      const win = [["0", "transform:none"]];
      const inner = [["0", "transform:none"]];
      for (let k = 1; k <= NT; k++)
        if (front(k) !== front(k - 1)) {
          win.push([pct(tickT(k)), tx(front(k) * TPX)]);
          inner.push([pct(tickT(k)), tx(-front(k) * TPX)]);
        }
      for (const s of [win, inner]) s.push([pct(SLOT_T), "transform:none"], ["100", "transform:none"]);
      css += animate(`tw${p}`, `tw${p}`, TDUR) + animate(`twi${p}`, `twi${p}`, TDUR) + keyframes(`tw${p}`, win) + keyframes(`twi${p}`, inner);
      if (p === 0) settle.push(`.tw0{${tx(front(NT) * TPX)}}.twi0{${tx(-front(NT) * TPX)}}`);

      let cursor = "";
      let knockCursor = "";
      if (o.cursor) {
        const stops = [["0", "opacity:1;transform:none"]];
        for (let k = 1; k < NT; k++) if (caret(k) !== caret(k - 1)) stops.push([pct(tickT(k)), tx(caret(k) * TPX)]);
        stops.push([pct(S), `${tx(cols * TPX)};opacity:${o.blink > 0 ? 1 : 0}`]);
        if (o.blink > 0)
          for (let j = 1, t = S + o.blink / 2; t < SLOT_T - 1e-9; j++, t = S + (j * o.blink) / 2)
            stops.push([pct(t), `opacity:${j % 2 ? 0 : 1}`]);
        stops.push([pct(SLOT_T), "opacity:0"], ["100", "opacity:0"]);
        css += animate(`twc${p}`, `twc${p}`, TDUR) + keyframes(`twc${p}`, stops);
        // One <text> per tagline: the glyph repeated down every row, each copy
        // placed by the x/y position lists.
        const block = (cls) =>
          `<g class="twc twc${p} twd${p}"><text class="${cls}" x="${Array(TROWS).fill(0).join(" ")}" y="${rows.map((_, i) => num(rowY(i))).join(" ")}">${esc(o.cursor.repeat(TROWS))}</text></g>`;
        cursor = block("tg tx");
        knockCursor = block("tg");
      }
      const window = (body) => `<g class="tw${p} twd${p}" clip-path="url(#tw)"><g class="twi${p} twd${p}">${body}</g></g>`;
      overlay.push(wrap(p, window(textRows(p)) + cursor));
      if (CUT > 0) cuts.push(wrap(p, window(knockRows(p)) + knockCursor));
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
