import { describe, expect, it } from "vitest";
import { evaluate, newlyUnlocked } from "./achievements";
import { applyDaily, skipBoDaily } from "./daily";
import { cleanPrefs } from "./prefs";
import { applyGame, emptyStats, type GameTotals } from "./stats";
import { applyAction, createGame } from "./engine";
import { chooseAction } from "./bot";
import { fits } from "./engine";
import { WILD, type GameState } from "./types";

const totals = (o: Partial<GameTotals> = {}): GameTotals => ({ won: true, tournament: false, piles: 0, bestTurn: 0, bonusHands: 0, wildsPlayed: 0, ...o });

describe("stats and achievements", () => {
  it("add up game by game, with streaks and bests", () => {
    let s = applyGame(emptyStats(), totals({ botLevel: "hard", piles: 3, bestTurn: 9, bonusHands: 1, wildsPlayed: 2, daily: true }));
    expect(s).toMatchObject({ played: 1, won: 1, piles: 3, bestTurn: 9, streak: 1, dailyWins: 1, winsBy: { hard: 1, easy: 0, normal: 0 } });
    s = applyGame(s, totals({ won: false, bestTurn: 4 }));
    expect(s).toMatchObject({ played: 2, won: 1, bestTurn: 9, streak: 0, bestStreak: 1 });
    s = applyGame(s, totals({ tournament: true, withFriends: true }));
    expect(s.tournamentsWon).toBe(1);
    expect(s.friendGames).toBe(1);
  });
  it("unlock at the right thresholds, once", () => {
    const a = emptyStats();
    const b = applyGame(a, totals({ botLevel: "hard", bestTurn: 8 }));
    expect(newlyUnlocked(a, b).map(x => x.id).sort()).toEqual(["sb-first", "sb-hard", "sb-turn-8"]);
    expect(newlyUnlocked(b, applyGame(b, totals())).map(x => x.id)).toEqual([]);
    expect(evaluate(emptyStats()).every(x => !x.done)).toBe(true);
    expect(evaluate(b).find(x => x.achievement.id === "sb-levels")!.value).toBe(1);
  });
});

describe("daily challenge", () => {
  it("is the same for everyone on a date, valid, and changes with the date", () => {
    const d = skipBoDaily("2026-06-01");
    expect(skipBoDaily("2026-06-01")).toEqual(d);
    expect(d.bots.length).toBeGreaterThan(0);
    expect(d.bots.length).toBeLessThanOrEqual(5);
    expect(d.seed).toBeGreaterThan(0);
    const titles = new Set(Array.from({ length: 7 }, (_, i) => skipBoDaily(`2026-06-0${i + 1}`).title));
    expect(titles.size).toBe(7);
    for (let i = 1; i <= 28; i++) { const x = skipBoDaily(`2026-02-${String(i).padStart(2, "0")}`); expect([10, 15, 20, 30]).toContain(x.stockSize); }
  });
  it("keeps a streak only through consecutive wins", () => {
    let r = applyDaily({ lastDate: "", won: false, streakDays: 0 }, "2026-06-01", true);
    expect(r.streakDays).toBe(1);
    r = applyDaily(r, "2026-06-02", true);
    expect(r.streakDays).toBe(2);
    expect(applyDaily(r, "2026-06-02", false)).toEqual(r);
    expect(applyDaily(r, "2026-06-04", true).streakDays).toBe(1);
    expect(applyDaily(r, "2026-06-03", false).streakDays).toBe(0);
  });
});

describe("preferences", () => {
  it("clean up whatever was stored", () => {
    expect(cleanPrefs(null)).toEqual({ back: "classic", felt: "green", marks: false, large: false });
    expect(cleanPrefs({ back: "gold", felt: "../x" as string, marks: true })).toEqual({ back: "gold", felt: "green", marks: true, large: false });
  });
});

describe("bot styles", () => {
  const setup = () => {
    const g = createGame([{ name: "A", kind: "bot", level: "normal", style: "blocker" }, { name: "B", kind: "bot", level: "normal" }], { stockSize: 10 }, 3);
    return g;
  };
  it("are kept in the game state", () => {
    const g = createGame([{ name: "A", kind: "bot", level: "normal", style: "blocker" }, { name: "B", kind: "bot", style: "balanced" }], {}, 1);
    expect(g.players[0].style).toBe("blocker");
    expect(g.players[1].style).toBeUndefined();
  });
  it("a blocker does not play the card a rival is waiting for, when it has another choice", () => {
    const g: GameState = { ...setup(), turn: 0 };
    g.building = [[1, 2], [], [], []];
    g.players[0].hand = [3, 9, 9, 9, 9];
    g.players[0].stock = [12];
    g.players[1].stock = [4, 4, 4];
    // playing the 3 would make a 4 playable for the rival, so the blocker discards instead
    const a = chooseAction(g, "normal")!;
    expect(a.type).toBe("discard");
    g.players[0].style = undefined;
    const b = chooseAction(g, "normal")!;
    expect(b).toMatchObject({ type: "play" });
  });
  it("bots of every style finish games", () => {
    for (const style of ["balanced", "blocker", "racer"] as const) for (let seed = 1; seed <= 3; seed++) {
      let g = createGame([{ name: "A", kind: "bot", level: "hard", style }, { name: "B", kind: "bot", level: "normal" }, { name: "C", kind: "bot", level: "easy", style: "racer" }], { stockSize: 8 }, seed);
      for (let i = 0; i < 6000 && g.phase !== "over"; i++) { const a = chooseAction(g)!; expect(a).not.toBeNull(); const r = applyAction(g, a)!; expect(r).not.toBeNull(); g = r.state; }
      expect(g.phase).toBe("over");
    }
    expect(fits(setup(), WILD, 0)).toBe(true);
  });
});
