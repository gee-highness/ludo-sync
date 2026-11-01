import { chooseAction } from "./bot";
import { HAND_SIZE, type Action, type BotLevel, type BotStyle, type Card, type GameState, type Phase, type PlayerKind, type Rules } from "./types";

/** One player as another person at the table can see them: hands and the stock under the top card stay hidden. */
export interface PlayerView {
  name: string;
  kind: PlayerKind;
  level?: BotLevel;
  style?: BotStyle;
  stockCount: number;
  stockTop: Card | null;
  /** Your own hand; null for everyone else, whose hand is only a count. */
  hand: Card[] | null;
  handCount: number;
  /** Discard piles are open to everyone. */
  discards: Card[][];
  score: number;
  points: number;
}

/** Everything one viewer is allowed to know about a game. This, not the full state, is what crosses the network. */
export interface TableView {
  rules: Rules;
  players: PlayerView[];
  /** Index of the viewer's own player, or null when watching. */
  you: number | null;
  turn: number;
  dealer: number;
  drawCount: number;
  completedCount: number;
  building: Card[][];
  phase: Phase;
  round: number;
  roundWinner: number | null;
  roundPoints: number;
  winner: number | null;
  seq: number;
}

export const viewOf = (s: GameState, you: number | null): TableView => ({
  rules: s.rules,
  players: s.players.map((p, i) => ({
    name: p.name, kind: p.kind, ...(p.level ? { level: p.level } : {}), ...(p.style ? { style: p.style } : {}),
    stockCount: p.stock.length, stockTop: p.stock.length ? p.stock[p.stock.length - 1] : null,
    hand: i === you ? [...p.hand] : null, handCount: p.hand.length,
    discards: p.discards.map(d => [...d]), score: p.score, points: p.points,
  })),
  you, turn: s.turn, dealer: s.dealer, drawCount: s.draw.length, completedCount: s.completed.length,
  building: s.building.map(b => [...b]), phase: s.phase, round: s.round, roundWinner: s.roundWinner, roundPoints: s.roundPoints,
  winner: s.winner, seq: s.seq,
});

