import { flag, num, pick, type RuleSchema, type RuleValues } from "../../platform/rules";
import { nextRandom } from "../../ludo/rng";
import { generateBoard, reportOf, type BoardReport, type Special } from "./boards";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";

export const SCHEMA: RuleSchema = {
  rules: [
    { key: "cols", kind: "number", label: "Squares across", def: 10, min: 4, max: 12, group: "Board" },
    { key: "rows", kind: "number", label: "Squares down", def: 10, min: 4, max: 12, group: "Board" },
    { key: "ladders", kind: "number", label: "Ladders", def: 8, min: 0, max: 20, group: "Board" },
    { key: "snakes", kind: "number", label: "Snakes", def: 8, min: 0, max: 20, group: "Board" },
    { key: "minJump", kind: "number", label: "Shortest snake or ladder (squares)", def: 8, min: 2, max: 40, group: "Board" },
    { key: "fixed", kind: "bool", label: "Classic fixed board", hint: "Use the well-known 100-square layout (needs a 10 by 10 board)", def: false, group: "Board" },

    { key: "boardSeed", kind: "number", label: "Board number", hint: "0 gives a new board every game. Any other number gives everyone the same board, so you can share a favourite.", def: 0, min: 0, max: 99999, zeroLabel: "New each game", group: "Board" },
    { key: "specials", kind: "number", label: "Special squares", hint: "Bonus roll, miss a turn, safe squares and portals", def: 0, min: 0, max: 12, zeroLabel: "None", group: "Board" },
    { key: "theme", kind: "choice", label: "Look", def: "classic", choices: [{ value: "classic", label: "Classic" }, { value: "jungle", label: "Jungle" }, { value: "night", label: "Night (high contrast)" }], group: "Board" },
    { key: "dice", kind: "number", label: "Dice", def: 1, min: 1, max: 3, group: "Dice" },
    { key: "dieChoice", kind: "bool", label: "Choose which die to use", hint: "Roll two dice, then move by either die or both together: a real decision every turn", def: false, group: "Dice", when: v => (v.dice as number) >= 2 },
    { key: "sides", kind: "number", label: "Sides on each die", def: 6, min: 3, max: 12, group: "Dice" },
    { key: "enter", kind: "choice", label: "Getting on the board", def: "any", choices: [{ value: "any", label: "Any roll" }, { value: "max", label: "Need the highest roll" }, { value: "one", label: "Need a 1" }], group: "Dice" },
    { key: "bonus", kind: "choice", label: "Roll again when you roll", def: "max", choices: [{ value: "off", label: "Never" }, { value: "max", label: "The highest value (a 6)" }, { value: "doubles", label: "Doubles (needs 2+ dice)" }, { value: "both", label: "Either" }], group: "Dice" },
    { key: "bonusLimit", kind: "number", label: "Bonus rolls in a row before you lose the turn", def: 3, min: 1, max: 9, group: "Dice" },

    { key: "finish", kind: "choice", label: "Reaching the end", def: "exact", choices: [{ value: "exact", label: "Exact roll needed, stay if too high" }, { value: "bounce", label: "Exact roll, bounce back if too high" }, { value: "any", label: "Any roll that reaches or passes" }], group: "Finish" },
    { key: "bump", kind: "bool", label: "Landing on someone sends them back to the start", def: false, group: "Finish" },
    { key: "bumpTo", kind: "choice", label: "Bumped players go to", def: "start", choices: [{ value: "start", label: "The start" }, { value: "back", label: "Back by your roll" }], group: "Finish", when: v => v.bump === true },
    { key: "chain", kind: "bool", label: "Snakes and ladders can chain", hint: "If a snake or ladder ends on another one, keep going", def: false, group: "Finish" },
    { key: "winners", kind: "number", label: "Finishers needed to end the game", hint: "2 means play on for second place", def: 1, min: 1, max: 5, group: "Finish" },
  ],
  presets: [
    { id: "classic", name: "Classic", blurb: "10 by 10, six-sided die", values: { fixed: true } },
    { id: "random", name: "Random board", blurb: "A fresh layout every game", values: {} },
    { id: "kids", name: "Easy (few snakes)", blurb: "More ladders, no exact finish", values: { snakes: 4, ladders: 10, finish: "any" } },
    { id: "fast", name: "Fast", blurb: "Two dice on a small board", values: { cols: 7, rows: 7, dice: 2, snakes: 5, ladders: 5, minJump: 5 } },
    { id: "brutal", name: "Brutal", blurb: "Many snakes, bumping, exact finish", values: { snakes: 14, ladders: 5, bump: true } },
    { id: "strategy", name: "Strategy", blurb: "Two dice: choose how to move, with special squares", values: { dice: 2, dieChoice: true, specials: 6, bonus: "doubles" } },
    { id: "adventure", name: "Adventure", blurb: "Portals, bonus squares, safe squares and bumping", values: { specials: 8, bump: true } },
    { id: "sprint", name: "Sprint", blurb: "A small board for a quick game", values: { cols: 6, rows: 6, snakes: 4, ladders: 4, minJump: 5 } },
    { id: "chaos", name: "Chaos", blurb: "Chains, bumping, bonus rolls on doubles", values: { chain: true, bump: true, dice: 2, bonus: "both", snakes: 10, ladders: 10 } },
  ],
};

