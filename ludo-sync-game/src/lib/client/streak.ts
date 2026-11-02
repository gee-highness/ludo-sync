import { readJSON, writeJSON } from "./storage";

/** Wins in a row against bots, kept per game and per bot level. Online and pass-and-play games never touch these. */
export type BotLevel = "easy" | "normal" | "hard";
export const BOT_LEVELS: readonly BotLevel[] = ["easy", "normal", "hard"];

export interface StreakRecord {
  current: number;
  best: number;
  /** A shield absorbs one loss. One is earned for every 10 wins in a row, up to MAX_SHIELDS. */
  shields: number;
}
export type StreakBook = Record<string, Record<BotLevel, StreakRecord>>;

export const MILESTONES: readonly number[] = [3, 5, 10, 25, 50];
export const SHIELD_EVERY = 10;
export const MAX_SHIELDS = 3;
const LEVEL_BONUS: Record<BotLevel, number> = { easy: 1, normal: 1.5, hard: 2 };

export type StreakEvent = "none" | "up" | "ended" | "shielded";

export interface StreakOutcome {
  book: StreakBook;
  level: BotLevel;
  record: StreakRecord;
  event: StreakEvent;
  /** The streak that just ended, when event is "ended". */
  endedAt: number;
  /** A milestone reached by this win, if any. */
  milestone: number | null;
  shieldEarned: boolean;
  /** Extra XP for the milestone, more on harder bots. */
  bonusXp: number;
}

export const emptyRecord = (): StreakRecord => ({ current: 0, best: 0, shields: 0 });
const emptyLevels = (): Record<BotLevel, StreakRecord> => ({ easy: emptyRecord(), normal: emptyRecord(), hard: emptyRecord() });

const n = (v: unknown, max = 100000) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);

const cleanRecord = (r: unknown): StreakRecord => {
  const o = (r ?? {}) as Partial<StreakRecord>;
  const current = n(o.current);
  return { current, best: Math.max(n(o.best), current), shields: n(o.shields, MAX_SHIELDS) };
};

/** Cleans whatever was stored into a streak book. */
export const parseBook = (raw: unknown): StreakBook => {
  const book: StreakBook = {};
  if (!raw || typeof raw !== "object") return book;
  for (const [game, levels] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{2,24}$/.test(game) || !levels || typeof levels !== "object") continue;
    const l = levels as Partial<Record<BotLevel, unknown>>;
    book[game] = { easy: cleanRecord(l.easy), normal: cleanRecord(l.normal), hard: cleanRecord(l.hard) };
  }
  return book;
};

export const loadBook = (): StreakBook => parseBook(readJSON<unknown>("streaks-v1", null));

export const recordOf = (book: StreakBook, game: string, level: BotLevel): StreakRecord => book[game]?.[level] ?? emptyRecord();

/** The streak to show for a game: the longest running one across levels, with the level it belongs to. */
export const headline = (book: StreakBook, game: string): { level: BotLevel; record: StreakRecord } => {
  let pick: BotLevel = "easy";
  for (const l of BOT_LEVELS) if (recordOf(book, game, l).current >= recordOf(book, game, pick).current) pick = l;
  return { level: pick, record: recordOf(book, game, pick) };
};

export const bestOf = (book: StreakBook, game: string): number => Math.max(0, ...BOT_LEVELS.map(l => recordOf(book, game, l).best));

/** Pure: the book after one finished game against bots. */
export const applyStreak = (book: StreakBook, game: string, level: BotLevel, won: boolean): StreakOutcome => {
  const prev = recordOf(book, game, level);
  let next: StreakRecord = prev;
  let event: StreakEvent = "none";
  let milestone: number | null = null;
  let shieldEarned = false;
  let endedAt = 0;
  if (won) {
    const current = prev.current + 1;
    shieldEarned = current % SHIELD_EVERY === 0 && prev.shields < MAX_SHIELDS;
    next = { current, best: Math.max(prev.best, current), shields: prev.shields + (shieldEarned ? 1 : 0) };
    event = "up";
    if (MILESTONES.includes(current)) milestone = current;
  } else if (prev.shields > 0 && prev.current > 0) {
    next = { ...prev, shields: prev.shields - 1 };
    event = "shielded";
  } else if (prev.current > 0) {
    next = { ...prev, current: 0 };
    event = "ended";
    endedAt = prev.current;
  }
  const levels = { ...(book[game] ?? emptyLevels()), [level]: next };
  return {
    book: { ...book, [game]: levels }, level, record: next, event, endedAt, milestone, shieldEarned,
    bonusXp: milestone ? Math.round(10 * Math.sqrt(milestone) * LEVEL_BONUS[level]) : 0,
  };
};

export const recordBotResult = (game: string, level: BotLevel, won: boolean): StreakOutcome => {
  const out = applyStreak(loadBook(), game, level, won);
  writeJSON("streaks-v1", out.book);
  return out;
};

/** A line of text for the end screen or a toast, or null when there is nothing to say. */
export const describeStreak = (o: StreakOutcome): { title: string; detail: string } | null => {
  if (o.event === "up") {
    const n = o.record.current;
    if (n < 2 && !o.milestone) return null;
    const bits = [`${n} in a row on ${o.level}`];
    if (o.milestone) bits.push(`milestone! +${o.bonusXp} XP`);
    if (o.shieldEarned) bits.push("🛡 shield earned");
    return { title: `🔥 ${n} wins in a row`, detail: bits.join(" · ") };
  }
  if (o.event === "shielded") return { title: "🛡 Streak shield used", detail: `Your ${o.record.current}-win streak on ${o.level} is safe. ${o.record.shields} shield${o.record.shields === 1 ? "" : "s"} left.` };
  if (o.event === "ended" && o.endedAt >= 2) return { title: `Streak ended at ${o.endedAt}`, detail: `Win the next one to start a new streak on ${o.level}.` };
  return null;
};
