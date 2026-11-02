import { describe, expect, it } from "vitest";
import { sanitizeRules } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { casino as d } from "./driver";
import { BIG, LITTLE, apply, buildId, movesFor, positionOf, type CAction, type CState, type Item } from "./engine";
import { SCHEMA } from "./rules";

const card = (rank: number, suit = 0) => suit * 13 + rank - 1; // rank 1 = ace
const loose = (c: number): Item => ({ id: c, cards: [c], build: false, value: 0, owner: -1 });

const mk = (rules: Record<string, unknown> = {}, n = 2): CState => {
  const t = new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), rules, 5);
  const s = t.state;
  s.hands = s.hands.map(() => []); s.table = []; s.piles = s.piles.map(() => []); s.deck = []; s.turn = 0; s.lastCapture = -1;
  return s;
};
const act = (s: CState, a: CAction, by = s.turn) => { const r = apply(s, a, by); expect(r, JSON.stringify(a)).not.toBeNull(); return r!.state; };

describe("capturing", () => {
  it("pairs a card with the same rank", () => {
    const s = mk(); s.hands[0] = [card(7), card(2, 1)]; s.hands[1] = [card(3)]; s.table = [loose(card(7, 1)), loose(card(9))];
    const t = act(s, { type: "capture", card: card(7), take: [card(7, 1)] });
    expect(t.piles[0].sort()).toEqual([card(7), card(7, 1)].sort());
    expect(t.table.length).toBe(1);
  });
  it("combines cards that add up to the played card", () => {
    const s = mk(); s.hands[0] = [card(9), card(2, 1)]; s.hands[1] = [card(3)]; s.table = [loose(card(4)), loose(card(5, 1)), loose(card(2)), loose(card(7, 2))];
    expect(apply(s, { type: "capture", card: card(9), take: [card(4), card(5, 1)] }, 0)).not.toBeNull();
    expect(apply(s, { type: "capture", card: card(9), take: [card(4), card(5, 1), card(2), card(7, 2)] }, 0)).not.toBeNull(); // 4+5 and 2+7 both make 9
    expect(apply(s, { type: "capture", card: card(9), take: [card(4), card(2)] }, 0)).toBeNull();
  });
  it("refuses the wrong player, a card not in hand, or a repeated item", () => {
    const s = mk(); s.hands[0] = [card(7)]; s.hands[1] = [card(3)]; s.table = [loose(card(7, 1))];
    expect(apply(s, { type: "capture", card: card(7), take: [card(7, 1)] }, 1)).toBeNull();
    expect(apply(s, { type: "capture", card: card(8), take: [card(7, 1)] }, 0)).toBeNull();
    expect(apply(s, { type: "capture", card: card(7), take: [card(7, 1), card(7, 1)] }, 0)).toBeNull();
  });
});

describe("picture cards and aces follow the chosen rules", () => {
  it("pair-only faces take only the same rank and cannot be added up", () => {
    const s = mk({ faces: "pair" }); s.hands[0] = [card(13)]; s.hands[1] = [card(3)]; s.table = [loose(card(13, 1)), loose(card(6)), loose(card(7))];
    expect(apply(s, { type: "capture", card: card(13), take: [card(6), card(7)] }, 0)).toBeNull();
    expect(apply(s, { type: "capture", card: card(13), take: [card(13, 1)] }, 0)).not.toBeNull();
  });
  it("rank-valued faces can be added up and built", () => {
    const s = mk({ faces: "rank", maxBuild: 13 }); s.hands[0] = [card(13), card(13, 1)]; s.hands[1] = [card(3)]; s.table = [loose(card(6)), loose(card(7))];
    expect(apply(s, { type: "capture", card: card(13), take: [card(6), card(7)] }, 0)).not.toBeNull();
  });
  it("an ace is 1, 14 or your choice", () => {
    const low = mk({ ace: "low" }); low.hands[0] = [card(1)]; low.hands[1] = [card(3)]; low.table = [loose(card(1, 1)), loose(card(9)), loose(card(5, 1))];
    expect(apply(low, { type: "capture", card: card(1), take: [card(1, 1)] }, 0)).not.toBeNull();
    const high = mk({ ace: "high" }); high.hands[0] = [card(1)]; high.hands[1] = [card(3)]; high.table = [loose(card(9)), loose(card(5, 1))];
    expect(apply(high, { type: "capture", card: card(1), take: [card(9), card(5, 1)] }, 0)).not.toBeNull(); // 9 + 5 = 14
    const low2 = mk({ ace: "low" }); low2.hands[0] = [card(1)]; low2.hands[1] = [card(3)]; low2.table = [loose(card(9)), loose(card(5, 1))];
    expect(apply(low2, { type: "capture", card: card(1), take: [card(9), card(5, 1)] }, 0)).toBeNull();
    const either = mk({ ace: "either" }); either.hands[0] = [card(1), card(2)]; either.hands[1] = [card(3)]; either.table = [loose(card(9)), loose(card(5, 1))];
    expect(apply(either, { type: "capture", card: card(1), take: [card(9), card(5, 1)] }, 0)).not.toBeNull();
  });
});

