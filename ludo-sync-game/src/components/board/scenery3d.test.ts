import { describe, expect, it } from "vitest";
import { loop } from "./scenery3d";

describe("street loop", () => {
  for (const reverse of [false, true]) {
    it(`stays on the rounded square and moves smoothly (reverse: ${reverse})`, () => {
      const R = 9.7, n = 400;
      let prev = loop(0, R, 1.3, reverse);
      let travelled = 0;
      for (let i = 1; i <= n; i++) {
        const p = loop(i / n, R, 1.3, reverse);
        expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThanOrEqual(R + 1e-6);
        expect(Math.hypot(p.dx, p.dz)).toBeCloseTo(1, 5);
        const step = Math.hypot(p.x - prev.x, p.z - prev.z);
        expect(step).toBeLessThan(0.2);
        // it really heads the way it says
        expect((p.x - prev.x) * p.dx + (p.z - prev.z) * p.dz).toBeGreaterThan(0);
        travelled += step;
        prev = p;
      }
      const total = 4 * (2 * (R - 1.3)) + 2 * Math.PI * 1.3;
      expect(travelled).toBeGreaterThan(total * 0.97);
      expect(travelled).toBeLessThan(total * 1.03);
    });
  }
});
