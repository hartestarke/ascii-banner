// SVG assembly: embedded font, band fills, flipbook frames, tagline windows,
// knockout mask and every keyframe. All number formatting lives here — the
// output is byte-stable for a given config, so keep the formats as they are.

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
 * @param cfg   resolved config
 * @param g     field grid (field.mjs fieldGrid)
 * @param field baked field (field.mjs bakeField)
 * @param figs  figlet rows per tagline
 * @param plan  decode plan (decode.mjs planDecode)
 * @param fontB64 base64 woff2
 */
export function renderSvg(cfg, g, field, figs, plan, fontB64) {
  const { width: W, height: H } = cfg.size;
  const ACCENT = cfg.accent;
  const TAGLINES = cfg.taglines;
  const { fontSize: FONT, fps: FPS, loopSeconds: DUR, alpha: ALPHA } = cfg.field;
  const { shadowAlpha: SHADOW_A, knockout: CUT } = cfg.tagline;
  const { noiseAlpha: NOISE_A, noiseFrames: NOISE_FRAMES, fps: TFPS } = cfg.decode;
  const { PY, NF, STILL, y0 } = g;
  const { TFONT, TPX, rowY, SLOT_T, TDUR, NT, tickT, leads, START, END, FAR, fronts, patterns, noise, STRIP, BAND } = plan;
  const rgb = rgbOf(ACCENT);
  const shadowSet = new Set(cfg.tagline.shadowGlyphs);
  const isShadow = (c) => shadowSet.has(c);
  const pct = (s) => ((s / TDUR) * 100).toFixed(3);

  // ---- field frames ----
  // Attribute bytes repeat per text node (thousands of them), so every one is
  // trimmed: x defaults to 0, xml:space is inherited from the root svg, and y
  // keeps its decimal only when the grid doesn't land on a whole pixel.
  const DELAY_DP = delayDecimals(FPS);
  const frames = field.frames.map((rows, f) => {
    const body = rows.map(({ row, band, text }) => `<text class="b${band}" y="${num(y0 + row * PY + PY / 2)}">${esc(text)}</text>`).join("");
    return `<g class="f${f === STILL ? " f-still" : ""}" style="animation-delay:${(f / FPS).toFixed(DELAY_DP)}s">${body}</g>`;
  });
  const L = field.ramp.length - 1;
  const bandFills = field.bands.map((b, i) => `.b${i}{fill:${rgb(ALPHA.lo + (ALPHA.hi - ALPHA.lo) * (b.rep / L))}}`).join("");

  // ---- tagline overlay ----
  // Keyframes hold (step-end) between stops, so ticks where the row stalls need
  // none: decode, hold to the slot's end, snap back to hidden.
  const frontKeyframes = (name, steps, sign) => {
    let css = `@keyframes ${name}{0%{transform:none}`;
    for (let k = 1; k <= NT; k++)
      if (steps[k] !== steps[k - 1]) css += `${pct(tickT(k))}%{transform:translateX(${num2(sign * steps[k] * TPX)}px)}`;
    return `${css}${pct(SLOT_T)}%{transform:none}100%{transform:none}}`;
  };

  const overlay = [];
  const cuts = [];
  figs.forEach((rows, p) => {
    const wrap = (body) => `<g transform="translate(${num((W - rows[0].length * TPX) / 2)})">${body}</g>`;
    const pattern = patterns[p];
    // Clip window: the clipped group slides (Firefox ignores transforms on the
    // clipPath's own children), the inner group counter-slides the glyphs.
    // d<p> delays the pair to the tagline's slot; e/ei pin the first tagline
    // open under prefers-reduced-motion.
    const win = (i, clip, body) =>
      `<g class="r${pattern[i]}${p ? ` d${p}` : " e"}" clip-path="url(#${clip})">` +
      `<g class="q${pattern[i]}${p ? ` d${p}` : " ei"}">${body}</g></g>`;
    const lines = [];
    const cutLines = [];
    rows.forEach((r, i) => {
      const row = r.trimEnd();
      if (!row) return;
      let strip = "";
      for (let k = 0; k < NOISE_FRAMES; k++)
        strip += `<text class="tg nz" y="${num(rowY(i) + k * STRIP)}">${esc(noise(p, i, k, row))}</text>`;
      lines.push(
        win(i, `n${i}`, `<g class="st">${strip}</g>`) +
        win(i, "s", `<text class="tg tx" y="${num(rowY(i))}">${runs(row, isShadow)}</text>`),
      );
      cutLines.push(win(i, `m${i}`, `<text class="tg" y="${num(rowY(i))}">${esc(row)}</text>`));
    });
    overlay.push(wrap(lines.join("")));
    if (CUT > 0) cuts.push(wrap(cutLines.join("")));
  });
  // Clip rects live in the sliding group's space, offset so that zero travel
  // hides everything: settled text shows left of the front, the scramble in a
  // band of the row's lead right of it, the knockout up to a column past the band.
  const rect = (x, w, y = 0, h = H) => `<rect x="${num2(x)}"${y ? ` y="${num2(y)}"` : ""} width="${num2(w)}" height="${num2(h)}"/>`;
  const clips = !TAGLINES.length ? "" :
    `<clipPath id="s">${rect(-FAR, FAR - START)}</clipPath>` +
    leads.map((lead, i) =>
      `<clipPath id="n${i}">${rect(-START, lead * TPX, rowY(i) - BAND / 2, BAND)}</clipPath>` +
      (CUT > 0 ? `<clipPath id="m${i}">${rect(-FAR, FAR - START + (lead + 1) * TPX)}</clipPath>` : ""),
    ).join("");

  const LABEL = escAttr(TAGLINES[0] ?? "ASCII field");
  // Knockout: a mask clears the field around the letters (CUT px of stroke
  // dilation), which keeps the tagline legible on any page colour and over the
  // field's hot zones. It opens with the scramble front — opened up front, the
  // letter-shaped hole would give the line away before it decodes.
  const mask = cuts.length
    ? `<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${cuts.join("")}</mask>`
    : "";
  // Timelines: the field flips on DUR; every tagline window runs its row's front
  // keyframes on TDUR with its slot's delay — no visibility toggles, so nested
  // groups can't leak through a hidden parent. The d<p> rules must follow the
  // r/q ones: the `animation` shorthand resets the delay.
  const frontCss = fronts.map((steps, i) =>
    `.r${i}{animation:r${i} ${TDUR}s step-end infinite}.q${i}{animation:q${i} ${TDUR}s step-end infinite}` +
    frontKeyframes(`r${i}`, steps, 1) + frontKeyframes(`q${i}`, steps, -1),
  ).join("\n");
  const delayCss = TAGLINES.slice(1).map((_, i) => `.d${i + 1}{animation-delay:${num2((i + 1) * SLOT_T)}s}`).join("");
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
.tx{fill:${ACCENT}}.s{fill:${rgb(SHADOW_A)}}.nz{fill:${rgb(NOISE_A)}}
${frontCss}
${delayCss}
.st{animation:nk ${num2(NOISE_FRAMES / TFPS)}s steps(${NOISE_FRAMES}) infinite}
@keyframes nk{to{transform:translateY(${-NOISE_FRAMES * STRIP}px)}}
mask text{fill:#000;stroke:#000;stroke-width:${CUT};stroke-linejoin:round}
@media (prefers-reduced-motion:reduce){.f,g[clip-path],g[clip-path]>g,.st{animation:none}.f-still{visibility:visible}.e{transform:translateX(${num2(END)}px)}.ei{transform:translateX(${num2(-END)}px)}}
</style>
<defs>${clips}${mask}</defs>
<g${mask ? ' mask="url(#cut)"' : ""}>
${frames.join("\n")}
</g>
${overlay.join("\n")}
</svg>
`;
}