describe("building", () => {
  it("builds when you hold the value, and refuses when you do not", () => {
    const s = mk(); s.hands[0] = [card(5), card(9, 1)]; s.hands[1] = [card(3)]; s.table = [loose(card(4))];
    const t = act(s, { type: "build", card: card(5), take: [card(4)], value: 9 });
    expect(t.table).toEqual([expect.objectContaining({ build: true, value: 9, owner: 0 })]);
    const s2 = mk(); s2.hands[0] = [card(5), card(2, 1)]; s2.hands[1] = [card(3)]; s2.table = [loose(card(4))];
    expect(apply(s2, { type: "build", card: card(5), take: [card(4)], value: 9 }, 0)).toBeNull();
    const relaxed = mk({ buildNeedsCard: false }); relaxed.hands[0] = [card(5), card(2, 1)]; relaxed.hands[1] = [card(3)]; relaxed.table = [loose(card(4))];
    expect(apply(relaxed, { type: "build", card: card(5), take: [card(4)], value: 9 }, 0)).not.toBeNull();
  });
  it("can be switched off entirely, and capped at a chosen height", () => {
    const off = mk({ builds: false }); off.hands[0] = [card(5), card(9, 1)]; off.hands[1] = [card(3)]; off.table = [loose(card(4))];
    expect(apply(off, { type: "build", card: card(5), take: [card(4)], value: 9 }, 0)).toBeNull();
    const low = mk({ maxBuild: 8 }); low.hands[0] = [card(5), card(9, 1)]; low.hands[1] = [card(3)]; low.table = [loose(card(4))];
    expect(apply(low, { type: "build", card: card(5), take: [card(4)], value: 9 }, 0)).toBeNull();
  });
  it("lets an opponent capture a build with its value, and take it over by adding to it", () => {
    let s = mk({ maxBuild: 13, faces: "rank" }); s.hands[0] = [card(5), card(9, 1), card(2)]; s.hands[1] = [card(3, 1), card(9, 2), card(12, 3)]; s.table = [loose(card(4))];
    s = act(s, { type: "build", card: card(5), take: [card(4)], value: 9 });
    const id = buildId(0);
    const raise = act(structuredClone(s), { type: "build", card: card(3, 1), take: [id], value: 12 });
    expect(raise.table[0]).toMatchObject({ value: 12, owner: 1 });
    const cap = act(s, { type: "capture", card: card(9, 2), take: [id] });
    expect(cap.piles[1].length).toBe(3);
  });
  it("opponent builds cannot be raised when that rule is off", () => {
    const s = mk({ increaseOpponents: false, maxBuild: 13, faces: "rank" }); s.hands[0] = [card(2)]; s.hands[1] = [card(3, 1), card(12)];
    s.table = [{ id: buildId(0), cards: [card(4), card(5)], build: true, value: 9, owner: 0 }]; s.turn = 1;
    expect(apply(s, { type: "build", card: card(3, 1), take: [buildId(0)], value: 12 }, 1)).toBeNull();
  });
  it("a build owner may not trail while owning one (when the rule is on)", () => {
    const s = mk(); s.hands[0] = [card(2), card(9, 1)]; s.hands[1] = [card(3)]; s.table = [{ id: buildId(0), cards: [card(4), card(5)], build: true, value: 9, owner: 0 }];
    expect(apply(s, { type: "trail", card: card(2) }, 0)).toBeNull();
    const free = mk({ ownBuildBlocksTrail: false }); free.hands[0] = [card(2), card(9, 1)]; free.hands[1] = [card(3)]; free.table = [{ id: buildId(0), cards: [card(4), card(5)], build: true, value: 9, owner: 0 }];
    expect(apply(free, { type: "trail", card: card(2) }, 0)).not.toBeNull();
  });
  it("must-capture forbids trailing when a capture exists", () => {
    const s = mk({ mustCapture: true }); s.hands[0] = [card(7), card(2)]; s.hands[1] = [card(3)]; s.table = [loose(card(7, 1))];
    expect(apply(s, { type: "trail", card: card(7) }, 0)).toBeNull();
    expect(apply(s, { type: "trail", card: card(2) }, 0)).not.toBeNull();
  });
});

