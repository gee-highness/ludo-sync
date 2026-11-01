/** 1 to 12 are numbered cards; 0 is a Skip-Bo wildcard. */
export type Card = number;
export const WILD: Card = 0;
export const TOP_VALUE = 12;
export const HAND_SIZE = 5;
export const BUILDING_PILES = 4;
export const DISCARD_PILES = 4;
export const NUMBERED_SETS = 12;
export const WILD_COUNT = 18;
export const DECK_SIZE = NUMBERED_SETS * TOP_VALUE + WILD_COUNT;

export type BotLevel = "easy" | "normal" | "hard";
export type PlayerKind = "human" | "bot";
/** play: someone's turn; roundOver: waiting for the next round (tournament); over: the game is finished. */
export type Phase = "play" | "roundOver" | "over";

export interface Rules {
  /** Cards in each player's stock pile. The official game deals 30 (2 to 4 players) or 20 (5 or 6). */
  stockSize: number;
  /** Several rounds scored 25 + 5 a card, first to `target`; otherwise the first stock to empty wins at once. */
  tournament: boolean;
  target: number;
}

export interface PlayerSetup { name: string; kind: PlayerKind; level?: BotLevel }

export interface Player extends PlayerSetup {
  /** The stock pile: the last card is the face-up one. */
  stock: Card[];
  hand: Card[];
  /** Four personal discard piles, the last card of each being the one on top. */
  discards: Card[][];
  score: number;
}

export interface GameState {
  version: 1;
  rules: Rules;
  players: Player[];
  turn: number;
  dealer: number;
  /** The shared draw pile; the last card is drawn first. */
  draw: Card[];
  /** Completed building piles, shuffled back into the draw pile when it runs out. */
  completed: Card[];
  /** Four building piles; the height of a pile is its length, and an empty pile waits for a 1. */
  building: Card[][];
  phase: Phase;
  round: number;
  /** Who emptied their stock this round (set in roundOver and over). */
  roundWinner: number | null;
  roundPoints: number;
  /** Who won the whole game (set in over). */
  winner: number | null;
  /** Turns passed in a row because no one could do anything; ends a stalled game. */
  passes: number;
  rng: number;
  seq: number;
}

export type Source = { from: "hand"; index: number } | { from: "stock" } | { from: "discard"; pile: number };

export type Action =
  | { type: "play"; source: Source; to: number }
  | { type: "discard"; index: number; pile: number }
  /** Only when the hand is empty and there is nothing to draw. */
  | { type: "endTurn" }
  | { type: "nextRound" };

export type GameEvent =
  | { type: "deal"; round: number }
  | { type: "draw"; player: number; count: number; bonus: boolean }
  | { type: "reshuffle" }
  | { type: "play"; player: number; source: Source; card: Card; to: number; value: number }
  | { type: "flip"; player: number }
  | { type: "pileDone"; to: number }
  | { type: "discard"; player: number; card: Card; pile: number }
  | { type: "pass"; player: number }
  | { type: "turn"; player: number }
  | { type: "roundEnd"; winner: number; points: number }
  | { type: "gameOver"; winner: number };

export interface StepResult { state: GameState; events: GameEvent[] }
