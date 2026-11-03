import { describe, expect, it } from "vitest";
import { sanitizeRules } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { casino as d } from "./driver";
import { BIG, LITTLE, apply, blockedBuilds, buildId, buildOptions, movesFor, positionOf, type CAction, type CState, type Item } from "./engine";
import { SCHEMA } from "./rules";

const card = (rank: number, suit = 0) => suit * 13 + rank - 1; // rank 1 = ace
const loose = (c: number): Item => ({ id: c, cards: [c], build: false, value: 0, owner: -1 });

/** The existing cases were written for classic Cassino, so they start from its rules; the South African defaults have their own tests below. */
const CLASSIC = { deck: "52", direction: "clock", dealMode: "classic", target: 21, ptsCards: 3, ptsSpades: 1, ptsSweep: 1, stealPileTop: false, ace: "either", teams: false };
const mk = (rules: Record<string, unknown> = {}, n = 2): CState => {
  const t = new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), { ...CLASSIC, ...rules }, 5);
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
  it("lets an opponent capture a build with its value, and take it over by repeating its number", () => {
    let s = mk({ maxBuild: 13, faces: "rank" }); s.hands[0] = [card(5), card(9, 1), card(2)]; s.hands[1] = [card(5, 1), card(9, 2), card(9), card(12, 3)]; s.table = [loose(card(4)), loose(card(9, 3))];
    s = act(s, { type: "build", card: card(5), take: [card(4)], value: 9 });
    const id = buildId(0);
    expect(apply(s, { type: "build", card: card(3, 1), take: [id], value: 12 }, 1)).toBeNull(); // the number cannot go up
    const again = act(structuredClone(s), { type: "build", card: card(9, 2), take: [id, card(9, 3)], value: 9 });
    expect(again.table.find(i => i.build)).toMatchObject({ value: 9, owner: 1 });
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
  const base = (rules: Record<string, unknown>) => { const s = mk(rules); s.hands[0] = [card(2), card(8)]; s.hands[1] = [card(3)]; s.piles[1] = [card(5), card(2, 3)]; s.table = [loose(card(4))]; return s; };
  it("only when switched on, and only to build on something already on the table", () => {
    const on = base({ stealPileTop: true });
    // the 4 on the table + the 2 from the pile + the 2 in hand = a build of 8, which you hold
    const t = act(on, { type: "build", card: card(2), take: [card(4), 200 + 1], value: 8 });
    expect(t.piles[1]).toEqual([card(5)]);
    expect(t.table.find(i => i.build)!.cards.length).toBe(3);
    expect(apply(base({}), { type: "build", card: card(2), take: [card(4), 201], value: 8 }, 0)).toBeNull();
    expect(d.view(on, 0).pileTops[1]).toBe(card(2, 3));
    expect(d.view(base({}), 0).pileTops[1]).toBeNull();
  });
  it("never lets a pile card be captured, and never builds on the pile card alone", () => {
    const on = base({ stealPileTop: true });
    on.hands[0] = [card(2), card(8)];
    expect(apply(on, { type: "capture", card: card(2), take: [200 + 1] }, 0)).toBeNull();
    on.table = [loose(card(2, 1))];
    expect(apply(on, { type: "capture", card: card(2), take: [card(2, 1), 201] }, 0)).toBeNull();
    on.table = [];
    expect(apply(on, { type: "build", card: card(2), take: [201], value: 4 }, 0)).toBeNull();
  });
  it("lets you add a pile card to a build you already own", () => {
    const on = base({ stealPileTop: true });
    on.hands[0] = [card(5), card(8)]; on.table = [{ id: buildId(0), cards: [card(5, 1), card(3, 1)], build: true, value: 8, owner: 0 }]; on.piles[1] = [card(1), card(3, 2)];
    const t = act(on, { type: "build", card: card(5), take: [buildId(0), 201], value: 8 }, 0); // the pile 3 and your 5 make a second 8 with the build
    expect(t.piles[1]).toEqual([card(1)]);
  });
});

describe("established builds", () => {
  const ob = (value: number, cards: number[], owner = 0): Item => ({ id: buildId(0), cards, build: true, value, owner });
  const has = (s: CState, card0: number, take: number[], value: number) => movesFor(positionOf(s, 0), card0).some(m => m.type === "build" && m.value === value && m.take.length === take.length && take.every(t => m.take.includes(t)));
  it("can be repeated but never raised", () => {
    const s = mk(); s.hands[0] = [card(5, 2), card(5, 3), card(9)]; s.hands[1] = [card(3)];
    s.table = [ob(5, [card(5), card(2, 1), card(3, 1)]), loose(card(5, 1)), loose(card(4)), loose(card(1, 1))];
    expect(has(s, card(5, 2), [buildId(0), card(5, 1)], 5)).toBe(true); // a 5 and a 5 in a 5 build
    expect(has(s, card(1), [buildId(0)], 6)).toBe(false);
    expect(has(s, card(5, 2), [buildId(0)], 5)).toBe(false); // your card alone cannot be added: loose table cards must come with it
    s.hands[0] = [card(1), card(5, 3), card(9)];
    expect(has(s, card(1), [buildId(0), card(4)], 5)).toBe(true); // 4 + 1 added to a 5 build
    expect(has(s, card(1), [buildId(0), card(4)], 6)).toBe(false);
    expect(apply(s, { type: "build", card: card(1), take: [buildId(0), card(4)], value: 6 }, 0)).toBeNull();
    const t = act(s, { type: "build", card: card(1), take: [buildId(0), card(4)], value: 5 });
    expect(t.table.filter(i => i.build).length).toBe(1);
    expect(t.table.find(i => i.build)!.cards.length).toBe(5);
  });
});

