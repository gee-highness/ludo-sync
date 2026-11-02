import { flag, num, pick, type RuleValues } from "../../platform/rules";
import { peekChance, peekPick, shuffled } from "../../platform/rng";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../../platform/types";
import { SCHEMA } from "./rules";

export { SCHEMA };
export const COLOURS = ["Red", "Yellow", "Green", "Blue"] as const;
/** kind: 0 number, 1 skip, 2 reverse, 3 draw two, 4 wild, 5 wild draw four. Colour 4 means none (wilds). */
export const K = { NUM: 0, SKIP: 1, REV: 2, D2: 3, WILD: 4, W4: 5 } as const;
export interface Card { id: number; c: number; k: number; v: number }
type Def = [number, number, number];

export interface FState {
  rules: RuleValues;
  n: number;
  names: string[];
  defs: Def[];
  deck: number[];
  discard: number[];
  hands: number[][];
  dir: 1 | -1;
  turn: number;
  color: number;
  pending: number;
  pendingKind: "none" | "d2" | "w4";
  /** The Wild Draw Four just played: who played it, and whether they held the colour in play (so a challenge would succeed). */
  challenge: { by: number; hadColor: boolean } | null;
  drawn: number | null;
  called: boolean[];
  catchable: number | null;
  phase: "play" | "roundOver" | "over";
  scores: number[];
  round: number;
  dealer: number;
  roundWinner: number;
  roundPoints: number;
  rng: number;
}

export type FAction =
  | { type: "play"; card: number; color?: number; swap?: number; call?: boolean }
  | { type: "draw" } | { type: "pass" } | { type: "challenge" } | { type: "call" } | { type: "catch"; target: number } | { type: "next" };

export interface FView {
  rules: RuleValues;
  me: number | null;
  hand: Card[];
  handCounts: number[];
  top: Card | null;
  color: number;
  dir: 1 | -1;
  turn: number;
  pending: number;
  pendingKind: FState["pendingKind"];
  canChallenge: boolean;
  drawn: number | null;
  playable: number[];
  jumpable: number[];
  called: boolean[];
  catchable: number | null;
  phase: FState["phase"];
  scores: number[];
  round: number;
  roundWinner: number;
  roundPoints: number;
  deckCount: number;
  /** Everyone's hand, shown only once the round is over. */
  reveal: Card[][] | null;
}

const card = (s: FState, id: number): Card => ({ id, c: s.defs[id][0], k: s.defs[id][1], v: s.defs[id][2] });
export const isWild = (c: Card) => c.k >= K.WILD;
const identical = (a: Card, b: Card) => a.c === b.c && a.k === b.k && (a.k !== K.NUM || a.v === b.v);

const buildDeck = (r: RuleValues): Def[] => {
  const defs: Def[] = [];
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < num(r, "zeroCopies"); i++) defs.push([c, K.NUM, 0]);
    for (let v = 1; v <= 9; v++) for (let i = 0; i < num(r, "numberCopies"); i++) defs.push([c, K.NUM, v]);
    for (let i = 0; i < num(r, "skipCopies"); i++) defs.push([c, K.SKIP, 0]);
    for (let i = 0; i < num(r, "reverseCopies"); i++) defs.push([c, K.REV, 0]);
    for (let i = 0; i < num(r, "drawTwoCopies"); i++) defs.push([c, K.D2, 0]);
  }
  for (let i = 0; i < num(r, "wilds"); i++) defs.push([4, K.WILD, 0]);
  for (let i = 0; i < num(r, "wildFours"); i++) defs.push([4, K.W4, 0]);
  return defs;
};

const value = (s: FState, id: number): number => {
  const [, k, v] = s.defs[id];
  return k === K.NUM ? v : k >= K.WILD ? num(s.rules, "wildValue") : num(s.rules, "actionValue");
};

const adv = (s: FState, steps = 1) => { s.turn = (((s.turn + s.dir * steps) % s.n) + s.n) % s.n; };
const top = (s: FState): Card | null => (s.discard.length ? card(s, s.discard[s.discard.length - 1]) : null);

const ensureDeck = (s: FState): boolean => {
  if (s.deck.length) return true;
  if (s.discard.length <= 1) return false;
  const t = s.discard.pop()!;
  const sh = shuffled(s.discard, s.rng);
  s.deck = sh.value; s.rng = sh.rng; s.discard = [t];
  return s.deck.length > 0;
};
const drawN = (s: FState, p: number, k: number): number => {
  let got = 0;
  for (let i = 0; i < k && ensureDeck(s); i++) { s.hands[p].push(s.deck.pop()!); got++; }
  if (s.hands[p].length > 1) s.called[p] = false;
  return got;
};

