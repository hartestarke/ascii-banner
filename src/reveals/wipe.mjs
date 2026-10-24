// Wipe: one window per tagline sweeps over the line. The window is a <mask>
// rect that scales from 0 to full size about the edge (or centre) the wipe
// starts from — a scale needs no per-line distances, so one keyframes set
// serves every line. The knockout copy uses the same mask, so the hole in the
// field opens with the window; at `seconds` plain copies take over (swapCss).
import { EMPTY, animate, keyframes, margins, rowsBox, swapCss } from "./common.mjs";

const DIRECTIONS = ["right", "left", "down", "up", "center", "edges"];

export default {
  defaults: {
    direction: "right", // way the edge travels: "right" | "left" | "down" | "up" | "center" (opens outwards) | "edges" (closes inwards)
    steps: 0, // 0 = smooth linear sweep; n > 0 = n discrete steps
  },

  validate(o, v) {
    v.oneOf("direction", DIRECTIONS);
    v.check(Number.isInteger(o.steps) && o.steps >= 0, "steps", `must be an integer >= 0, got ${o.steps}`);
  },

  render(ctx) {
    const { o, cfg, layout, figs, CUT, pct, num2, wrap, textRows, knockRows, delays } = ctx;
    if (!figs.length) return EMPTY;
    const { TPX, SLOT_T, TDUR } = layout;
    const S = cfg.reveal.seconds;
    const { MX, MY } = margins(layout, CUT);
    const { top, bottom, height: h } = rowsBox(layout, MY);
    const vertical = o.direction === "down" || o.direction === "up";
    const ZERO = vertical ? "scale(1,0)" : "scale(0,1)";

    // The rect sits in a group translated to the scale origin (CSS transforms
    // on SVG scale about the local origin), drawn on the side it grows into.
    const rect = (p, ox, oy, x, y, w, rh) =>
      `<g transform="translate(${num2(ox)},${num2(oy)})"><rect class="wp wpd${p}" x="${num2(x)}" y="${num2(y)}" width="${num2(w)}" height="${num2(rh)}"/></g>`;
    let defs = "";
    const overlay = [];
    const cuts = [];
    figs.forEach((rows, p) => {
      const x0 = -MX;
      const x1 = rows[0].length * TPX + MX;
      const w = x1 - x0;
      // edges: the halves overlap by a column so they meet without a seam
      const half = w / 2 + TPX;
      const body = {
        right: rect(p, x0, 0, 0, top, w, h),
        left: rect(p, x1, 0, -w, top, w, h),
        down: rect(p, 0, top, x0, 0, w, h),
        up: rect(p, 0, bottom, x0, -h, w, h),
        center: rect(p, (x0 + x1) / 2, 0, -w / 2, top, w, h),
        edges: rect(p, x0, 0, 0, top, half, h) + rect(p, x1, 0, -half, top, half, h),
      }[o.direction];
      defs += `<mask id="wp${p}" maskUnits="userSpaceOnUse"><g fill="#fff">${body}</g></mask>`;
      // Masked live layer during the sweep, plain settled copy from `seconds` (swapCss).
      const layers = (rowsOf) => `<g class="wpl wpd${p}" mask="url(#wp${p})">${rowsOf(p)}</g><g class="wps wpd${p}">${rowsOf(p)}</g>`;
      overlay.push(wrap(p, layers(textRows)));
      if (CUT > 0) cuts.push(wrap(p, layers(knockRows)));
    });

    const sweep = o.steps ? `steps(${o.steps})` : "linear";
    const css =
      `\n.wp{transform:${ZERO}}${animate("wp", "wp", TDUR)}` +
      keyframes("wp", [
        ["0", `transform:${ZERO};animation-timing-function:${sweep}`],
        [pct(S), "transform:none"],
        [pct(SLOT_T), `transform:${ZERO}`],
        ["100", `transform:${ZERO}`],
      ]) + swapCss(ctx, "wp");
    return {
      defs,
      css: `${css}\n${delays("wpd")}`,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: { stop: ["[class^=wp]"], settle: ".wps.wpd0{transform:none}" },
      extraGlyphs: "",
    };
  },
};