/** The hint a person gets: what the strongest bot would do with what they can see. */
export const hintFor = (v: TableView): Action | null => {
  if (v.you === null || v.turn !== v.you || v.phase !== "play") return null;
  // rebuild just enough of a game for the bot: it only looks at the viewer's own cards and what is face up
  const state: GameState = {
    version: 1, rules: v.rules, turn: v.turn, dealer: v.dealer, draw: [], completed: [], building: v.building, phase: v.phase, round: v.round,
    roundWinner: v.roundWinner, roundPoints: v.roundPoints, winner: v.winner, passes: 0, rng: v.seq, seq: v.seq,
    players: v.players.map((p, i) => ({
      name: p.name, kind: p.kind, level: p.level, style: p.style, score: p.score, points: p.points, discards: p.discards,
      stock: p.stockTop === null ? [] : [...Array.from({ length: Math.max(0, p.stockCount - 1) }, () => 1), p.stockTop],
      hand: i === v.you ? [...(p.hand ?? [])] : Array.from({ length: p.handCount }, () => 1),
    })),
  };
  return chooseAction(state, "hard");
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;
const isCard = (x: unknown): x is Card => isInt(x, 0, 12);
const cards = (x: unknown, max: number): Card[] | null => (Array.isArray(x) && x.length <= max && x.every(isCard) ? (x as Card[]) : null);

/** Checks a view received from the network (or loaded from storage) and returns a clean copy, or null. */
export const parseView = (raw: unknown): TableView | null => {
  if (!isObj(raw) || !Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 6) return null;
  const n = raw.players.length;
  const players: PlayerView[] = [];
  for (const p of raw.players) {
    if (!isObj(p) || typeof p.name !== "string" || (p.kind !== "human" && p.kind !== "bot")) return null;
    if (!isInt(p.stockCount, 0, 100) || !isInt(p.handCount, 0, HAND_SIZE) || !isInt(p.score, 0, 1_000_000) || !isInt(p.points ?? 0, 0, 1_000_000)) return null;
    if (p.stockTop !== null && !isCard(p.stockTop)) return null;
    if ((p.stockTop === null) !== (p.stockCount === 0)) return null;
    if (!Array.isArray(p.discards) || p.discards.length !== 4) return null;
    const discards = p.discards.map(d => cards(d, 162));
    if (discards.some(d => d === null)) return null;
    const hand = p.hand === null ? null : cards(p.hand, HAND_SIZE);
    if (p.hand !== null && !hand) return null;
    const level = p.level === "easy" || p.level === "normal" || p.level === "hard" ? p.level : undefined;
    const style = p.style === "blocker" || p.style === "racer" ? p.style : undefined;
    players.push({
      name: p.name.slice(0, 24), kind: p.kind, ...(level ? { level } : {}), ...(style ? { style } : {}), stockCount: p.stockCount, stockTop: p.stockTop as Card | null,
      hand, handCount: p.handCount, discards: discards as Card[][], score: p.score, points: (p.points as number | undefined) ?? 0,
    });
  }
  const rules = raw.rules;
  if (!isObj(rules) || !isInt(rules.stockSize, 5, 30) || typeof rules.tournament !== "boolean" || !isInt(rules.target, 50, 5000)) return null;
  if (raw.you !== null && !isInt(raw.you, 0, n - 1)) return null;
  if (!isInt(raw.turn, 0, n - 1) || !isInt(raw.dealer, 0, n - 1)) return null;
  if (!isInt(raw.drawCount, 0, 162) || !isInt(raw.completedCount, 0, 162)) return null;
  if (!Array.isArray(raw.building) || raw.building.length !== 4) return null;
  const building = raw.building.map(b => cards(b, 11));
  if (building.some(b => b === null)) return null;
  if (raw.phase !== "play" && raw.phase !== "roundOver" && raw.phase !== "over") return null;
  if (!isInt(raw.round, 1, 1000) || !isInt(raw.roundPoints, 0, 100_000) || !isInt(raw.seq, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (raw.roundWinner !== null && !isInt(raw.roundWinner, 0, n - 1)) return null;
  if (raw.winner !== null && !isInt(raw.winner, 0, n - 1)) return null;
  return {
    rules: { stockSize: rules.stockSize, tournament: rules.tournament, target: rules.target }, players, you: raw.you as number | null, turn: raw.turn,
    dealer: raw.dealer, drawCount: raw.drawCount, completedCount: raw.completedCount, building: building as Card[][], phase: raw.phase,
    round: raw.round, roundWinner: raw.roundWinner as number | null, roundPoints: raw.roundPoints, winner: raw.winner as number | null, seq: raw.seq,
  };
};

/** A player action from the network, checked for shape. The engine then checks it against the rules. */
export const parseAction = (raw: unknown): Action | null => {
  if (!isObj(raw)) return null;
  if (raw.type === "endTurn") return { type: "endTurn" };
  if (raw.type === "nextRound") return { type: "nextRound" };
  if (raw.type === "discard") return isInt(raw.index, 0, 4) && isInt(raw.pile, 0, 3) ? { type: "discard", index: raw.index, pile: raw.pile } : null;
  if (raw.type === "play") {
    const s = raw.source;
    if (!isObj(s) || !isInt(raw.to, 0, 3)) return null;
    if (s.from === "stock") return { type: "play", source: { from: "stock" }, to: raw.to };
    if (s.from === "hand" && isInt(s.index, 0, 4)) return { type: "play", source: { from: "hand", index: s.index }, to: raw.to };
    if (s.from === "discard" && isInt(s.pile, 0, 3)) return { type: "play", source: { from: "discard", pile: s.pile }, to: raw.to };
  }
  return null;
};
