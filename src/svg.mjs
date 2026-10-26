// SVG assembly: embedded font, band fills, field frames, knockout mask, the
// reveal's markup and every keyframe. All number formatting lives here and the
// output is byte-stable for a given config, so keep the formats as they are.
import { NO_FIELD } from "./config.mjs";
import { jitter } from "./field.mjs";
import { REVEAL_PRESETS } from "./reveals/index.mjs";

// `>` too: a literal "]]>" is not allowed in XML character data.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
/** One decimal: what the SVG carries for coordinates and font sizes. */
export const num = (v) => (Math.round(v * 10) / 10).toString();
/** Two decimals: tagline offsets are whole columns, and the column pitch needs two. */
export const num2 = (v) => +v.toFixed(2);
/** Fewest decimals that carry 1/fps exactly, else 3, which keeps frame delays distinct below 1000 fps. */
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
 * Renders the configured reveal preset (reveals/index.mjs). Its ctx:
 *   cfg, o          resolved config; o = cfg.reveal.options over the preset's defaults
 *   layout          layoutTaglines(): TROWS, maxCols, TFONT, TPX, TPY, rowY(i),
 *                   SLOT_T, TDUR, NT (= round(seconds × fps) ticks), tickT(k)
 *   figs, pool      figlet rows per tagline, padded to TROWS; noise glyphs (reveal.pool, flattened)
 *   spans           spans[p][i]: column span [a, b) of tagline p's i-th character (figletLaid())
 *   W, H, CUT       viewBox size; knockout stroke px, 0 = no knockout (always 0 with no field)
 *   esc, num, num2  XML text escape; 1 and 2 decimal numbers
 *   rgb(a), jitter  tagline.color at alpha a; jitter(i) in [0, 1), the only RNG
 *   pct(s)          seconds → keyframe percent of TDUR (3 decimals, no "%")
 *   runs(row)       two-tone markup of a figlet row (bare text + <tspan class="s">)
 *   left(p), wrap(p, body)          tagline p's left edge; body in a <g> moved there, so text starts at x=0
 *   rowText(p, i), rowKnock(p, i)   settled row as <text class="tg tx"> / its mask copy, "" if blank
 *   textRows(p), knockRows(p)       every row of tagline p
 *   delays(cls)     `.${cls}${p}{animation-delay:…}` for p ≥ 1; goes after the
 *                   `animation` shorthands, which reset the delay
 * The preset returns { defs, css, overlay, knockout, reducedMotionCss: { stop,
 * settle }, extraGlyphs }. css follows the shared `.tx`/`.s` rules (start it with
 * "\n" for a new line); stop = selectors whose animation reduced motion turns off,
 * settle = rules that show tagline 0 settled; extraGlyphs = characters the
 * reveal draws beyond the taglines, pool noise included, which the build
 * checks against the embedded font.
 */
