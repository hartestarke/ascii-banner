// The info card, laid out like neofetch: a portrait at the left (the avatar on
// its own dark screen, or a solid field), a header and "key ··· value" rows at
// the right, and for a person a sparkline of the year's contributions. Every
// value comes from the snapshot and its fetch time, so a card builds the same
// until the next fetch.
import { ConfigError, resolveConfig } from "../config.mjs";
import { bakeField, fieldGrid } from "../field.mjs";
import { autocontrast, decodeImage, ImageError, resample } from "./image.mjs";

// Avatar portrait: a 240 px box of 2.4 × 2.1 px samples (fontSize 4 half
// blocks, rows 4.2 px apart so they overlap by 1 px), four alpha tones.
const PORTRAIT = { box: 240, fontSize: 4, pitch: 4.2, tones: 4, cutoff: 0.02 };
// The solid emblem: the solid preset in half cells at its usual 4.8 px samples.
const SOLID = { fontSize: 8, pitch: 9.5, stillAt: 3.3 };
const SCREEN_PAD = 6; // screen margin around the portrait, px
const SCREEN_RADIUS = 4;
const MARGIN = 14; // card edge to content, px
const GAP = 22; // portrait to text column, px
const LINE = 1.62; // text row pitch, em
const WRAP_LINES = 2; // a project description wraps to at most this many lines
const LANGUAGES_SHOWN = 4;
const SPARK_WEEKS = 52;
const ALPHA = { d: 0.42, m: 0.68, h: 0.95, t1: 0.3, t2: 0.6, t3: 0.95 };
const SPARK = " ▁▂▃▄▅▆▇█";
const HALF = " ▀▄█";
const DAY_MS = 86_400_000;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const n2 = (v) => +v.toFixed(2);
const len = (s) => [...s].length;
const fmt = (n) => n.toLocaleString("en-US");
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

/** "2y 8m", "5m", "12d": the account's age at fetch time. */
function age(fromIso, toIso) {
  const a = new Date(fromIso), b = new Date(toIso);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  if (b.getUTCDate() < a.getUTCDate()) months--;
  if (months < 1) return `${Math.max(0, Math.floor((b - a) / DAY_MS))}d`;
  return months < 12 ? `${months}m` : `${Math.floor(months / 12)}y ${months % 12}m`;
}
const daysAgo = (iso, nowIso) => {
  const d = Math.floor((new Date(nowIso) - new Date(iso)) / DAY_MS);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};

const languageList = (langs) => {
  const total = langs.reduce((a, l) => a + l.bytes, 0);
  const shown = langs.map((l) => ({ ...l, pct: Math.round((100 * l.bytes) / (total || 1)) })).filter((l) => l.pct >= 1);
  return shown.slice(0, LANGUAGES_SHOWN);
};

/** Floyd–Steinberg to `levels` tones; tone k ≥ 1 becomes its own rows of half blocks. */
function toneLayers(values, cols, rows, levels) {
  const v = Float32Array.from(values), q = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      q[i] = Math.max(0, Math.min(levels - 1, Math.round(v[i] * (levels - 1))));
      const err = v[i] - q[i] / (levels - 1);
      if (c + 1 < cols) v[i + 1] += (err * 7) / 16;
      if (r + 1 < rows) {
        if (c > 0) v[i + cols - 1] += (err * 3) / 16;
        v[i + cols] += (err * 5) / 16;
        if (c + 1 < cols) v[i + cols + 1] += err / 16;
      }
    }
  const layers = [];
  for (let k = 1; k < levels; k++) {
    const lines = [];
    for (let r = 0; r < rows; r += 2) {
      let s = "";
      for (let c = 0; c < cols; c++) s += HALF[(q[r * cols + c] === k ? 1 : 0) + (r + 1 < rows && q[(r + 1) * cols + c] === k ? 2 : 0)];
      lines.push(s);
    }
    layers.push({ cls: `t${k}`, lines });
  }
  return layers;
}

