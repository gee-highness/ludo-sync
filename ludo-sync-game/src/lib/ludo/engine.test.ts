import { describe, expect, it } from "vitest";
import {
  FINISH, HOME_COLUMN, RING, SEATS, START_INDEX, YARD, cellInfo, cellOf, isSafeRingIndex, pointOf, ringIndexOf, type Cell, type Seat,
} from "./board";
import { applyAction, createGame, currentPlayer, dicePool, legalMoves } from "./engine";
import { autoAction, chooseMove } from "./bot";
import { rollDice } from "./rng";
import { DEFAULT_RULES, type GameState, type PlayerSetup, type Rules } from "./types";

const adjacent = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
/** The ring turns each inner corner of the centre square with one diagonal step, as on a physical board. */
const diagonal = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) === 1 && Math.abs(a[1] - b[1]) === 1;
const humans = (...seats: Seat[]): PlayerSetup[] => seats.map(seat => ({ seat, name: `P${seat}`, kind: "human" as const }));

/** A game with hand-placed tokens and dice, ready to move. */
const scene = (opts: {
  seats?: Seat[]; tokens?: Partial<Record<Seat, number[]>>; dice?: number[]; rules?: Partial<Rules>; turnSeat?: Seat; phase?: "roll" | "move";
}): GameState => {
  const seats = opts.seats ?? [0, 1];
  const g = createGame(humans(...seats), { ...DEFAULT_RULES, ...opts.rules }, 1);
  g.players.forEach(p => { if (opts.tokens?.[p.seat]) p.tokens = [...opts.tokens[p.seat]!]; });
  g.turn = g.players.findIndex(p => p.seat === (opts.turnSeat ?? seats[0]));
  if (opts.dice) { g.dice = [...opts.dice]; g.rolled = [...opts.dice]; g.phase = "move"; }
  if (opts.phase) g.phase = opts.phase;
  return g;
};

/** Finds a seed whose first die is `value`, so a roll can be forced. */
const seedFor = (value: number, count = 1, second?: number): number => {
  for (let seed = 1; seed < 100000; seed++) {
    const r = rollDice(seed, count).dice;
    if (r[0] === value && (second === undefined || r[1] === second)) return seed;
  }
  throw new Error("no seed");
};

describe("board geometry", () => {
  it("has a 52-cell ring of unique cells that closes up, with exactly four corner steps", () => {
    expect(RING).toHaveLength(52);
    expect(new Set(RING.map(c => c.join(","))).size).toBe(52);
    const corners: number[] = [];
    RING.forEach((c, i) => {
      const next = RING[(i + 1) % 52];
      if (diagonal(c, next)) corners.push(i);
      else expect(adjacent(c, next), `ring ${i}`).toBe(true);
    });
    expect(corners).toEqual([4, 17, 30, 43]);
  });

  it.each(SEATS)("walks seat %i's whole journey one adjacent step at a time", seat => {
    let prev = cellOf(seat, 0)!;
    for (let p = 1; p < FINISH; p++) {
      const cell = cellOf(seat, p)!;
      // diagonal steps are only the ring's corners; the walk into and up the home column is always straight
      expect(p > 50 ? adjacent(prev, cell) : adjacent(prev, cell) || diagonal(prev, cell), `seat ${seat} step ${p}`).toBe(true);
      prev = cell;
    }
    // the last home-column square touches the centre
    expect(adjacent(prev, [7, 7])).toBe(true);
  });

  it("keeps home columns off the ring and apart from each other", () => {
    const ring = new Set(RING.map(c => c.join(",")));
    const cols = SEATS.flatMap(s => HOME_COLUMN[s].map(c => c.join(",")));
    expect(new Set(cols).size).toBe(24);
    cols.forEach(c => expect(ring.has(c)).toBe(false));
  });

  it("puts each seat's start on the ring and marks it safe", () => {
    SEATS.forEach(seat => {
      expect(isSafeRingIndex(START_INDEX[seat])).toBe(true);
      expect(cellInfo(...(RING[START_INDEX[seat]] as [number, number]))).toEqual({ kind: "start", seat });
    });
    expect(RING.filter((_, i) => isSafeRingIndex(i))).toHaveLength(8);
  });

  it("maps progress to board points", () => {
    expect(pointOf(0, 0, YARD).y).toBeGreaterThan(9);
    expect(pointOf(0, 0, 0)).toEqual({ x: 6, y: 13 });
    expect(ringIndexOf(1, 0)).toBe(13);
    expect(ringIndexOf(1, 51)).toBeNull();
  });
});

