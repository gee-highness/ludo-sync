import type { Seat } from "./board";

export type BotLevel = "easy" | "normal" | "hard";
export type PlayerKind = "human" | "bot";
export type Phase = "roll" | "move" | "over";
export type BonusReason = "six" | "capture" | "finish";

export interface Rules {
  /** Rolling three sixes in a row forfeits the turn. */
  threeSixes: boolean;
  /** Capturing a token earns another roll. */
  captureBonus: boolean;
  /** Bringing a token home earns another roll. */
  finishBonus: boolean;
  /** Two of a player's tokens on one square block opponents from passing or landing. */
  blockades: boolean;
  /** Roll two dice; spend each separately, or their sum when they differ. */
  twoDice: boolean;
  /** Start squares and stars cannot be captured on. */
  safeSquares: boolean;
}

export const DEFAULT_RULES: Readonly<Rules> = {
  threeSixes: true,
  captureBonus: true,
  finishBonus: true,
  blockades: true,
  twoDice: false,
  safeSquares: true,
};

export interface PlayerSetup {
  seat: Seat;
  name: string;
  kind: PlayerKind;
  level?: BotLevel;
}

export interface Player extends PlayerSetup {
  /** Progress of each of the four tokens, see board.ts. */
  tokens: number[];
}

export interface GameState {
  version: 1;
  rules: Rules;
  /** Players in turn order; forfeited players are removed. */
  players: Player[];
  /** Index into `players` of whoever's turn it is. */
  turn: number;
  phase: Phase;
  /** Dice values still available to spend this roll. */
  dice: number[];
  /** What was rolled this turn, kept for display after the dice are spent. */
  rolled: number[];
  /** Sixes rolled in a row this turn. */
  sixes: number;
  /** Why the player will roll again once this roll's dice are spent, if they will. */
  earned: BonusReason | null;
  winner: Seat | null;
  /** Random-number generator state, so a game replays exactly. */
  rng: number;
  /** Counts every applied action. */
  seq: number;
}

export type Action =
  | { type: "roll" }
  | { type: "move"; token: number; die: number }
  | { type: "forfeit"; seat: Seat };

export interface MoveOption {
  token: number;
  /** The value being spent: one die, or the sum of two. */
  die: number;
  from: number;
  to: number;
  captures: boolean;
  finishes: boolean;
  entersBoard: boolean;
}

export type GameEvent =
  | { type: "roll"; seat: Seat; dice: number[] }
  | { type: "penalty"; seat: Seat }
  | { type: "no-moves"; seat: Seat }
  | { type: "move"; seat: Seat; token: number; die: number; from: number; to: number }
  | { type: "capture"; seat: Seat; victim: Seat; token: number }
  | { type: "finish"; seat: Seat; token: number }
  | { type: "bonus"; seat: Seat; reason: BonusReason }
  | { type: "turn"; seat: Seat }
  | { type: "forfeit"; seat: Seat }
  | { type: "win"; seat: Seat };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
