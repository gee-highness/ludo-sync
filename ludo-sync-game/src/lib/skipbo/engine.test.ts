import { describe, expect, it } from "vitest";
import { applyAction, canEndTurn, cardAt, countCards, createGame, currentPlayer, makeDeck, standings, targetsFor } from "./engine";
import { chooseAction } from "./bot";
import { DECK_SIZE, WILD, type Action, type BotLevel, type GameState, type PlayerSetup } from "./types";

const people = (n: number, kind: "human" | "bot" = "human", level?: BotLevel): PlayerSetup[] =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind, level }));

/** A game with hand-placed cards. */
const scene = (opts: {
  players?: number; hand?: number[]; stock?: number[]; discards?: number[][]; building?: number[]; tournament?: boolean; others?: number[]; draw?: number[];
}): GameState => {
  const g = createGame(people(opts.players ?? 2), { tournament: opts.tournament }, 7);
  g.turn = 0;
  const me = g.players[0];
  if (opts.hand) me.hand = [...opts.hand];
  if (opts.stock) me.stock = [...opts.stock];
  if (opts.discards) me.discards = [0, 1, 2, 3].map(i => [...(opts.discards![i] ?? [])]);
  if (opts.building) g.building = [0, 1, 2, 3].map(i => Array.from({ length: opts.building![i] ?? 0 }, (_, k) => k + 1));
  if (opts.draw) g.draw = [...opts.draw];
  if (opts.others) g.players[1].stock = Array.from({ length: opts.others[0] }, () => 3);
  return g;
};

describe("the deck", () => {
  it("has 162 cards: twelve of each number and eighteen Skip-Bo wildcards", () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    for (let v = 1; v <= 12; v++) expect(deck.filter(c => c === v)).toHaveLength(12);
    expect(deck.filter(c => c === WILD)).toHaveLength(18);
  });
});

describe("setup", () => {
  it("deals 30 stock cards to 2 to 4 players and 20 to 5 or 6, five in the first hand", () => {
    for (const n of [2, 3, 4]) expect(createGame(people(n), {}, 1).players.every(p => p.stock.length === 30)).toBe(true);
    for (const n of [5, 6]) expect(createGame(people(n), {}, 1).players.every(p => p.stock.length === 20)).toBe(true);
    const g = createGame(people(3), {}, 4);
    expect(currentPlayer(g).hand).toHaveLength(5);
    expect(g.players.filter((_, i) => i !== g.turn).every(p => p.hand.length === 0)).toBe(true);
    expect(g.turn).toBe((g.dealer + 1) % 3);
    expect(countCards(g)).toBe(DECK_SIZE);
    expect(g.building).toEqual([[], [], [], []]);
  });
  it("keeps custom stock sizes dealable", () => {
    expect(createGame(people(6), { stockSize: 30 }, 1).players[0].stock.length).toBeLessThanOrEqual(25);
    expect(createGame(people(2), { stockSize: 10 }, 1).players[0].stock).toHaveLength(10);
  });
  it("rejects too few or too many players", () => {
    expect(() => createGame(people(1), {}, 1)).toThrow();
    expect(() => createGame(people(7), {}, 1)).toThrow();
  });
});

