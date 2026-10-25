import type { Seat } from "./board";

/** The seat across the board. */
export const opposite = (seat: Seat): Seat => ((seat + 2) % 4) as Seat;

/**
 * The order seats are given out in, so that two people are always across the board from each other (red and blue),
 * then the third and fourth fill in the sides.
 */
export const JOIN_ORDER: readonly Seat[] = [0, 2, 1, 3];

/** The next seat to give someone, or null when all four are taken. */
export const nextFreeSeat = (taken: ReadonlySet<Seat>): Seat | null => JOIN_ORDER.find(s => !taken.has(s)) ?? null;

/** True when two seats are neighbours rather than across from each other. */
export const adjacent = (a: Seat, b: Seat): boolean => a !== b && b !== opposite(a);

/**
 * With exactly two players they should face each other. If they were put next to each other, the one who is not
 * `keep` (the first one, if none is named) moves to the seat across from the other. Anything else is left alone.
 */
export const spreadTwo = <T extends { seat: Seat }>(players: T[], keep?: Seat): T[] => {
  if (players.length !== 2 || !adjacent(players[0].seat, players[1].seat)) return players;
  const anchor = players.find(p => p.seat === keep) ?? players[0];
  return players.map(p => (p === anchor ? p : { ...p, seat: opposite(anchor.seat) }));
};
