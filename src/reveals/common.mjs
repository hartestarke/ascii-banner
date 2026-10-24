// Helpers shared by the reveal presets.

/** What a preset returns when there is no tagline to reveal. */
export const EMPTY = Object.freeze({
  defs: "", css: "", overlay: "", knockout: "", reducedMotionCss: { stop: [], settle: "" }, extraGlyphs: "",
});

/**
 * `@keyframes name{…}` from [percent, declarations] stops in time order.
 * Stops that land on the same percent merge in CSS, the later one winning.
 */
export const keyframes = (name, stops) => `@keyframes ${name}{${stops.map(([at, decl]) => `${at}%{${decl}}`).join("")}}`;

/**
 * `.name{animation:name …}`, step-end so every stop holds until the next. There
 * is no fill mode: before its slot's delay runs out, and under reduced motion,
 * an element shows its base rule, which therefore has to be the hidden state.
 */
export const animate = (name, TDUR) => `.${name}{animation:${name} ${+TDUR.toFixed(2)}s step-end infinite}`;

/**
 * Keyframes for a declaration sampled at the reveal ticks, at(k) for k = 0..NT:
 * a stop only where it changes, since step-end holds each one, then `tail` from
 * the slot's end. Without a tail the last tick's declaration holds.
 */
export function slideKeyframes(ctx, name, at, tail) {
  const { pct, layout: { NT, tickT, SLOT_T } } = ctx;
  const stops = [["0", at(0)]];
  for (let k = 1; k <= NT; k++) {
    const decl = at(k);
    if (decl !== stops.at(-1)[1]) stops.push([pct(tickT(k)), decl]);
  }
  if (tail) stops.push([pct(SLOT_T), tail], ["100", tail]);
  return keyframes(name, stops);
}

/** Hidden = moved off the canvas. Never visibility: a nested group can show through a hidden parent. */
export const offCanvas = (H) => `transform:translateY(${-H}px)`;

/**
 * Live/settled swap for reveals drawn through a <mask> (wipe, dissolve). A
 * masked group composites through an offscreen surface and lands ±1 per channel
 * off directly drawn text, so at `seconds` the masked layer (`${px}l`) leaves the
 * canvas and a plain copy (`${px}s`) takes over: at rest every preset draws the
 * same pixels. Emit before the delays.
 */
export function swapCss(ctx, px) {
  const { H, cfg, layout, pct } = ctx;
  const HIDE = offCanvas(H);
  const S = cfg.reveal.seconds;
  return `.${px}l,.${px}s{${HIDE}}` +
    animate(`${px}l`, layout.TDUR) + keyframes(`${px}l`, [["0", "transform:none"], [pct(S), HIDE], ["100", HIDE]]) +
    animate(`${px}s`, layout.TDUR) +
    keyframes(`${px}s`, [["0", HIDE], [pct(S), "transform:none"], [pct(layout.SLOT_T), HIDE], ["100", HIDE]]);
}

/**
 * Margin around a tagline's letters, px: one cell of glyph overflow plus the
 * knockout stroke, so a window that covers the text also covers its hole.
 */
export const margins = (layout, CUT) => ({ MX: layout.TPX + CUT, MY: layout.TPY / 2 + CUT });

/** Vertical extent of the tagline rows, margins included. */
export const rowsBox = (layout, MY) => {
  const top = layout.rowY(0) - layout.TPY / 2 - MY;
  const bottom = layout.rowY(layout.TROWS - 1) + layout.TPY / 2 + MY;
  return { top, bottom, height: bottom - top };
};

/** Permutation of 0..n-1 (Fisher-Yates); rand(i) in [0, 1) draws the swap for position i. */
export const shuffle = (n, rand) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand(i) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** The row with every inked cell swapped for a pool glyph; rand(c) in [0, 1) picks column c's. */
export const noiseRow = (row, pool, rand) => {
  let s = "";
  for (let c = 0; c < row.length; c++) s += row[c] === " " ? " " : pool[Math.floor(rand(c) * pool.length)];
  return s;
};
