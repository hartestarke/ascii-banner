// The info card, laid out like neofetch: a portrait at the left (the avatar on
// its own dark screen, or a solid field), a header and "key ··· value" rows at
// the right, and for a person the year's contributions as a sparkline or a
// calendar. Every value comes from the snapshot and its fetch time, so a card
// builds the same until the next fetch.
//
// The intro is CSS alone, as GitHub runs no script in an <img>: masks reveal
// the portrait tone by tone and the lines one by one, numbers count up through
// stacked frames, and a band of light crosses a brighter copy of the activity.
// The markup itself is the finished card, so intro "none" and
// prefers-reduced-motion, which drops every animation, show it still.
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
const MIN_COLS = 30; // the narrowest text column, characters: a row's key, its dots and a cut value
const WRAP_LINES = 2; // a project description wraps to at most this many lines
const LANGUAGES_SHOWN = 4;
const SPARK_WEEKS = 52;
const CALENDAR_GAP = 0.32; // between calendar cells, a share of a cell
const ALPHA = { d: 0.42, m: 0.68, h: 0.95, t1: 0.3, t2: 0.6, t3: 0.95, l0: 0.13, l1: 0.32, l2: 0.52, l3: 0.74, l4: 0.95 };
const SPARK = " ▁▂▃▄▅▆▇█"; // index = level, 1 to 8; a week without contributions is "·"
const CALENDAR_TOP = 4; // calendar levels: l0 (no contributions) to l4
const CELL = "■";
const HALF = " ▀▄█";
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

// The intro, s. Lines and tones start one after another; each number counts
// once its line is in; the wave starts when everything is in and repeats.
const INTRO = {
  start: 0.15, // the first tone and the first line begin
  screen: 0.3, // the dark screen fades in
  tone: 0.9, // a portrait tone develops top to bottom,
  toneStep: 0.35, // the next one this much later
  line: 0.35, // a text line types in,
  lineStep: 0.18, // the next one this much later
  calendar: 0.7, // the calendar, week by week
  count: 0.9, // numbers count up,
  countFrames: 10, // in this many frames
  wave: 2.6, // one pass of the wave over the activity,
  waveRest: 1.8, // then a rest
  waveBand: 0.14, // its width, a share of the activity's
  boost: 2, // the wave lifts each cell by this many levels
  pause: 0.8, // intro "loop": blank time before the replay
  minHold: 2, // intro "loop": the least time the whole card stays up
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const n2 = (v) => +v.toFixed(2);
const sec = (v) => `${+v.toFixed(3)}s`;
const len = (s) => [...s].length;
const fmt = (n) => n.toLocaleString("en-US");
/** A count and its word, as row parts: the number counts up in the intro. */
const counted = (n, word) => [n, ` ${word}${n === 1 ? "" : "s"}`];
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
      lines.push({ col: 0, row: r / 2, s: s.trimEnd() });
    }
    layers.push({ cls: `t${k}`, lines });
  }
  return layers;
}

