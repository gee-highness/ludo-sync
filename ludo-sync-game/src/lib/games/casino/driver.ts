import { flag, num } from "../../platform/rules";
import { peekChance, peekPick } from "../../platform/rng";
import type { BotLevel, GameDriver, GameEvent } from "../../platform/types";
import { SCHEMA } from "./rules";
import { BIG, LITTLE, PILE_ID, allMoves, apply, cardName, create, positionOf, rankOf, suitOf, unitOf, unitsOf, valuesOf, winnersOf, type CAction, type CState, type Item } from "./engine";

export interface CView {
  rules: CState["rules"];
  me: number | null;
  hand: number[];
  handCounts: number[];
  table: Item[];
  pileCounts: number[];
  /** Your own pile, bottom to top, face up to you. */
  myPile: number[];
  /** The card that made your latest capture: it stays on top of your pile. */
  pileLock: number | null;
  /** How many cards on top of your pile you can still rearrange: the ones from your latest capture. */
  pileFresh: number;
  /** Top card of each pile, only shown when the rules let opponents take it. */
  pileTops: (number | null)[];
  deckCount: number;
  scores: number[];
  units: number[];
  sweeps: number[];
  turn: number;
  dealer: number;
  deal: number;
  phase: CState["phase"];
  summary: CState["summary"];
}

const view = (s: CState, viewer: number | null): CView => ({
  rules: s.rules, me: viewer, hand: viewer === null ? [] : s.hands[viewer], handCounts: s.hands.map(h => h.length), table: s.table, pileCounts: s.piles.map(p => p.length), myPile: viewer === null ? [] : s.piles[viewer].slice(), pileLock: viewer === null ? null : (s.locked?.[viewer] ?? null), pileFresh: viewer === null ? 0 : Math.min(s.fresh?.[viewer] ?? 0, s.piles[viewer].length),
  pileTops: s.piles.map(p => (flag(s.rules, "stealPileTop") && p.length ? p[p.length - 1] : null)), deckCount: s.deck.length, scores: s.score, units: s.names.map((_, i) => unitOf(s.rules, s.n, i)),
  sweeps: s.sweeps, turn: s.turn, dealer: s.dealer, deal: s.deal, phase: s.phase, summary: s.summary,
});

/** How much a move is worth to a bot: the cards it wins, the special cards, a sweep, and what it leaves for the next player. */
const worth = (s: CState, p: number, m: CAction, level: BotLevel): number => {
  if (m.type === "next" || m.type === "arrange") return -1e9;
  const r = s.rules;
  const point = (c: number) => (c === BIG ? 2 + num(r, "ptsBig") : c === LITTLE ? 1 + num(r, "ptsLittle") : rankOf(c) === 1 ? 1 + num(r, "ptsAce") : suitOf(c) === 3 ? 0.6 : 0.3);
  const next = apply(s, m, p);
  if (!next) return -1e9;
  const t = next.state;
  let v = 0;
  if (m.type === "capture") {
    const taken = [m.card, ...m.take.flatMap(id => (id >= PILE_ID ? [s.piles[id - PILE_ID][s.piles[id - PILE_ID].length - 1]] : s.table.find(i => i.id === id)!.cards))];
    v += taken.reduce((a, c) => a + point(c), 0) + taken.length * 0.4;
    if (next.events.some(e => e.type === "sweep")) v += num(r, "ptsSweep") * 1.5 + 0.5;
  } else if (m.type === "build") {
    v += 0.8 + (level === "easy" ? 0 : 0.8);
    v -= point(m.card) * 0.2;
  } else {
    v -= point(m.card) * 0.9;
  }
  if (level !== "easy") {
    // do not leave something the next player can take with a single card, and do not leave an empty table for a sweep
    const me = unitOf(r, s.n, p);
    for (let o = 1; o < s.n; o++) {
      const q = (p + o) % s.n;
      if (unitOf(r, s.n, q) === me) continue;
      const opp = positionOf(t, q);
      const sees = t.table.reduce((a, it) => a + (it.build ? 1.5 : 0.4), 0);
      v -= Math.min(2, sees * 0.12) * (level === "hard" ? 1.4 : 0.8);
      void opp;
    }
    if (t.table.length === 0) v -= 0.3;
  }
  return v;
};

