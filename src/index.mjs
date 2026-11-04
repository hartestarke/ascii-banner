// buildBanner(config) → { svg, stats, warnings }: one self-contained SVG
// animated by CSS alone, since README images run no JS: the field, the
// taglines in the header block and every card of the config, each coming out
// of the field. Reads the font files and the cards' snapshot; writes nothing.
// The snapshot comes from fetchCards (network), re-exported here.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { layoutBlocks } from "./blocks.mjs";
import { readCards } from "./card/index.mjs";
import { ImageError } from "./card/image.mjs";
import { renderCard } from "./card/render.mjs";
import { ConfigError, BUNDLED_GLYPHS, FIELD_REVEALS, NO_FIELD, assetPaths, parseRamp, resolveConfig } from "./config.mjs";
import { renderEmerge } from "./emerge.mjs";
import { bakeField, cellBrightness, fieldGrid } from "./field.mjs";
import { figletLaid, loadFlf } from "./figlet.mjs";
import { layoutTaglines } from "./layout.mjs";
import { num2, renderReveal, renderSvg } from "./svg.mjs";

export { ConfigError, DEFAULTS, NO_FIELD, PRESET_GAMMA, resolveConfig } from "./config.mjs";
export { cardKey, fetchCards, readCards } from "./card/index.mjs";

// Below this the block letters stop reading as letters at README scale.
const MIN_TAGLINE_PX = 6;

// Largest brightness step across the loop wrap (t = loopSeconds vs 0) that
// reads as continuous motion; beyond it the loop visibly jumps.
const SEAM_TOLERANCE = 0.02;

// Highest one-byte code point in UTF-8; ramp glyphs above it cost 2-4 bytes per cell.
const ASCII_MAX = 0x7f;

// budget.maxBytes null: `bytes` per `height` px of canvas height, so the
// default 240 px banner keeps its 1 MiB and a taller one with cards scales.
const AUTO_BUDGET = { bytes: 1048576, height: 240 };

const show = (chars) => [...chars].map((c) => JSON.stringify(c)).join(" ");

/** renderCard for cfg.cards[i], prefix `c${i}`; an avatar it cannot draw is the card's config error. */
function drawCard(cfg, i, snap, opts) {
  try {
    return renderCard(cfg, cfg.cards[i], snap, { prefix: `c${i}`, ...opts });
  } catch (e) {
    if (e instanceof ImageError) throw new ConfigError(`cards[${i}].portrait: the avatar cannot be drawn: ${e.message}`);
    throw e;
  }
}

/**
 * One baked field row with the cells `holes` cover blanked: a hole is a
 * "window" card's cell span { c0, c1, r0, r1 } and its `visible(col, row, f)`.
 * A row untouched comes back as is. Where every cell under a hole's columns is
 * blank and cells are drawn on both sides, the row goes out as pieces either
 * side of them, each from its first drawn column. No row is split anywhere
 * else: every extra <text> costs bytes and DOM. Trailing blanks are trimmed
 * and a row left blank is dropped.
 */
function trimRow(r, f, holes) {
  const start = r.start ?? 0;
  const chars = [...r.chars], bands = [...r.bands];
  let dropped = false;
  for (const h of holes)
    for (let c = Math.max(h.c0, start); c < Math.min(h.c1, start + chars.length); c++)
      if (bands[c - start] >= 0 && !h.visible(c, r.row, f)) {
        chars[c - start] = " ";
        bands[c - start] = -1;
        dropped = true;
      }
  const drawn = (a, b) => bands.slice(a, b).some((v) => v >= 0);
  const pieces = [[0, chars.length]]; // [from, to) indices into chars
  for (const h of [...holes].sort((p, q) => p.c0 - q.c0)) {
    const [from, to] = pieces[pieces.length - 1];
    const a = h.c0 - start, b = h.c1 - start;
    if (a > from && b < to && !drawn(a, b) && drawn(from, a) && drawn(b, to)) pieces.splice(-1, 1, [from, a], [b, to]);
  }
  if (!dropped && pieces.length === 1) return [r];
  const lastDrawn = (from, to) => {
    while (to > from && bands[to - 1] < 0) to--;
    return to;
  };
  if (pieces.length === 1) {
    const end = lastDrawn(0, chars.length);
    return end ? [{ ...r, chars: chars.slice(0, end), bands: bands.slice(0, end) }] : [];
  }
  return pieces.map(([from, to]) => {
    while (bands[from] < 0) from++; // each piece holds a drawn cell
    const end = lastDrawn(from, to);
    return { row: r.row, start: start + from, chars: chars.slice(from, end), bands: bands.slice(from, end) };
  });
}

