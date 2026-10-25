import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, evaluate, newlyUnlocked } from "./achievements";
import { applyGame, emptyStats, loadStats } from "./stats";

describe("stats", () => {
  it("counts wins in a row and resets on a loss", () => {
    let s = emptyStats();
    for (let i = 0; i < 3; i++) s = applyGame(s, { won: true, captures: 1 });
    expect(s.streak).toBe(3);
    s = applyGame(s, { won: false, captures: 0 });
    expect([s.streak, s.bestStreak, s.played, s.won, s.captures]).toEqual([0, 3, 4, 3, 3]);
  });
  it("remembers bot wins, vehicles and daily wins without double counting", () => {
    let s = applyGame(emptyStats(), { won: true, captures: 0, botLevel: "hard", vehicles: ["car", "bus"], daily: true });
    s = applyGame(s, { won: true, captures: 0, botLevel: "hard", vehicles: ["car", "taxi"], daily: false });
    expect(s.botWins).toEqual({ easy: 0, normal: 0, hard: 2 });
    expect(s.vehicles.sort()).toEqual(["bus", "car", "taxi"]);
    expect(s.dailyWins).toBe(1);
  });
  it("cleans anything odd that was stored", () => {
    expect(loadStats().streak).toBe(0);
  });
});

describe("achievements", () => {
  it("have unique ids and reachable goals", () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) { expect(a.goal).toBeGreaterThan(0); expect(a.title.length).toBeGreaterThan(2); }
  });
  it("start locked and cap progress at the goal", () => {
    expect(evaluate(emptyStats()).every(x => !x.done && x.value === 0)).toBe(true);
    const rich = { ...emptyStats(), played: 999, won: 999, captures: 999, bestStreak: 99, streak: 99, dailyWins: 99, botWins: { easy: 5, normal: 5, hard: 5 }, vehicles: ["car", "bus", "taxi", "van", "suv", "truck", "sports", "motorbike", "scooter", "bicycle", "tuktuk"] };
    expect(evaluate(rich).every(x => x.done && x.value === x.achievement.goal)).toBe(true);
  });
  it("report exactly what a game unlocked", () => {
    const before = emptyStats();
    const after = applyGame(before, { won: true, captures: 0, botLevel: "easy", vehicles: ["car"] });
    expect(newlyUnlocked(before, after).map(a => a.id)).toEqual(["first-win"]);
    expect(newlyUnlocked(after, after)).toEqual([]);
  });
});
