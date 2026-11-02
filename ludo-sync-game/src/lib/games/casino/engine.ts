import { flag, num, pick, type RuleValues } from "../../platform/rules";
import { shuffled } from "../../platform/rng";
import type { GameEvent, SeatInfo } from "../../platform/types";

/** Card ids 0..51: suit = id / 13 (0 clubs, 1 diamonds, 2 hearts, 3 spades), rank = id % 13 + 1 (1 ace). */
export const suitOf = (c: number) => Math.floor(c / 13);
export const rankOf = (c: number) => (c % 13) + 1;
export const BIG = 13 + 9; // 10 of diamonds
export const LITTLE = 39 + 1; // 2 of spades
export const SUITS = ["♣", "♦", "♥", "♠"];
export const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const cardName = (c: number) => `${RANKS[rankOf(c)]}${SUITS[suitOf(c)]}`;

/** A thing on the table: one loose card, or a build of several cards with a value and an owner. */
export interface Item { id: number; cards: number[]; build: boolean; value: number; owner: number; /** from an opponent's pile (African rule) */ pile?: boolean }
export const PILE_ID = 200;
export const buildId = (n: number) => 100 + n;

export interface CState {
  rules: RuleValues;
  n: number;
  names: string[];
  hands: number[][];
  deck: number[];
  table: Item[];
  piles: number[][];
  sweeps: number[];
  /** Match score, per unit (a player, or a team in team play). */
  score: number[];
  dealer: number;
  turn: number;
  lastCapture: number;
  deal: number;
  phase: "play" | "dealOver" | "over";
  nextBuild: number;
  rng: number;
  /** Points of the last finished deal, per unit, with the reasons. */
  summary: { unit: number; lines: string[]; total: number }[];
}

export type CAction =
  | { type: "capture"; card: number; take: number[] }
  | { type: "build"; card: number; take: number[]; value: number }
  | { type: "trail"; card: number }
  | { type: "next" };

export const unitOf = (rules: RuleValues, n: number, p: number) => (flag(rules, "teams") && n === 4 ? p % 2 : p);

// ---- card values ---------------------------------------------------------------------------------

/** What a card can count as when adding up. Pair-only picture cards have no sum value. */
export const valuesOf = (rules: RuleValues, card: number): number[] => {
  const r = rankOf(card);
  if (r === 1) { const a = pick(rules, "ace"); return a === "low" ? [1] : a === "high" ? [14] : [1, 14]; }
  if (r >= 11) return [r];
  return [r];
};
const solo = (rules: RuleValues, card: number) => rankOf(card) >= 11 && pick(rules, "faces") === "pair";

interface Opt { vals: number[]; solo: boolean }
const optOf = (rules: RuleValues, it: Item): Opt => it.build ? { vals: [it.value], solo: false } : { vals: valuesOf(rules, it.cards[0]), solo: solo(rules, it.cards[0]) };

/** Can these item options be split into groups that each add up to v? A solo item must be alone and equal v. */
const partition = (opts: Opt[], v: number, singles: boolean): boolean => {
  if (!opts.length) return true;
  const [first, ...rest] = opts;
  const m = rest.length;
  for (let mask = 0; mask < 1 << m; mask++) {
    if (singles && mask !== 0) continue;
    const group = [first, ...rest.filter((_, i) => (mask >> i) & 1)];
    if (group.some(g => g.solo) && group.length > 1) continue;
    if (!sums(group.map(g => g.vals), v)) continue;
    if (partition(rest.filter((_, i) => !((mask >> i) & 1)), v, singles)) return true;
  }
  return false;
};
const sums = (sets: number[][], v: number): boolean => {
  let reach = new Set([0]);
  for (const s of sets) { const next = new Set<number>(); for (const r of reach) for (const x of s) if (r + x <= v) next.add(r + x); reach = next; if (!reach.size) return false; }
  return reach.has(v);
};

// ---- what a player may do (used by the engine, the bots and the table's hints) ------------------

/** Everything about a position that move rules need: this works from a viewer's own information, so the table can offer exactly the legal moves. */
export interface Position { rules: RuleValues; n: number; me: number; hand: number[]; table: Item[]; pileTops: (number | null)[] }

export const candidates = (pos: Position): Item[] => {
  const items = [...pos.table];
  if (flag(pos.rules, "stealPileTop")) pos.pileTops.forEach((top, o) => { if (top !== null && unitOf(pos.rules, pos.n, o) !== unitOf(pos.rules, pos.n, pos.me)) items.push({ id: PILE_ID + o, cards: [top], build: false, value: 0, owner: o, pile: true }); });
  return items;
};

