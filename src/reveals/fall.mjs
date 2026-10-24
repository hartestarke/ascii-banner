// Fall: glyph groups drop into place with an ease-out, their start times
// staggered left to right. Each group is its own <g> (transforms on plain
// groups are fine in Firefox, only clipPath children ignore them), sliding in
// from off the canvas, which also keeps it hidden before and after. Once every
// group has landed, at `seconds`, the groups swap for the canonical settled
// rows, so the settled line is identical to every other preset's. The
// knockout copies ride the same transforms.
import { EMPTY, animate, keyframes, margins, rowsBox } from "./common.mjs";

const FROM = ["top", "bottom", "scatter"];
const GROUPS = ["letter", "column"];
const CHUNK_COLS = 6; // "letter" fallback group width when the font butts letters together
const SCATTER_LEVELS = 3; // scatter: drop distances 1×, 1.5×, 2× the minimum

/**
 * Column ranges [a, b) of the glyph groups of one tagline. "letter" = runs of
 * non-blank columns between all-blank ones; when the font leaves no gap
 * between letters (fewer runs than letters) the runs are cut into CHUNK_COLS
 * pieces instead. "column" = every non-blank column on its own.
 */
function groups(rows, mode, text) {
  const cols = rows[0].length;
  const ink = Array.from({ length: cols }, (_, c) => rows.some((r) => r[c] !== " "));
  if (mode === "column") return ink.flatMap((on, c) => (on ? [[c, c + 1]] : []));
  const runs = [];
  for (let c = 0, a = -1; c <= cols; c++) {
    if (c < cols && ink[c]) {
      if (a < 0) a = c;
    } else if (a >= 0) {
      runs.push([a, c]);
      a = -1;
    }
  }
  const letters = [...text].filter((ch) => ch.trim()).length;
  if (runs.length >= letters) return runs;
  return runs.flatMap(([a, b]) => Array.from({ length: Math.ceil((b - a) / CHUNK_COLS) }, (_, i) => [a + i * CHUNK_COLS, Math.min(b, a + (i + 1) * CHUNK_COLS)]));
}

export default {
  defaults: {
    from: "top", // "top" | "bottom" | "scatter" (per-group direction and distance)
    group: "letter", // "letter" = gap-separated runs (6-column chunks for gapless fonts) | "column"
    stagger: 0.6, // fraction of `seconds` over which the groups' start times spread
  },

  validate(o, v) {
    v.oneOf("from", FROM);
    v.oneOf("group", GROUPS);
    v.unit("stagger");
  },

  render(ctx) {
    const { o, cfg, layout, figs, H, CUT, esc, num, num2, pct, jitter, runs, wrap, textRows, knockRows, delays } = ctx;
    if (!figs.length) return EMPTY;
    const { TPX, rowY, SLOT_T, TDUR, NT, tickT } = layout;
    const S = cfg.reveal.seconds;
    const { MY } = margins(layout, CUT);
    const { top, bottom } = rowsBox(layout, MY);
    // Smallest drops that start fully off the canvas, glyphs and knockout included.
    const DROP = { top: -bottom, bottom: H - top };
    const HIDE = `transform:translateY(${-H}px)`;

    // Start ticks spread over stagger·seconds; every group falls for D ticks and
    // lands by tick NT-1, so the swap at `seconds` never cuts a fall short.
    const SPREAD = NT >= 2 ? Math.min(NT - 2, Math.round(o.stagger * (NT - 1))) : 0;
    const D = NT >= 2 ? NT - 1 - SPREAD : 0;
    const variants = new Map(); // "start,drop" → keyframes index, shared by all taglines
    const css = [];
    const variant = (s, drop) => {
      const key = `${s},${drop}`;
      if (!variants.has(key)) {
        const i = variants.size;
        const off = `transform:translateY(${num2(drop)}px)`;
        const stops = s ? [["0", off]] : [];
        if (D) stops.push([pct(tickT(s)), `${off};animation-timing-function:ease-out`]);
        stops.push([pct(tickT(s + D)), "transform:none"], [pct(S), off], [pct(SLOT_T), off], ["100", off]);
        variants.set(key, i);
        css.push(animate(`dp${i}`, `dp${i}`, TDUR) + keyframes(`dp${i}`, stops));
      }
      return variants.get(key);
    };

    const overlay = [];
    const cuts = [];
    figs.forEach((rows, p) => {
      const gs = groups(rows, o.group, cfg.taglines[p]);
      let body = "";
      let knock = "";
      gs.forEach(([a, b], j) => {
        const s = gs.length > 1 ? Math.round((j * SPREAD) / (gs.length - 1)) : 0;
        let from = o.from;
        let scale = 1;
        if (from === "scatter") {
          const r = jitter(p * 7919 + j * 131 + 17);
          from = r < 0.5 ? "top" : "bottom";
          scale = 1 + Math.floor((r * 2 % 1) * SCATTER_LEVELS) / 2;
        }
        const i = variant(s, DROP[from] * scale);
        // One <text> per group, a positioned tspan per inked row segment.
        let spans = "";
        let kspans = "";
        rows.forEach((r, ri) => {
          const seg = r.slice(a, b).trimEnd();
          const lead = seg.length - seg.trimStart().length;
          if (lead === seg.length) return;
          const at = `x="${num2((a + lead) * TPX)}" y="${num(rowY(ri))}"`;
          spans += `<tspan ${at}>${runs(seg.slice(lead))}</tspan>`;
          kspans += `<tspan ${at}>${esc(seg.slice(lead))}</tspan>`;
        });
        body += `<g class="dp${i} dpd${p}"><text class="tg tx">${spans}</text></g>`;
        knock += `<g class="dp${i} dpd${p}"><text class="tg">${kspans}</text></g>`;
      });
      overlay.push(wrap(p, `${body}<g class="dps dpd${p}">${textRows(p)}</g>`));
      if (CUT > 0) cuts.push(wrap(p, `${knock}<g class="dps dpd${p}">${knockRows(p)}</g>`));
    });
    // The settled rows: off the canvas until `seconds`, in place until the slot ends.
    const settled = animate("dps", "dps", TDUR) +
      keyframes("dps", [["0", HIDE], [pct(S), "transform:none"], [pct(SLOT_T), HIDE], ["100", HIDE]]);
    return {
      defs: "",
      css: `\n[class^=dp]{${HIDE}}\n${settled}\n${css.join("\n")}\n${delays("dpd")}`,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: { stop: ["[class^=dp]"], settle: ".dps.dpd0{transform:none}" },
      extraGlyphs: "",
    };
  },
};
