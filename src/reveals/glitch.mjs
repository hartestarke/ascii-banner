// Glitch: the line appears at once, then for `seconds` a few rows per tick
// jump sideways by whole columns, the jumps decaying to nothing, while short
// flashes swap the line for scramble noise. Rows ride shared per-row offset
// keyframes, reshuffled per tagline; a parent group hides the line (off the
// canvas — transforms only, no visibility toggles) during flashes and outside
// its slot. The knockout copy rides the same row offsets but stays open
// through the flashes; at rest every offset is zero, so the line settles
// exactly on the grid.
import { EMPTY, animate, keyframes } from "./common.mjs";

export default {
  defaults: {
    slices: 3, // rows displaced per tick
    shift: 2, // largest sideways jump, tagline columns; decays to 0 over `seconds`
    flashes: 4, // one-tick flashes of scramble noise during the reveal
    noiseAlpha: 0.65, // alpha of the noise glyphs
  },

  validate(o, v) {
    v.posInt("slices");
    v.nonNeg("shift");
    v.check(Number.isInteger(o.flashes) && o.flashes >= 0, "flashes", `must be an integer >= 0, got ${o.flashes}`);
    v.unit("noiseAlpha");
  },

  render(ctx) {
    const { o, layout, figs, pool, H, CUT, esc, num, num2, pct, rgb, jitter, wrap, rowText, rowKnock, delays } = ctx;
    if (!figs.length) return EMPTY;
    const { TROWS, TPX, rowY, SLOT_T, TDUR, NT, tickT } = layout;
    const HIDE = `transform:translateY(${-H}px)`;
    const shuffled = (n, seed) => {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(jitter(seed * 101 + i * 7 + 29) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Row offsets per tick, in columns: `slices` rows per tick, magnitude up to
    // shift·(1 − k/NT), so the shake dies out; tick NT is at rest.
    const offsets = Array.from({ length: TROWS }, () => new Array(NT + 1).fill(0));
    for (let k = 0; k < NT; k++) {
      const amp = o.shift * (1 - k / NT);
      for (const r of shuffled(TROWS, k + 1000).slice(0, o.slices)) {
        const sign = jitter(k * 977 + r * 61 + 5) < 0.5 ? -1 : 1;
        offsets[r][k] = sign * Math.ceil(amp * jitter(k * 1013 + r * 37 + 9));
      }
    }
    // Flash ticks: one per equal share of the first 80% of the reveal.
    const flashTicks = [...new Set(Array.from({ length: o.flashes }, (_, f) =>
      Math.min(NT - 1, 1 + Math.floor(((f + jitter(f * 53 + 3)) / o.flashes) * 0.8 * NT))))].filter((k) => k >= 1);
    const flashing = (k) => flashTicks.includes(k);

    let css = "";
    offsets.forEach((steps, r) => {
      const stops = [["0", steps[0] ? `transform:translateX(${num2(steps[0] * TPX)}px)` : "transform:none"]];
      for (let k = 1; k <= NT; k++)
        if (steps[k] !== steps[k - 1])
          stops.push([pct(tickT(k)), steps[k] ? `transform:translateX(${num2(steps[k] * TPX)}px)` : "transform:none"]);
      css += animate(`gx${r}`, `gx${r}`, TDUR) + keyframes(`gx${r}`, stops);
    });
    // Parent: shown through the slot except on flash ticks.
    const show = [["0", flashing(0) ? HIDE : "transform:none"]];
    for (let k = 1; k <= NT; k++)
      if (flashing(k) !== flashing(k - 1)) show.push([pct(tickT(k)), flashing(k) ? HIDE : "transform:none"]);
    show.push([pct(SLOT_T), HIDE], ["100", HIDE]);
    css += `\n.gx,.gxk{${HIDE}}${animate("gx", "gx", TDUR)}${keyframes("gx", show)}`;
    // Knockout parent: open through the whole slot, flashes included, so the
    // noise reads against a cleared field like scramble's band does.
    css += animate("gxk", "gxk", TDUR) + keyframes("gxk", [["0", "transform:none"], [pct(SLOT_T), HIDE], ["100", HIDE]]);
    // Flash frame f: on the canvas for its one tick only.
    flashTicks.forEach((k, f) => {
      css += animate(`gxf${f}`, `gxf${f}`, TDUR) +
        keyframes(`gxf${f}`, [["0", HIDE], [pct(tickT(k)), "transform:none"], [pct(tickT(k + 1)), HIDE], ["100", HIDE]]);
    });

    // Noise frame f of tagline p, row i: ramp glyphs where the row has ink.
    const noise = (p, i, f, row) => {
      let s = "";
      for (let c = 0; c < row.length; c++)
        s += row[c] === " " ? " " : pool[Math.floor(jitter(p * 7919 + f * 131 + i * 977 + c * 31 + 11) * pool.length)];
      return s;
    };
    const overlay = [];
    const cuts = [];
    figs.forEach((rows, p) => {
      const pattern = shuffled(TROWS, p);
      const lines = (row) => rows.map((_, i) => (row(p, i) ? `<g class="gx${pattern[i]} gxd${p}">${row(p, i)}</g>` : "")).join("");
      let flashes = "";
      flashTicks.forEach((_, f) => {
        let frame = "";
        rows.forEach((r, i) => {
          const row = r.trimEnd();
          if (row) frame += `<text class="tg gxz" y="${num(rowY(i))}">${esc(noise(p, i, f, row))}</text>`;
        });
        flashes += `<g class="gxf${f} gxd${p}">${frame}</g>`;
      });
      overlay.push(wrap(p, `<g class="gx gxd${p}">${lines(rowText)}</g>${flashes}`));
      if (CUT > 0) cuts.push(wrap(p, `<g class="gxk gxd${p}">${lines(rowKnock)}</g>`));
    });
    return {
      defs: "",
      css: `.gxz{fill:${rgb(o.noiseAlpha)}}\n[class^=gxf]{${HIDE}}\n${css}\n${delays("gxd")}`,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: { stop: ["[class^=gx]"], settle: ".gx.gxd0,.gxk.gxd0{transform:none}" },
      extraGlyphs: "",
    };
  },
};
