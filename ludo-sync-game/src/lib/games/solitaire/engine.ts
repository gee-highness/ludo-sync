import { shuffled } from "../../platform/rng";
import { flag, num, pick, type RuleValues } from "../../platform/rules";

/** A card: id 0..51 (suit = id / 13: clubs, diamonds, hearts, spades; rank = id % 13 + 1). Spider uses repeated ids. -1 is a hidden card in a view. */
export interface Card { id: number; up: boolean }
export const rankOf = (c: Card) => (c.id % 13) + 1;
export const suitOf = (c: Card) => Math.floor((c.id % 52) / 13);
const red = (c: Card) => suitOf(c) === 1 || suitOf(c) === 2;

export type Variant = "klondike" | "freecell" | "spider";
export interface Board { tab: Card[][]; stock: Card[]; waste: Card[]; found: Card[][]; cells: (Card | null)[]; passes: number; score: number; moves: number; completed: number; done: boolean; won: boolean; hist: string[]; sigs: number[] }
export interface Pile { k: "t" | "w" | "f" | "c"; i: number }
export type SAction = { type: "move"; from: Pile; n: number; to: Pile } | { type: "draw" } | { type: "undo" } | { type: "giveup" };
export interface Suggestion { move: Extract<SAction, { type: "move" }> | null; draw: boolean; score: number }

export const variantOf = (r: RuleValues): Variant => pick(r, "variant") as Variant;

// ---- dealing -------------------------------------------------------------------------------------

const spiderIds = (suits: number): number[] => {
  const order = [3, 2, 1, 0].slice(0, suits);
  const ids: number[] = [];
  for (let run = 0; run < 8; run++) for (let r = 0; r < 13; r++) ids.push(order[run % suits] * 13 + r);
  return ids;
};

export const startScore = (r: RuleValues): number => {
  const v = variantOf(r);
  if (v === "spider") return 500;
  if (v === "klondike" && pick(r, "scoring") === "vegas") return -52;
  return 0;
};

export const deal = (rules: RuleValues, rng: number): { board: Board; rng: number } => {
  const v = variantOf(rules);
  const ids = v === "spider" ? spiderIds(Number(pick(rules, "suits"))) : Array.from({ length: 52 }, (_, i) => i);
  const sh = shuffled(ids, rng);
  const cards = sh.value.map(id => ({ id, up: false }));
  const board: Board = { tab: [], stock: [], waste: [], found: [], cells: [], passes: 0, score: startScore(rules), moves: 0, completed: 0, done: false, won: false, hist: [], sigs: [] };
  let at = 0;
  const take = (k: number, up: boolean) => { const out = cards.slice(at, at + k).map(c => ({ ...c, up })); at += k; return out; };
  if (v === "klondike") {
    for (let i = 0; i < 7; i++) { const col = take(i + 1, false); col[col.length - 1].up = true; board.tab.push(col); }
    board.stock = take(52 - at, false);
    board.found = [[], [], [], []];
  } else if (v === "freecell") {
    for (let i = 0; i < 8; i++) board.tab.push(take(i < 4 ? 7 : 6, true));
    board.found = [[], [], [], []];
    board.cells = Array<Card | null>(num(rules, "cells")).fill(null);
  } else {
    for (let i = 0; i < 10; i++) { const col = take(i < 4 ? 6 : 5, false); col[col.length - 1].up = true; board.tab.push(col); }
    board.stock = take(104 - at, false);
  }
  board.sigs.push(sig(board));
  return { board, rng: sh.rng };
};

// ---- rules of building ----------------------------------------------------------------------------

/** May card `c` go on `top` in the tableau? */
const fits = (rules: RuleValues, c: Card, top: Card): boolean => {
  if (!top.up || rankOf(c) !== rankOf(top) - 1) return false;
  if (variantOf(rules) === "spider") return true;
  const b = pick(rules, "build");
  return b === "any" || (b === "suit" ? suitOf(c) === suitOf(top) : red(c) !== red(top));
};

/** Is this run of cards (bottom to top of a pile) a legal run to pick up? */
const isRun = (rules: RuleValues, run: Card[]): boolean => {
  for (let i = 0; i < run.length; i++) {
    if (!run[i].up) return false;
    if (i > 0) {
      if (variantOf(rules) === "spider") { if (suitOf(run[i]) !== suitOf(run[i - 1]) || rankOf(run[i]) !== rankOf(run[i - 1]) - 1) return false; }
      else if (!fits(rules, run[i], run[i - 1])) return false;
    }
  }
  return true;
};

const canStartColumn = (rules: RuleValues, c: Card): boolean => (variantOf(rules) === "klondike" && pick(rules, "empty") === "king" ? rankOf(c) === 13 : true);

