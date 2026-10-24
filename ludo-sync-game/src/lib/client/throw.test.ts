import { describe, expect, it } from "vitest";
import { MAX_THROW_SPEED, defaultThrow, flickFrom, isThrow, setPendingThrow, takePendingThrow, toThrow } from "./throw";

describe("throwing the dice", () => {
  it("reads speed and direction from the end of a drag", () => {
    const s = Array.from({ length: 11 }, (_, i) => ({ x: i * 20, y: 0, t: i * 16 }));
    const f = flickFrom(s);
    expect(f.vx).toBeGreaterThan(1000);
    expect(Math.abs(f.vy)).toBeLessThan(1);
    expect(isThrow(f)).toBe(true);
  });
  it("ignores taps and slow drags", () => {
    expect(isThrow(flickFrom([{ x: 10, y: 10, t: 0 }, { x: 12, y: 11, t: 80 }]))).toBe(false);
    expect(isThrow(flickFrom([{ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 900 }]))).toBe(false);
    expect(isThrow(flickFrom([]))).toBe(false);
  });
  it("caps a wild swipe", () => {
    const t = toThrow(0, 0, 900, 900);
    expect(Math.hypot(t.vx, t.vz)).toBeCloseTo(MAX_THROW_SPEED, 5);
  });
  it("hands a throw over once, and only while fresh", () => {
    expect(takePendingThrow()).toBeNull();
    setPendingThrow(defaultThrow(() => 0.5));
    expect(takePendingThrow()).not.toBeNull();
    expect(takePendingThrow()).toBeNull();
  });
  it("a default throw heads from the viewer's side into the board", () => {
    const t = defaultThrow(() => 0.5);
    expect(t.z).toBeGreaterThan(0);
    expect(t.vz).toBeLessThan(0);
  });
});