export function renderReveal(cfg, layout, figs, pool, spans) {
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
    cfg, o: cfg.reveal.options, layout, figs, spans, pool, W, H,
    CUT: cfg.field.preset === NO_FIELD ? 0 : cfg.tagline.knockout, // nothing to cut without a field
    esc, num, num2, rgb: rgbOf(cfg.tagline.color), jitter,
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
 * The banner document: field frames under the knockout mask, the reveal's
 * overlay on top. NO_FIELD leaves out the field and its mask; fps 0 leaves out
 * the flipbook animation, so with a static reveal no CSS animation is left.
 */
export function renderSvg(cfg, grid, field, layout, reveal, fontB64) {
  const { width: W, height: H } = cfg.size;
  const { fontSize: FONT, fps: FPS, loopSeconds: DUR, alpha: ALPHA, colors: COLORS, gradient: GRADIENT } = cfg.field;
  const { shadowAlpha: SHADOW_A, knockout: CUT, color: TCOLOR, shadowColor: SCOLOR } = cfg.tagline;
  const { PY, NF, STILL, y0 } = grid;
  const { TFONT } = layout;
  const hasField = cfg.field.preset !== NO_FIELD;
  const flips = hasField && FPS > 0;

  // Attributes repeat on thousands of text nodes, so each is trimmed: x
  // defaults to 0, xml:space comes from the root, y drops its decimal on whole pixels.
  const DELAY_DP = delayDecimals(FPS);
  // Each row takes the shorter of two encodings, both glyph-exact and x-free
  // (white-space:pre advances through the spaces): one <text> per band, or tspan
  // runs in one <text>. The runs keep no glyph in the bare <text>: Firefox places
  // a glyph in a tspan 1/60 px off one directly in <text>, flipping its pixel snap.
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
  const fieldRow = ({ row, chars, bands }) => {
    const y = num(y0 + row * PY + PY / 2);
    const a = perBand(y, chars, bands), b = rowRuns(y, chars, bands);
    return a.length <= b.length ? a : b;
  };
  const frames = field.frames.map((rows, f) => {
    const body = rows.map(fieldRow).join("");
    return flips
      ? `<g class="f${f === STILL ? " f-still" : ""}" style="animation-delay:${(f / FPS).toFixed(DELAY_DP)}s">${body}</g>`
      : `<g class="f">${body}</g>`;
  });
  const bandAlpha = (b) => ALPHA.lo + (ALPHA.hi - ALPHA.lo) * b.a;
  // userSpaceOnUse: one gradient across the banner, not one per <text> box.
  const gradient = hasField && GRADIENT
    ? `<linearGradient id="fg" gradientUnits="userSpaceOnUse" x1="0" x2="${W}">${GRADIENT.map(
        (c, i) => `<stop offset="${+(i / (GRADIENT.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join("")}</linearGradient>`
    : "";
  const bandFills = field.bands.map((b, i) => GRADIENT
    ? `.b${i}{fill:url(#fg);fill-opacity:${bandAlpha(b).toFixed(2)}}`
    : `.b${i}{fill:${rgbOf(COLORS[Math.min(i, COLORS.length - 1)])(bandAlpha(b))}}`).join("");

  const LABEL = escAttr(cfg.taglines[0] ?? "ASCII field");
  // Knockout: the mask clears the field around the letters (CUT px of stroke),
  // which keeps the tagline legible on any page colour and over the field's hot
  // zones. The preset draws it so the hole follows the reveal: opened up front,
  // the letter-shaped hole would give the line away.
  const mask = reveal.knockout
    ? `<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${reveal.knockout}</mask>`
    : "";
  const rm = reveal.reducedMotionCss;
  const stop = [...(flips ? [".f"] : []), ...rm.stop];
  const reduced = (stop.length ? `${stop.join(",")}{animation:none}` : "") +
    (flips ? ".f-still{visibility:visible}" : "") + rm.settle;
  const style = [
    `@font-face{font-family:B;src:url(data:font/woff2;base64,${fontB64}) format('woff2')}`,
    "text{font-family:B,monospace;text-rendering:optimizeSpeed;font-variant-ligatures:none;white-space:pre;dominant-baseline:central}",
    ...(hasField ? [`.f text{font-size:${FONT}px}`, bandFills] : []),
    ...(flips ? [
      `.f{visibility:hidden;animation:k ${DUR}s step-end infinite}`,
      `@keyframes k{0%{visibility:visible}${(100 / NF).toFixed(3)}%{visibility:hidden}100%{visibility:hidden}}`,
    ] : []),
    `.tg{font-size:${TFONT}px}`,
    `.tx{fill:${TCOLOR}}.s{fill:${rgbOf(SCOLOR)(SHADOW_A)}}${reveal.css}`,
    ...(hasField ? [`mask text{fill:#000;stroke:#000;stroke-width:${CUT};stroke-linejoin:round}`] : []),
    ...(reduced ? [`@media (prefers-reduced-motion:reduce){${reduced}}`] : []),
  ];
  const fieldGroup = hasField ? `<g${mask ? ' mask="url(#cut)"' : ""}>\n${frames.join("\n")}\n</g>\n` : "";
  // No background: GitHub's <picture>/prefers-color-scheme follows the OS, not
  // the GitHub theme, so a transparent banner in theme-neutral accent alphas
  // blends with every theme instead. The embedded font has its layout tables
  // stripped and ligatures are off, so `//` `||` `??` runs never ligate.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xml:space="preserve" role="img" aria-label="${LABEL}">
<title>${LABEL}</title>
<style>
${style.join("\n")}
</style>
<defs>${gradient}${reveal.defs}${mask}</defs>
${fieldGroup}${reveal.overlay}
</svg>
`;
}