describe("setup", () => {
  it("needs two to four distinct seats and orders them clockwise", () => {
    expect(() => createGame(humans(0))).toThrow();
    expect(() => createGame([...humans(0, 1), ...humans(1)])).toThrow();
    const g = createGame(humans(3, 0, 2));
    expect(g.players.map(p => p.seat)).toEqual([0, 2, 3]);
    expect(g.players.every(p => p.tokens.every(t => t === YARD))).toBe(true);
  });

  it("cleans names and falls back when empty", () => {
    const g = createGame([{ seat: 0, name: "   ", kind: "human" }, { seat: 1, name: "  Ann   Lee ", kind: "human" }]);
    expect(g.players.map(p => p.name)).toEqual(["Player 1", "Ann Lee"]);
  });
});

describe("rolling", () => {
  it("is deterministic for a seed and only allowed in the roll phase", () => {
    const a = applyAction(createGame(humans(0, 1), DEFAULT_RULES, 42), { type: "roll" })!;
    const b = applyAction(createGame(humans(0, 1), DEFAULT_RULES, 42), { type: "roll" })!;
    expect(a.state.rolled).toEqual(b.state.rolled);
    expect(a.events[0]).toMatchObject({ type: "roll", seat: 0 });
    // both tokens are in the yard: a non-six passes the turn; a six leaves a move to make
    expect(applyAction(scene({ dice: [3], tokens: { 0: [5, -1, -1, -1] } }), { type: "roll" })).toBeNull();
  });

  it("passes the turn when no move exists and no six was rolled", () => {
    const seed = seedFor(3);
    const g = createGame(humans(0, 1), DEFAULT_RULES, seed);
    const r = applyAction(g, { type: "roll" })!;
    expect(r.events.map(e => e.type)).toEqual(["roll", "no-moves", "turn"]);
    expect(currentPlayer(r.state).seat).toBe(1);
    expect(r.state.phase).toBe("roll");
  });

  it("offers a yard exit on a six, and a six earns another roll afterwards", () => {
    const g = createGame(humans(0, 1), DEFAULT_RULES, seedFor(6));
    const r = applyAction(g, { type: "roll" })!;
    expect(r.state.phase).toBe("move");
    expect(legalMoves(r.state).map(m => m.entersBoard)).toContain(true);
    const m = applyAction(r.state, { type: "move", token: 0, die: 6 })!;
    expect(m.events.map(e => e.type)).toEqual(["move", "bonus"]);
    expect(currentPlayer(m.state).seat).toBe(0);
    expect(m.state.phase).toBe("roll");
  });

  it("forfeits the turn on a third six in a row", () => {
    const g = scene({ tokens: { 0: [10, -1, -1, -1] }, phase: "roll" });
    g.sixes = 2;
    g.rng = seedFor(6);
    const r = applyAction(g, { type: "roll" })!;
    expect(r.events.map(e => e.type)).toEqual(["roll", "penalty", "turn"]);
    expect(currentPlayer(r.state).seat).toBe(1);
    expect(r.state.sixes).toBe(0);
    const off = scene({ tokens: { 0: [10, -1, -1, -1] }, phase: "roll", rules: { threeSixes: false } });
    off.sixes = 2; off.rng = seedFor(6);
    expect(applyAction(off, { type: "roll" })!.events.map(e => e.type)).not.toContain("penalty");
  });
});