/** Resolve, check and render a config; relative paths resolve against `baseDir` (default cwd), the cards' snapshot is `dataPath` (absolute) or the config's `data`. */
export async function buildBanner(userConfig = {}, { baseDir, dataPath } = {}) {
  const t0 = performance.now();
  const base = resolveConfig(userConfig, { baseDir });
  const paths = assetPaths(base);
  const warnings = [];
  // The font's characters: renderCard turns GitHub text outside them into "?"
  // and fails on the user's own; a custom font is not checked.
  const have = paths.fontBundled ? new Set(readFileSync(BUNDLED_GLYPHS, "utf8").replace(/[\r\n]/g, "")) : null;

  // Blocks: each card is measured at its box width; that render's knock (its
  // silhouette, which does not depend on timing) cuts a "cut" backdrop below.
  const snaps = readCards(base, dataPath);
  const measured = [];
  const blocks = layoutBlocks(base, (i, width) => (measured[i] = drawCard(base, i, snaps[i], { width, glyphs: have })).height);
  const { W, H, header } = blocks;
  const cfg = { ...base, size: { width: W, height: H } };

  const g = fieldGrid(cfg);
  const field = bakeField(cfg, g);
  const pool = parseRamp(cfg.reveal.pool).flat();
  if (field.seam > SEAM_TOLERANCE)
    warnings.push(
      `${cfg.field.sample ? "field.sample" : `field preset "${cfg.field.preset}"`} is not periodic over the loop: ` +
      `brightness jumps by up to ${field.seam.toFixed(3)} where the loop wraps (t = ${cfg.field.loopSeconds}s vs 0)`,
    );

  const flf = loadFlf(paths.flf, cfg.tagline.font, { layout: cfg.tagline.layout });
  const missing = new Set();
  const laid = cfg.taglines.map((t, i) => figletLaid(flf, t, missing, `taglines[${i}]`));
  const figs = laid.map((l) => l.rows);
  const spans = laid.map((l) => l.spans);
  if (missing.size) warnings.push(`tagline font has no glyph for ${show(missing)}; drawn as its "?" glyph`);

  // The taglines live in the header block, always at the top left.
  const headerCfg = { ...cfg, size: { width: header.w, height: header.h } };
  const layout = layoutTaglines(headerCfg, figs);
  const reveal = renderReveal(headerCfg, layout, figs, pool, spans);

  // Every character the SVG draws must exist in the embedded font, or the
  // browser falls back to a system monospace with a different advance and the
  // grid drifts out of register. A reveal's extraGlyphs include the pool noise
  // it actually draws; a null reveal.pool resolved to field.ramp, so that is
  // the key such glyphs are blamed on unless the user gave a pool of their own.
  // Under block cells the field draws field.cells' glyphs, not the ramp's, but
  // a card coming out of the field still draws its crest in the ramp's (each
  // level's last glyph, src/emerge.mjs). Cards check their own text.
  const inPool = new Set(pool);
  const extra = [...reveal.extraGlyphs];
  const cellsMode = cfg.field.cells !== "ramp";
  const crest = cellsMode && cfg.cards.some((k) => FIELD_REVEALS.includes(k.reveal) && k.intro !== "none")
    ? parseRamp(cfg.field.ramp).slice(1).map((lvl) => lvl[lvl.length - 1])
    : [];
  const drawnBy = {
    "field.ramp": cellsMode ? crest : field.ramp.flat(),
    "field.cells": cellsMode ? field.ramp.flat() : [],
    "reveal.pool": [],
    "the tagline font": figs.flat().flatMap((r) => [...r]).filter((c) => c !== " "),
    "reveal.options": extra.filter((c) => !inPool.has(c)),
  };
  drawnBy[cfg.reveal.pool === cfg.field.ramp ? "field.ramp" : "reveal.pool"].push(...extra.filter((c) => inPool.has(c)));
  const drawn = new Set(Object.values(drawnBy).flat());
  if (have) {
    const lack = [...drawn].filter((c) => !have.has(c));
    const from = Object.keys(drawnBy).filter((k) => drawnBy[k].some((c) => !have.has(c)));
    if (lack.length)
      throw new ConfigError(
        `the bundled font has no glyph for ${show(lack)} (from ${from.join(", ")}). ` +
        `Remove them, or subset your own font with those glyphs and pass it as font.file (see README "Custom font").`,
      );
  } else {
    warnings.push(`custom font.file: glyph coverage not checked — it must contain ${show(drawn)}` +
      (cfg.cards.length ? " and every character of the cards" : ""));
  }

  // Cards: each comes out of the field (renderEmerge) as its own layer (renderCard).
  const layers = { defs: [], css: [], reducedMotion: [], fieldMask: [], overlay: [] };
  const holes = []; // "window" backdrops: field cells hidden under the card
  const brightness = cfg.cards.length ? cellBrightness(cfg, g) : null;
  cfg.cards.forEach((card, i) => {
    const box = blocks.cards[i];
    const content = { x: box.x, y: box.y + Math.round((box.h - box.contentH) / 2) };
    const prefix = `c${i}`;
    const em = renderEmerge({ cfg, card, box, content, grid: g, brightness, prefix, knock: measured[i].knock });
    const startAt = FIELD_REVEALS.includes(card.reveal) ? (x, y) => em.arrival(content.x + x, content.y + y) : null;
    const layer = drawCard(cfg, i, snaps[i], { width: box.w, t0: card.delay, glyphs: have, startAt });
    if (layer.height !== box.contentH) throw new Error(`cards[${i}]: rendered ${layer.height} px tall, measured ${box.contentH}`);
    // A field reveal's screen shows as the field goes, under its mask; a still card's is simply drawn.
    if (layer.screen && !em.screenMask && card.intro !== "none")
      throw new Error(`cards[${i}]: a screen layer without a screen mask`);
    warnings.push(...layer.warnings);

    const at = (markup, mask) => {
      const moved = `<g transform="translate(${num2(content.x)} ${num2(content.y)})">${markup}</g>`;
      return mask ? `<g mask="url(#${mask})">${moved}</g>` : moved;
    };
    layers.defs.push(layer.defs, em.defs);
    layers.css.push(layer.css, em.css);
    layers.reducedMotion.push(layer.reducedMotion, em.reducedMotion);
    layers.fieldMask.push(em.fieldMask);
    layers.overlay.push(layer.screen && at(layer.screen, em.screenMask), at(layer.body, em.bodyMask), em.overlay);
    if (card.backdrop === "window") {
      const { PX, PY, y0 } = g;
      holes.push({
        c0: Math.round(box.x / PX), c1: Math.round((box.x + box.w) / PX),
        r0: Math.round((box.y - y0) / PY), r1: Math.round((box.y + box.h - y0) / PY),
        visible: em.visible,
      });
    }
  });
  if (holes.length)
    field.frames = field.frames.map((rows, f) => rows.flatMap((r) => {
      const over = holes.filter((h) => r.row >= h.r0 && r.row < h.r1);
      return over.length ? trimRow(r, f, over) : [r];
    }));
  const lines = (list) => list.filter(Boolean).map((s) => `\n${s}`).join("");
  const hasField = cfg.field.preset !== NO_FIELD; // no field, nothing to mask
  const cards = {
    defs: lines(layers.defs), css: lines(layers.css), reducedMotion: layers.reducedMotion.join(""),
    fieldMask: hasField ? layers.fieldMask.join("") : "", overlay: lines(layers.overlay),
  };

  let fontBytes;
  try {
    fontBytes = readFileSync(paths.font);
  } catch (e) {
    throw new ConfigError(`font.file: cannot read ${paths.font} (${e.code ?? e.message})`);
  }

  if (layout.TFONT > 0 && layout.TFONT < MIN_TAGLINE_PX)
    warnings.push(`tagline font is ${layout.TFONT} px; raise size.width, tagline.fill or shorten taglines`);
  const svg = renderSvg(cfg, g, field, layout, reveal, fontBytes.toString("base64"), cards);

  const raw = Buffer.byteLength(svg);
  const auto = cfg.budget.maxBytes === null;
  const max = auto ? Math.round((AUTO_BUDGET.bytes * H) / AUTO_BUDGET.height) : cfg.budget.maxBytes;
  if (max > 0 && raw > max) {
    const wide = [...new Set(field.ramp.flat())].filter((c) => c.codePointAt(0) > ASCII_MAX);
    throw new ConfigError(
      `banner is ${raw} bytes, over budget.maxBytes (${max}` +
      (auto ? `, automatic: ${AUTO_BUDGET.bytes} bytes per ${AUTO_BUDGET.height} px of canvas height, which is ${H} px` : "") +
      `). Raw size ∝ frames × rows × columns: ` +
      `lower field.fps or field.loopSeconds, shrink size, or raise field.fontSize (fewer cells). ` +
      `Set budget.maxBytes to a number of bytes to fix the limit, or to 0 to disable the check.` +
      (wide.length
        ? ` ${cellsMode ? `field.cells "${cfg.field.cells}" draws` : "field.ramp has"} glyphs outside ASCII (${show(wide)}), which cost up to ` +
          `${Math.max(...wide.map((c) => Buffer.byteLength(c)))} bytes each against 1: field.bands: 1 or field.fps: 0 brings the size down.`
        : "") +
      (warnings.length ? `\nWarnings before this error:\n${warnings.map((w) => `  ${w}`).join("\n")}` : ""),
    );
  }

  const stats = {
    rawBytes: raw,
    gzipBytes: gzipSync(Buffer.from(svg)).length,
    size: `${W}x${H}`,
    cards: cfg.cards.length,
    frames: g.NF,
    cells: `${g.COLS}x${g.ROWS}`,
    textNodes: (svg.match(/<text\b/g) ?? []).length,
    keyframes: (svg.match(/@keyframes\b/g) ?? []).length,
    taglineCols: layout.maxCols,
    taglineFontPx: layout.TFONT,
    buildMs: Math.round(performance.now() - t0),
  };
  return { svg, stats, warnings };
}
