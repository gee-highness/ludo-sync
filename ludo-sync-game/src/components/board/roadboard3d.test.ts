import { describe, expect, it } from "vitest";
import { paintCentreTop, paintRoadBoard, ROAD_STEP, ROAD_Y } from "./roadboard3d";

/** A canvas context that only records what was drawn. */
const recorder = () => {
  const calls: Record<string, number> = {};
  const ctx = new Proxy({}, {
    get: (_t, k: string) => {
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: () => undefined });
      return () => { calls[k] = (calls[k] ?? 0) + 1; };
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

describe("3D road board", () => {
  it("paints every square, the yards and the middle, for any set of players", () => {
    for (const playing of [[0, 2], [0, 1, 2, 3], [1, 3], [0, 1]] as const) {
      const { ctx, calls } = recorder();
      paintRoadBoard(ctx, 1024, new Set(playing));
      expect(calls.fillRect).toBeGreaterThan(200);
      expect(calls.fill).toBeGreaterThan(8);
      const top = recorder();
      paintCentreTop(top.ctx, 256, new Set(playing));
      expect(top.calls.arc).toBeGreaterThanOrEqual(2);
    }
  });
  it("keeps the middle higher than the road", () => {
    expect(ROAD_STEP).toBeGreaterThan(0.1);
    expect(ROAD_Y).toBeGreaterThan(0);
  });
});
