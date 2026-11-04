#!/usr/bin/env node
// ascii-banner CLI: `init` drops a commented config, `build` renders it
// (cards included, offline from the snapshot), `fetch` snapshots GitHub for
// every card of the config, `fonts` lists the bundled figlet fonts, `presets`
// the field and reveal presets.
// Exit codes: 0 ok, 1 user/config error (message only), 2 unexpected (stack).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBanner, ConfigError, DEFAULTS, NO_FIELD, PRESET_GAMMA, resolveConfig } from "../src/index.mjs";
import { fetchCards } from "../src/card/index.mjs";
import { describeLayout, figlet, loadFlf } from "../src/figlet.mjs";
import { listFonts } from "../src/fonts.mjs";
import { FIELD_PRESETS } from "../src/fields/index.mjs";
import { GLYPH_SETS } from "../src/glyphsets.mjs";
import { REVEAL_PRESETS } from "../src/reveals/index.mjs";

const CONFIG_NAME = "banner.config.mjs";
const OUT_NAME = "banner.svg";
// `card` built a separate card.svg before cards moved into the banner.
const CARD_GONE = "there is no `card` command any more: cards are blocks of the banner (`cards: [...]` in the config), built by `ascii-banner build`";
const TEMPLATE = fileURLToPath(new URL(`../${CONFIG_NAME}`, import.meta.url));

const USAGE = `ascii-banner — animated ASCII-field SVG banner for READMEs

Usage:
  ascii-banner init [dir] [--force]          write ${CONFIG_NAME} into dir (default .)
  ascii-banner build [--config <path>] [--out <path>] [--data <path>]
                                             render the config (default ./${CONFIG_NAME})
                                             to an SVG (default ./${OUT_NAME}); its cards
                                             come from the snapshot in \`data\` (or --data)
  ascii-banner fetch [--config <path>] [--out <path>]
                                             snapshot GitHub for every card (cards[].user
                                             or cards[].repo) to \`data\` (or --out);
                                             needs a token in GITHUB_TOKEN or GH_TOKEN
  ascii-banner fonts [--sample <text>]       list the bundled figlet fonts (tagline.font);
                                             --sample renders <text> in each
  ascii-banner presets [--json]              list the field and reveal presets
                                             (field.preset, reveal.preset) with
                                             their option defaults
  ascii-banner --help                        this text

--config, --out and --data are relative to the current directory; paths inside
the config (font.file, tagline.font, data) are relative to the config file.
tagline.font is a bundled font name or a path to any .flf.
Flags also take the --flag=value form.
`;

/** cwd-relative when inside cwd, absolute otherwise. */
const shortPath = (p) => {
  const rel = relative(process.cwd(), p);
  return rel && !rel.startsWith("..") ? rel : p;
};

const isOption = (a) => a.length > 1 && a.startsWith("-");

/** Positionals and --flags. A value flag takes `--flag=value` or the next arg, which must not look like an option. */
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

/** The --config file's default export (default ./banner.config.mjs) and the directory its paths resolve against. */
async function loadConfig(path) {
  const configPath = resolve(path ?? CONFIG_NAME);
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
  return { config: mod.default, baseDir: dirname(configPath) };
}

function writeOut(outPath, text) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text);
}

const kb = (b) => `${(b / 1024).toFixed(0)} KB`;

async function build(argv) {
  const { pos, flags } = parseArgs(argv, ["--config", "--out", "--data"], []);
  if (pos.length) throw new ConfigError(`build takes no positional arguments\n\n${USAGE}`);
  const outPath = resolve(flags.out ?? OUT_NAME);
  const { config, baseDir } = await loadConfig(flags.config);

  const { svg, stats, warnings } = await buildBanner(config, { baseDir, dataPath: flags.data && resolve(flags.data) });
  for (const w of warnings) console.error(`warning: ${w}`);
  writeOut(outPath, svg);
  console.log(
    `${shortPath(outPath)}: ${stats.rawBytes} bytes raw (${kb(stats.rawBytes)}), ` +
    `${stats.gzipBytes} gzip (${kb(stats.gzipBytes)})\n` +
    `  ${stats.size} px, ${stats.cards} card${stats.cards === 1 ? "" : "s"}; ` +
    `${stats.frames} frames, ${stats.cells} cells, ${stats.textNodes} text nodes, ${stats.keyframes} @keyframes; ` +
    `tagline ${stats.taglineCols} cols @ ${stats.taglineFontPx}px; built in ${stats.buildMs} ms`,
  );
}

