import { FINISH, HOME_COLUMN_START, LAST_RING_PROGRESS, isSafeRingIndex, ringIndexOf, type Seat } from "./board";
import { currentPlayer, legalMoves } from "./engine";
import type { Action, BotLevel, GameState, MoveOption } from "./types";

type Rand = () => number;

/** How many opponent tokens could land on this ring square with one die next turn. */
const threatsAt = (s: GameState, seat: Seat, ringIdx: number): number => {
  let n = 0;
  for (const p of s.players) {
    if (p.seat === seat) continue;
    for (const t of p.tokens) {
      const r = ringIndexOf(p.seat, t);
      if (r === null) continue;
      const d = (ringIdx - r + 52) % 52;
      if (d >= 1 && d <= 6 && d <= LAST_RING_PROGRESS - t) n++;
    }
  }
  return n;
};

const isSafe = (s: GameState, ringIdx: number) => s.rules.safeSquares && isSafeRingIndex(ringIdx);

const score = (s: GameState, o: MoveOption, level: BotLevel): number => {
  const me = currentPlayer(s);
  let v = o.to;
  if (o.finishes) v += 1000;
  if (o.captures) v += 500;
  if (o.entersBoard) v += 250;
  if (o.to >= HOME_COLUMN_START && o.to < FINISH) v += 80;

  const landing = ringIndexOf(me.seat, o.to);
  if (landing !== null && isSafe(s, landing)) v += 100;

  if (level === "hard") {
    if (landing !== null && !isSafe(s, landing)) v -= 150 * threatsAt(s, me.seat, landing);
    const here = ringIndexOf(me.seat, o.from);
    if (here !== null && !isSafe(s, here) && threatsAt(s, me.seat, here) > 0) v += 120;
    if (s.rules.blockades && landing !== null && !isSafe(s, landing)) {
      const stacked = me.tokens.some((t, i) => i !== o.token && ringIndexOf(me.seat, t) === landing);
      if (stacked) v += 60;
    }
    v += o.to * 0.5;
  }
  return v;
};

/** Picks the move a bot of the current player's level would make, or null when none is legal. */
export const chooseMove = (s: GameState, rand: Rand = Math.random): MoveOption | null => {
  const options = legalMoves(s);
  if (options.length === 0) return null;
  const level = currentPlayer(s).level ?? "normal";
  if (level === "easy") return options[Math.floor(rand() * options.length)];
  let best = options[0];
  let bestScore = -Infinity;
  for (const o of options) {
    const sc = score(s, o, level) + rand() * 0.01; // break ties without bias
    if (sc > bestScore) { best = o; bestScore = sc; }
  }
  return best;
};

/** The next action for whoever's turn it is, as an automatic player would take it. */
export const autoAction = (s: GameState, rand: Rand = Math.random): Action | null => {
  if (s.phase === "roll") return { type: "roll" };
  if (s.phase === "move") {
    const m = chooseMove(s, rand);
    return m ? { type: "move", token: m.token, die: m.die } : null;
  }
  return null;
};
