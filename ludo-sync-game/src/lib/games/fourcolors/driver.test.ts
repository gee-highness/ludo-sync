import { describe, expect, it } from "vitest";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { fourColors as d, K, canPlay, type FAction, type FState } from "./driver";

type Def = [number, number, number];
const CHAR: Record<string, number> = { R: 0, Y: 1, G: 2, B: 3 };
/** "R5" red 5, "Rs" skip, "Rr" reverse, "Rd" draw two, "W" wild, "F" wild draw four */
const parse = (t: string): Def => {
  if (t === "W") return [4, K.WILD, 0];
  if (t === "F") return [4, K.W4, 0];
  const c = CHAR[t[0]], x = t.slice(1);
  return x === "s" ? [c, K.SKIP, 0] : x === "r" ? [c, K.REV, 0] : x === "d" ? [c, K.D2, 0] : [c, K.NUM, Number(x)];
};

interface Spec { hands: string[][]; top: string; color?: string; deck?: string[]; turn?: number; rules?: Record<string, unknown> }
const mk = (spec: Spec): FState => {
  const n = spec.hands.length;
  const t = new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), spec.rules ?? {}, 11);
  const s = t.state;
  const all = [...spec.hands.flat(), spec.top, ...(spec.deck ?? ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"])];
  s.defs = all.map(parse);
  let i = 0;
  s.hands = spec.hands.map(h => h.map(() => i++));
  s.discard = [i++];
  s.deck = (spec.deck ?? all.slice(i)).map(() => i++).reverse();
  s.color = spec.color ? CHAR[spec.color] : s.defs[s.discard[0]][0];
  s.turn = spec.turn ?? 0; s.dir = 1; s.pending = 0; s.pendingKind = "none"; s.challenge = null; s.drawn = null; s.catchable = null; s.called = s.hands.map(() => false); s.phase = "play";
  s.scores = s.hands.map(() => 0);
  return s;
};
const idOf = (s: FState, p: number, text: string): number => { const def = parse(text); const id = s.hands[p].find(h => s.defs[h].join() === def.join()); if (id === undefined) throw new Error(`no ${text} in hand ${p}`); return id; };
const play = (s: FState, p: number, text: string, extra: Partial<Extract<FAction, { type: "play" }>> = {}, by = p) => d.apply(s, { type: "play", card: idOf(s, p, text), ...extra }, by);
const ok = (r: ReturnType<typeof d.apply>) => { expect(r).not.toBeNull(); return r!.state; };

describe("deck and deal", () => {
  it("has 108 cards by default and every part of the deck can be changed", () => {
    const t = new GameTable(d, [{ name: "A", kind: "human" }, { name: "B", kind: "human" }], {}, 1);
    expect(t.state.defs.length).toBe(108);
    const small = new GameTable(d, [{ name: "A", kind: "human" }, { name: "B", kind: "human" }], { wilds: 0, wildFours: 0, skipCopies: 0, reverseCopies: 0, drawTwoCopies: 0, numberCopies: 1, zeroCopies: 0 }, 1);
    expect(small.state.defs.length).toBe(36);
    expect(small.state.hands.every(h => h.length === 7)).toBe(true);
  });
  it("starts with a legal first card, never a Wild Draw Four", () => {
    for (let seed = 0; seed < 60; seed++) { const t = new GameTable(d, [{ name: "A", kind: "human" }, { name: "B", kind: "human" }, { name: "C", kind: "human" }], {}, seed); const top = t.state.defs[t.state.discard[0]]; expect(top[1]).not.toBe(K.W4); }
  });
});

describe("playing cards", () => {
  it("matches colour, number or symbol, and refuses the rest", () => {
    const s = mk({ hands: [["R5", "B9", "G1", "Y4"], ["R1", "R2"]], top: "R7" });
    expect(d.view(s, 0).playable.length).toBe(1); // only R5
    const s2 = mk({ hands: [["B7", "G3"], ["R1", "R2"]], top: "R7" });
    expect(d.view(s2, 0).playable).toEqual([0]); // B7 matches the number
    expect(play(s2, 0, "G3")).toBeNull();
  });
  it("a wild needs a chosen colour and sets it", () => {
    const s = mk({ hands: [["W", "G3"], ["R1", "R2"]], top: "R7" });
    expect(play(s, 0, "W")).toBeNull();
    const t = ok(play(s, 0, "W", { color: 2 }));
    expect(t.color).toBe(2);
    expect(t.turn).toBe(1);
  });
  it("Wild Draw Four is only legal without the current colour, unless that rule is off", () => {
    const s = mk({ hands: [["F", "R3"], ["R1", "R2"]], top: "R7" });
    expect(play(s, 0, "F", { color: 1 })).toBeNull();
    const free = mk({ hands: [["F", "R3"], ["R1", "R2"]], top: "R7", rules: { w4Restricted: false } });
    expect(play(free, 0, "F", { color: 1 })).not.toBeNull();
  });
  it("turn order: only the player whose turn it is may play", () => {
    const s = mk({ hands: [["R5"], ["R1", "R2"]], top: "R7", turn: 1 });
    expect(play(s, 0, "R5")).toBeNull();
  });
});

describe("action cards", () => {
  it("skip passes over the next player, reverse flips direction, draw two makes the next draw", () => {
    const three = mk({ hands: [["Rs", "R1"], ["R2", "R3"], ["R4", "R5"]], top: "R7" });
    expect(ok(play(three, 0, "Rs")).turn).toBe(2);
    const rev = ok(play(mk({ hands: [["Rr", "R1"], ["R2", "R3"], ["R4", "R5"]], top: "R7" }), 0, "Rr"));
    expect(rev.dir).toBe(-1);
    expect(rev.turn).toBe(2);
    const dd = ok(play(mk({ hands: [["Rd", "R1"], ["R2", "R3"], ["R4", "R5"]], top: "R7" }), 0, "Rd"));
    expect(dd.pending).toBe(2);
    const drew = ok(d.apply(dd, { type: "draw" }, 1));
    expect(drew.hands[1].length).toBe(4);
    expect(drew.turn).toBe(2);
  });
  it("with two players, reverse acts as a skip, or passes normally if chosen", () => {
    expect(ok(play(mk({ hands: [["Rr", "R1"], ["R2", "R3"]], top: "R7" }), 0, "Rr")).turn).toBe(0);
    expect(ok(play(mk({ hands: [["Rr", "R1"], ["R2", "R3"]], top: "R7", rules: { reverseTwo: "turn" } }), 0, "Rr")).turn).toBe(1);
  });
  it("stacking: off, same kind, or any draw card", () => {
    const base = (rules: Record<string, unknown>) => ok(play(mk({ hands: [["Rd", "R1"], ["Bd", "F", "R3"], ["R4", "R5"]], top: "R7", rules }), 0, "Rd"));
    expect(d.apply(base({ stack: "off" }), { type: "play", card: idOf(base({ stack: "off" }), 1, "Bd") }, 1)).toBeNull();
    const same = base({ stack: "same" });
    const stacked = ok(d.apply(same, { type: "play", card: idOf(same, 1, "Bd") }, 1));
    expect(stacked.pending).toBe(4);
    expect(d.apply(same, { type: "play", card: idOf(same, 1, "F"), color: 0 }, 1)).toBeNull();
    const any = base({ stack: "any" });
    expect(d.apply(any, { type: "play", card: idOf(any, 1, "F"), color: 0 }, 1)).not.toBeNull();
    expect(ok(d.apply(stacked, { type: "draw" }, 2)).hands[2].length).toBe(6);
  });
});

describe("Wild Draw Four challenges", () => {
  it("a successful challenge makes the player draw four and lets the challenger play", () => {
    const s = mk({ hands: [["F", "R3", "B1"], ["G1", "G2"], ["Y1"]], top: "R7" });
    // not legal: P1 holds a red card. Force it with the restriction off for the play, but record hadColor honestly:
    s.rules = { ...s.rules, w4Restricted: true };
    s.hands[0] = [idOf(s, 0, "F"), idOf(s, 0, "B1")]; // no red: legal
    const legal = ok(play(s, 0, "F", { color: 1 }));
    const chLegal = ok(d.apply(legal, { type: "challenge" }, 1));
    expect(chLegal.hands[1].length).toBe(2 + 4 + 2); // wrong challenge: four plus two
    expect(chLegal.turn).toBe(2);
  });
  it("catches an illegal Wild Draw Four", () => {
    const s = mk({ hands: [["F", "R3"], ["G1", "G2"], ["Y1"]], top: "R7", rules: { w4Restricted: true } });
    // make the play possible despite holding red by switching the restriction off only for the move
    const free = { ...s, rules: { ...s.rules, w4Restricted: false } };
    const after = ok(play(free, 0, "F", { color: 1 }));
    after.rules = s.rules; // the challenge is judged on what the player held
    after.challenge = { by: 0, hadColor: true };
    const won = ok(d.apply(after, { type: "challenge" }, 1));
    expect(won.hands[0].length).toBe(1 + 4);
    expect(won.hands[1].length).toBe(2);
    expect(won.turn).toBe(1);
  });
  it("cannot be challenged when the rule is off, and accepting draws four and loses the turn", () => {
    const s = mk({ hands: [["F", "B1"], ["G1", "G2"], ["Y1"]], top: "R7", rules: { challenge: false } });
    const t = ok(play(s, 0, "F", { color: 1 }));
    expect(d.apply(t, { type: "challenge" }, 1)).toBeNull();
    const drew = ok(d.apply(t, { type: "draw" }, 1));
    expect(drew.hands[1].length).toBe(6);
    expect(drew.turn).toBe(2);
  });
});

describe("last card", () => {
  it("someone who reaches one card without calling can be caught, and calling saves them", () => {
    const s = mk({ hands: [["R5", "R6"], ["G1", "G2"], ["Y1", "Y2"]], top: "R7" });
    const t = ok(play(s, 0, "R5"));
    expect(t.catchable).toBe(0);
    const caught = ok(d.apply(t, { type: "catch", target: 0 }, 2));
    expect(caught.hands[0].length).toBe(3);
    expect(d.apply(t, { type: "catch", target: 0 }, 0)).toBeNull(); // not yourself
    const called = ok(play(s, 0, "R5", { call: true }));
    expect(called.catchable).toBeNull();
    const late = ok(d.apply(t, { type: "call" }, 0));
    expect(late.catchable).toBeNull();
  });
  it("the chance ends when the next move is made, and the rule can be off", () => {
    const s = mk({ hands: [["R5", "R6"], ["R1", "G2"], ["Y1", "Y2"]], top: "R7" });
    const t = ok(play(s, 0, "R5"));
    const moved = ok(d.apply(t, { type: "draw" }, 1));
    expect(moved.catchable).toBeNull();
    const off = mk({ hands: [["R5", "R6"], ["G1", "G2"]], top: "R7", rules: { lastCall: false } });
    expect(ok(play(off, 0, "R5")).catchable).toBeNull();
  });
  it("lets others act out of turn only to catch or call, and bots catch", () => {
    const s = mk({ hands: [["R5", "R6"], ["G1", "G2", "G3"], ["Y1", "Y2", "Y3"]], top: "R7" });
    const t = ok(play(s, 0, "R5"));
    expect(d.mayAct!(t, 2)).toBe(true);
    expect(d.mayAct!(s, 2)).toBe(false);
    expect(d.bot(t, 2, "hard")).toEqual({ type: "catch", target: 0 });
  });
});

describe("house rules", () => {
  it("jump in with an identical card out of turn", () => {
    const s = mk({ hands: [["R5", "G9"], ["B1", "B2"], ["R7", "G1"]], top: "R7", rules: { jumpIn: true } });
    expect(d.mayAct!(s, 2)).toBe(true);
    const t = ok(play(s, 2, "R7", {}, 2));
    expect(t.turn).toBe(0); // play moves on from the jumper
    expect(play(s, 1, "B1", {}, 1)).toBeNull();
    const off = mk({ hands: [["R5", "G9"], ["B1", "B2"], ["R7", "G1"]], top: "R7" });
    expect(play(off, 2, "R7", {}, 2)).toBeNull();
  });
  it("seven swaps hands with a chosen player and zero passes every hand along", () => {
    const s = mk({ hands: [["R7", "G1", "G2"], ["B1"], ["Y1", "Y2"]], top: "R3", rules: { sevenZero: true } });
    expect(play(s, 0, "R7")).toBeNull(); // needs a target
    const t = ok(play(s, 0, "R7", { swap: 1 }));
    expect(t.hands[0].length).toBe(1);
    expect(t.hands[1].length).toBe(2);
    const z = mk({ hands: [["R0", "G1", "G2"], ["B1"], ["Y1", "Y2"]], top: "R3", rules: { sevenZero: true } });
    const r = ok(play(z, 0, "R0"));
    expect(r.hands.map(h => h.length)).toEqual([2, 2, 1]);
  });
  it("draw rules: must play, draw until playable, must play the drawn card", () => {
    const must = mk({ hands: [["R5", "G9"], ["B1"]], top: "R7", rules: { mustPlay: true } });
    expect(d.apply(must, { type: "draw" }, 0)).toBeNull();
    const until = mk({ hands: [["G5", "G9"], ["B1"]], top: "R7", deck: ["B3", "B4", "R2"], rules: { drawUntil: true } });
    const t = ok(d.apply(until, { type: "draw" }, 0));
    expect(t.hands[0].length).toBe(5);
    expect(t.drawn).not.toBeNull();
    const single = mk({ hands: [["G5", "G9"], ["B1"]], top: "R7", deck: ["R2"] });
    const u = ok(d.apply(single, { type: "draw" }, 0));
    expect(u.drawn).not.toBeNull();
    expect(ok(d.apply(u, { type: "pass" }, 0)).turn).toBe(1);
    const forced = mk({ hands: [["G5", "G9"], ["B1"]], top: "R7", deck: ["R2"], rules: { mustPlayDrawn: true } });
    expect(d.apply(ok(d.apply(forced, { type: "draw" }, 0)), { type: "pass" }, 0)).toBeNull();
  });
  it("going out on an action card can be forbidden", () => {
    const s = mk({ hands: [["Rs", "R1"], ["B1"]], top: "R7", rules: { endOnAction: false } });
    s.hands[0] = [idOf(s, 0, "Rs")];
    expect(canPlay(s, 0, s.hands[0][0])).toBe(false);
  });
});

describe("scoring", () => {
  it("the winner scores the cards left with the chosen values, and the match runs to the target", () => {
    const s = mk({ hands: [["R5"], ["B9", "Rs", "W"], ["Y1"]], top: "R7", rules: { target: 500, actionValue: 25, wildValue: 40 } });
    const t = ok(play(s, 0, "R5"));
    expect(t.phase).toBe("roundOver");
    expect(t.roundPoints).toBe(9 + 25 + 40 + 1);
    expect(t.scores[0]).toBe(75);
    const n = ok(d.apply(t, { type: "next" }, 1));
    expect(n.phase).toBe("play");
    expect(n.round).toBe(2);
    expect(n.hands.every(h => h.length === 7)).toBe(true);
    const single = mk({ hands: [["R5"], ["B9"]], top: "R7", rules: { target: 0 } });
    const o = ok(play(single, 0, "R5"));
    expect(o.phase).toBe("over");
    expect(d.winners(o)).toEqual([0]);
  });
  it("a final draw card still makes the next player draw before scoring", () => {
    const s = mk({ hands: [["Rd"], ["B9", "B8"]], top: "R7" });
    const t = ok(play(s, 0, "Rd"));
    expect(t.hands[1].length).toBe(4);
    expect(t.phase).toBe("roundOver");
    expect(t.roundPoints).toBeGreaterThanOrEqual(17); // the two cards held plus the two drawn
  });
});

describe("views", () => {
  it("shows only your own hand during play, everyone's when the round ends", () => {
    const s = mk({ hands: [["R5", "G2"], ["B9", "B8"]], top: "R7" });
    const v = d.view(s, 0);
    expect(v.hand.length).toBe(2);
    expect(v.reveal).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"hands"');
    const e = ok(play(mk({ hands: [["R5"], ["B9"]], top: "R7", rules: { target: 0 } }), 0, "R5"));
    expect(d.view(e, 1).reveal![1].length).toBe(1);
  });
  it("parses only well-formed actions", () => {
    expect(d.parseAction({ type: "play", card: 3, color: 2 })).toEqual({ type: "play", card: 3, color: 2, swap: undefined, call: false });
    expect(d.parseAction({ type: "play", card: "3" })).toBeNull();
    expect(d.parseAction({ type: "catch", target: 99 })).toBeNull();
    expect(d.parseAction({ type: "draw" })).toEqual({ type: "draw" });
    expect(d.parseAction({ type: "x" })).toBeNull();
  });
});

describe("bots", () => {
  it("finish whole matches across rule sets, levels and 2 to 10 players", { timeout: 240000 }, () => {
    const sets: Record<string, unknown>[] = [{ target: 100 }, { target: 0, stack: "any", jumpIn: true }, { target: 100, sevenZero: true }, { target: 100, drawUntil: true, challenge: false }, { target: 0, handSize: 3, endOnAction: false }, { target: 60, stack: "same", mustPlay: true, mustPlayDrawn: true }];
    for (const [i, rules] of sets.entries()) for (const levels of [["easy", "easy"], ["normal", "hard", "easy"], ["hard", "normal", "easy", "normal", "hard", "easy", "easy", "normal", "hard", "normal"]] as BotLevel[][]) {
      const r = simulate(d, levels, rules, 50 + i, 60000);
      expect(r.finished, JSON.stringify([rules, levels.length, r.steps])).toBe(true);
    }
  });
  it("conserve every card", () => {
    const r = simulate(d, ["normal", "hard", "easy"], { target: 0, stack: "any", sevenZero: true }, 21);
    const s = r.table.state;
    const all = [...s.deck, ...s.discard, ...s.hands.flat()];
    expect(all.length).toBe(s.defs.length);
    expect(new Set(all).size).toBe(s.defs.length);
  });
  it("hard beats easy more often than not", { timeout: 240000 }, () => {
    let hard = 0, games = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const lv: BotLevel[] = seed % 2 ? ["hard", "easy"] : ["easy", "hard"];
      const r = simulate(d, lv, { target: 0 }, seed, 5000);
      const w = d.winners(r.table.state)[0];
      if (w !== undefined) { games++; if (lv[w] === "hard") hard++; }
    }
    expect(hard / games).toBeGreaterThan(0.55);
  });
});