describe("moving", () => {
  it("only leaves the yard on a six and lands on the start square", () => {
    const g = scene({ dice: [4], tokens: { 0: [-1, -1, -1, -1] } });
    expect(legalMoves(g)).toEqual([]);
    const six = scene({ dice: [6], tokens: { 0: [-1, 3, -1, -1] } });
    expect(legalMoves(six).filter(m => m.entersBoard)).toHaveLength(3);
    const r = applyAction(six, { type: "move", token: 0, die: 6 })!;
    expect(r.state.players[0].tokens[0]).toBe(0);
  });

  it("rejects moves that are not offered", () => {
    const g = scene({ dice: [3], tokens: { 0: [5, -1, -1, -1] } });
    expect(applyAction(g, { type: "move", token: 0, die: 4 })).toBeNull();
    expect(applyAction(g, { type: "move", token: 1, die: 3 })).toBeNull();
    expect(applyAction(g, { type: "move", token: 9, die: 3 })).toBeNull();
    expect(applyAction(g, { type: "roll" })).toBeNull();
  });

  it("needs an exact roll to reach home", () => {
    const g = scene({ dice: [3], tokens: { 0: [55, -1, -1, -1] } });
    expect(legalMoves(g)).toEqual([]);
    const ok = scene({ dice: [2], tokens: { 0: [55, -1, -1, -1] } });
    expect(legalMoves(ok)[0]).toMatchObject({ to: FINISH, finishes: true });
  });

  it("finishing earns another roll, or not, by rule", () => {
    const g = scene({ dice: [2], tokens: { 0: [55, 10, -1, -1] } });
    const r = applyAction(g, { type: "move", token: 0, die: 2 })!;
    expect(r.events.map(e => e.type)).toEqual(["move", "finish", "bonus"]);
    const off = scene({ dice: [2], tokens: { 0: [55, 10, -1, -1] }, rules: { finishBonus: false } });
    expect(applyAction(off, { type: "move", token: 0, die: 2 })!.events.map(e => e.type)).toEqual(["move", "finish", "turn"]);
  });

  it("wins when the fourth token gets home", () => {
    const g = scene({ dice: [1], tokens: { 0: [57, 57, 57, 56] } });
    const r = applyAction(g, { type: "move", token: 3, die: 1 })!;
    expect(r.state.phase).toBe("over");
    expect(r.state.winner).toBe(0);
    expect(r.events.at(-1)).toEqual({ type: "win", seat: 0 });
    expect(applyAction(r.state, { type: "roll" })).toBeNull();
  });
});

describe("captures", () => {
  // seat 1 starts at ring 13, so progress 48 sits on ring 9; seat 0's progress 9 is ring 9 too
  const victim = (ring: number) => (ring - START_INDEX[1] + 52) % 52;

  it("sends an opponent home and earns a bonus roll", () => {
    const g = scene({ dice: [4], tokens: { 0: [5, -1, -1, -1], 1: [victim(9), -1, -1, -1] } });
    expect(legalMoves(g)[0].captures).toBe(true);
    const r = applyAction(g, { type: "move", token: 0, die: 4 })!;
    expect(r.state.players[1].tokens[0]).toBe(YARD);
    expect(r.events.map(e => e.type)).toEqual(["move", "capture", "bonus"]);
    expect(currentPlayer(r.state).seat).toBe(0);
  });

  it("gives no bonus when the capture bonus rule is off", () => {
    const g = scene({ dice: [4], tokens: { 0: [5, -1, -1, -1], 1: [victim(9), -1, -1, -1] }, rules: { captureBonus: false } });
    const r = applyAction(g, { type: "move", token: 0, die: 4 })!;
    expect(r.events.map(e => e.type)).toEqual(["move", "capture", "turn"]);
  });

  it("cannot capture on a star or a start square", () => {
    const g = scene({ dice: [3], tokens: { 0: [5, -1, -1, -1], 1: [victim(8), -1, -1, -1] } });
    expect(legalMoves(g)[0].captures).toBe(false);
    const after = applyAction(g, { type: "move", token: 0, die: 3 })!;
    expect(after.state.players[1].tokens[0]).toBe(victim(8));
    // with safe squares switched off the same move captures
    const off = scene({ dice: [3], tokens: { 0: [5, -1, -1, -1], 1: [victim(8), -1, -1, -1] }, rules: { safeSquares: false } });
    expect(legalMoves(off)[0].captures).toBe(true);
  });

  it("captures every opponent token sharing the square when blockades are off", () => {
    const g = scene({
      dice: [4], tokens: { 0: [5, -1, -1, -1], 1: [victim(9), victim(9), -1, -1] }, rules: { blockades: false },
    });
    const r = applyAction(g, { type: "move", token: 0, die: 4 })!;
    expect(r.state.players[1].tokens.slice(0, 2)).toEqual([YARD, YARD]);
  });

  it("never captures a token in a home column", () => {
    const g = scene({ dice: [1], tokens: { 0: [49, -1, -1, -1], 1: [51, -1, -1, -1] } });
    expect(legalMoves(g)[0].captures).toBe(false);
  });
});

