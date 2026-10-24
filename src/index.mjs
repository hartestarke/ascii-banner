// buildBanner(config) → { svg, stats, warnings }. Reads the font files the
// config names; writes nothing.
//
// Pipeline: field.mjs bakes the wave field into per-frame glyph rows,
// figlet.mjs sets the taglines, decode.mjs plans their torn-front decode,
// svg.mjs assembles one self-contained SVG with CSS-only animation (README
// images allow no JS).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { ConfigError, BUNDLED_GLYPHS, assetPaths, resolveConfig } from "./config.mjs";
import { bakeField, fieldGrid } from "./field.mjs";
import { figlet, loadFlf } from "./figlet.mjs";
import { planDecode } from "./decode.mjs";
import { renderSvg } from "./svg.mjs";

export { ConfigError, DEFAULTS, resolveConfig } from "./config.mjs";

// Below this the block letters stop reading as letters at README scale.
const MIN_TAGLINE_PX = 6;

const show = (chars) => [...chars].map((c) => JSON.stringify(c)).join(" ");

// Largest brightness step between the last frame's successor and frame 0 that
// still reads as continuous motion; beyond it the loop visibly jumps.
const SEAM_TOLERANCE = 0.02;

/**
 * @param userConfig  config object (merged over DEFAULTS)
 * @param opts.baseDir directory relative font paths resolve against (default cwd)
 */
export async function buildBanner(userConfig = {}, { baseDir } = {}) {
  const t0 = performance.now();
  const cfg = resolveConfig(userConfig, { baseDir });
  const paths = assetPaths(cfg);
  const warnings = [];

  const g = fieldGrid(cfg);
  const field = bakeField(cfg, g);
  const pool = field.ramp.flat();
  if (field.seam > SEAM_TOLERANCE)
    warnings.push(
      `${cfg.field.sample ? "field.sample" : `field preset "${cfg.field.preset}"`} is not periodic over the loop: ` +
      `brightness jumps by up to ${field.seam.toFixed(3)} where the loop wraps (t = ${cfg.field.loopSeconds}s vs 0)`,
    );

  const flf = loadFlf(paths.flf, cfg.tagline.font, { layout: cfg.tagline.layout });
  const missing = new Set();
  const figs = cfg.taglines.map((t, i) => figlet(flf, t, missing, `taglines[${i}]`));
  if (missing.size) warnings.push(`tagline font has no glyph for ${show(missing)}; drawn as its "?" glyph`);

  // Every character the SVG draws must exist in the embedded font, or the
  // browser falls back to a system monospace with a different advance and the
  // grid drifts out of register.
  const drawn = new Set(pool);
  for (const rows of figs) for (const r of rows) for (const c of r) if (c !== " ") drawn.add(c);
  if (paths.fontBundled) {
    const have = new Set(readFileSync(BUNDLED_GLYPHS, "utf8").replace(/[\r\n]/g, ""));
    const lack = [...drawn].filter((c) => !have.has(c));
    if (lack.length)
      throw new ConfigError(
        `the bundled font has no glyph for ${show(lack)} (from field.ramp or the tagline font). ` +
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

  const plan = planDecode(cfg, figs, pool);
  if (plan.TFONT > 0 && plan.TFONT < MIN_TAGLINE_PX)
    warnings.push(`tagline font is ${plan.TFONT} px; raise size.width, tagline.fill or shorten taglines`);
  const svg = renderSvg(cfg, g, field, figs, plan, fontBytes.toString("base64"));

  const raw = Buffer.byteLength(svg);
  const max = cfg.budget.maxBytes;
  if (max > 0 && raw > max)
    throw new ConfigError(
      `banner is ${raw} bytes, over budget.maxBytes (${max}). Raw size ∝ frames × rows × columns: ` +
      `lower field.fps or field.loopSeconds, shrink size, or raise field.fontSize (fewer cells). ` +
      `Set budget.maxBytes: 0 to disable the check.`,
    );

  const stats = {
    rawBytes: raw,
    gzipBytes: gzipSync(Buffer.from(svg)).length,
    frames: g.NF,
    cells: `${g.COLS}x${g.ROWS}`,
    textNodes: (svg.match(/<text\b/g) ?? []).length,
    keyframes: (svg.match(/@keyframes\b/g) ?? []).length,
    taglineCols: plan.maxCols,
    taglineFontPx: plan.TFONT,
    buildMs: Math.round(performance.now() - t0),
  };
  return { svg, stats, warnings };
}
