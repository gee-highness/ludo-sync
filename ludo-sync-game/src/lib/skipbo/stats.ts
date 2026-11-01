import { readJSON, writeJSON } from "../client/storage";

export interface SkipBoStats {
  played: number;
  won: number;
  /** Building piles you finished off with a 12. */
  piles: number;
  tournamentsWon: number;
  winsBy: { easy: number; normal: number; hard: number };
  dailyWins: number;
  /** The most cards you played in a single turn. */
  bestTurn: number;
  /** Times you played all five cards and drew five more. */
  bonusHands: number;
  wildsPlayed: number;
  streak: number;
  bestStreak: number;
  /** Games with other people, online or nearby. */
  friendGames: number;
}

export const emptyStats = (): SkipBoStats => ({
  played: 0, won: 0, piles: 0, tournamentsWon: 0, winsBy: { easy: 0, normal: 0, hard: 0 }, dailyWins: 0, bestTurn: 0, bonusHands: 0, wildsPlayed: 0, streak: 0, bestStreak: 0, friendGames: 0,
});

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export const loadStats = (): SkipBoStats => {
  const r = readJSON<Partial<SkipBoStats> | null>("skipbo-stats", null);
  const streak = n(r?.streak);
  return {
    played: n(r?.played), won: n(r?.won), piles: n(r?.piles), tournamentsWon: n(r?.tournamentsWon),
    winsBy: { easy: n(r?.winsBy?.easy), normal: n(r?.winsBy?.normal), hard: n(r?.winsBy?.hard) },
    dailyWins: n(r?.dailyWins), bestTurn: n(r?.bestTurn), bonusHands: n(r?.bonusHands), wildsPlayed: n(r?.wildsPlayed),
    streak, bestStreak: Math.max(n(r?.bestStreak), streak), friendGames: n(r?.friendGames),
  };
};

/** What a finished game adds up to, from the moves its player made. */
export interface GameTotals {
  won: boolean;
  tournament: boolean;
  botLevel?: "easy" | "normal" | "hard";
  daily?: boolean;
  withFriends?: boolean;
  piles: number;
  bestTurn: number;
  bonusHands: number;
  wildsPlayed: number;
}

export const applyGame = (s: SkipBoStats, g: GameTotals): SkipBoStats => {
  const streak = g.won ? s.streak + 1 : 0;
  return {
    played: s.played + 1, won: s.won + (g.won ? 1 : 0), piles: s.piles + g.piles,
    tournamentsWon: s.tournamentsWon + (g.won && g.tournament ? 1 : 0),
    winsBy: { ...s.winsBy, ...(g.won && g.botLevel ? { [g.botLevel]: s.winsBy[g.botLevel] + 1 } : {}) },
    dailyWins: s.dailyWins + (g.won && g.daily ? 1 : 0), bestTurn: Math.max(s.bestTurn, g.bestTurn), bonusHands: s.bonusHands + g.bonusHands,
    wildsPlayed: s.wildsPlayed + g.wildsPlayed, streak, bestStreak: Math.max(s.bestStreak, streak), friendGames: s.friendGames + (g.withFriends ? 1 : 0),
  };
};

export const recordTotals = (g: GameTotals): SkipBoStats => {
  const s = applyGame(loadStats(), g);
  writeJSON("skipbo-stats", s);
  return s;
};
