import { describe, expect, it } from "vitest";
import { progressPct } from "./offline";

describe("offline progress", () => {
  it("is a whole percentage that stays in range", () => {
    expect(progressPct(0, 100)).toBe(0);
    expect(progressPct(37, 100)).toBe(37);
    expect(progressPct(1, 3)).toBe(33);
    expect(progressPct(120, 100)).toBe(100);
    expect(progressPct(-4, 100)).toBe(0);
    expect(progressPct(5, 0)).toBe(0);
  });
});
