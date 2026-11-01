// solid: one lit solid turning in place (a torus, a trefoil knot or a rounded
// cube), ray-marched per sample through a perspective camera. Rotations are
// whole turns per loop about the x, y and z axes, so the loop closes exactly.
// One ramp glyph per cell leaves the solid a dozen rows tall: field.cells
// "half" with field.dither gives it twice the rows, as square pixels.
import { TAU } from "./util.mjs";

// Shapes as signed distances in units where each fits inside the unit sphere
// the camera frames.
const TORUS = { R: 0.66, r: 0.3 };
const KNOT = { p: 2, q: 3, R: 0.52, r: 0.24, tube: 0.15 }; // (2, 3) torus knot = trefoil
const BOX = { half: 0.56, round: 0.08 };
const SHAPES = {
  torus: (x, y, z) => Math.hypot(Math.hypot(x, z) - TORUS.R, y) - TORUS.r,
  // Distance to the p points where the knot crosses this point's half-plane
  // about the y axis: an overestimate where the knot runs oblique to the
  // plane, which the march's short step absorbs.
  knot: (x, y, z) => {
    const { p, q, R, r, tube } = KNOT;
    const a = Math.atan2(z, x), rho = Math.hypot(x, z) - R;
    let d = Infinity;
    for (let k = 0; k < p; k++) {
      const phi = (q * (a + TAU * k)) / p;
      d = Math.min(d, Math.hypot(rho - r * Math.cos(phi), y - r * Math.sin(phi)));
    }
    return d - tube;
  },
  cube: (x, y, z) => {
    const e = BOX.half - BOX.round;
    const qx = Math.abs(x) - e, qy = Math.abs(y) - e, qz = Math.abs(z) - e;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - BOX.round;
  },
};

const CAM = 3.2; // camera distance from the solid's centre, in shape units
const STEPS = 96; // march steps before a ray counts as a miss
const STEP = 0.7; // fraction of the distance bound taken per step
const HIT = 0.002; // distance that counts as the surface
const NORMAL_EPS = 0.002; // finite-difference offset for the normal

const isVec3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const norm = ([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

/** World → shape rotation at loop phase t: undoes z, then y, then x (applied x, y, z). */
function inverseRotation(turns, t) {
  const [ax, ay, az] = turns.map((k) => -TAU * k * t);
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  return (x, y, z) => {
    const x1 = x * cz - y * sz, y1 = x * sz + y * cz; // about z
    const x2 = x1 * cy + z * sy, z2 = -x1 * sy + z * cy; // about y
    return [x2, y1 * cx - z2 * sx, y1 * sx + z2 * cx]; // about x
  };
}

export default {
  defaults: {
    shape: "torus", // one of SHAPES
    // Centre as fractions of the banner's width and height, and the diameter
    // of the sphere the solid turns in as a fraction of the height.
    x: 0.82,
    y: 0.5,
    size: 0.92,
    // Whole turns per loop about x (right), y (up) and z (into the screen),
    // applied in that order. A torus turning only about y shows no motion.
    turns: [1, 0, 2],
    // Direction towards the light, same axes: a key light in front, up and to
    // the left, so most of the visible surface takes light.
    light: [-0.4, 0.5, -0.75],
    ambient: 0.15, // brightness of the side facing away from the light
    specular: 0.35, // share of the highlight in a fully lit sample
    shininess: 18, // highlight exponent; higher = smaller, sharper
  },
  // donut.c's ramp
  ramp: ". , - ~ : ; = ! * # $ @",
  bands: 3,
  // The shading is already a brightness: the default 1.35 sinks the turned-away
  // half of the solid into a few scattered dots.
  gamma: 1,
  validate(o, v) {
    v.oneOf("shape", Object.keys(SHAPES));
    v.unit("x");
    v.unit("y");
    v.fraction("size");
    v.check(Array.isArray(o.turns) && o.turns.length === 3 && o.turns.every(Number.isInteger), "turns",
      `must be three integers (whole turns per loop about x, y, z) or the loop seam jumps, got ${JSON.stringify(o.turns)}`);
    v.check(isVec3(o.light) && o.light.some((c) => c !== 0), "light", `must be three finite numbers, not all 0, got ${JSON.stringify(o.light)}`);
    v.unit("ambient");
    v.unit("specular");
    v.positive("shininess");
  },
  make(g, o) {
    const sdf = SHAPES[o.shape];
    const L = norm(o.light);
    const cx = o.x * g.W, cy = o.y * g.H, radius = (o.size * g.H) / 2;
    // Focal scale: a ray through the framing circle's edge grazes the unit sphere.
    const focal = 1 / Math.sqrt(CAM * CAM - 1);
    let frame = null, toShape = null;
    const at = (x, y, z) => sdf(...toShape(x, y, z));
    return (col, row, f) => {
      if (f !== frame) {
        frame = f;
        toShape = inverseRotation(o.turns, f / g.NF);
      }
      const u = ((col + 0.5) * g.PX - cx) / radius;
      const w = -(g.y0 + (row + 0.5) * g.PY - cy) / radius;
      // Ray from the camera at (0, 0, -CAM) against the unit sphere first: most
      // of the banner misses it and is never marched.
      const [dx, dy, dz] = norm([u * focal, w * focal, 1]);
      const b = -CAM * dz;
      const disc = b * b - (CAM * CAM - 1);
      if (disc <= 0) return 0;
      let t = -b - Math.sqrt(disc);
      const tMax = -b + Math.sqrt(disc);
      for (let i = 0; i < STEPS && t < tMax; i++) {
        const px = dx * t, py = dy * t, pz = dz * t - CAM;
        const d = at(px, py, pz);
        if (d < HIT) {
          const e = NORMAL_EPS;
          const n = norm([
            at(px + e, py, pz) - at(px - e, py, pz),
            at(px, py + e, pz) - at(px, py - e, pz),
            at(px, py, pz + e) - at(px, py, pz - e),
          ]);
          const diffuse = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
          // Blinn half-vector between the light and the way back to the camera.
          const [hx, hy, hz] = norm([L[0] - dx, L[1] - dy, L[2] - dz]);
          const spec = diffuse > 0 ? Math.pow(Math.max(0, n[0] * hx + n[1] * hy + n[2] * hz), o.shininess) : 0;
          return o.ambient + (1 - o.ambient) * ((1 - o.specular) * diffuse + o.specular * spec);
        }
        t += d * STEP;
      }
      return 0;
    };
  },
};
