import { describe, expect, it } from "vitest";
import { applyStreak, describeStreak, headline, parseBook, MAX_SHIELDS, type StreakBook } from "./streak";

const run = (book: StreakBook, results: boolean[], level: "easy" | "normal" | "hard" = "normal") => {
  let b = book, last = applyStreak(b, "ludo", level, true);
  for (const w of results) { last = applyStreak(b, "ludo", level, w); b = last.book; }
  return last;
};

describe("bot win streaks", () => {
  it("counts wins in a row and resets on a loss", () => {
    const o = run({}, [true, true, true, false]);
    expect(o.event).toBe("ended");
    expect(o.endedAt).toBe(3);
    expect(o.record).toEqual({ current: 0, best: 3, shields: 0 });
  });
  it("keeps levels and games apart", () => {
    let b: StreakBook = applyStreak({}, "ludo", "hard", true).book;
    b = applyStreak(b, "skipbo", "easy", true).book;
    expect(b.ludo.hard.current).toBe(1);
    expect(b.ludo.easy.current).toBe(0);
    expect(b.skipbo.easy.current).toBe(1);
  });
  it("pays a milestone, more on harder bots", () => {
    const easy = run({}, [true, true, true], "easy");
    const hard = run({}, [true, true, true], "hard");
    expect(easy.milestone).toBe(3);
    expect(hard.bonusXp).toBeGreaterThan(easy.bonusXp);
    expect(run({}, [true, true], "easy").bonusXp).toBe(0);
  });
  it("earns a shield every ten wins and spends it on a loss", () => {
    const ten = run({}, Array(10).fill(true));
    expect(ten.shieldEarned).toBe(true);
    expect(ten.record.shields).toBe(1);
    const lost = applyStreak(ten.book, "ludo", "normal", false);
    expect(lost.event).toBe("shielded");
    expect(lost.record).toMatchObject({ current: 10, shields: 0 });
    expect(applyStreak(lost.book, "ludo", "normal", false).event).toBe("ended");
  });
  it("never holds more than the shield cap", () => {
    const many = run({}, Array(10 * (MAX_SHIELDS + 2)).fill(true));
    expect(many.record.shields).toBe(MAX_SHIELDS);
  });
  it("a loss with no streak changes nothing", () => {
    const o = applyStreak({}, "ludo", "easy", false);
    expect(o.event).toBe("none");
    expect(o.record.current).toBe(0);
  });
  it("cleans stored data", () => {
    expect(parseBook(null)).toEqual({});
    const b = parseBook({ ludo: { easy: { current: -4, best: "x", shields: 99 }, hard: { current: 5 } }, "BAD KEY": {} });
    expect(Object.keys(b)).toEqual(["ludo"]);
    expect(b.ludo.easy).toEqual({ current: 0, best: 0, shields: MAX_SHIELDS });
    expect(b.ludo.hard).toMatchObject({ current: 5, best: 5 });
  });
  it("headline picks the longest running streak and describes events", () => {
    let b: StreakBook = {};
    for (const l of ["easy", "hard", "hard"] as const) b = applyStreak(b, "ludo", l, true).book;
    expect(headline(b, "ludo").level).toBe("hard");
    expect(describeStreak(applyStreak({}, "ludo", "easy", true))).toBeNull();
    expect(describeStreak(run({}, [true, true, true]))?.title).toBe("🔥 3 wins in a row");
    expect(describeStreak(run({}, [true, true, false]))?.title).toBe("Streak ended at 2");
  });
});
