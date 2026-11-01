import type { SkipBoStats } from "./stats";

export interface SkipBoAchievement { id: string; title: string; blurb: string; icon: string; goal: number; progress: (s: SkipBoStats) => number }

export const SKIPBO_ACHIEVEMENTS: readonly SkipBoAchievement[] = [
  { id: "sb-first", title: "First stock", blurb: "Empty your stock pile and win a game", icon: "🃏", goal: 1, progress: s => s.won },
  { id: "sb-win-10", title: "Card sharp", blurb: "Win 10 games", icon: "♠️", goal: 10, progress: s => s.won },
  { id: "sb-win-50", title: "High roller", blurb: "Win 50 games", icon: "👑", goal: 50, progress: s => s.won },
  { id: "sb-played-25", title: "Regular at the table", blurb: "Play 25 games", icon: "🪑", goal: 25, progress: s => s.played },
  { id: "sb-piles-25", title: "Pile driver", blurb: "Complete 25 piles up to 12", icon: "🏗️", goal: 25, progress: s => s.piles },
  { id: "sb-piles-150", title: "Skyscraper", blurb: "Complete 150 piles", icon: "🏙️", goal: 150, progress: s => s.piles },
  { id: "sb-turn-8", title: "On fire", blurb: "Play 8 cards in one turn", icon: "🔥", goal: 8, progress: s => s.bestTurn },
  { id: "sb-turn-15", title: "Clean sweep", blurb: "Play 15 cards in one turn", icon: "🧹", goal: 15, progress: s => s.bestTurn },
  { id: "sb-bonus-5", title: "Handful", blurb: "Play all five hand cards 5 times", icon: "🖐️", goal: 5, progress: s => s.bonusHands },
  { id: "sb-wild-25", title: "Wild at heart", blurb: "Play 25 Skip-Bo cards", icon: "🌟", goal: 25, progress: s => s.wildsPlayed },
  { id: "sb-hard", title: "Against the odds", blurb: "Beat a hard bot", icon: "🤖", goal: 1, progress: s => s.winsBy.hard },
  { id: "sb-levels", title: "Every level", blurb: "Beat an easy, a normal and a hard bot", icon: "🎚️", goal: 3, progress: s => [s.winsBy.easy, s.winsBy.normal, s.winsBy.hard].filter(v => v > 0).length },
  { id: "sb-tournament", title: "Tournament winner", blurb: "Win a tournament", icon: "🏆", goal: 1, progress: s => s.tournamentsWon },
  { id: "sb-streak-3", title: "Hot streak", blurb: "Win 3 games in a row", icon: "⚡", goal: 3, progress: s => s.bestStreak },
  { id: "sb-daily", title: "Daily dealer", blurb: "Win a daily challenge", icon: "📅", goal: 1, progress: s => s.dailyWins },
  { id: "sb-friends", title: "Friendly game", blurb: "Play 3 games with friends", icon: "🤝", goal: 3, progress: s => s.friendGames },
];

export interface SkipBoAchievementStatus { achievement: SkipBoAchievement; value: number; done: boolean }

export const evaluate = (s: SkipBoStats): SkipBoAchievementStatus[] =>
  SKIPBO_ACHIEVEMENTS.map(a => { const value = Math.min(a.goal, a.progress(s)); return { achievement: a, value, done: value >= a.goal }; });

export const newlyUnlocked = (before: SkipBoStats, after: SkipBoStats): SkipBoAchievement[] => {
  const was = new Set(evaluate(before).filter(x => x.done).map(x => x.achievement.id));
  return evaluate(after).filter(x => x.done && !was.has(x.achievement.id)).map(x => x.achievement);
};
