import { nextRandom } from "../ludo/rng";
export { freshSeed } from "../ludo/rng";

/** Seeded helpers for engines: every function takes the generator state and returns the new one, so a game stays a pure function of its seed. */
export interface Draw<T> { value: T; rng: number }

export const randInt = (rng: number, n: number): Draw<number> => { const r = nextRandom(rng); return { value: Math.floor(r.value * n), rng: r.state }; };

export const shuffled = <T,>(items: readonly T[], rng: number): Draw<T[]> => {
  const a = [...items];
  let s = rng;
  for (let i = a.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return { value: a, rng: s };
};

/** A choice that does not consume the game's generator: bots use it so that thinking never changes what the cards do. */
export const peekPick = <T,>(items: readonly T[], rng: number, salt = 0): T => items[Math.floor(nextRandom((rng + salt * 7919) >>> 0).value * items.length)];
export const peekChance = (rng: number, p: number, salt = 0): boolean => nextRandom((rng + salt * 104729) >>> 0).value < p;
