// Fade: the line's opacity eases in over `seconds`, optionally through a
// stepped, flickering "CRT warm-up", then holds. With `rows` the figlet rows
// fade in one after another, top to bottom. The knockout copy fades with it,
// so the hole in the field opens as the letters appear.
import { EMPTY, animate, keyframes } from "./common.mjs";

const ROW_SPAN = 0.5; // rows mode: fraction of `seconds` one row takes to fade in

export default {
  defaults: {
    flicker: 0, // 0..1: strength of the stepped random opacity before it settles; 0 = smooth ease-in
    rows: false, // true = rows fade in one after another, top to bottom
  },

  validate(o, v) {
    v.unit("flicker");
  },

  render(ctx) {
    const { o, cfg, layout, figs, CUT, pct, num2, jitter, wrap, rowText, rowKnock, textRows, knockRows, delays } = ctx;
    if (!figs.length) return EMPTY;
    const { TROWS, SLOT_T, TDUR, NT, tickT } = layout;
    const S = cfg.reveal.seconds;

    // Opacity stops of a fade-in over [a, b] seconds: one ease-in segment, or
    // stepped on the reveal ticks with a flicker that dies out as it settles.
    const fadeIn = (a, b, seed) => {
      if (!o.flicker) return [[pct(a), "opacity:0;animation-timing-function:ease-in"], [pct(b), "opacity:1"]];
      const ka = Math.round((a / S) * NT);
      const kb = Math.max(ka + 1, Math.round((b / S) * NT));
      const out = [];
      let prev;
      for (let k = ka; k < kb; k++) {
        const u = (k - ka) / (kb - ka);
        const v = num2(Math.min(1, Math.max(0, u * u + o.flicker * (2 * jitter(seed * 4099 + k * 37 + 13) - 1) * (1 - u))));
        if (v !== prev) out.push([pct(tickT(k)), `opacity:${v}`]);
        prev = v;
      }
      return [...out, [pct(tickT(kb)), "opacity:1"]];
    };
    const timeline = (name, a, b, seed) => keyframes(name, [
      ...(a > 0 ? [["0", "opacity:0"]] : []),
      ...fadeIn(a, b, seed),
      [pct(SLOT_T), "opacity:0"],
      ["100", "opacity:0"],
    ]);

    let css = "";
    const overlay = [];
    const cuts = [];
    if (o.rows) {
      // Row i fades over [a_i, a_i + span]; the last row lands on `seconds`.
      const span = TROWS > 1 ? S * ROW_SPAN : S;
      for (let i = 0; i < TROWS; i++) {
        const a = TROWS > 1 ? ((S - span) * i) / (TROWS - 1) : 0;
        css += animate(`op${i}`, `op${i}`, TDUR) + timeline(`op${i}`, a, a + span, i + 1);
      }
      const rowGroups = (p, row) => figs[p].map((_, i) => (row(p, i) ? `<g class="op${i} opd${p}">${row(p, i)}</g>` : "")).join("");
      figs.forEach((_, p) => {
        overlay.push(wrap(p, rowGroups(p, rowText)));
        if (CUT > 0) cuts.push(wrap(p, rowGroups(p, rowKnock)));
      });
    } else {
      css += animate("op", "op", TDUR) + timeline("op", 0, S, 0);
      figs.forEach((_, p) => {
        overlay.push(wrap(p, `<g class="op opd${p}">${textRows(p)}</g>`));
        if (CUT > 0) cuts.push(wrap(p, `<g class="op opd${p}">${knockRows(p)}</g>`));
      });
    }
    return {
      defs: "",
      // Hidden by default: before its first slot (animation delay, no fill)
      // and under reduced motion every line rests transparent.
      css: `\n[class^=op]{opacity:0}\n${css}\n${delays("opd")}`,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: { stop: ["[class^=op]"], settle: ".opd0{opacity:1}" },
      extraGlyphs: "",
    };
  },
};
