// Rebuilds every docs/examples/*.svg from the config next to it: `npm run examples`.
// The card examples draw their cards offline from the snapshot their `data` names,
// cards.json. A fetch writes only its config's cards, so refresh it from the example
// that holds every card: `node bin/ascii-banner.mjs fetch --config docs/examples/cards-pair.config.mjs`.
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBanner } from "../src/index.mjs";

const DIR = join(fileURLToPath(new URL("..", import.meta.url)), "docs", "examples");
const SUFFIX = ".config.mjs";

for (const file of readdirSync(DIR).filter((f) => f.endsWith(SUFFIX)).sort()) {
  const { default: config } = await import(pathToFileURL(join(DIR, file)));
  const { svg, warnings } = await buildBanner(config, { baseDir: DIR });
  for (const w of warnings) console.warn(`${file}: warning: ${w}`);
  const out = file.slice(0, -SUFFIX.length) + ".svg";
  writeFileSync(join(DIR, out), svg);
  console.log(`${out}: ${Buffer.byteLength(svg)} bytes`);
}
