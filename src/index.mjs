// buildBanner(config) → { svg, stats, warnings }: one self-contained SVG
// animated by CSS alone, since README images run no JS. Reads the font files
// the config names; writes nothing.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { ConfigError, BUNDLED_GLYPHS, assetPaths, parseRamp, resolveConfig } from "./config.mjs";
import { bakeField, fieldGrid } from "./field.mjs";
import { figletLaid, loadFlf } from "./figlet.mjs";
import { layoutTaglines } from "./layout.mjs";
import { renderReveal, renderSvg } from "./svg.mjs";

export { ConfigError, DEFAULTS, NO_FIELD, resolveConfig } from "./config.mjs";

// Below this the block letters stop reading as letters at README scale.
const MIN_TAGLINE_PX = 6;

// Largest brightness step across the loop wrap (t = loopSeconds vs 0) that
// reads as continuous motion; beyond it the loop visibly jumps.
const SEAM_TOLERANCE = 0.02;

// Highest one-byte code point in UTF-8; ramp glyphs above it cost 2-4 bytes per cell.
const ASCII_MAX = 0x7f;

const show = (chars) => [...chars].map((c) => JSON.stringify(c)).join(" ");

/** Resolve, check and render a config; relative font paths resolve against `baseDir` (default cwd). */
export async function buildBanner(userConfig = {}, { baseDir } = {}) {
  const t0 = performance.now();
  const cfg = resolveConfig(userConfig, { baseDir });
  const paths = assetPaths(cfg);
  const warnings = [];

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

  const layout = layoutTaglines(cfg, figs);
  const reveal = renderReveal(cfg, layout, figs, pool, spans);

  // Every character the SVG draws must exist in the embedded font, or the
  // browser falls back to a system monospace with a different advance and the
  // grid drifts out of register. A reveal's extraGlyphs include the pool noise
  // it actually draws; a null reveal.pool resolved to field.ramp, so that is
  // the key such glyphs are blamed on unless the user gave a pool of their own.
  const inPool = new Set(pool);
  const extra = [...reveal.extraGlyphs];
  const drawnBy = {
    "field.ramp": field.ramp.flat(),
    "reveal.pool": [],
    "the tagline font": figs.flat().flatMap((r) => [...r]).filter((c) => c !== " "),
    "reveal.options": extra.filter((c) => !inPool.has(c)),
  };
  drawnBy[cfg.reveal.pool === cfg.field.ramp ? "field.ramp" : "reveal.pool"].push(...extra.filter((c) => inPool.has(c)));
  const drawn = new Set(Object.values(drawnBy).flat());
  if (paths.fontBundled) {
    const have = new Set(readFileSync(BUNDLED_GLYPHS, "utf8").replace(/[\r\n]/g, ""));
    const lack = [...drawn].filter((c) => !have.has(c));
    const from = Object.keys(drawnBy).filter((k) => drawnBy[k].some((c) => !have.has(c)));
    if (lack.length)
      throw new ConfigError(
        `the bundled font has no glyph for ${show(lack)} (from ${from.join(", ")}). ` +
        `Remove them, or subset your own font with those glyphs and pass it as font.file (see README "Custom font").`,
      );
  } else {
    warnings.push(`custom font.file: glyph coverage not checked — it must contain ${show(drawn)}`);
  }

  let fontBytes;
  try {
    fontBytes = readFileSync(paths.font);
  } catch (e) {
    throw new ConfigError(`font.file: cannot read ${paths.font} (${e.code ?? e.message})`);
  }

  if (layout.TFONT > 0 && layout.TFONT < MIN_TAGLINE_PX)
    warnings.push(`tagline font is ${layout.TFONT} px; raise size.width, tagline.fill or shorten taglines`);
  const svg = renderSvg(cfg, g, field, layout, reveal, fontBytes.toString("base64"));

  const raw = Buffer.byteLength(svg);
  const max = cfg.budget.maxBytes;
  if (max > 0 && raw > max) {
    const wide = [...new Set(field.ramp.flat())].filter((c) => c.codePointAt(0) > ASCII_MAX);
    throw new ConfigError(
      `banner is ${raw} bytes, over budget.maxBytes (${max}). Raw size ∝ frames × rows × columns: ` +
      `lower field.fps or field.loopSeconds, shrink size, or raise field.fontSize (fewer cells). ` +
      `Set budget.maxBytes: 0 to disable the check.` +
      (wide.length
        ? ` field.ramp has glyphs outside ASCII (${show(wide)}), which cost up to ` +
          `${Math.max(...wide.map((c) => Buffer.byteLength(c)))} bytes each against 1: field.bands: 1 or field.fps: 0 brings the size down.`
        : "") +
      (warnings.length ? `\nWarnings before this error:\n${warnings.map((w) => `  ${w}`).join("\n")}` : ""),
    );
  }

  const stats = {
    rawBytes: raw,
    gzipBytes: gzipSync(Buffer.from(svg)).length,
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
