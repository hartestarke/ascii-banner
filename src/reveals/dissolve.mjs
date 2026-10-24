// Dissolve: glyph cells switch on in ordered-dither order. Each tagline's
// mask is filled with a <pattern> whose tile is matrix × matrix cells (one
// glyph cell each, tile origin on the tagline grid); every cell is a white rect
// that turns opaque at its threshold tick, so the animation count is matrix²
// whatever the text length (Firefox does repaint animated pattern children).
// At `seconds` a plain copy takes over (swapCss), so the settled line has no
// cell seams. The knockout copy uses the same mask and the same swap.
import { EMPTY, animate, keyframes, margins, rowsBox, swapCss } from "./common.mjs";

const MATRICES = [2, 4, 8];
const ORDERS = ["bayer", "random"];

/** Bayer threshold matrix of size n (a power of two): ranks 0..n²-1. */
const bayer = (n) => {
  let m = [[0]];
  while (m.length < n) {
    const s = m.length;
    m = Array.from({ length: 2 * s }, (_, y) =>
      Array.from({ length: 2 * s }, (_, x) => 4 * m[y % s][x % s] + [[0, 2], [3, 1]][Math.floor(y / s)][Math.floor(x / s)]));
  }
  return m;
};

export default {
  defaults: {
    matrix: 4, // dither tile size in cells: 2 | 4 | 8 (matrix² switch-on steps)
    order: "bayer", // "bayer" = ordered dither; "random" = shuffled thresholds
  },

  validate(o, v) {
    v.oneOf("matrix", MATRICES);
    v.oneOf("order", ORDERS);
  },

  render(ctx) {
    const { o, layout, figs, CUT, pct, num2, jitter, wrap, textRows, knockRows, delays } = ctx;
    if (!figs.length) return EMPTY;
    const { TPX, TPY, rowY, SLOT_T, TDUR, NT, tickT } = layout;
    const M = o.matrix;
    const { MX, MY } = margins(layout, CUT);
    const { top, height: h } = rowsBox(layout, MY);

    // Cell rank → switch-on tick, spread evenly over the reveal; the last rank
    // lands a tick before the settled copy takes over.
    let rank = bayer(M).flat();
    if (o.order === "random") {
      const a = rank.map((_, i) => i);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(jitter(i * 389 + 71) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      rank = a;
    }
    const tickOf = (r) => Math.max(1, Math.round(((r + 1) * (NT - 1)) / (M * M)));
    const ticks = [...new Set(rank.map(tickOf))].sort((a, b) => a - b);

    let defs = "";
    const overlay = [];
    const cuts = [];
    figs.forEach((rows, p) => {
      let cells = "";
      rank.forEach((r, c) => {
        const x = (c % M) * TPX;
        const y = Math.floor(c / M) * TPY;
        cells += `<rect class="dvc${tickOf(r)} dvd${p}"${x ? ` x="${num2(x)}"` : ""}${y ? ` y="${num2(y)}"` : ""} width="${num2(TPX)}" height="${num2(TPY)}"/>`;
      });
      const box = `x="${num2(-MX)}" y="${num2(top)}" width="${num2(rows[0].length * TPX + 2 * MX)}" height="${num2(h)}"`;
      defs +=
        `<pattern id="dvp${p}" patternUnits="userSpaceOnUse" y="${num2(rowY(0) - TPY / 2)}" width="${num2(M * TPX)}" height="${num2(M * TPY)}"><g fill="#fff">${cells}</g></pattern>` +
        `<mask id="dv${p}" maskUnits="userSpaceOnUse"><rect ${box} fill="url(#dvp${p})"/></mask>`;
      const layers = (rowsOf) => `<g class="dvl dvd${p}" mask="url(#dv${p})">${rowsOf(p)}</g><g class="dvs dvd${p}">${rowsOf(p)}</g>`;
      overlay.push(wrap(p, layers(textRows)));
      if (CUT > 0) cuts.push(wrap(p, layers(knockRows)));
    });

    const css = ticks.map((k) =>
      animate(`dvc${k}`, `dvc${k}`, TDUR) +
      keyframes(`dvc${k}`, [["0", "opacity:0"], [pct(tickT(k)), "opacity:1"], [pct(SLOT_T), "opacity:0"], ["100", "opacity:0"]]),
    ).join("");
    return {
      defs,
      css: `\n[class^=dvc]{opacity:0}\n${css}${swapCss(ctx, "dv")}\n${delays("dvd")}`,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: { stop: ["[class^=dv]"], settle: ".dvs.dvd0{transform:none}" },
      extraGlyphs: "",
    };
  },
};
