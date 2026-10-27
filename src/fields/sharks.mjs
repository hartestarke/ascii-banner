// sharks: a top-down view of sharks cruising across the banner at a few
// depths, each bending along its own meandering course and turning round
// off-screen between crossings, tails beating, over an optional school of
// small fish drifting past.
// Outlines after stackedlol/ascii-sharks (MIT, Copyright (c) 2026 drewdi).
import { TAU, frac, perFrame, rnd } from "./util.mjs";

// Per species, all lengths as fractions of the shark's length L, s = 0 at the
// snout → 1 at the tail tip, "reach" = distance out from the spine:
//   body     [nose, w, round, shoulder, swell, stalkAt, stalk, taper, lobe, ribbon]
//            the half-width rounds out to w by `nose` (sin^round), swells by
//            `swell` to the shoulder, tapers (power `taper`) to the `stalk`
//            half-width at `stalkAt`, then the tail narrows to 0 under a
//            `lobe` bump; a ribbon tail (1) stays full for longer
//   pectoral [leading root s, trailing root s, tip s, tip reach]; falcate =
//            a notched (sickle) trailing edge
//   pelvic   the same for the pelvic fins
//   caudal   reach of the forked tail fin, 0 = none
//   dorsal   s range of the first dorsal (a bright ridge), second = the second's
//   head     hammerheads' cephalofoil: [half-span, tip sweep, depth, front notch]
const SPECIES = {
  classic: {
    body: [0.13, 0.09, 0.95, 0.3, 0.016, 0.84, 0.019, 1.25, 0.012, 0],
    pectoral: [0.15, 0.43, 0.55, 0.26], falcate: true, pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.085, dorsal: [0.33, 0.47], second: [0.71, 0.76],
  },
  // a slim neck under a wide, swept-back cephalofoil; long upper tail lobe
  hammerhead: {
    body: [0.06, 0.045, 0, 0.3, 0.0525, 0.84, 0.0175, 1.25, 0.011, 0],
    head: [0.17, 0.035, 0.09, 0],
    pectoral: [0.17, 0.4, 0.5, 0.22], falcate: true, pelvic: [0.56, 0.63, 0.67, 0.075],
    caudal: 0.11, dorsal: [0.28, 0.44], second: [0.7, 0.74],
  },
  // a blunt, square snout on a heavy body
  tiger: {
    body: [0.13, 0.1, 0.45, 0.3, 0.014, 0.84, 0.019, 1.2, 0.012, 0],
    pectoral: [0.15, 0.42, 0.53, 0.25], falcate: true, pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.095, dorsal: [0.33, 0.46], second: [0.71, 0.75],
  },
  // a short round head, the body done by half-length, then a long ribbon tail
  zebra: {
    body: [0.1, 0.075, 0.7, 0.28, 0.025, 0.55, 0.022, 1.1, 0.012, 1],
    pectoral: [0.12, 0.3, 0.36, 0.19], falcate: false, pelvic: [0.42, 0.48, 0.51, 0.065],
    caudal: 0, dorsal: [0.36, 0.44], second: [0.49, 0.53],
  },
  // a broader, nearly straight cephalofoil notched at the centre; a towering dorsal
  greathammer: {
    body: [0.05, 0.04, 0, 0.3, 0.0605, 0.84, 0.018, 1.25, 0.0114, 0],
    head: [0.21, 0.006, 0.085, 0.014],
    pectoral: [0.16, 0.38, 0.49, 0.24], falcate: true, pelvic: [0.55, 0.62, 0.67, 0.085],
    caudal: 0.13, dorsal: [0.24, 0.45], second: [0.68, 0.74],
  },
  // a long conical snout on a torpedo narrowing hard to the stalk; tall tail
  mako: {
    body: [0.17, 0.088, 1.5, 0.32, 0.012, 0.86, 0.014, 1.45, 0.01, 0],
    pectoral: [0.18, 0.4, 0.5, 0.21], falcate: true, pelvic: [0.58, 0.64, 0.68, 0.06],
    caudal: 0.13, dorsal: [0.34, 0.45], second: [0.76, 0.79],
  },
  // a compact front half, then the upper tail lobe as a whip as long again
  thresher: {
    body: [0.08, 0.07, 0.75, 0.2, 0.02, 0.48, 0.012, 1.3, 0.007, 0],
    pectoral: [0.12, 0.27, 0.36, 0.2], falcate: true, pelvic: [0.37, 0.41, 0.44, 0.045],
    caudal: 0, dorsal: [0.24, 0.32], second: [0.45, 0.47],
  },
  // a blunt broad head, a heavy flat body, paddle pectorals, a long low tail
  nurse: {
    body: [0.08, 0.085, 0.4, 0.3, 0.02, 0.72, 0.022, 1.1, 0.014, 1],
    pectoral: [0.16, 0.34, 0.4, 0.17], falcate: false, pelvic: [0.45, 0.52, 0.55, 0.075],
    caudal: 0, dorsal: [0.5, 0.58], second: [0.63, 0.69],
  },
};
const KINDS = Object.keys(SPECIES);
const MIX = "mix";

