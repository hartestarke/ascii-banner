// Scramble: each line decodes left to right behind a torn front. Every figlet
// row has its own clip windows, stepping in whole columns along a shared uneven
// pace plus a bounded per-row wander, and a band of cycling ramp glyphs (`lead`
// columns wide) runs ahead of the settled text.
//
// The class and id names carry no prefix and are part of the default banner's
// bytes: r#/q# windows, d# delays, e/ei reduced-motion pins, st/nz noise strip,
// clips s/n#/m#, keyframes r#/q#/nk.
import { animate, noiseRow, shuffle, slideKeyframes } from "./common.mjs";

export default {
  defaults: {
    noiseFrames: 6,
    lead: 16, // columns
    leadVar: 0.35,
    rag: 3, // columns
    ragTicks: 3,
    burst: 0.85, // pace jitter, 0..1
    noiseAlpha: 0.65,
  },

  validate(o, v) {
    v.posInt("noiseFrames");
    v.positive("lead");
    v.check(o.leadVar >= 0 && o.leadVar < 1, "leadVar", `must be within [0, 1), got ${o.leadVar}`);
    v.nonNeg("rag");
    v.posInt("ragTicks");
    v.unit("burst");
    v.unit("noiseAlpha");
  },

  render(ctx) {
    const { o, cfg, layout, figs, pool, H, CUT, esc, num, num2, rgb, jitter, runs, wrap, delays } = ctx;
    const { TROWS, maxCols, TFONT, TPX, TPY, rowY, TDUR, NT } = layout;

    // Geometry in whole tagline columns, so a window never slices a glyph.
    // Every tagline starts at local x=0 (wrap), so one set of keyframes serves
    // all lines: a front travels TRAVEL columns, from START_COLS left of the
    // text (band and knockout margin still clear of the letters) to the widest
    // line's right edge. Shorter lines finish sooner at the same pace.
    const leads = Array.from({ length: TROWS }, (_, i) => Math.max(1, Math.round(o.lead * (1 + o.leadVar * (2 * jitter(i * 61 + 7) - 1)))));
    const START_COLS = Math.max(0, ...leads) + 2; // +1 column of knockout margin, +1 for its stroke
    const TRAVEL = START_COLS + maxCols;
    const START = START_COLS * TPX;
    const END = TRAVEL * TPX;
    const FAR = START + END; // left reach of the open-ended clips: covers the text at full travel

    // Mean front: uneven pace, over-travelling by `rag` at both ends so every row
    // starts hidden and lands on its own tick instead of snapping on the last one.
    const pace = Array.from({ length: NT }, (_, k) => 1 + o.burst * (2 * jitter(k * 53 + 11) - 1));
    const total = pace.reduce((a, b) => a + b, 0);
    let acc = 0;
    const meanFront = [-o.rag, ...pace.map((v) => -o.rag + ((acc += v) / total) * (TRAVEL + 2 * o.rag))];
    // Row front per tick: the mean plus a wander interpolated between random
    // knots, clamped to the travel; a row only ever advances.
    const rowFront = (pattern) => {
      const knot = (j) => 2 * jitter(pattern * 4099 + j * 61 + 3) - 1;
      const out = [0];
      for (let k = 1; k <= NT; k++) {
        const j = Math.floor(k / o.ragTicks);
        const u = (k % o.ragTicks) / o.ragTicks;
        const wander = o.rag * (knot(j) * (1 - u) + knot(j + 1) * u);
        out.push(Math.min(TRAVEL, Math.max(out[k - 1], Math.round(meanFront[k] + wander))));
      }
      return out;
    };
    const fronts = Array.from({ length: TROWS }, (_, i) => rowFront(i));

    // Noise frames sit in a vertical strip that steps behind the row's band
    // clip: one animation per row instead of one per frame. Two row pitches
    // keep the neighbouring frames' glyphs clear of the band.
    const STRIP = Math.ceil(2 * TPY);
    const BAND = 1.5 * TFONT; // band clip height; █ spans -0.3..1.02em, i.e. 1.32em
    const tx = (x) => (x ? `transform:translateX(${num2(x)}px)` : "transform:none");

    const overlay = [];
    const cuts = [];
    figs.forEach((rows, p) => {
      // Each tagline reshuffles which front its rows ride, so the tear doesn't
      // repeat line after line, at no cost in keyframes.
      const pattern = shuffle(TROWS, (i) => jitter(p * 101 + i * 7 + 29));
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
        for (let k = 0; k < o.noiseFrames; k++) {
          const noise = noiseRow(row, pool, (c) => jitter(p * 7919 + k * 131 + i * 977 + c * 31 + 5));
          strip += `<text class="tg nz" y="${num(rowY(i) + k * STRIP)}">${esc(noise)}</text>`;
        }
        lines.push(
          win(i, `n${i}`, `<g class="st">${strip}</g>`) +
          win(i, "s", `<text class="tg tx" y="${num(rowY(i))}">${runs(row)}</text>`),
        );
        cutLines.push(win(i, `m${i}`, `<text class="tg" y="${num(rowY(i))}">${esc(row)}</text>`));
      });
      overlay.push(wrap(p, lines.join("")));
      if (CUT > 0) cuts.push(wrap(p, cutLines.join("")));
    });
    // Clip rects live in the sliding group's space, offset so that zero travel
    // hides everything: settled text shows left of the front, the noise in a
    // band of the row's lead right of it, the knockout up to a column past the band.
    const rect = (x, w, y = 0, h = H) => `<rect x="${num2(x)}"${y ? ` y="${num2(y)}"` : ""} width="${num2(w)}" height="${num2(h)}"/>`;
    const clips = !figs.length ? "" :
      `<clipPath id="s">${rect(-FAR, FAR - START)}</clipPath>` +
      leads.map((lead, i) =>
        `<clipPath id="n${i}">${rect(-START, lead * TPX, rowY(i) - BAND / 2, BAND)}</clipPath>` +
        (CUT > 0 ? `<clipPath id="m${i}">${rect(-FAR, FAR - START + (lead + 1) * TPX)}</clipPath>` : ""),
      ).join("");

    // Decode, hold to the slot's end, snap back to hidden.
    const frontCss = fronts.map((steps, i) =>
      animate(`r${i}`, TDUR) + animate(`q${i}`, TDUR) +
      slideKeyframes(ctx, `r${i}`, (k) => tx(steps[k] * TPX), "transform:none") +
      slideKeyframes(ctx, `q${i}`, (k) => tx(-steps[k] * TPX), "transform:none"),
    ).join("\n");
    return {
      defs: clips,
      css:
        `.nz{fill:${rgb(o.noiseAlpha)}}\n${frontCss}\n${delays("d")}\n` +
        `.st{animation:nk ${num2(o.noiseFrames / cfg.reveal.fps)}s steps(${o.noiseFrames}) infinite}\n` +
        `@keyframes nk{to{transform:translateY(${-o.noiseFrames * STRIP}px)}}`,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: {
        stop: ["g[clip-path]", "g[clip-path]>g", ".st"],
        settle: `.e{transform:translateX(${num2(END)}px)}.ei{transform:translateX(${num2(-END)}px)}`,
      },
      extraGlyphs: "",
    };
  },
};
