import { describe, expect, it } from "vitest";
import { createGame } from "../ludo/engine";
import { afterFinish, dailyChallenge, dailyDone, dailySetups, dateKey, yesterdayOf } from "./daily";

describe("daily challenge", () => {
  it("is the same for everyone on a day, and changes from day to day", () => {
    expect(dailyChallenge("2026-10-25")).toEqual(dailyChallenge("2026-10-25"));
    const titles = Array.from({ length: 7 }, (_, i) => dailyChallenge(dateKey(new Date(2026, 9, 25 + i))).title);
    expect(new Set(titles).size).toBe(7);
    expect(dailyChallenge("2026-10-25").seed).not.toBe(dailyChallenge("2026-10-26").seed);
  });
  it("always makes a game that can be played", () => {
    for (let i = 0; i < 60; i++) {
      const d = dailyChallenge(dateKey(new Date(2026, 0, 1 + i)));
      const setups = dailySetups(d, "Me");
      expect(setups[0]).toMatchObject({ seat: 0, kind: "human" });
      expect(new Set(setups.map(s => s.seat)).size).toBe(setups.length);
      expect(setups.length).toBeGreaterThanOrEqual(2);
      const g = createGame(setups, d.rules, d.seed);
      expect(g.players).toHaveLength(setups.length);
      expect(g.phase).toBe("roll");
    }
  });
  it("gives everybody the same dice", () => {
    const d = dailyChallenge("2026-10-25");
    expect(createGame(dailySetups(d, "A"), d.rules, d.seed).rng).toBe(createGame(dailySetups(d, "B"), d.rules, d.seed).rng);
  });
  it("reads days correctly across month and year ends", () => {
    expect(yesterdayOf("2026-03-01")).toBe("2026-02-28");
    expect(yesterdayOf("2027-01-01")).toBe("2026-12-31");
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("counts days in a row, and counts only the first finish of a day", () => {
    let r = afterFinish({ date: "", won: false, streakDays: 0, lastWon: "" }, "2026-10-25", true);
    expect(r).toMatchObject({ won: true, streakDays: 1 });
    r = afterFinish(r, "2026-10-25", false);
    expect(r.won).toBe(true);
    r = afterFinish(r, "2026-10-26", true);
    expect(r.streakDays).toBe(2);
    r = afterFinish(r, "2026-10-27", false);
    expect(r.streakDays).toBe(2);
    r = afterFinish(r, "2026-10-29", true);
    expect(r.streakDays).toBe(1);
    expect(dailyDone(r, "2026-10-29")).toBe(true);
    expect(dailyDone(r, "2026-10-30")).toBe(false);
  });
});
