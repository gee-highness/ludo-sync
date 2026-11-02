import { flag, num, pick, type RuleSchema, type RuleValues } from "../../platform/rules";
import { peekChance, peekPick, randInt } from "../../platform/rng";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";

export const SCHEMA: RuleSchema = {
  rules: [
    { key: "cols", kind: "number", label: "Columns", def: 7, min: 4, max: 12, group: "Board" },
    { key: "rows", kind: "number", label: "Rows", def: 6, min: 4, max: 10, group: "Board" },
    { key: "connect", kind: "number", label: "Discs to connect", hint: "How many in a line win", def: 4, min: 3, max: 6, group: "Board" },
    { key: "horizontal", kind: "bool", label: "Count horizontal lines", def: true, group: "Lines" },
    { key: "vertical", kind: "bool", label: "Count vertical lines", def: true, group: "Lines" },
    { key: "diagonal", kind: "bool", label: "Count diagonal lines", def: true, group: "Lines" },
    { key: "popOut", kind: "bool", label: "PopOut", hint: "Instead of dropping, remove one of your own discs from the bottom of a column", def: false, group: "Twists" },
    { key: "wrap", kind: "bool", label: "Wrap around the sides", hint: "Lines may continue past the left and right edges", def: false, group: "Twists" },
    { key: "misere", kind: "bool", label: "Misère: making a line loses", def: false, group: "Twists" },
    { key: "bombs", kind: "number", label: "Bombs each", hint: "A bomb drops like a disc and clears the discs around where it lands. 0 turns bombs off.", def: 0, min: 0, max: 3, zeroLabel: "Off", group: "Twists" },
    { key: "first", kind: "choice", label: "Who starts", def: "random", choices: [{ value: "random", label: "Random" }, { value: "seat", label: "First seat" }, { value: "loser", label: "Loser of the last round" }], group: "Match" },
    { key: "bestOf", kind: "number", label: "Rounds to win the match", hint: "1 is a single game", def: 1, min: 1, max: 7, group: "Match" },
    { key: "fullIsDraw", kind: "bool", label: "A full board is a draw", hint: "Off: the board clears and play continues", def: true, group: "Match" },
  ],
  presets: [
    { id: "classic", name: "Classic", blurb: "7 by 6, connect four", values: {} },
    { id: "popout", name: "PopOut", blurb: "Remove your own bottom discs", values: { popOut: true } },
    { id: "five", name: "Five in a row", blurb: "Bigger board, connect five", values: { cols: 9, rows: 7, connect: 5 } },
    { id: "mini", name: "Mini", blurb: "Connect three on a small board", values: { cols: 5, rows: 5, connect: 3 } },
    { id: "chaos", name: "Chaos", blurb: "Bombs and wrap-around", values: { bombs: 2, wrap: true } },
    { id: "misere", name: "Misère", blurb: "Do not make a line!", values: { misere: true, cols: 6, rows: 6, connect: 3 } },
  ],
};

export interface FState {
  rules: RuleValues;
  n: number;
  board: number[][]; // [row][col], row 0 is the top; -1 empty, -2 is never used, otherwise the player
  turn: number;
  wins: number[];
  bombs: number[];
  round: number;
  starter: number;
  plies: number;
  phase: "play" | "roundOver" | "over";
  /** Result of the round just finished: a player, or -1 for a draw. */
  last: { winner: number; cells: [number, number][] } | null;
  names: string[];
  rng: number;
}
export type FAction = { type: "drop"; col: number } | { type: "pop"; col: number } | { type: "bomb"; col: number } | { type: "next" };
export interface FView { rules: RuleValues; board: number[][]; turn: number; wins: number[]; bombs: number[]; round: number; phase: FState["phase"]; last: FState["last"]; need: number; plies: number }

const emptyBoard = (rows: number, cols: number) => Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
const rowsOf = (s: FState) => s.board.length;
const colsOf = (s: FState) => s.board[0].length;

export const dropRow = (board: number[][], col: number): number => { for (let r = board.length - 1; r >= 0; r--) if (board[r][col] === -1) return r; return -1; };

const DIRS = (r: RuleValues): [number, number][] => [...(flag(r, "horizontal") ? [[0, 1]] : []), ...(flag(r, "vertical") ? [[1, 0]] : []), ...(flag(r, "diagonal") ? [[1, 1], [1, -1]] : [])] as [number, number][];