const startRound = (s: FState) => {
  const defs = buildDeck(s.rules);
  const sh = shuffled(defs.map((_, i) => i), s.rng);
  s.defs = defs; s.deck = sh.value; s.rng = sh.rng;
  s.hands = s.names.map(() => []); s.discard = []; s.dir = 1; s.pending = 0; s.pendingKind = "none"; s.challenge = null; s.drawn = null; s.catchable = null;
  s.called = s.names.map(() => false); s.roundWinner = -1; s.roundPoints = 0; s.phase = "play";
  for (let r = 0; r < num(s.rules, "handSize"); r++) for (let p = 0; p < s.n; p++) if (s.deck.length) s.hands[p].push(s.deck.pop()!);
  // the first card: a Wild Draw Four goes back to the bottom of the pile
  let guard = 0;
  while (s.deck.length && guard++ < 200) { const id = s.deck.pop()!; if (s.defs[id][1] === K.W4) { s.deck.unshift(id); continue; } s.discard.push(id); break; }
  const t = top(s);
  s.turn = (s.dealer + 1) % s.n;
  if (!t) { s.color = 0; return; }
  if (t.k >= K.WILD) { const r = shuffled([0, 1, 2, 3], s.rng); s.color = r.value[0]; s.rng = r.rng; } else s.color = t.c;
  if (t.k === K.SKIP) adv(s);
  else if (t.k === K.REV) { s.dir = -1; s.turn = s.dealer; }
  else if (t.k === K.D2) { s.pending = 2; s.pendingKind = "d2"; }
};

const create = (seats: SeatInfo[], rules: RuleValues, seed: number): FState => {
  const s: FState = {
    rules, n: seats.length, names: seats.map(x => x.name), defs: [], deck: [], discard: [], hands: [], dir: 1, turn: 0, color: 0, pending: 0, pendingKind: "none", challenge: null, drawn: null,
    called: [], catchable: null, phase: "play", scores: seats.map(() => 0), round: 1, dealer: seed % seats.length, roundWinner: -1, roundPoints: 0, rng: seed >>> 0,
  };
  startRound(s);
  return s;
};

// ---- legality --------------------------------------------------------------------------------------

export const canPlay = (s: FState, p: number, id: number): boolean => {
  const c = card(s, id), t = top(s);
  if (!t) return false;
  const hand = s.hands[p];
  if (s.drawn !== null && s.drawn !== id) return false;
  if (hand.length === 1 && !flag(s.rules, "endOnAction") && c.k !== K.NUM) return false;
  if (s.pending > 0) {
    const mode = pick(s.rules, "stack");
    if (mode === "off" || (c.k !== K.D2 && c.k !== K.W4)) return false;
    return mode === "any" || (c.k === K.D2 ? s.pendingKind === "d2" : s.pendingKind === "w4");
  }
  if (c.k === K.WILD) return true;
  if (c.k === K.W4) return !flag(s.rules, "w4Restricted") || !hand.some(h => s.defs[h][0] === s.color && h !== id);
  return c.c === s.color || (t.k < K.WILD && c.k === t.k && (c.k !== K.NUM || c.v === t.v));
};

export const playableIds = (s: FState, p: number): number[] => s.hands[p].filter(id => canPlay(s, p, id));

const jumpIds = (s: FState, p: number): number[] => {
  const t = top(s);
  if (!flag(s.rules, "jumpIn") || !t || t.k >= K.WILD || p === s.turn || s.pending > 0 || s.drawn !== null || s.phase !== "play") return [];
  return s.hands[p].filter(id => identical(card(s, id), t));
};

const clone = (s: FState): FState => ({ ...s, defs: s.defs, deck: s.deck.slice(), discard: s.discard.slice(), hands: s.hands.map(h => h.slice()), called: s.called.slice(), scores: s.scores.slice(), challenge: s.challenge && { ...s.challenge } });

const endRound = (s: FState, winner: number, events: GameEvent[]) => {
  let pts = 0;
  for (let p = 0; p < s.n; p++) if (p !== winner) pts += s.hands[p].reduce((a, id) => a + value(s, id), 0);
  s.scores[winner] += pts; s.roundWinner = winner; s.roundPoints = pts;
  const target = num(s.rules, "target");
  s.phase = target === 0 || s.scores[winner] >= target ? "over" : "roundOver";
  events.push({ type: "roundEnd", p: winner, points: pts });
};

