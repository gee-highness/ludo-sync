import { describe, expect, it } from "vitest";
import { SKIES, phaseAt, resolvePhase, scenePlan, trafficPlan, weatherPlan } from "./scenery";

describe("time of day", () => {
  it("splits the day into day, dusk and night", () => {
    expect([0, 3, 5, 5.9, 6, 12, 16.9, 17, 19.9, 20, 23.9].map(phaseAt)).toEqual(["night", "night", "night", "dusk", "day", "day", "day", "dusk", "dusk", "night", "night"]);
    expect(phaseAt(30)).toBe("day");
    expect(phaseAt(-2)).toBe("night");
  });
  it("lets the player pin a time", () => {
    expect(resolvePhase("auto", 13)).toBe("day");
    expect(resolvePhase("night", 13)).toBe("night");
    expect(resolvePhase("dusk", 2)).toBe("dusk");
  });
  it("darkens the board more as it gets darker, and only lights lamps when it is not day", () => {
    expect(SKIES.day.dim).toBe(0);
    expect(SKIES.dusk.dim).toBeGreaterThan(SKIES.day.dim);
    expect(SKIES.night.dim).toBeGreaterThan(SKIES.dusk.dim);
    expect(SKIES.night.dim).toBeLessThanOrEqual(0.5);
    expect(SKIES.day.lit).toBe(false);
    expect(SKIES.night.lit && SKIES.night.stars).toBe(true);
  });
});

describe("scenery plans", () => {
  it("are the same for the same seed and different for another", () => {
    expect(scenePlan(5, [0, 2])).toEqual(scenePlan(5, [0, 2]));
    expect(JSON.stringify(scenePlan(5, [0, 2]))).not.toBe(JSON.stringify(scenePlan(6, [0, 2])));
    expect(weatherPlan("rain", 3)).toEqual(weatherPlan("rain", 3));
    expect(trafficPlan(3, [0, 1])).toEqual(trafficPlan(3, [0, 1]));
  });
  it("keep everything inside the picture and use only the players' islands", () => {
    const plan = scenePlan(9, [1, 3]);
    for (const p of plan) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(420); expect(p.size).toBeGreaterThan(0); }
    const owners = new Set(plan.filter(p => p.kind === "building").map(p => p.seat));
    expect([...owners].sort()).toEqual([1, 3]);
    expect(plan.filter(p => p.kind === "building").length).toBeGreaterThan(5);
    expect(plan.some(p => p.kind === "lamp")).toBe(true);
  });
  it("makes no weather when it is clear, and a bounded amount otherwise", () => {
    expect(weatherPlan("clear", 1)).toEqual([]);
    for (const k of ["rain", "snow"] as const) {
      const d = weatherPlan(k, 1, 40);
      expect(d).toHaveLength(40);
      expect(d.every(x => x.x >= 0 && x.x <= 100 && x.dur > 0 && x.size > 0)).toBe(true);
    }
    expect(Math.max(...weatherPlan("rain", 1).map(d => d.dur))).toBeLessThan(Math.min(...weatherPlan("snow", 1).map(d => d.dur)) + 5);
  });
  it("sends a few different vehicles past", () => {
    const t = trafficPlan(4, [0, 1, 2, 3], 6);
    expect(t).toHaveLength(6);
    expect(t.every(p => p.vehicle !== ("none" as never) && p.dur > 20)).toBe(true);
    expect(new Set(t.map(p => p.lane)).size).toBe(2);
  });
});
