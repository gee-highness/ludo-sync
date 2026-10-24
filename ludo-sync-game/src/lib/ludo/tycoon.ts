import { RING_LENGTH, SEATS, type Seat } from "./board";
import { nextRandom } from "./rng";
import { DEFAULT_TUNING, type GameEvent, type GameState, type Player, type RuleTuning, type TycoonState } from "./types";

export const START_CASH = 1500;
export const ENTER_BONUS = 100;
export const HOME_BONUS = 250;
export const CAPTURE_LOOT = 50;
export const TAX = 100;
export const MAX_LEVEL = 3;

export type SquareKind = "start" | "property" | "station" | "utility" | "chest" | "chance" | "tax";

export interface Square {
  ring: number;
  kind: SquareKind;
  name: string;
  price: number;
  /** Colour group index for properties, -1 otherwise. */
  group: number;
}

/** Group colours, in ring order. */
export const GROUP_COLORS = [
  "#8B5E3C", "#7DD3FC", "#F472B6", "#FB923C", "#EF4444", "#FACC15", "#22C55E", "#2563EB", "#A78BFA", "#14B8A6", "#F97316", "#6366F1",
] as const;
/** Original city-themed names for the 32 properties, in ring order and colour group (2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2). */
const PROPERTY_NAMES = [
  "Dockside Alley", "Cargo Lane",
  "Aqua Row", "Pier Street", "Tidal Court",
  "Orchid Way", "Bloom Street", "Petal Plaza",
  "Ember Road", "Foundry Row", "Kiln Court",
  "Crimson Mile", "Vermilion Avenue", "Scarlet Square",
  "Sunrise Boulevard", "Dawn Terrace", "Gold Coast Drive",
  "Park Meadow", "Fern Boulevard", "Canopy Walk",
  "Sapphire Heights", "Azure Tower Road", "Cobalt Plaza",
  "Violet Quarter", "Amethyst Way", "Indigo Lane",
  "Lagoon Gardens", "Reef Promenade",
  "Canyon Rise", "Mesa Circle",
  "Summit Tower", "Zenith Plaza",
] as const;
const METRO_NAMES = ["Harbor Metro", "Central Metro", "Uptown Metro", "Eastside Metro"] as const;
/** Eight groups of three squares and four of two: 32 properties. */
const GROUP_SIZES = [2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2];

const ARM = 13;

const buildSquares = (): Square[] => {
  const out: Square[] = [];
  let property = 0;
  const groupOf: number[] = [];
  GROUP_SIZES.forEach((n, g) => { for (let i = 0; i < n; i++) groupOf.push(g); });
  const seenInGroup = new Array(GROUP_SIZES.length).fill(0);
  for (let ring = 0; ring < RING_LENGTH; ring++) {
    const arm = Math.floor(ring / ARM);
    const o = ring % ARM;
    if (o === 0) out.push({ ring, kind: "start", name: "Start", price: 0, group: -1 });
    else if (o === 3) out.push({ ring, kind: "chest", name: "City Fund", price: 0, group: -1 });
    else if (o === 5) out.push({ ring, kind: "station", name: METRO_NAMES[arm], price: 200, group: -1 });
    else if (o === 8) out.push({ ring, kind: "chance", name: "Lucky Draw", price: 0, group: -1 });
    else if (o === 10) {
      out.push(arm % 2 === 0
        ? { ring, kind: "tax", name: "City Tax", price: 0, group: -1 }
        : { ring, kind: "utility", name: arm === 1 ? "Power Grid" : "Hydro Plant", price: 150, group: -1 });
    } else {
      const g = groupOf[property];
      seenInGroup[g] += 1;
      const price = Math.round((60 + (property * 340) / 31) / 10) * 10;
      out.push({ ring, kind: "property", name: PROPERTY_NAMES[property], price, group: g });
      property += 1;
    }
  }
  return out;
};

export const SQUARES: readonly Square[] = buildSquares();
export const squareAt = (ring: number): Square => SQUARES[ring];
export const isOwnable = (sq: Square) => sq.kind === "property" || sq.kind === "station" || sq.kind === "utility";

const SQUARES_IN_GROUP: readonly (readonly number[])[] = GROUP_SIZES.map((_, g) => SQUARES.filter(s => s.group === g).map(s => s.ring));

