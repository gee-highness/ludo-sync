import { describe, expect, it } from "vitest";
import { sanitizeRules } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { solitaire as d, SCHEMA, type SolState } from "./driver";
import { applyDraw, applyMove, applyUndo, deal, sig, suggest, type Board, type Card, type SAction } from "./engine";

const R = (o: Record<string, unknown> = {}) => sanitizeRules(SCHEMA, o);
const SUITS = { c: 0, d: 1, h: 2, s: 3 } as const;
/** "7h" a face-up seven of hearts, "7h-" the same face down */
const card = (t: string): Card => { const down = t.endsWith("-"); const x = down ? t.slice(0, -1) : t; const rank = ({ A: 1, T: 10, J: 11, Q: 12, K: 13 } as Record<string, number>)[x[0]] ?? Number(x[0]); const rk = x.length === 3 ? 10 : rank; const suit = SUITS[x[x.length - 1] as keyof typeof SUITS]; return { id: suit * 13 + rk - 1, up: !down }; };
const pile = (...t: string[]) => t.map(card);
const board = (over: Partial<Board> = {}): Board => ({ tab: [], stock: [], waste: [], found: [[], [], [], []], cells: [], passes: 0, score: 0, moves: 0, completed: 0, done: false, won: false, hist: [], sigs: [], ...over });
const move = (fromK: "t" | "w" | "f" | "c", fromI: number, n: number, toK: "t" | "f" | "c", toI: number): Extract<SAction, { type: "move" }> => ({ type: "move", from: { k: fromK, i: fromI }, n, to: { k: toK, i: toI } });

