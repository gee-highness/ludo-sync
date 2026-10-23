import { readJSON, writeJSON } from "./storage";

export interface Stats {
  played: number;
  won: number;
  captures: number;
  /** Games won against bots, by level. */
  botWins: { easy: number; normal: number; hard: number };
}

const EMPTY: Stats = { played: 0, won: 0, captures: 0, botWins: { easy: 0, normal: 0, hard: 0 } };

export const loadStats = (): Stats => {
  const r = readJSON<Partial<Stats> | null>("stats", null);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    played: n(r?.played), won: n(r?.won), captures: n(r?.captures),
    botWins: { easy: n(r?.botWins?.easy), normal: n(r?.botWins?.normal), hard: n(r?.botWins?.hard) },
  };
};

export const recordGame = (update: { won: boolean; captures: number; botLevel?: "easy" | "normal" | "hard" }) => {
  const s = loadStats();
  s.played += 1;
  s.captures += update.captures;
  if (update.won) {
    s.won += 1;
    if (update.botLevel) s.botWins[update.botLevel] += 1;
  }
  writeJSON("stats", s);
  return s;
};

export const emptyStats = (): Stats => ({ ...EMPTY, botWins: { ...EMPTY.botWins } });