// Skin brightness before depth: the back's core, its fall-off to the flank,
// light from above (upper flank brighter), the dorsal ridge, fins.
const CORE = 0.85;
const FLANK = 0.25;
const LIGHT = 0.12;
const RIDGE = 1;
const SECOND_DORSAL = 0.92;
const HEAD = 0.8;
const FIN = 0.72; // pectoral root; its tip is FIN_FADE dimmer
const FIN_FADE = 0.2;
const TAIL = 0.65; // pelvic and caudal fins
const FAR = 0.55; // brightness of the farthest shark; the nearest is 1
const OTHER_SIZE = [0.85, 0.6]; // length of the next-nearest and the farthest shark vs the nearest
// Tail beat: lateral swing L·WAVE·(0.1 + 0.9 s^1.8), WAVE_K radians of wave
// along the body, ~BEAT_HZ for the nearest shark (smaller ones beat faster),
// at least BEAT_FRAMES frames per beat.
const WAVE = 0.05;
const WAVE_K = 5.2;
const BEAT_HZ = 0.8;
const BEAT_FRAMES = 4;
// Course: a shark makes `speed` crossings per loop and turns round off-screen
// between them (an odd count also wraps once, off-screen). Each crossing
// follows its own meander, a sine across the crossing's x range with one of
// WIGGLES periods, its amplitude at most AMP of the field height, kept inside
// the field by the body's half-width and bending the body by at most BEND
// radians (a sine's crest curvature is A (2π/λ)²). The body lies along the
// course as a polyline of SPINE segments, so it bends and the heading swings.
const DWELL = 0.2; // fraction of a crossing spent wholly off-screen, half at each end
const AMP = 0.33;
const WIGGLES = [1, 1.5, 2];
const BEND = 0.5;
const SPINE = 16;
// Rotated-grid sub-samples per cell, (x, y) in cell units: four distinct rows
// and columns, so near-horizontal flanks get five coverage steps.
const SUB = [[0.375, 0.125], [0.875, 0.375], [0.125, 0.625], [0.625, 0.875]];
// Fish gather in one school: an ellipse SCHOOL = [half-width in columns, half-
// height in rows] as fractions of the field, drifting right → left, swaying
// SWAY rows up and down once per loop; each fish wanders WOBBLE cells about
// its place at a whole number of cycles per loop.
const SCHOOL = [0.1, 0.16];
const SWAY = 0.12;
const WOBBLE = 1;
const FISH_PEAK = [0.6, 0.3]; // a fish cell's brightness: base + up to this much more

const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function halfWidth([nose, w, round, shoulder, swell, stalkAt, stalk, taper, lobe, ribbon], s) {
  if (s < nose) return w * Math.sin(((s / nose) * Math.PI) / 2) ** round;
  if (s < shoulder) return w + swell * smoothstep(nose, shoulder, s);
  if (s < stalkAt) return stalk + (w + swell - stalk) * (1 - (s - shoulder) / (stalkAt - shoulder)) ** taper;
  const k = (s - stalkAt) / (1 - stalkAt);
  return stalk * (1 - (ribbon ? k * k : k)) + lobe * Math.sin(k * Math.PI);
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/**
 * Skin brightness of a point s along the spine (0 snout → 1 tail) and `a` px
 * out from it, on the upper (up = 1) or lower (-1) flank; 0 = off the shark.
 */
function skin(sp, s, a, up, L) {
  const u = s * L;
  if (sp.head) {
    const [span, sweep, depth, notch] = sp.head;
    const r = a / (span * L);
    const front = L * (sweep * r * r + notch * Math.max(0, 1 - r / 0.14));
    if (r <= 1 && u >= front && u <= front + L * depth * (1 - 0.2 * r ** 4)) return HEAD * (1 - 0.2 * r);
  }
  const w = halfWidth(sp.body, s) * L;
  if (a <= w) {
    const across = a / w;
    if (s > sp.dorsal[0] && s < sp.dorsal[1] && across < 0.3) return RIDGE;
    const v = CORE - FLANK * across * across + LIGHT * across * up;
    return s > sp.second[0] && s < sp.second[1] && across < 0.4 ? Math.max(v, SECOND_DORSAL) : v;
  }
  const [p0, p1, p2, reach] = sp.pectoral;
  const tip = reach * L;
  if (
    inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&
    !(sp.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.33), tip * 0.55, L * p2, tip))
  )
    return FIN - FIN_FADE * Math.min(1, a / tip);
  const [v0, v1, v2, vr] = sp.pelvic;
  if (
    inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) ||
    (sp.caudal > 0 && inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * sp.caudal))
  )
    return TAIL;
  return 0;
}