export interface SState {
  rules: RuleValues;
  n: number;
  names: string[];
  size: number;
  /** square -> where it leads (ladders go up, snakes down) */
  jumps: Record<number, number>;
  pos: number[];
  turn: number;
  /** order of finish */
  finished: number[];
  bonusRun: number;
  /** square -> special kind (bonus, skip, safe, warp) and the partner square of each portal */
  special: Record<number, Special>;
  warp: Record<number, number>;
  /** turns each player must still miss */
  skip: number[];
  /** two dice rolled and waiting for the player to choose how to use them */
  pending: number[] | null;
  report: BoardReport;
  boardCode: number;
  last: { p: number; dice: number[]; from: number; to: number; jump: number | null; bumped: number[]; use?: string } | null;
  rolls: number[];
  phase: "play" | "over";
  rng: number;
}
export type SAction = { type: "roll" } | { type: "use"; use: "a" | "b" | "sum" };
export interface Landing { to: number; land: number; jump: number | null; slides: [number, number, string?][]; special: Special | null; bonus: boolean }
export interface SView { rules: RuleValues; special: Record<number, Special>; warp: Record<number, number>; skip: number[]; pending: number[] | null; choices: Record<string, Landing> | null; report: BoardReport; boardCode: number; size: number; cols: number; rows: number; jumps: Record<number, number>; pos: number[]; turn: number; finished: number[]; last: SState["last"]; bonusRun: number; phase: SState["phase"] }

const CLASSIC: Record<number, number> = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100, 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

const rnd = (s: { rng: number }) => { const r = nextRandom(s.rng); s.rng = r.state; return r.value; };

const cfgOf = (r: RuleValues) => ({
  cols: num(r, "cols"), rows: num(r, "rows"), ladders: num(r, "ladders"), snakes: num(r, "snakes"), minJump: num(r, "minJump"), specials: num(r, "specials"),
  dice: num(r, "dice"), sides: num(r, "sides"), finish: (pick(r, "finish") === "bounce" ? "bounce" : pick(r, "finish") === "any" ? "any" : "exact") as "exact" | "bounce" | "any",
});

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): SState => {
  const c = cfgOf(rules), size = c.cols * c.rows;
  const boardCode = num(rules, "boardSeed") || ((seed >>> 0) % 99999) + 1;
  const s: SState = {
    rules, n: seats.length, names: seats.map(x => x.name), size, jumps: {}, special: {}, warp: {}, skip: seats.map(() => 0), pending: null, report: null as never, boardCode,
    pos: seats.map(() => 0), turn: 0, finished: [], bonusRun: 0, last: null, rolls: [], phase: "play", rng: seed >>> 0,
  };
  if (flag(rules, "fixed") && size === 100) {
    s.jumps = { ...CLASSIC };
    // classic keeps its famous layout; special squares are still placed on free squares when asked for
    const extra = c.specials ? generateBoard(boardCode, { ...c, ladders: 0, snakes: 0 }) : null;
    if (extra) for (const [q, k] of Object.entries(extra.special)) if (!s.jumps[Number(q)] && !Object.values(s.jumps).includes(Number(q))) { s.special[Number(q)] = k; if (extra.warp[Number(q)]) s.warp[Number(q)] = extra.warp[Number(q)]; }
    for (const q of Object.keys(s.warp)) if (s.special[s.warp[Number(q)]] !== "warp") { delete s.special[Number(q)]; delete s.warp[Number(q)]; }
    s.report = reportOf(s.jumps, c, s.special, s.warp, boardCode);
  } else {
    const b = generateBoard(boardCode, c);
    s.jumps = b.jumps; s.special = b.special; s.warp = b.warp; s.report = b.report;
  }
  s.turn = Math.floor(rnd(s) * s.n);
  return s;
};

/** The squares a token passes over, one at a time, for a roll: forward to the end, then back if the finish bounces. */
export const walkOf = (from: number, total: number, land: number, size: number): number[] => {
  if (land === from) return [];
  const out: number[] = [];
  const top = Math.min(from + total, size);
  for (let q = from + 1; q <= top; q++) out.push(q);
  for (let q = top - 1; q >= land; q--) out.push(q);
  return out;
};

const sidesMax = (r: RuleValues) => num(r, "sides");

