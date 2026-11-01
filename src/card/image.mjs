// Image decoding for the card portrait, zero dependencies: what GitHub serves
// as avatars, PNG (8-bit, not interlaced) and baseline JPEG (greyscale or
// YCbCr). The accent portrait reads the luma, the natural one the colour.
import { inflateSync } from "node:zlib";

/** An unsupported or broken image; the message says which. */
export class ImageError extends Error {}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * bytes → { width, height, gray, rgb }, both row-major in [0, 1], rgb three
 * values a pixel (transparent PNG pixels over black); rgb is null for a JPEG
 * in a colour space other than greyscale or YCbCr.
 */
export function decodeImage(bytes) {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(PNG_MAGIC)) return decodePng(b);
  if (b[0] === 0xff && b[1] === 0xd8) return decodeJpeg(b);
  throw new ImageError(`not a PNG or JPEG (starts ${b.subarray(0, 4).toString("hex")})`);
}

// ---- PNG -------------------------------------------------------------------

const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }; // by colour type

function decodePng(b) {
  let w = 0, h = 0, depth = 0, type = -1, interlace = 0, palette = null, trns = null;
  const idat = [];
  for (let i = 8; i + 8 <= b.length; ) {
    const len = b.readUInt32BE(i), tag = b.toString("latin1", i + 4, i + 8), d = b.subarray(i + 8, i + 8 + len);
    if (tag === "IHDR") [w, h, depth, type, interlace] = [d.readUInt32BE(0), d.readUInt32BE(4), d[8], d[9], d[12]];
    else if (tag === "PLTE") palette = d;
    else if (tag === "tRNS") trns = d;
    else if (tag === "IDAT") idat.push(d);
    else if (tag === "IEND") break;
    i += 12 + len;
  }
  const ch = PNG_CHANNELS[type];
  if (!w || !h || !ch) throw new ImageError(`PNG colour type ${type} is not supported`);
  if (depth !== 8) throw new ImageError(`PNG bit depth ${depth} is not supported (8 only)`);
  if (interlace) throw new ImageError("interlaced PNG is not supported");
  if (type === 3 && !palette) throw new ImageError("palette PNG without a PLTE chunk");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  if (raw.length < h * (stride + 1)) throw new ImageError("PNG image data is truncated");
  const px = new Uint8Array(h * stride);
  for (let y = 0, p = 0; y < h; y++) {
    const filter = raw[p++], row = y * stride;
    for (let x = 0; x < stride; x++, p++) {
      const a = x >= ch ? px[row + x - ch] : 0;
      const up = y ? px[row - stride + x] : 0;
      const c = y && x >= ch ? px[row - stride + x - ch] : 0;
      let pred;
      if (filter === 0) pred = 0;
      else if (filter === 1) pred = a;
      else if (filter === 2) pred = up;
      else if (filter === 3) pred = (a + up) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      } else throw new ImageError(`PNG filter ${filter} is not defined`);
      px[row + x] = (raw[p] + pred) & 0xff;
    }
  }

  // Rec. 601 luma, the weights JPEG's Y uses too; alpha composites over black,
  // the portrait's screen.
  const gray = new Float32Array(w * h), rgb = new Float32Array(w * h * 3);
  for (let k = 0; k < w * h; k++) {
    const o = k * ch;
    let r, g, bl, alpha = 255;
    if (type === 3) {
      const idx = px[o];
      [r, g, bl] = [palette[3 * idx], palette[3 * idx + 1], palette[3 * idx + 2]];
      if (trns && idx < trns.length) alpha = trns[idx];
    } else if (ch <= 2) {
      r = g = bl = px[o];
      if (ch === 2) alpha = px[o + 1];
    } else {
      [r, g, bl] = [px[o], px[o + 1], px[o + 2]];
      if (ch === 4) alpha = px[o + 3];
    }
    gray[k] = ((0.299 * r + 0.587 * g + 0.114 * bl) * alpha) / (255 * 255);
    rgb[3 * k] = (r * alpha) / (255 * 255);
    rgb[3 * k + 1] = (g * alpha) / (255 * 255);
    rgb[3 * k + 2] = (bl * alpha) / (255 * 255);
  }
  return { width: w, height: h, gray, rgb };
}