/**
 * The portrait, or null for "none": its box, and its text rows grouped by
 * alpha class from dim to bright, the order the intro develops them in.
 */
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
    // one text per row and alpha class, cells placed by column
    const groups = new Map(["d", "m", "h"].map((c) => [c, new Map()]));
    for (const { row, start = 0, chars, bands: cb } of frames[0])
      chars.forEach((ch, i) => {
        if (ch === " ") return;
        const byRow = groups.get(cls(cb[i]));
        if (!byRow.has(row)) byRow.set(row, []);
        byRow.get(row).push({ col: start + i, ch });
      });
    const toLines = (byRow) => [...byRow].map(([row, cells]) => {
      const first = cells[0].col, s = Array(cells.at(-1).col - first + 1).fill(" ");
      for (const c of cells) s[c.col - first] = c.ch;
      return { col: first, row, s: s.join("") };
    });
    return {
      kind: "solid", fs: SOLID.fontSize, pitch: SOLID.pitch, top: g.y0, rows: g.ROWS,
      w: g.COLS * SOLID.fontSize * adv, h: PORTRAIT.box,
      groups: [...groups].filter(([, byRow]) => byRow.size).map(([c, byRow]) => ({ cls: c, lines: toLines(byRow) })),
    };
  }
  if (!snap.avatar) throw new ImageError('the snapshot has no avatar; fetch again with card.portrait "avatar"');
  const img = decodeImage(Buffer.from(snap.avatar.base64, "base64"));
  const px = PORTRAIT.fontSize * adv, py = PORTRAIT.pitch / 2;
  const cols = Math.round(PORTRAIT.box / px);
  // rows stretched by the sample aspect, and even, so the image keeps its proportions
  const rows = 2 * Math.round((PORTRAIT.box * img.height) / img.width / py / 2);
  const gray = autocontrast(resample(img, cols, rows), PORTRAIT.cutoff);
  return {
    kind: "avatar", fs: PORTRAIT.fontSize, pitch: PORTRAIT.pitch, top: 0, rows: rows / 2,
    w: cols * px, h: (rows / 2) * PORTRAIT.pitch, groups: toneLayers(gray, cols, rows, PORTRAIT.tones),
  };
}

/**
 * The intro's CSS. `reveals` = the classes of the mask rects and the screen,
 * each { cls, prop: "x" | "y" (scale from the top left) | "o" (opacity), dur,
 * steps, after? }. Intro "once" plays them a single time. Intro "loop" plays
 * them every card.period s, each hiding again `hold` (+ `after`) s after its
 * own start, so the card goes away in the order it came in.
 */
function introCss(k, reveals, hold, wave) {
  const pct = (s) => `${+((100 * s) / k.period).toFixed(3)}%`;
  const hidden = { x: "transform:scaleX(0)", y: "transform:scaleY(0)", o: "opacity:0" };
  const shown = { x: "transform:none", y: "transform:none", o: "opacity:1" };
  const slot = INTRO.count / INTRO.countFrames;
  const once = k.intro === "once";
  const css = [];
  for (const { cls, prop, dur, steps, after = 0 } of reveals) {
    const timing = steps ? `steps(${steps})` : "ease-out";
    css.push(once
      ? `@keyframes ${cls}{from{${hidden[prop]}}}.${cls}{animation:${cls} ${sec(dur)} ${timing} both}`
      : `@keyframes ${cls}{0%{${hidden[prop]}}${pct(dur)},${pct(hold + after)}{${shown[prop]}}${pct(hold + after + dur)},100%{${hidden[prop]}}}` +
        `.${cls}{animation:${cls} ${sec(k.period)} ${timing} infinite backwards}`);
  }
  css.push(`.${reveals.filter((r) => r.prop !== "o").map((r) => r.cls).join(",.")}{transform-box:fill-box;transform-origin:0 0}`);
  // a count frame shows for its slot; the final number hides until the count is done
  css.push(once
    ? `@keyframes nf{from,to{opacity:1}}.nf{opacity:0;animation:nf ${sec(slot)}}` +
      `@keyframes nv{from,to{opacity:0}}.nv{animation:nv ${sec(INTRO.count)} backwards}`
    : `@keyframes nf{0%{opacity:1}${pct(slot)},100%{opacity:0}}.nf{opacity:0;animation:nf ${sec(k.period)} step-end infinite}` +
      `@keyframes nv{0%{opacity:0}${pct(INTRO.count)},100%{opacity:1}}.nv{animation:nv ${sec(k.period)} step-end infinite backwards}`);
  if (wave) {
    const cycle = INTRO.wave + INTRO.waveRest;
    css.push(`@keyframes wv{0%{transform:none}${+((100 * INTRO.wave) / cycle).toFixed(3)}%,100%{transform:translateX(${n2(wave)}px)}}` +
      `.wv{animation:wv ${sec(cycle)} ease-in-out infinite}`);
  }
  css.push("@media (prefers-reduced-motion:reduce){*{animation:none!important}}");
  return css.join("\n");
}

