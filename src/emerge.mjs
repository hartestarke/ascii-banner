// Field intro: a card comes out of the flowing ASCII field as a whole. A front
// crosses the card's box cell by cell: "wave" left to right, bent by the
// field's own brightness; "drops" rings from points landing one after another,
// the first on the portrait; "crystal" scattered cells, the bright ones first.
// At a cell the field goes (Tf), a crest of ramp glyphs takes it, dense at the
// front and thinning behind, and the card shows (T). Intro "loop" sends the
// same front back every card.period s and the field returns. Every step is a
// visibility switch on the INTRO.fps tick, CSS alone (no script runs in an <img>).
//
// The backdrop is what the field does under the card: "window" clears it,
// "dim" leaves DIM of it out, "cut" clears it around the card's glyphs (the
// card's knock silhouette under the field mask). Line reveals and intro "none"
// only open the backdrop; the card animates itself (src/card/render.mjs).
import { ConfigError, parseRamp } from "./config.mjs";
import { jitter } from "./field.mjs";
import { num, num2 } from "./svg.mjs";

const INTRO = {
  dur: 2.2, // s, the front's whole crossing
  fps: 20, // crest frames per second; 100 / fps must be whole: delays carry 2 decimals
  pause: 0.8, // intro "loop": field only, before the next cycle (as src/card/render.mjs)
  minHold: 2, // intro "loop": the least time the whole card stays up (as src/card/render.mjs)
};
// lead: s a cell spends as crest between the field going and the card showing.
// echo: [s after the card shows, s long, ramp level 0..1], rings drawn over the card on the way in.
const SHAPES = {
  wave: { lead: 0.3, follow: 0.55, echo: [] }, // follow: how much the field's brightness bends the front
  drops: { lead: 0.22, n: 6, spread: 0.45, echo: [[0.2, 0.08, 0.12]] }, // spread: share of the crossing the drops land over
  crystal: { lead: 0.45, follow: 0.4, thin: 0.6, echo: [] }, // thin: how far the crest's flicker dims toward the card
};
const DIM = 0.78; // backdrop "dim": the share of the field taken away under the card
const EPS = 0.001; // s, visible(): margin for the rounded delays and keyframe percents of the field and the window
const MAX_JOINT_LOOPS = 10; // visible() under intro "loop": field loops searched for a joint period

const ON = "visibility:visible", OFF = "visibility:hidden";
const RUN_KINDS = ["v", "g", "d", "k"]; // the mask runs: card body (v), field gone or screen shown (g), dim (d), cut (k)
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n2 = (v) => +v.toFixed(2);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const isWhole = (v) => Math.abs(v - Math.round(v)) < 1e-6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Field loops in one joint period of the field (fieldFps, loopSeconds) and a
 * card cycle of `period` s, counted on the 1/fieldFps and 1/INTRO.fps ticks;
 * 0 when there is none within MAX_JOINT_LOOPS.
 */
function jointLoops(fieldFps, loopSeconds, period) {
  if (!Number.isInteger(fieldFps)) return 0;
  const perS = (fieldFps * INTRO.fps) / gcd(fieldFps, INTRO.fps);
  const a = period * perS, b = loopSeconds * perS;
  if (!isWhole(a) || !isWhole(b)) return 0;
  const n = Math.round(a) / gcd(Math.round(a), Math.round(b));
  return n <= MAX_JOINT_LOOPS ? n : 0;
}

/**
 * The field side of one card: its backdrop, its intro out of the field, and
 * the masks the banner puts on the card. `box` = the card's grid-snapped box,
 * `content` = the card's origin, both banner px; `grid` = fieldGrid(cfg) of the
 * whole canvas; `brightness` = cellBrightness(cfg, grid); `knock` = the card's
 * silhouette in card px (backdrop "cut"). Every id, class and @keyframes name
 * starts with `${prefix}_`; the crest's <text> takes the field's own band
 * classes (b0, b1, …), so it is drawn in the field's colours.
 */
