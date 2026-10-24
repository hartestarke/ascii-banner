// SVG assembly: embedded font, band fills, flipbook frames, tagline windows,
// knockout mask and every keyframe. All number formatting lives here — the
// output is byte-stable for a given config, so keep the formats as they are.
import { jitter } from "./field.mjs";
import { REVEAL_PRESETS } from "./reveals/index.mjs";

// `>` too: a literal "]]>" is not allowed in XML character data.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
/** One decimal: what the SVG carries for coordinates and font sizes. */
export const num = (v) => (Math.round(v * 10) / 10).toString();
/** Decode offsets: whole tagline columns, and that pitch carries two decimals. */
export const num2 = (v) => +v.toFixed(2);
/** Fewest decimals (1..3) that carry 1/fps exactly, so frame delays stay distinct. */
const delayDecimals = (fps) => [1, 2].find((d) => Number.isInteger(10 ** d / fps)) ?? 3;

const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  return (a) => `rgb(${c} / ${a.toFixed(2)})`;
};

/**
 * Figlet row → runs: solid blocks as bare text, shadow strokes in a dim
 * tspan. Spaces attach to the current run so they never open one of their own.
 */
function runs(row, isShadow) {
  let out = "", plain = "", cur = "", shadow = null;
  const flush = () => {
    if (cur) out += shadow ? `<tspan class="s">${esc(cur)}</tspan>` : esc(cur);
    plain += cur;
    cur = "";
  };
  for (const c of row) {
    const sh = c === " " ? shadow : isShadow(c);
    if (sh !== shadow) {
      if (cur.trim()) flush(); // a spaces-only cur stays as the new run's prefix
      shadow = sh;
    }
    cur += c;
  }
  flush();
  // The mask and the noise use the plain row; the settled line must land on
  // the same cells or the knockout drifts off the letters.
  if (plain !== row) throw new Error(`run split changed row: ${JSON.stringify(row)}`);
  return out;
}

/**
 * Run the configured reveal preset (reveals/index.mjs) over the laid-out
 * taglines. The preset gets one `ctx` object:
 *   cfg     resolved config; o = cfg.reveal.options (merged over the preset's defaults)
 *   layout  layout.mjs layoutTaglines(): TROWS, maxCols, TFONT, TPX, TPY, rowY(i),
 *           SLOT_T, TDUR, NT (reveal ticks = round(seconds × fps)), tickT(k)
 *   figs    figlet rows per tagline, padded to TROWS; pool = scramble glyphs (flattened ramp)
 *   W, H    viewBox size; CUT = tagline.knockout stroke px (0 = no knockout)
 *   esc, num (1 dp), num2 (2 dp), rgb(alpha) → accent rgb(), jitter(i) (the only RNG)
 *   pct(s)        seconds → keyframe percent of TDUR (3 dp, no "%")
 *   runs(row)     two-tone markup of one figlet row (solid text + <tspan class="s">)
 *   left(p)       tagline p's left edge, formatted; wrap(p, body) = <g translate(left)>
 *                 so every tagline's text starts at local x=0
 *   rowText(p, i) / rowKnock(p, i)  settled row i as <text class="tg tx"> / mask
 *                 copy <text class="tg">, "" for a blank row; textRows(p) / knockRows(p) all rows
 *   delays(cls)   `.${cls}${p}{animation-delay:…}` for p ≥ 1 — emit after the
 *                 `animation` shorthands, which reset the delay
 * and returns { defs, css, overlay, knockout, reducedMotionCss: { stop, settle },
 * extraGlyphs }. css is spliced right after the shared `.tx`/`.s` rules (start
 * it with "\n" for a new line); stop = selectors whose animation reduced motion
 * turns off (joined to the field's), settle = rules that show tagline 0 settled.
 */
export function renderReveal(cfg, layout, figs, pool) {
  const { width: W, height: H } = cfg.size;
  const { TPX, TDUR, SLOT_T, rowY } = layout;
  const shadowSet = new Set(cfg.tagline.shadowGlyphs);
  const isShadow = (c) => shadowSet.has(c);
  const left = (p) => num((W - figs[p][0].length * TPX) / 2);
  const rowText = (p, i) => {
    const row = figs[p][i].trimEnd();
    return row ? `<text class="tg tx" y="${num(rowY(i))}">${runs(row, isShadow)}</text>` : "";
  };
  const rowKnock = (p, i) => {
    const row = figs[p][i].trimEnd();
    return row ? `<text class="tg" y="${num(rowY(i))}">${esc(row)}</text>` : "";
  };
  const ctx = {
    cfg, o: cfg.reveal.options, layout, figs, pool, W, H, CUT: cfg.tagline.knockout,
    esc, num, num2, rgb: rgbOf(cfg.accent), jitter,
    pct: (s) => ((s / TDUR) * 100).toFixed(3),
    runs: (row) => runs(row, isShadow),
    left,
    wrap: (p, body) => `<g transform="translate(${left(p)})">${body}</g>`,
    rowText, rowKnock,
    textRows: (p) => figs[p].map((_, i) => rowText(p, i)).join(""),
    knockRows: (p) => figs[p].map((_, i) => rowKnock(p, i)).join(""),
    delays: (cls) => figs.slice(1).map((_, i) => `.${cls}${i + 1}{animation-delay:${num2((i + 1) * SLOT_T)}s}`).join(""),
  };
  return REVEAL_PRESETS[cfg.reveal.preset].render(ctx);
}

/**
 * @param cfg    resolved config
 * @param g      field grid (field.mjs fieldGrid)
 * @param field  baked field (field.mjs bakeField)
 * @param layout tagline layout (layout.mjs layoutTaglines)
 * @param reveal rendered reveal (renderReveal)
 * @param fontB64 base64 woff2
 */
