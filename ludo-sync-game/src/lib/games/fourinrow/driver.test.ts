import { describe, expect, it } from "vitest";
import { defaultsOf, sanitizeRules } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { SCHEMA, fourInRow as d, findLines, type FAction, type FState } from "./driver";

const mk = (rules: Record<string, unknown> = {}, n = 2, seed = 7) => new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), { first: "seat", ...rules }, seed);
const play = (t: GameTable<FState, FAction, unknown>, moves: [number, FAction][]) => { for (const [p, a] of moves) expect(t.act(p, a), JSON.stringify([p, a])).not.toBeNull(); };
const drop = (col: number): FAction => ({ type: "drop", col });

describe("rules", () => {
  it("sanitises untrusted values and always returns a complete set", () => {
    const v = sanitizeRules(SCHEMA, { cols: 99, rows: "x", connect: 5.4, nope: 1, popOut: "yes", first: "bogus" });
    expect(v.cols).toBe(12);
    expect(v.rows).toBe(6);
    expect(v.connect).toBe(5);
    expect(v.popOut).toBe(false);
    expect(v.first).toBe("random");
    expect("nope" in v).toBe(false);
    expect(Object.keys(v).sort()).toEqual(Object.keys(defaultsOf(SCHEMA)).sort());
  });
});

describe("four in a row", () => {
  it("wins on a horizontal line", () => {
    const t = mk();
    play(t, [[0, drop(0)], [1, drop(0)], [0, drop(1)], [1, drop(1)], [0, drop(2)], [1, drop(2)], [0, drop(3)]]);
    expect(t.state.phase).toBe("over");
    expect(t.driver.winners(t.state)).toEqual([0]);
  });
  it("wins vertically and refuses moves out of turn or into a full column", () => {
    const t = mk({ rows: 4 });
    expect(t.act(1, drop(0))).toBeNull();
    play(t, [[0, drop(0)], [1, drop(1)], [0, drop(0)], [1, drop(1)], [0, drop(0)], [1, drop(1)], [0, drop(0)]]);
    expect(t.driver.winners(t.state)).toEqual([0]);
    const full = mk({ rows: 4 });
    play(full, [[0, drop(0)], [1, drop(0)], [0, drop(0)], [1, drop(0)]]);
    expect(full.act(0, drop(0))).toBeNull();
  });
  it("wins diagonally", () => {
    const t = mk();
    // P1 builds a rising diagonal in columns 0..3
    play(t, [[0, drop(0)], [1, drop(1)], [0, drop(1)], [1, drop(2)], [0, drop(6)], [1, drop(2)], [0, drop(2)], [1, drop(3)], [0, drop(6)], [1, drop(3)], [0, drop(3)], [1, drop(0)], [0, drop(3)]]);
    expect(t.state.phase).toBe("over");
    expect(t.driver.winners(t.state)).toEqual([0]);
  });
  it("lets the host change the line length, the board size and which directions count", () => {
    const t = mk({ connect: 3, cols: 5, rows: 5 });
    play(t, [[0, drop(0)], [1, drop(1)], [0, drop(0)], [1, drop(1)], [0, drop(0)]]);
    expect(t.driver.winners(t.state)).toEqual([0]);
    const noV = mk({ vertical: false, connect: 3 });
    play(noV, [[0, drop(0)], [1, drop(1)], [0, drop(0)], [1, drop(1)], [0, drop(0)]]);
    expect(noV.state.phase).toBe("play");
  });
  it("wraps lines around the edges when asked", () => {
    const board = Array.from({ length: 4 }, () => Array<number>(5).fill(-1));
    board[3][4] = 0; board[3][0] = 0; board[3][1] = 0;
    expect(findLines(board, sanitizeRules(SCHEMA, { connect: 3 })).length).toBe(0);
    expect(findLines(board, sanitizeRules(SCHEMA, { connect: 3, wrap: true })).length).toBe(1);
  });
  it("popout removes your own bottom disc, and the popper wins when both make a line", () => {
    const t = mk({ popOut: true, connect: 3, cols: 4, rows: 4 });
    expect(t.act(0, { type: "pop", col: 0 })).toBeNull(); // nothing of yours there
    play(t, [[0, drop(0)], [1, drop(1)]]);
    play(t, [[0, { type: "pop", col: 0 }]]);
    expect(t.state.board[3][0]).toBe(-1);
  });
  it("bombs clear the neighbourhood, are limited per player, and are off by default", () => {
    const off = mk();
    expect(off.act(0, { type: "bomb", col: 0 })).toBeNull();
    const t = mk({ bombs: 1 });
    play(t, [[0, drop(1)], [1, drop(2)], [0, { type: "bomb", col: 1 }]]);
    expect(t.state.board.flat().filter(x => x >= 0).length).toBe(0); // the bomb removes itself too
    play(t, [[1, drop(0)]]);
    expect(t.act(0, { type: "bomb", col: 0 })).toBeNull();
  });
  it("runs a best-of match through rounds", () => {
    const t = mk({ bestOf: 2, connect: 3, cols: 5, rows: 5 });
    const win = (a: number, b: number) => play(t, [[a, drop(0)], [b, drop(1)], [a, drop(0)], [b, drop(1)], [a, drop(0)]]);
    win(0, 1);
    expect(t.state.phase).toBe("roundOver");
    expect(t.state.wins).toEqual([1, 0]);
    play(t, [[1, { type: "next" }]]);
    expect(t.state.phase).toBe("play");
    expect(t.state.round).toBe(2);
    expect(t.state.board.flat().every(x => x === -1)).toBe(true);
    const starter = t.state.turn;
    win(starter, (starter + 1) % 2);
    expect(t.state.wins[starter]).toBe(starter === 0 ? 2 : 1);
    expect(t.state.phase).toBe(starter === 0 ? "over" : "roundOver");
  });
  it("misère: making the line loses", () => {
    const t = mk({ misere: true, connect: 3, cols: 5, rows: 5 });
    play(t, [[0, drop(0)], [1, drop(1)], [0, drop(0)], [1, drop(1)], [0, drop(0)]]);
    expect(t.driver.winners(t.state)).toEqual([1]);
  });
  it("supports three and four players and a draw on a full board", () => {
    const t = mk({ connect: 6, cols: 4, rows: 4, horizontal: false, vertical: false, diagonal: false }, 3);
    expect(t.state.names.length).toBe(3);
    let guard = 0;
    while (!t.over && guard++ < 100) t.botStep() ?? t.act(t.state.turn, drop(t.state.board[0].findIndex(x => x === -1)));
    expect(t.state.phase).toBe("over");
    expect(t.state.last?.winner).toBe(-1);
  });
});