describe("building piles", () => {
  it("accept a 1 first, then each next number, and a wildcard as whatever comes next", () => {
    let g = scene({ hand: [1, 3, 0, 5, 5], building: [0, 0, 0, 0] });
    expect(targetsFor(g, 1, true)).toEqual([0]);
    expect(targetsFor(g, 3)).toEqual([]);
    expect(targetsFor(g, WILD, true)).toEqual([0]);
    g = applyAction(g, { type: "play", source: { from: "hand", index: 0 }, to: 0 })!.state;
    expect(g.building[0]).toEqual([1]);
    expect(applyAction(g, { type: "play", source: { from: "hand", index: 0 }, to: 0 })).toBeNull(); // a 3 on a 1
    const wild = applyAction(g, { type: "play", source: { from: "hand", index: 1 }, to: 0 })!; // hand is now [3, 0, 5, 5]
    expect(wild.state.building[0]).toEqual([1, 0]);
    expect(wild.events.find(e => e.type === "play")).toMatchObject({ value: 2 });
  });
  it("clear when they reach 12, and the cards wait to be reshuffled", () => {
    const g = scene({ hand: [12, 1, 1, 1, 1], building: [11, 0, 0, 0] });
    const r = applyAction(g, { type: "play", source: { from: "hand", index: 0 }, to: 0 })!;
    expect(r.state.building[0]).toEqual([]);
    expect(r.state.completed).toHaveLength(12);
    expect(r.events.map(e => e.type)).toContain("pileDone");
  });
  it("refuse a played card that is not one of yours", () => {
    const g = scene({ hand: [1, 1, 1, 1, 1] });
    expect(applyAction(g, { type: "play", source: { from: "hand", index: 9 }, to: 0 })).toBeNull();
    expect(applyAction(g, { type: "play", source: { from: "discard", pile: 2 }, to: 0 })).toBeNull();
    expect(applyAction(g, { type: "play", source: { from: "hand", index: 0 }, to: 7 })).toBeNull();
  });
});

describe("a turn", () => {
  it("lets you play from the hand, the stock card and the top of a discard pile, and the next stock card turns up", () => {
    const g = scene({ hand: [9, 9, 9, 9, 9], stock: [8, 2, 1], discards: [[4], [], [], [6, 2]], building: [0, 0, 0, 0] });
    let r = applyAction(g, { type: "play", source: { from: "stock" }, to: 0 })!;
    expect(r.state.players[0].stock).toEqual([8, 2]);
    expect(cardAt(r.state, { from: "stock" })).toBe(2);
    expect(r.events.map(e => e.type)).toEqual(["play", "flip"]);
    r = applyAction(r.state, { type: "play", source: { from: "discard", pile: 3 }, to: 0 })!;
    expect(r.state.players[0].discards[3]).toEqual([6]);
    expect(applyAction(r.state, { type: "play", source: { from: "discard", pile: 3 }, to: 0 })).toBeNull(); // a 6 on a 2
  });
  it("draws five fresh cards when the whole hand is played, and the turn goes on", () => {
    const g = scene({ hand: [1, 2, 3, 4, 5], building: [0, 0, 0, 0], draw: [7, 7, 7, 7, 7, 7, 7] });
    let s = g;
    for (let i = 0; i < 5; i++) s = applyAction(s, { type: "play", source: { from: "hand", index: 0 }, to: 0 })!.state;
    expect(s.turn).toBe(0);
    expect(s.players[0].hand).toEqual([7, 7, 7, 7, 7]);
  });
  it("ends with exactly one discard, then the next player draws up to five", () => {
    const g = scene({ hand: [5, 6, 7, 8, 9] });
    const r = applyAction(g, { type: "discard", index: 2, pile: 1 })!;
    expect(r.state.players[0].discards[1]).toEqual([7]);
    expect(r.state.players[0].hand).toHaveLength(4);
    expect(r.state.turn).toBe(1);
    expect(r.state.players[1].hand).toHaveLength(5);
  });
  it("lets discards stack in any order", () => {
    const g = scene({ hand: [2, 9, 9, 9, 9], discards: [[4], [], [], []] });
    const r = applyAction(g, { type: "discard", index: 0, pile: 0 })!;
    expect(r.state.players[0].discards[0]).toEqual([4, 2]);
  });
  it("does not draw if the last hand card is discarded, until your next turn", () => {
    const g = scene({ hand: [5] });
    const r = applyAction(g, { type: "discard", index: 0, pile: 0 })!;
    expect(r.state.players[0].hand).toHaveLength(0);
    const back = applyAction(r.state, { type: "discard", index: 0, pile: 0 })!.state;
    expect(back.turn).toBe(0);
    expect(back.players[0].hand).toHaveLength(5);
  });
  it("reshuffles cleared piles into the draw pile when it runs out", () => {
    const g = scene({ hand: [5, 5, 5, 5, 5] });
    g.completed = Array.from({ length: 12 }, (_, i) => i + 1);
    g.draw = [];
    g.players[1].hand = [];
    const r = applyAction(g, { type: "discard", index: 0, pile: 0 })!;
    expect(r.events.map(e => e.type)).toContain("reshuffle");
    expect(r.state.players[1].hand).toHaveLength(5);
    expect(r.state.completed).toEqual([]);
  });
  it("only allows ending the turn with no cards left to discard", () => {
    expect(canEndTurn(scene({ hand: [1] }))).toBe(false);
    expect(applyAction(scene({ hand: [1] }), { type: "endTurn" })).toBeNull();
    const g = scene({ hand: [] });
    expect(canEndTurn(g)).toBe(true);
    expect(applyAction(g, { type: "endTurn" })!.state.turn).toBe(1);
  });
});

