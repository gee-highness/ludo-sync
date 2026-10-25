import { describe, expect, it } from "vitest";
import { createGame } from "../ludo/engine";
import { YARD } from "../ludo/board";
import type { GameEvent } from "../ludo/types";
import { describeLastMove, lastMoveOf, nextSeat } from "./lastMove";

const game = () => createGame([{ seat: 0, name: "Ann", kind: "human" }, { seat: 2, name: "Bo", kind: "bot" }], undefined, 7);

describe("last move", () => {
  it("finds the move and any capture made with it", () => {
    const events: GameEvent[] = [
      { type: "roll", seat: 0, dice: [6] },
      { type: "move", seat: 0, token: 2, die: 6, from: 10, to: 16 },
      { type: "capture", seat: 0, victim: 2, token: 1 },
      { type: "bonus", seat: 0, reason: "capture" },
    ];
    expect(lastMoveOf(events)).toEqual({ seat: 0, token: 2, from: 10, to: 16, die: 6, captured: { seat: 2, token: 1 } });
  });
  it("returns null when nothing moved, and ignores a capture by someone else", () => {
    expect(lastMoveOf([{ type: "roll", seat: 0, dice: [3] }, { type: "no-moves", seat: 0 }])).toBeNull();
    expect(lastMoveOf([{ type: "move", seat: 0, token: 0, die: 1, from: 1, to: 2 }, { type: "capture", seat: 2, victim: 0, token: 0 }])?.captured).toBeUndefined();
  });
  it("describes moves in plain words", () => {
    const s = game();
    expect(describeLastMove({ seat: 0, token: 0, from: YARD, to: 0, die: 6 }, s)).toBe("Ann brought a token out");
    expect(describeLastMove({ seat: 0, token: 0, from: 3, to: 7, die: 4 }, s)).toBe("Ann moved 4 squares");
    expect(describeLastMove({ seat: 2, token: 0, from: 3, to: 4, die: 1, captured: { seat: 0, token: 1 } }, s)).toBe("Bo moved 1 square and sent Ann home");
  });
  it("names whoever plays next", () => {
    const s = game();
    expect(nextSeat(s)).toBe(2);
    expect(nextSeat({ ...s, turn: 1 })).toBe(0);
    expect(nextSeat({ ...s, phase: "over" })).toBeNull();
  });
});