export const houseCost = (ring: number) => Math.round(SQUARES[ring].price / 2);

export const createTycoon = (startCash: number = START_CASH): TycoonState => ({
  cash: SEATS.map(() => startCash),
  owner: new Array(RING_LENGTH).fill(-1),
  level: new Array(RING_LENGTH).fill(0),
  pending: null,
});

export const ownsFullSet = (t: TycoonState, seat: Seat, ring: number): boolean => {
  const sq = SQUARES[ring];
  return sq.kind === "property" && SQUARES_IN_GROUP[sq.group].every(r => t.owner[r] === seat);
};

const countOwned = (t: TycoonState, seat: Seat, kind: SquareKind) =>
  SQUARES.filter(s => s.kind === kind && t.owner[s.ring] === seat).length;

/** What a visitor owes for landing on an owned square. */
export const rentOf = (t: TycoonState, ring: number, factor = 1): number => Math.round(baseRent(t, ring) * factor);

const baseRent = (t: TycoonState, ring: number): number => {
  const sq = SQUARES[ring];
  const owner = t.owner[ring] as Seat;
  if (sq.kind === "station") return 25 * countOwned(t, owner, "station");
  if (sq.kind === "utility") return 30 * countOwned(t, owner, "utility");
  if (sq.kind === "property") {
    const base = Math.max(10, Math.round(sq.price / 10));
    const level = t.level[ring];
    if (level > 0) return base * [1, 3, 6, 10][level];
    return ownsFullSet(t, owner, ring) ? base * 2 : base;
  }
  return 0;
};

export interface RentRow { label: string; amount: number }
export interface RentTable {
  kind: SquareKind;
  /** What it costs to buy, and what the bank lends against it. */
  price: number;
  mortgage: number;
  /** Cost of each building (properties only). */
  buildCost: number;
  rows: RentRow[];
}

/** Everything the property card prints: the rent in every situation, in the game's current tuning. */
export const rentTable = (ring: number, tune: RuleTuning = DEFAULT_TUNING): RentTable => {
  const sq = SQUARES[ring];
  const f = tune.rentFactor;
  const out: RentTable = { kind: sq.kind, price: sq.price, mortgage: Math.floor(sq.price / 2), buildCost: 0, rows: [] };
  if (sq.kind === "property") {
    const base = Math.max(10, Math.round(sq.price / 10));
    out.buildCost = houseCost(ring);
    out.rows.push({ label: "Rent", amount: Math.round(base * f) }, { label: "With the full colour set", amount: Math.round(base * 2 * f) });
    const mult = [3, 6, 10];
    for (let lvl = 1; lvl <= Math.min(3, tune.maxBuild); lvl++) out.rows.push({ label: lvl === 1 ? "With 1 building" : `With ${lvl} buildings`, amount: Math.round(base * mult[lvl - 1] * f) });
  } else if (sq.kind === "station") {
    for (let n = 1; n <= 4; n++) out.rows.push({ label: n === 1 ? "Rent" : `If ${n} metro lines are owned`, amount: Math.round(25 * n * f) });
  } else if (sq.kind === "utility") {
    for (let n = 1; n <= 2; n++) out.rows.push({ label: n === 1 ? "Rent" : "If both utilities are owned", amount: Math.round(30 * n * f) });
  }
  return out;
};

const CHANCE = [
  { text: "You won the lottery: +$100", delta: 100 },
  { text: "Bank dividend: +$50", delta: 50 },
  { text: "Speeding fine: -$50", delta: -50 },
  { text: "Roof repairs: -$80", delta: -80 },
  { text: "It is your birthday: collect $20 from every player", delta: 0, each: 20 },
] as const;
const CHEST = [
  { text: "Tax refund: +$60", delta: 60 },
  { text: "You found some cash: +$30", delta: 30 },
  { text: "Doctor's bill: -$40", delta: -40 },
] as const;

export const cloneTycoon = (t: TycoonState): TycoonState => ({
  cash: [...t.cash], owner: [...t.owner], level: [...t.level], pending: t.pending ? { ...t.pending } : null,
});

