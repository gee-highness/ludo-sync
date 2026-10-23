import { describe, expect, it } from "vitest";
import { createGame } from "../ludo/engine";
import { DEFAULT_RULES } from "../ludo/types";
import { YARD } from "../ludo/board";
import { planSteps, rollMs, stepMs, withToken } from "./anim";

const game = () => createGame([{ seat: 0, name: "A", kind: "human" }, { seat: 1, name: "B", kind: "human" }], DEFAULT_RULES, 1);

describe("planSteps", () => {
  it("hops square by square", () => {
    const a = withToken(game(), 0, 0, 5);
    const b = withToken(a, 0, 0, 9);
    expect(planSteps(a, b).map(s => [s.kind, s.progress])).toEqual([["hop", 6], ["hop", 7], ["hop", 8], ["hop", 9]]);
  });

  it("enters from the yard in one step", () => {
    expect(planSteps(game(), withToken(game(), 0, 2, 0))).toEqual([{ seat: 0, token: 2, progress: 0, kind: "enter" }]);
  });

  it("marks the last step into home as a finish", () => {
    const a = withToken(game(), 0, 0, 55);
    const steps = planSteps(a, withToken(a, 0, 0, 57));
    expect(steps.map(s => s.kind)).toEqual(["hop", "finish"]);
  });

  it("sends captured tokens home after the mover has landed", () => {
    let a = withToken(game(), 0, 0, 5);
    a = withToken(a, 1, 0, 48);
    let b = withToken(a, 0, 0, 9);
    b = withToken(b, 1, 0, YARD);
    const steps = planSteps(a, b);
    expect(steps.at(-1)).toEqual({ seat: 1, token: 0, progress: YARD, kind: "return" });
    expect(steps.slice(0, -1).every(s => s.seat === 0)).toBe(true);
  });

  it("plans nothing when no token moved, and ignores players who left", () => {
    expect(planSteps(game(), game())).toEqual([]);
    const gone = { ...game(), players: game().players.slice(0, 1) };
    expect(planSteps(withToken(game(), 1, 0, 3), gone)).toEqual([]);
  });
});

describe("timing", () => {
  it("scales with speed and is zero when instant", () => {
    expect(stepMs("hop", "normal")).toBeGreaterThan(stepMs("hop", "fast"));
    expect(stepMs("hop", "instant")).toBe(0);
    expect(rollMs("instant")).toBe(0);
  });
});
