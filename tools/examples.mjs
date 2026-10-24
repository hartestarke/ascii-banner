// Rebuilds every docs/examples/*.svg from the config next to it: `npm run examples`.
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBanner } from "../src/index.mjs";

const DIR = join(fileURLToPath(new URL("..", import.meta.url)), "docs", "examples");
const SUFFIX = ".config.mjs";

for (const file of readdirSync(DIR).filter((f) => f.endsWith(SUFFIX)).sort()) {
  const { default: config } = await import(pathToFileURL(join(DIR, file)));
  const { svg } = await buildBanner(config, { baseDir: DIR });
  const out = file.slice(0, -SUFFIX.length) + ".svg";
  writeFileSync(join(DIR, out), svg);
  console.log(`${out}: ${Buffer.byteLength(svg)} bytes`);
}
