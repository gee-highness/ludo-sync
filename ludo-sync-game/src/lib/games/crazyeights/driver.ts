import { flag, num, pick, type RuleSchema, type RuleValues } from "../../platform/rules";
import { peekChance, peekPick, shuffled } from "../../platform/rng";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";

const POWERS = [{ value: "none", label: "Nothing" }, { value: "skip", label: "Skip the next player" }, { value: "reverse", label: "Reverse direction" }, { value: "draw2", label: "Next player draws 2" }, { value: "wild", label: "Wild: choose the suit" }, { value: "again", label: "Play again" }];

export const SCHEMA: RuleSchema = {
  rules: [
    { key: "decks", kind: "number", label: "Packs of cards", def: 1, min: 1, max: 3, group: "Cards" },
    { key: "handSize", kind: "number", label: "Cards each", def: 5, min: 3, max: 12, group: "Cards" },
    { key: "p8", kind: "choice", label: "Eights", def: "wild", choices: POWERS, group: "Powers (what each rank does)" },
    { key: "pA", kind: "choice", label: "Aces", def: "none", choices: POWERS, group: "Powers (what each rank does)" },
    { key: "p2", kind: "choice", label: "Twos", def: "none", choices: POWERS, group: "Powers (what each rank does)" },
    { key: "p7", kind: "choice", label: "Sevens", def: "none", choices: POWERS, group: "Powers (what each rank does)" },
    { key: "pJ", kind: "choice", label: "Jacks", def: "none", choices: POWERS, group: "Powers (what each rank does)" },
    { key: "pQ", kind: "choice", label: "Queens", def: "none", choices: POWERS, group: "Powers (what each rank does)" },
    { key: "pK", kind: "choice", label: "Kings", def: "none", choices: POWERS, group: "Powers (what each rank does)" },
    { key: "stack", kind: "bool", label: "Stack draw-2 cards", hint: "Answer a draw-2 with another instead of drawing", def: false, group: "Turns" },
    { key: "multi", kind: "bool", label: "Play several cards of one rank at once", def: false, group: "Turns" },
    { key: "draw", kind: "choice", label: "When you cannot play", def: "one", choices: [{ value: "one", label: "Draw one card, then pass if it does not fit" }, { value: "until", label: "Draw until you can play" }, { value: "three", label: "Draw up to three, then pass" }], group: "Turns" },
    { key: "mustPlay", kind: "bool", label: "Cannot draw if you can play", def: true, group: "Turns" },
    { key: "jumpIn", kind: "bool", label: "Jump in with an identical card", def: false, group: "Turns" },
    { key: "endOnPower", kind: "bool", label: "May go out on a power card", def: true, group: "Turns" },
    { key: "target", kind: "number", label: "Match target (0 = one round)", def: 100, min: 0, max: 1000, step: 10, zeroLabel: "One round", group: "Scoring" },
    { key: "eightValue", kind: "number", label: "An eight is worth", def: 50, min: 0, max: 100, step: 5, group: "Scoring" },
    { key: "faceValue", kind: "number", label: "Jack, Queen, King are worth", def: 10, min: 0, max: 50, group: "Scoring" },
  ],
  presets: [
    { id: "classic", name: "Classic", blurb: "Eights are wild, to 100", values: {} },
    { id: "action", name: "Action", blurb: "2 draws two, Ace reverses, Queen skips, Jack skips", values: { p2: "draw2", pA: "reverse", pQ: "skip", pJ: "skip" } },
    { id: "stacking", name: "Stacking", blurb: "Draw twos stack", values: { p2: "draw2", stack: true } },
    { id: "multi", name: "Multi-play", blurb: "Play pairs and triples together", values: { multi: true } },
    { id: "quick", name: "Quick", blurb: "One round", values: { target: 0 } },
    { id: "chaos", name: "Chaos", blurb: "Everything does something", values: { p2: "draw2", pA: "reverse", p7: "again", pJ: "skip", pQ: "skip", pK: "wild", stack: true, multi: true, jumpIn: true } },
  ],
};

