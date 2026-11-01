import { readJSON, writeJSON } from "./storage";

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
}

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

const EMPTY = (): Profile => ({ xp: 0, games: { ludo: { played: 0, won: 0 }, skipbo: { played: 0, won: 0 } }, today: { date: "", played: 0 }, recent: [] });
const RECENT = 12;

export const loadProfile = (): Profile => {
  const r = readJSON<Partial<Profile> | null>("profile", null);
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
  return p;
};

export interface Award { gained: number; before: LevelInfo; after: LevelInfo; leveledUp: boolean; profile: Profile }

/** Pure: the profile after one more game. */
export const applyResult = (p: Profile, r: GameResult, now = new Date()): Award => {
  const gained = xpFor(r);
  const today = day(now);
  const next: Profile = {
    xp: p.xp + gained,
    games: { ...p.games, [r.game]: { played: p.games[r.game].played + 1, won: p.games[r.game].won + (r.won ? 1 : 0) } },
    today: { date: today, played: (p.today.date === today ? p.today.played : 0) + 1 },
    recent: [{ game: r.game, date: today, points: Math.max(0, Math.floor(r.points ?? 0)), xp: gained, won: r.won }, ...p.recent].slice(0, RECENT),
  };
  const before = levelFor(p.xp), after = levelFor(next.xp);
  return { gained, before, after, leveledUp: after.level > before.level, profile: next };
};

export const awardGame = (r: GameResult): Award => {
  const a = applyResult(loadProfile(), r);
  writeJSON("profile", a.profile);
  return a;
};

export const awardBonus = (xp: number): Award => {
  const p = loadProfile();
  const before = levelFor(p.xp);
  const next = { ...p, xp: p.xp + Math.max(0, Math.floor(xp)) };
  writeJSON("profile", next);
  const after = levelFor(next.xp);
  return { gained: Math.max(0, Math.floor(xp)), before, after, leveledUp: after.level > before.level, profile: next };
};
