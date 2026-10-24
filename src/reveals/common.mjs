// Small helpers shared by the reveal presets. Scramble keeps its original
// code so the default banner stays byte-identical.

/** What a preset returns when there is no tagline to reveal. */
export const EMPTY = Object.freeze({
  defs: "", css: "", overlay: "", knockout: "", reducedMotionCss: { stop: [], settle: "" }, extraGlyphs: "",
});

/**
 * `@keyframes name{…}` from [percent, declarations] stops in time order.
 * Stops that land on the same percent merge in CSS, the later one winning.
 */
export const keyframes = (name, stops) => `@keyframes ${name}{${stops.map(([at, decl]) => `${at}%{${decl}}`).join("")}}`;

/** `.cls{animation:name T step-end infinite}` — every preset timeline holds between stops. */
export const animate = (cls, name, TDUR) => `.${cls}{animation:${name} ${TDUR}s step-end infinite}`;

/**
 * Live/settled swap for reveals drawn through a <mask> (wipe, dissolve): a
 * masked group composites through an offscreen surface and lands ±1 per
 * channel off directly drawn text, so at `seconds` the masked live layer
 * (class `${px}l`) leaves the canvas and a plain copy of the rows (`${px}s`)
 * takes over — at rest every preset draws the same pixels. Off the canvas =
 * hidden: transforms only, no visibility toggles. Emit before the delays.
 */
export function swapCss(ctx, px) {
  const { pct, H, cfg, layout } = ctx;
  const HIDE = `transform:translateY(${-H}px)`;
  const S = cfg.reveal.seconds;
  return `.${px}l,.${px}s{${HIDE}}` +
    animate(`${px}l`, `${px}l`, layout.TDUR) + keyframes(`${px}l`, [["0", "transform:none"], [pct(S), HIDE], ["100", HIDE]]) +
    animate(`${px}s`, `${px}s`, layout.TDUR) +
    keyframes(`${px}s`, [["0", HIDE], [pct(S), "transform:none"], [pct(layout.SLOT_T), HIDE], ["100", HIDE]]);
}

/**
 * Margin around a tagline's letters, px: one cell of glyph overflow plus the
 * knockout stroke, so a window that "covers the text" also covers its hole.
 */
export const margins = (layout, CUT) => ({ MX: layout.TPX + CUT, MY: layout.TPY / 2 + CUT });

/** Vertical extent of the tagline rows, margins included. */
export const rowsBox = (layout, MY) => {
  const top = layout.rowY(0) - layout.TPY / 2 - MY;
  const bottom = layout.rowY(layout.TROWS - 1) + layout.TPY / 2 + MY;
  return { top, bottom, height: bottom - top };
};