/** Every line of the needed length made by one player. */
export const findLines = (board: number[][], rules: RuleValues): { player: number; cells: [number, number][] }[] => {
  const R = board.length, C = board[0].length, k = num(rules, "connect"), wrap = flag(rules, "wrap");
  const out: { player: number; cells: [number, number][] }[] = [];
  for (const [dr, dc] of DIRS(rules)) {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const p = board[r][c];
      if (p < 0) continue;
      const cells: [number, number][] = [[r, c]];
      let ok = true;
      for (let i = 1; i < k; i++) {
        const rr = r + dr * i;
        let cc = c + dc * i;
        if (wrap) cc = ((cc % C) + C) % C; else if (cc < 0 || cc >= C) { ok = false; break; }
        if (rr < 0 || rr >= R || board[rr][cc] !== p) { ok = false; break; }
        cells.push([rr, cc]);
      }
      if (ok) out.push({ player: p, cells });
    }
  }
  return out;
};

const settle = (board: number[][]) => {
  const R = board.length, C = board[0].length;
  for (let c = 0; c < C; c++) {
    const col: number[] = [];
    for (let r = R - 1; r >= 0; r--) if (board[r][c] !== -1) col.push(board[r][c]);
    for (let r = R - 1, i = 0; r >= 0; r--, i++) board[r][c] = i < col.length ? col[i] : -1;
  }
};

const startingPlayer = (s: FState, rng: number, loser: number | null): { player: number; rng: number } => {
  const mode = pick(s.rules, "first");
  if (mode === "seat") return { player: 0, rng };
  if (mode === "loser" && loser !== null && loser >= 0) return { player: loser, rng };
  const r = randInt(rng, s.n);
  return { player: r.value, rng: r.rng };
};

const finishRound = (s: FState, winner: number, cells: [number, number][], events: GameEvent[]) => {
  s.last = { winner, cells };
  if (winner >= 0) s.wins[winner] += 1;
  events.push({ type: winner >= 0 ? "win" : "draw", p: winner >= 0 ? winner : undefined, cells });
  s.phase = (winner >= 0 && s.wins[winner] >= num(s.rules, "bestOf")) || (winner < 0 && num(s.rules, "bestOf") === 1) ? "over" : "roundOver";
};

const nextTurn = (s: FState) => { s.turn = (s.turn + 1) % s.n; };

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): FState => {
  const base: FState = {
    rules, n: seats.length, board: emptyBoard(num(rules, "rows"), num(rules, "cols")), turn: 0, wins: seats.map(() => 0), bombs: seats.map(() => num(rules, "bombs")),
    round: 1, starter: 0, plies: 0, phase: "play", last: null, names: seats.map(s => s.name), rng: seed >>> 0,
  };
  const st = startingPlayer(base, base.rng, null);
  base.turn = st.player; base.starter = st.player; base.rng = st.rng;
  return base;
};

const cloneState = (s: FState): FState => ({ ...s, board: s.board.map(r => r.slice()), wins: s.wins.slice(), bombs: s.bombs.slice(), last: s.last });