const freeCells = (b: Board) => b.cells.filter(c => c === null).length;

/** The longest run FreeCell lets you carry at once. */
const maxCarry = (rules: RuleValues, b: Board, toEmpty: boolean): number => {
  if (!flag(rules, "supermove")) return 52;
  const empties = b.tab.filter(p => p.length === 0).length - (toEmpty ? 1 : 0);
  return (freeCells(b) + 1) * 2 ** Math.max(0, empties);
};

export const foundationIndex = (c: Card) => suitOf(c);

// ---- applying actions ------------------------------------------------------------------------------

export const sig = (b: Board): number => {
  let h = 5381;
  const mix = (x: number) => { h = ((h << 5) + h + x) | 0; };
  for (const p of b.tab) { mix(-1); for (const c of p) mix(c.id * 2 + (c.up ? 1 : 0)); }
  mix(-2); mix(b.stock.length); mix(b.waste.length); if (b.waste.length) mix(b.waste[b.waste.length - 1].id);
  for (const c of b.cells) mix(c ? c.id : -3);
  for (const f of b.found) mix(f.length);
  return h;
};

const snapshot = (b: Board) => JSON.stringify({ tab: b.tab, stock: b.stock, waste: b.waste, found: b.found, cells: b.cells, passes: b.passes, score: b.score, moves: b.moves, completed: b.completed });
const cloneBoard = (b: Board): Board => ({ ...b, tab: b.tab.map(p => p.map(c => ({ ...c }))), stock: b.stock.map(c => ({ ...c })), waste: b.waste.map(c => ({ ...c })), found: b.found.map(p => p.map(c => ({ ...c }))), cells: b.cells.map(c => (c ? { ...c } : null)), hist: b.hist.slice(), sigs: b.sigs.slice() });

const foundCount = (b: Board) => b.found.reduce((a, p) => a + p.length, 0);
export const progress = (b: Board, rules: RuleValues) => (variantOf(rules) === "spider" ? b.completed * 13 : foundCount(b));
const isWon = (b: Board, rules: RuleValues) => (variantOf(rules) === "spider" ? b.completed >= 8 : foundCount(b) >= 52);

const sourceCards = (b: Board, rules: RuleValues, from: Pile, n: number): Card[] | null => {
  const v = variantOf(rules);
  if (!Number.isInteger(n) || n < 1) return null;
  if (from.k === "t") { const p = b.tab[from.i]; if (!p || n > p.length) return null; const run = p.slice(-n); return isRun(rules, run) ? run : null; }
  if (n !== 1) return null;
  if (from.k === "w") { const c = b.waste[b.waste.length - 1]; return v === "klondike" && c ? [c] : null; }
  if (from.k === "f") { const p = b.found[from.i]; const c = p?.[p.length - 1]; return c && v === "klondike" && flag(rules, "fromFoundation") ? [c] : null; }
  if (from.k === "c") { const c = b.cells[from.i]; return c ? [c] : null; }
  return null;
};

export const applyMove = (b0: Board, rules: RuleValues, a: Extract<SAction, { type: "move" }>): Board | null => {
  const run = sourceCards(b0, rules, a.from, a.n);
  if (!run) return null;
  const v = variantOf(rules);
  const { from, to, n } = a;
  if (from.k === to.k && from.i === to.i) return null;
  // destination checks
  if (to.k === "t") {
    const dest = b0.tab[to.i];
    if (!dest) return null;
    if (dest.length === 0) { if (!canStartColumn(rules, run[0])) return null; }
    else if (!fits(rules, run[0], dest[dest.length - 1])) return null;
    if (v === "freecell" && n > maxCarry(rules, b0, dest.length === 0)) return null;
  } else if (to.k === "f") {
    if (v === "spider" || n !== 1) return null;
    const pile = b0.found[to.i];
    if (!pile || to.i !== foundationIndex(run[0])) return null;
    const top = pile[pile.length - 1];
    if (top ? rankOf(run[0]) !== rankOf(top) + 1 : rankOf(run[0]) !== 1) return null;
  } else if (to.k === "c") {
    if (v !== "freecell" || n !== 1 || b0.cells[to.i] !== null || b0.cells[to.i] === undefined) return null;
  } else return null;

  const b = cloneBoard(b0);
  b.hist.push(snapshot(b0));
  if (b.hist.length > 300) b.hist.shift();
  let pts = 0;
  const scoring = v === "klondike" ? pick(rules, "scoring") : v === "spider" ? "spider" : "none";
  // remove from the source
  if (from.k === "t") {
    b.tab[from.i].splice(-n, n);
    const p = b.tab[from.i];
    if (p.length && !p[p.length - 1].up) { p[p.length - 1].up = true; if (scoring === "standard") pts += 5; }
  } else if (from.k === "w") b.waste.pop();
  else if (from.k === "f") { b.found[from.i].pop(); if (scoring === "standard") pts -= 15; else if (scoring === "vegas") pts -= 5; }
  else b.cells[from.i] = null;
  // place at the destination
  const placed = run.map(c => ({ ...c, up: true }));
  if (to.k === "t") { b.tab[to.i].push(...placed); if (scoring === "standard" && from.k === "w") pts += 5; }
  else if (to.k === "f") { b.found[to.i].push(placed[0]); if (scoring === "standard") pts += 10; else if (scoring === "vegas") pts += 5; }
  else b.cells[to.i] = placed[0];
  if (scoring === "spider") pts -= 1;
  b.score += pts;
  b.moves += 1;
  if (v === "spider") collectRuns(b);
  finish(b, rules);
  return b;
};