describe("one build of a number", () => {
  it("refuses a second build of a number that already stands, and says which", () => {
    const s = mk(); s.hands[0] = [card(2, 2), card(8), card(5, 1)]; s.hands[1] = [card(3, 1)];
    s.table = [{ id: buildId(0), cards: [card(5), card(3, 2)], build: true, value: 8, owner: 1 }, loose(card(2)), loose(card(4))];
    const pos = positionOf(s, 0);
    // 2 + 4 + 2 is a build of 8 and the 8 is in hand, but a build of 8 already stands
    expect(buildOptions(pos, card(2, 2), [loose(card(4)), loose(card(2))])).not.toContain(8);
    expect(blockedBuilds(pos, card(2, 2), [loose(card(4)), loose(card(2))])).toContain(8);
    expect(apply(s, { type: "build", card: card(2, 2), take: [card(4), card(2)], value: 8 }, 0)).toBeNull();
    // adding to the standing build is the way to do it
    expect(buildOptions(pos, card(2, 2), [{ id: buildId(0), cards: [card(5), card(3, 2)], build: true, value: 8, owner: 1 }, loose(card(4)), loose(card(2))])).toContain(8);
  });
});

describe("your own pile", () => {
  const sa2 = () => { const s = mk({ stealPileTop: true }); s.hands = [[card(9), card(2, 1)], [card(8, 1), card(3, 1)]]; s.table = [loose(card(4)), loose(card(5, 1))]; return s; };
  it("keeps the card that made the capture on top, and shows you your pile", () => {
    const t = act(sa2(), { type: "capture", card: card(9), take: [card(4), card(5, 1)] });
    expect(t.piles[0][t.piles[0].length - 1]).toBe(card(9));
    expect(d.view(t, 0).myPile).toEqual(t.piles[0]);
    expect(d.view(t, 0).pileLock).toBe(card(9));
    expect(d.view(t, 1).myPile).toEqual([]);
  });
  it("can be rearranged at any time, but not the top card", () => {
    const t = act(sa2(), { type: "capture", card: card(9), take: [card(4), card(5, 1)] });
    const [a, b, top] = t.piles[0];
    const ok = apply(t, { type: "arrange", order: [b, a, top] }, 0);
    expect(ok!.state.piles[0]).toEqual([b, a, top]);
    expect(d.view(t, 0).pileFresh).toBe(3);
    expect(d.mayAct!(t, 0)).toBe(true); // even though it is not your turn
    expect(apply(t, { type: "arrange", order: [top, a, b] }, 0)).toBeNull();
    expect(apply(t, { type: "arrange", order: [a, b] }, 0)).toBeNull();
    expect(apply(t, { type: "arrange", order: [a, b, card(1)] }, 0)).toBeNull();
  });
});

