import { VEHICLES } from "./pieces";
import type { Stats } from "./stats";

export interface Achievement {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  /** What the progress number has to reach. */
  goal: number;
  progress: (s: Stats) => number;
}

const COLLECTABLE = VEHICLES.filter(v => v !== "none").length;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first-win", title: "First finish", blurb: "Win a game", icon: "🏁", goal: 1, progress: s => s.won },
  { id: "win-5", title: "Regular", blurb: "Win 5 games", icon: "🥉", goal: 5, progress: s => s.won },
  { id: "win-25", title: "Champion", blurb: "Win 25 games", icon: "🏆", goal: 25, progress: s => s.won },
  { id: "played-10", title: "Getting around", blurb: "Play 10 games", icon: "🛣️", goal: 10, progress: s => s.played },
  { id: "played-50", title: "Long hauler", blurb: "Play 50 games", icon: "🚚", goal: 50, progress: s => s.played },
  { id: "captures-10", title: "Road rage", blurb: "Send 10 tokens home", icon: "💥", goal: 10, progress: s => s.captures },
  { id: "captures-50", title: "Demolition derby", blurb: "Send 50 tokens home", icon: "🚧", goal: 50, progress: s => s.captures },
  { id: "streak-3", title: "On a roll", blurb: "Win 3 games in a row", icon: "🔥", goal: 3, progress: s => s.bestStreak },
  { id: "streak-5", title: "Unstoppable", blurb: "Win 5 games in a row", icon: "⚡", goal: 5, progress: s => s.bestStreak },
  { id: "hard-win", title: "Against the odds", blurb: "Beat a hard bot", icon: "🤖", goal: 1, progress: s => s.botWins.hard },
  { id: "all-bots", title: "Every level", blurb: "Beat an easy, a normal and a hard bot", icon: "🎚️", goal: 3, progress: s => [s.botWins.easy, s.botWins.normal, s.botWins.hard].filter(n => n > 0).length },
  { id: "garage-5", title: "Garage", blurb: "Race with 5 different vehicles", icon: "🚗", goal: 5, progress: s => s.vehicles.length },
  { id: "garage-all", title: "Full collection", blurb: `Race with all ${COLLECTABLE} vehicles`, icon: "🅿️", goal: COLLECTABLE, progress: s => s.vehicles.length },
  { id: "daily-1", title: "Daily driver", blurb: "Win a daily challenge", icon: "📅", goal: 1, progress: s => s.dailyWins },
  { id: "daily-7", title: "Commuter", blurb: "Win 7 daily challenges", icon: "🗓️", goal: 7, progress: s => s.dailyWins },
];

export interface AchievementStatus { achievement: Achievement; value: number; done: boolean }

export const evaluate = (s: Stats): AchievementStatus[] =>
  ACHIEVEMENTS.map(a => { const value = Math.min(a.goal, a.progress(s)); return { achievement: a, value, done: value >= a.goal }; });

/** What a game just unlocked. */
export const newlyUnlocked = (before: Stats, after: Stats): Achievement[] => {
  const was = new Set(evaluate(before).filter(x => x.done).map(x => x.achievement.id));
  return evaluate(after).filter(x => x.done && !was.has(x.achievement.id)).map(x => x.achievement);
};
