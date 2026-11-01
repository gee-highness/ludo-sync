import { readJSON, writeJSON } from "../client/storage";
import { dateKey, yesterdayOf } from "../client/daily";
import type { BotLevel, BotStyle } from "./types";

/** Today's table: the same shuffle for everyone and a twist that changes every day. */
export interface SkipBoDaily {
  date: string;
  title: string;
  blurb: string;
  stockSize: number;
  tournament: boolean;
  target: number;
  bots: { level: BotLevel; style: BotStyle }[];
  seed: number;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const dayNumber = (date: string): number => { const [y, m, d] = date.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000); };

interface Twist { title: string; blurb: string; stockSize: number; tournament?: boolean; target?: number; bots: { level: BotLevel; style: BotStyle }[] }

const TWISTS: readonly Twist[] = [
  { title: "Sprint", blurb: "Ten stock cards each and one sharp bot", stockSize: 10, bots: [{ level: "normal", style: "racer" }] },
  { title: "Gauntlet", blurb: "Three bots of every skill at one table", stockSize: 20, bots: [{ level: "easy", style: "balanced" }, { level: "normal", style: "blocker" }, { level: "hard", style: "racer" }] },
  { title: "Duel with a blocker", blurb: "A hard bot that loves to stall your piles", stockSize: 20, bots: [{ level: "hard", style: "blocker" }] },
  { title: "Crowded table", blurb: "Four normal bots, fifteen cards each", stockSize: 15, bots: [{ level: "normal", style: "balanced" }, { level: "normal", style: "blocker" }, { level: "normal", style: "racer" }, { level: "normal", style: "balanced" }] },
  { title: "Short tournament", blurb: "First to 150 points over a few quick rounds", stockSize: 10, tournament: true, target: 150, bots: [{ level: "normal", style: "balanced" }] },
  { title: "The long game", blurb: "The full thirty cards against two bots", stockSize: 30, bots: [{ level: "normal", style: "balanced" }, { level: "easy", style: "racer" }] },
  { title: "Quick draw", blurb: "Ten cards, a hard bot, no time to waste", stockSize: 10, bots: [{ level: "hard", style: "balanced" }] },
];

export const skipBoDaily = (date: string): SkipBoDaily => {
  const t = TWISTS[((dayNumber(date) % TWISTS.length) + TWISTS.length) % TWISTS.length];
  return { date, title: t.title, blurb: t.blurb, stockSize: t.stockSize, tournament: !!t.tournament, target: t.target ?? 500, bots: t.bots, seed: hash(`skipbo-daily-${date}`) || 1 };
};

export interface SkipBoDailyRecord { lastDate: string; won: boolean; streakDays: number }
const EMPTY: SkipBoDailyRecord = { lastDate: "", won: false, streakDays: 0 };

export const loadDailyRecord = (): SkipBoDailyRecord => {
  const r = readJSON<Partial<SkipBoDailyRecord> | null>("skipbo-daily", null);
  return { lastDate: typeof r?.lastDate === "string" ? r.lastDate : "", won: r?.won === true, streakDays: typeof r?.streakDays === "number" && r.streakDays >= 0 ? Math.floor(r.streakDays) : 0 };
};

/** Pure: the record after playing the challenge on `date`. A streak continues only through consecutive days that were won. */
export const applyDaily = (rec: SkipBoDailyRecord, date: string, won: boolean): SkipBoDailyRecord => {
  if (rec.lastDate === date && rec.won) return rec;
  const continues = rec.lastDate === yesterdayOf(date) && rec.won;
  return { lastDate: date, won, streakDays: won ? (continues ? rec.streakDays + 1 : 1) : 0 };
};

export const recordDaily = (date: string, won: boolean): SkipBoDailyRecord => {
  const next = applyDaily(loadDailyRecord(), date, won);
  writeJSON("skipbo-daily", next);
  return next;
};

export const dailyDone = (rec: SkipBoDailyRecord, date: string) => rec.lastDate === date;
export { dateKey, EMPTY as EMPTY_DAILY };
