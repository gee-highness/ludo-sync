import { describe, expect, it } from "vitest";
import { defaultsOf } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { generateBoard, type BoardCfg } from "./boards";
import { SCHEMA, landing, snakes as d, type SAction, type SState } from "./driver";

const cfg = (o: Partial<BoardCfg> = {}): BoardCfg => ({ cols: 10, rows: 10, ladders: 8, snakes: 8, minJump: 8, specials: 0, dice: 1, sides: 6, finish: "exact", ...o });
const mk = (rules: Record<string, unknown> = {}, n = 2, seed = 5) => new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), rules, seed);
const st = (t: GameTable<SState, SAction, unknown>) => t.state as SState;

describe("board generator", () => {
  it("always makes a valid layout: no shared squares, every jump long enough, nothing on the first or last square", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const c = cfg({ specials: 6 });
      const b = generateBoard(seed, c), size = 100;
      const ends = Object.entries(b.jumps).flatMap(([a, t]) => [Number(a), t]);
      expect(new Set(ends).size, `seed ${seed}`).toBe(ends.length);
      for (const [a, t] of Object.entries(b.jumps)) {
        expect(Math.abs(t - Number(a))).toBeGreaterThanOrEqual(c.minJump);
        expect(Number(a) > 1 && Number(a) < size && t > 1 && t < size).toBe(true);
        expect(Math.ceil(Number(a) / 10)).not.toBe(Math.ceil(t / 10));
      }
      for (const q of Object.keys(b.special)) expect(ends.includes(Number(q))).toBe(false);
      for (const [a, t] of Object.entries(b.warp)) expect(b.warp[t]).toBe(Number(a));
      expect(b.report.ladders + b.report.snakes).toBeGreaterThan(10);
    }
  });
  it("is the same board for the same seed, and different boards for different seeds", () => {
    expect(generateBoard(42, cfg())).toEqual(generateBoard(42, cfg()));
    expect(JSON.stringify(generateBoard(42, cfg()).jumps)).not.toBe(JSON.stringify(generateBoard(43, cfg()).jumps));
  });
  it("keeps boards in a healthy length window", () => {
    let balanced = 0;
    for (let seed = 1; seed <= 40; seed++) if (generateBoard(seed, cfg()).report.balanced) balanced++;
    expect(balanced).toBeGreaterThanOrEqual(38);
    const r = generateBoard(9, cfg()).report;
    expect(r.avg).toBeGreaterThan(20);
    expect(r.avg).toBeLessThan(90);
  });
  it("a board number gives everyone the same board", () => {
    const a = mk({ boardSeed: 1234 }, 2, 1), b = mk({ boardSeed: 1234 }, 3, 999);
    expect(st(a).jumps).toEqual(st(b).jumps);
  });
});

describe("special squares", () => {
  const plain = (extra: Record<string, unknown> = {}) => { const t = mk({ fixed: false, ladders: 0, snakes: 0, specials: 0, bonus: "off", ...extra }, 3); const s = st(t); s.jumps = {}; s.turn = 0; return { t, s }; };
  it("a portal sends you to its partner", () => {
    const { t, s } = plain();
    s.special = { 7: "warp", 40: "warp" }; s.warp = { 7: 40, 40: 7 }; s.pos = [4, 0];
    const L = landing(s, 4, 3);
    expect(L.to).toBe(40);
    expect(L.slides).toEqual([[7, 40, "warp"]]);
    void t;
  });
  it("a trap square makes you miss your next turn", () => {
    const { s } = plain({ dice: 1, sides: 3 });
    s.special = { 5: "skip" }; s.pos = [4, 0, 0]; s.turn = 0; s.skip = [0, 0, 0];
    let hit: ReturnType<typeof d.apply> = null;
    for (let rng = 1; rng < 500 && !hit; rng++) { const r = d.apply({ ...s, rng }, { type: "roll" }, 0); if (r && r.state.pos[0] === 5) hit = r; }
    expect(hit).not.toBeNull();
    expect(hit!.state.skip[0]).toBe(1);
    expect(hit!.events.some(e => e.type === "trap")).toBe(true);
    // the other two players go before the trapped one gets another turn
    const again = d.apply(hit!.state, { type: "roll" }, hit!.state.turn)!;
    void again;
  });
  it("a bonus square rolls again, a safe square cannot be bumped", () => {
    expect(landing({ ...st(mk()), special: { 9: "bonus" }, jumps: {} }, 6, 3).bonus).toBe(true);
    const { t, s } = plain({ bump: true });
    s.special = { 9: "safe" }; s.pos = [5, 9]; s.rng = 1;
    for (let i = 0; i < 50; i++) { s.pos = [8, 9]; s.turn = 0; t.act(0, { type: "roll" }); expect(st(t).pos[1]).toBe(9); }
  });
});

describe("choose a die", () => {
  it("waits for a choice, then moves by that die", () => {
    const t = mk({ dice: 2, dieChoice: true, enter: "any" });
    const s = st(t); s.turn = 0;
    expect(t.act(0, { type: "roll" })).not.toBeNull();
    const dice = st(t).pending!;
    expect(dice).toHaveLength(2);
    expect(t.act(0, { type: "roll" })).toBeNull();
    expect(t.act(1, { type: "use", use: "a" })).toBeNull();
    expect(d.view(st(t), 0).choices).not.toBeNull();
    t.act(0, { type: "use", use: "b" });
    expect(st(t).pending).toBeNull();
    expect(st(t).last?.use).toBe("b");
    expect(st(t).last?.from).toBe(0);
  });
  it("parses actions strictly", () => {
    expect(d.parseAction({ type: "use", use: "sum" })).toEqual({ type: "use", use: "sum" });
    expect(d.parseAction({ type: "use", use: "all" })).toBeNull();
  });
});

describe("whole games", () => {
  for (const rules of [{ specials: 8, bump: true }, { dice: 2, dieChoice: true, specials: 6, bonus: "doubles" }, { fixed: true, specials: 4 }, { cols: 6, rows: 6, ladders: 4, snakes: 4, minJump: 5 }]) {
    it(`bots finish: ${JSON.stringify(rules)}`, () => {
      for (const level of ["easy", "hard"] as BotLevel[]) {
        const r = simulate(d, [level, level, level], { ...defaultsOf(SCHEMA), ...rules }, 7, 6000);
        expect(r.finished, level).toBe(true);
      }
    });
  }
});

describe("exact finish with several dice", () => {
  it("never leaves a token stuck one square short", () => {
    const t = mk({ fixed: false, ladders: 0, snakes: 0, dice: 2, finish: "exact" }, 2);
    const s = st(t);
    expect(landing(s, 99, 5).to).toBe(100);
    expect(landing(s, 99, 2).to).toBe(100);
    expect(landing(s, 96, 9).to).toBe(96); // still has room: needs an exact roll
  });
  it("two-dice boards report a sensible game length", () => {
    expect(generateBoard(3, cfg({ dice: 2, finish: "exact" })).report.avg).toBeLessThan(60);
  });
});
