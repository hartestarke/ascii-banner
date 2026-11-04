// An info card, laid out like neofetch: a portrait at the left (the avatar on
// its own dark screen, or a solid field), a header and "key ··· value" rows at
// the right, and for a person the year's contributions as a sparkline or a
// calendar. Every value comes from the snapshot and its fetch time, so a card
// builds the same until the next fetch. The card is a layer of the banner:
// markup and CSS whose every class, id and @keyframes name starts with the
// card's prefix, so any number of cards share one SVG.
//
// The intro is CSS alone, as GitHub runs no script in an <img>. A line reveal
// (reveal "type", "decode", "slide", "glitch"): masks reveal the portrait tone by
// tone, the lines come in one by one (typed at a cursor, decoded out of noise
// frames, slid or glitched in). A field reveal ("wave", "drops", "crystal"): the
// card is drawn settled and the banner's field uncovers it. Either way numbers
// count up through stacked frames, and a band of light crosses a brighter copy
// of the activity. The markup itself is the finished card, so intro "none" and
// prefers-reduced-motion, which drops every animation, show it still.
import { ConfigError, resolveConfig } from "../config.mjs";
import { bakeField, fieldGrid, jitter } from "../field.mjs";
import { noiseRow } from "../reveals/common.mjs";
import { autocontrast, decodeImage, ImageError, resample } from "./image.mjs";

// Avatar portrait: a 240 px box of 2.4 × 2.1 px samples (fontSize 4 half
// blocks, rows 4.2 px apart so they overlap by 1 px), four alpha tones.
// card.avatarColors "natural" / "gray": the palette's size; more costs bytes, a layer of text rows each.
// A card too narrow for the box and MIN_COLS beside it shrinks the box, down to minBox px.
const PORTRAIT = { box: 240, minBox: 64, fontSize: 4, pitch: 4.2, tones: 4, cutoff: 0.02, colors: { natural: 16, gray: 8 } };
const FIT_EPS = 1e-6; // px or cells: slack for float error when fitting whole cells into a width
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
// card.swatches: the accent from faint to full, a block each
const SWATCH = "███";
const SWATCHES = [0.13, 0.25, 0.37, 0.5, 0.62, 0.74, 0.86, 0.95];
const HALF = " ▀▄█";
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