describe("blockades", () => {
  const victim = (ring: number) => (ring - START_INDEX[1] + 52) % 52;

  it("stop opponents passing or landing", () => {
    const blocked = scene({ dice: [5], tokens: { 0: [2, -1, -1, -1], 1: [victim(6), victim(6), -1, -1] } });
    expect(legalMoves(blocked)).toEqual([]); // 2 -> 7 passes ring 6
    const landing = scene({ dice: [4], tokens: { 0: [2, -1, -1, -1], 1: [victim(6), victim(6), -1, -1] } });
    expect(legalMoves(landing)).toEqual([]);
    const before = scene({ dice: [3], tokens: { 0: [2, -1, -1, -1], 1: [victim(6), victim(6), -1, -1] } });
    expect(legalMoves(before)).toHaveLength(1);
  });

  it("do not stop their owner, and are off when the rule is off", () => {
    const own = scene({ dice: [5], tokens: { 0: [2, 6, 6, -1] } });
    expect(legalMoves(own).some(m => m.token === 0)).toBe(true);
    const off = scene({ dice: [5], tokens: { 0: [2, -1, -1, -1], 1: [victim(6), victim(6), -1, -1] }, rules: { blockades: false } });
    expect(legalMoves(off)).toHaveLength(1);
  });

  it("do not form on safe squares", () => {
    // ring 13 is seat 1's start square (safe): a pair there does not block seat 0's token
    const g = scene({ dice: [6], tokens: { 0: [10, -1, -1, -1], 1: [victim(13), victim(13), -1, -1] } });
    expect(legalMoves(g).some(m => m.token === 0)).toBe(true);
    const off = scene({ dice: [6], tokens: { 0: [10, -1, -1, -1], 1: [victim(13), victim(13), -1, -1] }, rules: { safeSquares: false } });
    expect(legalMoves(off).some(m => m.token === 0)).toBe(false);
  });
});

describe("two dice", () => {
  it("lets a player spend each die or their sum when they differ", () => {
    const g = scene({ dice: [2, 5], tokens: { 0: [10, -1, -1, -1] }, rules: { twoDice: true } });
    expect(dicePool(g).sort()).toEqual([2, 5, 7]);
    const r = applyAction(g, { type: "move", token: 0, die: 7 })!;
    expect(r.state.players[0].tokens[0]).toBe(17);
    expect(r.events.map(e => e.type)).toEqual(["move", "turn"]);
  });

  it("keeps the other die after spending one", () => {
    const g = scene({ dice: [2, 5], tokens: { 0: [10, 20, -1, -1] }, rules: { twoDice: true } });
    const r = applyAction(g, { type: "move", token: 0, die: 2 })!;
    expect(r.state.phase).toBe("move");
    expect(r.state.dice).toEqual([5]);
    const done = applyAction(r.state, { type: "move", token: 1, die: 5 })!;
    expect(currentPlayer(done.state).seat).toBe(1);
  });

  it("does not offer a sum for doubles", () => {
    const g = scene({ dice: [3, 3], tokens: { 0: [10, -1, -1, -1] }, rules: { twoDice: true } });
    expect(dicePool(g)).toEqual([3]);
  });

  it("rolls two dice", () => {
    const g = createGame(humans(0, 1), { ...DEFAULT_RULES, twoDice: true }, 7);
    expect(applyAction(g, { type: "roll" })!.events[0]).toMatchObject({ type: "roll", dice: expect.any(Array) });
  });
});

describe("forfeits", () => {
  it("hands the win to the last player standing", () => {
    const r = applyAction(scene({ seats: [0, 1] }), { type: "forfeit", seat: 0 })!;
    expect(r.state.phase).toBe("over");
    expect(r.state.winner).toBe(1);
  });

  it("passes the turn when the current player leaves, and keeps it otherwise", () => {
    const g = scene({ seats: [0, 1, 2] });
    const out = applyAction(g, { type: "forfeit", seat: 0 })!;
    expect(currentPlayer(out.state).seat).toBe(1);
    const other = applyAction(g, { type: "forfeit", seat: 2 })!;
    expect(currentPlayer(other.state).seat).toBe(0);
    const g2 = scene({ seats: [0, 1, 2], turnSeat: 2 });
    expect(currentPlayer(applyAction(g2, { type: "forfeit", seat: 0 })!.state).seat).toBe(2);
    expect(applyAction(g, { type: "forfeit", seat: 3 })).toBeNull();
  });
});

