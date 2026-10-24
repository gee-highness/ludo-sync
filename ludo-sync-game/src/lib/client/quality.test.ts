import { describe, expect, it, vi } from "vitest";
import { TierGovernor, detectStartTier, parseQuality, stepDown, stepUp } from "./quality";

describe("quality tiers", () => {
  it("migrates old values", () => {
    expect(parseQuality("high")).toBe("high");
    expect(parseQuality("low")).toBe("low");
    expect(parseQuality("bogus")).toBe("auto");
  });
  it("steps through the ladder", () => {
    expect(stepDown("ultra")).toBe("high");
    expect(stepDown("lite")).toBeNull();
    expect(stepUp("high")).toBe("ultra");
    expect(stepUp("ultra")).toBeNull();
  });
  it("starts low on weak devices", () => {
    expect(detectStartTier({ lowPower: true, coarsePointer: true })).toBe("low");
    expect(detectStartTier(null)).toBe("medium");
  });
  it("steps down on slow frames, and up only after sustained speed", () => {
    const cb = vi.fn();
    const g = new TierGovernor(cb, () => true);
    for (let i = 0; i < 90; i++) g.frame(60, 1000 + i * 60);
    expect(cb).toHaveBeenCalledWith("down");
    cb.mockClear();
    const g2 = new TierGovernor(cb, () => true);
    let t = 30000;
    for (let i = 0; i < 90 * 8; i++) { t += 16; g2.frame(16, t); }
    expect(cb).toHaveBeenCalledWith("up");
  });
});
