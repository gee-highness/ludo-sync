import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HOME_COLUMN, RING, SEATS, SEAT_INFO, STAR_RING_INDEXES, START_INDEX, YARD, pointOf, type Seat } from "@/lib/ludo/board";

export const NEON_TRACK = 0x9fe8ff;
const Y = 0.075;

/** A flat square ring (outline) lying on the board, centred at (cx, cz). */
const frame = (cx: number, cz: number, half: number, thick: number): THREE.BufferGeometry => {
  const outer = new THREE.Shape();
  outer.moveTo(-half, -half); outer.lineTo(half, -half); outer.lineTo(half, half); outer.lineTo(-half, half); outer.closePath();
  const h = half - thick;
  const hole = new THREE.Path();
  hole.moveTo(-h, -h); hole.lineTo(-h, h); hole.lineTo(h, h); hole.lineTo(h, -h); hole.closePath();
  outer.holes.push(hole);
  const g = new THREE.ShapeGeometry(outer);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, Y, cz);
  return g;
};

/** A flat triangular outline, for the centre of the board. */
const triFrame = (pts: [number, number][], thick: number): THREE.BufferGeometry => {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cz = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
  const mk = (k: number) => pts.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * k, cz + (z - cz) * k));
  const outer = new THREE.Shape(mk(1));
  const hole = new THREE.Path(mk(1 - thick).reverse());
  outer.holes.push(hole);
  const g = new THREE.ShapeGeometry(outer);
  g.rotateX(-Math.PI / 2);
  g.translate(0, Y, 0);
  return g;
};

interface Layer { color: number; thick: number; geos: THREE.BufferGeometry[]; seat?: Seat; part?: "start" | "column" | "yard" | "centre" }

const material = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

export interface NeonBoard {
  group: THREE.Group;
  /** Re-colours the seat outlines (after a player's colour choice) and dims seats that are not playing. */
  setColours: (playing: ReadonlySet<Seat>) => void;
  dispose: () => void;
}

/** Glowing outlines for every square, yard and the centre: a thin bright line over a wide faint one, so it reads as neon. */
export const buildNeonBoard = (): NeonBoard => {
  const group = new THREE.Group();
  group.renderOrder = 1;
  const owned: { dispose: () => void }[] = [];
  const entries: { mats: THREE.MeshBasicMaterial[]; seat?: Seat; part?: Layer["part"]; base: number }[] = [];

  const add = (layer: Layer) => {
    const merged = mergeGeometries(layer.geos, false);
    layer.geos.forEach(g => g.dispose());
    if (!merged) return;
    owned.push(merged);
    // the same outline twice: bright and thin, then faint and wide for the glow
    const thin = material(layer.color, 0.95), wide = material(layer.color, 0.22);
    owned.push(thin, wide);
    const a = new THREE.Mesh(merged, thin), b = new THREE.Mesh(merged.clone(), wide);
    owned.push(b.geometry);
    b.scale.set(1, 1, 1);
    b.position.y = -0.004;
    group.add(b, a);
    entries.push({ mats: [thin, wide], seat: layer.seat, part: layer.part, base: layer.color });
  };

  const ringCells: THREE.BufferGeometry[] = [], starCells: THREE.BufferGeometry[] = [];
  RING.forEach(([row, col], i) => {
    if (SEATS.some(s => START_INDEX[s] === i)) return;
    (STAR_RING_INDEXES.includes(i) ? starCells : ringCells).push(frame(col - 7, row - 7, 0.46, 0.05));
  });
  add({ color: NEON_TRACK, thick: 0.05, geos: ringCells });
  add({ color: 0xfde047, thick: 0.05, geos: starCells });

  for (const seat of SEATS) {
    const [sr, sc] = RING[START_INDEX[seat]];
    add({ color: hex(SEAT_INFO[seat].main), thick: 0.06, geos: [frame(sc - 7, sr - 7, 0.46, 0.07)], seat, part: "start" });
    add({ color: hex(SEAT_INFO[seat].path), thick: 0.05, geos: HOME_COLUMN[seat].map(([r, c]) => frame(c - 7, r - 7, 0.46, 0.05)), seat, part: "column" });
    const slots = [0, 1, 2, 3].map(i => pointOf(seat, i, YARD));
    const cx = slots.reduce((a, p) => a + p.x, 0) / 4 - 7, cz = slots.reduce((a, p) => a + p.y, 0) / 4 - 7;
    add({ color: hex(SEAT_INFO[seat].home), thick: 0.08, geos: [frame(cx, cz, 2.9, 0.09), frame(cx, cz, 2.1, 0.05)], seat, part: "yard" });
  }
  const tri: Record<Seat, [number, number][]> = {
    0: [[-1.5, 1.5], [1.5, 1.5], [0, 0]], 1: [[-1.5, -1.5], [-1.5, 1.5], [0, 0]], 2: [[-1.5, -1.5], [1.5, -1.5], [0, 0]], 3: [[1.5, -1.5], [1.5, 1.5], [0, 0]],
  };
  for (const seat of SEATS) add({ color: hex(SEAT_INFO[seat].main), thick: 0.08, geos: [triFrame(tri[seat], 0.1)], seat, part: "centre" });

  const setColours = (playing: ReadonlySet<Seat>) => {
    for (const e of entries) {
      if (e.seat === undefined) continue;
      const info = SEAT_INFO[e.seat];
      const on = playing.has(e.seat);
      const colour = !on ? 0x666666 : hex(e.part === "column" ? info.path : e.part === "yard" ? info.home : info.main);
      e.mats.forEach(m => m.color.setHex(colour));
    }
  };
  setColours(new Set(SEATS));
  return { group, setColours, dispose: () => owned.forEach(o => o.dispose()) };
};

function hex(css: string) { return parseInt(css.slice(1), 16); }
