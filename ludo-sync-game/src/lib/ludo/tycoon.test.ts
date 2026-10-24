import { describe, expect, it } from "vitest";
import { autoAction } from "./bot";
import { applyAction, createGame } from "./engine";
import { RING_LENGTH } from "./board";
import { SQUARES, START_CASH, ownsFullSet, rentOf, createTycoon } from "./tycoon";
import { parseGameState } from "./validate";
import { DEFAULT_RULES, DEFAULT_TUNING, type GameState } from "./types";

const rules = { ...DEFAULT_RULES, tycoon: true };
const two = (seed = 1) => createGame(
  [{ seat: 0, name: "A", kind: "human" }, { seat: 2, name: "B", kind: "human" }], rules, seed,
);

describe("tycoon board", () => {
  it("has 32 properties in 12 groups of 2 or 3", () => {
    const props = SQUARES.filter(s => s.kind === "property");
    expect(props).toHaveLength(32);
    const sizes = new Map<number, number>();
    props.forEach(p => sizes.set(p.group, (sizes.get(p.group) ?? 0) + 1));
    expect(sizes.size).toBe(12);
    expect([...sizes.values()].filter(n => n === 3)).toHaveLength(8);
    expect([...sizes.values()].filter(n => n === 2)).toHaveLength(4);
    expect(SQUARES).toHaveLength(RING_LENGTH);
  });
  it("prices rise around the ring", () => {
    const prices = SQUARES.filter(s => s.kind === "property").map(s => s.price);
    expect(prices[0]).toBe(60);
    expect(prices[31]).toBe(400);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
  it("doubles rent on a full set", () => {
    const t = createTycoon();
    const group = SQUARES.filter(s => s.group === 0).map(s => s.ring);
    t.owner[group[0]] = 0;
    const single = rentOf(t, group[0]);
    group.forEach(r => (t.owner[r] = 0));
    expect(ownsFullSet(t, 0, group[0])).toBe(true);
    expect(rentOf(t, group[0])).toBe(single * 2);
  });
});

describe("tycoon turns", () => {
  it("starts with cash and no deed owners, and survives validation", () => {
    const g = two();
    expect(g.tycoon!.cash.slice(0, 4)).toEqual([START_CASH, START_CASH, START_CASH, START_CASH]);
    expect(parseGameState(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });

  it("offers a purchase, lets the player buy it, and charges rent to the next visitor", () => {
    let g = two();
    // put seat 0's token one step from an unowned property (ring 1), 6 rolled
    g = { ...g, players: g.players.map(p => (p.seat === 0 ? { ...p, tokens: [0, -1, -1, -1] } : p)), phase: "move", dice: [1], rolled: [1] };
    const r = applyAction(g, { type: "move", token: 0, die: 1 })!;
    expect(r.state.phase).toBe("decide");
    expect(r.state.tycoon!.pending).toMatchObject({ seat: 0, ring: 1, kind: "buy" });
    expect(applyAction(r.state, { type: "roll" })).toBeNull();

    const bought = applyAction(r.state, { type: "buy" })!;
    const price = SQUARES[1].price;
    expect(bought.state.tycoon!.owner[1]).toBe(0);
    expect(bought.state.tycoon!.cash[0]).toBe(START_CASH - price);
    expect(bought.state.phase).toBe("roll");
    expect(bought.state.turn).toBe(1);

    // seat 2 lands on it: ring 1 is progress 1 - 26 mod... use progress 27 for seat 2
    let h = { ...bought.state, players: bought.state.players.map(p => (p.seat === 2 ? { ...p, tokens: [26, -1, -1, -1] } : p)), phase: "move" as const, dice: [1], rolled: [1] };
    h = { ...h, turn: 1, players: h.players.map(p => (p.seat === 0 ? { ...p, tokens: [-1, -1, -1, -1] } : p)) };
    // seat 2 progress 26 -> ring (26+26)%52 = 0; +1 -> ring 1
    const paid = applyAction(h, { type: "move", token: 0, die: 1 })!;
    expect(paid.state.tycoon!.cash[2]).toBe(START_CASH - rentOf(bought.state.tycoon!, 1));
    expect(paid.state.tycoon!.cash[0]).toBe(START_CASH - price + rentOf(bought.state.tycoon!, 1));
  });

  it("passing leaves the square unowned", () => {
    let g = two();
    g = { ...g, players: g.players.map(p => (p.seat === 0 ? { ...p, tokens: [0, -1, -1, -1] } : p)), phase: "move", dice: [1], rolled: [1] };
    const r = applyAction(g, { type: "move", token: 0, die: 1 })!;
    const passed = applyAction(r.state, { type: "pass" })!;
    expect(passed.state.tycoon!.owner[1]).toBe(-1);
    expect(passed.state.tycoon!.cash[0]).toBe(START_CASH);
  });

  it("bankrupts a player who cannot pay, freeing their squares", () => {
    let g = two();
    const t = createTycoon();
    t.owner[1] = 2; // seat 2 owns ring 1
    t.cash[0] = 0;
    g = { ...g, tycoon: t, players: g.players.map(p => (p.seat === 0 ? { ...p, tokens: [0, -1, -1, -1] } : p)), phase: "move", dice: [1], rolled: [1] };
    const r = applyAction(g, { type: "move", token: 0, die: 1 })!;
    expect(r.events.some(e => e.type === "bankrupt")).toBe(true);
    expect(r.state.phase).toBe("over");
    expect(r.state.winner).toBe(2);
  });

  it("rejects hand-edited tycoon state", () => {
    const g = JSON.parse(JSON.stringify(two()));
    g.tycoon.cash = [1, 2];
    expect(parseGameState(g)).toBeNull();
  });
});

describe("tycoon whole games", () => {
  it("bot games always end, with sane money", () => {
    let finished = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const seats = ([[0, 1], [0, 2], [0, 1, 2], [0, 1, 2, 3]] as const)[seed % 4];
      let g: GameState = createGame(
        seats.map((seat, i) => ({ seat, name: `B${seat}`, kind: "bot" as const, level: (["easy", "normal", "hard"] as const)[(i + seed) % 3] })),
        rules, seed,
      );
      let steps = 0;
      let k = 0;
      const rand = () => { k += 1; return ((seed * 9301 + k * 49297) % 233280) / 233280; };
      while (g.phase !== "over" && steps < 40000) {
        const a = autoAction(g, rand)!;
        const r = applyAction(g, a);
        if (!r) throw new Error(`seed ${seed}: bot made an illegal ${JSON.stringify(a)} in ${g.phase}`);
        g = r.state;
        steps++;
        const t = g.tycoon!;
        for (const p of g.players) {
          if (!Number.isInteger(t.cash[p.seat]) || t.cash[p.seat] < 0) throw new Error(`seed ${seed}: bad cash ${t.cash[p.seat]}`);
        }
        for (let ring = 0; ring < RING_LENGTH; ring++) {
          const o = t.owner[ring];
          if (o === -1) continue;
          const kind = SQUARES[ring].kind;
          if (kind !== "property" && kind !== "station" && kind !== "utility") throw new Error(`seed ${seed}: unownable ${ring} owned`);
          if (g.phase !== "over" && !g.players.some(p => p.seat === o)) throw new Error(`seed ${seed}: ring ${ring} owned by a departed seat`);
        }
      }
      if (g.phase === "over") finished++;
      expect(g.phase).toBe("over");
      expect(parseGameState(JSON.parse(JSON.stringify(g)))).not.toBeNull();
    }
    expect(finished).toBe(20);
  }, 60000);
});

import { rentTable } from "./tycoon";
describe("property cards", () => {
  it("has original, unique names for every square", () => {
    const names = SQUARES.map(s => s.name);
    const props = SQUARES.filter(s => s.kind === "property").map(s => s.name);
    expect(new Set(props).size).toBe(32);
    expect(names.join(" ")).not.toMatch(/Chance|Community Chest|Boardwalk|Park Place|Mayfair|Baltic|Mediterranean|Marvin|Ventnor|Atlantic/);
    expect(SQUARES.filter(s => s.kind === "chance")[0].name).toBe("Lucky Draw");
    expect(SQUARES.filter(s => s.kind === "chest")[0].name).toBe("City Fund");
  });
  it("prints the rent in every situation, matching what is actually charged", () => {
    const ring = SQUARES.find(s => s.kind === "property")!.ring;
    const table = rentTable(ring);
    const t = createTycoon();
    t.owner[ring] = 0;
    expect(table.rows[0].amount).toBe(rentOf(t, ring));
    t.level[ring] = 2;
    expect(table.rows[3].amount).toBe(rentOf(t, ring));
    expect(table.mortgage).toBe(Math.floor(SQUARES[ring].price / 2));
    expect(rentTable(ring, { ...DEFAULT_TUNING, maxBuild: 1 }).rows).toHaveLength(3);
    expect(rentTable(SQUARES.find(s => s.kind === "station")!.ring).rows.map(r => r.amount)).toEqual([25, 50, 75, 100]);
    expect(rentTable(SQUARES.find(s => s.kind === "tax")!.ring).rows).toHaveLength(0);
  });
});
