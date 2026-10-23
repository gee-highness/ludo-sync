import { describe, expect, it } from "vitest";
import { createGame } from "./engine";
import { DEFAULT_RULES } from "./types";
import { parseGameState, parsePlayerAction } from "./validate";

const good = () => createGame([{ seat: 0, name: "A", kind: "human" }, { seat: 2, name: "B", kind: "bot", level: "hard" }], DEFAULT_RULES, 5);

describe("parseGameState", () => {
  it("round-trips a real state through JSON", () => {
    const g = good();
    expect(parseGameState(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });

  it.each([
    ["not an object", null],
    ["wrong version", { ...good(), version: 2 }],
    ["one player", { ...good(), players: [good().players[0]] }],
    ["duplicate seat", { ...good(), players: [good().players[0], good().players[0]] }],
    ["bad turn", { ...good(), turn: 5 }],
    ["bad phase", { ...good(), phase: "dancing" }],
    ["dice out of range", { ...good(), dice: [7] }],
    ["too many dice", { ...good(), dice: [1, 2, 3] }],
    ["token out of range", { ...good(), players: [{ ...good().players[0], tokens: [0, 0, 0, 99] }, good().players[1]] }],
    ["wrong token count", { ...good(), players: [{ ...good().players[0], tokens: [0, 0, 0] }, good().players[1]] }],
    ["winner without game over", { ...good(), winner: 0 }],
    ["game over without winner", { ...good(), phase: "over" }],
    ["winner not playing", { ...good(), phase: "over", winner: 3 }],
    ["fractional rng", { ...good(), rng: 1.5 }],
    ["missing rule", { ...good(), rules: { threeSixes: true } }],
    ["oversized name", { ...good(), players: [{ ...good().players[0], name: "x".repeat(50) }, good().players[1]] }],
    ["bad bot level", { ...good(), players: [good().players[0], { ...good().players[1], level: "god" }] }],
  ])("rejects %s", (_label, value) => {
    expect(parseGameState(value)).toBeNull();
  });

  it("drops unknown fields instead of passing them on", () => {
    const parsed = parseGameState({ ...good(), evil: "payload" }) as unknown as Record<string, unknown>;
    expect(parsed.evil).toBeUndefined();
  });
});

describe("parsePlayerAction", () => {
  it("accepts rolls and well-formed moves only", () => {
    expect(parsePlayerAction({ type: "roll" })).toEqual({ type: "roll" });
    expect(parsePlayerAction({ type: "move", token: 2, die: 6, extra: 1 })).toEqual({ type: "move", token: 2, die: 6 });
    expect(parsePlayerAction({ type: "move", token: 4, die: 6 })).toBeNull();
    expect(parsePlayerAction({ type: "move", token: 1, die: 0 })).toBeNull();
    expect(parsePlayerAction({ type: "forfeit", seat: 1 })).toBeNull();
    expect(parsePlayerAction("roll")).toBeNull();
  });
});
