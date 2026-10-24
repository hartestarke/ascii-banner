// None: no reveal animation. Each line shows settled for its whole slot and
// cuts to the next, the knockout open with it; a lone line is a static image,
// with no CSS animation at all.
import { EMPTY, animate, keyframes, offCanvas } from "./common.mjs";

export default {
  defaults: {},

  render(ctx) {
    const { H, CUT, layout, figs, pct, wrap, textRows, knockRows, delays } = ctx;
    if (!figs.length) return EMPTY;
    const base = { defs: "", extraGlyphs: "" };
    if (figs.length === 1)
      return {
        ...base, css: "",
        overlay: wrap(0, textRows(0)),
        knockout: CUT > 0 ? wrap(0, knockRows(0)) : "",
        reducedMotionCss: { stop: [], settle: "" },
      };

    const HIDE = offCanvas(H);
    const slot = (rowsOf) => figs.map((_, p) => wrap(p, `<g class="nr nrd${p}">${rowsOf(p)}</g>`));
    return {
      ...base,
      css: `\n.nr{${HIDE}}${animate("nr", layout.TDUR)}` +
        keyframes("nr", [["0", "transform:none"], [pct(layout.SLOT_T), HIDE], ["100", HIDE]]) +
        `\n${delays("nrd")}`,
      overlay: slot(textRows).join("\n"),
      knockout: CUT > 0 ? slot(knockRows).join("") : "",
      reducedMotionCss: { stop: [".nr"], settle: ".nrd0{transform:none}" },
    };
  },
};
