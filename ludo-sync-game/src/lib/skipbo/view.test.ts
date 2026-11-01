import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "./engine";
import { chooseAction } from "./bot";
import { parseAction, parseView, viewOf, hintFor } from "./view";
import { parseGameState } from "./validate";
import type { GameState } from "./types";

const game = (n = 3, seed = 9): GameState => createGame(Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind: "human" as const })), {}, seed);

describe("what each player may see", () => {
  it("shows your hand, but only counts for everyone else's, and never the stock under the top card or the draw pile", () => {
    const g = game();
    const me = g.turn;
    const v = viewOf(g, me);
    expect(v.players[me].hand).toEqual(g.players[me].hand);
    v.players.forEach((p, i) => { if (i !== me) expect(p.hand).toBeNull(); });
    const text = JSON.stringify(v);
    // nothing of the hidden cards appears in the view: the stock is a count and a top card only
    expect(v.players[0].stockCount).toBe(30);
    expect(text).not.toContain("\"stock\"");
    expect(text).not.toContain("\"draw\"");
    expect(v.drawCount).toBe(g.draw.length);
  });
  it("survives JSON and rejects anything damaged", () => {
    const v = viewOf(game(), 0);
    expect(parseView(JSON.parse(JSON.stringify(v)))).toEqual(v);
    expect(parseView({ ...v, players: [v.players[0]] })).toBeNull();
    expect(parseView({ ...v, turn: 9 })).toBeNull();
    expect(parseView({ ...v, building: [[], [], []] })).toBeNull();
    expect(parseView({ ...v, players: v.players.map(p => ({ ...p, hand: [99] })) })).toBeNull();
    expect(parseView(null)).toBeNull();
  });
  it("gives the same hint from a view as the bot would from the full game", () => {
    let g = game(2, 4);
    for (let i = 0; i < 30 && g.phase === "play"; i++) {
      const full = chooseAction(g, "hard");
      expect(hintFor(viewOf(g, g.turn))).toEqual(full);
      g = applyAction(g, full!)!.state;
    }
    expect(hintFor(viewOf(g, (g.turn + 1) % 2))).toBeNull();
  });
});

describe("actions from the network", () => {
  it("accepts well-formed actions only", () => {
    expect(parseAction({ type: "play", source: { from: "hand", index: 2 }, to: 1 })).toEqual({ type: "play", source: { from: "hand", index: 2 }, to: 1 });
    expect(parseAction({ type: "play", source: { from: "stock" }, to: 3 })).toEqual({ type: "play", source: { from: "stock" }, to: 3 });
    expect(parseAction({ type: "discard", index: 0, pile: 3 })).toEqual({ type: "discard", index: 0, pile: 3 });
    expect(parseAction({ type: "endTurn" })).toEqual({ type: "endTurn" });
    for (const bad of [null, 5, { type: "play" }, { type: "play", source: { from: "hand", index: 9 }, to: 1 }, { type: "play", source: { from: "x" }, to: 1 },
      { type: "discard", index: -1, pile: 0 }, { type: "discard", index: 0, pile: 4 }, { type: "boom" }]) expect(parseAction(bad)).toBeNull();
  });
});

describe("saved games", () => {
  it("round-trip, and a damaged deck is refused", () => {
    const g = game(4, 2);
    expect(parseGameState(JSON.parse(JSON.stringify(g)))).toEqual(g);
    const bad = JSON.parse(JSON.stringify(g));
    bad.players[0].stock.pop();
    expect(parseGameState(bad)).toBeNull();
    expect(parseGameState({ ...g, turn: 8 })).toBeNull();
    expect(parseGameState("nope")).toBeNull();
  });
});
