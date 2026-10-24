// Scramble: the original torn-front decode. Each line decodes left to right
// behind a torn front: every figlet row has its own clip windows, stepping in
// whole columns along a shared uneven pace plus a bounded per-row wander. A
// band of cycling ramp glyphs (`lead` columns) runs ahead of the settled text,
// so the scramble itself sweeps in rather than standing there as a placeholder.
//
// Class/id names predate the preset registry and stay unprefixed, so the
// default banner keeps its bytes: r#/q# windows, d# delays, e/ei reduced-motion
// pins, st/nz noise strip, clips s/n#/m#, keyframes r#/q#/nk.

export default {
  defaults: {
    noiseFrames: 6, // distinct scramble frames cycled during the reveal
    lead: 16, // tagline columns of scramble running ahead of the settled text
    leadVar: 0.35, // per-row spread of lead, as a fraction of it
    rag: 3, // columns a row's front may stray either side of the mean front
    ragTicks: 3, // reveal ticks between a row's wander knots; lower = twitchier
    burst: 0.85, // pace jitter of the mean front: 0 = even, 1 = from a stall to a double step
    noiseAlpha: 0.65, // alpha of not-yet-decoded glyphs
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
    const { o, layout, figs, pool, H, CUT, esc, num, num2, pct, rgb, runs, jitter, wrap, delays } = ctx;
    const { TROWS, maxCols, TFONT, TPX, TPY, rowY, SLOT_T, NT, tickT } = layout;
    const { lead: LEAD, leadVar: LEAD_VAR, rag: RAG, ragTicks: RAG_TICKS, burst: BURST } = o;
    const { noiseAlpha: NOISE_A, noiseFrames: NOISE_FRAMES } = o;
    const TFPS = ctx.cfg.reveal.fps;

    // Decode geometry, in whole tagline columns so a window never slices a glyph.
    // Each tagline sits in a wrapper translated to its own left edge, so text
    // starts at local x=0 and one set of keyframes serves every line: a front
    // travels TRAVEL columns from START_COLS left of the text (scramble band and
    // knockout margin still off the letters) to the widest line's right edge.
    // Shorter lines simply finish sooner — the pace per column is constant.
    const leads = Array.from({ length: TROWS }, (_, i) => Math.max(1, Math.round(LEAD * (1 + LEAD_VAR * (2 * jitter(i * 61 + 7) - 1)))));
    const START_COLS = Math.max(0, ...leads) + 2; // +1 column of knockout margin, +1 for its stroke
    const TRAVEL = START_COLS + maxCols;
    const START = START_COLS * TPX;
    const END = TRAVEL * TPX;
    const FAR = START + END; // left reach of the open-ended clips: covers the text at full travel

    // Mean front: uneven pace, over-travelling by RAG at both ends so every row
    // starts hidden and lands on its own tick instead of snapping on the last one.
    const meanFront = (() => {
      const pace = Array.from({ length: NT }, (_, k) => 1 + BURST * (2 * jitter(k * 53 + 11) - 1));
      const total = pace.reduce((a, b) => a + b, 0);
      let acc = 0;
      return [-RAG, ...pace.map((v) => -RAG + ((acc += v) / total) * (TRAVEL + 2 * RAG))];
    })();
    // Row front per tick: the mean plus a wander interpolated between random
    // knots, clamped to the travel; a row only ever advances.
    const rowFront = (pattern) => {
      const knot = (j) => 2 * jitter(pattern * 4099 + j * 61 + 3) - 1;
      const out = [0];
      for (let k = 1; k <= NT; k++) {
        const j = Math.floor(k / RAG_TICKS);
        const u = (k % RAG_TICKS) / RAG_TICKS;
        const wander = RAG * (knot(j) * (1 - u) + knot(j + 1) * u);
        out.push(Math.min(TRAVEL, Math.max(out[k - 1], Math.round(meanFront[k] + wander))));
      }
      return out;
    };
    const fronts = Array.from({ length: TROWS }, (_, i) => rowFront(i));

    // Which front pattern each row rides is reshuffled per tagline, so the tear
    // doesn't repeat line after line at no cost in keyframes.
    const shuffled = (n, seed) => {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(jitter(seed * 101 + i * 7 + 29) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const patterns = figs.map((_, p) => shuffled(TROWS, p));

    // Scramble frame k of tagline p, row i: ramp glyphs where the row has ink.
    const noise = (p, i, k, row) => {
      let s = "";
      for (let c = 0; c < row.length; c++)
        s += row[c] === " " ? " " : pool[Math.floor(jitter(p * 7919 + k * 131 + i * 977 + c * 31 + 5) * pool.length)];
      return s;
    };
    // Scramble frames sit in a vertical strip that steps behind the row's band
    // clip: one animation per row instead of one per frame. Two row pitches
    // keep the neighbouring frames' glyphs clear of the band.
    const STRIP = Math.ceil(2 * TPY);
    const BAND = 1.5 * TFONT; // band clip height; the em box spans 1.32em

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
          win(i, "s", `<text class="tg tx" y="${num(rowY(i))}">${runs(row)}</text>`),
        );
        cutLines.push(win(i, `m${i}`, `<text class="tg" y="${num(rowY(i))}">${esc(row)}</text>`));
      });
      overlay.push(wrap(p, lines.join("")));
      if (CUT > 0) cuts.push(wrap(p, cutLines.join("")));
    });
    // Clip rects live in the sliding group's space, offset so that zero travel
    // hides everything: settled text shows left of the front, the scramble in a
    // band of the row's lead right of it, the knockout up to a column past the band.
    const rect = (x, w, y = 0, h = H) => `<rect x="${num2(x)}"${y ? ` y="${num2(y)}"` : ""} width="${num2(w)}" height="${num2(h)}"/>`;
    const clips = !figs.length ? "" :
      `<clipPath id="s">${rect(-FAR, FAR - START)}</clipPath>` +
      leads.map((lead, i) =>
        `<clipPath id="n${i}">${rect(-START, lead * TPX, rowY(i) - BAND / 2, BAND)}</clipPath>` +
        (CUT > 0 ? `<clipPath id="m${i}">${rect(-FAR, FAR - START + (lead + 1) * TPX)}</clipPath>` : ""),
      ).join("");

    // Timelines: every tagline window runs its row's front keyframes on TDUR
    // with its slot's delay — no visibility toggles, so nested groups can't
    // leak through a hidden parent. The d<p> rules must follow the r/q ones:
    // the `animation` shorthand resets the delay.
    const TDUR = +layout.TDUR.toFixed(2);
    const frontCss = fronts.map((steps, i) =>
      `.r${i}{animation:r${i} ${TDUR}s step-end infinite}.q${i}{animation:q${i} ${TDUR}s step-end infinite}` +
      frontKeyframes(`r${i}`, steps, 1) + frontKeyframes(`q${i}`, steps, -1),
    ).join("\n");
    return {
      defs: clips,
      css:
        `.nz{fill:${rgb(NOISE_A)}}\n${frontCss}\n${delays("d")}\n` +
        `.st{animation:nk ${num2(NOISE_FRAMES / TFPS)}s steps(${NOISE_FRAMES}) infinite}\n` +
        `@keyframes nk{to{transform:translateY(${-NOISE_FRAMES * STRIP}px)}}`,
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
