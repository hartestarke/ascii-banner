// Rebuilds every docs/examples/*.svg from the config next to it: `npm run examples`.
// A card-*.config.mjs is an info card, built offline from the snapshot it names;
// refresh that with `node bin/ascii-banner.mjs fetch --config docs/examples/card-<name>.config.mjs`.
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBanner, buildCard } from "../src/index.mjs";

const DIR = join(fileURLToPath(new URL("..", import.meta.url)), "docs", "examples");
const SUFFIX = ".config.mjs";
const CARD_PREFIX = "card-";

for (const file of readdirSync(DIR).filter((f) => f.endsWith(SUFFIX)).sort()) {
  const { default: config } = await import(pathToFileURL(join(DIR, file)));
  const build = file.startsWith(CARD_PREFIX) ? buildCard : buildBanner;
  const { svg, warnings } = await build(config, { baseDir: DIR });
  for (const w of warnings) console.warn(`${file}: warning: ${w}`);
  const out = file.slice(0, -SUFFIX.length) + ".svg";
  writeFileSync(join(DIR, out), svg);
  console.log(`${out}: ${Buffer.byteLength(svg)} bytes`);
}
