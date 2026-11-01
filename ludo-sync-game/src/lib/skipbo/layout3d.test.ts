import { describe, expect, it } from "vitest";
import { CARD_W, CLUSTER, columnsFor, handSlots, layoutTable, seatOrder } from "./layout3d";

const overlap = (a: { x: number; z: number; w: number }, b: { x: number; z: number; w: number }) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6 && Math.abs(a.z - b.z) < 1.4;

describe("3D table layout", () => {
  it("seats everyone for every table size and screen shape without clusters overlapping", () => {
    for (const aspect of [0.46, 0.75, 1, 1.6, 2.2]) for (let n = 1; n <= 5; n++) {
      const l = layoutTable(n, aspect);
      expect(l.opponents).toHaveLength(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = l.opponents[i], b = l.opponents[j];
        expect(overlap({ x: a.at.x, z: a.at.z, w: CLUSTER.width * a.scale }, { x: b.at.x, z: b.at.z, w: CLUSTER.width * b.scale }), `${n} opponents at ${aspect}: ${i} and ${j}`).toBe(false);
      }
      for (const o of l.opponents) {
        expect(o.at.x - (CLUSTER.width * o.scale) / 2).toBeGreaterThanOrEqual(l.bounds.minX - 1e-6);
        expect(o.at.x + (CLUSTER.width * o.scale) / 2).toBeLessThanOrEqual(l.bounds.maxX + 1e-6);
        expect(o.at.z).toBeGreaterThan(l.bounds.minZ);
        expect(o.at.z).toBeLessThan(-1.2);
      }
    }
  });
  it("keeps the shared piles clear of everyone", () => {
    const l = layoutTable(5, 0.5);
    const rowW = l.centre.building.at(-1)!.x - l.centre.draw.x;
    expect(rowW).toBeGreaterThan(CARD_W * 4);
    for (const o of l.opponents) expect(o.at.z + 1).toBeLessThan(l.centre.draw.z - 0.45);
    expect(l.me.discards.at(-1)!.x).toBeLessThan(l.bounds.maxX);
    expect(l.me.stock.x).toBeGreaterThan(l.bounds.minX);
  });
  it("uses fewer columns on a narrow screen", () => {
    expect(columnsFor(5, 0.46)).toBe(2);
    expect(columnsFor(5, 1)).toBe(3);
    expect(columnsFor(5, 2)).toBe(5);
    expect(columnsFor(1, 2)).toBe(1);
  });
  it("fans the hand symmetrically", () => {
    const s = handSlots(5, { x: 0, z: 4 });
    expect(s[0].x).toBeCloseTo(-s[4].x);
    expect(s[2].x).toBeCloseTo(0);
    expect(handSlots(0, { x: 0, z: 0 })).toEqual([]);
  });
  it("orders opponents by who plays after you", () => {
    expect(seatOrder(4, 1)).toEqual([2, 3, 0]);
    expect(seatOrder(3, null)).toEqual([1, 2]);
  });
});