const apply = (state: FState, a: FAction, by: number) => {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  if (s.phase === "over") return null;
  if (a.type === "next") {
    if (s.phase !== "roundOver") return null;
    const loser = s.last && s.last.winner >= 0 ? (s.last.winner + 1) % s.n : null;
    s.board = emptyBoard(rowsOf(s), colsOf(s));
    const st = startingPlayer(s, s.rng, loser);
    s.turn = st.player; s.starter = st.player; s.rng = st.rng;
    s.round += 1; s.plies = 0; s.phase = "play"; s.last = null;
    events.push({ type: "round", round: s.round });
    return { state: s, events };
  }
  if (s.phase !== "play" || by !== s.turn || !Number.isInteger(a.col) || a.col < 0 || a.col >= colsOf(s)) return null;
  const C = colsOf(s), R = rowsOf(s);
  let popped = false;
  if (a.type === "drop") {
    const r = dropRow(s.board, a.col);
    if (r < 0) return null;
    s.board[r][a.col] = by;
    events.push({ type: "drop", p: by, col: a.col, row: r });
  } else if (a.type === "bomb") {
    if (s.bombs[by] <= 0) return null;
    const r = dropRow(s.board, a.col);
    if (r < 0) return null;
    s.bombs[by] -= 1;
    const cleared: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      let cc = a.col + dc;
      if (flag(s.rules, "wrap")) cc = ((cc % C) + C) % C;
      if (rr < 0 || rr >= R || cc < 0 || cc >= C) continue;
      if (s.board[rr][cc] !== -1) { s.board[rr][cc] = -1; cleared.push([rr, cc]); }
    }
    settle(s.board);
    events.push({ type: "bomb", p: by, col: a.col, row: r, cleared });
  } else {
    if (!flag(s.rules, "popOut") || s.board[R - 1][a.col] !== by) return null;
    for (let r = R - 1; r > 0; r--) s.board[r][a.col] = s.board[r - 1][a.col];
    s.board[0][a.col] = -1;
    popped = true;
    events.push({ type: "pop", p: by, col: a.col });
  }
  s.plies += 1;
  const lines = findLines(s.board, s.rules);
  const mis = flag(s.rules, "misere");
  if (lines.length) {
    const mine = lines.find(l => l.player === by);
    const others = lines.filter(l => l.player !== by);
    // a made line wins for its maker, or loses in misère; a pop that completes lines for several players is won by the one who popped
    const makers = new Set(lines.map(l => l.player));
    if (!mis) {
      const w = popped && mine ? by : (mine ?? others[0]).player;
      finishRound(s, w, (lines.find(l => l.player === w) ?? lines[0]).cells, events);
    } else {
      // misère: everyone who made a line loses; the next player who did not is the winner
      let w = (by + 1) % s.n;
      for (let i = 0; i < s.n && makers.has(w); i++) w = (w + 1) % s.n;
      finishRound(s, makers.has(w) ? -1 : w, lines[0].cells, events);
    }
    return { state: s, events };
  }
  const full = s.board[0].every(x => x !== -1);
  if (full || s.plies >= R * C * 4) {
    if (flag(s.rules, "fullIsDraw") || s.plies >= R * C * 4) finishRound(s, -1, [], events);
    else { s.board = emptyBoard(R, C); events.push({ type: "clear" }); nextTurn(s); }
    return { state: s, events };
  }
  nextTurn(s);
  return { state: s, events };
};

// ---- bots ------------------------------------------------------------------------------------

const legal = (s: FState, p: number): FAction[] => {
  const out: FAction[] = [];
  for (let c = 0; c < colsOf(s); c++) {
    if (dropRow(s.board, c) >= 0) { out.push({ type: "drop", col: c }); if (s.bombs[p] > 0) out.push({ type: "bomb", col: c }); }
    if (flag(s.rules, "popOut") && s.board[rowsOf(s) - 1][c] === p) out.push({ type: "pop", col: c });
  }
  return out;
};

/** Windows of `connect` cells that one player could still fill, weighted by how many they hold. */
const heuristic = (s: FState, me: number): number => {
  const R = rowsOf(s), C = colsOf(s), k = num(s.rules, "connect"), wrap = flag(s.rules, "wrap");
  let score = 0;
  for (const [dr, dc] of DIRS(s.rules)) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    let mine = 0, theirs = 0, valid = true;
    for (let i = 0; i < k; i++) {
      const rr = r + dr * i;
      let cc = c + dc * i;
      if (wrap) cc = ((cc % C) + C) % C; else if (cc < 0 || cc >= C) { valid = false; break; }
      if (rr < 0 || rr >= R) { valid = false; break; }
      const v = s.board[rr][cc];
      if (v === me) mine++; else if (v >= 0) theirs++;
    }
    if (!valid || (mine && theirs)) continue;
    const w = [0, 1, 4, 16, 64, 256, 1024][Math.max(mine, theirs)] ?? 1024;
    score += mine ? w : -w * 1.1;
  }
  return score;
};

const search = (s: FState, me: number, depth: number, alpha: number, beta: number): number => {
  if (s.phase !== "play") return s.last && s.last.winner === me ? 1e6 + depth : s.last && s.last.winner >= 0 ? -1e6 - depth : 0;
  if (depth === 0) return heuristic(s, me);
  const moves = legal(s, s.turn).filter(m => m.type !== "bomb");
  if (!moves.length) return 0;
  moves.sort((a, b) => Math.abs((a as { col: number }).col - colsOf(s) / 2) - Math.abs((b as { col: number }).col - colsOf(s) / 2));
  const maximizing = s.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of moves) {
    const r = apply(s, m, s.turn);
    if (!r) continue;
    const v = search(r.state, me, depth - 1, alpha, beta);
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
};

