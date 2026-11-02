import { describe, expect, it } from "vitest";
import { sanitizeRules } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { walkOf, SCHEMA, snakes as d, type SState } from "./driver";

const mk = (rules: Record<string, unknown> = {}, n = 2, seed = 3) => new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), rules, seed);
/** Puts the game in a chosen position and makes the next roll come out as wanted by searching seeds. */
const rollTo = (s: SState, want: number[]): SState => {
  for (let rng = 1; rng < 200000; rng++) {
    const t = { ...s, rng };
    const r = d.apply(t, { type: "roll" }, t.turn);
    if (r && JSON.stringify(r.state.last!.dice) === JSON.stringify(want)) return { ...s, rng };
  }
  throw new Error("no seed");
};

describe("board", () => {
  it("makes valid random layouts: unique squares, none on the ends, long enough, never within one row", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const t = mk({ ladders: 10, snakes: 10, minJump: 12 }, 2, seed);
      const { jumps, size } = t.state;
      const ends = Object.entries(jumps).flatMap(([a, b]) => [Number(a), b]);
      expect(new Set(ends).size).toBe(ends.length);
      for (const [a, b] of Object.entries(jumps)) {
        expect(Number(a)).toBeGreaterThan(1); expect(Number(a)).toBeLessThan(size);
        expect(b).toBeGreaterThan(0); expect(b).toBeLessThanOrEqual(size);
        expect(Math.abs(b - Number(a))).toBeGreaterThanOrEqual(12);
      }
    }
  });
  it("uses the classic board when asked and the board is 10 by 10", () => {
    const t = mk({ fixed: true });
    expect(t.state.jumps[1]).toBe(38);
    expect(t.state.jumps[98]).toBe(78);
    expect(Object.keys(mk({ fixed: true, cols: 8, rows: 8 }).state.jumps).length).toBeLessThanOrEqual(16);
  });
  it("the size follows the rules", () => { expect(mk({ cols: 6, rows: 5 }).state.size).toBe(30); });
});

describe("moving", () => {
  const at = (rules: Record<string, unknown>, pos: number, dice: number[], extra: Partial<SState> = {}) => {
    const t = mk({ ladders: 0, snakes: 0, dice: dice.length, ...rules });
    Object.assign(t.state, { pos: [pos, 0], turn: 0, jumps: {}, ...extra });
    t.state = rollTo(t.state, dice);
    return d.apply(t.state, { type: "roll" }, 0)!.state;
  };
  it("moves by the roll, climbs ladders and slides down snakes", () => {
    expect(at({}, 10, [3]).pos[0]).toBe(13);
    expect(at({}, 10, [3], { jumps: { 13: 40 } }).pos[0]).toBe(40);
    expect(at({}, 10, [3], { jumps: { 13: 2 } }).pos[0]).toBe(2);
  });
  it("chains only when the rule is on", () => {
    expect(at({}, 10, [3], { jumps: { 13: 40, 40: 20 } }).pos[0]).toBe(40);
    expect(at({ chain: true }, 10, [3], { jumps: { 13: 40, 40: 20 } }).pos[0]).toBe(20);
  });
  it("finishing: exact, bounce or any", () => {
    expect(at({ finish: "exact" }, 98, [5]).pos[0]).toBe(98);
    expect(at({ finish: "exact" }, 98, [2]).pos[0]).toBe(100);
    expect(at({ finish: "bounce" }, 98, [5]).pos[0]).toBe(97);
    expect(at({ finish: "any" }, 98, [5]).pos[0]).toBe(100);
    expect(at({ finish: "any" }, 98, [5]).phase).toBe("over");
  });
  it("needs a certain roll to get on the board when set", () => {
    expect(at({ enter: "any" }, 0, [2]).pos[0]).toBe(2);
    expect(at({ enter: "max" }, 0, [2]).pos[0]).toBe(0);
    expect(at({ enter: "max" }, 0, [6]).pos[0]).toBe(6);
    expect(at({ enter: "one" }, 0, [1]).pos[0]).toBe(1);
  });
  it("bumping sends others back, to the start or by the roll", () => {
    expect(at({ bump: true }, 10, [3], { pos: [10, 13] }).pos).toEqual([13, 0]);
    expect(at({ bump: true, bumpTo: "back" }, 10, [3], { pos: [10, 13] }).pos).toEqual([13, 10]);
    expect(at({}, 10, [3], { pos: [10, 13] }).pos).toEqual([13, 13]);
  });
  it("supports several dice with different sides", () => {
    const s = at({ sides: 4 }, 0, [2, 3, 4].slice(0, 3), {});
    expect(s.last!.dice.length).toBe(3);
    expect(s.last!.dice.every(x => x >= 1 && x <= 4)).toBe(true);
  });
});

