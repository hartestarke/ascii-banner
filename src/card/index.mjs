// The info card: fetchCard(config) takes the GitHub snapshot (network),
// buildCard(config) renders card.svg from it (offline, deterministic).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { assetPaths, BUNDLED_GLYPHS, ConfigError, resolveConfig } from "../config.mjs";
import { fetchSnapshot, SNAPSHOT_VERSION } from "./fetch.mjs";
import { ImageError } from "./image.mjs";
import { renderCard } from "./render.mjs";

/** Resolve the config and fetch its card's snapshot; returns { snapshot, path }, path = card.data. */
export async function fetchCard(userConfig = {}, { baseDir, token } = {}) {
  const cfg = resolveConfig(userConfig, { baseDir });
  return { snapshot: await fetchSnapshot(cfg.card, token), path: cfg.card.data };
}

function readSnapshot(path, card) {
  let snap;
  try {
    snap = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`card.data: cannot read ${path} (${e.code ?? e.message}); run \`ascii-banner fetch\` first`);
  }
  if (snap?.version !== SNAPSHOT_VERSION)
    throw new ConfigError(`card.data: ${path} is snapshot version ${snap?.version}, this build reads ${SNAPSHOT_VERSION}; fetch again`);
  if (snap.mode !== card.mode || !snap[card.mode])
    throw new ConfigError(`card.data: ${path} holds a "${snap.mode}" snapshot but card.mode is "${card.mode}"; fetch again`);
  return snap;
}

/** Resolve the config, read its snapshot (card.data, or `dataPath`) and render the card → { svg, stats, warnings }. */
export async function buildCard(userConfig = {}, { baseDir, dataPath } = {}) {
  const t0 = performance.now();
  const cfg = resolveConfig(userConfig, { baseDir });
  const snap = readSnapshot(dataPath ?? cfg.card.data, cfg.card);
  const paths = assetPaths(cfg);
  const warnings = [];
  let glyphs = null;
  if (paths.fontBundled) glyphs = new Set(readFileSync(BUNDLED_GLYPHS, "utf8").replace(/[\r\n]/g, ""));
  else warnings.push("custom font.file: glyph coverage not checked");
  let font;
  try {
    font = readFileSync(paths.font);
  } catch (e) {
    throw new ConfigError(`font.file: cannot read ${paths.font} (${e.code ?? e.message})`);
  }
  let out;
  try {
    out = renderCard(cfg, snap, font.toString("base64"), glyphs);
  } catch (e) {
    if (e instanceof ImageError) throw new ConfigError(`card.portrait: the avatar cannot be drawn: ${e.message}`);
    throw e;
  }
  warnings.push(...out.warnings);
  const raw = Buffer.byteLength(out.svg);
  const stats = { ...out.stats, rawBytes: raw, gzipBytes: gzipSync(Buffer.from(out.svg)).length, fetchedAt: snap.fetchedAt, buildMs: Math.round(performance.now() - t0) };
  return { svg: out.svg, stats, warnings };
}
