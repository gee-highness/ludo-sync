import type { Seat } from "../ludo/board";
import { DEFAULT_RULES, type BotLevel, type PlayerSetup, type Rules } from "../ludo/types";
import { readJSON, writeJSON } from "./storage";

/** Today's challenge: one game, the same dice for everyone, and a rule twist that changes every day. */
export interface Daily {
  date: string;
  title: string;
  blurb: string;
  rules: Rules;
  /** Bots to beat, with the seats they sit in; the player is always red. */
  bots: { seat: Seat; level: BotLevel }[];
  /** Makes the dice the same for everybody. */
  seed: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** A calendar day in the player's own time zone, as 2026-10-25. */
export const dateKey = (d = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const dayNumber = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
};
export const yesterdayOf = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
};

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

interface Twist { title: string; blurb: string; rules: Partial<Rules>; bots: BotLevel[] }

const TWISTS: readonly Twist[] = [
  { title: "Sprint", blurb: "Only two vehicles need to get home", rules: { tuning: { winTokens: 2 } }, bots: ["normal"] },
  { title: "Rush hour", blurb: "Three bots on the road at once", rules: {}, bots: ["easy", "normal", "hard"] },
  { title: "No safe harbours", blurb: "Start squares and stars protect nobody", rules: { safeSquares: false }, bots: ["hard"] },
  { title: "Double trouble", blurb: "Roll two dice and spend them freely", rules: { twoDice: true }, bots: ["normal", "normal"] },
  { title: "Open road", blurb: "Any roll gets a vehicle out of its yard", rules: { tuning: { entry: "any" } }, bots: ["hard"] },
  { title: "Tycoon Tuesday", blurb: "Buy, build and bankrupt your rivals", rules: { tycoon: true }, bots: ["normal"] },
  { title: "No exact finish", blurb: "Overshoot the centre and still get home", rules: { tuning: { exactFinish: false }, blockades: false }, bots: ["normal", "hard"] },
];

/** The same date always gives the same challenge. */
export const dailyChallenge = (date: string): Daily => {
  const twist = TWISTS[((dayNumber(date) % TWISTS.length) + TWISTS.length) % TWISTS.length];
  const seats: Seat[] = [1, 2, 3];
  const seatsFor = twist.bots.length === 1 ? [2 as Seat] : twist.bots.length === 2 ? [1 as Seat, 3 as Seat] : seats;
  return {
    date, title: twist.title, blurb: twist.blurb,
    rules: { ...DEFAULT_RULES, ...twist.rules, tuning: { ...twist.rules.tuning } },
    bots: twist.bots.map((level, i) => ({ seat: seatsFor[i], level })),
    seed: hash(`ludo-sync-daily-${date}`) || 1,
  };
};

export const dailySetups = (d: Daily, name: string): PlayerSetup[] => [
  { seat: 0, name, kind: "human" },
  ...d.bots.map(b => ({ seat: b.seat, name: `${["Easy", "Normal", "Hard"][["easy", "normal", "hard"].indexOf(b.level)]} bot`, kind: "bot" as const, level: b.level })),
];

// ---- progress ---------------------------------------------------------------------------------------------------

export interface DailyRecord {
  /** The last day a challenge was finished, and whether it was won. */
  date: string;
  won: boolean;
  /** Days in a row with a win. */
  streakDays: number;
  /** The last day it was won. */
  lastWon: string;
}


export const loadDailyRecord = (): DailyRecord => {
  const r = readJSON<Partial<DailyRecord> | null>("daily", null);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return { date: date(r?.date), won: r?.won === true, streakDays: typeof r?.streakDays === "number" && r.streakDays >= 0 ? Math.floor(r.streakDays) : 0, lastWon: date(r?.lastWon) };
};

/** Pure: the record after finishing the challenge on `today`. The first finish of a day counts; later ones do not. */
export const afterFinish = (rec: DailyRecord, today: string, won: boolean): DailyRecord => {
  if (rec.date === today) return rec;
  const streakDays = won ? (rec.lastWon === yesterdayOf(today) || rec.lastWon === today ? rec.streakDays + 1 : 1) : (rec.lastWon === yesterdayOf(today) ? rec.streakDays : 0);
  return { date: today, won, streakDays, lastWon: won ? today : rec.lastWon };
};

export const recordDaily = (today: string, won: boolean): DailyRecord => {
  const next = afterFinish(loadDailyRecord(), today, won);
  writeJSON("daily", next);
  return next;
};

export const dailyDone = (rec: DailyRecord, today: string) => rec.date === today;