describe("points", () => {
  it("pay more for a stock card than a discard, and more again for finishing a pile or the whole hand", () => {
    let g = scene({ hand: [1], stock: [5, 1], discards: [[2], [], [], []], building: [0, 0, 0, 0] });
    const play = (src: Parameters<typeof applyAction>[1] & { type: "play" }) => { const r = applyAction(g, src)!; g = r.state; return r; };
    expect(play({ type: "play", source: { from: "stock" }, to: 0 }).events.find(e => e.type === "play")).toMatchObject({ points: 3 });
    expect(g.players[0].points).toBe(3);
    expect(play({ type: "play", source: { from: "discard", pile: 0 }, to: 0 }).events.find(e => e.type === "play")).toMatchObject({ points: 2 });
    // the last hand card: 1 for the card and 10 for playing the whole hand
    g.building = [[1, 2, 3], [], [], []];
    const r = play({ type: "play", source: { from: "hand", index: 0 }, to: 1 });
    expect(r.events.find(e => e.type === "play")).toMatchObject({ points: 11 });
    g.building = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [], [], []];
    g.players[0].hand = [12, 4];
    expect(play({ type: "play", source: { from: "hand", index: 0 }, to: 0 }).events.find(e => e.type === "play")).toMatchObject({ points: 11 });
  });
  it("add 25 and 5 a card for winning the round in any kind of game, and accumulate across rounds", () => {
    const g = scene({ stock: [1], building: [0, 0, 0, 0], others: [10] });
    const r = applyAction(g, { type: "play", source: { from: "stock" }, to: 0 })!;
    expect(r.state.players[0].points).toBe(3 + 25 + 50);
    expect(r.state.players[0].score).toBe(0);
    const t = scene({ stock: [1], building: [0, 0, 0, 0], others: [10], tournament: true });
    const tr = applyAction(t, { type: "play", source: { from: "stock" }, to: 0 })!;
    const next = applyAction(tr.state, { type: "nextRound" })!.state;
    expect(next.players[0].points).toBe(3 + 25 + 50);
  });
});

