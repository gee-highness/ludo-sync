import { readJSON, writeJSON } from "./storage";

export interface Stats {
  played: number;
  won: number;
  captures: number;
  /** Games won against bots, by level. */
  botWins: { easy: number; normal: number; hard: number };
  /** Wins in a row, now and at best. */
  streak: number;
  bestStreak: number;
  /** Every kind of vehicle that has played a game for you. */
  vehicles: string[];
  /** Daily challenges finished. */
  dailyWins: number;
}

const EMPTY: Stats = { played: 0, won: 0, captures: 0, botWins: { easy: 0, normal: 0, hard: 0 }, streak: 0, bestStreak: 0, vehicles: [], dailyWins: 0 };

export const loadStats = (): Stats => {
  const r = readJSON<Partial<Stats> | null>("stats", null);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const streak = n(r?.streak);
  return {
    played: n(r?.played), won: n(r?.won), captures: n(r?.captures),
    botWins: { easy: n(r?.botWins?.easy), normal: n(r?.botWins?.normal), hard: n(r?.botWins?.hard) },
    streak, bestStreak: Math.max(n(r?.bestStreak), streak),
    vehicles: Array.isArray(r?.vehicles) ? [...new Set(r.vehicles.filter((v): v is string => typeof v === "string" && /^[a-z]{2,12}$/.test(v)))].slice(0, 40) : [],
    dailyWins: n(r?.dailyWins),
  };
};

export interface GameResult { won: boolean; captures: number; botLevel?: "easy" | "normal" | "hard"; vehicles?: string[]; daily?: boolean }

/** Pure: the stats after one more game. */
export const applyGame = (s: Stats, update: GameResult): Stats => {
  const streak = update.won ? s.streak + 1 : 0;
  return {
    played: s.played + 1,
    won: s.won + (update.won ? 1 : 0),
    captures: s.captures + update.captures,
    botWins: { ...s.botWins, ...(update.won && update.botLevel ? { [update.botLevel]: s.botWins[update.botLevel] + 1 } : {}) },
    streak, bestStreak: Math.max(s.bestStreak, streak),
    vehicles: [...new Set([...s.vehicles, ...(update.vehicles ?? [])])].slice(0, 40),
    dailyWins: s.dailyWins + (update.won && update.daily ? 1 : 0),
  };
};

export const recordGame = (update: GameResult) => {
  const s = applyGame(loadStats(), update);
  writeJSON("stats", s);
  return s;
};

export const emptyStats = (): Stats => ({ ...EMPTY, botWins: { ...EMPTY.botWins }, vehicles: [] });
