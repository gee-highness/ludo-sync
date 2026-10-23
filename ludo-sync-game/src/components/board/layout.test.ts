import { describe, expect, it } from "vitest";
import { createGame } from "@/lib/ludo/engine";
import { DEFAULT_RULES } from "@/lib/ludo/types";
import { placeTokens, seatTokens } from "./layout";

const game = () => {
  const g = createGame([{ seat: 0, name: "A", kind: "human" }, { seat: 1, name: "B", kind: "human" }], DEFAULT_RULES, 1);
  // seat 1's token sits on ring square 13 + 5; seat 0's token 5 is the same square? use two seat-1 tokens on one square instead
  return { ...g, players: g.players.map(p => (p.seat === 1 ? { ...p, tokens: [5, 5, -1, -1] } : { ...p, tokens: [-1, -1, -1, -1] })) };
};

describe("token placement", () => {
  it("fans out tokens that share a square", () => {
    const placed = placeTokens(seatTokens(game()));
    const a = placed.find(t => t.seat === 1 && t.token === 0)!;
    const b = placed.find(t => t.seat === 1 && t.token === 1)!;
    expect(a.at.x).not.toBe(b.at.x);
    expect(a.scale).toBeLessThan(1);
  });

  it("leaves a token that is passing through exactly on its square and does not make others shuffle", () => {
    const g = game();
    // token 1 is mid-hop past token 0's square
    const alone = placeTokens(seatTokens({ ...g, players: g.players.map(p => (p.seat === 1 ? { ...p, tokens: [5, -1, -1, -1] } : p)) }));
    const before = alone.find(t => t.seat === 1 && t.token === 0)!;
    const passing = placeTokens(seatTokens(g), { seat: 1, token: 1 });
    const after = passing.find(t => t.seat === 1 && t.token === 0)!;
    const mover = passing.find(t => t.seat === 1 && t.token === 1)!;
    expect(after.at).toEqual(before.at);
    expect(after.scale).toBe(before.scale);
    expect(mover.at).toEqual(mover.point);
    expect(mover.scale).toBe(1);
  });
});