/** Moves money between players (or the bank when `other` is null). Cash may dip below zero until settled. */
export const transfer = (t: TycoonState, seat: Seat, amount: number, note: string, events: GameEvent[], other: Seat | null = null) => {
  t.cash[seat] += amount;
  if (other !== null) t.cash[other] -= amount;
  events.push({ type: "money", seat, amount, note, ...(other !== null ? { other } : {}) });
};

/**
 * Resolves landing on a ring square. Mutates `t`; returns the new generator state. A purchase or build
 * offer is left in `t.pending` for the player to answer.
 */
export const landOn = (t: TycoonState, players: Player[], seat: Seat, ring: number, rng: number, events: GameEvent[], tune: RuleTuning = DEFAULT_TUNING): number => {
  const sq = SQUARES[ring];
  switch (sq.kind) {
    case "property":
    case "station":
    case "utility": {
      const owner = t.owner[ring];
      if (owner === -1) {
        if (t.cash[seat] >= sq.price) t.pending = { seat, ring, kind: "buy" };
      } else if (owner !== seat) {
        const rent = rentOf(t, ring, tune.rentFactor);
        t.cash[seat] -= rent;
        t.cash[owner] += rent;
        events.push({ type: "money", seat, amount: -rent, note: `rent for ${sq.name}`, other: owner as Seat });
      } else if (sq.kind === "property" && ownsFullSet(t, seat, ring) && t.level[ring] < tune.maxBuild && t.cash[seat] >= houseCost(ring)) {
        t.pending = { seat, ring, kind: "build" };
      }
      return rng;
    }
    case "tax":
      transfer(t, seat, -tune.tax, "tax", events);
      return rng;
    case "chance":
    case "chest": {
      const deck = sq.kind === "chance" ? CHANCE : CHEST;
      const r = nextRandom(rng);
      const card = deck[Math.floor(r.value * deck.length)] as { text: string; delta: number; each?: number };
      events.push({ type: "card", seat, deck: sq.kind, text: card.text });
      if (card.each) {
        for (const p of players) if (p.seat !== seat) transfer(t, seat, card.each, "birthday", events, p.seat);
      } else {
        transfer(t, seat, card.delta, sq.kind === "chance" ? "lucky draw" : "city fund", events);
      }
      return r.state;
    }
    default:
      return rng;
  }
};

/**
 * Raises cash for anyone below zero by selling buildings, then squares, at half price.
 * Returns the seats still broke afterwards: they are bankrupt.
 */
export const settleDebts = (t: TycoonState, players: Player[], events: GameEvent[]): Seat[] => {
  const broke: Seat[] = [];
  for (const p of players) {
    const seat = p.seat;
    if (t.cash[seat] >= 0) continue;
    const owned = SQUARES.filter(s => t.owner[s.ring] === seat).sort((a, b) => b.price - a.price);
    for (const sq of owned) {
      if (t.cash[seat] >= 0) break;
      while (t.level[sq.ring] > 0 && t.cash[seat] < 0) {
        t.level[sq.ring] -= 1;
        transfer(t, seat, Math.floor(houseCost(sq.ring) / 2), `sold a building on ${sq.name}`, events);
      }
    }
    for (const sq of owned) {
      if (t.cash[seat] >= 0) break;
      if (t.level[sq.ring] > 0) continue;
      t.owner[sq.ring] = -1;
      transfer(t, seat, Math.floor(sq.price / 2), `sold ${sq.name}`, events);
    }
    if (t.cash[seat] < 0) broke.push(seat);
  }
  return broke;
};

/** Gives all of a seat's squares back to the bank. */
export const releaseSeat = (t: TycoonState, seat: Seat) => {
  for (let r = 0; r < RING_LENGTH; r++) if (t.owner[r] === seat) { t.owner[r] = -1; t.level[r] = 0; }
  t.cash[seat] = 0;
  if (t.pending?.seat === seat) t.pending = null;
};

/** Net worth for display: cash plus half the price of squares and buildings. */
export const netWorth = (state: GameState, seat: Seat): number => {
  const t = state.tycoon;
  if (!t) return 0;
  let w = t.cash[seat];
  for (const sq of SQUARES) {
    if (t.owner[sq.ring] === seat) w += Math.floor(sq.price / 2) + t.level[sq.ring] * Math.floor(houseCost(sq.ring) / 2);
  }
  return w;
};
