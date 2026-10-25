/**
 * Board geometry. Coordinates are [row, col] on a 15x15 grid, row 0 at the top.
 * A cell's centre in "board units" is x = col, y = row (the 3D scene subtracts 7 to centre on the origin).
 *
 * Seats sit at the bottom, left, top and right, and play clockwise.
 *
 * A token's progress is a single number:
 *   -1        in the yard (needs a 6 to leave)
 *   0..50     on the 52-cell ring, 0 being the seat's own start square
 *   51..56    on the seat's coloured home column
 *   57        home (the centre); must be reached by exact count
 */
export type Cell = readonly [row: number, col: number];
export type Seat = 0 | 1 | 2 | 3;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const TOKENS_PER_PLAYER = 4;
export const RING_LENGTH = 52;
export const YARD = -1;
export const LAST_RING_PROGRESS = 50;
export const HOME_COLUMN_START = 51;
export const FINISH = 57;

/** The ring, clockwise from the bottom seat's start square. */
export const RING: readonly Cell[] = [
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
];

/** Ring index of each seat's start square. */
export const START_INDEX: Readonly<Record<Seat, number>> = { 0: 0, 1: 13, 2: 26, 3: 39 };

export const HOME_COLUMN: Readonly<Record<Seat, readonly Cell[]>> = {
  0: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  1: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  2: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  3: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};

/** Start squares plus a star eight squares after each, all safe from capture. */
export const SAFE_RING_INDEXES: ReadonlySet<number> = new Set([
  ...SEATS.map(s => START_INDEX[s]),
  ...SEATS.map(s => (START_INDEX[s] + 8) % RING_LENGTH),
]);
export const STAR_RING_INDEXES: readonly number[] = SEATS.map(s => (START_INDEX[s] + 8) % RING_LENGTH);

export const isSafeRingIndex = (idx: number) => SAFE_RING_INDEXES.has(idx);

/** Ring index a token occupies, or null when it is in the yard, on its home column, or home. */
export const ringIndexOf = (seat: Seat, progress: number): number | null =>
  progress >= 0 && progress <= LAST_RING_PROGRESS ? (START_INDEX[seat] + progress) % RING_LENGTH : null;

export const cellOf = (seat: Seat, progress: number): Cell | null => {
  const ring = ringIndexOf(seat, progress);
  if (ring !== null) return RING[ring];
  if (progress >= HOME_COLUMN_START && progress < FINISH) return HOME_COLUMN[seat][progress - HOME_COLUMN_START];
  return null;
};

export interface Point { x: number; y: number }

const YARD_CENTRE: Readonly<Record<Seat, Point>> = {
  0: { x: 2.5, y: 11.5 },
  1: { x: 2.5, y: 2.5 },
  2: { x: 11.5, y: 2.5 },
  3: { x: 11.5, y: 11.5 },
};
const YARD_SPREAD = 0.95;
const YARD_SLOTS: readonly Point[] = [
  { x: -YARD_SPREAD, y: -YARD_SPREAD }, { x: YARD_SPREAD, y: -YARD_SPREAD },
  { x: -YARD_SPREAD, y: YARD_SPREAD }, { x: YARD_SPREAD, y: YARD_SPREAD },
];

/** Direction each seat's home column enters the centre from, as a unit vector in board units. */
export const SEAT_DIRECTION: Readonly<Record<Seat, Point>> = {
  0: { x: 0, y: 1 }, 1: { x: -1, y: 0 }, 2: { x: 0, y: -1 }, 3: { x: 1, y: 0 },
};

/**
 * How the waiting vehicles are laid out in a yard. "nest" is the classic two by two block in the middle; "lot" puts them in a
 * car park along the edge that touches the road, with the rest of the yard left free for the player's island.
 */
export type YardStyle = "nest" | "lot";
let yardStyle: YardStyle = "nest";
export const setYardStyle = (style: YardStyle) => { yardStyle = style; };
let bayWaiters: ReadonlySet<string> = new Set();
/** Tokens without a vehicle (keys "seat-token") wait in their own parking bay instead of the middle of the lot. */
export const setBayWaiters = (keys: ReadonlySet<string>) => { bayWaiters = keys; };
export const getYardStyle = (): YardStyle => yardStyle;

/** Yards on the left of the board touch the road on their right edge; yards on the right touch it on their left. */
export const lotOnRight = (seat: Seat): boolean => seat === 0 || seat === 1;
/** Bay columns in the car park, measured from the yard's centre towards the road: the far column, then the near one. */
const LOT_COLUMNS = [0.95, 2.1] as const;

/** The yard's own centre, for drawing. */
export const yardCentre = (seat: Seat): Point => YARD_CENTRE[seat];

