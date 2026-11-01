import { nextRandom } from "../ludo/rng";
import {
  BUILDING_PILES, DECK_SIZE, DISCARD_PILES, HAND_SIZE, NUMBERED_SETS, TOP_VALUE, WILD, WILD_COUNT,
  type Action, type Card, type GameEvent, type GameState, type Player, type PlayerSetup, type Rules, type Source, type StepResult,
} from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const STOCK_CHOICES = [10, 15, 20, 30] as const;
export const DEFAULT_TARGET = 500;
export const ROUND_BONUS = 25;
export const POINTS_PER_CARD = 5;
/** Passing this many turns in a row means nobody can move any more. */
const STALL_ROUNDS = 2;

/** The official stock size for this many players. */
export const officialStock = (players: number): number => (players <= 4 ? 30 : 20);

/** The most cards each player can be dealt so the draw pile still has something in it. */
export const maxStock = (players: number): number => Math.min(30, Math.floor((DECK_SIZE - 12) / players));

export const defaultRules = (players: number): Rules => ({ stockSize: officialStock(players), tournament: false, target: DEFAULT_TARGET });

export const cleanRules = (rules: Partial<Rules> | undefined, players: number): Rules => {
  const base = defaultRules(players);
  const size = Number.isInteger(rules?.stockSize) ? (rules!.stockSize as number) : base.stockSize;
  const target = Number.isInteger(rules?.target) ? (rules!.target as number) : base.target;
  return {
    stockSize: Math.max(5, Math.min(maxStock(players), size)),
    tournament: !!rules?.tournament,
    target: Math.max(50, Math.min(5000, target)),
  };
};

export const makeDeck = (): Card[] => {
  const deck: Card[] = [];
  for (let v = 1; v <= TOP_VALUE; v++) for (let i = 0; i < NUMBERED_SETS; i++) deck.push(v);
  for (let i = 0; i < WILD_COUNT; i++) deck.push(WILD);
  return deck;
};

const shuffle = (cards: Card[], rng: number): { cards: Card[]; rng: number } => {
  const out = [...cards];
  let s = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { cards: out, rng: s };
};

const cleanName = (name: string, fallback: string) => name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 16) || fallback;

/** Deals a round into `s` (mutating): stock piles, the draw pile, and the first player's hand. */
const deal = (s: GameState, events: GameEvent[]) => {
  const shuffled = shuffle(makeDeck(), s.rng);
  s.rng = shuffled.rng;
  const deck = shuffled.cards;
  s.players.forEach(p => {
    p.stock = deck.splice(0, s.rules.stockSize);
    p.hand = [];
    p.discards = Array.from({ length: DISCARD_PILES }, () => []);
  });
  s.draw = deck;
  s.completed = [];
  s.building = Array.from({ length: BUILDING_PILES }, () => []);
  s.turn = (s.dealer + 1) % s.players.length;
  s.passes = 0;
  s.phase = "play";
  s.roundWinner = null;
  s.roundPoints = 0;
  events.push({ type: "deal", round: s.round }, { type: "turn", player: s.turn });
  drawUp(s, events, false);
};

/** Draws until the current player holds five cards, reshuffling finished piles into the draw pile when it runs dry. */
const drawUp = (s: GameState, events: GameEvent[], bonus: boolean) => {
  const p = s.players[s.turn];
  let drawn = 0;
  while (p.hand.length < HAND_SIZE) {
    if (s.draw.length === 0) {
      if (s.completed.length === 0) break;
      const r = shuffle(s.completed, s.rng);
      s.rng = r.rng;
      s.draw = r.cards;
      s.completed = [];
      events.push({ type: "reshuffle" });
    }
    p.hand.push(s.draw.pop()!);
    drawn++;
  }
  if (drawn) events.push({ type: "draw", player: s.turn, count: drawn, bonus });
};