const apply = (state: FState, a: FAction, by: number): { state: FState; events: GameEvent[] } | null => {
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

  if (a.type === "call") {
    if (s.hands[by].length > 2 || s.hands[by].length < 1 || !flag(s.rules, "lastCall")) return null;
    s.called[by] = true;
    if (s.catchable === by) s.catchable = null;
    events.push({ type: "call", p: by });
    return { state: s, events };
  }
  if (a.type === "catch") {
    if (!flag(s.rules, "lastCall") || s.catchable === null || a.target !== s.catchable || by === a.target) return null;
    drawN(s, a.target, num(s.rules, "callPenalty"));
    s.catchable = null;
    events.push({ type: "catch", p: by, target: a.target, cards: num(s.rules, "callPenalty") });
    return { state: s, events };
  }

  const jumping = a.type === "play" && by !== s.turn;
  if (jumping) { if (!jumpIds(s, by).includes(a.card)) return null; }
  else if (by !== s.turn) return null;
  s.catchable = null; // the next move after someone reaches one card closes the chance to catch them

  if (a.type === "draw") {
    if (s.drawn !== null) return null;
    if (s.pending > 0) {
      const k = drawN(s, by, s.pending);
      events.push({ type: "drawPenalty", p: by, cards: k });
      s.pending = 0; s.pendingKind = "none"; s.challenge = null;
      adv(s);
      return { state: s, events };
    }
    if (flag(s.rules, "mustPlay") && playableIds(s, by).length) return null;
    let found = false;
    const until = flag(s.rules, "drawUntil");
    for (let i = 0; i < 60; i++) {
      if (drawN(s, by, 1) === 0) break;
      const id = s.hands[by][s.hands[by].length - 1];
      if (canPlay(s, by, id)) { s.drawn = id; found = true; break; }
      if (!until) break;
    }
    events.push({ type: "draw", p: by });
    if (!found) adv(s);
    return { state: s, events };
  }
  if (a.type === "pass") {
    if (s.drawn === null || flag(s.rules, "mustPlayDrawn")) return null;
    s.drawn = null; adv(s);
    events.push({ type: "pass", p: by });
    return { state: s, events };
  }
  if (a.type === "challenge") {
    if (!s.challenge || !flag(s.rules, "challenge") || s.pendingKind !== "w4") return null;
    const ch = s.challenge;
    if (ch.hadColor) {
      drawN(s, ch.by, s.pending);
      events.push({ type: "challenge", p: by, target: ch.by, won: true });
    } else {
      drawN(s, by, s.pending + num(s.rules, "challengePenalty"));
      adv(s);
      events.push({ type: "challenge", p: by, target: ch.by, won: false });
    }
    s.pending = 0; s.pendingKind = "none"; s.challenge = null;
    return { state: s, events };
  }

  // play
  const p = by;
  if (!s.hands[p].includes(a.card) || !(jumping || canPlay(s, p, a.card))) return null;
  const c = card(s, a.card);
  const handBefore = s.hands[p].slice();
  const colourInPlay = s.color;
  if (isWild(c)) { if (!Number.isInteger(a.color) || a.color! < 0 || a.color! > 3) return null; }
  const sevenZero = flag(s.rules, "sevenZero") && c.k === K.NUM;
  if (sevenZero && c.v === 7 && s.n > 1) { if (!Number.isInteger(a.swap) || a.swap === p || a.swap! < 0 || a.swap! >= s.n) return null; }
  const fresh = s.pending === 0;
  s.hands[p].splice(s.hands[p].indexOf(a.card), 1);
  s.discard.push(a.card);
  s.color = isWild(c) ? a.color! : c.c;
  s.drawn = null;
  if (jumping) s.turn = p;
  if (s.hands[p].length === 1) {
    if (flag(s.rules, "lastCall") && !(s.called[p] || a.call)) s.catchable = p; else s.called[p] = true;
  } else s.called[p] = false;
  events.push({ type: "play", p, card: a.card, color: s.color });

  switch (c.k) {
    case K.NUM:
      adv(s);
      if (sevenZero && c.v === 7 && a.swap !== undefined) { [s.hands[p], s.hands[a.swap]] = [s.hands[a.swap], s.hands[p]]; s.called = s.called.map((_, i) => s.hands[i].length === 1 && s.called[i]); events.push({ type: "swap", p, target: a.swap }); }
      else if (sevenZero && c.v === 0) {
        const hs = s.hands.map(h => h.slice());
        for (let i = 0; i < s.n; i++) s.hands[(((i + s.dir) % s.n) + s.n) % s.n] = hs[i];
        events.push({ type: "rotate" });
      }
      break;
    case K.SKIP: adv(s, 2); events.push({ type: "skip", p: (s.turn - s.dir + s.n) % s.n }); break;
    case K.REV:
      s.dir = (s.dir * -1) as 1 | -1;
      if (s.n === 2 && pick(s.rules, "reverseTwo") === "skip") adv(s, 2); else adv(s);
      events.push({ type: "reverse" });
      break;
    case K.D2: s.pending += 2; s.pendingKind = "d2"; s.challenge = null; adv(s); break;
    case K.W4:
      s.pending += 4; s.pendingKind = "w4"; adv(s);
      s.challenge = fresh && flag(s.rules, "challenge") ? { by: p, hadColor: flag(s.rules, "w4Restricted") && handBefore.some(h => h !== a.card && s.defs[h][0] === colourInPlay) } : null;
      break;
    default: adv(s);
  }
  if (s.hands[p].length === 0) {
    // a penalty card still lands on the next player before the round is counted
    if (s.pending > 0) { const k = drawN(s, s.turn, s.pending); events.push({ type: "drawPenalty", p: s.turn, cards: k }); s.pending = 0; s.pendingKind = "none"; s.challenge = null; }
    endRound(s, p, events);
  }
  return { state: s, events };
};