export const isCapture = (pos: Position, card: number, items: Item[]): boolean => {
  if (!items.length) return false;
  const opts = items.map(it => optOf(pos.rules, it));
  if (solo(pos.rules, card)) return items.every(it => (it.build ? it.value === rankOf(card) : it.cards.length === 1 && rankOf(it.cards[0]) === rankOf(card)));
  return valuesOf(pos.rules, card).some(v => partition(opts, v, false));
};

export const buildOptions = (pos: Position, card: number, items: Item[]): number[] => {
  const r = pos.rules;
  if (!flag(r, "builds") || !items.length || solo(r, card)) return [];
  if (items.some(i => solo(r, i.cards[0]) && !i.build)) return [];
  const mine = unitOf(r, pos.n, pos.me);
  for (const it of items) if (it.build) {
    if (unitOf(r, pos.n, it.owner) === mine ? !flag(r, "increaseOwn") : !flag(r, "increaseOpponents")) return [];
  }
  const opts: Opt[] = [...items.map(it => optOf(r, it)), { vals: valuesOf(r, card), solo: false }];
  const out: number[] = [];
  const max = num(r, "maxBuild");
  for (let b = 2; b <= max; b++) {
    if (!partition(opts, b, false)) continue;
    // at least one group must hold the played card plus something, so a build is never just a trail
    const multiple = items.length > 0;
    if (!multiple) continue;
    // several groups make a multiple build, which may be switched off
    const groupsSingle = sums(opts.map(o => o.vals), b);
    if (!groupsSingle && !flag(r, "multiBuilds")) continue;
    if (flag(r, "buildNeedsCard")) {
      const rest = [...pos.hand];
      rest.splice(rest.indexOf(card), 1);
      const holds = rest.some(c => valuesOf(r, c).includes(b)) || pos.table.some(t => t.build && t.owner === pos.me && t.value === b && !items.some(i => i.id === t.id));
      if (!holds) continue;
    }
    out.push(b);
  }
  return out;
};

export interface Move { action: CAction; label: string; cards: number; }

export const ownsBuild = (pos: Position) => pos.table.some(t => t.build && unitOf(pos.rules, pos.n, t.owner) === unitOf(pos.rules, pos.n, pos.me));

/** The captures and builds one card can make. */
const playsFor = (pos: Position, card: number, limit = 4096): CAction[] => {
  const cands = candidates(pos);
  const out: CAction[] = [];
  const pool = cands.slice(0, Math.min(cands.length, 13));
  for (let mask = 1; mask < 1 << pool.length && out.length < limit; mask++) {
    const items = pool.filter((_, i) => (mask >> i) & 1);
    if (isCapture(pos, card, items)) out.push({ type: "capture", card, take: items.map(i => i.id) });
    for (const b of buildOptions(pos, card, items)) out.push({ type: "build", card, take: items.map(i => i.id), value: b });
  }
  return out;
};

/** May this card simply be put on the table? Trailing can be restricted, but a player is never left with no move at all. */
export const trailAllowed = (pos: Position, card: number): boolean => {
  const r = pos.rules;
  if (flag(r, "mustCapture") && playsFor(pos, card).some(m => m.type === "capture")) return false;
  if (flag(r, "ownBuildBlocksTrail") && ownsBuild(pos) && pos.hand.some(c => playsFor(pos, c, 1).length > 0)) return false;
  return true;
};

/** Every legal move for one card in hand. */
export const movesFor = (pos: Position, card: number, limit = 4096): CAction[] => {
  const out = playsFor(pos, card, limit);
  if (trailAllowed(pos, card)) out.push({ type: "trail", card });
  return out;
};

export const allMoves = (pos: Position): CAction[] => {
  const seen = new Set<number>();
  return pos.hand.flatMap(c => (seen.has(c) ? [] : (seen.add(c), movesFor(pos, c))));
};

// ---- the game ------------------------------------------------------------------------------------

/** The pack: all 52 cards, or the 40 of South African Casino with the picture cards taken out. */
const deckIds = (rules: RuleValues) => Array.from({ length: 52 }, (_, i) => i).filter(i => pick(rules, "deck") === "52" || rankOf(i) <= 10);

/** How many cards are dealt each time and how many go face up on the table, by the chosen deal. */
export const dealPlan = (rules: RuleValues, n: number): { hand: number; table: number; refill: boolean } => {
  const mode = pick(rules, "dealMode");
  if (mode === "african") return { hand: n === 3 ? 13 : 10, table: n === 3 ? 1 : 0, refill: false };
  if (mode === "crazy") return { hand: 8, table: 0, refill: true };
  return { hand: num(rules, "handSize"), table: num(rules, "tableCards"), refill: false };
};

const step = (rules: RuleValues) => (pick(rules, "direction") === "anti" ? -1 : 1);
/** The player after p, in the direction of play. */
export const nextFrom = (rules: RuleValues, n: number, p: number) => (((p + step(rules)) % n) + n) % n;