export const createGame = (setups: PlayerSetup[], rules: Partial<Rules> | undefined, seed: number): GameState => {
  if (setups.length < MIN_PLAYERS || setups.length > MAX_PLAYERS) throw new Error("Skip-Bo is for 2 to 6 players");
  const players: Player[] = setups.map((p, i) => ({
    name: cleanName(p.name, `Player ${i + 1}`), kind: p.kind, level: p.kind === "bot" ? p.level ?? "normal" : undefined,
    stock: [], hand: [], discards: Array.from({ length: DISCARD_PILES }, () => []), score: 0,
  }));
  const rng0 = seed >>> 0;
  // the dealer is drawn at random, and play starts with the player on their left
  const pick = nextRandom(rng0);
  const s: GameState = {
    version: 1, rules: cleanRules(rules, players.length), players, turn: 0, dealer: Math.floor(pick.value * players.length), draw: [], completed: [],
    building: [], phase: "play", round: 1, roundWinner: null, roundPoints: 0, winner: null, passes: 0, rng: pick.state, seq: 0,
  };
  deal(s, []);
  return s;
};

export const currentPlayer = (s: GameState): Player => s.players[s.turn];

// ---- reading the table ------------------------------------------------------------------------------

export const stockTop = (p: Player): Card | undefined => p.stock[p.stock.length - 1];
export const discardTop = (p: Player, pile: number): Card | undefined => p.discards[pile]?.[p.discards[pile].length - 1];
export const heightOf = (s: GameState, pile: number): number => s.building[pile]?.length ?? 0;

export const cardAt = (s: GameState, source: Source, player = s.turn): Card | undefined => {
  const p = s.players[player];
  if (!p) return undefined;
  if (source.from === "hand") return p.hand[source.index];
  if (source.from === "stock") return stockTop(p);
  return discardTop(p, source.pile);
};

/** Can this card go on this building pile right now? A wildcard fits anywhere; a number must be one more than the pile. */
export const fits = (s: GameState, card: Card, pile: number): boolean => card === WILD || card === heightOf(s, pile) + 1;

/** The building piles a card can go on. Two empty piles are the same place, so only the first of them is listed when `unique` is set. */
export const targetsFor = (s: GameState, card: Card | undefined, unique = false): number[] => {
  if (card === undefined) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < BUILDING_PILES; i++) {
    if (!fits(s, card, i)) continue;
    if (unique) { const h = heightOf(s, i); if (seen.has(h)) continue; seen.add(h); }
    out.push(i);
  }
  return out;
};

/** A hand card, the stock card, or a discard top that can be played somewhere right now. */
export const canPlay = (s: GameState, source: Source): boolean => targetsFor(s, cardAt(s, source)).length > 0;

export const canEndTurn = (s: GameState): boolean => s.phase === "play" && currentPlayer(s).hand.length === 0;

// ---- acting ------------------------------------------------------------------------------------------

const clone = (s: GameState): GameState => structuredClone(s);

const endTurn = (s: GameState, events: GameEvent[]) => {
  s.turn = (s.turn + 1) % s.players.length;
  events.push({ type: "turn", player: s.turn });
  drawUp(s, events, false);
};

const finishRound = (s: GameState, winner: number, events: GameEvent[]) => {
  const others = s.players.reduce((n, p, i) => n + (i === winner ? 0 : p.stock.length), 0);
  const points = s.rules.tournament ? ROUND_BONUS + POINTS_PER_CARD * others : 0;
  s.roundWinner = winner;
  s.roundPoints = points;
  s.players[winner].score += points;
  events.push({ type: "roundEnd", winner, points });
  if (!s.rules.tournament) {
    s.phase = "over";
    s.winner = winner;
    events.push({ type: "gameOver", winner });
    return;
  }
  const best = Math.max(...s.players.map(p => p.score));
  if (best >= s.rules.target) {
    s.phase = "over";
    s.winner = s.players.findIndex(p => p.score === best);
    events.push({ type: "gameOver", winner: s.winner });
  } else s.phase = "roundOver";
};