// The intro, s. Lines and tones start one after another; each number counts
// once its line is in; the wave starts when everything is in and repeats.
const INTRO = {
  start: 0.15, // the first tone and the first line begin
  screen: 0.3, // the dark screen fades in
  tone: 0.9, // a portrait tone develops top to bottom,
  toneStep: 0.35, // the next one this much later,
  toneSpread: 0.7, // and the last one at most this long after the first (a natural palette has many)
  lineStep: 0.18, // a text line comes in (card.reveal, below), the next one this much later
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
// card.reveal: how a text line comes in, s; the calendar always wipes in week by week.
const REVEAL = {
  // a column a step behind a cursor bar `cursor` columns wide; intro "loop" backspaces it
  type: { dur: 0.35, cursor: 0.5 },
  decode: { dur: 0.6, frames: 8, pool: "!#$%&*+-/<=>?@[]^_{}~0123456789abcdef" }, // noise locking into the text left to right
  slide: { dur: 0.5, timing: "cubic-bezier(.2,.8,.3,1)" }, // in from the right, fading up
  glitch: { dur: 0.5 }, // flickers in, jumping sideways
};
const EPS = 0.01; // s, a cut between two keyframes

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

/**
 * Floyd–Steinberg over `channels` values a sample: `nearest(v, i)` picks a
 * level for the sample's (error-carrying) values and returns them, the rest is
 * pushed on to the neighbours. → the level of every sample.
 */
function diffuse(values, cols, rows, channels, nearest) {
  const v = Float32Array.from(values), q = new Uint8Array(cols * rows);
  const push = (i, err, w) => {
    for (let ch = 0; ch < channels; ch++) v[i * channels + ch] += err[ch] * w;
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, at = v.subarray(i * channels, (i + 1) * channels);
      const [level, got] = nearest(at);
      q[i] = level;
      const err = Array.from(at, (x, ch) => x - got[ch]);
      if (c + 1 < cols) push(i + 1, err, 7 / 16);
      if (r + 1 < rows) {
        if (c > 0) push(i + cols - 1, err, 3 / 16);
        push(i + cols, err, 5 / 16);
        if (c + 1 < cols) push(i + cols + 1, err, 1 / 16);
      }
    }
  return q;
}

/** Rows of half blocks per level in `levels`: a cell's top and bottom samples each lit where q is that level. */
function halfLayers(q, cols, rows, levels, cls) {
  return levels.map((k) => {
    const lines = [];
    for (let r = 0; r < rows; r += 2) {
      let s = "";
      for (let c = 0; c < cols; c++) s += HALF[(q[r * cols + c] === k ? 1 : 0) + (r + 1 < rows && q[(r + 1) * cols + c] === k ? 2 : 0)];
      lines.push({ col: 0, row: r / 2, s: s.trimEnd() });
    }
    return { cls: cls(k), lines };
  });
}

/** `n` colours that stand for `rgb` (three values a sample): median cut, deterministic. */
function medianCut(rgb, n) {
  const span = (box, ch) => {
    let lo = Infinity, hi = -Infinity;
    for (const i of box) (lo = Math.min(lo, rgb[3 * i + ch])), (hi = Math.max(hi, rgb[3 * i + ch]));
    return hi - lo;
  };
  const boxes = [Array.from({ length: rgb.length / 3 }, (_, i) => i)];
  while (boxes.length < n) {
    // split the box whose widest channel spans most, weighed by how many samples it holds
    let best = -1, score = 0, axis = 0;
    boxes.forEach((box, b) => {
      for (let ch = 0; box.length > 1 && ch < 3; ch++) {
        const s = span(box, ch) * Math.sqrt(box.length);
        if (s > score) [best, score, axis] = [b, s, ch];
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => rgb[3 * a + axis] - rgb[3 * b + axis] || a - b);
    boxes.splice(best, 1, box.slice(0, box.length >> 1), box.slice(box.length >> 1));
  }
  return boxes.map((box) => [0, 1, 2].map((ch) => box.reduce((a, i) => a + rgb[3 * i + ch], 0) / box.length));
}

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const hex = (c) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");

/**
 * The portrait, or null for "none": its box (at most `box` px wide), and its
 * text rows grouped by alpha class from dim to bright, the order the intro
 * develops them in.
 */
function portrait(k, snap, adv, box) {
  const mode = k.portrait;
  if (mode === "none") return null;
  if (mode === "solid") {
    const cell = SOLID.fontSize * adv;
    const side = Math.floor(box / cell + FIT_EPS) * cell; // whole cells, so the torus stays inside the box
    const fc = resolveConfig({
      size: { width: side, height: side },
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
      kind: "solid", fs: SOLID.fontSize, pitch: SOLID.pitch, top: g.y0, rows: g.ROWS, w: side, h: side,
      groups: [...groups].filter(([, byRow]) => byRow.size).map(([c, byRow]) => ({ cls: c, lines: toLines(byRow) })),
    };
  }
  if (!snap.avatar) throw new ImageError('the snapshot has no avatar; fetch again with portrait "avatar"');
  const img = decodeImage(Buffer.from(snap.avatar.base64, "base64"));
  const px = PORTRAIT.fontSize * adv, py = PORTRAIT.pitch / 2;
  const cols = Math.floor(box / px + FIT_EPS);
  // rows stretched by the sample aspect, and even, so the image keeps its proportions
  const rows = 2 * Math.round((cols * px * img.height) / img.width / py / 2);
  const frame = { kind: "avatar", fs: PORTRAIT.fontSize, pitch: PORTRAIT.pitch, top: 0, rows: rows / 2, w: cols * px, h: (rows / 2) * PORTRAIT.pitch };
  const colours = k.avatarColors;
  if (colours === "accent") {
    // tones of the accent: tone 0 stays dark, the screen; tones 1–3 are alpha classes
    const L = PORTRAIT.tones - 1;
    const gray = autocontrast(resample(img, cols, rows), PORTRAIT.cutoff);
    const q = diffuse(gray, cols, rows, 1, ([v]) => {
      const level = Math.max(0, Math.min(L, Math.round(v * L)));
      return [level, [level / L]];
    });
    return { ...frame, groups: halfLayers(q, cols, rows, Array.from({ length: L }, (_, i) => i + 1), (t) => `t${t}`) };
  }
  // opaque colours: an adaptive palette, every sample on one of them
  let rgb;
  if (colours === "gray") {
    const gray = autocontrast(resample(img, cols, rows), PORTRAIT.cutoff);
    rgb = Float32Array.from({ length: gray.length * 3 }, (_, i) => gray[Math.floor(i / 3)]);
  } else {
    if (!img.rgb) throw new ImageError("its colour space has no natural colours here (greyscale or YCbCr JPEG only)");
    const channel = (ch) => resample({ width: img.width, height: img.height, gray: img.rgb.filter((_, i) => i % 3 === ch) }, cols, rows);
    const [r, g, b] = [0, 1, 2].map(channel);
    rgb = Float32Array.from({ length: r.length * 3 }, (_, i) => [r, g, b][i % 3][Math.floor(i / 3)]);
  }
  const palette = medianCut(rgb, PORTRAIT.colors[colours]).sort((a, b) => luma(a) - luma(b));
  const q = diffuse(rgb, cols, rows, 3, (v) => {
    let best = 0, dist = Infinity;
    palette.forEach((p, k) => {
      const d = (v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2 + (v[2] - p[2]) ** 2;
      if (d < dist) [best, dist] = [k, d];
    });
    return [best, palette[best]];
  });
  // dark to light, the order they develop in
  return { ...frame, groups: halfLayers(q, cols, rows, palette.map((_, k) => k), (k) => `c${k}`), fills: palette.map(hex) };
}

// Reveal keyframes: [share of the way in, declarations], hidden first, shown last.
// A wipe slides a mask rect from `d` px before what it opens onto it (Firefox scales a rect
// inside a mask about the page's origin whatever its transform-box, so no scaling). At rest the
// rect covers it, so with every animation off (prefers-reduced-motion) the card shows whole.
// Hidden, it stands WIPE_CLEAR px further off: glyphs ink a pixel past their cell.
const WIPE_CLEAR = 2;
const wipe = (axis, d) => [[0, `transform:translate${axis}(${n2(-d - WIPE_CLEAR)}px)`], [1, "transform:none"]];
const FADE = [[0, "opacity:0"], [1, "opacity:1"]];
// card.reveal "slide" and "glitch" move a whole line; "type" and "decode" open it with a mask
const SLIDE = [[0, "opacity:0;transform:translateX(24px)"], [1, "opacity:1;transform:none"]];
const GLITCH = [
  [0, "opacity:0;transform:none"], [0.15, "opacity:1;transform:translateX(-7px)"], [0.3, "opacity:.35;transform:translateX(5px)"],
  [0.45, "opacity:1;transform:translateX(-3px)"], [0.6, "opacity:.6;transform:translateX(2px)"], [0.8, "opacity:1;transform:translateX(-1px)"],
  [1, "opacity:1;transform:none"],
];

/**
 * The intro's CSS → { css, animated }, `animated` = the class names that move
 * (prefers-reduced-motion stops them). `N` puts the card's prefix on a name.
 * `reveals` = the animated classes, each { cls, frames, dur, timing, after? }.
 * Intro "once" plays them a single time. Intro "loop" plays them every
 * card.period s, each running its frames backwards `hold` (+ `after`) s after
 * its own start, so the card goes away in the order it came in. `counters`:
 * numbers count up; `cursors` = reveal "type"'s, a class per line length
 * { cls, steps, travel (px), dur }; `decodeSlot` = how long a decode noise frame
 * shows, s; `wave` = px the activity's band travels, 0 for none.
 */
function introCss(k, N, { reveals = [], hold = 0, wave = 0, counters = false, cursors = [], decodeSlot = 0 }) {
  const pct = (s) => `${+((100 * s) / k.period).toFixed(3)}%`;
  const slot = INTRO.count / INTRO.countFrames;
  const once = k.intro === "once";
  const css = [], animated = [];
  const rule = (cls, keys, timing, base = "") => {
    const n = N(cls);
    css.push(`@keyframes ${n}{${keys}}.${n}{${base}animation:${n} ${timing}}`);
    animated.push(cls);
  };
  for (const { cls, frames, dur, timing, after = 0 } of reveals) {
    if (once) {
      rule(cls, frames.map(([t, d]) => `${+(100 * t).toFixed(3)}%{${d}}`).join(""), `${sec(dur)} ${timing} both`);
      continue;
    }
    const back = hold + after;
    const keys = [
      ...frames.map(([t, d]) => [pct(t * dur), d]),
      [pct(back), frames.at(-1)[1]],
      ...[...frames].reverse().map(([t, d]) => [pct(back + (1 - t) * dur), d]),
      ["100%", frames[0][1]],
    ];
    rule(cls, keys.map(([p, d]) => `${p}{${d}}`).join(""), `${sec(k.period)} ${timing} infinite backwards`);
  }
  // a frame text (count, decode) shows for its slot; the final number hides until the count is done
  const framed = (cls, s) => once
    ? rule(cls, "from,to{opacity:1}", sec(s), "opacity:0;")
    : rule(cls, `0%{opacity:1}${pct(s)},100%{opacity:0}`, `${sec(k.period)} step-end infinite`, "opacity:0;");
  if (counters) {
    framed("nf", slot);
    if (once) rule("nv", "from,to{opacity:0}", `${sec(INTRO.count)} backwards`);
    else rule("nv", `0%{opacity:0}${pct(INTRO.count)},100%{opacity:1}`, `${sec(k.period)} step-end infinite backwards`);
  }
  if (decodeSlot) framed("df", decodeSlot);
  // the cursor rides its line's mask edge in the same steps, shown only while it moves:
  // typing in, and for intro "loop" backspacing out
  for (const { cls, steps, travel, dur } of cursors) {
    const at = (x, o = 1) => `opacity:${o};transform:translateX(${n2(x)}px)`;
    const keys = once
      ? [["0%", at(0)], ["100%", at(travel)]]
      : [["0%", at(0)], [pct(dur), at(travel)], [pct(dur + EPS), at(travel, 0)], [pct(hold - EPS), at(travel, 0)],
        [pct(hold), at(travel)], [pct(hold + dur), at(0)], [pct(hold + dur + EPS), at(0, 0)], ["100%", at(0, 0)]];
    rule(cls, keys.map(([p, d]) => `${p}{${d}}`).join(""), `${sec(once ? dur : k.period)} steps(${steps})${once ? "" : " infinite"}`, "opacity:0;");
  }
  if (wave) {
    const cycle = INTRO.wave + INTRO.waveRest;
    rule("wv", `0%{transform:none}${+((100 * INTRO.wave) / cycle).toFixed(3)}%,100%{transform:translateX(${n2(wave)}px)}`,
      `${sec(cycle)} ease-in-out infinite`);
  }
  return { css: css.join("\n"), animated };
}

/**
 * One card as a layer of the banner. `card` = a resolved cfg.cards[i], `snap` =
 * its snapshot entry { mode, fetchedAt, person | project }; `width` = its box's
 * px; `prefix` starts every class, id and @keyframes name it emits; `t0` (s) is
 * added to every animation delay; `glyphs` = the characters the embedded font
 * has (null for a custom font): GitHub text outside it turns into "?" with a
 * warning, your own text outside it is an error, like a tagline's. A field
 * reveal draws the card settled: only its numbers count, from `startAt(x, y)`
 * (card-local px → absolute s; null → t0), and the activity's wave starts once
 * the field has uncovered all of it.
 * → { width, height, css, reducedMotion, defs, screen, body, knock, warnings,
 * stats: { lines, textNodes, introEnd (absolute s; 0 for intro "none") } }:
 * markup in card-local px; `screen` = the avatar's screen for a field reveal
 * (else it fades in inside `body`); `knock` = for backdrop "cut", the card's
 * silhouette for a mask: its glyphs with no fill class, and the screen in black.
 */
export function renderCard(cfg, card, snap, { width, prefix, t0 = 0, glyphs = null, startAt = null }) {
  const k = card, adv = cfg.font.advance, W = width, S = k.textSize, PX = S * adv;
  const index = cfg.cards?.indexOf(card) ?? -1;
  const where = index >= 0 ? `cards[${index}]` : "card"; // the config path errors name
  const lineReveal = Object.hasOwn(REVEAL, k.reveal);
  const animated = k.intro !== "none";
  const moving = animated && lineReveal; // the screen, tones and lines come in; a field reveal draws them settled
  const N = (name) => prefix + name;
  const names = (list) => list.split(" ").map(N).join(" ");
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
    if (out !== s) warnings.push(`${where} ${what}: characters outside the bundled font drawn as "?"`);
    return out;
  };

  // a narrow card shrinks the portrait so the text column keeps MIN_COLS, down to PORTRAIT.minBox
  const pad = k.portrait === "avatar" && k.screen ? SCREEN_PAD : 0;
  const beside = k.portrait === "none" ? 0 : 2 * pad + GAP; // the screen's margin and the gap to the text
  const minW = 2 * MARGIN + MIN_COLS * PX + (k.portrait === "none" ? 0 : PORTRAIT.minBox + beside);
  if (W < minW - FIT_EPS)
    throw new ConfigError(`${where} (${k.user ?? k.repo}): ${n2(W)} px is too narrow, this card needs at least ` +
      `${Math.ceil(minW - FIT_EPS)} px (${MIN_COLS} text columns at textSize ${S}` +
      `${k.portrait === "none" ? "" : ` beside a ${PORTRAIT.minBox} px portrait`}); widen ${where}.width or lower ${where}.textSize`);
  const pic = portrait(k, snap, adv, Math.min(PORTRAIT.box, W - minW + PORTRAIT.minBox));
  const X = MARGIN + (pic ? pic.w + beside : 0);
  const cols = Math.floor((W - X - MARGIN) / PX + FIT_EPS);
  const fit = (s, room, what) => {
    if (len(s) <= room) return s;
    warnings.push(`${what.startsWith(where) ? what : `${where} ${what}`} cut to ${room} columns`);
    return [...s].slice(0, Math.max(0, room - 2)).join("") + "..";
  };
  const colon = k.layout === "colon";
  /**
   * A row: "key ····· value" with the value right-aligned at the column's end,
   * or "key: value". `parts` = strings and numbers; with an intro the numbers
   * count up, so the value run leaves them blank and `nums` places them,
   * unless the value had to be cut.
   */
  const kv = (key, parts) => {
    const strs = parts.map((p) => (typeof p === "number" ? fmt(p) : p));
    const full = strs.join("");
    const v = fit(full, cols - len(key) - (colon ? 2 : 4), `${where} row "${key}"`);
    const counts = (p) => animated && v === full && typeof p === "number" && p > 0;
    const nums = [];
    let col = colon ? len(key) + 2 : cols - len(v);
    parts.forEach((p, i) => {
      if (counts(p)) nums.push({ col, n: p });
      col += len(strs[i]);
    });
    const value = nums.length ? parts.map((p, i) => (counts(p) ? " ".repeat(len(strs[i])) : strs[i])).join("") : v;
    const runs = colon
      ? [[key, "k"], [": ", "d"], [value, "v"]]
      : [[key + " ", "k"], ["·".repeat(cols - len(key) - len(v) - 2), "d"], [" " + value, "v"]];
    return { runs, nums };
  };
  /** The header's lines from its [text, class] runs: ruled to the column's end, or underlined (colon). */
  const header = (runs) => {
    const room = cols - 2, total = runs.reduce((a, [s]) => a + len(s), 0);
    if (total > room) runs.at(-1)[0] = fit(runs.at(-1)[0], Math.max(2, len(runs.at(-1)[0]) - (total - room)), `${where} header`);
    const width = runs.reduce((a, [s]) => a + len(s), 0);
    return colon
      ? [{ runs }, { runs: [["─".repeat(width), "d"]] }]
      : [{ runs: [...runs, [" " + "─".repeat(Math.max(0, cols - width - 1)), "d"]] }];
  };
  const swatches = () => ({ runs: SWATCHES.map((_, i) => [SWATCH, `s${i}`]) });

  // The text column: lines of [text, class] runs, and for a person maybe the calendar.
  const items = [];
  const rows = k.rows.map(([key, value], i) => [ownText(key, `${where}.rows[${i}]`), ownText(value, `${where}.rows[${i}]`)]);
  if (snap.mode === "person") {
    const p = snap.person;
    const title = k.title !== null ? ownText(k.title, `${where}.title`) : gitText(p.name ?? p.login, "the GitHub name");
    const handle = `${p.login}@github`;
    items.push(...header(title === p.login ? [[handle, "h"]] : [[title, "h"], [" " + handle, "v"]]));
    const langs = languageList(p.languages);
    const value = {
      uptime: [age(p.createdAt, snap.fetchedAt)],
      repos: [...counted(p.repos, "public repo"), " · ", ...counted(p.stars, "star"), " · ", ...counted(p.followers, "follower")],
      languages: [gitText(langs.length ? langs.map((l) => `${l.name} ${l.pct}%`).join(", ") : "none", "the languages row")],
      contributions: [p.contributions.total, " in the last year"],
    };
    for (const [key, v] of rows) items.push(kv(key, [v]));
    for (const id of k.show) items.push(kv(id, value[id]));
    if (k.swatches) items.push(swatches());
    const weeks = p.contributions.weeks;
    if (k.activity === "sparkline") {
      const n = Math.min(SPARK_WEEKS, weeks.length, cols - len(`${SPARK_WEEKS} weeks `));
      const label = `${n} weeks `;
      const sums = weeks.slice(-n).map((w) => w.days.reduce((a, d) => a + d, 0));
      const max = Math.max(...sums, 1);
      const levels = sums.map((s) => (s <= 0 ? 0 : Math.max(1, Math.min(8, 1 + Math.floor((Math.log1p(s) / Math.log1p(max)) * 7)))));
      const runs = [[label, "k"]];
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
    items.push(...header([[k.title !== null ? ownText(k.title, `${where}.title`) : p.name, "h"]]));
    if (p.description) {
      const words = gitText(p.description, "the description").split(/\s+/), wrapped = [""];
      for (const w of words) {
        const next = wrapped.at(-1) ? `${wrapped.at(-1)} ${w}` : w;
        if (len(next) <= cols || !wrapped.at(-1)) wrapped[wrapped.length - 1] = next;
        else wrapped.push(w);
      }
      const shown = wrapped.slice(0, WRAP_LINES).map((l) => fit(l, cols, "the description"));
      if (wrapped.length > WRAP_LINES) shown[WRAP_LINES - 1] = fit(shown[WRAP_LINES - 1] + " " + wrapped[WRAP_LINES], cols, "the description");
      for (const l of shown) items.push({ runs: [[l, "v"]] });
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
      const runs = [["languages", "k"], [colon ? ": " : " ", "d"]];
      const bar = Math.max(4, cols - len(runs[0][0] + runs[1][0]) - len(legend));
      const total = langs.reduce((a, l) => a + l.pct, 0) || 1;
      let used = 0;
      langs.forEach((l, i) => {
        const n = i === langs.length - 1 ? bar - used : Math.round((bar * l.pct) / total);
        if (n > 0) runs.push(["█".repeat(n), ["h", "m", "d"][i % 3]]);
        used += n;
      });
      runs.push([legend, "v"]);
      items.push({ runs });
    }
    if (k.swatches) items.push(swatches());
  }

  // ---- layout ----
  const pitch = S * LINE;
  const glyphH = S * cfg.font.blockHeight; // a full block's height, the cursor bar's
  // the calendar's first and last rows sit where a text line's middle would
  const heights = items.map((it) => (it.calendar ? (WEEK_DAYS - 1) * it.calendar.cp + pitch : pitch));
  const textH = heights.reduce((a, h) => a + h, 0);
  const picH = pic ? pic.h + 2 * pad : 0;
  const H = Math.ceil(2 * MARGIN + Math.max(picH, textH));
  const sizes = new Set([S]);
  const size = (s) => `f${String(s).replace(".", "_")}`;
  // delays below are s after t0
  const delayed = (d) => (d !== null && t0 + d > 0 ? ` style="animation-delay:${sec(t0 + d)}"` : ""); // null: not animated
  /** s after t0 when the banner's field shows card-local (x, y): a field reveal's clock. */
  const shownAt = (x, y) => (startAt?.(x, y) ?? t0) - t0;
  /** The latest shownAt over a box, probed a column and half a line apart. */
  const lastShown = ({ x, y, w, h }) => {
    const nx = Math.max(1, Math.ceil(w / PX)), ny = Math.max(1, Math.ceil(h / (pitch / 2)));
    let last = 0;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) last = Math.max(last, shownAt(x + (w * i) / nx, y + (h * j) / ny));
    return last;
  };
  const cut = k.backdrop === "cut";
  const knock = []; // backdrop "cut": the glyphs' silhouette, keeping only what shapes them (size, the calendar's spacing)
  /** A <text> of `s`, its leading spaces turned into x; "" when blank. `solid`: part of the settled card's silhouette. */
  const text = (x, y, s, cls, fs, delay = null, solid = true) => {
    const lead = s.length - s.trimStart().length;
    const t = s.trim();
    if (!t) return "";
    sizes.add(fs);
    const at = `x="${n2(x + lead * fs * adv)}" y="${n2(y)}"`;
    if (cut && solid) knock.push(`<text ${at} class="${names([size(fs), ...cls.split(" ").filter((c) => c === "cg")].join(" "))}">${esc(t)}</text>`);
    return `<text ${at} class="${names(`${cls} ${size(fs)}`)}"${delayed(delay)}>${esc(t)}</text>`;
  };
  const rect = (cls, x, y, w, h, delay, fill = "#fff") =>
    `<rect class="${N(cls)}" x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill}"${delayed(delay)}/>`;
  const mask = (id, rects) => `<mask id="${N(id)}" maskUnits="userSpaceOnUse" x="0" y="0" width="${n2(W)}" height="${H}">${rects.join("")}</mask>`;
  const group = (id, inner, on = moving) => (on ? [`<g mask="url(#${N(id)})">`, ...inner, "</g>"] : inner);

  // the timeline: when the last element is in, and the last mask reveal ends
  let introEnd = 0, revealEnd = 0;
  const reveal = (delay, dur) => {
    revealEnd = Math.max(revealEnd, delay + dur);
    introEnd = Math.max(introEnd, delay + dur);
  };
  const body = [], screen = [], defs = [], reveals = [];

  let screenGone = 0; // intro "loop": when the screen has faded, after the tones on it
  if (pic) {
    const x0 = MARGIN + pad, y0 = MARGIN + pad;
    const toneStep = pic.groups.length > 1 ? Math.min(INTRO.toneStep, INTRO.toneSpread / (pic.groups.length - 1)) : 0;
    const toneEnd = INTRO.start + (pic.groups.length - 1) * toneStep + INTRO.tone;
    if (pad) {
      const at = `x="${MARGIN}" y="${MARGIN}" width="${n2(pic.w + 2 * pad)}" height="${n2(pic.h + 2 * pad)}" rx="${SCREEN_RADIUS}"`;
      if (cut) knock.push(`<rect ${at} fill="#000"/>`); // it holds the portrait's glyphs: they need no copies
      if (!lineReveal) screen.push(`<rect ${at} fill="${k.screen}"/>`);
      else if (!moving) body.push(`<rect ${at} fill="${k.screen}"/>`);
      else {
        body.push(`<rect class="${N("sc")}" ${at} fill="${k.screen}"${delayed(0)}/>`);
        // going away, the screen waits for the last tone: alone on a light page they read as a negative
        reveals.push({ cls: "sc", frames: FADE, dur: INTRO.screen, timing: "ease-out", after: toneEnd });
        reveal(0, INTRO.screen);
        screenGone = toneEnd + INTRO.screen;
      }
    }
    const toneH = pic.rows * pic.pitch;
    if (moving) reveals.push({ cls: "tn", frames: wipe("Y", toneH), dur: INTRO.tone, timing: `steps(${pic.rows})` });
    pic.groups.forEach(({ cls, lines }, i) => {
      const delay = INTRO.start + i * toneStep;
      if (moving) {
        defs.push(mask(`p${i}`, [rect("tn", x0, y0 + pic.top, pic.w, toneH, delay)]));
        reveal(delay, INTRO.tone);
      }
      body.push(...group(`p${i}`, lines.map((l) => text(x0 + l.col * pic.fs * adv, y0 + pic.top + (l.row + 0.5) * pic.pitch, l.s, cls, pic.fs, null, !pad)).filter(Boolean)));
    });
  }

  const top = MARGIN + Math.max(0, (picH - textH) / 2);
  const rv = REVEAL[k.reveal];
  // "type" and "decode" open each line with a mask rect; "slide" and "glitch" move each line's own group
  const masked = k.reveal === "type" || k.reveal === "decode";
  const lines = [], lineRects = [], over = []; // `over`: the activity the wave brightens
  const loose = []; // above the mask: the decode noise
  // "type": each line's cursor is a window moving in one mask over an accent block, so it is
  // drawn in the same pass, with the same steps, as the line mask whose edge it rides
  const cursorRects = [];
  const movers = []; // "slide" / "glitch": [delay, a line's texts]
  const wipes = new Set(); // "type": the line lengths, a wipe and a cursor class each
  const steps = new Set(); // "decode": the columns a frame opens, a wipe class each
  let overHost = lines; // where the wave's group goes: with a moving line, inside it
  let activity = null; // its box
  let counting = false; // some number counts up
  const slot = INTRO.count / INTRO.countFrames;
  let y = top;
  items.forEach((it, i) => {
    const mid = y + pitch / 2, delay = INTRO.start + i * INTRO.lineStep;
    if (it.calendar) {
      const { grid, cell, cp } = it.calendar, n = grid[0].length;
      const draw = (lift, out, solid) => grid.forEach((row, r) => {
        for (let l = 0; l <= CALENDAR_TOP; l++) {
          const at = row.flatMap((v, c) => (v !== null && Math.min(CALENDAR_TOP, v + lift) === l ? [c] : []));
          if (!at.length) continue;
          const s = Array(at.at(-1) - at[0] + 1).fill(" ");
          for (const c of at) s[c - at[0]] = CELL;
          out.push(text(X + at[0] * cp, mid + r * cp, s.join(""), `l${l} cg`, S, null, solid));
        }
      });
      draw(0, lines, true);
      if (animated) {
        draw(INTRO.boost, over, false); // the same squares, brighter: nothing new for the silhouette
        activity = { x: X, y, w: n * cp - (cp - cell), h: heights[i] };
      }
      if (moving) {
        lineRects.push(rect("cl", X, y, n * cp, heights[i], delay));
        reveals.push({ cls: "cl", frames: wipe("X", n * cp), dur: INTRO.calendar, timing: `steps(${n})` });
        reveal(delay, INTRO.calendar);
      }
    } else {
      const own = []; // this line's texts
      let col = 0;
      for (const [s, cls] of it.runs) {
        own.push(text(X + col * PX, mid, s, cls, S));
        col += len(s);
      }
      if (moving) {
        reveal(delay, rv.dur);
        if (k.reveal === "type") {
          wipes.add(col);
          lineRects.push(rect(`w${col}`, X, y, col * PX, pitch, delay));
          cursorRects.push(rect(`u${col}`, X, mid - glyphH / 2, rv.cursor * PX, glyphH, delay));
        } else if (k.reveal === "decode") {
          // the mask opens `step` columns a frame; ahead of it each frame draws fresh noise over the
          // line's words (the leader dots and the rule just appear: noise there reads as a wall)
          const step = Math.ceil(col / rv.frames);
          const row = [...it.runs.map(([s, cls]) => (cls === "d" ? " ".repeat(len(s)) : s)).join("")];
          steps.add(step);
          lineRects.push(rect(`q${step}`, X, y, step * rv.frames * PX, pitch, delay));
          for (let f = 0; f < rv.frames; f++) {
            const noise = noiseRow(row.slice(f * step), rv.pool, (c) => jitter(i * 7919 + f * 131 + c * 31 + 7));
            loose.push(text(X + f * step * PX, mid, noise, "m df", S, delay + (f * rv.dur) / rv.frames, false));
          }
        }
      }
      // a number counts once its line is in, or once the field has uncovered it
      for (const { col: c, n } of it.nums ?? []) {
        const s = fmt(n), x = X + c * PX;
        const from = moving ? delay + rv.dur : shownAt(x + (len(s) * PX) / 2, mid);
        own.push(text(x, mid, s, "v nv", S, from));
        for (let f = 0; f < INTRO.countFrames; f++)
          own.push(text(x, mid, fmt(Math.round(n * (1 - (1 - f / INTRO.countFrames) ** 3))).padStart(len(s)), "v nf", S, from + f * slot, false));
        introEnd = Math.max(introEnd, from + INTRO.count);
        counting = true;
      }
      if (animated && it.spark) {
        // lifted, the weeks stand taller than at rest: part of the silhouette
        const lifted = it.spark.levels.map((l) => SPARK[Math.min(8, l + INTRO.boost)]).join("");
        over.push(text(X + it.spark.col * PX, mid, lifted, "h", S));
        activity = { x: X + it.spark.col * PX, y, w: it.spark.levels.length * PX, h: pitch };
        if (moving && !masked) overHost = own;
      }
      if (moving && !masked) movers.push([delay, own]);
      else lines.push(...own);
    }
    y += heights[i];
  });
  if (moving) {
    for (const n of wipes) reveals.push({ cls: `w${n}`, frames: wipe("X", n * PX), dur: rv.dur, timing: `steps(${n})` });
    for (const n of steps) reveals.push({ cls: `q${n}`, frames: wipe("X", n * rv.frames * PX), dur: rv.dur, timing: `steps(${rv.frames})` });
    if (k.reveal === "slide") reveals.push({ cls: "sl", frames: SLIDE, dur: rv.dur, timing: rv.timing });
    if (k.reveal === "glitch") reveals.push({ cls: "gl", frames: GLITCH, dur: rv.dur, timing: "step-end" });
  }

  // a field reveal's loop is the field's (the banner checks its period); a line reveal's is the card's own
  let hold = 0;
  if (moving && k.intro === "loop") {
    // each element hides `hold` s after its own start; the last is gone a pause before the replay
    const out = Math.max(revealEnd, screenGone);
    hold = k.period - INTRO.pause - out;
    if (hold - introEnd < INTRO.minHold)
      throw new ConfigError(`${where}.period: one cycle of this card needs at least ` +
        `${Math.ceil(INTRO.pause + out + introEnd + INTRO.minHold)} s (${n2(introEnd)} s to come in, ${n2(out)} s to go, ` +
        `${INTRO.minHold} s in full view, a ${INTRO.pause} s pause), got ${k.period}`);
  }
  if (lineRects.length) defs.push(mask("tx", lineRects));
  let waveShift = 0; // px the wave's band travels: across the activity, from just before it to just past it
  if (activity) {
    const band = Math.max(3 * PX, activity.w * INTRO.waveBand);
    waveShift = activity.w + band;
    // it starts once everything is in: the lines, or the field off the whole activity
    const start = moving ? introEnd : lastShown(activity);
    defs.push(`<linearGradient id="${N("wg")}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`);
    defs.push(mask("wm", [rect("wv", activity.x - band, activity.y, band, activity.h, start, `url(#${N("wg")})`)]));
    overHost.push(...group("wm", over.filter(Boolean), true));
  }
  const drawn = lines.filter(Boolean);
  body.push(...(lineRects.length ? group("tx", drawn) : drawn));
  const mover = k.reveal === "slide" ? "sl" : "gl";
  for (const [delay, own] of movers) body.push(`<g class="${N(mover)}"${delayed(delay)}>`, ...own.filter(Boolean), "</g>");
  body.push(...loose.filter(Boolean));
  if (cursorRects.length) {
    defs.push(mask("cu", cursorRects));
    body.push(...group("cu", [`<rect class="${N("h")}" x="${n2(X)}" y="${n2(top)}" width="${n2(cols * PX)}" height="${n2(textH)}"/>`]));
  }

  const intro = animated
    ? introCss(k, N, {
      reveals, hold, wave: waveShift, counters: counting,
      cursors: [...wipes].map((n) => ({ cls: `u${n}`, steps: n, travel: n * PX, dur: rv.dur })),
      decodeSlot: k.reveal === "decode" && moving ? rv.dur / rv.frames : 0,
    })
    : { css: "", animated: [] };
  const a = (v) => `rgb(${rgb(cfg.accent)} / ${v})`;
  const calendar = items.find((it) => it.calendar)?.calendar;
  const css = [
    Object.entries(ALPHA).map(([c, v]) => `.${N(c)}{fill:${a(v)}}`).join(""),
    // keys in the accent, values in the ink; with no ink the values take the bright accent and the keys step down
    `.${N("k")}{fill:${a(k.ink ? ALPHA.h : ALPHA.m)}}.${N("v")}{fill:${k.ink ?? a(ALPHA.h)}}`,
    ...(pic?.fills ? [pic.fills.map((f, i) => `.${N(`c${i}`)}{fill:${f}}`).join("")] : []),
    // swatches: the natural palette spread dark to light, else the accent faint to full
    ...(k.swatches
      ? [SWATCHES.map((v, i) => `.${N(`s${i}`)}{fill:${pic?.fills ? pic.fills[Math.round((i * (pic.fills.length - 1)) / (SWATCHES.length - 1))] : a(v)}}`).join("")]
      : []),
    [...sizes].map((s) => `.${N(size(s))}{font-size:${s}px}`).join(""),
    ...(calendar ? [`.${N("cg")}{letter-spacing:${n2(calendar.cp - calendar.cell)}px}`] : []),
    ...(intro.css ? [intro.css] : []),
  ].join("\n");
  // the markup is the finished card: with the animations off it shows settled
  const reducedMotion = intro.animated.length ? `${intro.animated.map((c) => `.${N(c)}`).join(",")}{animation:none!important}` : "";
  const layer = { defs: defs.join("\n"), screen: screen.join("\n"), body: body.join("\n"), knock: knock.join("\n") };
  const textNodes = Object.values(layer).reduce((n, s) => n + (s.match(/<text /g) ?? []).length, 0);
  return {
    width: W, height: H, css, reducedMotion, ...layer, warnings,
    stats: { lines: items.length, textNodes, introEnd: animated ? n2(t0 + introEnd) : 0 },
  };
}
