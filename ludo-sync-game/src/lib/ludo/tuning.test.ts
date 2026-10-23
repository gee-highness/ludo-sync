import { describe, expect, it } from "vitest";
import { autoAction } from "./bot";
import { applyAction, createGame, legalMoves } from "./engine";
import { BUILT_IN_PRESETS, parseTuning, sameRules } from "./tuning";
import { parseGameState } from "./validate";
import { DEFAULT_RULES, type GameState, type Rules } from "./types";

const game = (rules: Rules, dice: number[], tokens: number[]): GameState => {
  const g = createGame([{ seat: 0, name: "A", kind: "human" }, { seat: 2, name: "B", kind: "human" }], rules, 3);
  return { ...g, phase: "move", dice, rolled: dice, players: g.players.map(p => (p.seat === 0 ? { ...p, tokens } : p)) };
};

describe("tuning", () => {
  it("lets any roll out of the yard when entry is any", () => {
    const g = game({ ...DEFAULT_RULES, tuning: { entry: "any" } }, [3], [-1, -1, -1, -1]);
    expect(legalMoves(g).length).toBeGreaterThan(0);
    expect(legalMoves(game(DEFAULT_RULES, [3], [-1, -1, -1, -1]))).toHaveLength(0);
  });
  it("lets a 1 out when entry is six-or-one", () => {
    expect(legalMoves(game({ ...DEFAULT_RULES, tuning: { entry: "six-or-one" } }, [1], [-1, -1, -1, -1])).length).toBeGreaterThan(0);
  });
  it("allows overshooting only when exact finish is off", () => {
    expect(legalMoves(game(DEFAULT_RULES, [4], [55, -1, -1, -1]))).toHaveLength(0);
    const g = game({ ...DEFAULT_RULES, tuning: { exactFinish: false } }, [4], [55, -1, -1, -1]);
    const r = applyAction(g, { type: "move", token: 0, die: 4 })!;
    expect(r.state.players.find(p => p.seat === 0)!.tokens[0]).toBe(57);
  });
  it("ends the game when winTokens are home", () => {
    const g = game({ ...DEFAULT_RULES, tuning: { winTokens: 2 } }, [2], [55, 57, -1, -1]);
    const r = applyAction(g, { type: "move", token: 0, die: 2 })!;
    expect(r.state.winner).toBe(0);
  });
  it("applies Tycoon cash tuning", () => {
    const g = createGame([{ seat: 0, name: "A", kind: "human" }, { seat: 1, name: "B", kind: "human" }],
      { ...DEFAULT_RULES, tycoon: true, tuning: { startCash: 777 } }, 1);
    expect(g.tycoon!.cash[0]).toBe(777);
  });
  it("rejects out-of-range or unknown tuning", () => {
    expect(parseTuning({ winTokens: 9 })).toBeNull();
    expect(parseTuning({ nope: 1 })).toBeNull();
    expect(parseTuning({ entry: "teleport" })).toBeNull();
    expect(parseTuning({ winTokens: 2, entry: "any" })).toEqual({ winTokens: 2, entry: "any" });
  });
  it("round-trips tuned games through validation", () => {
    const g = createGame([{ seat: 0, name: "A", kind: "human" }, { seat: 1, name: "B", kind: "human" }], { ...DEFAULT_RULES, tuning: { sixesLimit: 2 } }, 1);
    expect(parseGameState(JSON.parse(JSON.stringify(g)))?.rules.tuning).toEqual({ sixesLimit: 2 });
  });
  it("every built-in preset plays to a finish with bots", () => {
    for (const preset of BUILT_IN_PRESETS) {
      let g = createGame([{ seat: 0, name: "A", kind: "bot", level: "normal" }, { seat: 2, name: "B", kind: "bot", level: "hard" }], preset.rules, 5);
      let n = 0;
      while (g.phase !== "over" && n++ < 40000) g = applyAction(g, autoAction(g)!)!.state;
      expect(g.phase, preset.name).toBe("over");
    }
  });
  it("recognises equal rules regardless of defaults spelled out", () => {
    expect(sameRules(DEFAULT_RULES, { ...DEFAULT_RULES, tuning: { entry: "six" } })).toBe(true);
  });
});
