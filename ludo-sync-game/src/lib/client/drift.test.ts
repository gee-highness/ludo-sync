import { describe, expect, it } from "vitest";
import { driftSwing, isDrift, turnBetween } from "./drift";

describe("drift", () => {
  it("measures the short way round", () => {
    expect(turnBetween(350, 10)).toBe(20);
    expect(turnBetween(10, 350)).toBe(-20);
    expect(turnBetween(0, 90)).toBe(90);
  });
  it("only sharp turns drift", () => {
    expect(isDrift(10)).toBe(false);
    expect(isDrift(-90)).toBe(true);
    expect(driftSwing(20)).toBe(0);
  });
  it("swings out in the direction of the turn, bounded", () => {
    expect(driftSwing(90)).toBeGreaterThan(0);
    expect(driftSwing(-90)).toBeLessThan(0);
    expect(Math.abs(driftSwing(180))).toBeLessThanOrEqual(26);
  });
});