// ---- bots --------------------------------------------------------------------------------------------

const mostHeld = (s: FState, p: number, exclude?: number): number => {
  const count = [0, 0, 0, 0];
  for (const id of s.hands[p]) if (id !== exclude && s.defs[id][0] < 4) count[s.defs[id][0]]++;
  let best = 0;
  for (let c = 1; c < 4; c++) if (count[c] > count[best]) best = c;
  return count[best] === 0 ? Math.floor(peekPick([0, 1, 2, 3], s.rng, p)) : best;
};

const bot = (s: FState, p: number, level: BotLevel): FAction | null => {
  if (s.phase === "roundOver") return { type: "next" };
  if (s.phase !== "play") return null;
  const me = s.hands[p];
  // out of turn: catch a player who forgot to call, or jump in
  if (p !== s.turn) {
    if (s.catchable !== null && s.catchable !== p && peekChance(s.rng, level === "easy" ? 0.25 : level === "normal" ? 0.7 : 1, p)) return { type: "catch", target: s.catchable };
    const j = jumpIds(s, p);
    if (j.length && level !== "easy" && peekChance(s.rng, level === "hard" ? 0.9 : 0.5, p + 3)) { const c = card(s, j[0]); return { type: "play", card: j[0], call: me.length === 2, color: isWild(c) ? 0 : undefined }; }
    return null;
  }
  // a challenge decision: a Wild Draw Four was just played at this bot
  if (s.challenge && s.pending > 0 && flag(s.rules, "challenge") && s.pendingKind === "w4") {
    const stackable = playableIds(s, p).length > 0;
    const sus = level === "easy" ? 0.1 : level === "normal" ? 0.3 : 0.5;
    if (!stackable && peekChance(s.rng, sus, s.discard.length)) return { type: "challenge" };
  }
  const plays = playableIds(s, p);
  if (s.drawn !== null) return plays.length ? mkPlay(s, p, level, plays) : { type: "pass" };
  if (!plays.length) return { type: "draw" };
  if (s.pending > 0) return mkPlay(s, p, level, plays);
  if (level === "easy") return mkPlay(s, p, level, [peekPick(plays, s.rng, s.discard.length)]);
  return mkPlay(s, p, level, plays);
};

const mkPlay = (s: FState, p: number, level: BotLevel, plays: number[]): FAction => {
  const me = s.hands[p];
  const next = (((s.turn + s.dir) % s.n) + s.n) % s.n;
  const nextLow = s.hands[next].length <= 2;
  const score = (id: number) => {
    const c = card(s, id);
    let v = 0;
    if (c.k === K.NUM) v += 3 + (me.filter(h => s.defs[h][0] === c.c).length) * 0.2;
    else if (c.k >= K.WILD) v -= level === "hard" && me.length <= 3 ? 0 : 4;
    else v += nextLow ? 6 : 1.5;
    if (c.k === K.W4 && nextLow) v += 7;
    if (s.pending > 0) v += 5;
    return v + (level === "easy" ? 0 : value(s, id) * 0.02);
  };
  const ranked = level === "easy" ? plays : [...plays].sort((a, b) => score(b) - score(a));
  const id = ranked[0];
  const c = card(s, id);
  const act: FAction = { type: "play", card: id, call: me.length === 2 && peekChance(s.rng, level === "easy" ? 0.5 : level === "normal" ? 0.85 : 1, p + 11) };
  if (isWild(c)) act.color = mostHeld(s, p, id);
  if (flag(s.rules, "sevenZero") && c.k === K.NUM && c.v === 7) {
    let best = -1;
    for (let q = 0; q < s.n; q++) if (q !== p && (best < 0 || s.hands[q].length < s.hands[best].length)) best = q;
    act.swap = best;
  }
  return act;
};

