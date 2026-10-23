import { describe, expect, it } from "vitest";
import { createGame } from "../ludo/engine";
import { describeFrame } from "./describe";

const g = createGame([{ seat: 0, name: "Ann", kind: "human" }, { seat: 2, name: "Bob", kind: "bot" }], undefined, 1);

describe("describeFrame", () => {
  it("narrates a capture with both names", () => {
    const lines = describeFrame([{ type: "capture", seat: 0, victim: 2, token: 1 }, { type: "bonus", seat: 0, reason: "capture" }], g);
    expect(lines.map(l => l.text)).toEqual(["Ann captured Bob's token", "Ann captured a token and rolls again"]);
  });

  it("skips plain moves but reports leaving the yard, and falls back to colour names for absent players", () => {
    expect(describeFrame([{ type: "move", seat: 0, token: 0, die: 3, from: 5, to: 8 }], g)).toEqual([]);
    expect(describeFrame([{ type: "move", seat: 0, token: 0, die: 6, from: -1, to: 0 }], g)[0].text).toBe("Ann brought a token out");
    expect(describeFrame([{ type: "forfeit", seat: 3 }], g)[0].text).toBe("Purple left the game");
  });
});
