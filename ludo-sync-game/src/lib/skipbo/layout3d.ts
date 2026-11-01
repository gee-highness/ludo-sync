/**
 * Where everything sits on the 3D table. World units: x to the right, z towards the viewer, a card is 0.63 wide and 0.9 long.
 * Everyone's face-up cards stay upright for the viewer, so the numbers can always be read.
 */
export const CARD_W = 0.63;
export const CARD_H = 0.9;
export const CARD_T = 0.012;
/** Thickness of one card in a stack, capped so a full stock does not tower over the table. */
export const stackHeight = (count: number): number => Math.min(count, 40) * CARD_T;

export interface P2 { x: number; z: number }

export interface SeatLayout {
  /** Centre of the cluster, and how much smaller than your own cards it is drawn. */
  at: P2;
  scale: number;
}

export interface TableLayout {
  /** Opponents, left to right in the order they play after you. */
  opponents: SeatLayout[];
  me: { stock: P2; discards: P2[]; hand: P2; label: P2; scale: number };
  centre: { draw: P2; building: P2[]; scale: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Where a cluster's own parts sit, relative to its centre, before scaling. */
export const CLUSTER = {
  stock: { x: -1.56, z: 0 },
  discards: [-0.6, 0.18, 0.96, 1.74].map(x => ({ x, z: 0 })),
  hand: { x: 0, z: -1.15 },
  label: { x: 0, z: 1.2 },
  width: 3.75,
} as const;

/** The number of columns of opponents that fit a screen shape. */
export const columnsFor = (opponents: number, aspect: number): number =>
  Math.max(1, Math.min(opponents, aspect >= 1.35 ? 5 : aspect >= 0.85 ? 3 : 2));

export const layoutTable = (opponents: number, aspect: number): TableLayout => {
  const cols = columnsFor(opponents, aspect);
  const rows = Math.max(1, Math.ceil(opponents / cols));
  const portrait = aspect < 0.85;
  const targetW = portrait ? 7.4 : aspect < 1.35 ? 10.5 : 14.5;
  const scale = Math.max(0.55, Math.min(0.95, targetW / cols / (CLUSTER.width + 0.55)));
  const colW = CLUSTER.width * scale + 0.55;
  const rowH = 2.3 * scale + 0.7;
  const opps: SeatLayout[] = [];
  for (let i = 0; i < opponents; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? opponents - row * cols : cols;
    const col = i - row * cols;
    const x = (col - (inRow - 1) / 2) * colW;
    // the back row is the far one; a gentle curve pulls the ends of a row towards the viewer, like seats round a table
    const curve = Math.pow(Math.abs(x) / Math.max(colW * cols / 2, 1), 2) * 0.9;
    opps.push({ at: { x, z: -3.1 - (rows - 1 - row) * rowH + curve }, scale });
  }
  const meScale = 1.15;
  const me = {
    stock: { x: -2.75, z: 2.9 },
    discards: [0, 1, 2, 3].map(i => ({ x: -1.45 + i * 1.0, z: 2.9 })),
    hand: { x: 0, z: 4.55 },
    label: { x: 0, z: 6.35 },
    scale: meScale,
  };
  const centre = { draw: { x: -2.3, z: 0.3 }, building: [0, 1, 2, 3].map(i => ({ x: -1.15 + i * 1.15, z: 0.3 })), scale: 1.25 };
  const xs = [...opps.map(o => Math.abs(o.at.x) + (CLUSTER.width * o.scale) / 2), 3.4, 3.7];
  const half = Math.max(...xs);
  const minZ = Math.min(-3.1 - (rows - 1) * rowH - 1.5 * scale - 0.9, -3.2);
  return { opponents: opps, me, centre, bounds: { minX: -half, maxX: half, minZ, maxZ: 6.8 } };
};

/** The points of a fan of cards in the viewer's hand, from left to right. */
export const handSlots = (count: number, centre: P2, spacing = 0.82): { x: number; z: number; rot: number }[] =>
  Array.from({ length: count }, (_, i) => {
    const t = i - (count - 1) / 2;
    return { x: centre.x + t * spacing, z: centre.z + Math.abs(t) * 0.07, rot: -t * 0.05 };
  });

/** Which stack of cards a view position belongs to: used to tell the scene what to build. */
export const seatOrder = (players: number, you: number | null): number[] => {
  const me = you ?? 0;
  return Array.from({ length: players - 1 }, (_, k) => (me + 1 + k) % players);
};