const describe = (e: GameEvent, names: string[]): string | null => {
  const who = e.p !== undefined ? names[e.p] : "";
  switch (e.type) {
    case "play": return `${who} played a card${e.color !== undefined ? ` (${COLOURS[e.color as number]})` : ""}`;
    case "draw": return `${who} drew a card`;
    case "pass": return `${who} passed`;
    case "drawPenalty": return `${who} drew ${e.cards} cards`;
    case "skip": return `${who} was skipped`;
    case "reverse": return "Direction reversed";
    case "challenge": return e.won ? `${who} challenged ${names[e.target as number]}: the Wild Draw Four was illegal!` : `${who} challenged and was wrong`;
    case "call": return `${who} called “Last card!”`;
    case "catch": return `${who} caught ${names[e.target as number]} without a call: +${e.cards} cards`;
    case "swap": return `${who} swapped hands with ${names[e.target as number]}`;
    case "rotate": return "All hands passed along";
    case "roundEnd": return `${who} went out and scored ${e.points}`;
    case "round": return `Round ${e.round}`;
    default: return null;
  }
};

const view = (s: FState, viewer: number | null): FView => {
  const mine = viewer === null ? [] : s.hands[viewer];
  const t = top(s);
  const canAct = viewer !== null && viewer === s.turn && s.phase === "play";
  return {
    rules: s.rules, me: viewer, hand: mine.map(id => card(s, id)), handCounts: s.hands.map(h => h.length), top: t, color: s.color, dir: s.dir, turn: s.turn, pending: s.pending, pendingKind: s.pendingKind,
    canChallenge: canAct && !!s.challenge && flag(s.rules, "challenge") && s.pendingKind === "w4", drawn: canAct ? s.drawn : null,
    playable: canAct ? playableIds(s, viewer!) : [], jumpable: viewer !== null && s.phase === "play" ? jumpIds(s, viewer) : [], called: s.called, catchable: s.catchable,
    phase: s.phase, scores: s.scores, round: s.round, roundWinner: s.roundWinner, roundPoints: s.roundPoints, deckCount: s.deck.length,
    reveal: s.phase !== "play" ? s.hands.map(h => h.map(id => card(s, id))) : null,
  };
};

const ci = (v: unknown, lo: number, hi: number): number | undefined => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : undefined);

export const fourColors: GameDriver<FState, FAction, FView> = {
  id: "fourcolors", name: "4 Colors", minPlayers: 2, maxPlayers: 10, schema: SCHEMA, hidden: true, create, apply,
  actors: s => (s.phase === "over" ? [] : s.phase === "roundOver" ? s.names.map((_, i) => i) : [s.turn]),
  mayAct: (s, p) => {
    if (s.phase !== "play") return false;
    return (s.catchable !== null && s.catchable !== p && flag(s.rules, "lastCall")) || jumpIds(s, p).length > 0 || (flag(s.rules, "lastCall") && s.hands[p].length <= 2 && !s.called[p]);
  },
  over: s => s.phase === "over",
  scores: s => s.scores,
  winners: s => (s.phase === "over" ? [s.scores.indexOf(Math.max(...s.scores))] : []),
  view, bot, describe,
  parseAction: raw => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    switch (o.type) {
      case "draw": case "pass": case "challenge": case "call": case "next": return { type: o.type };
      case "catch": { const t = ci(o.target, 0, 9); return t === undefined ? null : { type: "catch", target: t }; }
      case "play": { const card = ci(o.card, 0, 999); if (card === undefined) return null; return { type: "play", card, color: ci(o.color, 0, 3), swap: ci(o.swap, 0, 9), call: o.call === true }; }
      default: return null;
    }
  },
  prompt: (s, v) => {
    if (s.phase === "over") return "Match over";
    if (s.phase === "roundOver") return `${s.names[s.roundWinner]} won the round`;
    if (s.turn !== v) return `${s.names[s.turn]} is playing`;
    if (s.pending > 0 && s.challenge) return "Challenge, draw, or stack";
    if (s.pending > 0) return `Draw ${s.pending}${s.pendingKind !== "none" && flag(s.rules, "stack") && pick(s.rules, "stack") !== "off" ? " or stack" : ""}`;
    if (s.drawn !== null) return "Play the card you drew, or pass";
    return "Your turn: play a card or draw";
  },
};