describe("winning and scoring", () => {
  it("ends a casual game the moment the stock is empty", () => {
    const g = scene({ stock: [1], building: [0, 0, 0, 0] });
    const r = applyAction(g, { type: "play", source: { from: "stock" }, to: 0 })!;
    expect(r.state.phase).toBe("over");
    expect(r.state.winner).toBe(0);
    expect(r.events.map(e => e.type)).toEqual(["play", "roundEnd", "gameOver"]);
    expect(applyAction(r.state, { type: "discard", index: 0, pile: 0 })).toBeNull();
  });
  it("scores a tournament round 25 plus 5 for every card left in the others' stocks, then deals again", () => {
    const g = scene({ stock: [1], building: [0, 0, 0, 0], tournament: true, others: [10] });
    const r = applyAction(g, { type: "play", source: { from: "stock" }, to: 0 })!;
    expect(r.state.phase).toBe("roundOver");
    expect(r.state.roundPoints).toBe(25 + 50);
    expect(r.state.players[0].score).toBe(75);
    const next = applyAction(r.state, { type: "nextRound" })!;
    expect(next.state.round).toBe(2);
    expect(next.state.phase).toBe("play");
    expect(next.state.dealer).toBe((r.state.dealer + 1) % 2);
    expect(next.state.players[0].score).toBe(75);
    expect(countCards(next.state)).toBe(DECK_SIZE);
  });
  it("wins the match at the target score", () => {
    const g = scene({ stock: [1], building: [0, 0, 0, 0], tournament: true, others: [30] });
    g.players[0].score = 400;
    const r = applyAction(g, { type: "play", source: { from: "stock" }, to: 0 })!;
    expect(r.state.players[0].score).toBe(575);
    expect(r.state.phase).toBe("over");
    expect(r.state.winner).toBe(0);
    expect(standings(r.state)[0]).toBe(0);
  });
  it("ends a stalled game when nobody can move", () => {
    let g = scene({ hand: [] });
    g.draw = []; g.completed = [];
    g.players.forEach(p => { p.hand = []; });
    g.players[1].stock = [4, 4];
    for (let i = 0; i < 6 && g.phase === "play"; i++) g = applyAction(g, { type: "endTurn" })!.state;
    expect(g.phase).toBe("over");
    expect(g.winner).toBe(1);
  });
});

describe("bots", () => {
  const play = (seed: number, n: number, level: BotLevel, tournament = false) => {
    let g = createGame(people(n, "bot", level), { tournament, stockSize: 10, target: 100 }, seed);
    let steps = 0;
    while (g.phase !== "over" && steps++ < 8000) {
      const action: Action | null = g.phase === "roundOver" ? { type: "nextRound" } : chooseAction(g);
      expect(action, `seed ${seed} step ${steps}`).not.toBeNull();
      const r = applyAction(g, action!);
      expect(r, `${JSON.stringify(action)} seed ${seed} step ${steps}`).not.toBeNull();
      g = r!.state;
      if (steps % 40 === 0) expect(countCards(g)).toBe(DECK_SIZE);
    }
    return { g, steps };
  };

  it.each(["easy", "normal", "hard"] as BotLevel[])("%s bots always make legal moves and finish games of every size", { timeout: 60000 }, level => {
    for (const n of [2, 3, 4, 5, 6]) for (let seed = 1; seed <= 4; seed++) {
      const { g, steps } = play(seed, n, level);
      expect(g.phase, `${n} players seed ${seed} steps ${steps}`).toBe("over");
      expect(g.winner).not.toBeNull();
      expect(countCards(g)).toBe(DECK_SIZE);
    }
  });
  it("plays whole tournaments", { timeout: 60000 }, () => {
    const { g } = play(3, 3, "normal", true);
    expect(g.phase).toBe("over");
    expect(Math.max(...g.players.map(p => p.score))).toBeGreaterThanOrEqual(100);
  });
  it("always plays the stock card when it fits, and saves wildcards", () => {
    const g = scene({ hand: [WILD, 1, 9, 9, 9], stock: [1], building: [0, 0, 0, 0] });
    expect(chooseAction(g)).toEqual({ type: "play", source: { from: "stock" }, to: 0 });
    const h = scene({ hand: [WILD, 1, 9, 9, 9], stock: [6], building: [0, 0, 0, 0] });
    const a = chooseAction(h, "hard");
    expect(a).toMatchObject({ type: "play" });
  });
  it("hard bots beat easy ones most of the time", { timeout: 60000 }, () => {
    let hardWins = 0;
    const games = 24;
    for (let seed = 1; seed <= games; seed++) {
      let g = createGame([{ name: "hard", kind: "bot", level: "hard" }, { name: "easy", kind: "bot", level: "easy" }], { stockSize: 15 }, seed);
      g.turn = seed % 2;
      for (let i = 0; i < 6000 && g.phase !== "over"; i++) g = applyAction(g, chooseAction(g)!)!.state;
      if (g.winner === 0) hardWins++;
    }
    expect(hardWins).toBeGreaterThan(games * 0.7);
  });
});