// ---- baseline JPEG -----------------------------------------------------------

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
// COS[x * 8 + u] = C(u) / 2 · cos((2x + 1)uπ / 16): the 8-point IDCT basis
const COS = Float64Array.from({ length: 64 }, (_, i) => {
  const x = i >> 3, u = i & 7;
  return ((u ? 1 : Math.SQRT1_2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)) / 2;
});
const SOF_BASELINE = new Set([0xc0, 0xc1]);
const SOF_OTHER = new Set([0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Canonical Huffman table (JPEG spec F.2.2.3): maxcode / valptr / mincode by code length. */
function huffTable(counts, symbols) {
  const maxcode = new Int32Array(17).fill(-1), valptr = new Int32Array(17), mincode = new Int32Array(17);
  for (let l = 1, code = 0, k = 0; l <= 16; l++) {
    valptr[l] = k;
    mincode[l] = code;
    code += counts[l - 1];
    k += counts[l - 1];
    if (counts[l - 1]) maxcode[l] = code - 1;
    code <<= 1;
  }
  return { maxcode, valptr, mincode, symbols };
}

function decodeJpeg(b) {
  const qt = [], dc = [], ac = [];
  let frame = null, restart = 0;
  for (let i = 2; i < b.length; ) {
    if (b[i] !== 0xff) throw new ImageError(`corrupt JPEG: no marker at byte ${i}`);
    const m = b[i + 1];
    i += 2;
    if (m === 0xff) {
      i--; // fill byte before a marker
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    if (m === 0xd9) break;
    const len = b.readUInt16BE(i), seg = b.subarray(i + 2, i + len);
    if (m === 0xdb) {
      for (let p = 0; p < seg.length; ) {
        const wide = seg[p] >> 4, id = seg[p] & 15, t = new Int32Array(64);
        p++;
        for (let k = 0; k < 64; k++) t[ZIGZAG[k]] = wide ? seg.readUInt16BE(p + 2 * k) : seg[p + k];
        p += wide ? 128 : 64;
        qt[id] = t;
      }
    } else if (m === 0xc4) {
      for (let p = 0; p < seg.length; ) {
        const cls = seg[p] >> 4, id = seg[p] & 15, counts = seg.subarray(p + 1, p + 17);
        const n = counts.reduce((a, c) => a + c, 0);
        (cls ? ac : dc)[id] = huffTable(counts, seg.subarray(p + 17, p + 17 + n));
        p += 17 + n;
      }
    } else if (SOF_BASELINE.has(m)) {
      if (seg[0] !== 8) throw new ImageError(`JPEG sample precision ${seg[0]} is not supported (8 only)`);
      const comps = [];
      for (let k = 0; k < seg[5]; k++) {
        const o = 6 + 3 * k;
        comps.push({ id: seg[o], h: seg[o + 1] >> 4, v: seg[o + 1] & 15, tq: seg[o + 2] });
      }
      frame = { height: seg.readUInt16BE(1), width: seg.readUInt16BE(3), comps };
    } else if (SOF_OTHER.has(m)) {
      throw new ImageError(m === 0xc2 ? "progressive JPEG is not supported (baseline only)" : `JPEG process 0x${m.toString(16)} is not supported (baseline only)`);
    } else if (m === 0xdd) {
      restart = seg.readUInt16BE(0);
    } else if (m === 0xda) {
      if (!frame) throw new ImageError("corrupt JPEG: scan before frame header");
      const ns = seg[0];
      if (ns !== frame.comps.length)
        throw new ImageError("JPEG with one scan per component is not supported (interleaved baseline only)");
      const tables = [];
      for (let k = 0; k < ns; k++) tables.push({ dc: dc[seg[2 + 2 * k] >> 4], ac: ac[seg[2 + 2 * k] & 15] });
      return decodeScan(b, i + len, frame, tables, qt, restart);
    }
    i += len;
  }
  throw new ImageError("corrupt JPEG: no image scan");
}

/** The planes of an interleaved baseline scan starting at `pos`: luma, and colour for greyscale or YCbCr. */
function decodeScan(b, pos, frame, tables, qt, restart) {
  const { comps } = frame;
  const hmax = Math.max(...comps.map((c) => c.h)), vmax = Math.max(...comps.map((c) => c.v));
  const mcuX = Math.ceil(frame.width / (8 * hmax)), mcuY = Math.ceil(frame.height / (8 * vmax));
  const Y = comps[0];
  if (comps.some((c) => !qt[c.tq]) || tables.some((t) => !t.dc || !t.ac))
    throw new ImageError("corrupt JPEG: missing quantisation or Huffman table");
  // Each component's plane at its own sampling, padded to whole MCUs; cropped at the end.
  const colour = comps.length === 3;
  const planes = comps.map((c, i) =>
    i === 0 || colour ? { w: mcuX * c.h * 8, data: new Float32Array(mcuX * c.h * 8 * mcuY * c.v * 8) } : null);
  const width = Math.ceil((frame.width * Y.h) / hmax), height = Math.ceil((frame.height * Y.v) / vmax);

  let bits = 0, nbits = 0;
  const bit = () => {
    if (!nbits) {
      let byte = b[pos];
      if (byte === 0xff) {
        if (b[pos + 1] === 0) pos += 2;
        else byte = 0; // a marker: feed zeros, never step over it
      } else pos++;
      bits = byte;
      nbits = 8;
    }
    return (bits >> --nbits) & 1;
  };
  const receive = (s) => {
    let v = 0;
    for (let k = 0; k < s; k++) v = (v << 1) | bit();
    return v;
  };
  const extend = (v, s) => (v < 1 << (s - 1) ? v - (1 << s) + 1 : v);
  const huff = (t) => {
    for (let l = 1, code = 0; l <= 16; l++) {
      code = (code << 1) | bit();
      if (code <= t.maxcode[l]) return t.symbols[t.valptr[l] + code - t.mincode[l]];
    }
    throw new ImageError("corrupt JPEG: bad Huffman code");
  };

  const pred = new Int32Array(comps.length);
  const coef = new Float64Array(64), tmp = new Float64Array(64);
  const block = (c, keep) => {
    coef.fill(0);
    const t = huff(tables[c].dc);
    pred[c] += t ? extend(receive(t), t) : 0;
    coef[0] = pred[c];
    for (let k = 1; k < 64; ) {
      const rs = huff(tables[c].ac), r = rs >> 4, s = rs & 15;
      if (!s) {
        if (r !== 15) break;
        k += 16;
        continue;
      }
      k += r;
      if (k > 63) throw new ImageError("corrupt JPEG: coefficient past the block");
      coef[ZIGZAG[k]] = extend(receive(s), s);
      k++;
    }
    if (!keep) return;
    const q = qt[comps[c].tq];
    for (let k = 0; k < 64; k++) coef[k] *= q[k];
    // separable IDCT: columns, then rows
    for (let y = 0; y < 8; y++)
      for (let u = 0; u < 8; u++) {
        let s = 0;
        for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * coef[v * 8 + u];
        tmp[y * 8 + u] = s;
      }
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let s = 0;
        for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * tmp[y * 8 + u];
        coef[y * 8 + x] = s;
      }
  };

  for (let my = 0, n = 0; my < mcuY; my++)
    for (let mx = 0; mx < mcuX; mx++, n++) {
      if (restart && n && n % restart === 0) {
        nbits = 0;
        if (b[pos] !== 0xff || b[pos + 1] < 0xd0 || b[pos + 1] > 0xd7) throw new ImageError("corrupt JPEG: restart marker expected");
        pos += 2;
        pred.fill(0);
      }
      comps.forEach((comp, c) => {
        const plane = planes[c];
        for (let by = 0; by < comp.v; by++)
          for (let bx = 0; bx < comp.h; bx++) {
            block(c, plane !== null);
            if (!plane) continue;
            const x0 = (mx * comp.h + bx) * 8, y0 = (my * comp.v + by) * 8;
            for (let y = 0; y < 8; y++)
              for (let x = 0; x < 8; x++) plane.data[(y0 + y) * plane.w + x0 + x] = coef[y * 8 + x];
          }
      });
    }

  const clamp = (v) => Math.min(1, Math.max(0, v / 255));
  const gray = new Float32Array(width * height);
  const yp = planes[0];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) gray[y * width + x] = clamp(yp.data[y * yp.w + x] + 128);
  let rgb = null;
  if (comps.length === 1) rgb = Float32Array.from({ length: width * height * 3 }, (_, i) => gray[Math.floor(i / 3)]);
  else if (colour) {
    // JFIF YCbCr → RGB; chroma at its own sampling, taken from the nearest sample
    rgb = new Float32Array(width * height * 3);
    const [, cb, cr] = planes, [, B, R] = comps;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const l = yp.data[y * yp.w + x] + 128;
        const u = cb.data[Math.floor((y * B.v) / Y.v) * cb.w + Math.floor((x * B.h) / Y.h)];
        const v = cr.data[Math.floor((y * R.v) / Y.v) * cr.w + Math.floor((x * R.h) / Y.h)];
        const o = 3 * (y * width + x);
        rgb[o] = clamp(l + 1.402 * v);
        rgb[o + 1] = clamp(l - 0.344136 * u - 0.714136 * v);
        rgb[o + 2] = clamp(l + 1.772 * u);
      }
  }
  return { width, height, gray, rgb };
}

