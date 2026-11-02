import { num, pick, type RuleValues } from "../../platform/rules";
import { peekChance } from "../../platform/rng";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";
import { SCHEMA } from "./rules";
import { applyDraw, applyMove, applyUndo, deal, progress, search, suggest, variantOf, type Board, type Pile, type SAction, type Suggestion } from "./engine";

export { SCHEMA };

export interface SolState { rules: RuleValues; n: number; names: string[]; boards: Board[]; order: number[]; rng: number }
export interface OtherView { name: string; progress: number; score: number; moves: number; done: boolean; won: boolean }
export interface BoardView extends Omit<Board, "hist" | "sigs"> { canUndo: boolean }
export interface SolView { rules: RuleValues; me: number | null; board: BoardView | null; others: OtherView[]; order: number[]; hint: Suggestion | null; over: boolean }

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): SolState => {
  const { board, rng } = deal(rules, seed >>> 0);
  // every seat plays the very same deal
  return { rules, n: seats.length, names: seats.map(s => s.name), boards: seats.map(() => ({ ...board, tab: board.tab.map(p => p.map(c => ({ ...c }))), stock: board.stock.map(c => ({ ...c })), found: board.found.map(p => p.slice()), cells: board.cells.slice(), hist: [], sigs: board.sigs.slice() })), order: [], rng };
};

const apply = (s: SolState, a: SAction, by: number): { state: SolState; events: GameEvent[] } | null => {
  const b = s.boards[by];
  if (!b || b.done || isOver(s)) return null;
  let next: Board | null = null;
  const events: GameEvent[] = [];
  if (a.type === "move") next = applyMove(b, s.rules, a);
  else if (a.type === "draw") next = applyDraw(b, s.rules);
  else if (a.type === "undo") next = applyUndo(b, s.rules);
  else if (a.type === "giveup") next = { ...b, done: true, won: false };
  if (!next) return null;
  const boards = s.boards.slice();
  boards[by] = next;
  const order = next.won && !b.won ? [...s.order, by] : s.order;
  if (a.type === "move" || a.type === "draw") events.push({ type: a.type, p: by });
  if (next.won && !b.won) events.push({ type: "won", p: by, moves: next.moves });
  if (a.type === "giveup") events.push({ type: "gaveup", p: by });
  return { state: { ...s, boards, order }, events };
};

const isOver = (s: SolState): boolean => s.boards.every(b => b.done) || (pick(s.rules, "race") === "first" && s.order.length > 0 && s.n > 1);

const shown = (r: RuleValues, b: Board): number => (variantOf(r) === "klondike" && pick(r, "scoring") === "none" ? progress(b, r) : variantOf(r) === "freecell" ? progress(b, r) : b.score);

const hideBoard = (b: Board, r: RuleValues): BoardView => {
  const hide = (c: { id: number; up: boolean }) => (c.up ? c : { id: -1, up: false });
  return { tab: b.tab.map(p => p.map(hide)), stock: b.stock.map(hide), waste: b.waste, found: b.found, cells: b.cells, passes: b.passes, score: b.score, moves: b.moves, completed: b.completed, done: b.done, won: b.won, canUndo: r.undo === true && b.hist.length > 0 };
};

const view = (s: SolState, viewer: number | null): SolView => {
  const b = viewer === null ? null : s.boards[viewer];
  return {
    rules: s.rules, me: viewer, board: b ? hideBoard(b, s.rules) : null, order: s.order, over: isOver(s),
    others: s.boards.map((x, i) => ({ name: s.names[i], progress: progress(x, s.rules), score: shown(s.rules, x), moves: x.moves, done: x.done, won: x.won })),
    hint: b && !b.done ? suggest(b, s.rules, false) : null,
  };
};

const bot = (s: SolState, p: number, level: BotLevel): SAction | null => {
  const b = s.boards[p];
  if (!b || b.done || isOver(s)) return null;
  if (b.moves > 700) return { type: "giveup" };
  // easy and normal bots play greedily; the hard one searches a few moves ahead
  const sg = level === "hard" ? search(b, s.rules, 3, 6) ?? suggest(b, s.rules) : suggest(b, s.rules);
  if (!sg) return { type: "giveup" };
  if (level === "easy" && peekChance(s.rng, 0.35, b.moves) && applyDraw(b, s.rules)) return { type: "draw" };
  return sg.draw ? { type: "draw" } : sg.move!;
};

const pileOk = (v: unknown): v is Pile => !!v && typeof v === "object" && ["t", "w", "f", "c"].includes((v as Pile).k) && Number.isInteger((v as Pile).i) && (v as Pile).i >= 0 && (v as Pile).i < 20;

export const solitaire: GameDriver<SolState, SAction, SolView> = {
  id: "solitaire", name: "Solitaire", minPlayers: 1, maxPlayers: 4, schema: SCHEMA, hidden: false, noHotseat: true, create, apply,
  actors: s => (isOver(s) ? [] : s.boards.flatMap((b, i) => (b.done ? [] : [i]))),
  over: isOver,
  scores: s => s.boards.map(b => Math.max(0, shown(s.rules, b)) + (b.won ? 50 : 0)),
  winners: s => {
    if (!isOver(s)) return [];
    if (pick(s.rules, "race") === "first" || s.n === 1) return s.order.length ? [s.order[0]] : [];
    const won = s.boards.flatMap((b, i) => (b.won ? [i] : []));
    if (!won.length) return [];
    const best = Math.max(...won.map(i => shown(s.rules, s.boards[i])));
    return won.filter(i => shown(s.rules, s.boards[i]) === best);
  },
  view, bot,
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.type === "draw" || o.type === "undo" || o.type === "giveup") return { type: o.type };
    if (o.type === "move" && pileOk(o.from) && pileOk(o.to) && Number.isInteger(o.n) && (o.n as number) >= 1 && (o.n as number) <= 13) return { type: "move", from: { k: o.from.k, i: o.from.i }, n: o.n as number, to: { k: o.to.k, i: o.to.i } };
    return null;
  },
  describe: (e, names) => (e.type === "won" ? `${names[e.p as number]} finished the game in ${e.moves} moves!` : e.type === "gaveup" ? `${names[e.p as number]} gave up` : null),
  prompt: (s, v) => {
    const b = s.boards[v];
    if (!b) return "Watching";
    if (isOver(s)) return b.won ? "You finished it!" : "Game over";
    return b.done ? (b.won ? "You finished! Waiting for the others" : "You gave up") : s.n > 1 ? "Play your own board: race the others" : "Your move";
  },
  luck: true,
};

export { num };
