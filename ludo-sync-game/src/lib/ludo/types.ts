import type { Seat } from "./board";

export type BotLevel = "easy" | "normal" | "hard";
export type PlayerKind = "human" | "bot";
export type Phase = "roll" | "move" | "decide" | "over";
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
  /** Tycoon mode: squares can be bought, rented, built on, and money decides who stays in. */
  tycoon?: boolean;
  /** Fine-tuning; see RuleTuning. */
  tuning?: Partial<RuleTuning>;
}

export type EntryRule = "six" | "six-or-one" | "any";

/** Fine-tuning for every game mode. Anything left out takes its default from DEFAULT_TUNING. */
export interface RuleTuning {
  /** Which dice let a token leave the yard. */
  entry: EntryRule;
  /** Must the last step into the centre be an exact count? If not, overshooting still gets home. */
  exactFinish: boolean;
  /** A six earns another roll. */
  sixBonus: boolean;
  /** Sixes in a row that lose the turn (when "three sixes" is on). */
  sixesLimit: number;
  /** Tokens a player needs home to win, 1 to 4. */
  winTokens: number;
  /** Tycoon: starting cash. */
  startCash: number;
  /** Tycoon: paid when a token leaves the yard. */
  enterBonus: number;
  /** Tycoon: paid when a token gets home. */
  homeBonus: number;
  /** Tycoon: taken from the victim of a capture. */
  captureLoot: number;
  /** Tycoon: paid on a tax square. */
  tax: number;
  /** Tycoon: multiplies all rent. */
  rentFactor: number;
  /** Tycoon: most buildings per square, 0 to 3. */
  maxBuild: number;
}

export const DEFAULT_TUNING: Readonly<RuleTuning> = {
  entry: "six", exactFinish: true, sixBonus: true, sixesLimit: 3, winTokens: 4,
  startCash: 1500, enterBonus: 100, homeBonus: 250, captureLoot: 50, tax: 100, rentFactor: 1, maxBuild: 3,
};

export const tuningOf = (rules: Rules): RuleTuning => ({ ...DEFAULT_TUNING, ...rules.tuning });

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

/** What is waiting on a decision from the player whose turn it is. */
export interface PendingDecision {
  seat: Seat;
  /** Ring index of the square they landed on. */
  ring: number;
  kind: "buy" | "build";
}

/** The economy of a Tycoon game. Arrays are indexed by seat (cash) or ring index (owner, level). */
export interface TycoonState {
  cash: number[];
  /** Seat owning each ring square, or -1. */
  owner: number[];
  /** Houses built on each square, 0 to 3. */
  level: number[];
  pending: PendingDecision | null;
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
  /** Present only when `rules.tycoon` is on. */
  tycoon?: TycoonState;
}

export type Action =
  | { type: "roll" }
  | { type: "move"; token: number; die: number }
  | { type: "forfeit"; seat: Seat }
  /** Tycoon: act on the square the player just landed on. */
  | { type: "buy" }
  | { type: "pass" }
  | { type: "build" };

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
  | { type: "win"; seat: Seat }
  | { type: "money"; seat: Seat; amount: number; note: string; other?: Seat }
  | { type: "buy"; seat: Seat; ring: number; price: number }
  | { type: "build"; seat: Seat; ring: number; level: number }
  | { type: "card"; seat: Seat; deck: "chance" | "chest"; text: string }
  | { type: "bankrupt"; seat: Seat };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