// ---- shaping -----------------------------------------------------------------

/** Area-average `img` down (or up) to cols × rows. */
export function resample({ width, height, gray }, cols, rows) {
  const spans = (n, m) =>
    Array.from({ length: m }, (_, t) => {
      const a = (t * n) / m, b = ((t + 1) * n) / m, out = [];
      for (let s = Math.floor(a); s < Math.min(n, Math.ceil(b)); s++) out.push([s, Math.min(b, s + 1) - Math.max(a, s)]);
      return out;
    });
  const xs = spans(width, cols), ys = spans(height, rows);
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let sum = 0, wsum = 0;
      for (const [sy, wy] of ys[r]) for (const [sx, wx] of xs[c]) {
        sum += gray[sy * width + sx] * wx * wy;
        wsum += wx * wy;
      }
      out[r * cols + c] = sum / wsum;
    }
  return out;
}

/** Stretch so `cutoff` of the values clip at each end (PIL's autocontrast). */
export function autocontrast(values, cutoff) {
  const sorted = Float32Array.from(values).sort();
  const lo = sorted[Math.floor(cutoff * (sorted.length - 1))], hi = sorted[Math.ceil((1 - cutoff) * (sorted.length - 1))];
  if (hi - lo < 1e-6) return Float32Array.from(values);
  return values.map((v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
}