async function fetchCmd(argv) {
  const { pos, flags } = parseArgs(argv, ["--config", "--out"], []);
  if (pos.length) throw new ConfigError(`fetch takes no positional arguments\n\n${USAGE}`);
  const { config, baseDir } = await loadConfig(flags.config);
  const cfg = resolveConfig(config, { baseDir });
  const snapshot = await fetchCards(cfg, process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const outPath = resolve(flags.out ?? cfg.data);
  writeOut(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  const entries = Object.entries(snapshot.cards);
  console.log(`${shortPath(outPath)}: ${entries.length} card${entries.length === 1 ? "" : "s"}, fetched ${snapshot.fetchedAt}`);
  for (const [key, e] of entries)
    console.log(`  ${key}${e.avatar ? `, avatar ${e.avatar.type} ${kb(Buffer.byteLength(e.avatar.base64, "base64"))}` : ""}`);
}

function fonts(argv) {
  const { pos, flags } = parseArgs(argv, ["--sample"], []);
  if (pos.length) throw new ConfigError(`fonts takes no positional arguments\n\n${USAGE}`);
  const list = listFonts().map((f) => {
    const font = loadFlf(f.path, f.name, { layout: f.layout });
    const header = describeLayout(font.headerMode);
    return { ...f, font, layout: f.layout === "header" ? `header = ${header}` : `${f.layout} (header: ${header})` };
  });
  const width = (key) => Math.max(...list.map((f) => f[key].length));
  const line = (f) => `${f.name.padEnd(width("name"))}  ${f.layout.padEnd(width("layout"))}  ${f.source}`;
  if (flags.sample !== undefined) {
    for (const f of list) {
      const missing = new Set();
      let rows;
      try {
        rows = figlet(f.font, flags.sample, missing, "--sample");
      } catch (e) {
        // Every character of the sample is blank in this font (ansi-shadow has no + = | { }).
        if (!(e instanceof ConfigError)) throw e;
        console.log(`${line(f)}  [renders blank: ${e.message}]\n`);
        continue;
      }
      const lacks = missing.size ? `  [no glyph for ${[...missing].map((c) => JSON.stringify(c)).join(" ")}: drawn as "?"]` : "";
      console.log(`${line(f)}${lacks}\n${rows.map((r) => r.trimEnd()).join("\n")}\n`);
    }
    return;
  }

  console.log(`Bundled figlet fonts (tagline.font). Layout = the default a null tagline.layout takes.\n`);
  for (const f of list) console.log(`  ${line(f)}`);
  console.log(`\nRender a sample in each: ascii-banner fonts --sample "Hello"`);
}

function presets(argv) {
  const { pos, flags } = parseArgs(argv, [], ["--json"]);
  if (pos.length) throw new ConfigError(`presets takes no positional arguments\n\n${USAGE}`);
  const fields = Object.fromEntries(
    Object.entries(FIELD_PRESETS).map(([name, p]) => [name, { ramp: p.ramp, bands: p.bands, gamma: p.gamma ?? PRESET_GAMMA, options: p.defaults }]),
  );
  const reveals = Object.fromEntries(Object.entries(REVEAL_PRESETS).map(([name, p]) => [name, { options: p.defaults }]));
  if (flags.json) {
    console.log(JSON.stringify({ fields, reveals, glyphSets: GLYPH_SETS }, null, 2));
    return;
  }

  const width = Math.max(...Object.keys(fields).map((n) => n.length));
  const options = (o) => Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ") || "(no options)";
  console.log(`Field presets (field.preset; "${NO_FIELD}" draws no field). field.options overrides the defaults shown; null field.ramp / field.bands / field.gamma take the preset's.\n`);
  for (const [name, p] of Object.entries(fields))
    console.log(`  ${name.padEnd(width)}  ramp ${JSON.stringify(p.ramp)}, bands ${p.bands}, gamma ${p.gamma}\n      ${options(p.options)}`);
  console.log(`\nReveal presets (reveal.preset). reveal.options overrides the defaults shown.\n`);
  for (const [name, p] of Object.entries(reveals)) console.log(`  ${name}\n      ${options(p.options)}`);
  console.log(`\nGlyph sets (field.ramp, reveal.pool): ${Object.keys(GLYPH_SETS).join(", ")}`);
  console.log(`\nWhat each option does: docs/fields.md and docs/reveals.md. As JSON: ascii-banner presets --json`);
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || argv.includes("--help") || argv.includes("-h")) return void console.log(USAGE);
  if (cmd === "init") return init(rest);
  if (cmd === "build") return build(rest);
  if (cmd === "fetch") return fetchCmd(rest);
  if (cmd === "card") throw new ConfigError(CARD_GONE);
  if (cmd === "fonts") return fonts(rest);
  if (cmd === "presets") return presets(rest);
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
