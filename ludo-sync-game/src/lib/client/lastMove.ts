import { YARD, type Seat } from "../ludo/board";
import type { GameEvent, GameState } from "../ludo/types";

/** The most recent thing a token did, so the board can keep showing where it came from and where it went. */
export interface LastMove {
  seat: Seat;
  token: number;
  /** Progress before and after, in the same units as the board (see board.ts). */
  from: number;
  to: number;
  die: number;
  captured?: { seat: Seat; token: number };
}

export const lastMoveOf = (events: GameEvent[]): LastMove | null => {
  let found = null as LastMove | null;
  for (const e of events) {
    if (e.type === "move") found = { seat: e.seat, token: e.token, from: e.from, to: e.to, die: e.die };
    else if (e.type === "capture") {
      const cur: LastMove | null = found;
      if (cur && cur.seat === e.seat) found = { ...cur, captured: { seat: e.victim, token: e.token } };
    }
  }
  return found;
};

const nameOf = (state: GameState, seat: Seat) => state.players.find(p => p.seat === seat)?.name ?? "Someone";

/** One plain sentence about a move, for the line under the status bar. */
export const describeLastMove = (m: LastMove, state: GameState): string => {
  const who = nameOf(state, m.seat);
  const how = m.from === YARD ? "brought a token out" : `moved ${m.to - m.from} square${m.to - m.from === 1 ? "" : "s"}`;
  return m.captured ? `${who} ${how} and sent ${nameOf(state, m.captured.seat)} home` : `${who} ${how}`;
};

/** Who plays after the current player. */
export const nextSeat = (state: GameState): Seat | null => {
  if (state.phase === "over" || state.players.length < 2) return null;
  return state.players[(state.turn + 1) % state.players.length].seat;
};
