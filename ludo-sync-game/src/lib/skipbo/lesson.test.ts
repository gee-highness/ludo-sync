import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { LESSON } from "./lesson";
import type { GameEvent } from "./types";

describe("the lesson", () => {
  it("has steps whose goal is reached by their solution, and not before", () => {
    expect(LESSON.length).toBeGreaterThanOrEqual(6);
    for (const step of LESSON) {
      let s = step.start();
      expect(s.phase, step.id).toBe("play");
      expect(s.turn, step.id).toBe(0);
      const all: GameEvent[] = [];
      for (const [i, a] of step.solution.entries()) {
        expect(step.done(all), `${step.id} should not be done before move ${i}`).toBe(false);
        const r = applyAction(s, a);
        expect(r, `${step.id} move ${i} is legal`).not.toBeNull();
        s = r!.state;
        all.push(...r!.events);
      }
      expect(step.done(all), `${step.id} is done after its solution`).toBe(true);
    }
  });
  it("gives each step some words", () => {
    for (const s of LESSON) { expect(s.title.length).toBeGreaterThan(2); expect(s.text.length).toBeGreaterThan(30); expect(s.more.length).toBeGreaterThan(10); }
    expect(new Set(LESSON.map(s => s.id)).size).toBe(LESSON.length);
  });
});