type Power = "none" | "skip" | "reverse" | "draw2" | "wild" | "again";
const KEYS: Record<number, string> = { 8: "p8", 1: "pA", 2: "p2", 7: "p7", 11: "pJ", 12: "pQ", 13: "pK" };

export interface EState {
  rules: RuleValues;
  n: number;
  names: string[];
  hands: number[][];
  deck: number[];
  discard: number[];
  /** the suit that must be matched (changes with a wild) */
  suit: number;
  dir: 1 | -1;
  turn: number;
  pending: number;
  /** cards drawn so far this turn */
  drew: number;
  /** a card that was just drawn and may be played (when keeping it is allowed) */
  scores: number[];
  round: number;
  dealer: number;
  roundWinner: number;
  roundPoints: number;
  phase: "play" | "roundOver" | "over";
  rng: number;
}
export type EAction = { type: "play"; cards: number[]; suit?: number } | { type: "draw" } | { type: "pass" } | { type: "next" };
export interface EView { rules: RuleValues; me: number | null; hand: number[]; handCounts: number[]; top: number | null; suit: number; dir: 1 | -1; turn: number; pending: number; drew: number; playable: number[]; canDraw: boolean; canPass: boolean; jumpable: number[]; scores: number[]; phase: EState["phase"]; roundWinner: number; roundPoints: number; deckCount: number; round: number; reveal: number[][] | null }

export const rankOf = (c: number) => (c % 13) + 1;
export const suitOf = (c: number) => Math.floor((c % 52) / 13);

const powerOf = (s: EState, c: number): Power => { const k = KEYS[rankOf(c)]; return k ? (pick(s.rules, k) as Power) : "none"; };
const top = (s: EState): number | null => (s.discard.length ? s.discard[s.discard.length - 1] : null);

const pointsOf = (s: EState, c: number): number => { const r = rankOf(c); return r === 8 ? num(s.rules, "eightValue") : r >= 11 ? num(s.rules, "faceValue") : r === 1 ? 1 : r; };

const adv = (s: EState, k = 1) => { s.turn = (((s.turn + s.dir * k) % s.n) + s.n) % s.n; s.drew = 0; };
const ensure = (s: EState): boolean => {
  if (s.deck.length) return true;
  if (s.discard.length <= 1) return false;
  const t = s.discard.pop()!;
  const sh = shuffled(s.discard, s.rng);
  s.deck = sh.value; s.rng = sh.rng; s.discard = [t];
  return true;
};
const drawN = (s: EState, p: number, k: number): number => { let got = 0; for (let i = 0; i < k && ensure(s); i++) { s.hands[p].push(s.deck.pop()!); got++; } return got; };

const startRound = (s: EState) => {
  const total = 52 * num(s.rules, "decks");
  const sh = shuffled(Array.from({ length: total }, (_, i) => i), s.rng);
  s.deck = sh.value; s.rng = sh.rng;
  s.hands = s.names.map(() => []); s.discard = []; s.dir = 1; s.pending = 0; s.drew = 0; s.phase = "play"; s.roundWinner = -1; s.roundPoints = 0;
  for (let r = 0; r < num(s.rules, "handSize"); r++) for (let p = 0; p < s.n; p++) if (s.deck.length) s.hands[p].push(s.deck.pop()!);
  // the first card is never a power card that would need a choice
  for (let g = 0; g < 100 && s.deck.length; g++) { const c = s.deck.pop()!; if (powerOf(s, c) !== "none") { s.deck.unshift(c); continue; } s.discard.push(c); break; }
  if (!s.discard.length && s.deck.length) s.discard.push(s.deck.pop()!);
  s.suit = s.discard.length ? suitOf(s.discard[0]) : 0;
  s.turn = (s.dealer + 1) % s.n;
};

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): EState => {
  const s: EState = { rules, n: seats.length, names: seats.map(x => x.name), hands: [], deck: [], discard: [], suit: 0, dir: 1, turn: 0, pending: 0, drew: 0, scores: seats.map(() => 0), round: 1, dealer: seed % seats.length, roundWinner: -1, roundPoints: 0, phase: "play", rng: seed >>> 0 };
  startRound(s);
  return s;
};

