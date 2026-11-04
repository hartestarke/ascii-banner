// The cards' data: fetchCards(cfg, token) takes the GitHub snapshot of every
// card (network); readCards(cfg) reads each card's entry back for the offline,
// deterministic build. Rendering is ./render.mjs.
import { readFileSync } from "node:fs";
import { ConfigError } from "../config.mjs";
import { cardKey, SNAPSHOT_VERSION } from "./fetch.mjs";

export { cardKey, fetchCards, SNAPSHOT_VERSION } from "./fetch.mjs";

/**
 * Each card's snapshot entry, in cfg.cards order: { mode, fetchedAt, person | project, avatar }.
 * Reads `dataPath` (absolute), else cfg.data; a config with no cards reads nothing.
 */
export function readCards(cfg, dataPath) {
  if (!cfg.cards.length) return [];
  const path = dataPath ?? cfg.data;
  let snap;
  try {
    snap = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`data: cannot read ${path} (${e.code ?? e.message}); run \`ascii-banner fetch\` first`);
  }
  if (snap?.version !== SNAPSHOT_VERSION)
    throw new ConfigError(`data: ${path} is snapshot version ${snap?.version}, this build reads ${SNAPSHOT_VERSION}; fetch again`);
  return cfg.cards.map((card) => {
    const key = cardKey(card);
    const entry = snap.cards?.[key];
    if (!entry?.[card.mode]) throw new ConfigError(`${path} has no data for ${key}; run \`ascii-banner fetch\``);
    const { mode, ...data } = entry;
    return { mode, fetchedAt: snap.fetchedAt, ...data };
  });
}
