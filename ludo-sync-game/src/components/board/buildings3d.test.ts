import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BUILDING_THEMES, ROOFS, WINDOWS, sanitizeIsland } from "@/lib/client/islands";
import { buildBuilding, buildingCacheSize, defaultSign } from "./buildings3d";

describe("island buildings", () => {
  it("builds and disposes every theme, roof, window style and level", () => {
    for (const theme of BUILDING_THEMES) for (const roof of ROOFS) for (const windows of WINDOWS) for (const level of [0, 1, 2, 3] as const) {
      const style = sanitizeIsland({ theme, roof, windows, glow: 0.6 });
      const b = buildBuilding(style, level);
      expect(b.group.children.length).toBeGreaterThan(2);
      const box = new THREE.Box3().setFromObject(b.group);
      const size = box.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThanOrEqual(0.95);
      expect(size.z).toBeLessThanOrEqual(0.95);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
      b.update?.(1.3);
      b.dispose();
    }
    expect(buildingCacheSize()).toBe(0);
  });
  it("buildings get taller with each level", () => {
    const style = sanitizeIsland({ theme: "neon", roof: "flat" });
    const heights = ([1, 2, 3] as const).map(l => { const b = buildBuilding(style, l); const h = new THREE.Box3().setFromObject(b.group).max.y; b.dispose(); return h; });
    expect(heights[1]).toBeGreaterThan(heights[0]);
    expect(heights[2]).toBeGreaterThan(heights[1]);
  });
  it("shares resources between buildings and frees them when the last goes", () => {
    const style = sanitizeIsland({ theme: "glass" });
    const a = buildBuilding(style, 2), b = buildBuilding(style, 2);
    const during = buildingCacheSize();
    a.dispose();
    expect(buildingCacheSize()).toBe(during);
    b.dispose();
    expect(buildingCacheSize()).toBe(0);
  });
  it("builds every shape, ground, finish and extra, fits the plot, and frees everything", () => {
    for (const shape of ["block", "round"]) for (const ground of ["slab", "grass", "sand", "marble", "water"]) for (const finish of ["auto", "matte", "glossy", "metallic"]) for (const level of [0, 1, 2, 3] as const) {
      const style = sanitizeIsland({ theme: "tropical", shape, ground, finish, footprint: 1.1, height: 1.5, extras: ["flags", "trees", "lamps", "fence"], lights: "#ff9ad5" });
      const b = buildBuilding(style, level);
      const size = new THREE.Box3().setFromObject(b.group).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThanOrEqual(0.95);
      expect(size.z).toBeLessThanOrEqual(0.95);
      b.dispose();
    }
    expect(buildingCacheSize()).toBe(0);
  });
  it("height changes how tall the building is", () => {
    const h = (height: number) => { const b = buildBuilding(sanitizeIsland({ theme: "neon", roof: "flat", height }), 2); const v = new THREE.Box3().setFromObject(b.group).max.y; b.dispose(); return v; };
    expect(h(1.5)).toBeGreaterThan(h(0.6));
  });
  it("has a sign name for every theme and level", () => {
    for (const t of BUILDING_THEMES) for (const l of [1, 2, 3] as const) expect(defaultSign(t, l).length).toBeLessThanOrEqual(8);
  });
});