const matches = (s: EState, c: number): boolean => {
  const t = top(s);
  if (t === null) return true;
  if (powerOf(s, c) === "wild") return true;
  return suitOf(c) === s.suit || rankOf(c) === rankOf(t);
};

export const canPlay = (s: EState, p: number, c: number): boolean => {
  if (!s.hands[p].includes(c)) return false;
  if (s.hands[p].length === 1 && !flag(s.rules, "endOnPower") && powerOf(s, c) !== "none") return false;
  if (s.pending > 0) return flag(s.rules, "stack") && powerOf(s, c) === "draw2";
  return matches(s, c);
};
export const playableIds = (s: EState, p: number): number[] => s.hands[p].filter(c => canPlay(s, p, c));

const jumpIds = (s: EState, p: number): number[] => {
  const t = top(s);
  if (!flag(s.rules, "jumpIn") || t === null || p === s.turn || s.pending > 0 || s.phase !== "play") return [];
  return s.hands[p].filter(c => c % 52 === t % 52);
};

const clone = (s: EState): EState => ({ ...s, hands: s.hands.map(h => h.slice()), deck: s.deck.slice(), discard: s.discard.slice(), scores: s.scores.slice() });

const canDraw = (s: EState, p: number): boolean => {
  if (s.pending > 0) return true;
  if (flag(s.rules, "mustPlay") && playableIds(s, p).length > 0) return false;
  const mode = pick(s.rules, "draw");
  return mode === "until" ? true : mode === "three" ? s.drew < 3 : s.drew < 1;
};

