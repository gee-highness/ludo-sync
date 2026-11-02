import { readJSON, writeJSON } from "./storage";
import { recordBotResult, type StreakOutcome } from "./streak";

export type GameId = "ludo" | "skipbo";

export interface GameTally { played: number; won: number }
export interface Ledger { game: GameId; date: string; points: number; xp: number; won: boolean }
export interface Profile {
  xp: number;
  games: Record<GameId, GameTally>;
  /** Games finished today, for the "today" ribbon. */
  today: { date: string; played: number };
  /** The last games and what each paid, newest first. */
  recent: Ledger[];
  /** Every game point you have ever scored, by game: these only ever go up. */
  lifetime: Record<GameId, number>;
  /** Your best single game, by game. */
  best: Record<GameId, number>;
}

/** Ranks earned by lifetime points. */
export interface Rank { name: string; at: number; icon: string }
export const RANKS: readonly Rank[] = [
  { name: "Rookie", at: 0, icon: "🌱" },
  { name: "Regular", at: 500, icon: "🎯" },
  { name: "Sharp", at: 2_000, icon: "⚡" },
  { name: "Veteran", at: 5_000, icon: "🛡️" },
  { name: "Expert", at: 10_000, icon: "💎" },
  { name: "Master", at: 25_000, icon: "👑" },
  { name: "Legend", at: 50_000, icon: "🌟" },
];

export interface RankInfo { rank: Rank; index: number; next: Rank | null; points: number; into: number; need: number; fraction: number }

export const rankFor = (points: number): RankInfo => {
  const safe = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0));
  let index = 0;
  while (index + 1 < RANKS.length && safe >= RANKS[index + 1].at) index++;
  const rank = RANKS[index], next = RANKS[index + 1] ?? null;
  const need = next ? next.at - rank.at : 1;
  return { rank, index, next, points: safe, into: next ? safe - rank.at : 1, need, fraction: next ? (safe - rank.at) / need : 1 };
};

export const lifetimeTotal = (p: Pick<Profile, "lifetime">): number => p.lifetime.ludo + p.lifetime.skipbo;

/** XP needed in total to reach a level: level 2 at 100, 3 at 300, 4 at 600, 5 at 1000 ... */
export const xpToReach = (level: number): number => 50 * level * (level - 1);

export interface LevelInfo { level: number; xp: number; into: number; need: number; fraction: number }

export const levelFor = (xp: number): LevelInfo => {
  const safe = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  while (xpToReach(level + 1) <= safe) level++;
  const floor = xpToReach(level), ceil = xpToReach(level + 1);
  return { level, xp: safe, into: safe - floor, need: ceil - floor, fraction: (safe - floor) / (ceil - floor) };
};

export interface GameResult {
  game: GameId;
  won: boolean;
  /** Everyone at the table. */
  players: number;
  /** The toughest bot played against, if any. */
  botLevel?: "easy" | "normal" | "hard";
  tournament?: boolean;
  daily?: boolean;
  /** Played against other people online or nearby. */
  withFriends?: boolean;
  /** The points you scored in the game itself, which are what experience is made of. */
  points?: number;
  /** Extra XP on top, such as a streak milestone. */
  bonusXp?: number;
}

/** The most game points that turn into experience from one game, so one long game cannot be farmed. */
export const POINTS_CAP = 250;

/**
 * What one finished game is worth. The points you scored are the heart of it, with something for finishing, a bonus for
 * winning, and more for harder tables, tournaments, challenges and playing with friends.
 */
export const xpFor = (r: GameResult): number => {
  let xp = 10 + Math.max(0, Math.min(POINTS_CAP, Math.floor(r.points ?? 0)));
  if (r.won) xp += 30;
  xp += Math.max(0, Math.min(5, r.players - 2)) * 5;
  if (r.botLevel === "normal") xp += r.won ? 10 : 4;
  if (r.botLevel === "hard") xp += r.won ? 25 : 8;
  if (r.tournament) xp += 15;
  if (r.daily) xp += r.won ? 40 : 10;
  if (r.withFriends) xp += 10;
  return xp;
};

const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const EMPTY = (): Profile => ({
  xp: 0, games: { ludo: { played: 0, won: 0 }, skipbo: { played: 0, won: 0 } }, today: { date: "", played: 0 }, recent: [],
  lifetime: { ludo: 0, skipbo: 0 }, best: { ludo: 0, skipbo: 0 },
});
const RECENT = 12;

