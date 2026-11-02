import type { ComponentType } from "react";
import type { RuleSchema, RuleValues } from "./rules";

export type BotLevel = "easy" | "normal" | "hard";
export interface SeatInfo { name: string; kind: "human" | "bot"; level?: BotLevel }
/** What happened, for sounds, animation and the log. `p` is the player index when one is involved. */
export interface GameEvent { type: string; p?: number; [k: string]: unknown }
export interface StepResult<S> { state: S; events: GameEvent[] }

/**
 * A game is a pure engine behind this interface. The platform supplies everything else: setup and rules editor, bots on a timer, saves, pass and play with a
 * cover screen, online rooms, nearby play, chat, results, XP, points and streaks.
 */
export interface GameDriver<S = unknown, A = unknown, V = unknown> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  schema: RuleSchema;
  /** True for games where every seat plays at once on its own board: pass and play on one device makes no sense. */
  noHotseat?: boolean;
  /** True when players hold secrets (a hand, a face-down card): pass and play covers the screen and online views are filtered. */
  hidden: boolean;
  create(seats: SeatInfo[], rules: RuleValues, seed: number): S;
  /** Null when the move is illegal. `by` is the player making it. */
  apply(state: S, action: A, by: number): StepResult<S> | null;
  /** Optional: who may act right now besides the players in `actors`, e.g. to catch a missed call or jump in out of turn. Defaults to `actors`. */
  mayAct?(state: S, player: number): boolean;
  /** Players who may move now: one in turn-based games, several in simultaneous phases, none when the game is over. */
  actors(state: S): number[];
  over(state: S): boolean;
  /** Points per player so far (live scores, shown at the table) and who won when over. */
  scores(state: S): number[];
  winners(state: S): number[];
  /** Everything one player may see; `null` is a spectator. Must be JSON and must not contain anyone else's secrets. */
  view(state: S, viewer: number | null): V;
  /** A bot's move for this player, or null if it has none. Must always be legal. */
  bot(state: S, player: number, level: BotLevel): A | null;
  /** Checks an action that arrived over the network. */
  parseAction(raw: unknown): A | null;
  /** Text for the log and screen readers. */
  describe(e: GameEvent, names: string[]): string | null;
  /** Short line telling the viewer what to do, for the banner. */
  prompt(state: S, viewer: number): string;
  /** XP/points weight: a luck-heavy game gives only cosmetic streak rewards. */
  luck?: boolean;
}

export interface PlayerInfo { name: string; kind: "human" | "bot"; level?: BotLevel }

/** What every table gets, whatever the game. */
export interface BaseView {
  you: number | null;
  players: PlayerInfo[];
  actors: number[];
  over: boolean;
  winners: number[];
  scores: number[];
  prompt: string;
}

export interface TableProps<V = unknown, A = unknown> {
  base: BaseView;
  view: V;
  act: (a: A) => void;
  /** A counter that ticks on every new frame and what happened in it, for sounds and animation. */
  frame: { id: number; events: GameEvent[] };
  rules: RuleValues;
}

export interface HowToStep { title: string; text: string }
export interface GameModule<S = unknown, A = unknown, V = unknown> {
  driver: GameDriver<S, A, V>;
  Table: ComponentType<TableProps<V, A>>;
  tagline: string;
  accent: string;
  icon: string;
  howTo: HowToStep[];
}
