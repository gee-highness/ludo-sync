import { FINISH, SEATS, TOKENS_PER_PLAYER, YARD, type Seat } from "./board";
import { MAX_NAME_LENGTH } from "./engine";
import type { Action, BotLevel, GameState, Player, Rules } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isSeat = (v: unknown): v is Seat => isInt(v, 0, 3);

const parseRules = (v: unknown): Rules | null => {
  if (!isObj(v)) return null;
  const keys = ["threeSixes", "captureBonus", "finishBonus", "blockades", "twoDice", "safeSquares"] as const;
  const out = {} as Rules;
  for (const k of keys) {
    if (typeof v[k] !== "boolean") return null;
    out[k] = v[k] as boolean;
  }
  return out;
};

const parseDice = (v: unknown): number[] | null =>
  Array.isArray(v) && v.length <= 2 && v.every(d => isInt(d, 1, 6)) ? [...(v as number[])] : null;

const parsePlayer = (v: unknown): Player | null => {
  if (!isObj(v) || !isSeat(v.seat)) return null;
  if (typeof v.name !== "string" || v.name.length > MAX_NAME_LENGTH) return null;
  if (v.kind !== "human" && v.kind !== "bot") return null;
  let level: BotLevel | undefined;
  if (v.level !== undefined) {
    if (v.level !== "easy" && v.level !== "normal" && v.level !== "hard") return null;
    level = v.level;
  }
  const t = v.tokens;
  if (!Array.isArray(t) || t.length !== TOKENS_PER_PLAYER || !t.every(p => isInt(p, YARD, FINISH))) return null;
  return { seat: v.seat, name: v.name, kind: v.kind, level, tokens: [...(t as number[])] };
};

/** Checks an untrusted value (saved game, network snapshot) and returns a clean GameState, or null. */
export const parseGameState = (raw: unknown): GameState | null => {
  if (!isObj(raw) || raw.version !== 1) return null;
  const rules = parseRules(raw.rules);
  if (!rules) return null;
  if (!Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 4) return null;
  const players: Player[] = [];
  for (const p of raw.players) {
    const parsed = parsePlayer(p);
    if (!parsed || players.some(q => q.seat === parsed.seat)) return null;
    players.push(parsed);
  }
  if (!isInt(raw.turn, 0, players.length - 1)) return null;
  if (raw.phase !== "roll" && raw.phase !== "move" && raw.phase !== "over") return null;
  const dice = parseDice(raw.dice);
  const rolled = parseDice(raw.rolled);
  if (!dice || !rolled) return null;
  if (!isInt(raw.sixes, 0, 20)) return null;
  if (raw.earned !== null && raw.earned !== "six" && raw.earned !== "capture" && raw.earned !== "finish") return null;
  if (raw.winner !== null && !(isSeat(raw.winner) && players.some(p => p.seat === raw.winner))) return null;
  if ((raw.phase === "over") !== (raw.winner !== null)) return null;
  if (!isInt(raw.rng, 0, 0xffffffff) || !isInt(raw.seq, 0, Number.MAX_SAFE_INTEGER)) return null;
  return {
    version: 1, rules, players, turn: raw.turn, phase: raw.phase, dice, rolled, sixes: raw.sixes,
    earned: raw.earned, winner: raw.winner as Seat | null, rng: raw.rng, seq: raw.seq,
  };
};

/** Actions a remote player may request. Forfeits are decided by the host, never by a player's say-so. */
export const parsePlayerAction = (raw: unknown): Exclude<Action, { type: "forfeit" }> | null => {
  if (!isObj(raw)) return null;
  if (raw.type === "roll") return { type: "roll" };
  if (raw.type === "move" && isInt(raw.token, 0, TOKENS_PER_PLAYER - 1) && isInt(raw.die, 1, 12)) {
    return { type: "move", token: raw.token, die: raw.die };
  }
  return null;
};

export const isValidSeat = isSeat;
export const ALL_SEATS = SEATS;
