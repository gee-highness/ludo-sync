import { describe, expect, it } from "vitest";
import { photoName, sizeFor } from "./photo";

describe("photo helpers", () => {
  it("keeps the shape of the board", () => {
    expect(sizeFor({ w: 16, h: 16 }, 1080)).toEqual({ w: 1080, h: 1080 });
    expect(sizeFor({ w: 4, h: 2 }, 800)).toEqual({ w: 800, h: 400 });
    expect(sizeFor({ w: 0, h: 0 }, 10).w).toBeGreaterThanOrEqual(64);
  });
  it("names files by date and time", () => {
    expect(photoName(new Date(2026, 9, 25, 7, 5, 9))).toBe("ludo-sync-20261025-070509.png");
  });
});
