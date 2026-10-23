import type { ShapeId } from "./pieces";

export type Pt = readonly [x: number, y: number];
export interface Outline { outer: Pt[]; holes?: Pt[][] }

/**
 * Silhouettes for every piece shape, as polygons in a box from -0.4 to 0.4 (y grows downward, as in SVG).
 * One definition feeds the flat SVG pieces, the 3D extrusions and the previews, so they always match.
 */
const circle = (cx: number, cy: number, r: number, n = 40, from = 0, to = Math.PI * 2): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = from + ((to - from) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt; });

const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 12): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ] as Pt;
  });

const poly = (...pts: Pt[]): Pt[] => pts;

const starPoints = (points: number, outer: number, inner: number, rot = -Math.PI / 2): Pt[] =>
  Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
  });

const SHAPES: Record<Exclude<ShapeId, "classic">, () => Outline> = {
  disc: () => ({ outer: circle(0, 0, 0.38, 48) }),
  pawn: () => ({
    outer: [
      ...cubic([-0.32, 0.36], [-0.32, 0.2], [-0.16, 0.1], [-0.1, 0.03]),
      ...headArc(),
      ...cubic([0.1, 0.03], [0.16, 0.1], [0.32, 0.2], [0.32, 0.36]),
    ],
  }),
  cone: () => ({ outer: poly([0, -0.42], [0.2, 0.0], [0.34, 0.36], [-0.34, 0.36], [-0.2, 0.0]) }),
  cube: () => ({ outer: poly([-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]) }),
  diamond: () => ({ outer: poly([0, -0.43], [0.32, 0], [0, 0.4], [-0.32, 0]) }),
  star: () => ({ outer: starPoints(5, 0.42, 0.18) }),
  heart: () => ({
    outer: [
      ...cubic([0, 0.36], [-0.5, -0.02], [-0.36, -0.38], [0, -0.14]),
      ...cubic([0, -0.14], [0.36, -0.38], [0.5, -0.02], [0, 0.36]),
    ],
  }),
  crown: () => ({ outer: poly([-0.36, 0.32], [-0.4, -0.22], [-0.2, 0.0], [0, -0.38], [0.2, 0.0], [0.4, -0.22], [0.36, 0.32]) }),
  hex: () => ({ outer: circle(0, 0, 0.4, 6, Math.PI / 6, Math.PI / 6 + Math.PI * 2).slice(0, 6) }),
  rocket: () => ({
    outer: [
      ...cubic([0, -0.44], [0.2, -0.28], [0.22, 0.04], [0.18, 0.2]),
      [0.36, 0.36] as Pt, [0.08, 0.3] as Pt, [0, 0.42] as Pt, [-0.08, 0.3] as Pt, [-0.36, 0.36] as Pt, [-0.18, 0.2] as Pt,
      ...cubic([-0.18, 0.2], [-0.22, 0.04], [-0.2, -0.28], [0, -0.44]),
    ],
  }),
  ghost: () => ({
    outer: [
      [-0.3, 0.38] as Pt, [-0.3, -0.06] as Pt, ...circle(0, -0.06, 0.3, 28, Math.PI, Math.PI * 2),
      [0.3, 0.38] as Pt, [0.15, 0.27] as Pt, [0, 0.38] as Pt, [-0.15, 0.27] as Pt,
    ],
  }),
  shield: () => ({
    outer: [
      [-0.32, -0.32] as Pt, [0.32, -0.32] as Pt, [0.32, 0.05] as Pt,
      ...cubic([0.32, 0.05], [0.32, 0.25], [0.1, 0.36], [0, 0.42]),
      ...cubic([0, 0.42], [-0.1, 0.36], [-0.32, 0.25], [-0.32, 0.05]),
    ],
  }),
  drop: () => ({
    outer: [
      ...cubic([0, -0.44], [0.12, -0.2], [0.3, 0.0], [0.3, 0.16]),
      ...circle(0, 0.16, 0.3, 24, 0, Math.PI),
      ...cubic([-0.3, 0.16], [-0.3, 0.0], [-0.12, -0.2], [0, -0.44]),
    ],
  }),
  moon: () => ({ outer: crescent() }),
  bolt: () => ({ outer: poly([0.1, -0.44], [-0.3, 0.06], [-0.04, 0.06], [-0.12, 0.44], [0.3, -0.1], [0.04, -0.1]) }),
  flower: () => ({
    outer: Array.from({ length: 8 }, (_, i) => {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 0.5) / 8) * Math.PI * 2, a2 = ((i + 1) / 8) * Math.PI * 2;
      const start: Pt = [Math.cos(a0) * 0.3, Math.sin(a0) * 0.3];
      const end: Pt = [Math.cos(a2) * 0.3, Math.sin(a2) * 0.3];
      const c: Pt = [Math.cos(a1) * 0.58, Math.sin(a1) * 0.58];
      return cubic(start, [start[0] + (c[0] - start[0]) * 0.9, start[1] + (c[1] - start[1]) * 0.9], [end[0] + (c[0] - end[0]) * 0.9, end[1] + (c[1] - end[1]) * 0.9], end, 6).slice(0, -1);
    }).flat(),
  }),
  donut: () => ({ outer: circle(0, 0, 0.4, 48), holes: [circle(0, 0, 0.17, 32).reverse()] }),
};

