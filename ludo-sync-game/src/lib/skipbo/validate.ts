import { cleanRules } from "./engine";
import { parseView } from "./view";
import type { GameState } from "./types";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCard = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 12;
const cards = (x: unknown, max: number): number[] | null => (Array.isArray(x) && x.length <= max && x.every(isCard) ? (x as number[]) : null);
const int = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;

/** Checks a saved game from storage. The full deck must still add up to 162 cards, so a damaged save is thrown away. */
export const parseGameState = (raw: unknown): GameState | null => {
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 6) return null;
  const n = raw.players.length;
  const players: GameState["players"] = [];
  for (const p of raw.players) {
    if (!isObj(p) || typeof p.name !== "string" || (p.kind !== "human" && p.kind !== "bot") || !int(p.score, 0, 1_000_000)) return null;
    const stock = cards(p.stock, 30), hand = cards(p.hand, 5);
    if (!stock || !hand || !Array.isArray(p.discards) || p.discards.length !== 4) return null;
    const discards = p.discards.map(d => cards(d, 162));
    if (discards.some(d => !d)) return null;
    const level = p.level === "easy" || p.level === "normal" || p.level === "hard" ? p.level : undefined;
    players.push({ name: p.name.slice(0, 24), kind: p.kind, level, stock, hand, discards: discards as number[][], score: p.score });
  }
  const draw = cards(raw.draw, 162), completed = cards(raw.completed, 162);
  if (!draw || !completed || !Array.isArray(raw.building) || raw.building.length !== 4) return null;
  const building = raw.building.map(b => cards(b, 11));
  if (building.some(b => !b)) return null;
  if (raw.phase !== "play" && raw.phase !== "roundOver" && raw.phase !== "over") return null;
  if (!int(raw.turn, 0, n - 1) || !int(raw.dealer, 0, n - 1) || !int(raw.round, 1, 1000) || !int(raw.roundPoints, 0, 100_000)) return null;
  if (!int(raw.rng, 0, 0xffffffff) || !int(raw.seq, 0, Number.MAX_SAFE_INTEGER) || !int(raw.passes, 0, 1000)) return null;
  if (raw.roundWinner !== null && !int(raw.roundWinner, 0, n - 1)) return null;
  if (raw.winner !== null && !int(raw.winner, 0, n - 1)) return null;
  const rules = isObj(raw.rules) ? cleanRules(raw.rules as never, n) : null;
  if (!rules) return null;
  const state: GameState = {
    version: 1, rules, players, turn: raw.turn, dealer: raw.dealer, draw, completed, building: building as number[][], phase: raw.phase,
    round: raw.round, roundWinner: raw.roundWinner as number | null, roundPoints: raw.roundPoints, winner: raw.winner as number | null,
    passes: raw.passes, rng: raw.rng, seq: raw.seq,
  };
  const total = draw.length + completed.length + state.building.reduce((a, b) => a + b.length, 0)
    + players.reduce((a, p) => a + p.stock.length + p.hand.length + p.discards.reduce((m, d) => m + d.length, 0), 0);
  if (total !== 162) return null;
  return state;
};

export { parseView };