const apply = (state: EState, a: EAction, by: number): { state: EState; events: GameEvent[] } | null => {
  const s = clone(state);
  const events: GameEvent[] = [];
  if (s.phase === "over") return null;
  if (a.type === "next") {
    if (s.phase !== "roundOver") return null;
    s.round += 1; s.dealer = (s.dealer + 1) % s.n; startRound(s);
    events.push({ type: "round", round: s.round });
    return { state: s, events };
  }
  if (s.phase !== "play") return null;
  const jumping = a.type === "play" && by !== s.turn;
  if (jumping) { if (a.cards.length !== 1 || !jumpIds(s, by).includes(a.cards[0])) return null; }
  else if (by !== s.turn) return null;

  if (a.type === "draw") {
    if (!canDraw(s, by)) return null;
    if (s.pending > 0) { const k = drawN(s, by, s.pending); s.pending = 0; events.push({ type: "drawPenalty", p: by, cards: k }); adv(s); return { state: s, events }; }
    const mode = pick(s.rules, "draw");
    let got = 0;
    do { if (drawN(s, by, 1) === 0) break; got++; s.drew += 1; } while (mode === "until" && !playableIds(s, by).length && got < 60);
    events.push({ type: "draw", p: by });
    // nothing fits and nothing more may be drawn: the turn passes
    if (!playableIds(s, by).length && !canDraw(s, by)) adv(s);
    else if (!ensure(s) && !playableIds(s, by).length) adv(s);
    return { state: s, events };
  }
  if (a.type === "pass") {
    if (s.pending > 0 || (flag(s.rules, "mustPlay") && playableIds(s, by).length)) return null;
    if (s.drew === 0 && s.deck.length + s.discard.length > 1) return null; // draw first, unless the pile is gone
    adv(s); events.push({ type: "pass", p: by });
    return { state: s, events };
  }

  // play one card, or several of one rank
  const cards = a.cards;
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 8 || new Set(cards).size !== cards.length) return null;
  if (cards.length > 1 && (!flag(s.rules, "multi") || jumping || !cards.every(c => rankOf(c) === rankOf(cards[0])))) return null;
  if (!cards.every(c => s.hands[by].includes(c))) return null;
  // the first card chosen must be playable; the rest just have to share its rank
  if (!jumping && !cards.some(c => canPlay(s, by, c))) return null;
  const ordered = [...cards].sort((x, y) => (canPlay(s, by, y) ? 1 : 0) - (canPlay(s, by, x) ? 1 : 0)); // a playable card goes down first, the last one decides what happens
  if (!canPlay(s, by, ordered[0]) && !jumping) return null;
  const last = ordered[ordered.length - 1];
  const power = powerOf(s, last);
  if (power === "wild" && !(Number.isInteger(a.suit) && a.suit! >= 0 && a.suit! <= 3)) return null;
  for (const c of ordered) { s.hands[by].splice(s.hands[by].indexOf(c), 1); s.discard.push(c); }
  if (jumping) s.turn = by;
  s.suit = power === "wild" ? a.suit! : suitOf(last);
  s.drew = 0;
  events.push({ type: "play", p: by, cards: ordered, suit: s.suit });
  const times = ordered.length;
  if (s.hands[by].length === 0) {
    if (s.pending > 0 || power === "draw2") { /* a final draw card still lands */ }
  }
  switch (power) {
    case "skip": adv(s, 1 + times); events.push({ type: "skip" }); break;
    case "reverse": s.dir = (times % 2 ? -s.dir : s.dir) as 1 | -1; if (s.n === 2) adv(s, times % 2 ? 2 : 1); else adv(s); events.push({ type: "reverse" }); break;
    case "draw2": s.pending += 2 * times; adv(s); break;
    case "again": s.drew = 0; break;
    default: adv(s);
  }
  if (s.hands[by].length === 0) {
    if (s.pending > 0) { const k = drawN(s, s.turn, s.pending); s.pending = 0; events.push({ type: "drawPenalty", p: s.turn, cards: k }); }
    let pts = 0;
    for (let q = 0; q < s.n; q++) if (q !== by) pts += s.hands[q].reduce((x, c) => x + pointsOf(s, c), 0);
    s.scores[by] += pts; s.roundWinner = by; s.roundPoints = pts;
    const target = num(s.rules, "target");
    s.phase = target === 0 || s.scores[by] >= target ? "over" : "roundOver";
    events.push({ type: "roundEnd", p: by, points: pts });
  }
  return { state: s, events };
};

const mostHeldSuit = (s: EState, p: number, exclude: number[]): number => {
  const count = [0, 0, 0, 0];
  for (const c of s.hands[p]) if (!exclude.includes(c)) count[suitOf(c)]++;
  let best = 0;
  for (let i = 1; i < 4; i++) if (count[i] > count[best]) best = i;
  return best;
};

const bot = (s: EState, p: number, level: BotLevel): EAction | null => {
  if (s.phase === "roundOver") return { type: "next" };
  if (s.phase !== "play") return null;
  if (p !== s.turn) {
    const j = jumpIds(s, p);
    return j.length && level !== "easy" && peekChance(s.rng, level === "hard" ? 0.9 : 0.5, p + 5) ? { type: "play", cards: [j[0]], suit: suitOf(j[0]) } : null;
  }
  const plays = playableIds(s, p);
  if (!plays.length) return canDraw(s, p) ? { type: "draw" } : { type: "pass" };
  const next = (((s.turn + s.dir) % s.n) + s.n) % s.n;
  const nextLow = s.hands[next].length <= 2;
  const score = (c: number) => {
    const w = powerOf(s, c);
    let v = 5 - pointsOf(s, c) * 0.05;
    if (w === "wild") v -= level === "hard" && s.hands[p].length <= 3 ? 0 : 6;
    else if (w === "draw2" || w === "skip" || w === "reverse") v += nextLow ? 6 : 1;
    else if (w === "again") v += 3;
    v += s.hands[p].filter(h => suitOf(h) === suitOf(c)).length * 0.3;
    return v;
  };
  const ranked = level === "easy" ? [peekPick(plays, s.rng, s.discard.length)] : [...plays].sort((a, b) => score(b) - score(a));
  const c = ranked[0];
  let cards = [c];
  if (flag(s.rules, "multi") && level !== "easy") cards = s.hands[p].filter(h => rankOf(h) === rankOf(c) && (h === c || true)).slice(0, 4);
  if (cards.length > 1 && !cards.includes(c)) cards = [c];
  return { type: "play", cards, suit: powerOf(s, c) === "wild" || powerOf(s, cards[cards.length - 1]) === "wild" ? mostHeldSuit(s, p, cards) : undefined };
};

