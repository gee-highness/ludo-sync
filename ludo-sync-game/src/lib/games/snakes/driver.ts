import { flag, num, pick, type RuleSchema, type RuleValues } from "../../platform/rules";
import { nextRandom } from "../../ludo/rng";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";

export const SCHEMA: RuleSchema = {
  rules: [
    { key: "cols", kind: "number", label: "Squares across", def: 10, min: 4, max: 12, group: "Board" },
    { key: "rows", kind: "number", label: "Squares down", def: 10, min: 4, max: 12, group: "Board" },
    { key: "ladders", kind: "number", label: "Ladders", def: 8, min: 0, max: 20, group: "Board" },
    { key: "snakes", kind: "number", label: "Snakes", def: 8, min: 0, max: 20, group: "Board" },
    { key: "minJump", kind: "number", label: "Shortest snake or ladder (squares)", def: 8, min: 2, max: 40, group: "Board" },
    { key: "fixed", kind: "bool", label: "Classic fixed board", hint: "Use the well-known 100-square layout (needs a 10 by 10 board)", def: false, group: "Board" },

    { key: "dice", kind: "number", label: "Dice", def: 1, min: 1, max: 3, group: "Dice" },
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
  last: { p: number; dice: number[]; from: number; to: number; jump: number | null; bumped: number[] } | null;
  rolls: number[];
  phase: "play" | "over";
  rng: number;
}
export type SAction = { type: "roll" };
export interface SView { rules: RuleValues; size: number; cols: number; rows: number; jumps: Record<number, number>; pos: number[]; turn: number; finished: number[]; last: SState["last"]; bonusRun: number; phase: SState["phase"] }

const CLASSIC: Record<number, number> = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100, 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

const rnd = (s: { rng: number }) => { const r = nextRandom(s.rng); s.rng = r.state; return r.value; };

/** A random, valid layout: no square used twice, nothing on the first or last square, every jump at least `minJump` long. */
const makeJumps = (s: { rng: number }, size: number, ladders: number, snakes: number, minJump: number, cols: number): Record<number, number> => {
  const jumps: Record<number, number> = {};
  const used = new Set<number>([1, size]);
  const place = (up: boolean) => {
    for (let tries = 0; tries < 200; tries++) {
      const a = 2 + Math.floor(rnd(s) * (size - 2)), b = 2 + Math.floor(rnd(s) * (size - 2));
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (hi - lo < minJump || used.has(lo) || used.has(hi) || Math.ceil(lo / cols) === Math.ceil(hi / cols)) continue;
      used.add(lo); used.add(hi);
      jumps[up ? lo : hi] = up ? hi : lo;
      return;
    }
  };
  for (let i = 0; i < ladders; i++) place(true);
  for (let i = 0; i < snakes; i++) place(false);
  return jumps;
};

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): SState => {
  const cols = num(rules, "cols"), rows = num(rules, "rows"), size = cols * rows;
  const s: SState = { rules, n: seats.length, names: seats.map(x => x.name), size, jumps: {}, pos: seats.map(() => 0), turn: 0, finished: [], bonusRun: 0, last: null, rolls: [], phase: "play", rng: seed >>> 0 };
  s.jumps = flag(rules, "fixed") && size === 100 ? { ...CLASSIC } : makeJumps(s, size, num(rules, "ladders"), num(rules, "snakes"), num(rules, "minJump"), cols);
  s.turn = Math.floor(rnd(s) * s.n);
  return s;
};

const sidesMax = (r: RuleValues) => num(r, "sides");

