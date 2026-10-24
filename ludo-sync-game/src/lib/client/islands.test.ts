import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ISLAND, getIslands, islandFor, sanitizeIsland, sanitizeIslands, setIsland } from "./islands";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
});

describe("island styles", () => {
  it("cleans bad values into a valid style", () => {
    const s = sanitizeIsland({ theme: "nope", primary: "red", accent: "#ABCDEF", roof: "dome", windows: 5, sign: "  hello <b>world</b> and more ", glow: 9 });
    expect(s.theme).toBe(DEFAULT_ISLAND.theme);
    expect(s.primary).toBe(DEFAULT_ISLAND.primary);
    expect(s.accent).toBe("#abcdef");
    expect(s.roof).toBe("dome");
    expect(s.windows).toBe(DEFAULT_ISLAND.windows);
    expect(s.sign.length).toBeLessThanOrEqual(8);
    expect(s.sign).not.toMatch(/[<>]/);
    expect(s.glow).toBe(1);
  });
  it("keeps only seats 0 to 3 and falls back to the seat colour", () => {
    expect(Object.keys(sanitizeIslands({ 0: { theme: "glass" }, 7: { theme: "glass" } }))).toEqual(["0"]);
    expect(islandFor(2, {}, "#123456").accent).toBe("#123456");
    expect(islandFor(2, { 2: sanitizeIsland({ theme: "tropical" }) }, "#123456").theme).toBe("tropical");
  });
  it("saves a chosen island and can clear it", () => {
    setIsland(1, sanitizeIsland({ theme: "industrial", accent: "#f97316" }));
    expect(getIslands()[1]?.theme).toBe("industrial");
    expect(store.get("ludo-sync:v1:islands")).toContain("industrial");
    setIsland(1, null);
    expect(getIslands()[1]).toBeUndefined();
  });
});