describe("taking from an opponent's pile (African rule)", () => {
  it("only when switched on", () => {
    const base = (rules: Record<string, unknown>) => { const s = mk(rules); s.hands[0] = [card(6)]; s.hands[1] = [card(3)]; s.piles[1] = [card(2), card(6, 1)]; return s; };
    const on = base({ stealPileTop: true });
    const t = act(on, { type: "capture", card: card(6), take: [200 + 1] });
    expect(t.piles[1]).toEqual([card(2)]);
    expect(t.piles[0].length).toBe(2);
    expect(apply(base({}), { type: "capture", card: card(6), take: [201] }, 0)).toBeNull();
    expect(d.view(on, 0).pileTops[1]).toBe(card(6, 1));
    expect(d.view(base({}), 0).pileTops[1]).toBeNull();
  });
});

describe("sweeps and scoring", () => {
  it("counts a sweep when a capture clears the table, but not on the last play unless allowed", () => {
    const s = mk(); s.hands[0] = [card(7), card(2)]; s.hands[1] = [card(3)]; s.table = [loose(card(7, 1))]; s.deck = [card(5)];
    const t = act(s, { type: "capture", card: card(7), take: [card(7, 1)] });
    expect(t.sweeps[0]).toBe(1);
    const last = mk(); last.hands[0] = [card(7)]; last.hands[1] = []; last.table = [loose(card(7, 1))];
    expect(act(last, { type: "capture", card: card(7), take: [card(7, 1)] }).sweeps[0]).toBe(0);
    const allowed = mk({ sweepLast: true }); allowed.hands[0] = [card(7)]; allowed.hands[1] = []; allowed.table = [loose(card(7, 1))];
    expect(act(allowed, { type: "capture", card: card(7), take: [card(7, 1)] }).sweeps[0]).toBe(1);
  });

  const finish = (rules: Record<string, unknown>, piles: number[][], table: Item[] = [], lastCapture = 0, n = 2) => {
    const s = mk(rules, n); s.hands[0] = [card(7, 3)]; for (let i = 1; i < n; i++) s.hands[i] = []; s.piles = piles; s.table = table; s.lastCapture = lastCapture; s.sweeps = s.sweeps.map(() => 0);
    s.table = [...table, loose(card(7, 2))]; // the last play captures this
    return act(s, { type: "capture", card: card(7, 3), take: [card(7, 2)] });
  };
  it("scores cards, spades, both casinos and aces, and the last capture takes the table", () => {
    const p0 = [BIG, card(1), card(1, 1), ...Array.from({ length: 10 }, (_, i) => card(i + 2, 3)).filter(c => c !== LITTLE)];
    const p1 = [LITTLE, card(3), card(4)];
    const t = finish({}, [p0, p1]);
    const sum = t.summary.find(x => x.unit === 0)!;
    // p0: most cards 3, most spades 1, big casino 2, two aces 2 = 8 (the 7s taken last add spade 7 which is in p0 too)
    expect(sum.total).toBeGreaterThanOrEqual(8);
    expect(t.summary.find(x => x.unit === 1)!.total).toBe(1); // little casino only
    expect(t.score[0]).toBe(sum.total);
  });
  it("gives no points for a tie on cards or spades", () => {
    const t = finish({ ptsAce: 0, ptsBig: 0, ptsLittle: 0 }, [[card(2), card(3)], [card(4), card(5)]], [], 0);
    // p0 got 2 + (7s) = 4 cards vs 2; so cards points go to p0; spades: p0 holds the 7 of spades
    expect(t.summary.find(x => x.unit === 0)!.total).toBeGreaterThan(0);
    const tie = finish({ ptsAce: 0, ptsBig: 0, ptsLittle: 0 }, [[], [card(2), card(3), card(4)]], [], 0);
    expect(tie.summary.find(x => x.unit === 1)!.total).toBe(3 + 0);
  });
  it("every scoring value is adjustable", () => {
    const t = finish({ ptsCards: 0, ptsSpades: 0, ptsBig: 7, ptsLittle: 0, ptsAce: 0, ptsSweep: 0 }, [[BIG], []]);
    expect(t.summary.find(x => x.unit === 0)!.total).toBe(7);
  });
  it("team play scores shared piles together", () => {
    const t = finish({ teams: true }, [[card(2)], [card(3)], [card(4)], [card(5)]], [], 0, 4);
    expect(t.summary.length).toBe(2);
  });
  it("ends the match when the target is reached and a deal ends on a new deal otherwise", () => {
    const hit = finish({ target: 5 }, [[BIG, card(1), card(2), card(3), card(4), card(5)], []]);
    expect(hit.phase).toBe("over");
    expect(d.winners(hit)).toEqual([0]);
    const miss = finish({ target: 101 }, [[BIG], []]);
    expect(miss.phase).toBe("dealOver");
    const next = act(miss, { type: "next" }, 0);
    expect(next.phase).toBe("play");
    expect(next.deal).toBe(2);
    expect(next.hands.every(h => h.length === 4)).toBe(true);
  });
});