/** The score that ends the match: the chosen one, or 11 for two sides and 7 when three or four play alone. */
export const targetOf = (rules: RuleValues, n: number): number => {
  const t = num(rules, "target");
  if (t > 0) return t;
  return unitOf(rules, n, n - 1) === n - 1 && !(flag(rules, "teams") && n === 4) && n >= 3 ? 7 : 11;
};

export const create = (seats: SeatInfo[], rules: RuleValues, seed: number): CState => {
  const n = seats.length;
  const sh = shuffled(deckIds(rules), seed >>> 0);
  const s: CState = {
    rules, n, names: seats.map(x => x.name), hands: seats.map(() => []), deck: sh.value, table: [], piles: seats.map(() => []), sweeps: seats.map(() => 0),
    score: seats.map(() => 0), dealer: 0, turn: 0, lastCapture: -1, deal: 1, phase: "play", nextBuild: 0, rng: sh.rng, summary: [],
  };
  startDeal(s, true);
  return s;
};

const dealHands = (s: CState) => {
  const k = dealPlan(s.rules, s.n).hand;
  for (let r = 0; r < k; r++) for (let p = 0; p < s.n; p++) { const c = s.deck.pop(); if (c !== undefined) s.hands[p].push(c); }
};

const startDeal = (s: CState, first: boolean) => {
  if (first) {
    const sh = shuffled(deckIds(s.rules), s.rng);
    s.deck = sh.value; s.rng = sh.rng;
    s.table = [];
    for (let i = 0; i < dealPlan(s.rules, s.n).table; i++) { const c = s.deck.pop(); if (c !== undefined) s.table.push({ id: c, cards: [c], build: false, value: 0, owner: -1 }); }
    s.piles = s.names.map(() => []); s.sweeps = s.names.map(() => 0); s.lastCapture = -1;
  }
  dealHands(s);
  s.turn = nextFrom(s.rules, s.n, s.dealer);
};

export const positionOf = (s: CState, me: number): Position => ({ rules: s.rules, n: s.n, me, hand: s.hands[me], table: s.table, pileTops: s.piles.map(p => (p.length ? p[p.length - 1] : null)) });

const cloneS = (s: CState): CState => ({ ...s, hands: s.hands.map(h => h.slice()), deck: s.deck.slice(), table: s.table.map(t => ({ ...t, cards: t.cards.slice() })), piles: s.piles.map(p => p.slice()), sweeps: s.sweeps.slice(), score: s.score.slice(), summary: s.summary });

const takeItems = (s: CState, ids: number[]): Item[] | null => {
  const out: Item[] = [];
  for (const id of ids) {
    if (out.some(o => o.id === id)) return null;
    if (id >= PILE_ID) {
      const o = id - PILE_ID;
      const top = s.piles[o]?.[s.piles[o].length - 1];
      if (top === undefined || !flag(s.rules, "stealPileTop")) return null;
      out.push({ id, cards: [top], build: false, value: 0, owner: o, pile: true });
    } else { const it = s.table.find(t => t.id === id); if (!it) return null; out.push(it); }
  }
  return out;
};

const removeTaken = (s: CState, items: Item[]) => {
  for (const it of items) {
    if (it.pile) s.piles[it.owner].pop();
    else s.table = s.table.filter(t => t.id !== it.id);
  }
};

