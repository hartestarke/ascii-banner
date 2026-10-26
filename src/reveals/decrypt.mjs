// Decrypt: from its first tick the whole line is cycling noise, and the cells
// lock into their glyphs in a left-to-right sweep that is ragged cell by cell.
// Every inked cell belongs to one of `lanes` interleaved lanes. A lane is drawn
// as copies of the rows holding only its cells (the rest blank, which keeps the
// grid under white-space:pre): a settled copy behind a clip window open to the
// left of the lane's front, a noise strip behind one open to the right. The
// fronts trail each other by `spread` columns, so inside that zone locked and
// still-cycling cells mix. Windows work like scramble's (Firefox ignores
// transforms on a clipPath's children): the clipped group slides, the inner
// group counter-slides the glyphs. At `seconds` the lane copies leave and the
// plain settled rows take over, so the settled line is the one every preset draws.
import { EMPTY, animate, keyframes, noiseRow, offCanvas } from "./common.mjs";

const MAX_LANES = 6; // every lane is another copy of the line
const KNOT_TICKS = 3; // ticks between a front's wander knots

export default {
  defaults: {
    lanes: 3,
    spread: 10, // columns from the first lane's front to the last's
    wander: 2, // columns a front may stray from its mean
    burst: 0.5, // pace jitter, 0..1
    noiseFrames: 6,
    noiseAlpha: 0.65,
  },

  validate(o, v) {
    v.int("lanes", 1);
    v.check(o.lanes <= MAX_LANES, "lanes", `must be at most ${MAX_LANES}, got ${o.lanes}`);
    v.nonNeg("spread");
    v.nonNeg("wander");
    v.unit("burst");
    v.posInt("noiseFrames");
    v.unit("noiseAlpha");
  },

  render(ctx) {
    const { o, cfg, layout, figs, pool, H, CUT, esc, num, num2, rgb, jitter, runs, wrap, textRows, knockRows, delays, pct } = ctx;
    if (!figs.length) return EMPTY;
    const { maxCols, TFONT, TPX, TPY, rowY, SLOT_T, TDUR, NT, tickT } = layout;
    const S = cfg.reveal.seconds;
    const L = o.lanes;
    const HIDE = offCanvas(H);
    const tx = (x) => (x ? `transform:translateX(${num2(x)}px)` : "transform:none");

    // Fronts in whole columns, shared by every tagline (each starts at local
    // x=0, so one set of keyframes serves all; shorter lines lock sooner at the
    // same pace). The mean sweeps from -wander to maxCols + spread + wander at
    // an uneven pace; lane j trails it by its share of `spread` plus a wander
    // interpolated between random knots, never retreats, and sits at maxCols
    // by tick NT, where everything is locked.
    const pace = Array.from({ length: NT }, (_, k) => 1 + o.burst * (2 * jitter(k * 59 + 13) - 1));
    const total = pace.reduce((a, b) => a + b, 0);
    const travel = maxCols + o.spread + 2 * o.wander;
    let acc = 0;
    const mean = [-o.wander, ...pace.map((v) => -o.wander + ((acc += v) / total) * travel)];
    const front = (j) => {
      const trail = L > 1 ? (o.spread * j) / (L - 1) : 0;
      const knot = (q) => 2 * jitter(j * 4099 + q * 61 + 5) - 1;
      const out = [0];
      for (let k = 1; k <= NT; k++) {
        const q = Math.floor(k / KNOT_TICKS);
        const u = (k % KNOT_TICKS) / KNOT_TICKS;
        const w = o.wander * (knot(q) * (1 - u) + knot(q + 1) * u);
        out.push(Math.min(maxCols, Math.max(out[k - 1], Math.round(mean[k] - trail + w))));
      }
      return out;
    };
    const fronts = Array.from({ length: L }, (_, j) => front(j));

    // Noise frames sit in a vertical strip stepping behind a band clip the
    // row's height: one animation per strip. Two row pitches keep the
    // neighbouring frames' glyphs clear of the band.
    const STRIP = Math.ceil(2 * TPY);
    const BAND = 1.5 * TFONT; // █ spans -0.3..1.02em
    const FAR = (maxCols + 2) * TPX; // clip reach: the widest line at full travel
    const lane = (p, i, c) => Math.floor(jitter(p * 7919 + i * 977 + c * 31 + 7) * L);
    const laneRow = (row, p, i, j) => {
      let s = "";
      for (let c = 0; c < row.length; c++) s += row[c] !== " " && lane(p, i, c) === j ? row[c] : " ";
      return s.trimEnd();
    };
    const win = (j, p, clip, body) =>
      `<g class="dcw dcf${j} dcd${p}" clip-path="url(#${clip})"><g class="dcb${j} dcd${p}">${body}</g></g>`;

    const overlay = [];
    const cuts = [];
    const bandRows = new Set();
    figs.forEach((rows, p) => {
      let body = "";
      rows.forEach((r, i) => {
        const row = r.trimEnd();
        if (!row) return;
        for (let j = 0; j < L; j++) {
          const part = laneRow(row, p, i, j);
          if (!part) continue;
          bandRows.add(i);
          let strip = "";
          for (let k = 0; k < o.noiseFrames; k++) {
            const noise = noiseRow(part, pool, (c) => jitter(p * 7919 + k * 131 + i * 977 + c * 31 + 11));
            strip += `<text class="tg dcz" y="${num(rowY(i) + k * STRIP)}">${esc(noise)}</text>`;
          }
          body += win(j, p, "dcl", `<text class="tg tx" y="${num(rowY(i))}">${runs(part)}</text>`) +
            win(j, p, `dcr${i}`, `<g class="dcn">${strip}</g>`);
        }
      });
      overlay.push(wrap(p, `${body}<g class="dcs dcd${p}">${textRows(p)}</g>`));
      if (CUT > 0) cuts.push(wrap(p, `<g class="dck dcd${p}">${knockRows(p)}</g>`));
    });

    // Clip rects live in the sliding group's space: at zero travel the left
    // window shows nothing and the right one the whole line.
    const rect = (x, y, w, h) => `<rect x="${num2(x)}" y="${num2(y)}" width="${num2(w)}" height="${num2(h)}"/>`;
    const defs = `<clipPath id="dcl">${rect(-FAR, 0, FAR, H)}</clipPath>` +
      [...bandRows].sort((a, b) => a - b).map((i) => `<clipPath id="dcr${i}">${rect(0, rowY(i) - BAND / 2, FAR, BAND)}</clipPath>`).join("");

    // Each lane: the window slides to its front, the inner group slides back;
    // at `seconds` the window leaves and the settled copy takes over.
    const laneCss = fronts.map((steps, j) => {
      const slide = [["0", tx(steps[0] * TPX)]];
      const back = [["0", tx(-steps[0] * TPX)]];
      for (let k = 1; k <= NT; k++) {
        if (steps[k] === steps[k - 1]) continue;
        slide.push([pct(tickT(k)), tx(steps[k] * TPX)]);
        back.push([pct(tickT(k)), tx(-steps[k] * TPX)]);
      }
      slide.push([pct(S), HIDE], ["100", HIDE]);
      return animate(`dcf${j}`, TDUR) + keyframes(`dcf${j}`, slide) + animate(`dcb${j}`, TDUR) + keyframes(`dcb${j}`, back);
    }).join("\n");
    const css =
      `\n.dcw,.dcs,.dck{${HIDE}}.dcz{fill:${rgb(o.noiseAlpha)}}\n${laneCss}\n` +
      animate("dcs", TDUR) + keyframes("dcs", [["0", HIDE], [pct(S), "transform:none"], [pct(SLOT_T), HIDE], ["100", HIDE]]) +
      animate("dck", TDUR) + keyframes("dck", [["0", "transform:none"], [pct(SLOT_T), HIDE], ["100", HIDE]]) +
      `\n${delays("dcd")}\n` +
      `.dcn{animation:dcn ${num2(o.noiseFrames / cfg.reveal.fps)}s steps(${o.noiseFrames}) infinite}` +
      `@keyframes dcn{to{transform:translateY(${-o.noiseFrames * STRIP}px)}}`;

    return {
      defs,
      css,
      overlay: overlay.join("\n"),
      knockout: cuts.join(""),
      reducedMotionCss: { stop: ["[class^=dc]"], settle: ".dcs.dcd0,.dck.dcd0{transform:none}" },
      extraGlyphs: pool.join(""),
    };
  },
};
