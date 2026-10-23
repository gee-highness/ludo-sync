import { describe, expect, it } from "vitest";
import { outlineOf, pathOf } from "./pieceShapes";
import {
  DEFAULT_DESIGN, PACKS, SHAPES, applyPack, exportDesigns, importDesigns, defaultDesigns, randomDesign, sanitizeDesign, sanitizeDesigns,
} from "./pieces";

const area = (pts: readonly (readonly [number, number])[]) =>
  Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2);

describe("piece shapes", () => {
  for (const shape of SHAPES) {
    it(`${shape} is a sane polygon`, () => {
      const o = outlineOf(shape);
      expect(o.outer.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of o.outer) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(Math.abs(x)).toBeLessThanOrEqual(0.6);
        expect(Math.abs(y)).toBeLessThanOrEqual(0.6);
      }
      expect(area(o.outer)).toBeGreaterThan(0.08);
      expect(pathOf(shape)).toMatch(/^M/);
    });
  }
});

describe("piece designs", () => {
  it("cleans bad input into a valid design", () => {
    const d = sanitizeDesign({ shape: "nope", primary: "red", size: 99, mark: "abcdef", glowStrength: -3, outline: "#ABCDEF" });
    expect(d.shape).toBe(DEFAULT_DESIGN.shape);
    expect(d.primary).toBeNull();
    expect(d.size).toBe(1.5);
    expect([...d.mark]).toHaveLength(2);
    expect(d.glowStrength).toBe(0);
    expect(d.outline).toBe("#abcdef");
  });
  it("round-trips an export and rejects junk", () => {
    const all = defaultDesigns();
    all[1][2] = randomDesign(() => 0.37);
    expect(importDesigns(exportDesigns(all))).toEqual(all);
    expect(importDesigns("{}")).toBeNull();
    expect(importDesigns("not json")).toBeNull();
  });
  it("fills missing seats with defaults", () => {
    expect(sanitizeDesigns({ 0: [{ shape: "star" }] })[0][0].shape).toBe("star");
    expect(sanitizeDesigns(null)[3]).toHaveLength(4);
  });
  it("every pack makes valid designs for every seat", () => {
    for (const pack of PACKS) for (const seat of [0, 1, 2, 3] as const) {
      const list = applyPack(pack, seat, defaultDesigns()[seat]);
      expect(list).toHaveLength(4);
      list.forEach(d => expect(sanitizeDesign(d)).toEqual(d));
    }
  });
});
