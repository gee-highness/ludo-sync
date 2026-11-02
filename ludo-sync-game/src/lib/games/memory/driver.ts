import { flag, num, pick, type RuleSchema, type RuleValues } from "../../platform/rules";
import { peekChance, shuffled } from "../../platform/rng";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";

export const SCHEMA: RuleSchema = {
  rules: [
    { key: "sets", kind: "number", label: "Sets of cards to find", def: 10, min: 3, max: 32, group: "Cards" },
    { key: "matchSize", kind: "number", label: "Cards in a match", hint: "2 for pairs, 3 for triples, 4 for quads", def: 2, min: 2, max: 4, group: "Cards" },
    { key: "theme", kind: "choice", label: "Pictures", def: "animals", choices: [{ value: "animals", label: "Animals" }, { value: "food", label: "Food" }, { value: "nature", label: "Nature" }, { value: "travel", label: "Travel" }, { value: "numbers", label: "Numbers" }, { value: "shapes", label: "Colours and shapes" }], group: "Cards" },
    { key: "peek", kind: "bool", label: "Peek at all the cards first", hint: "Everyone sees every card for a few seconds before play starts", def: false, group: "Start" },
    { key: "again", kind: "bool", label: "Another go after a match", def: true, group: "Turns" },
    { key: "ptsMatch", kind: "number", label: "Points for a match", def: 1, min: 1, max: 10, group: "Scoring" },
    { key: "streakBonus", kind: "number", label: "Bonus for each match in a row", hint: "Added for every extra match in the same turn", def: 0, min: 0, max: 5, zeroLabel: "None", group: "Scoring" },
    { key: "missPenalty", kind: "number", label: "Points lost for a miss", def: 0, min: 0, max: 3, zeroLabel: "None", group: "Scoring" },
  ],
  presets: [
    { id: "classic", name: "Classic pairs", blurb: "10 pairs, another go after a match", values: {} },
    { id: "quick", name: "Quick", blurb: "6 pairs", values: { sets: 6 } },
    { id: "big", name: "Big board", blurb: "24 pairs", values: { sets: 24 } },
    { id: "triples", name: "Triples", blurb: "Find three of a kind", values: { matchSize: 3, sets: 8 } },
    { id: "peek", name: "Peek first", blurb: "See every card at the start", values: { peek: true } },
    { id: "risky", name: "Risky", blurb: "Streak bonuses, penalties for misses", values: { streakBonus: 1, missPenalty: 1 } },
  ],
};

export interface MState {
  rules: RuleValues;
  n: number;
  names: string[];
  /** the picture of each position */
  cards: number[];
  matched: boolean[];
  /** which positions are face up but not matched yet, in the order flipped */
  flipped: number[];
  /** positions that have ever been turned over: what a player could have remembered */
  seen: boolean[];
  turn: number;
  scores: number[];
  sets: number[];
  streak: number;
  phase: "peek" | "play" | "mismatch" | "over";
  rng: number;
}
export type MAction = { type: "flip"; pos: number } | { type: "continue" } | { type: "start" };
export interface MView { rules: RuleValues; faces: number[]; matched: boolean[]; flipped: number[]; turn: number; scores: number[]; sets: number[]; phase: MState["phase"]; found: number; total: number; streak: number }

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): MState => {
  const k = num(rules, "matchSize"), sets = num(rules, "sets");
  const symbols = Array.from({ length: sets }, (_, i) => i);
  const sh = shuffled(symbols.flatMap(s => Array<number>(k).fill(s)), seed >>> 0);
  const total = sets * k;
  return {
    rules, n: seats.length, names: seats.map(s => s.name), cards: sh.value, matched: Array<boolean>(total).fill(false), flipped: [], seen: Array<boolean>(total).fill(false),
    turn: Math.floor(((seed >>> 0) % 997) % seats.length), scores: seats.map(() => 0), sets: seats.map(() => 0), streak: 0, phase: flag(rules, "peek") ? "peek" : "play", rng: sh.rng,
  };
};

const next = (s: MState) => { s.turn = (s.turn + 1) % s.n; s.streak = 0; };