const view = (s: EState, viewer: number | null): EView => {
  const mine = viewer === null ? [] : s.hands[viewer];
  const my = viewer !== null && viewer === s.turn && s.phase === "play";
  return {
    rules: s.rules, me: viewer, hand: mine, handCounts: s.hands.map(h => h.length), top: top(s), suit: s.suit, dir: s.dir, turn: s.turn, pending: s.pending, drew: s.drew,
    playable: my ? playableIds(s, viewer!) : [], canDraw: my && canDraw(s, viewer!), canPass: my && s.pending === 0 && (s.drew > 0 || s.deck.length + s.discard.length <= 1) && !(flag(s.rules, "mustPlay") && playableIds(s, viewer!).length),
    jumpable: viewer !== null && s.phase === "play" ? jumpIds(s, viewer) : [], scores: s.scores, phase: s.phase, roundWinner: s.roundWinner, roundPoints: s.roundPoints, deckCount: s.deck.length, round: s.round,
    reveal: s.phase !== "play" ? s.hands : null,
  };
};

const ci = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : undefined);

export const crazyEights: GameDriver<EState, EAction, EView> = {
  id: "crazyeights", name: "Crazy Eights", minPlayers: 2, maxPlayers: 8, schema: SCHEMA, hidden: true, create, apply,
  actors: s => (s.phase === "over" ? [] : s.phase === "roundOver" ? s.names.map((_, i) => i) : [s.turn]),
  mayAct: (s, p) => jumpIds(s, p).length > 0,
  over: s => s.phase === "over",
  scores: s => s.scores,
  winners: s => (s.phase === "over" ? [s.scores.indexOf(Math.max(...s.scores))] : []),
  view, bot,
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.type === "draw" || o.type === "pass" || o.type === "next") return { type: o.type };
    if (o.type === "play" && Array.isArray(o.cards) && o.cards.length >= 1 && o.cards.length <= 8 && o.cards.every(c => ci(c, 0, 52 * 3 - 1) !== undefined)) return { type: "play", cards: o.cards as number[], suit: ci(o.suit, 0, 3) };
    return null;
  },
  describe: (e, names) => {
    const who = e.p !== undefined ? names[e.p] : "";
    switch (e.type) {
      case "play": return `${who} played ${(e.cards as number[]).length} card${(e.cards as number[]).length === 1 ? "" : "s"}`;
      case "draw": return `${who} drew a card`;
      case "pass": return `${who} passed`;
      case "drawPenalty": return `${who} drew ${e.cards}`;
      case "skip": return "A player was skipped";
      case "reverse": return "Direction reversed";
      case "roundEnd": return `${who} went out and scored ${e.points}`;
      case "round": return `Round ${e.round}`;
      default: return null;
    }
  },
  prompt: (s, v) => {
    if (s.phase === "over") return "Match over";
    if (s.phase === "roundOver") return `${s.names[s.roundWinner]} won the round`;
    if (s.turn !== v) return `${s.names[s.turn]} is playing`;
    if (s.pending > 0) return `Draw ${s.pending}${flag(s.rules, "stack") ? " or stack" : ""}`;
    return "Your turn: play a card or draw";
  },
};