describe("dealing", () => {
  it("Klondike: seven columns of 1 to 7 with the top up, 24 in the stock", () => {
    const { board: b } = deal(R(), 5);
    expect(b.tab.map(p => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(b.tab.every(p => p[p.length - 1].up && p.slice(0, -1).every(c => !c.up))).toBe(true);
    expect(b.stock.length).toBe(24);
    expect(new Set([...b.tab.flat(), ...b.stock].map(c => c.id)).size).toBe(52);
  });
  it("FreeCell: eight columns all face up, and the chosen number of cells", () => {
    const { board: b } = deal(R({ variant: "freecell", cells: 3 }), 5);
    expect(b.tab.map(p => p.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(b.tab.flat().every(c => c.up)).toBe(true);
    expect(b.cells.length).toBe(3);
  });
  it("Spider: ten columns, 50 in the stock, and 1, 2 or 4 suits", () => {
    for (const suits of [1, 2, 4]) {
      const { board: b } = deal(R({ variant: "spider", suits: String(suits) }), 5);
      expect(b.tab.map(p => p.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
      expect(b.stock.length).toBe(50);
      expect(new Set([...b.tab.flat(), ...b.stock].map(c => Math.floor(c.id / 13))).size).toBe(suits);
    }
  });
  it("the same seed gives the same deal", () => { expect(deal(R(), 9).board.tab).toEqual(deal(R(), 9).board.tab); });
});

describe("Klondike moves", () => {
  it("builds down in alternating colours, and the build rule can be changed", () => {
    const b = board({ tab: [pile("7h"), pile("6c"), pile("6s")] });
    expect(applyMove(b, R(), move("t", 1, 1, "t", 0))).not.toBeNull();
    expect(applyMove(b, R(), move("t", 2, 1, "t", 0))).not.toBeNull();
    expect(applyMove(board({ tab: [pile("7h"), pile("6d")] }), R(), move("t", 1, 1, "t", 0))).toBeNull(); // red on red
    const same = board({ tab: [pile("7h"), pile("6d")] });
    expect(applyMove(same, R(), move("t", 1, 1, "t", 0))).toBeNull();
    expect(applyMove(same, R({ build: "any" }), move("t", 1, 1, "t", 0))).not.toBeNull();
    const suit = board({ tab: [pile("7h"), pile("6h")] });
    expect(applyMove(suit, R({ build: "suit" }), move("t", 1, 1, "t", 0))).not.toBeNull();
    expect(applyMove(board({ tab: [pile("7h"), pile("6c")] }), R({ build: "suit" }), move("t", 1, 1, "t", 0))).toBeNull();
  });
  it("moves a run, but only a proper run, and turns up the card underneath", () => {
    const b = board({ tab: [pile("8s"), pile("5c-", "7h", "6c")] });
    const t = applyMove(b, R(), move("t", 1, 2, "t", 0))!;
    expect(t.tab[0].map(c => c.id)).toEqual(pile("8s", "7h", "6c").map(c => c.id));
    expect(t.tab[1][0].up).toBe(true);
    expect(applyMove(board({ tab: [pile("8s"), pile("7h", "6h")] }), R(), move("t", 1, 2, "t", 0))).toBeNull();
    expect(applyMove(board({ tab: [pile("8s"), pile("7h-", "6c")] }), R(), move("t", 1, 2, "t", 0))).toBeNull(); // a face-down card is in the run
  });
  it("an empty column takes a king, or anything when chosen", () => {
    const b = board({ tab: [[], pile("Kh"), pile("5c")] });
    expect(applyMove(b, R(), move("t", 1, 1, "t", 0))).not.toBeNull();
    expect(applyMove(b, R(), move("t", 2, 1, "t", 0))).toBeNull();
    expect(applyMove(b, R({ empty: "any" }), move("t", 2, 1, "t", 0))).not.toBeNull();
  });
  it("foundations take an ace and then the same suit upwards", () => {
    let b = board({ tab: [pile("As"), pile("2s"), pile("2h")] });
    expect(applyMove(b, R(), move("t", 1, 1, "f", 3))).toBeNull(); // needs the ace first
    b = applyMove(b, R(), move("t", 0, 1, "f", 3))!;
    expect(applyMove(b, R(), move("t", 2, 1, "f", 3))).toBeNull(); // wrong suit
    expect(applyMove(b, R(), move("t", 1, 1, "f", 3))).not.toBeNull();
    expect(applyMove(b, R(), move("t", 1, 1, "f", 0))).toBeNull(); // wrong pile
  });
  it("cards come back from a foundation only if allowed", () => {
    const b = board({ tab: [pile("6c")], found: [[], [], [], pile("As", "2s", "3s", "4s", "5s")].map(x => x) as Card[][] });
    b.found = [[], [], [], pile("As", "2s", "3s", "4s", "5s")];
    b.tab = [pile("6h")];
    expect(applyMove(b, R(), move("f", 3, 1, "t", 0))).not.toBeNull();
    expect(applyMove(b, R({ fromFoundation: false }), move("f", 3, 1, "t", 0))).toBeNull();
  });
  it("draws one or three cards, and the stock can be gone through once, three times or without limit", () => {
    const stock = pile("2c-", "3c-", "4c-", "5c-");
    let b = applyDraw(board({ stock }), R())!;
    expect(b.waste.map(c => c.up)).toEqual([true]);
    expect(b.stock.length).toBe(3);
    b = applyDraw(board({ stock }), R({ draw: "3" }))!;
    expect(b.waste.length).toBe(3);
    const empty = board({ waste: pile("2c", "3c") });
    expect(applyDraw(empty, R())!.stock.length).toBe(2);
    expect(applyDraw(empty, R({ passes: "1" }))).toBeNull();
    expect(applyDraw(empty, R({ passes: "3" }))).not.toBeNull();
    expect(applyDraw({ ...empty, passes: 2 }, R({ passes: "3" }))).toBeNull();
    expect(applyDraw(board(), R())).toBeNull();
  });
  it("scores: standard, Vegas, and none", () => {
    const wt = board({ waste: pile("6c"), tab: [pile("7h")] });
    expect(applyMove(wt, R(), move("w", 0, 1, "t", 0))!.score).toBe(5);
    const tf = board({ tab: [pile("Qs", "Ac-", "As")] });
    tf.tab = [pile("Kc", "As")];
    expect(applyMove(tf, R(), move("t", 0, 1, "f", 3))!.score).toBe(10);
    expect(applyMove(tf, R({ scoring: "vegas" }), move("t", 0, 1, "f", 3))!.score).toBe(5);
    expect(applyMove(tf, R({ scoring: "none" }), move("t", 0, 1, "f", 3))!.score).toBe(0);
    expect(deal(R({ scoring: "vegas" }), 1).board.score).toBe(-52);
    const flip = board({ tab: [pile("5c-", "As")] });
    expect(applyMove(flip, R(), move("t", 0, 1, "f", 3))!.score).toBe(10 + 5);
  });
  it("undo takes a move back, and can be switched off", () => {
    const b0 = board({ tab: [pile("7h"), pile("6c")] });
    const b1 = applyMove(b0, R(), move("t", 1, 1, "t", 0))!;
    const u = applyUndo(b1, R())!;
    expect(u.tab.map(p => p.map(c => c.id))).toEqual(b0.tab.map(p => p.map(c => c.id)));
    expect(applyUndo(b1, R({ undo: false }))).toBeNull();
    expect(applyUndo(b0, R())).toBeNull();
  });
  it("wins when all 52 are on the foundations", () => {
    const full = Array.from({ length: 4 }, (_, s) => Array.from({ length: s === 3 ? 12 : 13 }, (_, r) => ({ id: s * 13 + r, up: true })));
    const b = board({ found: full as Card[][], tab: [[{ id: 3 * 13 + 12, up: true }]] });
    const w = applyMove(b, R(), move("t", 0, 1, "f", 3))!;
    expect(w.won && w.done).toBe(true);
  });
});

describe("FreeCell", () => {
  const fc = (o: Record<string, unknown> = {}) => R({ variant: "freecell", ...o });
  it("uses free cells and moves runs only as far as cells and empty columns allow", () => {
    const b = board({ tab: [pile("Kc"), pile("Qd", "Jc", "Td", "9c"), pile("2h")], cells: [null, pile("As")[0], pile("Ad")[0], pile("Ah")[0]] });
    expect(applyMove(b, fc(), move("t", 2, 1, "c", 0))).not.toBeNull();
    expect(applyMove(b, fc(), move("t", 1, 4, "t", 0))).toBeNull(); // one free cell carries two cards, not four
    expect(applyMove(b, fc({ supermove: false }), move("t", 1, 3, "t", 0))).toBeNull(); // J on K is not a build
    const two = board({ tab: [pile("Kc"), pile("Qd", "Jc")], cells: [null, null] });
    expect(applyMove(two, fc(), move("t", 1, 2, "t", 0))).not.toBeNull();
  });
  it("a card goes back from a cell, and the number of cells is the rule", () => {
    const b = board({ tab: [pile("7h")], cells: [pile("6c")[0], null] });
    expect(applyMove(b, fc(), move("c", 0, 1, "t", 0))).not.toBeNull();
    expect(deal(fc({ cells: 8 }), 1).board.cells.length).toBe(8);
  });
});

describe("Spider", () => {
  const sp = (o: Record<string, unknown> = {}) => R({ variant: "spider", suits: "4", ...o });
  it("builds on any suit but carries only same-suit runs", () => {
    const b = board({ tab: [pile("7h"), pile("6c"), pile("6s", "5s")] });
    expect(applyMove(b, sp(), move("t", 1, 1, "t", 0))).not.toBeNull();
    expect(applyMove(b, sp(), move("t", 2, 2, "t", 0))).not.toBeNull();
    const mixed = board({ tab: [pile("7h"), pile("6s", "5d")] });
    expect(applyMove(mixed, sp(), move("t", 1, 2, "t", 0))).toBeNull();
  });
  it("removes a finished King-to-Ace run and scores it", () => {
    const run = ["K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"].map(r => `${r}s`);
    const b = board({ score: 500, tab: [pile(...run), pile("As")] });
    const t = applyMove(b, sp(), move("t", 1, 1, "t", 0))!;
    expect(t.tab[0].length).toBe(0);
    expect(t.completed).toBe(1);
    expect(t.score).toBe(500 - 1 + 100);
  });
  it("deals a row from the stock, but not onto an empty column unless allowed", () => {
    const stock = Array.from({ length: 10 }, (_, i) => ({ id: i, up: false }));
    const cols = Array.from({ length: 10 }, () => pile("5s"));
    const t = applyDraw(board({ stock, tab: cols }), sp())!;
    expect(t.tab.every(p => p.length === 2)).toBe(true);
    const gap = board({ stock, tab: [[], ...cols.slice(1)] });
    expect(applyDraw(gap, sp())).toBeNull();
    expect(applyDraw(gap, sp({ dealToEmpty: true }))).not.toBeNull();
  });
});

describe("solo and race", () => {
  const mk = (n: number, rules: Record<string, unknown> = {}) => new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), rules, 11);
  it("every seat gets the same deal and its own board", () => {
    const t = mk(3);
    const [a, b, c] = t.state.boards;
    expect(a.tab.map(p => p.map(x => x.id))).toEqual(b.tab.map(p => p.map(x => x.id)));
    expect(b.tab.map(p => p.map(x => x.id))).toEqual(c.tab.map(p => p.map(x => x.id)));
    expect(a).not.toBe(b);
    expect(t.actors()).toEqual([0, 1, 2]);
  });
  it("one seat's moves never touch another's board", () => {
    const t = mk(2);
    const before = JSON.stringify(t.state.boards[1].tab);
    t.act(0, { type: "draw" });
    expect(JSON.stringify(t.state.boards[1].tab)).toBe(before);
    expect(t.state.boards[0].waste.length).toBe(1);
  });
  it("never sends face-down cards, the stock order or the history to a player", () => {
    const t = mk(2);
    const v = d.view(t.state, 0);
    expect(v.board!.tab.flat().filter(c => !c.up).every(c => c.id === -1)).toBe(true);
    expect(v.board!.stock.every(c => c.id === -1)).toBe(true);
    expect(JSON.stringify(v)).not.toContain('"hist"');
    expect(JSON.stringify(v)).not.toContain('"sigs"');
    expect(v.others.length).toBe(2);
  });
  it("first to finish wins the race, or play on for the best score", () => {
    const t = mk(2, { race: "first" });
    const win = (i: number) => { const b = t.state.boards[i]; b.found = Array.from({ length: 4 }, (_, s) => Array.from({ length: 12 }, (_, r) => ({ id: s * 13 + r, up: true }))); b.tab = [[{ id: 12, up: true }], [{ id: 25, up: true }], [{ id: 38, up: true }], [{ id: 51, up: true }]]; b.stock = []; };
    win(0);
    expect(t.act(0, { type: "move", from: { k: "t", i: 0 }, n: 1, to: { k: "f", i: 0 } })).not.toBeNull();
    for (const [i, s] of [1, 2, 3].entries()) t.act(0, { type: "move", from: { k: "t", i: i + 1 }, n: 1, to: { k: "f", i: s } });
    expect(t.state.order).toEqual([0]);
    expect(t.over).toBe(true);
    expect(d.winners(t.state)).toEqual([0]);
    expect(t.act(1, { type: "draw" })).toBeNull(); // the race is over
  });
  it("giving up ends your game, and when everyone has finished the game is over", () => {
    const t = mk(2);
    t.act(0, { type: "giveup" });
    expect(t.actors()).toEqual([1]);
    t.act(1, { type: "giveup" });
    expect(t.over).toBe(true);
    expect(d.winners(t.state)).toEqual([]);
  });
  it("parses only well-formed actions", () => {
    expect(d.parseAction({ type: "move", from: { k: "t", i: 2 }, n: 3, to: { k: "f", i: 1 } })).toEqual({ type: "move", from: { k: "t", i: 2 }, n: 3, to: { k: "f", i: 1 } });
    expect(d.parseAction({ type: "move", from: { k: "x", i: 2 }, n: 3, to: { k: "f", i: 1 } })).toBeNull();
    expect(d.parseAction({ type: "move", from: { k: "t", i: 2 }, n: 99, to: { k: "f", i: 1 } })).toBeNull();
    expect(d.parseAction({ type: "undo" })).toEqual({ type: "undo" });
  });
});

describe("hints and bots", () => {
  it("suggests a move that helps, preferring the foundation", () => {
    const b = board({ tab: [pile("As"), pile("7h"), pile("6c")] });
    const s = suggest(b, R())!;
    expect(s.move!.to.k).toBe("f");
  });
  it("does not suggest going round in circles", () => {
    const b = board({ tab: [pile("7h"), pile("6c")] });
    const first = suggest(b, R())!;
    const moved = applyMove(b, R(), first.move!)!;
    moved.sigs = [sig(b), sig(moved)];
    const next = suggest(moved, R());
    expect(!next || !next.move || sig(applyMove(moved, R(), next.move)!) !== sig(b)).toBe(true);
  });
  it("bots always finish: they win or give up, for every game and level", { timeout: 240000 }, () => {
    for (const rules of [{}, { draw: "3", passes: "3" }, { variant: "freecell" }, { variant: "spider", suits: "1" }, { variant: "spider", suits: "2" }]) for (const levels of [["easy"], ["normal"], ["normal", "easy"]] as BotLevel[][]) {
      const r = simulate(d, levels, rules, 33, 30000);
      expect(r.finished, JSON.stringify([rules, levels, r.steps])).toBe(true);
    }
    for (const rules of [{}, { variant: "freecell" }]) expect(simulate(d, ["hard"], rules, 5, 30000).finished).toBe(true);
  });
  it("the hard bot wins some deals: it plays ahead", { timeout: 240000 }, () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) { const r = simulate(d, ["hard"], { variant: "freecell" }, seed, 30000); if (d.winners(r.table.state).length) wins++; }
    expect(wins).toBeGreaterThan(0);
  });
});

describe("rules", () => {
  it("fills defaults and clamps", () => {
    const v = R({ cells: 99, suits: "9", variant: "nope" });
    expect(v.cells).toBe(8); expect(v.suits).toBe("2"); expect(v.variant).toBe("klondike");
  });
});
export type { SolState };