const apply = (state: MState, a: MAction, by: number): { state: MState; events: GameEvent[] } | null => {
  const s: MState = { ...state, matched: state.matched.slice(), flipped: state.flipped.slice(), seen: state.seen.slice(), scores: state.scores.slice(), sets: state.sets.slice() };
  const events: GameEvent[] = [];
  const r = s.rules;
  if (s.phase === "over") return null;
  if (a.type === "start") { if (s.phase !== "peek") return null; s.phase = "play"; events.push({ type: "begin" }); return { state: s, events }; }
  if (a.type === "continue") {
    if (s.phase !== "mismatch") return null;
    s.flipped = []; next(s); s.phase = "play";
    events.push({ type: "hide" });
    return { state: s, events };
  }
  if (s.phase !== "play" || by !== s.turn) return null;
  if (!Number.isInteger(a.pos) || a.pos < 0 || a.pos >= s.cards.length || s.matched[a.pos] || s.flipped.includes(a.pos)) return null;
  s.flipped.push(a.pos);
  s.seen[a.pos] = true;
  events.push({ type: "flip", p: by, pos: a.pos, symbol: s.cards[a.pos] });
  const k = num(r, "matchSize");
  if (s.flipped.length < k) {
    // a card that cannot match the first one ends the attempt early: no point turning more
    if (s.cards[s.flipped[0]] !== s.cards[a.pos]) { s.phase = "mismatch"; s.scores[by] = Math.max(0, s.scores[by] - num(r, "missPenalty")); events.push({ type: "miss", p: by }); }
    return { state: s, events };
  }
  const symbol = s.cards[s.flipped[0]];
  if (s.flipped.every(f => s.cards[f] === symbol)) {
    for (const f of s.flipped) s.matched[f] = true;
    s.streak += 1;
    const pts = num(r, "ptsMatch") + (s.streak > 1 ? num(r, "streakBonus") * (s.streak - 1) : 0);
    s.scores[by] += pts; s.sets[by] += 1;
    events.push({ type: "match", p: by, symbol, points: pts });
    s.flipped = [];
    if (s.matched.every(Boolean)) { s.phase = "over"; events.push({ type: "done" }); }
    else if (!flag(r, "again")) next(s);
  } else { s.phase = "mismatch"; s.scores[by] = Math.max(0, s.scores[by] - num(r, "missPenalty")); events.push({ type: "miss", p: by }); }
  return { state: s, events };
};

/** What a bot remembers: each card it has seen is recalled with a chance set by its level. Which cards are remembered stays the same for a given position of the game, so thinking never changes the answer. */
const recall = (s: MState, level: BotLevel, pos: number): boolean => s.seen[pos] && !s.matched[pos] && peekChance(s.rng, level === "easy" ? 0.25 : level === "normal" ? 0.6 : 0.95, pos * 31 + s.scores.reduce((a, b) => a + b, 0));

const bot = (s: MState, p: number, level: BotLevel): MAction | null => {
  if (s.phase === "mismatch") return { type: "continue" };
  if (s.phase === "peek") return { type: "start" };
  if (s.phase !== "play" || s.turn !== p) return null;
  const k = num(s.rules, "matchSize");
  const free = s.cards.map((_, i) => i).filter(i => !s.matched[i] && !s.flipped.includes(i));
  const remembered = free.filter(i => recall(s, level, i));
  const bySymbol = new Map<number, number[]>();
  for (const i of remembered) bySymbol.set(s.cards[i], [...(bySymbol.get(s.cards[i]) ?? []), i]);
  if (s.flipped.length > 0) {
    const symbol = s.cards[s.flipped[0]];
    const known = (bySymbol.get(symbol) ?? []).filter(i => !s.flipped.includes(i));
    if (known.length) return { type: "flip", pos: known[0] };
  } else {
    for (const list of bySymbol.values()) if (list.length >= k) return { type: "flip", pos: list[0] };
    // a symbol we know of but whose set is incomplete: start with one we have never matched so we learn more
  }
  const fresh = free.filter(i => !s.seen[i]);
  const pool = fresh.length ? fresh : free;
  const idx = Math.floor((((s.rng ^ (pool.length * 2654435761)) >>> 0) % 1000003) % pool.length);
  return { type: "flip", pos: pool[idx] };
};

export const memory: GameDriver<MState, MAction, MView> = {
  id: "memory", name: "Memory Match", minPlayers: 1, maxPlayers: 6, schema: SCHEMA, hidden: false, luck: true, create, apply,
  actors: s => (s.phase === "over" ? [] : s.phase === "play" ? [s.turn] : s.names.map((_, i) => i)),
  over: s => s.phase === "over",
  scores: s => s.scores,
  winners: s => { if (s.phase !== "over") return []; const m = Math.max(...s.scores); return s.scores.flatMap((x, i) => (x === m ? [i] : [])); },
  view: s => ({
    rules: s.rules, faces: s.cards.map((c, i) => (s.phase === "peek" || s.matched[i] || s.flipped.includes(i) || s.phase === "over" ? c : -1)), matched: s.matched, flipped: s.flipped, turn: s.turn, scores: s.scores, sets: s.sets, phase: s.phase,
    found: s.matched.filter(Boolean).length / num(s.rules, "matchSize"), total: num(s.rules, "sets"), streak: s.streak,
  }),
  bot,
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as { type?: unknown; pos?: unknown };
    if (o.type === "continue" || o.type === "start") return { type: o.type };
    return o.type === "flip" && Number.isInteger(o.pos) ? { type: "flip", pos: o.pos as number } : null;
  },
  describe: (e, names) => {
    const who = e.p !== undefined ? names[e.p] : "";
    switch (e.type) {
      case "match": return `${who} found a match (+${e.points})`;
      case "miss": return `${who} missed`;
      case "done": return "All matches found";
      default: return null;
    }
  },
  prompt: (s, v) => (s.phase === "over" ? "All found!" : s.phase === "peek" ? "Look carefully…" : s.phase === "mismatch" ? "No match" : s.turn === v ? "Your turn: flip a card" : `${s.names[s.turn]} is choosing`),
};

export { pick };