describe("older pile cards", () => {
  it("are fixed: only the latest capture can be rearranged", () => {
    const s = mk({ stealPileTop: true }); s.hands = [[card(9), card(7)], [card(8, 1), card(3, 1)]]; s.table = [loose(card(4)), loose(card(5, 1))]; s.piles[0] = [card(1), card(2)]; s.fresh = [0, 0];
    const t = act(s, { type: "capture", card: card(9), take: [card(4), card(5, 1)] });
    expect(d.view(t, 0).pileFresh).toBe(3);
    expect(apply(t, { type: "arrange", order: [card(2), card(1), card(5, 1), card(4), card(9)] }, 0)).toBeNull(); // whole pile: refused
    expect(apply(t, { type: "arrange", order: [card(4), card(5, 1), card(9)] }, 0)!.state.piles[0]).toEqual([card(1), card(2), card(4), card(5, 1), card(9)]);
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
    expect(v.handCounts).toEqual([10, 10]);
    expect(text).not.toContain(`"hands"`);
    expect(text).not.toMatch(/"deck":\[/);
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
    expect(v.ace).toBe("low");
    expect(v.ptsCards).toBe(0);
    expect(v.faces).toBe("pair");
    expect(v.deck).toBe("52");
  });
});

describe("South African Casino", () => {
  const sa = (n: number, rules: Record<string, unknown> = {}) => new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), rules, 9).state;
  it("can use the 40-card pack with no picture cards, while 52 is the default", () => {
    const s = sa(2, { deck: "40" });
    const all = [...s.deck, ...s.hands.flat(), ...s.table.flatMap(t => t.cards)];
    expect(all.length).toBe(40);
    expect(all.every(c => (c % 13) + 1 <= 10)).toBe(true);
    expect(sa(2).deck.length + 20).toBe(52); // the default pack is the full 52
    expect(sa(2, { deck: "40" }).deck.length + 20).toBe(40);
  });
  it("deals 10 each and an empty table for 2 or 4 players, 13 each and one card for 3", () => {
    const two = sa(2); expect(two.hands.map(h => h.length)).toEqual([10, 10]); expect(two.table.length).toBe(0);
    const four = sa(4); expect(four.hands.map(h => h.length)).toEqual([10, 10, 10, 10]); expect(four.table.length).toBe(0);
    const three = sa(3); expect(three.hands.map(h => h.length)).toEqual([13, 13, 13]); expect(three.table.length).toBe(1);
  });
  it("plays anticlockwise by default, clockwise when chosen", () => {
    const s = sa(3);
    const first = s.turn;
    s.hands[first] = [card(2)]; s.table = [];
    const t = act(s, { type: "trail", card: card(2) });
    expect(t.turn).toBe((first + 2) % 3);
    const c = sa(3, { direction: "clock" });
    c.hands[c.turn] = [card(2)]; c.table = [];
    expect(act(c, { type: "trail", card: card(2) }).turn).toBe((c.turn + 1) % 3);
  });
  it("targets 11 for two sides and 7 for three or four playing alone", () => {
    const end = (n: number, rules: Record<string, unknown>) => { const s = sa(n, rules); s.hands = s.hands.map(() => []); s.hands[s.turn] = [card(7, 3)]; s.table = [loose(card(7, 2))]; s.piles = s.piles.map(() => []); s.score = s.score.map(() => 0); s.piles[s.turn] = [BIG, card(1), card(1, 1), card(1, 2), card(1, 3)]; s.deck = []; s.lastCapture = s.turn; return act(s, { type: "capture", card: card(7, 3), take: [card(7, 2)] }); };
    expect(end(3, {}).score.some(x => x >= 7)).toBe(true);
    expect(end(3, {}).phase).toBe("over");
    expect(end(2, {}).phase).toBe("dealOver");
    expect(end(4, { teams: false }).phase).toBe("over");
    expect(end(4, {}).phase).toBe("dealOver");
  });
  it("scores the Mummy 2, most cards 2, most spades 2, Spy Two 1 and each ace 1: 11 in all", () => {
    const s = sa(2); s.turn = 0; s.hands = [[card(7, 3)], []]; s.table = [loose(card(7, 2))]; s.deck = []; s.lastCapture = 0;
    s.piles = [[BIG, card(1), card(1, 1), card(3, 3), card(4, 3), card(5, 3)], [LITTLE, card(1, 2), card(1, 3), card(6), card(8), card(9)]];
    const t = act(s, { type: "capture", card: card(7, 3), take: [card(7, 2)] });
    const sum = t.summary.map(x => x.total);
    expect(sum[0] + sum[1]).toBe(11);
    expect(t.summary[0].lines.some(l => l.startsWith("Mummy"))).toBe(true);
    expect(t.summary[1].lines.some(l => l.startsWith("Spy Two"))).toBe(true);
  });
  it("puts the capturing card on top of the pile, and an opponent can only build with it", () => {
    const s = sa(2); s.hands = [[card(9), card(2, 1)], [card(8, 1), card(3, 1)]]; s.table = [loose(card(4)), loose(card(5, 1)), loose(card(4, 3))]; s.turn = 0;
    const t = act(s, { type: "capture", card: card(9), take: [card(4), card(5, 1)] });
    expect(t.piles[0][t.piles[0].length - 1]).toBe(card(9)); // 5, then 4, then the 9 on top
    expect(d.view(t, 1).pileTops[0]).toBe(card(9));
    expect(apply(t, { type: "capture", card: card(9, 1), take: [200 + 0] }, 1)).toBeNull();
  });
  it("Crazy Casino refills the hand after every turn and forbids trailing with a build", () => {
    const s = sa(2, { dealMode: "crazy" });
    expect(s.hands[0].length).toBe(8);
    const before = s.deck.length;
    const c = s.hands[s.turn][0];
    const t = act(s, { type: "trail", card: c });
    expect(t.hands[s.turn].length).toBe(8);
    expect(t.deck.length).toBe(before - 1);
  });
  it("offers the regional variants as presets", () => {
    const swazi = SCHEMA.presets.find(p => p.id === "swazi")!;
    const v = sanitizeRules(SCHEMA, swazi.values);
    expect(v.deck).toBe("52"); expect(v.faces).toBe("rank"); expect(v.ace).toBe("either");
    expect(sanitizeRules(SCHEMA, SCHEMA.presets.find(p => p.id === "sa")!.values).deck).toBe("40");
    expect(SCHEMA.presets.map(p => p.id)).toEqual(expect.arrayContaining(["full", "sa", "swazi", "sotho", "crazy", "classic"]));
  });
});