const bot = (s: CState, p: number, level: BotLevel): CAction | null => {
  if (s.phase === "dealOver") return { type: "next" };
  if (s.phase !== "play" || s.turn !== p) return null;
  const moves = allMoves(positionOf(s, p));
  if (!moves.length) return null;
  if (level === "easy") {
    const caps = moves.filter(m => m.type === "capture");
    if (caps.length && peekChance(s.rng, 0.7)) return peekPick(caps, s.rng, s.deck.length);
    return peekPick(moves, s.rng, s.deck.length + 1);
  }
  let best = moves[0], bestV = -Infinity;
  const limit = level === "hard" ? 800 : 300;
  const pool = moves.length > limit ? moves.filter((_, i) => i % Math.ceil(moves.length / limit) === 0) : moves;
  for (const m of pool) { const v = worth(s, p, m, level) + (peekChance(s.rng, 0.5, pool.indexOf(m)) ? 0.001 : 0); if (v > bestV) { bestV = v; best = m; } }
  return best;
};

const ints = (v: unknown, max = 16): number[] | null => (Array.isArray(v) && v.length <= max && v.every(x => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 1000) ? (v as number[]) : null);

export const casino: GameDriver<CState, CAction, CView> = {
  id: "casino", name: "Casino", minPlayers: 2, maxPlayers: 4, schema: SCHEMA, hidden: true, create, apply,
  actors: s => (s.phase === "over" ? [] : s.phase === "dealOver" ? s.names.map((_, i) => i) : [s.turn]),
  over: s => s.phase === "over",
  scores: s => s.names.map((_, i) => s.score[unitOf(s.rules, s.n, i)]),
  winners: winnersOf,
  view, bot,
  // you may tidy your own pile at any time, even when it is not your turn
  mayAct: (s, p) => s.phase === "play" && Math.min(s.fresh?.[p] ?? 0, s.piles[p]?.length ?? 0) > 2,
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.type === "next") return { type: "next" };
    if (o.type === "arrange") { const order = ints(o.order, 52); return order ? { type: "arrange", order } : null; }
    if (!Number.isInteger(o.card) || (o.card as number) < 0 || (o.card as number) > 51) return null;
    if (o.type === "trail") return { type: "trail", card: o.card as number };
    const take = ints(o.take);
    if (!take) return null;
    if (o.type === "capture") return { type: "capture", card: o.card as number, take };
    if (o.type === "build" && Number.isInteger(o.value)) return { type: "build", card: o.card as number, take, value: o.value as number };
    return null;
  },
  describe: (e: GameEvent, names) => {
    const who = e.p !== undefined ? names[e.p] : "";
    const list = (cs: unknown) => (cs as number[]).map(cardName).join(" ");
    switch (e.type) {
      case "capture": return `${who} captured ${list(e.cards)} with ${cardName(e.card as number)}`;
      case "build": return `${who} built ${e.value}`;
      case "trail": return `${who} trailed ${cardName(e.card as number)}`;
      case "sweep": return `${who} swept the table!`;
      case "redeal": return "New cards dealt";
      case "deal": return `Deal ${e.deal}`;
      case "dealEnd": return "The deal is over";
      default: return null;
    }
  },
  prompt: (s, v) => {
    if (s.phase === "over") return "Match over";
    if (s.phase === "dealOver") return "Deal finished: see the points";
    return s.turn === v ? "Your turn: play a card" : `${s.names[s.turn]} is thinking`;
  },
};

export { unitsOf, valuesOf, cardName };