export const yardPoint = (seat: Seat, token: number): Point => {
  if (yardStyle === "lot") {
    const sign = lotOnRight(seat) ? 1 : -1;
    if (bayWaiters.has(`${seat}-${token}`)) return bayPoint(seat, token);
    // the waiting tokens stand together in the middle of the car park, among the parked vehicles
    const mid = (LOT_COLUMNS[0] + LOT_COLUMNS[1]) / 2;
    return { x: YARD_CENTRE[seat].x + sign * (mid + (token % 2 ? 0.3 : -0.3)), y: YARD_CENTRE[seat].y + (token < 2 ? -0.3 : 0.3) };
  }
  return { x: YARD_CENTRE[seat].x + YARD_SLOTS[token].x, y: YARD_CENTRE[seat].y + YARD_SLOTS[token].y };
};

/** The marked parking bay for a vehicle whose player is still waiting in the car park. */
export const bayPoint = (seat: Seat, token: number): Point => {
  const sign = lotOnRight(seat) ? 1 : -1;
  return { x: YARD_CENTRE[seat].x + sign * LOT_COLUMNS[token % 2], y: YARD_CENTRE[seat].y + (token < 2 ? -YARD_SPREAD : YARD_SPREAD) };
};

export const homePoint = (seat: Seat, token: number): Point => {
  const d = SEAT_DIRECTION[seat];
  const along = 0.62;
  const across = (token - 1.5) * 0.3;
  return { x: 7 + d.x * along + -d.y * across, y: 7 + d.y * along + d.x * across };
};

/** Where a token is drawn, in board units. */
export const pointOf = (seat: Seat, token: number, progress: number): Point => {
  if (progress === YARD) return yardPoint(seat, token);
  if (progress >= FINISH) return homePoint(seat, token);
  const cell = cellOf(seat, progress)!;
  return { x: cell[1], y: cell[0] };
};

export interface SeatInfo {
  name: string;
  /** Hex colours: main, light highlight, dark shade. */
  main: string;
  light: string;
  dark: string;
  /** The yard (home) and the coloured home column (path); they follow main and light unless the player chose their own. */
  home: string;
  path: string;
  /** Chakra colour scheme name. */
  scheme: string;
  /** Glyph used by colour-blind mode. */
  glyph: string;
  /** Rotation (degrees) that makes text upright for the person sitting at this seat. */
  facing: number;
}

/** Seat colours as the game draws them. Player choices are written into these entries in place (see client/palette.ts). */
export const SEAT_INFO: Record<Seat, SeatInfo> = {
  0: { name: "Red", main: "#E53E3E", light: "#FC8181", dark: "#9B2C2C", home: "#E53E3E", path: "#FC8181", scheme: "red", glyph: "●", facing: 0 },
  1: { name: "Green", main: "#38A169", light: "#68D391", dark: "#22603F", home: "#38A169", path: "#68D391", scheme: "green", glyph: "▲", facing: 90 },
  2: { name: "Blue", main: "#3182CE", light: "#63B3ED", dark: "#2A4E8F", home: "#3182CE", path: "#63B3ED", scheme: "blue", glyph: "■", facing: 180 },
  3: { name: "Purple", main: "#805AD5", light: "#B794F4", dark: "#4F3490", home: "#805AD5", path: "#B794F4", scheme: "purple", glyph: "◆", facing: 270 },
};

/** Which grid cells are the seat's home column, start square, star, or yard, for painting the board. */
export type CellKind = "ring" | "start" | "star" | "column" | "yard" | "centre" | "void";
export interface CellInfo { kind: CellKind; seat?: Seat }

export const cellInfo = (row: number, col: number): CellInfo => {
  for (const seat of SEATS) {
    if (HOME_COLUMN[seat].some(c => c[0] === row && c[1] === col)) return { kind: "column", seat };
  }
  const ringIdx = RING.findIndex(c => c[0] === row && c[1] === col);
  if (ringIdx >= 0) {
    const startSeat = SEATS.find(s => START_INDEX[s] === ringIdx);
    if (startSeat !== undefined) return { kind: "start", seat: startSeat };
    if (STAR_RING_INDEXES.includes(ringIdx)) return { kind: "star" };
    return { kind: "ring" };
  }
  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) return { kind: "centre" };
  if (row <= 5 && col <= 5) return { kind: "yard", seat: 1 };
  if (row <= 5 && col >= 9) return { kind: "yard", seat: 2 };
  if (row >= 9 && col <= 5) return { kind: "yard", seat: 0 };
  if (row >= 9 && col >= 9) return { kind: "yard", seat: 3 };
  return { kind: "void" };
};

/** The original four colours, kept so a player's choice can always be undone. */
export const BASE_SEAT_INFO: Readonly<Record<Seat, Readonly<SeatInfo>>> = Object.freeze(
  Object.fromEntries(SEATS.map(seat => [seat, Object.freeze({ ...SEAT_INFO[seat] })])) as Record<Seat, SeatInfo>,
);