function headArc(): Pt[] {
  // left neck, over the top of the head, to the right neck
  const cy = -0.153, r = 0.2;
  const left = Math.atan2(0.03 - cy, -0.1), right = Math.atan2(0.03 - cy, 0.1);
  return circle(0, cy, r, 28, left, right + Math.PI * 2);
}

/** A crescent: the big circle with a smaller, offset circle bitten out of it. */
function crescent(): Pt[] {
  const R = 0.4, r = 0.33, cx = 0.2, cy = -0.06;
  const d = Math.hypot(cx, cy);
  const a = (R * R - r * r + d * d) / (2 * d);
  const h = Math.sqrt(R * R - a * a);
  const ux = cx / d, uy = cy / d;
  const mx = ux * a, my = uy * a;
  const p1: Pt = [mx + h * -uy, my + h * ux], p2: Pt = [mx - h * -uy, my - h * ux];
  const ang = (p: Pt, ox: number, oy: number) => Math.atan2(p[1] - oy, p[0] - ox);
  // outer arc runs the long way round the big circle from p1 to p2; the bite comes back along the small circle
  const a1 = ang(p1, 0, 0);
  let a2 = ang(p2, 0, 0);
  if (a2 < a1) a2 += Math.PI * 2;
  const big = circle(0, 0, R, 40, a1, a2);
  const mid = (a1 + a2) / 2;
  const longWay = Math.cos(mid) * cx + Math.sin(mid) * cy < 0; // the long arc is the side facing away from the bite
  const outerArc = longWay ? big : circle(0, 0, R, 40, a2, a1 + Math.PI * 2);
  const b1 = ang(outerArc[outerArc.length - 1], cx, cy), b2 = ang(outerArc[0], cx, cy);
  let bEnd = b2;
  if (bEnd > b1) bEnd -= Math.PI * 2;
  const bite = circle(cx, cy, r, 30, b1, bEnd);
  return [...outerArc, ...bite];
}

const cache = new Map<ShapeId, Outline>();
/** The silhouette of a shape. "classic" is the shipped model and has no outline of its own, so it falls back to a disc. */
export const outlineOf = (shape: ShapeId): Outline => {
  const key = shape === "classic" ? "disc" : shape;
  let o = cache.get(key);
  if (!o) { o = SHAPES[key](); cache.set(key, o); }
  return o;
};

const ring = (pts: readonly Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`).join("") + "Z";

/** SVG path data for a shape (even-odd fill handles holes). */
export const pathOf = (shape: ShapeId): string => {
  const o = outlineOf(shape);
  return ring(o.outer) + (o.holes ?? []).map(ring).join("");
};

export const SHAPE_LABEL: Record<ShapeId, string> = {
  classic: "Classic", disc: "Disc", pawn: "Pawn", cone: "Cone", cube: "Cube", diamond: "Diamond", star: "Star", heart: "Heart", crown: "Crown",
  hex: "Hexagon", rocket: "Rocket", ghost: "Ghost", shield: "Shield", drop: "Drop", moon: "Moon", bolt: "Bolt", flower: "Flower", donut: "Donut",
};