/** Where a token ends up for a move of `total`, with no randomness: used to play the move and to preview it. */
export const landing = (s: Pick<SState, "rules" | "size" | "jumps" | "special" | "warp">, from: number, total: number, canEnter = true): Landing => {
  const r = s.rules;
  const none: Landing = { to: from, land: from, jump: null, slides: [], special: null, bonus: false };
  if (!canEnter) return none;
  let to = from + total;
  if (to > s.size) {
    const mode = pick(r, "finish");
    // with several dice an exact finish can be impossible (one square short needs a roll of 1): then any roll finishes
    to = mode === "exact" ? (from + num(r, "dice") > s.size ? s.size : from) : mode === "bounce" ? s.size - (to - s.size) : s.size;
  }
  const land = to;
  let jump: number | null = null;
  const slides: [number, number, string?][] = [];
  let special: Special | null = null, bonus = false;
  if (to !== from && s.jumps[to] !== undefined) {
    let guard = 0;
    do { jump = to; slides.push([to, s.jumps[to]]); to = s.jumps[to]; } while (flag(r, "chain") && s.jumps[to] !== undefined && guard++ < 10);
  } else if (to !== from && s.special[to]) {
    special = s.special[to];
    if (special === "warp" && s.warp[to] !== undefined) { slides.push([to, s.warp[to], "warp"]); to = s.warp[to]; }
    else if (special === "bonus") bonus = true;
  }
  return { to, land, jump, slides, special, bonus };
};

/** Plays a move of `total` for a player, once the dice are known (or chosen). */
const move = (s: SState, by: number, dice: number[], total: number, use: string | undefined, events: GameEvent[]): void => {
  const r = s.rules;
  const from = s.pos[by];
  const enter = pick(r, "enter");
  const canEnter = from > 0 || enter === "any" || (enter === "max" ? dice.some(d => d === sidesMax(r)) : dice.some(d => d === 1));
  const L = landing(s, from, total, canEnter);
  const to = L.to;
  const bumped: number[] = [];
  if (flag(r, "bump") && canEnter && to > 0 && to < s.size && s.special[to] !== "safe") {
    for (let q = 0; q < s.n; q++) if (q !== by && s.pos[q] === to && !s.finished.includes(q)) { bumped.push(q); s.pos[q] = pick(r, "bumpTo") === "start" ? 0 : Math.max(0, to - total); }
  }
  if (L.special === "skip" && to !== s.size) s.skip[by] = 1;
  s.pos[by] = to;
  s.rolls.push(total);
  s.last = { p: by, dice, from, to, jump: L.jump, bumped, use };
  events.push({ type: "roll", p: by, dice, use: use ?? null, from, land: L.land, slides: L.slides, to, jump: L.jump, bumped, special: L.special });
  if (L.special === "skip" && to !== s.size) events.push({ type: "trap", p: by });
  if (to === s.size) { s.finished.push(by); events.push({ type: "finish", p: by, place: s.finished.length }); }

  const bonusMode = pick(r, "bonus");
  const isMax = dice.some(d => d === sidesMax(r));
  const isDouble = dice.length > 1 && dice.every(d => d === dice[0]);
  const bonus = to !== s.size && canEnter && (L.bonus || (bonusMode === "max" || bonusMode === "both") && isMax || (bonusMode === "doubles" || bonusMode === "both") && isDouble);
  const needed = Math.min(num(r, "winners"), s.n);
  const done = s.finished.length >= needed || s.finished.length >= s.n - 1;
  if (bonus && s.bonusRun + 1 < num(r, "bonusLimit") && !done) { s.bonusRun += 1; events.push({ type: "again", p: by }); return; }
  s.bonusRun = 0;
  if (done) { s.phase = "over"; return; }
  let t = s.turn;
  for (let guard = 0; guard < s.n * 2; guard++) {
    for (let i = 0; i < s.n; i++) { t = (t + 1) % s.n; if (!s.finished.includes(t)) break; }
    if (s.skip[t] > 0 && !s.finished.includes(t)) { s.skip[t] -= 1; events.push({ type: "skipped", p: t }); continue; }
    break;
  }
  s.turn = t;
};

const choiceTotal = (dice: number[], use: "a" | "b" | "sum") => (use === "a" ? dice[0] : use === "b" ? dice[1] : dice[0] + dice[1]);