/** Text rows of the portrait and its box size, or null for "none". */
function portrait(cfg, snap, adv) {
  const mode = cfg.card.portrait;
  if (mode === "none") return null;
  if (mode === "solid") {
    const fc = resolveConfig({
      size: { width: PORTRAIT.box, height: PORTRAIT.box },
      taglines: [],
      field: { preset: "solid", cells: "half", fontSize: SOLID.fontSize, rowPitch: SOLID.pitch, dither: 4, fps: 0, stillAt: SOLID.stillAt, options: { x: 0.5, size: 0.95 } },
    });
    const g = fieldGrid(fc);
    const { frames, bands } = bakeField(fc, g);
    const cls = (b) => (bands.length === 1 ? "h" : ["d", "m", "h"][Math.round((b * 2) / (bands.length - 1))]);
    const texts = [];
    for (const { row, start = 0, chars, bands: cb } of frames[0])
      chars.forEach((ch, i) => ch !== " " && texts.push({ col: start + i, row, ch, cls: cls(cb[i]) }));
    return { kind: "solid", fs: SOLID.fontSize, pitch: SOLID.pitch, y0: g.y0, w: g.COLS * SOLID.fontSize * adv, h: PORTRAIT.box, cells: texts };
  }
  if (!snap.avatar) throw new ImageError('the snapshot has no avatar; fetch again with card.portrait "avatar"');
  const img = decodeImage(Buffer.from(snap.avatar.base64, "base64"));
  const px = PORTRAIT.fontSize * adv, py = PORTRAIT.pitch / 2;
  const cols = Math.round(PORTRAIT.box / px);
  // rows stretched by the sample aspect, and even, so the image keeps its proportions
  const rows = 2 * Math.round((PORTRAIT.box * img.height) / img.width / py / 2);
  const gray = autocontrast(resample(img, cols, rows), PORTRAIT.cutoff);
  return { kind: "avatar", fs: PORTRAIT.fontSize, pitch: PORTRAIT.pitch, w: cols * px, h: (rows / 2) * PORTRAIT.pitch, layers: toneLayers(gray, cols, rows, PORTRAIT.tones) };
}

/**
 * The card for a resolved config and its snapshot. `glyphs` = the characters
 * the embedded font has (null for a custom font): GitHub text outside it turns
 * into "?" with a warning; your own text outside it is an error, like a tagline's.
 */