/** Spider: a run from King down to Ace in one suit leaves the table. */
const collectRuns = (b: Board) => {
  for (const p of b.tab) {
    if (p.length < 13) continue;
    const tail = p.slice(-13);
    if (tail.every((c, i) => c.up && rankOf(c) === 13 - i && suitOf(c) === suitOf(tail[0]))) {
      p.splice(-13, 13);
      b.completed += 1;
      b.score += 100;
      if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
    }
  }
};

const finish = (b: Board, rules: RuleValues) => { b.sigs.push(sig(b)); if (b.sigs.length > 400) b.sigs.shift(); if (isWon(b, rules)) { b.done = true; b.won = true; } };

export const applyDraw = (b0: Board, rules: RuleValues): Board | null => {
  const v = variantOf(rules);
  const b = cloneBoard(b0);
  b.hist.push(snapshot(b0));
  if (b.hist.length > 300) b.hist.shift();
  if (v === "klondike") {
    if (b.stock.length) {
      const k = Math.min(Number(pick(rules, "draw")), b.stock.length);
      for (let i = 0; i < k; i++) { const c = b.stock.pop()!; b.waste.push({ ...c, up: true }); }
    } else {
      if (!b.waste.length) return null;
      const limit = Number(pick(rules, "passes"));
      if (limit > 0 && b.passes + 1 >= limit) return null;
      b.stock = b.waste.reverse().map(c => ({ ...c, up: false }));
      b.waste = [];
      b.passes += 1;
      if (pick(rules, "scoring") === "standard") b.score -= pick(rules, "draw") === "1" ? (b.passes >= 1 ? 100 : 0) : (b.passes >= 3 ? 20 : 0);
    }
  } else if (v === "spider") {
    if (b.stock.length < 10) return null;
    if (!flag(rules, "dealToEmpty") && b.tab.some(p => p.length === 0)) return null;
    for (let i = 0; i < 10; i++) { const c = b.stock.pop()!; b.tab[i].push({ ...c, up: true }); }
    b.score -= 1;
    collectRuns(b);
  } else return null;
  b.moves += 1;
  finish(b, rules);
  return b;
};

export const applyUndo = (b0: Board, rules: RuleValues): Board | null => {
  if (!flag(rules, "undo") || !b0.hist.length) return null;
  const hist = b0.hist.slice(0, -1);
  const prev = JSON.parse(b0.hist[b0.hist.length - 1]) as Omit<Board, "hist" | "sigs" | "done" | "won">;
  return { ...prev, hist, sigs: b0.sigs.slice(0, -1), done: false, won: false };
};

// ---- finding moves (hints and the racing bots) --------------------------------------------------------

const piles = (b: Board, rules: RuleValues): { from: Pile; n: number }[] => {
  const out: { from: Pile; n: number }[] = [];
  b.tab.forEach((p, i) => { for (let n = 1; n <= p.length; n++) if (isRun(rules, p.slice(-n))) out.push({ from: { k: "t", i }, n }); });
  if (b.waste.length) out.push({ from: { k: "w", i: 0 }, n: 1 });
  b.cells.forEach((c, i) => { if (c) out.push({ from: { k: "c", i }, n: 1 }); });
  return out;
};

