import { describe, expect, it } from "vitest";
import { defaultsOf, sanitizeRules, type RuleValues } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { SCHEMA, cfgOf, checkers as d, legalMoves, startBoard, type Board, type CAction, type CState, type Sq } from "./driver";

const mk = (rules: Record<string, unknown> = {}, seed = 3) => new GameTable(d, [{ name: "Red", kind: "human" as const }, { name: "White", kind: "human" as const }], rules, seed);
const E = -1;
const empty = (n = 8): Board => Array.from({ length: n }, () => Array<number>(n).fill(E));
const cfg = (r: Record<string, unknown> = {}) => cfgOf({ ...defaultsOf(SCHEMA), ...r } as RuleValues);
const mv = (...path: Sq[]): CAction => ({ type: "move", path });

describe("setup", () => {
  it("fills three rows of twelve each on a standard board", () => {
    const b = startBoard(8, 3);
    expect(b.flat().filter(v => v === 0)).toHaveLength(12);
    expect(b.flat().filter(v => v === 1)).toHaveLength(12);
    expect(b[7][0]).toBe(0); // bottom left is a dark square holding Red
  });
  it("sanitises untrusted rules", () => {
    const v = sanitizeRules(SCHEMA, { size: 99, crowning: "bogus", flying: "yes", drawMoves: 3 });
    expect(v.size).toBe(12);
    expect(v.crowning).toBe("ends");
    expect(v.flying).toBe(false);
    expect(v.drawMoves).toBe(10);
  });
});

describe("moves", () => {
  it("men step forward only", () => {
    const b = empty(); b[5][2] = 0;
    const m = legalMoves(b, cfg(), 0);
    expect(m.map(x => x.path[0]).sort()).toEqual([[4, 1], [4, 3]]);
  });
  it("a capture is compulsory and a plain step is then refused", () => {
    const b = empty(); b[5][2] = 0; b[4][3] = 1; b[7][0] = 0;
    const m = legalMoves(b, cfg(), 0);
    expect(m).toHaveLength(1);
    expect(m[0].captured).toEqual([[4, 3]]);
    expect(legalMoves(b, cfg({ mandatory: false }), 0).length).toBeGreaterThan(1);
  });
  it("chains captures and cannot jump the same piece twice", () => {
    const b = empty(); b[7][0] = 0; b[6][1] = 1; b[4][3] = 1; b[2][5] = 1;
    const m = legalMoves(b, cfg(), 0);
    expect(m).toHaveLength(1);
    expect(m[0].path).toEqual([[5, 2], [3, 4], [1, 6]]);
    expect(m[0].captured).toHaveLength(3);
  });
  it("men capture backwards only when allowed", () => {
    const b = empty(); b[3][2] = 0; b[4][3] = 1;
    expect(legalMoves(b, cfg(), 0).every(m => !m.captured.length)).toBe(true);
    expect(legalMoves(b, cfg({ backward: true }), 0).some(m => m.captured.length === 1)).toBe(true);
  });
  it("flying kings slide and capture from a distance", () => {
    const b = empty(); b[7][0] = 2; b[3][4] = 1;
    const m = legalMoves(b, cfg({ flying: true }), 0);
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(x => x.captured.length === 1)).toBe(true);
    expect(m.map(x => x.path[0]).sort()).toEqual([[2, 5], [1, 6], [0, 7]].sort());
    const plain = legalMoves(b, cfg(), 0);
    expect(plain.every(x => !x.captured.length)).toBe(true);
  });
  it("majority rule forces the longest capture", () => {
    const b = empty(); b[7][0] = 0; b[6][1] = 1; b[4][3] = 1; b[4][5] = 0; b[3][6] = 1;
    const loose = legalMoves(b, cfg(), 0), strict = legalMoves(b, cfg({ majority: true }), 0);
    expect(loose.some(m => m.captured.length === 1)).toBe(true);
    expect(strict.every(m => m.captured.length === 2)).toBe(true);
  });
});

describe("playing", () => {
  it("crowns on the far row, and the turn ends there by default", () => {
    const t = mk();
    const s = t.state as CState;
    s.board = empty(); s.board[1][2] = 0; s.board[6][1] = 1; s.turn = 0;
    expect(t.act(0, mv([1, 2], [0, 1]))).not.toBeNull();
    expect((t.state as CState).board[0][1]).toBe(2);
    expect((t.state as CState).lastMove?.crowned).toBe(true);
  });
  it("refuses moves out of turn, illegal routes and bad actions", () => {
    const t = mk();
    expect(t.act(1, mv([2, 1], [3, 0]))).toBeNull();
    expect(t.act(0, mv([5, 0], [3, 2]))).toBeNull();
    expect(d.parseAction({ type: "move", path: [[1, 1]] })).toBeNull();
    expect(d.parseAction({ type: "move", path: [[1, 1], [99, 2]] })).toBeNull();
    expect(d.parseAction({ type: "move", path: [[5, 0], [4, 1]] })).not.toBeNull();
  });
  it("a side with no pieces or no moves loses", () => {
    const t = mk();
    const s = t.state as CState;
    s.board = empty(); s.board[4][3] = 0; s.board[3][2] = 1; s.turn = 0;
    expect(t.act(0, mv([4, 3], [2, 1]))).not.toBeNull();
    expect((t.state as CState).phase).toBe("over");
    expect(d.winners(t.state)).toEqual([0]);
  });
  it("calls a draw when nothing happens for too long", () => {
    const t = mk({ drawMoves: 10 });
    const s = t.state as CState;
    s.board = empty(); s.board[7][0] = 2; s.board[0][7] = 3; s.turn = 0; s.quiet = 19;
    expect(t.act(0, mv([7, 0], [6, 1]))).not.toBeNull();
    expect((t.state as CState).phase).toBe("over");
    expect(d.winners(t.state)).toEqual([]);
  });
  it("shows the legal moves to the table in the view", () => {
    const v = d.view(mk().state, 0);
    expect(v.moves.length).toBe(7);
  });
});

describe("bots", () => {
  for (const preset of [{}, { flying: true, backward: true, majority: true, crowning: "continues" }, { size: 10, rowsFilled: 4, flying: true, backward: true }, { size: 6, rowsFilled: 2, mandatory: false }]) {
    it(`finish whole games with every level: ${JSON.stringify(preset)}`, () => {
      for (const level of ["easy", "normal"] as BotLevel[]) {
        const r = simulate(d, [level, level], { first: "random", ...preset }, 11, 800);
        expect(r.finished, level).toBe(true);
      }
    });
  }
  it("a hard bot beats an easy one most of the time", () => {
    let hard = 0;
    for (let i = 0; i < 4; i++) {
      const levels: BotLevel[] = i % 2 ? ["easy", "hard"] : ["hard", "easy"];
      const r = simulate(d, levels, { first: "seat" }, 100 + i, 800);
      if (d.winners(r.table.state)[0] === (i % 2 ? 1 : 0)) hard++;
    }
    expect(hard).toBeGreaterThanOrEqual(3);
  }, 120_000);
});