export function renderCard(cfg, snap, fontB64, glyphs) {
  const k = cfg.card, adv = cfg.font.advance, W = k.width, S = k.textSize, PX = S * adv;
  const warnings = [];
  const ownText = (s, key) => {
    const lack = glyphs ? [...new Set(s)].filter((c) => c !== " " && !glyphs.has(c)) : [];
    if (lack.length)
      throw new ConfigError(`${key}: the bundled font has no glyph for ${lack.map((c) => JSON.stringify(c)).join(" ")}; ` +
        `remove them, or subset your own font with those glyphs and pass it as font.file`);
    return s;
  };
  const gitText = (s, what) => {
    const out = glyphs ? [...s].map((c) => (c === " " || glyphs.has(c) ? c : "?")).join("") : s;
    if (out !== s) warnings.push(`${what}: characters outside the bundled font drawn as "?"`);
    return out;
  };

  const pic = portrait(cfg, snap, adv);
  const X = MARGIN + (pic ? pic.w + (pic.kind === "avatar" && k.screen ? 2 * SCREEN_PAD : 0) + GAP : 0);
  const cols = Math.floor((W - X - MARGIN) / PX);
  const fit = (s, room, what) => {
    if (len(s) <= room) return s;
    warnings.push(`${what} cut to ${room} columns`);
    return [...s].slice(0, Math.max(0, room - 2)).join("") + "..";
  };
  /** "key ····· value", value right-aligned at the column's end. */
  const kv = (key, value) => {
    const v = fit(value, cols - len(key) - 4, `card row "${key}"`);
    return [[key + " ", "m"], ["·".repeat(cols - len(key) - len(v) - 2), "d"], [" " + v, "h"]];
  };

  const lines = []; // each a list of [text, class] runs
  const rows = k.rows.map(([key, value], i) => [ownText(key, `card.rows[${i}]`), ownText(value, `card.rows[${i}]`)]);
  if (snap.mode === "person") {
    const p = snap.person;
    const title = k.title !== null ? ownText(k.title, "card.title") : gitText(p.name ?? p.login, "the GitHub name");
    const handle = `${p.login}@github`;
    const head = title === p.login ? handle : `${title} ${handle}`;
    lines.push([[fit(head, cols - 2, "the header"), "h"], [" " + "─".repeat(Math.max(0, cols - len(head) - 1)), "d"]]);
    const langs = languageList(p.languages);
    const value = {
      uptime: age(p.createdAt, snap.fetchedAt),
      repos: `${plural(p.repos, "public repo")} · ${plural(p.stars, "star")} · ${plural(p.followers, "follower")}`,
      languages: langs.length ? langs.map((l) => `${l.name} ${l.pct}%`).join(", ") : "none",
      contributions: `${fmt(p.contributions.total)} in the last year`,
    };
    for (const [key, v] of rows) lines.push(kv(key, v));
    for (const id of k.show) lines.push(kv(id, gitText(value[id], `the ${id} row`)));
    if (k.sparkline) {
      const weeks = p.contributions.weeks.slice(-SPARK_WEEKS).map((w) => w.days.reduce((a, d) => a + d, 0));
      const max = Math.max(...weeks, 1);
      const label = `${weeks.length} weeks `;
      const runs = [[label, "m"]];
      for (const n of weeks.slice(-(cols - len(label)))) {
        const [ch, cls] = n <= 0 ? ["·", "d"] : [SPARK[Math.max(1, Math.min(8, 1 + Math.floor((Math.log1p(n) / Math.log1p(max)) * 7)))], "h"];
        if (runs.at(-1)[1] === cls && runs.length > 1) runs.at(-1)[0] += ch;
        else runs.push([ch, cls]);
      }
      lines.push(runs);
    }
  } else {
    const p = snap.project;
    const title = k.title !== null ? ownText(k.title, "card.title") : p.name;
    lines.push([[fit(title, cols - 2, "the header"), "h"], [" " + "─".repeat(Math.max(0, cols - len(title) - 1)), "d"]]);
    if (p.description) {
      const words = gitText(p.description, "the description").split(/\s+/), wrapped = [""];
      for (const w of words) {
        const next = wrapped.at(-1) ? `${wrapped.at(-1)} ${w}` : w;
        if (len(next) <= cols || !wrapped.at(-1)) wrapped[wrapped.length - 1] = next;
        else wrapped.push(w);
      }
      const shown = wrapped.slice(0, WRAP_LINES).map((l) => fit(l, cols, "the description"));
      if (wrapped.length > WRAP_LINES) shown[WRAP_LINES - 1] = fit(shown[WRAP_LINES - 1] + " " + wrapped[WRAP_LINES], cols, "the description");
      for (const l of shown) lines.push([[l, "m"]]);
    }
    const langs = languageList(p.languages);
    const value = {
      release: p.release ? `${p.release.tag} · ${p.release.date.slice(0, 10)}` : "none",
      license: p.license === "NOASSERTION" ? "other" : (p.license ?? "none"),
      stats: `${plural(p.stars, "star")} · ${plural(p.forks, "fork")} · ${plural(p.issues, "open issue")}`,
      commits: p.lastCommit ? `${fmt(p.commits)} on ${p.branch} · last ${daysAgo(p.lastCommit, snap.fetchedAt)}` : "none",
    };
    for (const [key, v] of rows) lines.push(kv(key, v));
    for (const id of k.show) {
      if (id !== "languages") {
        lines.push(kv(id, gitText(value[id], `the ${id} row`)));
        continue;
      }
      // a bar split by language, shades alternating, then the leading languages
      const legend = " " + (langs.length ? langs.slice(0, 2).map((l) => `${l.name} ${l.pct}%`).join(", ") : "none");
      const bar = Math.max(4, cols - len("languages ") - len(legend));
      const total = langs.reduce((a, l) => a + l.pct, 0) || 1;
      const runs = [["languages ", "m"]];
      let used = 0;
      langs.forEach((l, i) => {
        const n = i === langs.length - 1 ? bar - used : Math.round((bar * l.pct) / total);
        if (n > 0) runs.push(["█".repeat(n), ["h", "m", "d"][i % 3]]);
        used += n;
      });
      runs.push([legend, "m"]);
      lines.push(runs);
    }
  }

  // ---- layout ----
  const pitch = S * LINE;
  const textH = lines.length * pitch;
  const picH = pic ? pic.h + (pic.kind === "avatar" && k.screen ? 2 * SCREEN_PAD : 0) : 0;
  const H = Math.ceil(2 * MARGIN + Math.max(picH, textH));
  const body = [];
  const sizes = new Set([S]);
  const text = (x, y, s, cls, size) => {
    const lead = s.length - s.trimStart().length;
    const t = s.trim();
    if (!t) return;
    sizes.add(size);
    body.push(`<text x="${n2(x + lead * size * adv)}" y="${n2(y)}" class="${cls} f${String(size).replace(".", "_")}">${esc(t)}</text>`);
  };

  if (pic?.kind === "avatar") {
    const pad = k.screen ? SCREEN_PAD : 0, x0 = MARGIN + pad, y0 = MARGIN + pad;
    if (k.screen)
      body.push(`<rect x="${MARGIN}" y="${MARGIN}" width="${n2(pic.w + 2 * pad)}" height="${n2(pic.h + 2 * pad)}" rx="${SCREEN_RADIUS}" fill="${k.screen}"/>`);
    for (const { cls, lines: rowsOf } of pic.layers)
      rowsOf.forEach((s, i) => text(x0, y0 + (i + 0.5) * pic.pitch, s.trimEnd(), cls, pic.fs));
  } else if (pic?.kind === "solid") {
    // one text per row and alpha class, cells placed by column
    const byRow = new Map();
    for (const c of pic.cells) {
      const key = `${c.row}:${c.cls}`;
      if (!byRow.has(key)) byRow.set(key, { row: c.row, cls: c.cls, cols: [] });
      byRow.get(key).cols.push(c);
    }
    for (const { row, cls, cols: cs } of byRow.values()) {
      const first = cs[0].col, last = cs.at(-1).col, s = Array(last - first + 1).fill(" ");
      for (const c of cs) s[c.col - first] = c.ch;
      text(MARGIN + first * pic.fs * adv, MARGIN + pic.y0 + (row + 0.5) * pic.pitch, s.join(""), cls, pic.fs);
    }
  }
  const top = MARGIN + Math.max(0, (picH - textH) / 2);
  lines.forEach((runs, i) => {
    let col = 0;
    for (const [s, cls] of runs) {
      text(X + col * PX, top + (i + 0.5) * pitch, s, cls, S);
      col += len(s);
    }
  });

  const a = (v) => `rgb(${rgb(cfg.accent)} / ${v})`;
  const style = [
    `@font-face{font-family:B;src:url(data:font/woff2;base64,${fontB64}) format('woff2')}`,
    "text{font-family:B,monospace;white-space:pre;dominant-baseline:central;font-variant-ligatures:none;text-rendering:optimizeSpeed}",
    Object.entries(ALPHA).map(([c, v]) => `.${c}{fill:${a(v)}}`).join(""),
    [...sizes].map((s) => `.f${String(s).replace(".", "_")}{font-size:${s}px}`).join(""),
  ].join("\n");
  const label = escAttr(snap.mode === "person" ? `${snap.person.login} on GitHub` : snap.project.name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:space="preserve" role="img" aria-label="${label}">
<title>${label}</title>
<style>
${style}
</style>
${body.join("\n")}
</svg>
`;
  return { svg, warnings, stats: { width: W, height: H, textNodes: body.filter((b) => b.startsWith("<text")).length, lines: lines.length } };
}