export const allMoves = (b: Board, rules: RuleValues): Suggestion[] => {
  const v = variantOf(rules);
  const out: Suggestion[] = [];
  for (const { from, n } of piles(b, rules)) {
    const dests: Pile[] = [...b.tab.map((_, i) => ({ k: "t" as const, i })), ...b.found.map((_, i) => ({ k: "f" as const, i })), ...b.cells.map((_, i) => ({ k: "c" as const, i }))];
    for (const to of dests) {
      const move = { type: "move" as const, from, n, to };
      const next = applyMove(b, rules, move);
      if (!next) continue;
      const src = from.k === "t" ? b.tab[from.i] : null;
      const reveals = !!src && src.length > n && !src[src.length - n - 1].up;
      const wholePile = !!src && src.length === n;
      let score = 0;
      if (to.k === "f") score = 100 + (from.k === "t" && reveals ? 20 : 0);
      else if (to.k === "t") {
        const dest = b.tab[to.i];
        if (wholePile && dest.length === 0) continue; // shuffling a whole column into an empty one gets nowhere
        score = reveals ? 60 : from.k === "w" ? 25 : wholePile ? 30 : 8;
        if (dest.length === 0 && v === "klondike") score += 10;
        if (v === "spider" && dest.length && suitOf(dest[dest.length - 1]) === suitOf(b.tab[from.i]?.[b.tab[from.i].length - n] ?? dest[dest.length - 1])) score += 25;
        if (v === "spider" && next.completed > b.completed) score += 200;
        if (v === "freecell" && from.k === "c") score += 12;
      } else score = 1;
      if (from.k === "f") score = -40;
      out.push({ move, draw: false, score });
    }
  }
  return out;
};

/** The best next step, never one that returns to a position already seen, or null when nothing helps. */
export const suggest = (b: Board, rules: RuleValues, avoidSeen = true): Suggestion | null => {
  const seen = new Set(avoidSeen ? b.sigs : []);
  const moves = allMoves(b, rules).filter(m => { const nb = applyMove(b, rules, m.move!); return !!nb && !seen.has(sig(nb)); }).sort((x, y) => y.score - x.score);
  if (moves.length && moves[0].score > 0) return moves[0];
  const drawn = applyDraw(b, rules);
  if (drawn && !seen.has(sig(drawn))) return { move: null, draw: true, score: 0 };
  return moves[0] ?? null;
};

// ---- looking ahead (the racing bots) -------------------------------------------------------------------

/** How good a position looks: cards home, cards turned up, free cells and empty columns, and how well the columns are ordered. */
export const evaluate = (b: Board, rules: RuleValues): number => {
  const v = variantOf(rules);
  let s = progress(b, rules) * (v === "spider" ? 12 : 20);
  for (const p of b.tab) {
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (!c.up) { s -= 3; continue; }
      s += 0.5;
      if (i > 0 && p[i - 1].up) {
        if (v === "spider") { if (rankOf(p[i - 1]) - 1 === rankOf(c)) s += suitOf(p[i - 1]) === suitOf(c) ? 3 : 0.4; }
        else if (fits(rules, c, p[i - 1])) s += 1.2;
      }
    }
    if (p.length === 0) s += v === "klondike" ? 2 : 6;
  }
  if (v === "freecell") s += freeCells(b) * 4;
  s -= b.stock.length * 0.05;
  return s;
};

const candidatesFor = (b: Board, rules: RuleValues, width: number): { next: Board; first: Suggestion }[] => {
  const out: { next: Board; first: Suggestion }[] = [];
  const moves = allMoves(b, rules).filter(m => m.score > 0).sort((x, y) => y.score - x.score).slice(0, width);
  for (const m of moves) { const next = applyMove(b, rules, m.move!); if (next) out.push({ next, first: m }); }
  const drawn = applyDraw(b, rules);
  if (drawn) out.push({ next: drawn, first: { move: null, draw: true, score: 0 } });
  return out;
};

const lookahead = (b: Board, rules: RuleValues, depth: number, width: number, seen: Set<number>): number => {
  if (b.won) return 1e6;
  if (depth === 0) return evaluate(b, rules);
  let best = evaluate(b, rules);
  for (const { next } of candidatesFor(b, rules, width)) {
    const k = sig(next);
    if (seen.has(k)) continue;
    seen.add(k);
    best = Math.max(best, lookahead(next, rules, depth - 1, width, seen));
    seen.delete(k);
  }
  return best;
};

/** The best next step found by searching a few moves ahead, or null when there is nothing worth doing. */
export const search = (b: Board, rules: RuleValues, depth: number, width: number): Suggestion | null => {
  const seen = new Set(b.sigs);
  let best: Suggestion | null = null, bestV = -Infinity;
  for (const { next, first } of candidatesFor(b, rules, width)) {
    const k = sig(next);
    if (seen.has(k)) continue;
    seen.add(k);
    const v = lookahead(next, rules, depth - 1, width, seen) + first.score * 0.01;
    seen.delete(k);
    if (v > bestV) { bestV = v; best = first; }
  }
  return best;
};
