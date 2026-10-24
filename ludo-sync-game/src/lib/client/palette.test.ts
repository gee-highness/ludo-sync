import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_SEAT_INFO, SEAT_INFO } from "../ludo/board";
import { applyPalette, resolveSeatColors, sanitizeColors, sanitizePalette, tooSimilar, whiteContrast } from "./palette";
import { loadGame, saveGame } from "./save";
import { createGame } from "../ludo/engine";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
  });
});
afterEach(() => { applyPalette({}); vi.unstubAllGlobals(); });

describe("seat colour choices", () => {
  it("accepts only real hex colours", () => {
    expect(sanitizeColors({ main: "#ABCDEF", home: "red", path: null })).toEqual({ main: "#abcdef", home: null, path: null });
    expect(sanitizeColors({ main: "blue" })).toBeNull();
    expect(sanitizeColors(null)).toBeNull();
    expect(sanitizePalette({ 0: { main: "#112233" }, 1: { main: "x" }, 9: { main: "#112233" } })).toEqual({ 0: { main: "#112233", home: null, path: null } });
  });

  it("leaves the standard colours exactly as they were when nothing is chosen", () => {
    const c = resolveSeatColors(2, null);
    expect(c).toEqual({ main: BASE_SEAT_INFO[2].main, light: BASE_SEAT_INFO[2].light, dark: BASE_SEAT_INFO[2].dark, home: BASE_SEAT_INFO[2].main, path: BASE_SEAT_INFO[2].light });
  });

  it("draws a seat with its chosen pieces, home and path colours, and undoes them", () => {
    applyPalette({ 1: { main: "#ff00aa", home: "#102030", path: "#aabbcc" } });
    expect(SEAT_INFO[1].main).toBe("#ff00aa");
    expect(SEAT_INFO[1].home).toBe("#102030");
    expect(SEAT_INFO[1].path).toBe("#aabbcc");
    expect(SEAT_INFO[0].main).toBe(BASE_SEAT_INFO[0].main);
    applyPalette({});
    expect(SEAT_INFO[1].main).toBe(BASE_SEAT_INFO[1].main);
    expect(SEAT_INFO[1].home).toBe(BASE_SEAT_INFO[1].main);
  });

  it("home and path follow the pieces colour unless chosen separately", () => {
    applyPalette({ 3: { main: "#14b8a6", home: null, path: null } });
    expect(SEAT_INFO[3].home).toBe("#14b8a6");
    expect(SEAT_INFO[3].path).toBe(resolveSeatColors(3, { main: "#14b8a6", home: null, path: null }).light);
  });

  it("warns about look-alike and pale colours", () => {
    expect(tooSimilar("#e53e3e", "#e04040")).toBe(true);
    expect(tooSimilar("#e53e3e", "#3182ce")).toBe(false);
    expect(whiteContrast("#ffffcc")).toBeLessThan(3);
    expect(whiteContrast("#22603f")).toBeGreaterThan(5);
  });

  it("is saved with a local game so a resumed game keeps its colours", () => {
    const g = createGame([{ seat: 0, name: "A", kind: "human" }, { seat: 2, name: "B", kind: "bot" }]);
    saveGame(g, [0], { 2: { main: "#14b8a6", home: null, path: "#ffffff" } });
    expect(loadGame()?.palette).toEqual({ 2: { main: "#14b8a6", home: null, path: "#ffffff" } });
  });
});
