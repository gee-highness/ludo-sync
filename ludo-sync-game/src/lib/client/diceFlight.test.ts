import { describe, expect, it } from "vitest";
import { BOUND, FLIGHT_SECONDS, flyDice } from "./diceFlight";
import { defaultThrow } from "./throw";

const rng = (s: number) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

describe("dice flight", () => {
  it("is the same every time for the same throw and seed", () => {
    const th = { x: 0, z: 6, vx: 3, vz: -14 };
    const a = flyDice(th, [3, 5], 7), b = flyDice(th, [3, 5], 7);
    for (const t of [0, 0.2, 0.55, 1.0, 1.1]) expect(a.frame(t)).toEqual(b.frame(t));
  });

  it("ends on exactly the faces that were rolled, at rest on the board", () => {
    for (let s = 1; s <= 40; s++) {
      const r = rng(s);
      const th = defaultThrow(r);
      const faces = s % 2 ? [1 + (s % 6)] : [1 + (s % 6), 1 + ((s * 5) % 6)];
      const f = flyDice(th, faces, s).frame(FLIGHT_SECONDS);
      expect(f.map(d => d.face)).toEqual(faces);
      for (const d of f) {
        expect(d.lift).toBe(0);
        expect(Math.abs(d.x)).toBeLessThanOrEqual(BOUND + 1e-6);
        expect(Math.abs(d.z)).toBeLessThanOrEqual(BOUND + 1e-6);
      }
    }
  });

  it("keeps two dice apart when they land", () => {
    const f = flyDice({ x: 0, z: 0, vx: 0, vz: 0.001 }, [2, 4], 3).frame(FLIGHT_SECONDS);
    expect(Math.hypot(f[0].x - f[1].x, f[0].z - f[1].z)).toBeGreaterThan(1.1);
  });

  it("bounces off the walls instead of leaving the board, even for a wild throw", () => {
    const fl = flyDice({ x: 5, z: 5, vx: 40, vz: -40 }, [6, 6], 9);
    for (let t = 0; t <= FLIGHT_SECONDS; t += 0.05) for (const d of fl.frame(t)) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(BOUND + 1e-6);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(BOUND + 1e-6);
    }
  });

  it("tumbles through faces in flight and moves continuously", () => {
    const fl = flyDice({ x: 0, z: 6, vx: 0, vz: -16 }, [4], 5);
    const seen = new Set<number>();
    let prev = fl.frame(0)[0];
    for (let t = 0.02; t < 0.8; t += 0.02) {
      const d = fl.frame(t)[0];
      seen.add(d.face);
      expect(Math.hypot(d.x - prev.x, d.z - prev.z)).toBeLessThan(0.9);
      prev = d;
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it("is at rest by the end: the last moments barely move", () => {
    const fl = flyDice({ x: 0, z: 6, vx: 0, vz: -12 }, [3], 2);
    const a = fl.frame(FLIGHT_SECONDS - 0.05)[0], b = fl.frame(FLIGHT_SECONDS)[0];
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.25);
  });
});