export function renderEmerge({ cfg, card, box, content, grid, brightness, prefix, knock = "" }) {
  const p = `${prefix}_`;
  const shape = SHAPES[card.reveal];
  const still = card.intro === "none";
  const loop = card.intro === "loop";
  const P = loop ? +card.period.toFixed(3) : 0; // s, as emitted
  const where = cfg.cards?.includes(card) ? `cards[${cfg.cards.indexOf(card)}]` : "card";
  const { PX, PY, y0 } = grid;
  const c0 = Math.round(box.x / PX), c1 = Math.round((box.x + box.w) / PX);
  const r0 = Math.round((box.y - y0) / PY), r1 = Math.round((box.y + box.h - y0) / PY);
  const NC = c1 - c0;
  const at = `translate(${num2(content.x)} ${num2(content.y)})`;

  // keyframe percents of the period, and an offset as the browser reads it back from them
  const pct = (s) => +((100 * s) / P).toFixed(3);
  const edge = (s) => (pct(s) * P) / 100;
  const ONCE = `@keyframes ${p}on{from,to{${ON}}}`;
  // the selector of an animated kind: the mask runs' kinds animate the children of their group
  const of = (kind) => `.${p}${kind}${RUN_KINDS.includes(kind) ? ">*" : ""}`;
  /** Intro "loop": kind `cls` (base declarations `base`) steps through `segs` ([s after its delay, declarations]) every period. */
  const looped = (cls, segs, base = OFF) =>
    `@keyframes ${p}${cls}{${segs.map(([s, d], i) => `${i ? `${pct(s)}%` : "0%"}${i === segs.length - 1 ? ",100%" : ""}{${d}}`).join("")}}` +
    `${of(cls)}{${base};animation:${p}${cls} ${P}s step-end infinite}`;
  const windows = (wins) => wins.flatMap(([a, b]) => [[a, ON], [b, OFF]]);

  /**
   * visible(col, row, f), backdrop "window" only: false when the window covers
   * the cell at every instant the field shows frame f, [f, f+1)/fps + k·loopSeconds
   * for every k ≥ 0. `win(i)` → cell i's window { start, len } in s as emitted
   * (len Infinity: open for good, repeating every P under intro "loop"), null
   * when it never closes.
   */
  const visibility = (win) => {
    if (card.backdrop !== "window") return () => true;
    const { fps: F, loopSeconds: LS } = cfg.field;
    const reps = !loop ? 1 : F ? jointLoops(F, LS, P) : 0;
    return (col, row, f) => {
      if (col < c0 || col >= c1 || row < r0 || row >= r1) return true;
      const w = win((row - r0) * NC + col - c0);
      if (!w) return false;
      if (!F || !reps) return true; // a still field shows from t = 0; no joint period: keep the cell
      for (let k = 0; k < reps; k++) {
        const a = f / F + k * LS - EPS, b = (f + 1) / F + k * LS + EPS;
        if (a < w.start) return true;
        const from = loop ? w.start + Math.floor((a - w.start) / P) * P : w.start;
        if (b > from + w.len) return true;
      }
      return false;
    };
  };

  if (!shape || still) {
    // a line reveal or a still card: the backdrop opens whole, at card.delay or from t = 0
    const t0 = still ? 0 : n2(card.delay);
    const open = loop ? P - INTRO.pause : Infinity; // the card's own loop is gone a pause before the next cycle
    if (open <= 0) throw new ConfigError(`${where}.period: must be longer than the ${INTRO.pause} s pause, got ${card.period}`);
    const anim = still ? "" : ` class="${p}o" style="animation-delay:${t0}s"`;
    const fieldMask = card.backdrop === "cut"
      ? `<g${anim} transform="${at}">${knock}</g>`
      : `<rect${anim} x="${num2(box.x)}" y="${num2(box.y)}" width="${num2(box.w)}" height="${num2(box.h)}" fill="#000"${card.backdrop === "dim" ? ` fill-opacity="${DIM}"` : ""}/>`;
    return {
      fieldMask, defs: "",
      css: still ? "" : loop ? looped("o", windows([[0, open]])) : `${ONCE}.${p}o{${OFF};animation:${p}on 1ms linear forwards}`,
      reducedMotion: still ? "" : `.${p}o{animation:none;${ON}}`,
      bodyMask: null, screenMask: null, overlay: "",
      end: t0, arrival: () => t0,
      visible: visibility(() => (still ? null : { start: t0, len: loop ? edge(open) : Infinity })),
    };
  }

  if (!grid.COLS) throw new Error(`renderEmerge: reveal "${card.reveal}" needs a field`); // resolveConfig rejects it
  const off = [c0 * PX - box.x, c1 * PX - box.x - box.w, y0 + r0 * PY - box.y, y0 + r1 * PY - box.y - box.h];
  if (NC <= 0 || r1 <= r0 || off.some((d) => Math.abs(d) > 0.01))
    throw new Error(`renderEmerge: box ${JSON.stringify(box)} is not on the field grid`);
  const fps = INTRO.fps;
  const sec = (n) => n2(n / fps);
  const N = NC * (r1 - r0);

  // --- when along the crossing each cell turns, in arbitrary units, normalised below
  const t0 = card.delay;
  const cardW = box.w - 2 * (content.x - box.x), cardH = box.h - 2 * (content.y - box.y);
  // drops: the first lands on the left square of the card, where its portrait sits; the rest at hashed spots, one after another
  const drops = [{ x: content.x + Math.min(cardW, cardH) / 2, y: content.y + cardH / 2, t: 0 }];
  for (let i = 1; i < (shape.n ?? 0); i++)
    drops.push({ x: box.x + box.w * (0.3 + 0.65 * jitter(i * 31 + 7)), y: box.y + box.h * (0.15 + 0.7 * jitter(i * 57 + 3)), t: (shape.spread * i) / (shape.n - 1) });
  const s = new Float64Array(N);
  for (let r = r0; r < r1; r++)
    for (let c = c0; c < c1; c++) {
      const x = (c + 0.5) * PX, y = y0 + (r + 0.5) * PY, u = (x - box.x) / box.w;
      const i = (r - r0) * NC + c - c0;
      if (card.reveal === "drops") s[i] = Math.min(...drops.map((d) => d.t + Math.hypot(x - d.x, y - d.y) / box.w));
      else {
        const b = brightness(c, r, Math.round((t0 + INTRO.dur * u) * cfg.field.fps)); // the field as the front passes
        s[i] = (1 - shape.follow) * (card.reveal === "wave" ? u : jitter(r * 977 + c * 131)) + shape.follow * (1 - b);
      }
    }
  let sMin = Infinity, sMax = -Infinity;
  for (const v of s) (sMin = Math.min(sMin, v)), (sMax = Math.max(sMax, v));

  // --- ticks: T = the card shows, T − D = the field goes and the crest takes the cell
  const D = Math.max(1, Math.round(shape.lead * fps));
  const T = new Int32Array(N);
  let tMin = Infinity, tMax = -Infinity;
  for (let i = 0; i < N; i++) {
    T[i] = Math.round((t0 + shape.lead + ((s[i] - sMin) / (sMax - sMin || 1)) * INTRO.dur) * fps);
    tMin = Math.min(tMin, T[i]);
    tMax = Math.max(tMax, T[i]);
  }
  const S = tMax - tMin;
  const echo = shape.echo.map(([o, l, lvl]) => [Math.round(o * fps), Math.round(l * fps), lvl]);
  const E = Math.max(0, ...echo.map(([o, l]) => o + l));

  // intro "loop": each cell shows for `hold` ticks, then the same front takes it back;
  // the last cell's field returns a pause before the next cycle
  let hold = 0;
  if (loop) {
    hold = Math.floor((P - INTRO.pause) * fps + 1e-9) - S - 2 * D;
    if (hold - S - E < INTRO.minHold * fps) {
      const need = (2 * S + 2 * D + E) / fps + INTRO.pause + INTRO.minHold;
      throw new ConfigError(`${where}.period: one cycle of this card needs at least ${Math.ceil(need - 1e-9)} s ` +
        `(${n2((S + D + E) / fps)} s to come in, ${n2((S + D) / fps)} s to go, ${INTRO.minHold} s in full view, ` +
        `a ${INTRO.pause} s pause), got ${card.period}`);
    }
  }
  const H = hold / fps, Ds = D / fps, tick = 1 / fps;

  // --- per row, runs of cells turning on the same tick; a tick's runs are one <path>, each run a
  // subpath with the corners its own <rect x y width height> would have: x + width, y + height,
  // back to x, closed by the fill
  const runsAt = new Map(); // tick → path data
  for (let r = r0; r < r1; r++) {
    const y = num2(y0 + r * PY), h = num2(num2(y0 + (r + 1) * PY) - y);
    for (let c = c0, to; c < c1; c = to) {
      const t = T[(r - r0) * NC + c - c0];
      for (to = c + 1; to < c1 && T[(r - r0) * NC + to - c0] === t; to++);
      const x = num2(c * PX);
      runsAt.set(t, `${runsAt.get(t) ?? ""}M${x} ${y}h${num2(num2(to * PX) - x)}v${h}H${x}`);
    }
  }
  const ticks = [...runsAt.keys()].sort((a, b) => a - b);
  // the run kind's class sits on the group and its rule (`.kind>*`) animates each tick's path;
  // crispEdges: two runs meeting mid-pixel would each cover part of it, and the field (or the
  // card, through its mask) would show through the seam
  const runGroup = (fill, kind, shift) => `<g class="${p}${kind}" fill="${fill}" shape-rendering="crispEdges">` +
    `${ticks.map((t) => `<path style="animation-delay:${sec(t + shift)}s" d="${runsAt.get(t)}"/>`).join("")}</g>`;
  const maskOf = (id, kind, shift) => `<mask id="${p}${id}" maskUnits="userSpaceOnUse" x="${num2(box.x)}" y="${num2(box.y)}" ` +
    `width="${num2(box.w)}" height="${num2(box.h)}">${runGroup("#fff", kind, shift)}</mask>`;

  // the avatar's dark screen shows as the field goes, so a cell never shows the page between the two
  const screenMask = card.portrait === "avatar" && card.screen ? `${p}s` : null;
  const defs = maskOf("b", "v", 0) + (screenMask ? maskOf("s", "g", -D) : "");
  const cls = card.backdrop === "dim" ? "d" : card.backdrop === "cut" ? "k" : "g";
  let fieldMask = runGroup("#000", cls, -D);
  if (card.backdrop === "cut") fieldMask += `<g mask="url(#${p}b)"><g transform="${at}">${knock}</g></g>`;

  // --- the kinds of animated element, each one rule: shown ones settle visible under reduced motion
  const shown = ["v", ...(screenMask || cls === "g" ? ["g"] : []), ...(cls === "d" ? ["d"] : [])];
  const hidden = [...(cls === "k" ? ["k"] : []), "c", ...(loop && E ? ["e"] : [])];
  const opaque = `${ON};fill-opacity:1`, dimmed = `${ON};fill-opacity:${DIM}`;
  const rule = loop
    ? {
      g: looped("g", windows([[0, H + 2 * Ds]])), // field gone, screen shown: from the crest in to the crest out
      v: looped("v", windows([[0, H]])), // the card
      d: looped("d", [[0, opaque], [Ds, dimmed], [Ds + H, opaque], [H + 2 * Ds, OFF]], `${OFF};fill-opacity:${DIM}`),
      k: looped("k", windows([[0, Ds], [H + Ds, H + 2 * Ds]])), // field gone under the crest, both ways
      c: looped("c", windows([[0, tick], [H + Ds, H + Ds + tick]])), // a crest frame, in and out
      e: looped("e", windows([[0, tick]])), // an echo frame, in only: on the way out the field is back
    }
    : {
      g: `${of("g")}{${OFF};animation:${p}on 1ms linear forwards}`,
      v: `${of("v")}{${OFF};animation:${p}on 1ms linear forwards}`,
      d: `@keyframes ${p}dm{from{${opaque}}to{${dimmed}}}${of("d")}{${OFF};fill-opacity:${DIM};animation:${p}dm ${n2(Ds)}s step-end forwards}`,
      k: `${of("k")}{${OFF};animation:${p}on ${n2(Ds)}s linear}`,
      c: `${of("c")}{${OFF};animation:${p}on ${n2(tick)}s linear}`,
    };
  const sel = (list, suffix = "") => list.map((k) => of(k) + suffix).join(",");
  const css = [
    ...(loop ? [] : [ONCE]),
    ...[...shown, ...hidden].map((k) => rule[k]),
    `${sel(hidden.filter((k) => k !== "k"), " text")}{font-size:${cfg.field.fontSize}px}`,
  ].join("\n");
  const reducedMotion = `${sel(shown)}{animation:none;${ON}}${sel(hidden)}{animation:none}`;

  // --- crest and echo frames: a ramp glyph per cell in the field's own bands
  const ramp = parseRamp(cfg.field.ramp).slice(1).map((lvl) => lvl[lvl.length - 1]); // levels 1..L, dim → bright
  const L = ramp.length, NB = cfg.field.bands;
  const bandOf = (lv) => Math.ceil(((lv + 1) * NB) / L) - 1; // the field's split of levels 1..L into NB runs
  // a frame's rows → [band, <text> without its class], in paint order: row by row, dim band first
  const textRows = (cells) => {
    const out = [];
    for (let k = 0; k < cells.length;) {
      const r = cells[k].r;
      let e = k;
      while (e < cells.length && cells[e].r === r) e++;
      for (let b = 0; b < NB; b++) {
        let line = "", x0 = -1, col = 0;
        for (let j = k; j < e; j++) {
          const { c, lv } = cells[j];
          if (bandOf(lv) !== b) continue;
          if (x0 < 0) x0 = col = c;
          line += " ".repeat(c - col) + ramp[lv];
          col = c + 1;
        }
        if (x0 >= 0) out.push([b, ` x="${num2(x0 * PX)}" y="${num(y0 + r * PY + PY / 2)}">${esc(line)}</text>`]);
      }
      k = e;
    }
    return out;
  };
  // the frame's <g> carries its most frequent band (ties → the dimmer) and those texts inherit it;
  // the paint order stays, as glyph ink may cross into a neighbouring row
  const frames = [];
  const frame = (k, n, cells) => {
    if (!cells.length) return;
    const texts = textRows(cells);
    const count = new Array(NB).fill(0);
    for (const [b] of texts) count[b]++;
    const base = count.indexOf(Math.max(...count));
    const body = texts.map(([b, t]) => `<text${b === base ? "" : ` class="b${b}"`}${t}`).join("");
    frames.push(`<g class="${p}${k} b${base}" style="animation-delay:${sec(n)}s">${body}</g>`);
  };
  for (let n = tMin - D; n < tMax + E; n++) {
    const crest = [], rings = loop ? [] : crest; // intro "once": one frame holds both
    for (let i = 0; i < N; i++) {
      const r = r0 + Math.floor(i / NC), c = c0 + (i % NC), dt = n - T[i] + D;
      if (dt >= 0 && dt < D) {
        const q = dt / D; // 0 → 1 across the crest
        const lv = card.reveal === "crystal"
          ? Math.floor(jitter(r * 7919 + c * 104729 + Math.round((n / fps) * 1000)) * L * (1 - shape.thin * q)) // hash seeds
          : Math.round((L - 1) * (1 - q));
        crest.push({ r, c, lv });
        continue;
      }
      const ring = echo.find(([o, l]) => n >= T[i] + o && n < T[i] + o + l);
      if (ring) rings.push({ r, c, lv: Math.round((L - 1) * ring[2]) });
    }
    frame("c", n, crest);
    if (loop) frame("e", n, rings);
  }

  return {
    fieldMask, defs, css, reducedMotion,
    bodyMask: `${p}b`, screenMask,
    overlay: frames.join("\n"),
    end: sec(tMax),
    arrival: (x, y) => sec(T[(clamp(Math.floor((y - y0) / PY), r0, r1 - 1) - r0) * NC + clamp(Math.floor(x / PX), c0, c1 - 1) - c0]),
    visible: visibility((i) => ({ start: sec(T[i] - D), len: loop ? edge(H + 2 * Ds) : Infinity })),
  };
}