export default {
  defaults: {
    sharks: 3, // count
    length: 0.45, // the nearest shark's length as a fraction of the width
    speed: 2, // crossings per loop of the nearest shark; farther ones at most as many
    species: "classic", // one of KINDS, or "mix" = a different one per shark
    fish: 0, // fraction of cells holding a fish, gathered in a school (try 0.015); 0 = none
    seed: 1,
  },
  ramp: ": ; t % S X 8 # @",
  bands: 3,
  validate(o, v) {
    v.posInt("sharks");
    v.fraction("length");
    v.int("speed", 1, "crossings per loop");
    v.oneOf("species", [...KINDS, MIX]);
    v.unit("fish");
    v.int("seed");
  },
  make(g, o, cfg) {
    const { PX, PY, COLS, ROWS, NF, y0 } = g;
    const Wf = COLS * PX; // the field's width; a shark turns while wholly off it
    const Hf = ROWS * PY;
    const n = o.sharks;
    const start = Math.floor(rnd(o.seed, 0, 1) * KINDS.length);
    const sharks = Array.from({ length: n }, (_, k) => {
      const r = (slot) => rnd(o.seed, k, slot);
      // depth z: 0 = the nearest shark, 1 = the farthest
      const size = k === 0 ? 1 : OTHER_SIZE[0] + (OTHER_SIZE[1] - OTHER_SIZE[0]) * (n > 2 ? (k - 1) / (n - 2) : 0);
      const z = (1 - size) / (1 - OTHER_SIZE[1]);
      const L = o.length * g.W * size;
      const sp = SPECIES[o.species === MIX ? KINDS[(start + k) % KINDS.length] : o.species];
      const crossings = Math.max(1, Math.round(o.speed * size));
      const span = Wf + 2 * L; // x range the body covers over a crossing: snout 0 → Wf + L, tail L behind
      const half = (sp.body[1] + sp.body[4]) * L; // the body's widest half-width
      const first = r(6) < 0.5 ? 1 : -1; // heading of the first crossing, then alternating
      const legs = Array.from({ length: crossings }, (_, i) => {
        const q = (slot) => rnd(o.seed, k, 10 + 4 * i + slot);
        const wiggles = WIGGLES[Math.floor(q(0) * WIGGLES.length)];
        const wavelength = span / wiggles;
        const amp = Math.max(0, Math.min(AMP * Hf, Hf / 2 - half, (BEND * wavelength * wavelength) / (TAU * TAU * L)));
        const room = Math.max(0, Hf / 2 - half - amp); // how far the course's centre may sit off the middle
        return {
          dir: i % 2 ? -first : first,
          amp,
          kx: TAU / wavelength,
          phase: TAU * q(1),
          centre: y0 + Hf / 2 + room * (2 * q(2) - 1),
        };
      });
      return {
        sp,
        L,
        crossings,
        legs,
        bright: 1 - (1 - FAR) * z,
        phase: (k + 0.25 + 0.5 * r(4)) / n,
        beats: Math.max(1, Math.min(Math.round((BEAT_HZ * cfg.field.loopSeconds) / size), Math.floor(NF / BEAT_FRAMES))),
        beatPhase: r(5),
        // farthest any part gets from the spine: the widest fin or head
        reach: L * Math.max(sp.pectoral[3], sp.pelvic[3], sp.caudal, sp.head?.[0] ?? 0),
        pts: new Float64Array(2 * (SPINE + 1)), // the spine for the frame being built, snout first
      };
    });
    const count = Math.round(o.fish * COLS * ROWS);
    const school = {
      x: rnd(o.seed, n, 1) * COLS, // the centre's column at t = 0
      laps: 1 + Math.floor(rnd(o.seed, n, 2) * 2), // crossings per loop
      row: ROWS * (0.5 + (0.5 - SWAY - SCHOOL[1]) * (2 * rnd(o.seed, n, 3) - 1)), // ellipse and sway stay inside
      sway: TAU * rnd(o.seed, n, 4),
    };
    const fish = Array.from({ length: count }, (_, k) => {
      const r = (slot) => rnd(o.seed, n + 1 + k, slot);
      const angle = TAU * r(1);
      const radius = Math.sqrt(r(2)); // even over the ellipse
      return {
        dc: SCHOOL[0] * COLS * radius * Math.cos(angle),
        dr: SCHOOL[1] * ROWS * radius * Math.sin(angle),
        cycles: 1 + Math.floor(r(3) * 2),
        wobble: TAU * r(4),
        peak: FISH_PEAK[0] + FISH_PEAK[1] * r(5),
      };
    });
    // Everything advances by frac(whole cycles × t), exactly 0 again at t = 1,
    // so frame NF repeats frame 0 bit for bit.
    return perFrame(g, (t) => {
      const buf = new Float32Array(COLS * ROWS);
      for (const sh of sharks) {
        const { sp, L, pts } = sh;
        const progress = frac(t + sh.phase) * sh.crossings;
        const leg = sh.legs[Math.floor(progress)];
        const { dir, amp, centre, kx, phase } = leg;
        // snout x: wholly off-screen for DWELL/2 of the crossing at each end
        const p = Math.min(1, Math.max(0, (progress - Math.floor(progress) - DWELL / 2) / (1 - DWELL))) * (Wf + L);
        const beat = TAU * (frac(sh.beats * t) + sh.beatPhase);
        // the spine: walk back from the snout along the course in SPINE steps
        // of equal arc length, each point swung sideways by the tail beat
        let x = dir > 0 ? p : Wf - p;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let j = 0; j <= SPINE; j++) {
          const s = j / SPINE;
          const arg = kx * (x + L) + phase;
          const slope = amp * kx * Math.cos(arg);
          const norm = Math.hypot(1, slope);
          const swing = L * WAVE * (0.1 + 0.9 * s ** 1.8) * Math.sin(beat - s * WAVE_K);
          const px = x + (swing * dir * slope) / norm;
          const py = centre + amp * Math.sin(arg) - (swing * dir) / norm;
          pts[2 * j] = px;
          pts[2 * j + 1] = py;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          x -= (dir * L) / SPINE / norm;
        }
        const c0 = Math.max(0, Math.floor((minX - sh.reach) / PX));
        const c1 = Math.min(COLS - 1, Math.floor((maxX + sh.reach) / PX));
        const r0 = Math.max(0, Math.floor((minY - sh.reach - y0) / PY));
        const r1 = Math.min(ROWS - 1, Math.floor((maxY + sh.reach - y0) / PY));
        for (let row = r0; row <= r1; row++)
          for (let col = c0; col <= c1; col++) {
            let sum = 0;
            for (const [ox, oy] of SUB) {
              const qx = (col + ox) * PX;
              const qy = y0 + (row + oy) * PY;
              // the nearest spine segment, and where the point projects on it
              let best = Infinity, seg = 0, along = 0, offY = 0;
              for (let j = 0; j < SPINE; j++) {
                const ax = pts[2 * j], ay = pts[2 * j + 1];
                const ex = pts[2 * j + 2] - ax, ey = pts[2 * j + 3] - ay;
                const u = ((qx - ax) * ex + (qy - ay) * ey) / (ex * ex + ey * ey);
                const uc = Math.min(1, Math.max(0, u));
                const dx = qx - ax - uc * ex, dy = qy - ay - uc * ey;
                const d2 = dx * dx + dy * dy;
                if (d2 < best) {
                  best = d2;
                  seg = j;
                  along = u;
                  offY = dy;
                }
              }
              // ahead of the snout or past the tail tip
              if ((seg === 0 && along < 0) || (seg === SPINE - 1 && along > 1)) continue;
              const s = (seg + Math.min(1, Math.max(0, along))) / SPINE;
              sum += skin(sp, s, Math.sqrt(best), offY < 0 ? 1 : -1, L);
            }
            const v = (sh.bright * sum) / SUB.length;
            const i = row * COLS + col;
            if (v > buf[i]) buf[i] = v;
          }
      }
      if (count) {
        const cx = school.x - frac(school.laps * t) * COLS;
        const cy = school.row + SWAY * ROWS * Math.sin(TAU * t + school.sway);
        for (const f of fish) {
          const wobble = TAU * f.cycles * t + f.wobble;
          const col = Math.floor(frac((cx + f.dc + WOBBLE * Math.cos(wobble)) / COLS) * COLS);
          const row = Math.round(cy + f.dr + WOBBLE * 0.5 * Math.sin(wobble));
          if (row < 0 || row >= ROWS) continue;
          const i = row * COLS + col;
          if (f.peak > buf[i]) buf[i] = f.peak;
        }
      }
      return buf;
    });
  },
};