const apply = (state: SState, a: SAction, by: number): { state: SState; events: GameEvent[] } | null => {
  if (state.phase !== "play" || a.type !== "roll" || by !== state.turn) return null;
  const s: SState = { ...state, pos: state.pos.slice(), finished: state.finished.slice(), rolls: state.rolls.slice(), jumps: state.jumps };
  const r = s.rules;
  const events: GameEvent[] = [];
  const dice = Array.from({ length: num(r, "dice") }, () => 1 + Math.floor(rnd(s) * sidesMax(r)));
  const total = dice.reduce((x, y) => x + y, 0);
  const from = s.pos[by];
  let to = from;
  const enter = pick(r, "enter");
  const canEnter = from > 0 || enter === "any" || (enter === "max" ? dice.some(d => d === sidesMax(r)) : dice.some(d => d === 1));
  let jump: number | null = null;
  const bumped: number[] = [];
  if (canEnter) {
    to = from + total;
    if (to > s.size) {
      const mode = pick(r, "finish");
      to = mode === "exact" ? from : mode === "bounce" ? s.size - (to - s.size) : s.size;
    }
    if (to !== from && s.jumps[to] !== undefined) {
      let guard = 0;
      do { jump = to; to = s.jumps[to]; } while (flag(r, "chain") && s.jumps[to] !== undefined && guard++ < 10);
    }
    if (flag(r, "bump") && to > 0 && to < s.size) {
      for (let q = 0; q < s.n; q++) if (q !== by && s.pos[q] === to && !s.finished.includes(q)) { bumped.push(q); s.pos[q] = pick(r, "bumpTo") === "start" ? 0 : Math.max(0, to - total); }
    }
  }
  s.pos[by] = to;
  s.rolls.push(total);
  s.last = { p: by, dice, from, to, jump, bumped };
  events.push({ type: "roll", p: by, dice, from, to, jump, bumped });
  if (to === s.size) { s.finished.push(by); events.push({ type: "finish", p: by, place: s.finished.length }); }

  const bonusMode = pick(r, "bonus");
  const isMax = dice.some(d => d === sidesMax(r));
  const isDouble = dice.length > 1 && dice.every(d => d === dice[0]);
  const bonus = to !== s.size && canEnter && ((bonusMode === "max" || bonusMode === "both") && isMax || (bonusMode === "doubles" || bonusMode === "both") && isDouble);
  const needed = Math.min(num(r, "winners"), s.n);
  const done = s.finished.length >= needed || s.finished.length >= s.n - 1;
  if (bonus && s.bonusRun + 1 < num(r, "bonusLimit") && !done) { s.bonusRun += 1; events.push({ type: "again", p: by }); return { state: s, events }; }
  s.bonusRun = 0;
  if (done) { s.phase = "over"; return { state: s, events }; }
  let t = s.turn;
  for (let i = 0; i < s.n; i++) { t = (t + 1) % s.n; if (!s.finished.includes(t)) break; }
  s.turn = t;
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
  view: s => ({ rules: s.rules, size: s.size, cols: num(s.rules, "cols"), rows: num(s.rules, "rows"), jumps: s.jumps, pos: s.pos, turn: s.turn, finished: s.finished, last: s.last, bonusRun: s.bonusRun, phase: s.phase }),
  bot: (s, p, _l: BotLevel) => (s.phase === "play" && s.turn === p ? { type: "roll" } : null),
  parseAction: raw => (raw && typeof raw === "object" && (raw as { type?: unknown }).type === "roll" ? { type: "roll" } : null),
  describe: (e, names) => {
    const who = e.p !== undefined ? names[e.p] : "";
    switch (e.type) {
      case "roll": {
        const j = e.jump !== null && e.jump !== undefined ? ((e.to as number) > (e.jump as number) ? " and climbed a ladder" : " and slid down a snake") : "";
        const b = (e.bumped as number[]).length ? `, bumping ${(e.bumped as number[]).map(i => names[i]).join(", ")}` : "";
        return `${who} rolled ${(e.dice as number[]).join("+")} to square ${e.to}${j}${b}`;
      }
      case "again": return `${who} rolls again`;
      case "finish": return `${who} finished in place ${e.place}`;
      default: return null;
    }
  },
  prompt: (s, v) => (s.phase === "over" ? "Game over" : s.turn === v ? "Your turn: roll the dice" : `${s.names[s.turn]} is rolling`),
};