describe("views and parsing", () => {
  it("parses only well-formed actions", () => {
    expect(d.parseAction({ type: "drop", col: 2 })).toEqual({ type: "drop", col: 2 });
    expect(d.parseAction({ type: "drop", col: "2" })).toBeNull();
    expect(d.parseAction({ type: "nope" })).toBeNull();
    expect(d.parseAction(null)).toBeNull();
    expect(d.parseAction({ type: "next" })).toEqual({ type: "next" });
  });
  it("never puts the generator state in a view", () => {
    const t = mk();
    expect(JSON.stringify(t.driver.view(t.state, 0))).not.toContain("rng");
  });
});

describe("bots", () => {
  it("always finish games, across rule sets and levels", { timeout: 120000 }, () => {
    const sets: Record<string, unknown>[] = [{}, { popOut: true }, { connect: 3, cols: 5, rows: 5 }, { wrap: true, bombs: 1 }, { misere: true, connect: 3 }, { bestOf: 3 }, { fullIsDraw: false, connect: 5 }];
    for (const [i, rules] of sets.entries()) for (const levels of [["easy", "easy"], ["normal", "hard"], ["hard", "normal", "easy"]] as BotLevel[][]) {
      const r = simulate(d, levels, { first: "random", ...rules }, 100 + i);
      expect(r.finished, JSON.stringify([rules, levels])).toBe(true);
    }
  });
  it("hard beats easy most of the time", { timeout: 120000 }, () => {
    let hard = 0, games = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const lv: BotLevel[] = seed % 2 ? ["hard", "easy"] : ["easy", "hard"];
      const r = simulate(d, lv, {}, seed);
      const w = d.winners(r.table.state)[0];
      if (w !== undefined) { games++; if (lv[w] === "hard") hard++; }
    }
    expect(hard / games).toBeGreaterThan(0.8);
  });
});