/**
 * The card for a resolved config and its snapshot. `glyphs` = the characters
 * the embedded font has (null for a custom font): GitHub text outside it turns
 * into "?" with a warning; your own text outside it is an error, like a tagline's.
 */
export function renderCard(cfg, snap, fontB64, glyphs) {
  const k = cfg.card, adv = cfg.font.advance, W = k.width, S = k.textSize, PX = S * adv;
  const moving = k.intro !== "none";
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
  const pad = pic?.kind === "avatar" && k.screen ? SCREEN_PAD : 0;
  const X = MARGIN + (pic ? pic.w + 2 * pad + GAP : 0);
  const cols = Math.floor((W - X - MARGIN) / PX);
  if (cols < MIN_COLS)
    throw new ConfigError(`card: the text column has room for ${cols} characters, at least ${MIN_COLS} are needed; ` +
      `widen card.width or lower card.textSize`);
  const fit =(s, room, what) => {
    if (len(s) <= room) return s;
    warnings.push(`${what} cut to ${room} columns`);
    return [...s].slice(0, Math.max(0, room - 2)).join("") + "..";
  };
  /**
   * "key ····· value", the value right-aligned at the column's end. `parts` =
   * strings and numbers; with an intro the numbers count up, so the value run
   * leaves them blank and `nums` places them, unless the value had to be cut.
   */
  const kv = (key, parts) => {
    const strs = parts.map((p) => (typeof p === "number" ? fmt(p) : p));
    const full = strs.join("");
    const v = fit(full, cols - len(key) - 4, `card row "${key}"`);
    const counts = (p) => moving && v === full && typeof p === "number" && p > 0;
    const nums = [];
    let col = cols - len(v);
    parts.forEach((p, i) => {
      if (counts(p)) nums.push({ col, n: p });
      col += len(strs[i]);
    });
    const value = nums.length ? parts.map((p, i) => (counts(p) ? " ".repeat(len(strs[i])) : strs[i])).join("") : v;
    return { runs: [[key + " ", "m"], ["·".repeat(cols - len(key) - len(v) - 2), "d"], [" " + value, "h"]], nums };
  };
  const header = (s) => ({ runs: [[fit(s, cols - 2, "the header"), "h"], [" " + "─".repeat(Math.max(0, cols - len(s) - 1)), "d"]] });

  // The text column: lines of [text, class] runs, and for a person maybe the calendar.
  const items = [];
  const rows = k.rows.map(([key, value], i) => [ownText(key, `card.rows[${i}]`), ownText(value, `card.rows[${i}]`)]);
  if (snap.mode === "person") {
    const p = snap.person;
    const title = k.title !== null ? ownText(k.title, "card.title") : gitText(p.name ?? p.login, "the GitHub name");
    const handle = `${p.login}@github`;
    items.push(header(title === p.login ? handle : `${title} ${handle}`));
    const langs = languageList(p.languages);
    const value = {
      uptime: [age(p.createdAt, snap.fetchedAt)],
      repos: [...counted(p.repos, "public repo"), " · ", ...counted(p.stars, "star"), " · ", ...counted(p.followers, "follower")],
      languages: [gitText(langs.length ? langs.map((l) => `${l.name} ${l.pct}%`).join(", ") : "none", "the languages row")],
      contributions: [p.contributions.total, " in the last year"],
    };
    for (const [key, v] of rows) items.push(kv(key, [v]));
    for (const id of k.show) items.push(kv(id, value[id]));
    const weeks = p.contributions.weeks;
    if (k.activity === "sparkline") {
      const n = Math.min(SPARK_WEEKS, weeks.length, cols - len(`${SPARK_WEEKS} weeks `));
      const label = `${n} weeks `;
      const sums = weeks.slice(-n).map((w) => w.days.reduce((a, d) => a + d, 0));
      const max = Math.max(...sums, 1);
      const levels = sums.map((s) => (s <= 0 ? 0 : Math.max(1, Math.min(8, 1 + Math.floor((Math.log1p(s) / Math.log1p(max)) * 7)))));
      const runs = [[label, "m"]];
      for (const l of levels) {
        const [ch, cls] = l ? [SPARK[l], "h"] : ["·", "d"];
        if (runs.at(-1)[1] === cls && runs.length > 1) runs.at(-1)[0] += ch;
        else runs.push([ch, cls]);
      }
      items.push({ runs, spark: { col: len(label), levels } });
    } else if (k.activity === "calendar") {
      const cell = S * adv;
      const n = Math.min(weeks.length, Math.floor((cols * PX + cell * CALENDAR_GAP) / (cell * (1 + CALENDAR_GAP))));
      // spread to end where the rows' values end, the gaps at most doubled
      const cp = n > 1 ? Math.min(cell * (1 + 2 * CALENDAR_GAP), (cols * PX - cell) / (n - 1)) : cell;
      // GitHub's own shades, rows Sunday to Saturday as its weeks run; days not yet come stay empty
      const grid = Array.from({ length: WEEK_DAYS }, () => Array(n).fill(null));
      weeks.slice(-n).forEach((w, c) => {
        const first = new Date(w.start).getUTCDay();
        w.levels.forEach((level, i) => {
          if (first + i < WEEK_DAYS) grid[first + i][c] = level;
        });
      });
      items.push({ calendar: { grid, cell, cp } });
    }
  } else {
    const p = snap.project;
    items.push(header(k.title !== null ? ownText(k.title, "card.title") : p.name));
    if (p.description) {
      const words = gitText(p.description, "the description").split(/\s+/), wrapped = [""];
      for (const w of words) {
        const next = wrapped.at(-1) ? `${wrapped.at(-1)} ${w}` : w;
        if (len(next) <= cols || !wrapped.at(-1)) wrapped[wrapped.length - 1] = next;
        else wrapped.push(w);
      }
      const shown = wrapped.slice(0, WRAP_LINES).map((l) => fit(l, cols, "the description"));
      if (wrapped.length > WRAP_LINES) shown[WRAP_LINES - 1] = fit(shown[WRAP_LINES - 1] + " " + wrapped[WRAP_LINES], cols, "the description");
      for (const l of shown) items.push({ runs: [[l, "m"]] });
    }
    const langs = languageList(p.languages);
    const value = {
      release: [p.release ? `${gitText(p.release.tag, "the release tag")} · ${p.release.date.slice(0, 10)}` : "none"],
      license: [p.license === "NOASSERTION" ? "other" : gitText(p.license ?? "none", "the license")],
      stats: [...counted(p.stars, "star"), " · ", ...counted(p.forks, "fork"), " · ", ...counted(p.issues, "open issue")],
      commits: p.lastCommit ? [p.commits, ` on ${gitText(p.branch, "the branch")} · last ${daysAgo(p.lastCommit, snap.fetchedAt)}`] : ["none"],
    };
    for (const [key, v] of rows) items.push(kv(key, [v]));
    for (const id of k.show) {
      if (id !== "languages") {
        items.push(kv(id, value[id]));
        continue;
      }
      // a bar split by language, shades alternating, then the leading languages
      const legend = " " + gitText(langs.length ? langs.slice(0, 2).map((l) => `${l.name} ${l.pct}%`).join(", ") : "none", "the languages row");
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
      items.push({ runs });
    }
  }

  // ---- layout ----
  const pitch = S * LINE;
  // the calendar's first and last rows sit where a text line's middle would
  const heights = items.map((it) => (it.calendar ? (WEEK_DAYS - 1) * it.calendar.cp + pitch : pitch));
  const textH = heights.reduce((a, h) => a + h, 0);
  const picH = pic ? pic.h + 2 * pad : 0;
  const H = Math.ceil(2 * MARGIN + Math.max(picH, textH));
  const sizes = new Set([S]);
  const size = (s) => `f${String(s).replace(".", "_")}`;
  const delayed = (d) => (d > 0 ? ` style="animation-delay:${sec(d)}"` : "");
  /** A <text> of `s`, its leading spaces turned into x; "" when blank. */
  const text = (x, y, s, cls, fs, delay = 0) => {
    const lead = s.length - s.trimStart().length;
    const t = s.trim();
    if (!t) return "";
    sizes.add(fs);
    return `<text x="${n2(x + lead * fs * adv)}" y="${n2(y)}" class="${cls} ${size(fs)}"${delayed(delay)}>${esc(t)}</text>`;
  };
  const rect = (cls, x, y, w, h, delay, fill = "#fff") =>
    `<rect class="${cls}" x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill}"${delayed(delay)}/>`;
  const mask = (id, rects) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${rects.join("")}</mask>`;
  const group = (id, inner) => (moving ? [`<g mask="url(#${id})">`, ...inner, "</g>"] : inner);

  // the timeline: when the last element is in, and the last mask reveal ends
  let introEnd = 0, revealEnd = 0;
  const reveal = (delay, dur) => {
    revealEnd = Math.max(revealEnd, delay + dur);
    introEnd = Math.max(introEnd, delay + dur);
  };
  const body = [], defs = [], reveals = [];

  let screenGone = 0; // intro "loop": when the screen has faded, after the tones on it
  if (pic) {
    const x0 = MARGIN + pad, y0 = MARGIN + pad;
    const toneEnd = INTRO.start + (pic.groups.length - 1) * INTRO.toneStep + INTRO.tone;
    if (pad) {
      body.push(`<rect${moving ? ' class="sc"' : ""} x="${MARGIN}" y="${MARGIN}" width="${n2(pic.w + 2 * pad)}" height="${n2(pic.h + 2 * pad)}" rx="${SCREEN_RADIUS}" fill="${k.screen}"/>`);
      // going away, the screen waits for the last tone: alone on a light page they read as a negative
      reveals.push({ cls: "sc", prop: "o", dur: INTRO.screen, after: toneEnd });
      reveal(0, INTRO.screen);
      screenGone = toneEnd + INTRO.screen;
    }
    reveals.push({ cls: "tn", prop: "y", dur: INTRO.tone, steps: pic.rows });
    pic.groups.forEach(({ cls, lines }, i) => {
      const delay = INTRO.start + i * INTRO.toneStep;
      if (moving) defs.push(mask(`p${i}`, [rect("tn", x0, y0 + pic.top, pic.w, pic.rows * pic.pitch, delay)]));
      reveal(delay, INTRO.tone);
      body.push(...group(`p${i}`, lines.map((l) => text(x0 + l.col * pic.fs * adv, y0 + pic.top + (l.row + 0.5) * pic.pitch, l.s, cls, pic.fs)).filter(Boolean)));
    });
  }

  const top = MARGIN + Math.max(0, (picH - textH) / 2);
  const lines = [], lineRects = [], over = []; // `over`: the activity the wave brightens
  let activity = null; // its box
  const slot = INTRO.count / INTRO.countFrames;
  let y = top;
  items.forEach((it, i) => {
    const mid = y + pitch / 2, delay = INTRO.start + i * INTRO.lineStep;
    if (it.calendar) {
      const { grid, cell, cp } = it.calendar, n = grid[0].length;
      const draw = (lift, out) => grid.forEach((row, r) => {
        for (let l = 0; l <= CALENDAR_TOP; l++) {
          const at = row.flatMap((v, c) => (v !== null && Math.min(CALENDAR_TOP, v + lift) === l ? [c] : []));
          if (!at.length) continue;
          const s = Array(at.at(-1) - at[0] + 1).fill(" ");
          for (const c of at) s[c - at[0]] = CELL;
          out.push(text(X + at[0] * cp, mid + r * cp, s.join(""), `l${l} cg`, S));
        }
      });
      draw(0, lines);
      if (moving) {
        draw(INTRO.boost, over);
        lineRects.push(rect("cl", X, y, n * cp, heights[i], delay));
        reveals.push({ cls: "cl", prop: "x", dur: INTRO.calendar, steps: n });
        reveal(delay, INTRO.calendar);
        activity = { x: X, y, w: n * cp - (cp - cell), h: heights[i] };
      }
    } else {
      let col = 0;
      for (const [s, cls] of it.runs) {
        lines.push(text(X + col * PX, mid, s, cls, S));
        col += len(s);
      }
      if (moving) {
        lineRects.push(rect("ln", X, y, cols * PX, pitch, delay));
        reveal(delay, INTRO.line);
        const from = delay + INTRO.line; // the count starts once the line is in
        for (const { col: c, n } of it.nums ?? []) {
          const s = fmt(n);
          lines.push(text(X + c * PX, mid, s, "h nv", S, from));
          for (let f = 0; f < INTRO.countFrames; f++)
            lines.push(text(X + c * PX, mid, fmt(Math.round(n * (1 - (1 - f / INTRO.countFrames) ** 3))).padStart(len(s)), "h nf", S, from + f * slot));
          introEnd = Math.max(introEnd, from + INTRO.count);
        }
        if (it.spark) {
          const lifted = it.spark.levels.map((l) => SPARK[Math.min(8, l + INTRO.boost)]).join("");
          over.push(text(X + it.spark.col * PX, mid, lifted, "h", S));
          activity = { x: X + it.spark.col * PX, y, w: it.spark.levels.length * PX, h: pitch };
        }
      }
    }
    y += heights[i];
  });
  if (moving) reveals.push({ cls: "ln", prop: "x", dur: INTRO.line, steps: cols });

  let hold = 0;
  if (k.intro === "loop") {
    // each element hides `hold` s after its own start; the last is gone a pause before the replay
    const out = Math.max(revealEnd, screenGone);
    hold = k.period - INTRO.pause - out;
    if (hold - introEnd < INTRO.minHold)
      throw new ConfigError(`card.period: one cycle of this card needs at least ` +
        `${Math.ceil(INTRO.pause + out + introEnd + INTRO.minHold)} s (${n2(introEnd)} s to come in, ${n2(out)} s to go, ` +
        `${INTRO.minHold} s in full view, a ${INTRO.pause} s pause), got ${k.period}`);
  }
  if (moving) defs.push(mask("tx", lineRects));
  let waveShift = 0; // px the wave's band travels: across the activity, from just before it to just past it
  if (moving && activity) {
    const band = Math.max(3 * PX, activity.w * INTRO.waveBand);
    waveShift = activity.w + band;
    defs.push(`<linearGradient id="wg"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`);
    defs.push(mask("wm", [rect("wv", activity.x - band, activity.y, band, activity.h, introEnd, "url(#wg)")]));
    lines.push(...group("wm", over.filter(Boolean)));
  }
  body.push(...group("tx", lines.filter(Boolean)));

  const a = (v) => `rgb(${rgb(cfg.accent)} / ${v})`;
  const calendar = items.find((it) => it.calendar)?.calendar;
  const style = [
    `@font-face{font-family:B;src:url(data:font/woff2;base64,${fontB64}) format('woff2')}`,
    "text{font-family:B,monospace;white-space:pre;dominant-baseline:central;font-variant-ligatures:none;text-rendering:optimizeSpeed}",
    Object.entries(ALPHA).map(([c, v]) => `.${c}{fill:${a(v)}}`).join(""),
    [...sizes].map((s) => `.${size(s)}{font-size:${s}px}`).join(""),
    ...(calendar ? [`.cg{letter-spacing:${n2(calendar.cp - calendar.cell)}px}`] : []),
    ...(moving ? [introCss(k, reveals, hold, waveShift)] : []),
  ].join("\n");
  const label = escAttr(snap.mode === "person" ? `${snap.person.login} on GitHub` : snap.project.name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:space="preserve" role="img" aria-label="${label}">
<title>${label}</title>
<style>
${style}
</style>
${defs.length ? `<defs>\n${defs.join("\n")}\n</defs>\n` : ""}${body.join("\n")}
</svg>
`;
  return {
    svg, warnings,
    stats: { width: W, height: H, textNodes: (svg.match(/<text /g) ?? []).length, lines: items.length, intro: moving ? n2(introEnd) : 0 },
  };
}
