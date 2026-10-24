import { FINISH, YARD, type Seat } from "../ludo/board";
import type { GameState } from "../ludo/types";
import type { SpeedPref } from "./settings";

export type StepKind = "hop" | "enter" | "finish" | "return";

export interface AnimStep {
  seat: Seat;
  token: number;
  /** Where the token is after this step. */
  progress: number;
  kind: StepKind;
}

const BASE_MS: Record<StepKind, number> = { hop: 170, enter: 280, finish: 320, return: 460 };
const FACTOR: Record<SpeedPref, number> = { normal: 1, fast: 0.5, instant: 0 };

export const stepMs = (kind: StepKind, speed: SpeedPref) => Math.round(BASE_MS[kind] * FACTOR[speed]);
/** How long the dice take. The 3D board throws them across the table, which takes longer than the flat board's tumble. */
export const rollMs = (speed: SpeedPref, long = false) => Math.round((long ? 1100 : 650) * FACTOR[speed]);

/**
 * Works out how tokens travel to get from one state to the next: movers hop square by square,
 * then any captured tokens fly back to their yards. Purely a function of the two states, so a
 * remote player's screen animates exactly like the local one.
 */
export const planSteps = (prev: GameState, next: GameState): AnimStep[] => {
  const movers: AnimStep[] = [];
  const returns: AnimStep[] = [];
  for (const np of next.players) {
    const pp = prev.players.find(p => p.seat === np.seat);
    if (!pp) continue;
    np.tokens.forEach((to, token) => {
      const from = pp.tokens[token];
      if (from === to) return;
      if (to === YARD) {
        returns.push({ seat: np.seat, token, progress: YARD, kind: "return" });
      } else if (from === YARD) {
        movers.push({ seat: np.seat, token, progress: to, kind: "enter" });
      } else if (to > from) {
        for (let p = from + 1; p <= to; p++) {
          movers.push({ seat: np.seat, token, progress: p, kind: p === FINISH ? "finish" : "hop" });
        }
      }
    });
  }
  return [...movers, ...returns];
};

/** A copy of `state` with one token moved, used to show a half-finished animation. */
export const withToken = (state: GameState, seat: Seat, token: number, progress: number): GameState => ({
  ...state,
  players: state.players.map(p =>
    p.seat === seat ? { ...p, tokens: p.tokens.map((t, i) => (i === token ? progress : t)) } : p,
  ),
});
