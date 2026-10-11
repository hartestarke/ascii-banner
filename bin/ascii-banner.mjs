#!/usr/bin/env node
// ascii-banner CLI: `init` drops a commented config, `build` renders it.
// Exit codes: 0 ok, 1 user/config error (message only), 2 unexpected (stack).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBanner, ConfigError, DEFAULTS } from "../src/index.mjs";

const CONFIG_NAME = "banner.config.mjs";
const OUT_NAME = "banner.svg";
const TEMPLATE = fileURLToPath(new URL(`../${CONFIG_NAME}`, import.meta.url));

const USAGE = `ascii-banner — animated ASCII-field SVG banner for READMEs

Usage:
  ascii-banner init [dir] [--force]          write ${CONFIG_NAME} into dir (default .)
  ascii-banner build [--config <path>] [--out <path>]
                                             render the config (default ./${CONFIG_NAME})
                                             to an SVG (default ./${OUT_NAME})
  ascii-banner --help                        this text

--config and --out are relative to the current directory; asset paths inside
the config (font.file, tagline.font) are relative to the config file.
Flags also take the --flag=value form.
`;

/** cwd-relative when inside cwd, absolute otherwise. */
const shortPath = (p) => {
  const rel = relative(process.cwd(), p);
  return rel && !rel.startsWith("..") ? rel : p;
};

const isOption = (a) => a.length > 1 && a.startsWith("-");

/**
 * Split argv into positionals and --flags. Value flags take `--flag=value` or
 * the next arg; a missing value, or one that looks like another option, is an error.
 */
function parseArgs(argv, valueFlags, boolFlags) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!isOption(a)) {
      pos.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const name = eq < 0 ? a : a.slice(0, eq);
    if (valueFlags.includes(name)) {
      const value = eq < 0 ? argv[++i] : a.slice(eq + 1);
      if (value === undefined || value === "" || isOption(value))
        throw new ConfigError(`${name} needs a value${value ? `, got ${JSON.stringify(value)}` : ""}`);
      flags[name.slice(2)] = value;
    } else if (boolFlags.includes(name)) {
      if (eq >= 0) throw new ConfigError(`${name} takes no value`);
      flags[name.slice(2)] = true;
    } else throw new ConfigError(`unknown option ${a}\n\n${USAGE}`);
  }
  return { pos, flags };
}

async function init(argv) {
  const { pos, flags } = parseArgs(argv, [], ["--force"]);
  if (pos.length > 1) throw new ConfigError(`init takes at most one directory\n\n${USAGE}`);
  const dir = resolve(pos[0] ?? ".");
  const dest = join(dir, CONFIG_NAME);
  if (existsSync(dest) && !flags.force) throw new ConfigError(`${dest} already exists; pass --force to overwrite it`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(TEMPLATE, dest);
  const rel = shortPath(dest);
  const configArg = dir === process.cwd() ? "" : ` --config ${/\s/.test(rel) ? JSON.stringify(rel) : rel}`;
  const width = (await import(pathToFileURL(TEMPLATE).href)).default.size?.width ?? DEFAULTS.size.width;
  console.log(`wrote ${rel}

next:
  1. edit ${rel} (taglines, accent, size — every knob is listed there)
  2. npx --yes github:hartestarke/ascii-banner build${configArg}
  3. add to your README:  <img src="${OUT_NAME}" width="${width}" alt="">`);
}

async function build(argv) {
  const { pos, flags } = parseArgs(argv, ["--config", "--out"], []);
  if (pos.length) throw new ConfigError(`build takes no positional arguments\n\n${USAGE}`);
  const configPath = resolve(flags.config ?? CONFIG_NAME);
  const outPath = resolve(flags.out ?? OUT_NAME);
  if (!existsSync(configPath))
    throw new ConfigError(`config not found: ${configPath}\nrun \`ascii-banner init\` to create one, or pass --config <path>`);
  let mod;
  try {
    mod = await import(pathToFileURL(configPath).href);
  } catch (e) {
    throw new ConfigError(`cannot load ${configPath}: ${e.message}`);
  }
  if (!mod.default || typeof mod.default !== "object")
    throw new ConfigError(`${configPath} must \`export default { ... }\``);

  const { svg, stats, warnings } = await buildBanner(mod.default, { baseDir: dirname(configPath) });
  for (const w of warnings) console.error(`warning: ${w}`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, svg);
  const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
  console.log(
    `${shortPath(outPath)}: ${stats.rawBytes} bytes raw (${kb(stats.rawBytes)}), ` +
    `${stats.gzipBytes} gzip (${kb(stats.gzipBytes)})\n` +
    `  ${stats.frames} frames, ${stats.cells} cells, ${stats.textNodes} text nodes, ${stats.keyframes} @keyframes; ` +
    `tagline ${stats.taglineCols} cols @ ${stats.taglineFontPx}px; built in ${stats.buildMs} ms`,
  );
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || argv.includes("--help") || argv.includes("-h")) return void console.log(USAGE);
  if (cmd === "init") return init(rest);
  if (cmd === "build") return build(rest);
  throw new ConfigError(`unknown command "${cmd}"\n\n${USAGE}`);
}

main(process.argv.slice(2)).catch((e) => {
  if (e instanceof ConfigError) {
    console.error(`ascii-banner: ${e.message}`);
    process.exit(1);
  }
  console.error(e?.stack ?? e);
  process.exit(2);
});
