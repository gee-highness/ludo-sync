/** Which game a party plays, from the game each member has open. Pure, so the rules are easy to test and to read. */
export interface Presence { id: string; game: string | null }
export type Decision = { kind: "none" } | { kind: "game"; game: string } | { kind: "tie"; options: string[] };

/** Counts players per game; a game with the most players wins outright, otherwise the tied games go to a vote. */
export const decide = (members: readonly Presence[]): Decision => {
  const count = new Map<string, number>();
  for (const m of members) if (m.game) count.set(m.game, (count.get(m.game) ?? 0) + 1);
  if (!count.size) return { kind: "none" };
  const top = Math.max(...count.values());
  const options = [...count.keys()].filter(g => count.get(g) === top).sort();
  return options.length === 1 ? { kind: "game", game: options[0] } : { kind: "tie", options };
};

/**
 * Settles a vote: most votes wins. A tie among the votes goes to the leader's vote if it is one of them, then to the
 * leader's own open game, then to the first option, so there is always an answer.
 */
export const settleVote = (options: readonly string[], votes: Readonly<Record<string, string>>, leaderId: string, leaderGame: string | null): string => {
  const count = new Map<string, number>(options.map(o => [o, 0]));
  for (const g of Object.values(votes)) if (count.has(g)) count.set(g, count.get(g)! + 1);
  const top = Math.max(...count.values());
  const best = options.filter(o => count.get(o) === top);
  if (best.length === 1) return best[0];
  const lv = votes[leaderId];
  if (lv && best.includes(lv)) return lv;
  if (leaderGame && best.includes(leaderGame)) return leaderGame;
  return best[0];
};