const apply = (state: SState, a: SAction, by: number): { state: SState; events: GameEvent[] } | null => {
  if (state.phase !== "play" || by !== state.turn) return null;
  const s: SState = { ...state, pos: state.pos.slice(), finished: state.finished.slice(), rolls: state.rolls.slice(), skip: state.skip.slice() };
  const r = s.rules;
  const events: GameEvent[] = [];
  if (a.type === "use") {
    if (!s.pending || (a.use !== "a" && a.use !== "b" && a.use !== "sum")) return null;
    const dice = s.pending;
    s.pending = null;
    move(s, by, dice, choiceTotal(dice, a.use), a.use, events);
    return { state: s, events };
  }
  if (a.type !== "roll" || s.pending) return null;
  const dice = Array.from({ length: num(r, "dice") }, () => 1 + Math.floor(rnd(s) * sidesMax(r)));
  if (flag(r, "dieChoice") && dice.length === 2) {
    s.pending = dice;
    events.push({ type: "dice", p: by, dice });
    return { state: s, events };
  }
  move(s, by, dice, dice.reduce((x, y) => x + y, 0), undefined, events);
  return { state: s, events };
};

export const squareXY = (sq: number, cols: number, rows: number): { x: number; y: number } => {
  const i = sq - 1, row = Math.floor(i / cols), col = i % cols;
  return { x: row % 2 === 0 ? col : cols - 1 - col, y: rows - 1 - row };
};

export const snakes: GameDriver<SState, SAction, SView> = {
  id: "snakes", name: "Snakes and Ladders", minPlayers: 2, maxPlayers: 6, schema: SCHEMA, hidden: false, luck: true, create, apply,
  actors: s => (s.phase === "over" ? [] : [s.turn]),
  over: s => s.phase === "over",
  scores: s => s.pos,
  winners: s => (s.phase === "over" ? s.finished.slice(0, 1) : []),
  view: s => ({ rules: s.rules, special: s.special, warp: s.warp, skip: s.skip, pending: s.pending, report: s.report, boardCode: s.boardCode, choices: s.pending ? Object.fromEntries(((["a", "b", "sum"] as const).map(u => [u, landing(s, s.pos[s.turn], choiceTotal(s.pending!, u), s.pos[s.turn] > 0 || pick(s.rules, "enter") === "any" || (pick(s.rules, "enter") === "max" ? s.pending!.some(d => d === sidesMax(s.rules)) : s.pending!.some(d => d === 1)))]))) : null, size: s.size, cols: num(s.rules, "cols"), rows: num(s.rules, "rows"), jumps: s.jumps, pos: s.pos, turn: s.turn, finished: s.finished, last: s.last, bonusRun: s.bonusRun, phase: s.phase }),
  bot: (s, p, level: BotLevel): SAction | null => {
    if (s.phase !== "play" || s.turn !== p) return null;
    if (!s.pending) return { type: "roll" };
    // pick the move that lands best: up a ladder, away from a snake, nearer the end
    const here = s.pos[p], canEnter = here > 0 || pick(s.rules, "enter") === "any" || (pick(s.rules, "enter") === "max" ? s.pending.some(d => d === sidesMax(s.rules)) : s.pending.some(d => d === 1));
    const opts = (["a", "b", "sum"] as const).map(u => ({ u, l: landing(s, here, choiceTotal(s.pending!, u), canEnter) }));
    const value = (l: Landing) => l.to + (l.special === "skip" ? -12 : 0) + (l.bonus ? 6 : 0) + (l.to === s.size ? 1000 : 0) - (l.to === here ? 8 : 0);
    if (level === "easy") return { type: "use", use: opts[Math.floor(nextRandom((s.rng + s.rolls.length) >>> 0).value * 3)].u };
    return { type: "use", use: opts.reduce((m, o) => (value(o.l) > value(m.l) ? o : m)).u };
  },
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as { type?: unknown; use?: unknown };
    if (o.type === "roll") return { type: "roll" };
    if (o.type === "use" && (o.use === "a" || o.use === "b" || o.use === "sum")) return { type: "use", use: o.use };
    return null;
  },
  describe: (e, names) => {
    const who = e.p !== undefined ? names[e.p] : "";
    switch (e.type) {
      case "roll": {
        const j = e.jump !== null && e.jump !== undefined ? ((e.to as number) > (e.jump as number) ? " and climbed a ladder" : " and slid down a snake") : "";
        const b = (e.bumped as number[]).length ? `, bumping ${(e.bumped as number[]).map(i => names[i]).join(", ")}` : "";
        return `${who} rolled ${(e.dice as number[]).join("+")} to square ${e.to}${j}${b}`;
      }
      case "dice": return `${who} rolled ${(e.dice as number[]).join(" and ")}`;
      case "trap": return `${who} will miss the next turn`;
      case "skipped": return `${who} misses this turn`;
      case "again": return `${who} rolls again`;
      case "finish": return `${who} finished in place ${e.place}`;
      default: return null;
    }
  },
  prompt: (s, v) => (s.phase === "over" ? "Game over" : s.turn === v ? (s.pending ? "Choose how to move" : "Your turn: roll the dice") : s.pending ? `${s.names[s.turn]} is choosing` : `${s.names[s.turn]} is rolling`),
};
