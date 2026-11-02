import { flag, num, pick, type RuleSchema, type RuleValues } from "../../platform/rules";
import { peekChance, peekPick, randInt } from "../../platform/rng";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";

export const SCHEMA: RuleSchema = {
  rules: [
    { key: "size", kind: "number", label: "Board size", hint: "Squares along each side", def: 8, min: 6, max: 12, step: 2, group: "Board" },
    { key: "rowsFilled", kind: "number", label: "Rows of pieces", hint: "Rows each side starts with (at most two fewer than half the board)", def: 3, min: 1, max: 5, group: "Board" },
    { key: "mandatory", kind: "bool", label: "Captures are compulsory", hint: "Off: you may step instead of capturing", def: true, group: "Captures" },
    { key: "majority", kind: "bool", label: "Take the most pieces", hint: "When you can capture several ways you must take the longest", def: false, group: "Captures" },
    { key: "backward", kind: "bool", label: "Men capture backwards", def: false, group: "Captures" },
    { key: "flying", kind: "bool", label: "Flying kings", hint: "Kings slide any distance, and capture from far away", def: false, group: "Kings" },
    { key: "crowning", kind: "choice", label: "Crowned mid-capture", def: "ends", choices: [{ value: "ends", label: "The turn ends" }, { value: "continues", label: "Keep capturing as a king" }], group: "Kings" },
    { key: "first", kind: "choice", label: "Who moves first", def: "seat", choices: [{ value: "seat", label: "Red" }, { value: "other", label: "White" }, { value: "random", label: "Random" }], group: "Match" },
    { key: "drawMoves", kind: "number", label: "Draw after (moves each)", hint: "With no capture and no man moved", def: 40, min: 10, max: 100, step: 5, group: "Match" },
  ],
  presets: [
    { id: "american", name: "American", blurb: "8 by 8, forward capture, compulsory", values: {} },
    { id: "brazilian", name: "Brazilian", blurb: "Flying kings, backward capture, take the most", values: { flying: true, backward: true, majority: true, crowning: "continues" } },
    { id: "big", name: "Big board", blurb: "10 by 10 with flying kings", values: { size: 10, rowsFilled: 4, flying: true, backward: true, majority: true, crowning: "continues" } },
    { id: "casual", name: "Casual", blurb: "Captures are optional", values: { mandatory: false } },
    { id: "mini", name: "Mini", blurb: "6 by 6, a quick game", values: { size: 6, rowsFilled: 2, drawMoves: 25 } },
  ],
};

// Board cells: -1 empty, 0 or 1 a man of that player, 2 or 3 a king of player (value - 2). Player 0 (Red) starts at the bottom and moves up.
export type Board = number[][];
export type Sq = [number, number];
export interface Move { from: Sq; path: Sq[]; captured: Sq[] }
export interface Cfg { size: number; mandatory: boolean; majority: boolean; backward: boolean; flying: boolean; crowning: "ends" | "continues" }

export interface CState {
  rules: RuleValues;
  cfg: Cfg;
  board: Board;
  turn: number;
  /** Plies since a capture or a man moved. */
  quiet: number;
  plies: number;
  captures: number[];
  phase: "play" | "over";
  /** The side that won, or -1 for a draw, once the game is over. */
  winner: number;
  /** The last move, so the table can show it. */
  lastMove: { p: number; from: Sq; path: Sq[]; captured: Sq[]; crowned: boolean } | null;
  names: string[];
  rng: number;
}
export type CAction = { type: "move"; path: Sq[] };
export interface CView { rules: RuleValues; size: number; board: Board; turn: number; captures: number[]; phase: CState["phase"]; winner: number; lastMove: CState["lastMove"]; quiet: number; drawAt: number; moves: Move[] }

const owner = (v: number) => (v < 0 ? -1 : v & 1);
const isKing = (v: number) => v >= 2;
const dark = (r: number, c: number) => (r + c) % 2 === 1;
const crownRow = (p: number, size: number) => (p === 0 ? 0 : size - 1);
const sameSq = (a: Sq, b: Sq) => a[0] === b[0] && a[1] === b[1];