export function renderSvg(cfg, g, field, layout, reveal, fontB64) {
  const { width: W, height: H } = cfg.size;
  const ACCENT = cfg.accent;
  const TAGLINES = cfg.taglines;
  const { fontSize: FONT, fps: FPS, loopSeconds: DUR, alpha: ALPHA } = cfg.field;
  const { shadowAlpha: SHADOW_A, knockout: CUT } = cfg.tagline;
  const { PY, NF, STILL, y0 } = g;
  const { TFONT } = layout;
  const rgb = rgbOf(ACCENT);

  // ---- field frames ----
  // Attribute bytes repeat per text node (thousands of them), so every one is
  // trimmed: x defaults to 0, xml:space is inherited from the root svg, and y
  // keeps its decimal only when the grid doesn't land on a whole pixel.
  const DELAY_DP = delayDecimals(FPS);
  // Each row is written in whichever of two encodings is shorter; both put
  // every glyph on exactly the same pixels. Nothing carries x: glyphs keep
  // their grid column by advancing through the row's spaces (white-space:pre).
  //  - per band: one <text> per band present, other cells as spaces. Cheap
  //    for dense rows whose bands alternate every few cells.
  //  - runs: one <text> classed as the row's most frequent band, every glyph
  //    run in a <tspan> (bare for that band, classed for the others); a blank
  //    run between two cells of one band stays inside the run, other blanks sit
  //    between runs, the row's leading blanks open the first run. Cheap for
  //    sparse rows. No glyph may sit in the bare <text> here: Firefox places
  //    each character relative to the row's first one by CSS frame offsets,
  //    and a frame inside a tspan sits an app unit off one directly in <text>,
  //    which flips the glyph's pixel snap. First character and all glyphs at
  //    the same depth = zero offset.
  const perBand = (y, chars, bands) =>
    field.bands.map((_, b) => {
      const s = chars.map((c, i) => (bands[i] === b ? c : " ")).join("").trimEnd();
      return s ? `<text class="b${b}" y="${y}">${esc(s)}</text>` : "";
    }).join("");
  const rowRuns = (y, chars, bands) => {
    const count = field.bands.map(() => 0);
    for (const b of bands) if (b >= 0) count[b]++;
    const base = count.indexOf(Math.max(...count)); // ties → the dimmer band
    const open = (b) => (b === base ? "<tspan>" : `<tspan class="b${b}">`);
    let body = "", run = -1, gap = "";
    chars.forEach((c, i) => {
      const b = bands[i];
      if (b < 0) return void (gap += c);
      if (b === run) body += gap;
      else body += run < 0 ? open(b) + gap : `</tspan>${gap}${open(b)}`;
      run = b;
      gap = "";
      body += esc(c);
    });
    return `<text class="b${base}" y="${y}">${body}</tspan></text>`;
  };
  // Both encodings carry each glyph once, so string length ranks UTF-8 bytes too.
  const rowText = ({ row, chars, bands }) => {
    const y = num(y0 + row * PY + PY / 2);
    const a = perBand(y, chars, bands), b = rowRuns(y, chars, bands);
    return a.length <= b.length ? a : b;
  };
  const frames = field.frames.map((rows, f) => {
    const body = rows.map(rowText).join("");
    return `<g class="f${f === STILL ? " f-still" : ""}" style="animation-delay:${(f / FPS).toFixed(DELAY_DP)}s">${body}</g>`;
  });
  const bandFills = field.bands.map((b, i) => `.b${i}{fill:${rgb(ALPHA.lo + (ALPHA.hi - ALPHA.lo) * b.a)}}`).join("");

  const LABEL = escAttr(TAGLINES[0] ?? "ASCII field");
  // Knockout: a mask clears the field around the letters (CUT px of stroke
  // dilation), which keeps the tagline legible on any page colour and over the
  // field's hot zones. The reveal preset draws its content and makes it follow
  // the reveal — opened up front, the letter-shaped hole would give the line away.
  const mask = reveal.knockout
    ? `<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${reveal.knockout}</mask>`
    : "";
  // Timelines: the field flips on DUR; the preset's tagline animations run on
  // the tagline loop with per-slot delays (see reveals/).
  const rm = reveal.reducedMotionCss;
  // No background: GitHub's <picture>/prefers-color-scheme follows the OS, not
  // the GitHub theme, so a transparent banner in theme-neutral accent alphas
  // blends with every theme instead. The embedded font has its layout tables
  // stripped and ligatures are off, so `//` `||` `??` runs never ligate.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:space="preserve" role="img" aria-label="${LABEL}">
<title>${LABEL}</title>
<style>
@font-face{font-family:B;src:url(data:font/woff2;base64,${fontB64}) format('woff2')}
text{font-family:B,monospace;text-rendering:optimizeSpeed;font-variant-ligatures:none;white-space:pre;dominant-baseline:central}
.f text{font-size:${FONT}px}
${bandFills}
.f{visibility:hidden;animation:k ${DUR}s step-end infinite}
@keyframes k{0%{visibility:visible}${(100 / NF).toFixed(3)}%{visibility:hidden}100%{visibility:hidden}}
.tg{font-size:${TFONT}px}
.tx{fill:${ACCENT}}.s{fill:${rgb(SHADOW_A)}}${reveal.css}
mask text{fill:#000;stroke:#000;stroke-width:${CUT};stroke-linejoin:round}
@media (prefers-reduced-motion:reduce){${[".f", ...rm.stop].join(",")}{animation:none}.f-still{visibility:visible}${rm.settle}}
</style>
<defs>${reveal.defs}${mask}</defs>
<g${mask ? ' mask="url(#cut)"' : ""}>
${frames.join("\n")}
</g>
${reveal.overlay}
</svg>
`;
}
