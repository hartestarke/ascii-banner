// Block layout: the header (the taglines over the field, always at the top
// left) and the cards, which flow after it in rows. Card boxes sit on the
// field's character grid, so a card's edges line up with the field's cells.
import { AUTO, CARD_MIN_WIDTH, ConfigError } from "./config.mjs";

/** Spacing in grid cells: side margins and the gap between blocks in columns; the gap between rows and the bottom margin in rows. */
export const BLOCK = { side: 3, gapX: 3, gapY: 1, bottom: 2 };

// px of slack when comparing sums and quotients of the float grid pitch.
const EPS = 1e-6;
// Output px are rounded to 1/PRECISION px, so sums of the float pitch print clean.
const PRECISION = 1e4;
const clean = (v) => Math.round(v * PRECISION) / PRECISION;

const overlaps = (a, b) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const span = (b) => `x ${clean(b.x)}–${clean(b.x + b.w)}, y ${clean(b.y)}–${clean(b.y + b.h)}`;

/**
 * The header's and every card's box in banner px, and the canvas size.
 * `cfg` is resolved (src/config.mjs); `measure(i, w)` → card i's content
 * height in px when rendered `w` px wide. Returns
 * { W, H, header: {x, y, w, h}, cards: [{x, y, w, h, contentH}] }, cards in
 * config order; a card's content is drawn at its box's top left + (0, round((h − contentH) / 2)).
 */
export function layoutBlocks(cfg, measure) {
  const { width: W, height } = cfg.size;
  const PX = cfg.field.fontSize * cfg.font.advance, PY = cfg.field.rowPitch;
  const fixed = height !== AUTO;
  // A px canvas centres its whole rows (src/field.mjs fieldGrid); an auto one is whole rows.
  const y0 = fixed ? (height - Math.floor(height / PY) * PY) / 2 : 0;
  const rowUp = (y) => y0 + Math.ceil((y - y0) / PY - EPS) * PY;
  const rowNear = (y) => y0 + Math.round((y - y0) / PY) * PY;

  const t = cfg.tagline;
  const header = { x: 0, y: 0, w: t.width === "full" ? W : t.width === "half" ? Math.round(W / 2 / PX) * PX : t.width, h: t.height };

  const inner = W - 2 * BLOCK.side * PX; // a row's room between the side margins
  const fullCols = Math.floor(inner / PX + EPS);
  const boxes = cfg.cards.map((k, i) => {
    const cols = k.width === "full" ? fullCols
      : k.width === "half" ? Math.floor((inner - BLOCK.gapX * PX) / 2 / PX + EPS)
      : Math.ceil(k.width / PX - EPS);
    const w = clean(cols * PX); // the width the card is measured and rendered at
    if (w < CARD_MIN_WIDTH)
      throw new ConfigError(`cards[${i}].width: "${k.width}" is ${clean(w)} px at size.width ${W}; a card needs at least ${CARD_MIN_WIDTH} px`);
    if (k.at === null && cols > fullCols)
      throw new ConfigError(`cards[${i}].width: ${k.width} px is wider than a row, at most ${clean(fullCols * PX)} px ` +
        `at size.width ${W} (${BLOCK.side}-column side margins); give "full" or place the card with "at"`);
    const contentH = measure(i, w);
    if (!(Number.isFinite(contentH) && contentH > 0)) throw new Error(`layoutBlocks: measure(${i}, ${w}) returned ${contentH}`);
    return { x: 0, y: 0, w, h: Math.ceil(contentH / PY - EPS) * PY, contentH, cols };
  });

  // Rows: the header's row goes on right after the header (no gap), the others
  // start at the side margin. Closing a row centres its cards on its height and
  // returns where the next row starts: right under the header, gapY under cards.
  const close = (row) => {
    const rowH = Math.max(row.header ? header.h : 0, ...row.items.map((b) => b.h));
    let next = row.header ? header.h : -Infinity;
    for (const b of row.items) {
      b.y = rowNear(row.top + (rowH - b.h) / 2);
      next = Math.max(next, b.y + b.h + BLOCK.gapY * PY);
    }
    return rowUp(next);
  };
  const right = W - BLOCK.side * PX; // a block fits a row while it ends by here
  let row = { header: true, top: 0, start: header.w, cols: 0, items: [] };
  boxes.forEach((b, i) => {
    if (cfg.cards[i].at !== null) return;
    let gap = row.items.length ? BLOCK.gapX : 0;
    if (row.start + (row.cols + gap + b.cols) * PX > right + EPS) {
      row = { header: false, top: close(row), start: BLOCK.side * PX, cols: 0, items: [] };
      gap = 0;
    }
    b.x = row.start + (row.cols + gap) * PX;
    row.cols += gap + b.cols;
    row.items.push(b);
  });
  close(row);

  // Cards placed with `at`: snapped to the grid, clear of every other box.
  const placed = [{ box: header, name: "the header" }];
  boxes.forEach((b, i) => {
    if (cfg.cards[i].at === null) placed.push({ box: b, name: `cards[${i}]` });
  });
  boxes.forEach((b, i) => {
    const at = cfg.cards[i].at;
    if (at === null) return;
    b.x = Math.round(at.x / PX) * PX;
    b.y = rowNear(at.y);
    if (b.x + b.w > W + EPS) throw new ConfigError(`cards[${i}].at: the card's box spans ${span(b)}, past size.width ${W}`);
    const hit = placed.find((p) => overlaps(b, p.box));
    if (hit) throw new ConfigError(`cards[${i}].at: the card's box (${span(b)}) overlaps ${hit.name} (${span(hit.box)})`);
    placed.push({ box: b, name: `cards[${i}]` });
  });

  const bottom = Math.max(header.h, ...boxes.map((b) => b.y + b.h));
  const H = fixed ? height : boxes.length ? clean(rowUp(bottom) + BLOCK.bottom * PY) : header.h;
  if (fixed)
    for (const { box, name } of placed)
      if (box.y + box.h > H + EPS)
        throw new ConfigError(`size.height: ${name} ends at y ${clean(box.y + box.h)}, past size.height ${H}; raise it or give "${AUTO}"`);

  return {
    W,
    H,
    header: { x: 0, y: 0, w: clean(header.w), h: header.h },
    cards: boxes.map(({ x, y, w, h, contentH }) => ({ x: clean(x), y: clean(y), w, h: clean(h), contentH })),
  };
}