describe("turns", () => {
  const roll = (rules: Record<string, unknown>, dice: number[]) => {
    const t = mk({ ladders: 0, snakes: 0, dice: dice.length, ...rules });
    Object.assign(t.state, { pos: [5, 0], turn: 0, jumps: {} });
    t.state = rollTo(t.state, dice);
    return d.apply(t.state, { type: "roll" }, 0)!.state;
  };
  it("a six gives another roll by default, doubles when chosen, and it can be off", () => {
    expect(roll({}, [6]).turn).toBe(0);
    expect(roll({}, [3]).turn).toBe(1);
    expect(roll({ bonus: "off" }, [6]).turn).toBe(1);
    expect(roll({ bonus: "doubles" }, [3, 3]).turn).toBe(0);
    expect(roll({ bonus: "doubles" }, [3, 4]).turn).toBe(1);
    expect(roll({ bonus: "both" }, [6, 2]).turn).toBe(0);
  });
  it("too many bonus rolls in a row lose the turn", () => {
    const t = mk({ ladders: 0, snakes: 0, bonusLimit: 2 });
    Object.assign(t.state, { pos: [5, 0], turn: 0, jumps: {}, bonusRun: 1 });
    t.state = rollTo(t.state, [6]);
    expect(d.apply(t.state, { type: "roll" }, 0)!.state.turn).toBe(1);
  });
  it("only the player whose turn it is may roll", () => { const t = mk(); expect(t.act((t.state.turn + 1) % 2, { type: "roll" })).toBeNull(); expect(t.act(t.state.turn, { type: "roll" })).not.toBeNull(); });
  it("the game can run on for second place", () => {
    const t = mk({ winners: 2, ladders: 0, snakes: 0 }, 3);
    Object.assign(t.state, { pos: [99, 0, 99], turn: 0, jumps: {} });
    t.state = rollTo(t.state, [1]);
    const a = d.apply(t.state, { type: "roll" }, 0)!.state;
    expect(a.phase).toBe("play");
    expect(a.finished).toEqual([0]);
    expect(a.turn).toBe(1);
  });
});

describe("rules and bots", () => {
  it("clamps rules", () => {
    const v = sanitizeRules(SCHEMA, { cols: 99, dice: 0, enter: "x", bonus: "doubles" });
    expect(v.cols).toBe(12); expect(v.dice).toBe(1); expect(v.enter).toBe("any"); expect(v.bonus).toBe("doubles");
  });
  it("bots always finish games across rule sets", { timeout: 120000 }, () => {
    const sets: Record<string, unknown>[] = [{}, { fixed: true }, { enter: "max", finish: "exact" }, { bump: true, chain: true, dice: 2, bonus: "both" }, { winners: 3, bonusLimit: 1 }, { cols: 4, rows: 4, snakes: 6, ladders: 1, finish: "bounce" }];
    for (const [i, rules] of sets.entries()) {
      const r = simulate(d, ["normal", "easy", "hard", "normal"] as BotLevel[], rules, 70 + i, 200000);
      expect(r.finished, JSON.stringify(rules)).toBe(true);
    }
  });
  it("is fully determined by its seed", () => {
    const a = simulate(d, ["easy", "easy"], { fixed: true }, 5), b = simulate(d, ["easy", "easy"], { fixed: true }, 5);
    expect(a.table.state.rolls).toEqual(b.table.state.rolls);
  });
});

describe("walking", () => {
  it("passes over every square, bounces off the end, and stays put when the roll is refused", async () => {
    expect(walkOf(0, 4, 4, 100)).toEqual([1, 2, 3, 4]);
    expect(walkOf(10, 3, 13, 100)).toEqual([11, 12, 13]);
    expect(walkOf(98, 5, 97, 100)).toEqual([99, 100, 99, 98, 97]);
    expect(walkOf(98, 5, 100, 100)).toEqual([99, 100]);
    expect(walkOf(97, 6, 97, 100)).toEqual([]);
  });
});