/** Cleans whatever was stored into a profile. */
export const parseProfile = (r: Partial<Profile> | null): Profile => {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const t = (g: unknown): GameTally => ({ played: n((g as GameTally | undefined)?.played), won: n((g as GameTally | undefined)?.won) });
  const p = EMPTY();
  if (!r) return p;
  p.xp = n(r.xp);
  p.games = { ludo: t(r.games?.ludo), skipbo: t(r.games?.skipbo) };
  p.today = { date: typeof r.today?.date === "string" ? r.today.date : "", played: n(r.today?.played) };
  p.recent = Array.isArray(r.recent)
    ? r.recent.filter((e): e is Ledger => !!e && (e.game === "ludo" || e.game === "skipbo") && typeof e.date === "string").slice(0, RECENT).map(e => ({ game: e.game, date: e.date.slice(0, 10), points: n(e.points), xp: n(e.xp), won: e.won === true }))
    : [];
  // profiles from before lifetime points existed start from the games still on record
  const stored = r.lifetime as Partial<Record<GameId, number>> | undefined;
  p.lifetime = stored ? { ludo: n(stored.ludo), skipbo: n(stored.skipbo) } : { ludo: p.recent.filter(e => e.game === "ludo").reduce((a, e) => a + e.points, 0), skipbo: p.recent.filter(e => e.game === "skipbo").reduce((a, e) => a + e.points, 0) };
  const best = r.best as Partial<Record<GameId, number>> | undefined;
  p.best = { ludo: Math.max(n(best?.ludo), ...p.recent.filter(e => e.game === "ludo").map(e => e.points), 0), skipbo: Math.max(n(best?.skipbo), ...p.recent.filter(e => e.game === "skipbo").map(e => e.points), 0) };
  return p;
};

export const loadProfile = (): Profile => parseProfile(readJSON<Partial<Profile> | null>("profile", null));

export interface Award {
  gained: number;
  before: LevelInfo;
  after: LevelInfo;
  leveledUp: boolean;
  profile: Profile;
  /** Game points added to the lifetime total by this game, the new total, and whether it earned a new rank. */
  pointsGained: number;
  lifetime: number;
  rankBefore: RankInfo;
  rankAfter: RankInfo;
  rankedUp: boolean;
  newBest: boolean;
  /** The win streak against bots after this game, when it was a bot game. */
  streak?: StreakOutcome | null;
}

/** Pure: the profile after one more game. */
export const applyResult = (p: Profile, r: GameResult, now = new Date()): Award => {
  const gained = xpFor(r) + Math.max(0, Math.floor(r.bonusXp ?? 0));
  const pointsGained = Math.max(0, Math.floor(r.points ?? 0));
  const today = day(now);
  const next: Profile = {
    xp: p.xp + gained,
    games: { ...p.games, [r.game]: { played: p.games[r.game].played + 1, won: p.games[r.game].won + (r.won ? 1 : 0) } },
    today: { date: today, played: (p.today.date === today ? p.today.played : 0) + 1 },
    recent: [{ game: r.game, date: today, points: Math.max(0, Math.floor(r.points ?? 0)), xp: gained, won: r.won }, ...p.recent].slice(0, RECENT),
    lifetime: { ...p.lifetime, [r.game]: p.lifetime[r.game] + pointsGained },
    best: { ...p.best, [r.game]: Math.max(p.best[r.game], pointsGained) },
  };
  const before = levelFor(p.xp), after = levelFor(next.xp);
  const rankBefore = rankFor(lifetimeTotal(p)), rankAfter = rankFor(lifetimeTotal(next));
  return {
    gained, before, after, leveledUp: after.level > before.level, profile: next, pointsGained, lifetime: lifetimeTotal(next), rankBefore, rankAfter,
    rankedUp: rankAfter.index > rankBefore.index, newBest: pointsGained > p.best[r.game] && p.games[r.game].played > 0,
  };
};

export const awardGame = (r: GameResult): Award => {
  // wins in a row count only against bots: online, nearby and pass-and-play games neither add nor break a streak
  const streak = r.botLevel && !r.withFriends ? recordBotResult(r.game, r.botLevel, r.won) : null;
  const a = applyResult(loadProfile(), { ...r, bonusXp: streak?.bonusXp ?? 0 });
  writeJSON("profile", a.profile);
  return { ...a, streak };
};

export const awardBonus = (xp: number): Award => {
  const p = loadProfile();
  const before = levelFor(p.xp);
  const next = { ...p, xp: p.xp + Math.max(0, Math.floor(xp)) };
  writeJSON("profile", next);
  const after = levelFor(next.xp);
  const rank = rankFor(lifetimeTotal(next));
  return { gained: Math.max(0, Math.floor(xp)), before, after, leveledUp: after.level > before.level, profile: next, pointsGained: 0, lifetime: lifetimeTotal(next), rankBefore: rank, rankAfter: rank, rankedUp: false, newBest: false };
};
