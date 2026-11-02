import { describe, expect, it } from "vitest";
import { sanitizeRules } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { SCHEMA, crazyEights as d, canPlay, type EState } from "./driver";

const c = (rank: number, suit: number) => suit * 13 + rank - 1; // suits 0 clubs 1 diamonds 2 hearts 3 spades

const mk = (hands: number[][], topCard: number, rules: Record<string, unknown> = {}, extra: Partial<EState> = {}): EState => {
  const t = new GameTable(d, hands.map((_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), { target: 0, ...rules }, 7);
  const s = t.state;
  const used = new Set([...hands.flat(), topCard]);
  s.hands = hands.map(h => h.slice());
  s.discard = [topCard];
  s.deck = Array.from({ length: 52 }, (_, i) => i).filter(i => !used.has(i)).reverse();
  s.suit = Math.floor(topCard / 13);
  s.turn = 0; s.dir = 1; s.pending = 0; s.drew = 0; s.phase = "play";
  return Object.assign(s, extra);
};
const ok = (r: ReturnType<typeof d.apply>) => { expect(r).not.toBeNull(); return r!.state; };
const play = (s: EState, p: number, cards: number[], suit?: number, by = p) => d.apply(s, { type: "play", cards, suit }, by);

describe("playing", () => {
  it("matches suit or rank and refuses the rest", () => {
    const s = mk([[c(5, 2), c(9, 0), c(3, 1)], [c(2, 0), c(4, 0)]], c(5, 0));
    expect(play(s, 0, [c(5, 2)])).not.toBeNull(); // rank
    expect(play(s, 0, [c(9, 0)])).not.toBeNull(); // suit
    expect(play(s, 0, [c(3, 1)])).toBeNull();
    expect(play(s, 1, [c(2, 0)], undefined, 1)).toBeNull(); // not their turn
  });
  it("eights are wild by default and need a suit; with the rule off they are ordinary", () => {
    const s = mk([[c(8, 1), c(2, 3)], [c(2, 0), c(4, 0)]], c(5, 0));
    expect(play(s, 0, [c(8, 1)])).toBeNull();
    const t = ok(play(s, 0, [c(8, 1)], 3));
    expect(t.suit).toBe(3);
    expect(t.turn).toBe(1);
    const off = mk([[c(8, 1), c(2, 3)], [c(2, 0), c(4, 0)]], c(5, 0), { p8: "none" });
    expect(play(off, 0, [c(8, 1)])).toBeNull();
  });
  it("every rank's power can be chosen: skip, reverse, draw two, play again, wild", () => {
    const base = (rule: Record<string, unknown>, card: number) => mk([[card, c(9, 3)], [c(2, 3)], [c(4, 3)]], c(card % 13 + 1, 3), rule);
    expect(ok(play(base({ pQ: "skip" }, c(12, 3)), 0, [c(12, 3)])).turn).toBe(2);
    const rev = ok(play(base({ pK: "reverse" }, c(13, 3)), 0, [c(13, 3)]));
    expect(rev.dir).toBe(-1); expect(rev.turn).toBe(2);
    const dd = ok(play(base({ p2: "draw2" }, c(2, 3)), 0, [c(2, 3)]));
    expect(dd.pending).toBe(2);
    expect(ok(d.apply(dd, { type: "draw" }, 1)).hands[1].length).toBe(3);
    expect(ok(play(base({ p7: "again" }, c(7, 3)), 0, [c(7, 3)])).turn).toBe(0);
    expect(ok(play(base({ pJ: "wild" }, c(11, 3)), 0, [c(11, 3)], 1)).suit).toBe(1);
  });
  it("with two players reverse acts as a skip", () => {
    const s = mk([[c(1, 3), c(9, 3)], [c(2, 3)]], c(5, 3), { pA: "reverse" });
    expect(ok(play(s, 0, [c(1, 3)])).turn).toBe(0);
  });
});

describe("stacking and multi-play", () => {
  it("stacks draw twos only when allowed", () => {
    const s = mk([[c(2, 3), c(9, 3)], [c(2, 1), c(4, 1)], [c(5, 0)]], c(5, 3), { p2: "draw2", stack: true });
    const a = ok(play(s, 0, [c(2, 3)]));
    const b = ok(play(a, 1, [c(2, 1)]));
    expect(b.pending).toBe(4);
    expect(ok(d.apply(b, { type: "draw" }, 2)).hands[2].length).toBe(5);
    const off = mk([[c(2, 3), c(9, 3)], [c(2, 1), c(4, 1)], [c(5, 0)]], c(5, 3), { p2: "draw2" });
    expect(play(ok(play(off, 0, [c(2, 3)])), 1, [c(2, 1)])).toBeNull();
  });
  it("plays several cards of one rank together when allowed, and the last card decides the suit", () => {
    const s = mk([[c(6, 3), c(6, 1), c(6, 0), c(9, 2)], [c(2, 3)]], c(5, 3), { multi: true });
    const t = ok(play(s, 0, [c(6, 3), c(6, 1)]));
    expect(t.hands[0].length).toBe(2);
    expect(t.discard.slice(-2)).toEqual([c(6, 3), c(6, 1)]);
    expect(t.suit).toBe(1);
    expect(play(mk([[c(6, 3), c(7, 1)], [c(2, 3)]], c(5, 3), { multi: true }), 0, [c(6, 3), c(7, 1)])).toBeNull(); // not one rank
    expect(play(mk([[c(6, 3), c(6, 1)], [c(2, 3)]], c(5, 3)), 0, [c(6, 3), c(6, 1)])).toBeNull(); // rule off
  });
  it("two skips together skip two players", () => {
    const s = mk([[c(12, 3), c(12, 1), c(9, 3)], [c(2, 3)], [c(4, 3)], [c(3, 3)]], c(5, 3), { pQ: "skip", multi: true });
    expect(ok(play(s, 0, [c(12, 3), c(12, 1)])).turn).toBe(3);
  });
});

describe("drawing", () => {
  it("draw one: then play it if it fits, or the turn passes", () => {
    const s = mk([[c(9, 1), c(4, 1)], [c(2, 3)]], c(5, 3));
    s.deck = [c(7, 2), c(8, 2)]; // the next card drawn is the last: 8 of hearts (wild)
    const t = ok(d.apply(s, { type: "draw" }, 0));
    expect(t.hands[0].length).toBe(3);
    expect(t.turn).toBe(0); // the drawn eight is wild and playable
    const u = mk([[c(9, 1), c(4, 1)], [c(2, 3)]], c(5, 3));
    u.deck = [c(7, 2), c(9, 2)];
    expect(ok(d.apply(u, { type: "draw" }, 0)).turn).toBe(1);
  });
  it("draw until you can play, and draw up to three", () => {
    const u = mk([[c(9, 1), c(4, 1)], [c(2, 3)]], c(5, 3), { draw: "until" });
    u.deck = [c(3, 3), c(8, 2), c(9, 2), c(7, 2)]; // draws 7h, 9h, 8h (wild playable)
    const t = ok(d.apply(u, { type: "draw" }, 0));
    expect(t.hands[0].length).toBe(5);
    const three = mk([[c(9, 1), c(4, 1)], [c(2, 3)]], c(5, 3), { draw: "three" });
    three.deck = [c(3, 0), c(6, 0), c(7, 2), c(9, 2)];
    let x = ok(d.apply(three, { type: "draw" }, 0));
    expect(x.turn).toBe(0);
    x = ok(d.apply(x, { type: "draw" }, 0));
    x = ok(d.apply(x, { type: "draw" }, 0));
    expect(x.turn).toBe(1);
  });
  it("cannot draw when you can play, unless that rule is off", () => {
    const s = mk([[c(5, 1), c(4, 1)], [c(2, 3)]], c(5, 3));
    expect(d.apply(s, { type: "draw" }, 0)).toBeNull();
    expect(d.apply(mk([[c(5, 1), c(4, 1)], [c(2, 3)]], c(5, 3), { mustPlay: false }), { type: "draw" }, 0)).not.toBeNull();
  });
  it("cannot pass without drawing first", () => {
    const s = mk([[c(9, 1), c(4, 1)], [c(2, 3)]], c(5, 3));
    expect(d.apply(s, { type: "pass" }, 0)).toBeNull();
  });
});

describe("jump in, going out and scoring", () => {
  it("jump in with an identical card out of turn", () => {
    const s = mk([[c(9, 1)], [c(5, 3), c(2, 0)], [c(4, 0)]], c(5, 3), { jumpIn: true });
    expect(d.mayAct!(s, 1)).toBe(true);
    expect(ok(play(s, 1, [c(5, 3)], undefined, 1)).turn).toBe(2);
    expect(play(s, 2, [c(4, 0)], undefined, 2)).toBeNull();
  });
  it("the winner scores the cards left, with eights and face cards at their chosen values", () => {
    const s = mk([[c(9, 3)], [c(8, 1), c(12, 0), c(3, 2)], [c(1, 1)]], c(5, 3), { target: 100, eightValue: 40, faceValue: 15 });
    const t = ok(play(s, 0, [c(9, 3)]));
    expect(t.phase).toBe("roundOver");
    expect(t.roundPoints).toBe(40 + 15 + 3 + 1);
    const n = ok(d.apply(t, { type: "next" }, 2));
    expect(n.phase).toBe("play");
    expect(n.hands.every(h => h.length === 5)).toBe(true);
    const single = mk([[c(9, 3)], [c(3, 2)]], c(5, 3), { target: 0 });
    expect(ok(play(single, 0, [c(9, 3)])).phase).toBe("over");
  });
  it("a power card can be forbidden as the last card", () => {
    const s = mk([[c(12, 3)], [c(3, 2)]], c(5, 3), { pQ: "skip", endOnPower: false });
    expect(canPlay(s, 0, c(12, 3))).toBe(false);
  });
  it("a final draw-two still makes the next player draw", () => {
    const s = mk([[c(2, 3)], [c(3, 2), c(4, 2)]], c(5, 3), { p2: "draw2" });
    const t = ok(play(s, 0, [c(2, 3)]));
    expect(t.hands[1].length).toBe(4);
  });
});

describe("views, parsing and bots", () => {
  it("shows only your own hand until the round ends", () => {
    const s = mk([[c(9, 3)], [c(3, 2), c(4, 2)]], c(5, 3));
    const v = d.view(s, 1);
    expect(v.hand).toEqual([c(3, 2), c(4, 2)]);
    expect(JSON.stringify(v)).not.toContain('"hands"');
    expect(v.reveal).toBeNull();
  });
  it("parses only well-formed actions and clamps rules", () => {
    expect(d.parseAction({ type: "play", cards: [3, 4], suit: 2 })).toEqual({ type: "play", cards: [3, 4], suit: 2 });
    expect(d.parseAction({ type: "play", cards: "x" })).toBeNull();
    expect(d.parseAction({ type: "play", cards: [999] })).toBeNull();
    expect(sanitizeRules(SCHEMA, { decks: 9, p8: "nope" }).p8).toBe("wild");
  });
  it("bots finish whole matches across rule sets, levels and 2 to 8 players", { timeout: 240000 }, () => {
    const sets: Record<string, unknown>[] = [{ target: 60 }, { target: 0, p2: "draw2", stack: true, multi: true }, { target: 60, pA: "reverse", pQ: "skip", pJ: "skip", p7: "again", jumpIn: true }, { target: 0, draw: "until", mustPlay: false }, { target: 0, draw: "three", decks: 2 }, { target: 60, endOnPower: false, p2: "draw2" }];
    for (const [i, rules] of sets.entries()) for (const levels of [["easy", "easy"], ["normal", "hard", "easy"], ["hard", "normal", "easy", "normal", "hard", "easy", "easy", "normal"]] as BotLevel[][]) {
      const r = simulate(d, levels, rules, 80 + i, 60000);
      expect(r.finished, JSON.stringify([rules, levels.length, r.steps])).toBe(true);
    }
  });
  it("conserves every card", () => {
    const r = simulate(d, ["normal", "hard"], { target: 0, p2: "draw2", multi: true, decks: 2 }, 5);
    const s = r.table.state;
    expect([...s.deck, ...s.discard, ...s.hands.flat()].length).toBe(104);
    expect(new Set([...s.deck, ...s.discard, ...s.hands.flat()]).size).toBe(104);
  });
});
