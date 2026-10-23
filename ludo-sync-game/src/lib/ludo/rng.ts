/**
 * A small seedable generator (mulberry32). The game keeps its state in `GameState.rng`, so
 * every roll is a pure function of the game: the online host can be authoritative, and a
 * game can be replayed exactly in tests.
 */
export const nextRandom = (state: number): { value: number; state: number } => {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
};

/** Rolls `count` dice from the generator state. */
export const rollDice = (state: number, count: number): { dice: number[]; state: number } => {
  const dice: number[] = [];
  let s = state;
  for (let i = 0; i < count; i++) {
    const r = nextRandom(s);
    dice.push(Math.floor(r.value * 6) + 1);
    s = r.state;
  }
  return { dice, state: s };
};

/** A fresh 32-bit seed from the platform's secure generator. */
export const freshSeed = (): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
};
