import { describe, expect, it } from "vitest";
import { JOIN_ORDER, adjacent, nextFreeSeat, opposite, spreadTwo } from "./seats";

describe("seats", () => {
  it("knows which seat is across the board", () => {
    expect([0, 1, 2, 3].map(s => opposite(s as 0 | 1 | 2 | 3))).toEqual([2, 3, 0, 1]);
    expect(adjacent(0, 1)).toBe(true);
    expect(adjacent(0, 2)).toBe(false);
    expect(adjacent(3, 3)).toBe(false);
  });
  it("gives the second person the seat across from the first", () => {
    expect(nextFreeSeat(new Set([0]))).toBe(2);
    expect(nextFreeSeat(new Set([0, 2]))).toBe(1);
    expect(nextFreeSeat(new Set([0, 2, 1]))).toBe(3);
    expect(nextFreeSeat(new Set([0, 1, 2, 3]))).toBeNull();
    expect([...JOIN_ORDER].sort()).toEqual([0, 1, 2, 3]);
  });
  it("moves one of two neighbouring players across the board, and leaves everything else alone", () => {
    expect(spreadTwo([{ seat: 0 as const }, { seat: 1 as const }])).toEqual([{ seat: 0 }, { seat: 2 }]);
    expect(spreadTwo([{ seat: 1 as const }, { seat: 2 as const }])).toEqual([{ seat: 1 }, { seat: 3 }]);
    expect(spreadTwo([{ seat: 2 as const }, { seat: 3 as const }], 3)).toEqual([{ seat: 1 }, { seat: 3 }]);
    expect(spreadTwo([{ seat: 0 as const }, { seat: 3 as const }])).toEqual([{ seat: 0 }, { seat: 2 }]);
    const across = [{ seat: 0 as const }, { seat: 2 as const }];
    expect(spreadTwo(across)).toBe(across);
    const three = [{ seat: 0 as const }, { seat: 1 as const }, { seat: 2 as const }];
    expect(spreadTwo(three)).toBe(three);
  });
});
