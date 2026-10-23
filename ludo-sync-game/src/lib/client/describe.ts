import { SEAT_INFO, YARD, type Seat } from "../ludo/board";
import type { BonusReason, GameEvent, GameState } from "../ludo/types";

export interface LogLine {
  /** Seat the line is about, for colouring. */
  seat: Seat;
  text: string;
}

const REASON: Record<BonusReason, string> = { six: "rolled a six", capture: "captured a token", finish: "got a token home" };

const nameOf = (state: GameState, seat: Seat) => state.players.find(p => p.seat === seat)?.name ?? SEAT_INFO[seat].name;

/** Plain-language lines for what just happened; null means nothing worth telling. */
export const describeEvent = (e: GameEvent, state: GameState): LogLine | null => {
  const who = nameOf(state, e.seat);
  switch (e.type) {
    case "roll": return { seat: e.seat, text: `${who} rolled ${e.dice.join(" and ")}` };
    case "penalty": return { seat: e.seat, text: `${who} rolled three sixes and loses the turn` };
    case "no-moves": return { seat: e.seat, text: `${who} has no move` };
    case "move": return e.from === YARD ? { seat: e.seat, text: `${who} brought a token out` } : null;
    case "capture": return { seat: e.seat, text: `${who} captured ${nameOf(state, e.victim)}'s token` };
    case "finish": return { seat: e.seat, text: `${who} got a token home` };
    case "bonus": return { seat: e.seat, text: `${who} ${REASON[e.reason]} and rolls again` };
    case "turn": return { seat: e.seat, text: `${who}'s turn` };
    case "forfeit": return { seat: e.seat, text: `${who} left the game` };
    case "win": return { seat: e.seat, text: `${who} wins!` };
  }
};

export const describeFrame = (events: GameEvent[], state: GameState): LogLine[] =>
  events.map(e => describeEvent(e, state)).filter((l): l is LogLine => l !== null);
