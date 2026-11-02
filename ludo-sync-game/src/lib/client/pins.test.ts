import { describe, expect, it } from "vitest";
import { cleanPins, orderByPins, withPin } from "./pins";

describe("pinned games", () => {
  it("pins in order, unpins, and never duplicates", () => {
    expect(withPin([], "ludo", true)).toEqual(["ludo"]);
    expect(withPin(["ludo", "casino"], "ludo", true)).toEqual(["casino", "ludo"]);
    expect(withPin(["ludo", "casino"], "ludo", false)).toEqual(["casino"]);
    expect(withPin(["ludo"], "nope", false)).toEqual(["ludo"]);
  });
  it("puts pinned games first in pin order, the rest in their usual order", () => {
    const games = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const r = orderByPins(games, ["c", "a"]);
    expect(r.pinned.map(g => g.id)).toEqual(["c", "a"]);
    expect(r.others.map(g => g.id)).toEqual(["b", "d"]);
  });
  it("ignores pins for games that no longer exist", () => {
    const r = orderByPins([{ id: "a" }, { id: "b" }], ["gone", "b"]);
    expect(r.pinned.map(g => g.id)).toEqual(["b"]);
    expect(r.others.map(g => g.id)).toEqual(["a"]);
  });
  it("cleans stored data", () => {
    expect(cleanPins(null)).toEqual([]);
    expect(cleanPins(["ludo", "ludo", 4, "BAD ID", "casino"])).toEqual(["ludo", "casino"]);
    expect(cleanPins(Array.from({ length: 100 }, (_, i) => `game-${i}`)).length).toBe(40);
  });
});