const bot = (s: FState, p: number, level: BotLevel): FAction | null => {
  if (s.phase === "roundOver") return { type: "next" };
  if (s.phase !== "play") return null;
  const moves = legal(s, p);
  if (!moves.length) return null;
  let plain = moves.filter(m => m.type !== "bomb");
  if (flag(s.rules, "misere")) {
    const safe = plain.filter(m => { const r = apply(s, m, p); return !!r && !(r.state.last && r.state.last.winner !== p && r.state.phase !== "play"); });
    if (safe.length) plain = safe;
  }
  const immediate = (who: number, cand: FAction[]) => cand.find(m => { const t = cloneState(s); t.turn = who; const r = apply(t, m, who); return !!r && r.state.last?.winner === who; });
  if (level === "easy") {
    const win = immediate(p, plain);
    if (win && peekChance(s.rng, 0.6)) return win;
    return peekPick(plain, s.rng, s.plies);
  }
  const win = immediate(p, plain);
  if (win) return win;
  if (!flag(s.rules, "misere")) for (let o = 0; o < s.n; o++) if (o !== p) { const block = immediate(o, plain.map(m => (m.type === "pop" ? m : { type: "drop", col: (m as { col: number }).col } as FAction))); if (block) { const b = plain.find(m => m.type === "drop" && (m as { col: number }).col === (block as { col: number }).col); if (b) return b; } }
  // spend a bomb when it is likely to hurt a leader
  if (level === "hard" && s.bombs[p] > 0 && peekChance(s.rng, 0.12, s.plies)) { const b = moves.find(m => m.type === "bomb"); if (b) return b; }
  const depth = s.n === 2 ? (level === "hard" ? 5 : 3) : 2;
  let best = plain[0], bestV = -Infinity;
  for (const m of plain) {
    const r = apply(s, m, p);
    if (!r) continue;
    const v = search(r.state, p, depth - 1, -Infinity, Infinity) + (peekChance(s.rng, 0.5, s.plies + plain.indexOf(m)) ? 0.01 : 0);
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
};

const COLOURS = ["Red", "Yellow", "Green", "Blue"];

export const fourInRow: GameDriver<FState, FAction, FView> = {
  id: "fourinrow", name: "Four in a Row", minPlayers: 2, maxPlayers: 4, schema: SCHEMA, hidden: false, create, apply,
  actors: s => (s.phase === "over" ? [] : s.phase === "roundOver" ? s.names.map((_, i) => i) : [s.turn]),
  over: s => s.phase === "over",
  scores: s => s.wins,
  winners: s => (s.last && s.last.winner >= 0 && s.phase === "over" ? [s.last.winner] : []),
  view: s => ({ rules: s.rules, board: s.board, turn: s.turn, wins: s.wins, bombs: s.bombs, round: s.round, phase: s.phase, last: s.last, need: num(s.rules, "bestOf"), plies: s.plies }),
  bot,
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as { type?: unknown; col?: unknown };
    if (o.type === "next") return { type: "next" };
    if ((o.type === "drop" || o.type === "pop" || o.type === "bomb") && Number.isInteger(o.col)) return { type: o.type, col: o.col as number };
    return null;
  },
  describe: (e, names) => {
    const who = e.p !== undefined ? names[e.p] : "";
    switch (e.type) {
      case "drop": return `${who} dropped a disc in column ${(e.col as number) + 1}`;
      case "pop": return `${who} popped a disc from column ${(e.col as number) + 1}`;
      case "bomb": return `${who} bombed column ${(e.col as number) + 1}`;
      case "win": return `${who} made a line`;
      case "draw": return "A draw";
      case "round": return `Round ${e.round}`;
      case "clear": return "The board was full and has been cleared";
      default: return null;
    }
  },
  prompt: (s, v) => {
    if (s.phase === "over") return s.last && s.last.winner === v ? "You won the match!" : `${s.names[s.last?.winner ?? 0]} won the match`;
    if (s.phase === "roundOver") return s.last && s.last.winner === v ? "You won the round" : s.last && s.last.winner >= 0 ? `${s.names[s.last.winner]} won the round` : "Round drawn";
    return s.turn === v ? "Your turn: drop a disc" : `${s.names[s.turn]} is choosing`;
  },
};

export { COLOURS };