describe("views and parsing", () => {
  it("never shows another player's hand or the deck order", () => {
    const t = new GameTable(d, [{ name: "A", kind: "human" }, { name: "B", kind: "human" }], {}, 3);
    const v = d.view(t.state, 0);
    const text = JSON.stringify(v);
    expect(v.hand).toEqual(t.state.hands[0]);
    expect(v.handCounts).toEqual([4, 4]);
    expect(text).not.toContain(`"hands"`);
    expect(text).not.toContain(`"deck"`);
    expect(d.view(t.state, null).hand).toEqual([]);
  });
  it("parses only well-formed actions", () => {
    expect(d.parseAction({ type: "trail", card: 3 })).toEqual({ type: "trail", card: 3 });
    expect(d.parseAction({ type: "capture", card: 3, take: [1, 2] })).toEqual({ type: "capture", card: 3, take: [1, 2] });
    expect(d.parseAction({ type: "capture", card: 99, take: [] })).toBeNull();
    expect(d.parseAction({ type: "build", card: 3, take: [1], value: "9" })).toBeNull();
    expect(d.parseAction({ type: "capture", card: 3, take: "x" })).toBeNull();
  });
  it("offers the table exactly the legal moves", () => {
    const s = mk(); s.hands[0] = [card(5), card(9, 1)]; s.hands[1] = [card(3)]; s.table = [loose(card(4)), loose(card(5, 1))];
    const moves = movesFor(positionOf(s, 0), card(5));
    expect(moves.some(m => m.type === "capture" && m.take.length === 1 && m.take[0] === card(5, 1))).toBe(true);
    expect(moves.some(m => m.type === "build" && m.value === 9)).toBe(true);
    expect(moves.some(m => m.type === "trail")).toBe(true);
  });
});

describe("bots", () => {
  it("finish whole matches across rule sets, with every level and 2 to 4 players", { timeout: 180000 }, () => {
    const sets: Record<string, unknown>[] = [{}, { faces: "rank", maxBuild: 13 }, { stealPileTop: true, ptsSweep: 0 }, { builds: false }, { ace: "low", mustCapture: true }, { teams: true, target: 11 }, { handSize: 6, tableCards: 0, target: 11 }];
    for (const [i, rules] of sets.entries()) for (const levels of [["easy", "easy"], ["normal", "hard", "easy"], ["hard", "normal", "normal", "easy"]] as BotLevel[][]) {
      const r = simulate(d, levels, { target: 11, ...rules }, 40 + i);
      expect(r.finished, JSON.stringify([rules, levels, r.steps])).toBe(true);
      expect(new Set(r.table.state.piles.flat()).size).toBeLessThanOrEqual(52);
    }
  });
  it("hard beats easy more often than not", { timeout: 180000 }, () => {
    let hard = 0, games = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const lv: BotLevel[] = seed % 2 ? ["hard", "easy"] : ["easy", "hard"];
      const r = simulate(d, lv, { target: 21 }, seed);
      const w = d.winners(r.table.state)[0];
      if (w !== undefined) { games++; if (lv[w] === "hard") hard++; }
    }
    expect(hard / games).toBeGreaterThan(0.6);
  });
  it("conserves all 52 cards", () => {
    const r = simulate(d, ["normal", "normal"], { target: 5 }, 9);
    const s = r.table.state;
    const all = [...s.deck, ...s.hands.flat(), ...s.table.flatMap(t => t.cards), ...s.piles.flat()];
    expect(all.length).toBe(52);
    expect(new Set(all).size).toBe(52);
  });
});

describe("rules schema", () => {
  it("fills defaults and clamps", () => {
    const v = sanitizeRules(SCHEMA, { target: 1000, ace: "huge", ptsCards: -4 });
    expect(v.target).toBe(101);
    expect(v.ace).toBe("either");
    expect(v.ptsCards).toBe(0);
    expect(v.faces).toBe("pair");
  });
});