describe("bots", () => {
  it("take a finishing or capturing move when one exists", () => {
    const g = scene({ dice: [2], tokens: { 0: [55, 10, -1, -1] } });
    g.players[0].level = "normal";
    expect(chooseMove(g)).toMatchObject({ token: 0, finishes: true });
    const victim = (ring: number) => (ring - START_INDEX[1] + 52) % 52;
    const cap = scene({ dice: [4], tokens: { 0: [5, 30, -1, -1], 1: [victim(9), -1, -1, -1] } });
    cap.players[0].level = "hard";
    expect(chooseMove(cap)).toMatchObject({ token: 0, captures: true });
  });

  it("hard bots avoid stepping in front of an opponent", () => {
    const victim = (ring: number) => (ring - START_INDEX[1] + 52) % 52;
    // token 0 would land 3 squares ahead of an opponent; token 1 lands somewhere quiet
    const g = scene({ dice: [3], tokens: { 0: [20, 30, -1, -1], 1: [victim(20 + 3 - 2), -1, -1, -1] } });
    g.players[0].level = "hard";
    expect(chooseMove(g)!.token).toBe(1);
  });

  it("easy bots still only choose legal moves", () => {
    const g = scene({ dice: [6], tokens: { 0: [-1, 3, -1, -1] } });
    g.players[0].level = "easy";
    const legal = legalMoves(g).map(m => `${m.token}:${m.die}`);
    for (let i = 0; i < 50; i++) {
      const m = chooseMove(g, Math.random)!;
      expect(legal).toContain(`${m.token}:${m.die}`);
    }
    expect(autoAction(createGame(humans(0, 1)))).toEqual({ type: "roll" });
  });
});

describe("whole games", () => {
  const ruleSets: Partial<Rules>[] = [
    {}, { twoDice: true }, { blockades: false }, { safeSquares: false, captureBonus: false },
    { threeSixes: false, finishBonus: false }, { twoDice: true, blockades: false, safeSquares: false },
  ];

  const checkInvariants = (g: GameState, seed: number, step: number) => {
    const seen = new Map<number, Seat>();
    for (const p of g.players) {
      for (const t of p.tokens) {
        if (t < YARD || t > FINISH) throw new Error(`seed ${seed} step ${step}: token out of range ${t}`);
        const ring = ringIndexOf(p.seat, t);
        if (ring === null) continue;
        const owner = seen.get(ring);
        // two colours may share a square only where captures cannot happen
        if (owner !== undefined && owner !== p.seat && !(g.rules.safeSquares && isSafeRingIndex(ring))) {
          throw new Error(`seed ${seed} step ${step}: seats ${owner} and ${p.seat} share ring ${ring}`);
        }
        seen.set(ring, p.seat);
      }
    }
  };

  const play = (seed: number, seats: Seat[], rules: Partial<Rules>) => {
    let g = createGame(
      seats.map((seat, i) => ({ seat, name: `B${seat}`, kind: "bot" as const, level: (["easy", "normal", "hard"] as const)[(i + seed) % 3] })),
      { ...DEFAULT_RULES, ...rules }, seed,
    );
    let steps = 0;
    while (g.phase !== "over" && steps < 30000) {
      const a = autoAction(g, () => ((seed * 9301 + steps * 49297) % 233280) / 233280)!;
      const r = applyAction(g, a);
      if (!r) throw new Error(`seed ${seed} step ${steps}: illegal ${JSON.stringify(a)}`);
      g = r.state;
      steps++;
      checkInvariants(g, seed, steps);
    }
    return { g, steps };
  };

  it.each(ruleSets.map((r, i) => [i, r] as const))("bot games finish with one winner (rule set %i)", { timeout: 60000 }, (_i, rules) => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const seats of [[0, 1], [0, 2], [0, 1, 2], [0, 1, 2, 3]] as Seat[][]) {
        const { g, steps } = play(seed, seats, rules);
        expect(g.phase, `seed ${seed} seats ${seats} steps ${steps}`).toBe("over");
        const winner = g.players.find(p => p.seat === g.winner)!;
        expect(winner.tokens.every(t => t === FINISH)).toBe(true);
      }
    }
  });
});