export const cfgOf = (rules: RuleValues): Cfg => ({
  size: num(rules, "size"), mandatory: flag(rules, "mandatory"), majority: flag(rules, "majority"), backward: flag(rules, "backward"), flying: flag(rules, "flying"),
  crowning: pick(rules, "crowning") === "continues" ? "continues" : "ends",
});

export const startBoard = (size: number, rowsFilled: number): Board => {
  const rows = Math.max(1, Math.min(rowsFilled, size / 2 - 1));
  const b: Board = Array.from({ length: size }, () => Array<number>(size).fill(-1));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!dark(r, c)) continue;
    if (r < rows) b[r][c] = 1;
    else if (r >= size - rows) b[r][c] = 0;
  }
  return b;
};

const DIAG: Sq[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const inside = (size: number, r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size;

/** Capture sequences for one piece. Captured pieces stay on the board until the move ends, so none can be jumped twice. */
const capturesFrom = (b: Board, cfg: Cfg, from: Sq): Move[] => {
  const p = owner(b[from[0]][from[1]]);
  const out: Move[] = [];
  const emptyAt = (r: number, c: number) => b[r][c] === -1 || (r === from[0] && c === from[1]);
  const walk = (at: Sq, king: boolean, path: Sq[], captured: Sq[]) => {
    const fwd = p === 0 ? -1 : 1;
    for (const [dr, dc] of DIAG) {
      if (!king && !cfg.backward && dr !== fwd) continue;
      let r = at[0] + dr, c = at[1] + dc;
      if (king && cfg.flying) while (inside(cfg.size, r, c) && emptyAt(r, c)) { r += dr; c += dc; }
      if (!inside(cfg.size, r, c)) continue;
      const v = b[r][c];
      if (v < 0 || owner(v) === p || captured.some(q => q[0] === r && q[1] === c)) continue;
      const victim: Sq = [r, c];
      let lr = r + dr, lc = c + dc;
      while (inside(cfg.size, lr, lc) && emptyAt(lr, lc)) {
        const nextPath: Sq[] = [...path, [lr, lc]], nextCap: Sq[] = [...captured, victim];
        const crowns = !king && lr === crownRow(p, cfg.size);
        if (crowns && cfg.crowning === "ends") out.push({ from, path: nextPath, captured: nextCap });
        else {
          const before = out.length;
          walk([lr, lc], king || crowns, nextPath, nextCap);
          if (out.length === before) out.push({ from, path: nextPath, captured: nextCap });
        }
        if (!(king && cfg.flying)) break;
        lr += dr; lc += dc;
      }
    }
  };
  walk(from, isKing(b[from[0]][from[1]]), [], []);
  return out;
};

const stepsFrom = (b: Board, cfg: Cfg, from: Sq): Move[] => {
  const v = b[from[0]][from[1]], p = owner(v), king = isKing(v);
  const out: Move[] = [];
  const fwd = p === 0 ? -1 : 1;
  for (const [dr, dc] of DIAG) {
    if (!king && dr !== fwd) continue;
    let r = from[0] + dr, c = from[1] + dc;
    while (inside(cfg.size, r, c) && b[r][c] === -1) {
      out.push({ from, path: [[r, c]], captured: [] });
      if (!(king && cfg.flying)) break;
      r += dr; c += dc;
    }
  }
  return out;
};

export const legalMoves = (b: Board, cfg: Cfg, p: number): Move[] => {
  let caps: Move[] = [];
  const steps: Move[] = [];
  for (let r = 0; r < cfg.size; r++) for (let c = 0; c < cfg.size; c++) {
    if (owner(b[r][c]) !== p) continue;
    caps = caps.concat(capturesFrom(b, cfg, [r, c]));
    steps.push(...stepsFrom(b, cfg, [r, c]));
  }
  if (caps.length) {
    if (cfg.majority) { const most = Math.max(...caps.map(m => m.captured.length)); caps = caps.filter(m => m.captured.length === most); }
    return cfg.mandatory ? caps : caps.concat(steps);
  }
  return steps;
};

/** Plays a move on a copy of the board. */
export const play = (b: Board, cfg: Cfg, m: Move): { board: Board; crowned: boolean } => {
  const nb = b.map(r => r.slice());
  const v = nb[m.from[0]][m.from[1]], p = owner(v);
  nb[m.from[0]][m.from[1]] = -1;
  for (const [r, c] of m.captured) nb[r][c] = -1;
  const end = m.path[m.path.length - 1];
  let piece = v;
  let crowned = false;
  if (!isKing(v) && (end[0] === crownRow(p, cfg.size) || m.path.some(q => q[0] === crownRow(p, cfg.size) && cfg.crowning === "continues"))) { piece = v + 2; crowned = true; }
  nb[end[0]][end[1]] = piece;
  return { board: nb, crowned };
};

const count = (b: Board, p: number) => { let n = 0; for (const row of b) for (const v of row) if (owner(v) === p) n++; return n; };

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): CState => {
  const cfg = cfgOf(rules);
  const first = pick(rules, "first");
  let rng = seed >>> 0, turn = first === "other" ? 1 : 0;
  if (first === "random") { const r = randInt(rng, 2); turn = r.value; rng = r.rng; }
  return {
    rules, cfg, board: startBoard(cfg.size, num(rules, "rowsFilled")), turn, quiet: 0, plies: 0, captures: [0, 0], phase: "play", winner: -1, lastMove: null,
    names: seats.slice(0, 2).map(s => s.name), rng,
  };
};

const sameMove = (a: Move, path: Sq[]) => a.path.length === path.length && a.path.every((q, i) => sameSq(q, path[i]));

const apply = (state: CState, a: CAction, by: number) => {
  if (state.phase !== "play" || by !== state.turn || !a || a.type !== "move") return null;
  const moves = legalMoves(state.board, state.cfg, by);
  // The action carries the full route; the first square is where the piece stands now.
  const m = moves.find(x => a.path.length === x.path.length + 1 && sameSq(a.path[0], x.from) && sameMove(x, a.path.slice(1)));
  if (!m) return null;
  const wasMan = !isKing(state.board[m.from[0]][m.from[1]]);
  const { board, crowned } = play(state.board, state.cfg, m);
  const s: CState = { ...state, board, captures: state.captures.slice(), plies: state.plies + 1, quiet: m.captured.length || wasMan ? 0 : state.quiet + 1 };
  s.captures[by] += m.captured.length;
  s.lastMove = { p: by, from: m.from, path: m.path, captured: m.captured, crowned };
  const events: GameEvent[] = [{ type: "move", p: by, size: state.cfg.size, from: m.from, to: m.path[m.path.length - 1], path: m.path, captured: m.captured, crowned }];
  const next = 1 - by;
  s.turn = next;
  if (!legalMoves(board, s.cfg, next).length) { s.phase = "over"; s.winner = by; events.push({ type: "win", p: by, reason: count(board, next) ? "blocked" : "captured" }); }
  else if (s.quiet >= num(s.rules, "drawMoves") * 2) { s.phase = "over"; s.winner = -1; events.push({ type: "draw" }); }
  return { state: s, events };
};

// ---- bots ------------------------------------------------------------------------------------

const evaluate = (b: Board, cfg: Cfg, me: number): number => {
  let score = 0;
  const mid = (cfg.size - 1) / 2;
  for (let r = 0; r < cfg.size; r++) for (let c = 0; c < cfg.size; c++) {
    const v = b[r][c];
    if (v < 0) continue;
    const p = owner(v), sign = p === me ? 1 : -1;
    let w: number;
    if (isKing(v)) w = 300 - Math.abs(c - mid) * 2 - Math.abs(r - mid) * 2;
    else {
      const advance = p === 0 ? cfg.size - 1 - r : r;
      w = 100 + advance * 6 + (advance === 0 ? 8 : 0) - Math.abs(c - mid) * 1.5;
    }
    score += sign * w;
  }
  return score;
};

const MATE = 1e5;
const search = (b: Board, cfg: Cfg, turn: number, me: number, depth: number, alpha: number, beta: number, budget: { n: number }): number => {
  const moves = legalMoves(b, cfg, turn);
  if (!moves.length) return turn === me ? -MATE - depth : MATE + depth;
  if (depth <= 0 || budget.n <= 0) return evaluate(b, cfg, me);
  budget.n--;
  moves.sort((x, y) => y.captured.length - x.captured.length);
  const max = turn === me;
  let best = max ? -Infinity : Infinity;
  for (const m of moves) {
    const v = search(play(b, cfg, m).board, cfg, 1 - turn, me, depth - 1, alpha, beta, budget);
    if (max) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
};

const bot = (s: CState, p: number, level: BotLevel): CAction | null => {
  if (s.phase !== "play" || s.turn !== p) return null;
  const moves = legalMoves(s.board, s.cfg, p);
  if (!moves.length) return null;
  const route = (m: Move): CAction => ({ type: "move", path: [m.from, ...m.path] });
  if (level === "easy") {
    const caps = moves.filter(m => m.captured.length);
    return route(peekChance(s.rng, 0.7, s.plies) && caps.length ? peekPick(caps, s.rng, s.plies) : peekPick(moves, s.rng, s.plies));
  }
  const depth = level === "hard" ? 7 : 4;
  let best = moves[0], bestV = -Infinity;
  const budget = { n: level === "hard" ? 60000 : 8000 };
  for (const m of moves) {
    const v = search(play(s.board, s.cfg, m).board, s.cfg, 1 - p, p, depth - 1, -Infinity, Infinity, budget) + (peekChance(s.rng, 0.5, s.plies + moves.indexOf(m)) ? 0.01 : 0);
    if (v > bestV) { bestV = v; best = m; }
  }
  return route(best);
};

const COLOURS = ["Red", "White"];
const sqName = (q: Sq, size: number) => `${String.fromCharCode(97 + q[1])}${size - q[0]}`;

export const checkers: GameDriver<CState, CAction, CView> = {
  id: "checkers", name: "Checkers", minPlayers: 2, maxPlayers: 2, schema: SCHEMA, hidden: false, create, apply,
  actors: s => (s.phase === "over" ? [] : [s.turn]),
  over: s => s.phase === "over",
  scores: s => s.captures,
  winners: s => (s.phase === "over" && s.winner >= 0 ? [s.winner] : []),
  view: s => ({ rules: s.rules, size: s.cfg.size, board: s.board, turn: s.turn, captures: s.captures, phase: s.phase, winner: s.winner, lastMove: s.lastMove, quiet: s.quiet, drawAt: num(s.rules, "drawMoves") * 2, moves: s.phase === "play" ? legalMoves(s.board, s.cfg, s.turn) : [] }),
  bot,
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as { type?: unknown; path?: unknown };
    if (o.type !== "move" || !Array.isArray(o.path) || o.path.length < 2 || o.path.length > 80) return null;
    const path: Sq[] = [];
    for (const q of o.path) {
      if (!Array.isArray(q) || q.length !== 2 || !Number.isInteger(q[0]) || !Number.isInteger(q[1]) || q[0] < 0 || q[1] < 0 || q[0] > 11 || q[1] > 11) return null;
      path.push([q[0], q[1]]);
    }
    return { type: "move", path };
  },
  describe: (e, names) => {
    const who = e.p !== undefined ? names[e.p] : "";
    if (e.type === "move") {
      const path = e.path as Sq[], caps = (e.captured as Sq[]).length;
      const size = e.size as number; // files a to l, ranks counted from the bottom
      const from = e.from as Sq;
      return `${who} ${caps ? `captured ${caps} piece${caps > 1 ? "s" : ""}` : "moved"}: ${sqName(from, size)} to ${sqName(path[path.length - 1], size)}${e.crowned ? " and was crowned" : ""}`;
    }
    if (e.type === "win") return `${who} won${e.reason === "blocked" ? ": no moves left for the opponent" : ""}`;
    if (e.type === "draw") return "A draw: no progress for too long";
    return null;
  },
  prompt: (s, v) => {
    if (s.phase === "over") return s.winner < 0 ? "A draw" : s.winner === v ? "You won!" : `${s.names[s.winner]} won`;
    if (s.turn !== v) return `${s.names[s.turn]} is thinking`;
    const moves = legalMoves(s.board, s.cfg, v);
    return moves.length && moves[0].captured.length ? "Your turn: you must capture" : "Your turn: pick a piece, then a square";
  },
};

export { COLOURS };
