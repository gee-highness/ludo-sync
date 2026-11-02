import { describe, expect, it } from "vitest";
import { sanitizeRules } from "../../platform/rules";
import { GameTable, simulate } from "../../platform/table";
import type { BotLevel } from "../../platform/types";
import { SCHEMA, memory as d, type MAction, type MState } from "./driver";

const mk = (rules: Record<string, unknown> = {}, n = 2, seed = 4) => new GameTable(d, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, kind: "human" as const })), rules, seed);
const posOf = (s: MState, symbol: number) => s.cards.flatMap((c, i) => (c === symbol ? [i] : []));
const flip = (t: GameTable<MState, MAction, unknown>, pos: number) => t.act(t.state.turn, { type: "flip", pos });

describe("memory", () => {
  it("deals sets of matching cards and hides them in the view", () => {
    const t = mk({ sets: 6 });
    expect(t.state.cards.length).toBe(12);
    for (let i = 0; i < 6; i++) expect(posOf(t.state, i).length).toBe(2);
    const v = d.view(t.state, 0);
    expect(v.faces.every(f => f === -1)).toBe(true);
    expect(JSON.stringify(v)).not.toContain('"cards"');
  });
  it("a match scores and keeps the turn; a miss waits to be turned back and passes the turn", () => {
    const t = mk({ sets: 6 });
    const p = t.state.turn;
    const [a, b] = posOf(t.state, 0);
    flip(t, a); flip(t, b);
    expect(t.state.scores[p]).toBe(1);
    expect(t.state.turn).toBe(p);
    expect(d.view(t.state, 0).faces[a]).toBe(0); // matched cards stay face up
    const x = t.state.cards.findIndex((c, i) => !t.state.matched[i] && c !== 1), y = t.state.cards.findIndex((c, i) => i !== x && !t.state.matched[i] && c !== t.state.cards[x]);
    flip(t, x); flip(t, y);
    expect(t.state.phase).toBe("mismatch");
    expect(d.view(t.state, 0).faces[x]).toBeGreaterThanOrEqual(0);
    expect(t.act(p, { type: "flip", pos: 0 })).toBeNull(); // cannot flip while the miss is showing
    expect(t.act((p + 1) % 2, { type: "continue" })).not.toBeNull();
    expect(t.state.turn).toBe((p + 1) % 2);
    expect(d.view(t.state, 0).faces[x]).toBe(-1);
  });
  it("cannot flip a matched or already flipped card, or out of turn", () => {
    const t = mk({ sets: 4 });
    const p = t.state.turn;
    flip(t, 0);
    expect(t.act(p, { type: "flip", pos: 0 })).toBeNull();
    expect(t.act((p + 1) % 2, { type: "flip", pos: 1 })).toBeNull();
    expect(t.act(p, { type: "flip", pos: 99 })).toBeNull();
  });
  it("supports triples: a match needs three, and a wrong second card ends the try early", () => {
    const t = mk({ matchSize: 3, sets: 4 });
    const p = t.state.turn;
    const [a, b, c] = posOf(t.state, 0);
    flip(t, a); flip(t, b);
    expect(t.state.phase).toBe("play");
    flip(t, c);
    expect(t.state.sets[p]).toBe(1);
    const x = posOf(t.state, 1)[0], y = posOf(t.state, 2)[0];
    flip(t, x); flip(t, y);
    expect(t.state.phase).toBe("mismatch");
  });
  it("another go can be switched off, streak bonuses and penalties apply", () => {
    const off = mk({ again: false, sets: 4 });
    const p = off.state.turn;
    const [a, b] = posOf(off.state, 0);
    flip(off, a); flip(off, b);
    expect(off.state.turn).toBe((p + 1) % 2);
    const risky = mk({ sets: 4, streakBonus: 2, missPenalty: 1 });
    const q = risky.state.turn;
    for (const s of [0, 1]) { const [x, y] = posOf(risky.state, s); flip(risky, x); flip(risky, y); }
    expect(risky.state.scores[q]).toBe(1 + (1 + 2));
    const x = posOf(risky.state, 2)[0], y = posOf(risky.state, 3)[0];
    flip(risky, x); flip(risky, y);
    expect(risky.state.scores[q]).toBe(3);
  });
  it("peek shows every card until the game starts", () => {
    const t = mk({ peek: true, sets: 4 });
    expect(d.view(t.state, 0).faces.every(f => f >= 0)).toBe(true);
    expect(t.act(0, { type: "flip", pos: 0 })).toBeNull();
    expect(t.act(1, { type: "start" })).not.toBeNull();
    expect(d.view(t.state, 0).faces.every(f => f === -1)).toBe(true);
  });
  it("ends when everything is found, with the highest score winning and ties sharing", () => {
    const t = mk({ sets: 3 });
    for (let s = 0; s < 3; s++) { const [a, b] = posOf(t.state, s); flip(t, a); flip(t, b); }
    expect(t.state.phase).toBe("over");
    expect(d.winners(t.state)).toEqual([t.state.turn]);
  });
  it("works for one player", () => {
    const t = mk({ sets: 3 }, 1);
    for (let s = 0; s < 3; s++) { const [a, b] = posOf(t.state, s); flip(t, a); flip(t, b); }
    expect(d.winners(t.state)).toEqual([0]);
  });
  it("parses actions and clamps rules", () => {
    expect(d.parseAction({ type: "flip", pos: 3 })).toEqual({ type: "flip", pos: 3 });
    expect(d.parseAction({ type: "flip", pos: "3" })).toBeNull();
    expect(sanitizeRules(SCHEMA, { sets: 99, matchSize: 9 }).sets).toBe(32);
  });
});

describe("bots", () => {
  it("finish games and remember more at higher levels", { timeout: 120000 }, () => {
    const turns = (level: BotLevel) => { let total = 0; for (let seed = 1; seed <= 12; seed++) total += simulate(d, [level], { sets: 10 }, seed, 20000).steps; return total; };
    const easy = turns("easy"), hard = turns("hard");
    expect(hard).toBeLessThan(easy);
    for (const rules of [{ matchSize: 3, sets: 6 }, { again: false }, { peek: true }, { sets: 32 }]) expect(simulate(d, ["normal", "hard"], rules, 3, 20000).finished).toBe(true);
  });
});