export const apply = (state: CState, a: CAction, by: number): { state: CState; events: GameEvent[] } | null => {
  const s = cloneS(state);
  const events: GameEvent[] = [];
  if (s.phase === "over") return null;
  if (a.type === "next") {
    if (s.phase !== "dealOver") return null;
    s.dealer = nextFrom(s.rules, s.n, s.dealer); s.deal += 1; s.phase = "play"; s.summary = [];
    startDeal(s, true);
    events.push({ type: "deal", deal: s.deal });
    return { state: s, events };
  }
  if (s.phase !== "play" || by !== s.turn) return null;
  const hand = s.hands[by];
  if (!hand.includes(a.card)) return null;
  const pos = positionOf(s, by);
  const unit = unitOf(s.rules, s.n, by);
  const lastPlay = s.hands.every(h => h.length <= 1) && s.deck.length === 0;

  if (a.type === "trail") {
    if (!trailAllowed(pos, a.card)) return null;
    hand.splice(hand.indexOf(a.card), 1);
    s.table.push({ id: a.card, cards: [a.card], build: false, value: 0, owner: -1 });
    events.push({ type: "trail", p: by, card: a.card });
  } else {
    if (!Array.isArray(a.take) || a.take.length < 1 || a.take.length > 14) return null;
    const items = takeItems(s, a.take);
    if (!items) return null;
    if (a.type === "capture") {
      if (!isCapture(pos, a.card, items)) return null;
      hand.splice(hand.indexOf(a.card), 1);
      removeTaken(s, items);
      const got = [a.card, ...items.flatMap(i => i.cards)];
      // the new cards go on the pile with the lowest on top, which is the card an opponent may take
      s.piles[by].push(...[...got].sort((x, y) => rankOf(y) - rankOf(x)));
      s.lastCapture = by;
      events.push({ type: "capture", p: by, card: a.card, cards: got.slice(1) });
      if (s.table.length === 0 && (!lastPlay || flag(s.rules, "sweepLast"))) { s.sweeps[unit] += 1; events.push({ type: "sweep", p: by }); }
    } else {
      if (!buildOptions(pos, a.card, items).includes(a.value)) return null;
      hand.splice(hand.indexOf(a.card), 1);
      removeTaken(s, items);
      const cards = [a.card, ...items.flatMap(i => i.cards)];
      s.table.push({ id: buildId(s.nextBuild++), cards, build: true, value: a.value, owner: by });
      events.push({ type: "build", p: by, card: a.card, value: a.value, cards });
    }
  }

  // Crazy Casino: draw back up to a full hand after every turn
  if (dealPlan(s.rules, s.n).refill) { while (s.hands[by].length < dealPlan(s.rules, s.n).hand && s.deck.length) s.hands[by].push(s.deck.pop()!); }
  // next player; deal again when hands are empty
  if (s.hands.every(h => h.length === 0)) {
    if (s.deck.length > 0) { dealHands(s); events.push({ type: "redeal" }); s.turn = nextFrom(s.rules, s.n, s.dealer); }
    else { endDeal(s, events); return { state: s, events }; }
  } else {
    let t = nextFrom(s.rules, s.n, by);
    for (let i = 0; i < s.n && s.hands[t].length === 0; i++) t = nextFrom(s.rules, s.n, t);
    s.turn = t;
  }
  return { state: s, events };
};

// ---- scoring --------------------------------------------------------------------------------------

export const unitsOf = (s: CState): number[] => (flag(s.rules, "teams") && s.n === 4 ? [0, 1] : s.names.map((_, i) => i));

const endDeal = (s: CState, events: GameEvent[]) => {
  if (flag(s.rules, "tableToLast") && s.lastCapture >= 0 && s.table.length) {
    s.piles[s.lastCapture].push(...s.table.flatMap(t => t.cards));
    s.table = [];
  }
  const units = unitsOf(s);
  const cards = (u: number) => s.piles.flatMap((p, i) => (unitOf(s.rules, s.n, i) === u ? p : []));
  const lead = (key: (u: number) => number) => { const v = units.map(key); const max = Math.max(...v); return max > 0 && v.filter(x => x === max).length === 1 ? units[v.indexOf(max)] : -1; };
  const mostCards = lead(u => cards(u).length);
  const mostSpades = lead(u => cards(u).filter(c => suitOf(c) === 3).length);
  s.summary = units.map(u => {
    const mine = cards(u);
    const lines: string[] = [];
    let total = 0;
    const add = (pts: number, text: string) => { if (pts > 0) { total += pts; lines.push(`${text} +${pts}`); } };
    if (mostCards === u) add(num(s.rules, "ptsCards"), `Most cards (${mine.length})`);
    if (mostSpades === u) add(num(s.rules, "ptsSpades"), `Most spades (${mine.filter(c => suitOf(c) === 3).length})`);
    if (mine.includes(BIG)) add(num(s.rules, "ptsBig"), "Mummy (10♦)");
    if (mine.includes(LITTLE)) add(num(s.rules, "ptsLittle"), "Spy Two (2♠)");
    const aces = mine.filter(c => rankOf(c) === 1).length;
    if (aces) add(aces * num(s.rules, "ptsAce"), `Aces (${aces})`);
    if (s.sweeps[u]) add(s.sweeps[u] * num(s.rules, "ptsSweep"), `Sweeps (${s.sweeps[u]})`);
    return { unit: u, lines, total };
  });
  for (const x of s.summary) s.score[x.unit] += x.total;
  const best = Math.max(...units.map(u => s.score[u]));
  const leaders = units.filter(u => s.score[u] === best);
  s.phase = best >= targetOf(s.rules, s.n) && leaders.length === 1 ? "over" : "dealOver";
  events.push({ type: "dealEnd", summary: s.summary });
};

export const winnersOf = (s: CState): number[] => {
  if (s.phase !== "over") return [];
  const units = unitsOf(s);
  const best = Math.max(...units.map(u => s.score[u]));
  const u = units.find(x => s.score[x] === best)!;
  return s.names.map((_, i) => i).filter(i => unitOf(s.rules, s.n, i) === u);
};