const doPlay = (s: GameState, source: Source, to: number, events: GameEvent[]): boolean => {
  if (!Number.isInteger(to) || to < 0 || to >= BUILDING_PILES) return false;
  const me = s.players[s.turn];
  const card = cardAt(s, source);
  if (card === undefined || !fits(s, card, to)) return false;
  if (source.from === "hand") me.hand.splice(source.index, 1);
  else if (source.from === "stock") me.stock.pop();
  else me.discards[source.pile].pop();
  s.building[to].push(card);
  const value = s.building[to].length;
  events.push({ type: "play", player: s.turn, source, card, to, value });
  s.passes = 0;
  if (value === TOP_VALUE) {
    s.completed.push(...s.building[to]);
    s.building[to] = [];
    events.push({ type: "pileDone", to });
  }
  if (source.from === "stock") {
    if (me.stock.length === 0) { finishRound(s, s.turn, events); return true; }
    events.push({ type: "flip", player: s.turn });
  }
  // playing the whole hand earns five fresh cards and the turn goes on
  if (source.from === "hand" && me.hand.length === 0) drawUp(s, events, true);
  return true;
};

export const applyAction = (state: GameState, action: Action): StepResult | null => {
  const s = clone(state);
  const events: GameEvent[] = [];
  if (action.type === "nextRound") {
    if (s.phase !== "roundOver") return null;
    s.round += 1;
    s.dealer = (s.dealer + 1) % s.players.length;
    deal(s, events);
    s.seq += 1;
    return { state: s, events };
  }
  if (s.phase !== "play") return null;
  const me = s.players[s.turn];

  if (action.type === "play") {
    const src = action.source;
    if (src.from === "hand" && !(Number.isInteger(src.index) && src.index >= 0 && src.index < me.hand.length)) return null;
    if (src.from === "discard" && !(Number.isInteger(src.pile) && src.pile >= 0 && src.pile < DISCARD_PILES)) return null;
    if (!doPlay(s, src, action.to, events)) return null;
  } else if (action.type === "discard") {
    if (!(Number.isInteger(action.index) && action.index >= 0 && action.index < me.hand.length)) return null;
    if (!(Number.isInteger(action.pile) && action.pile >= 0 && action.pile < DISCARD_PILES)) return null;
    const [card] = me.hand.splice(action.index, 1);
    me.discards[action.pile].push(card);
    events.push({ type: "discard", player: s.turn, card, pile: action.pile });
    s.passes = 0;
    endTurn(s, events);
  } else if (action.type === "endTurn") {
    if (me.hand.length !== 0) return null;
    events.push({ type: "pass", player: s.turn });
    s.passes += 1;
    if (s.passes >= s.players.length * STALL_ROUNDS) {
      // nobody can move: the shortest stock takes the round
      const least = Math.min(...s.players.map(p => p.stock.length));
      finishRound(s, s.players.findIndex(p => p.stock.length === least), events);
    } else endTurn(s, events);
  } else return null;
  s.seq += 1;
  return { state: s, events };
};

// ---- scoring helpers for the UI ---------------------------------------------------------------------

/** Players from first to last: the winner, then by score or by cards left in the stock. */
export const standings = (s: GameState): number[] => {
  const idx = s.players.map((_, i) => i);
  return idx.sort((a, b) => {
    if (s.winner === a) return -1;
    if (s.winner === b) return 1;
    return s.rules.tournament ? s.players[b].score - s.players[a].score : s.players[a].stock.length - s.players[b].stock.length;
  });
};

/** Every card on the table, for tests: the deck must always add up. */
export const countCards = (s: GameState): number =>
  s.draw.length + s.completed.length + s.building.reduce((n, p) => n + p.length, 0) +
  s.players.reduce((n, p) => n + p.stock.length + p.hand.length + p.discards.reduce((m, d) => m + d.length, 0), 0);
