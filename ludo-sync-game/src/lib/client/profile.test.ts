import { describe, expect, it } from "vitest";
import { applyResult, levelFor, lifetimeTotal, parseProfile, rankFor, xpFor, xpToReach, type Profile } from "./profile";
import { CARD_BACKS, FELTS, allowed, unlockedAt } from "./unlocks";

const fresh = (): Profile => ({ xp: 0, games: { ludo: { played: 0, won: 0 }, skipbo: { played: 0, won: 0 } }, today: { date: "", played: 0 }, recent: [], lifetime: { ludo: 0, skipbo: 0 }, best: { ludo: 0, skipbo: 0 } });

describe("levels", () => {
  it("climb with a growing cost", () => {
    expect([1, 2, 3, 4, 5].map(xpToReach)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFor(0)).toMatchObject({ level: 1, into: 0, need: 100 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100)).toMatchObject({ level: 2, into: 0, need: 200 });
    expect(levelFor(450)).toMatchObject({ level: 3, into: 150, fraction: 0.5 });
  });
  it("cope with junk", () => {
    expect(levelFor(-5).level).toBe(1);
    expect(levelFor(NaN).level).toBe(1);
  });
});

describe("what a game is worth", () => {
  it("pays more for winning, harder bots, tournaments and challenges", () => {
    const base = { game: "skipbo" as const, players: 2 };
    expect(xpFor({ ...base, won: false })).toBe(10);
    expect(xpFor({ ...base, won: true })).toBe(40);
    expect(xpFor({ ...base, won: false, points: 60 })).toBe(70);
    expect(xpFor({ ...base, won: false, points: 9999 })).toBe(10 + 250);
    expect(xpFor({ ...base, won: true, botLevel: "hard" })).toBeGreaterThan(xpFor({ ...base, won: true, botLevel: "normal" }));
    expect(xpFor({ ...base, won: true, tournament: true })).toBe(55);
    expect(xpFor({ ...base, won: true, daily: true })).toBe(80);
    expect(xpFor({ ...base, won: true, players: 6 })).toBe(40 + 20);
  });
});

describe("a finished game", () => {
  it("adds xp, counts the game, and says when a level was gained", () => {
    const a = applyResult(fresh(), { game: "ludo", won: true, players: 4, botLevel: "hard", points: 100 }, new Date(2026, 5, 1));
    expect(a.gained).toBe(10 + 100 + 30 + 10 + 25);
    expect(a.profile.recent[0]).toMatchObject({ game: "ludo", points: 100, won: true });
    expect(a.profile.games.ludo).toEqual({ played: 1, won: 1 });
    expect(a.profile.games.skipbo).toEqual({ played: 0, won: 0 });
    expect(a.leveledUp).toBe(true);
    expect(a.after.level).toBe(2);
    const b = applyResult({ ...a.profile, xp: 95 }, { game: "skipbo", won: false, players: 2 }, new Date(2026, 5, 1));
    expect(b.leveledUp).toBe(true);
    expect(b.after.level).toBe(2);
    expect(b.profile.today).toEqual({ date: "2026-06-01", played: 2 });
    expect(applyResult(b.profile, { game: "skipbo", won: false, players: 2 }, new Date(2026, 5, 2)).profile.today.played).toBe(1);
  });
});

describe("unlocks", () => {
  it("open by level, and a locked choice falls back to the first", () => {
    expect(unlockedAt(3).map(u => u.id)).toEqual(["sunset"]);
    expect(unlockedAt(4).map(u => u.id)).toEqual(["burgundy"]);
    expect(allowed(CARD_BACKS, "gold", 2).id).toBe("classic");
    expect(allowed(CARD_BACKS, "gold", 16).id).toBe("gold");
    expect(allowed(FELTS, "nope", 99).id).toBe("green");
  });
  it("start with something for everyone", () => {
    expect(CARD_BACKS[0].level).toBe(1);
    expect(FELTS[0].level).toBe(1);
  });
});

describe("lifetime points", () => {
  it("only ever go up, by game, and remember the best game", () => {
    let p = fresh();
    const play = (game: "ludo" | "skipbo", points: number) => { const a = applyResult(p, { game, won: true, players: 2, points }, new Date(2026, 5, 1)); p = a.profile; return a; };
    const a = play("skipbo", 120);
    expect(a.pointsGained).toBe(120);
    expect(a.lifetime).toBe(120);
    expect(a.newBest).toBe(false);
    play("ludo", 80);
    const c = play("skipbo", 150);
    expect(p.lifetime).toEqual({ ludo: 80, skipbo: 270 });
    expect(lifetimeTotal(p)).toBe(350);
    expect(c.newBest).toBe(true);
    expect(p.best).toEqual({ ludo: 80, skipbo: 150 });
    // a bad game still adds, and never takes away
    play("skipbo", 0);
    expect(lifetimeTotal(p)).toBe(350);
    // points above the experience cap still count in full for the lifetime total
    expect(play("skipbo", 400).lifetime).toBe(750);
  });
  it("earn ranks at the thresholds, and say when one was reached", () => {
    expect(rankFor(0).rank.name).toBe("Rookie");
    expect(rankFor(499).rank.name).toBe("Rookie");
    expect(rankFor(500)).toMatchObject({ rank: { name: "Regular" }, into: 0, need: 1500, next: { name: "Sharp" } });
    expect(rankFor(1_000_000)).toMatchObject({ rank: { name: "Legend" }, next: null, fraction: 1 });
    expect(rankFor(NaN).rank.name).toBe("Rookie");
    let p = fresh();
    p = { ...p, lifetime: { ludo: 0, skipbo: 450 } };
    const a = applyResult(p, { game: "skipbo", won: false, players: 2, points: 60 }, new Date(2026, 5, 1));
    expect(a.rankedUp).toBe(true);
    expect(a.rankAfter.rank.name).toBe("Regular");
    expect(applyResult(a.profile, { game: "skipbo", won: false, players: 2, points: 10 }, new Date(2026, 5, 1)).rankedUp).toBe(false);
  });
  it("start from the games on record for a profile saved before this existed", () => {
    const old = { xp: 300, games: { ludo: { played: 2, won: 1 }, skipbo: { played: 1, won: 1 } }, today: { date: "", played: 0 },
      recent: [{ game: "skipbo", date: "2026-05-01", points: 90, xp: 50, won: true }, { game: "ludo", date: "2026-05-01", points: 40, xp: 30, won: false }, { game: "ludo", date: "2026-04-30", points: 70, xp: 30, won: true }] };
    const p = parseProfile(old as never);
    expect(p.lifetime).toEqual({ ludo: 110, skipbo: 90 });
    expect(p.best).toEqual({ ludo: 70, skipbo: 90 });
    expect(parseProfile(null).lifetime).toEqual({ ludo: 0, skipbo: 0 });
    expect(parseProfile({ ...old, lifetime: { ludo: 5, skipbo: -3 } } as never).lifetime).toEqual({ ludo: 5, skipbo: 0 });
  });
});
