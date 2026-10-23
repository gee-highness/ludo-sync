import {
  FINISH, HOME_COLUMN_START, LAST_RING_PROGRESS, RING_LENGTH, SEATS, TOKENS_PER_PLAYER, YARD,
  isSafeRingIndex, ringIndexOf, type Seat,
} from "./board";
import { freshSeed, rollDice } from "./rng";
import {
  SQUARES, cloneTycoon, createTycoon, houseCost, landOn, releaseSeat,
  settleDebts, transfer,
} from "./tycoon";
import {
  DEFAULT_RULES, tuningOf, type Action, type BonusReason, type GameEvent, type GameState, type MoveOption,
  type Player, type PlayerSetup, type Rules, type StepResult,
} from "./types";

export const MAX_NAME_LENGTH = 20;

export const cleanName = (name: string, fallback: string) =>
  name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) || fallback;

/** Starts a game. Players take turns in seat order (clockwise). */
export const createGame = (setups: PlayerSetup[], rules: Rules = DEFAULT_RULES, seed: number = freshSeed()): GameState => {
  if (setups.length < 2 || setups.length > 4) throw new Error("A game needs 2 to 4 players");
  const seen = new Set<Seat>();
  for (const s of setups) {
    if (!SEATS.includes(s.seat)) throw new Error(`Unknown seat ${s.seat}`);
    if (seen.has(s.seat)) throw new Error(`Seat ${s.seat} used twice`);
    seen.add(s.seat);
  }
  const players: Player[] = [...setups]
    .sort((a, b) => a.seat - b.seat)
    .map(s => ({
      seat: s.seat,
      name: cleanName(s.name, `Player ${s.seat + 1}`),
      kind: s.kind,
      level: s.kind === "bot" ? s.level ?? "normal" : undefined,
      tokens: Array.from({ length: TOKENS_PER_PLAYER }, () => YARD),
    }));
  return {
    version: 1, rules: { ...rules }, players, turn: 0, phase: "roll", dice: [], rolled: [], sixes: 0,
    earned: null, winner: null, rng: seed >>> 0, seq: 0,
    ...(rules.tycoon ? { tycoon: createTycoon(tuningOf(rules).startCash) } : {}),
  };
};

export const currentPlayer = (s: GameState): Player => s.players[s.turn];
export const playerOf = (s: GameState, seat: Seat): Player | undefined => s.players.find(p => p.seat === seat);
/** Score for display: one point per square each token has travelled, with a token's last step into the centre counting too. */
export const pointsOf = (p: Player): number => p.tokens.reduce((sum, t) => sum + (t === YARD ? 0 : t + 1), 0);
export const tokensHome = (p: Player) => p.tokens.filter(t => t === FINISH).length;

/** Values the current player may spend: each die left, plus their sum when two different dice remain. */
export const dicePool = (s: GameState): number[] => {
  const pool = new Set(s.dice);
  if (s.rules.twoDice && s.dice.length === 2 && s.dice[0] !== s.dice[1]) pool.add(s.dice[0] + s.dice[1]);
  return [...pool];
};

/** Ring squares the given seat may not pass or land on, because an opponent has two or more tokens there. */
export const blockedRingIndexes = (s: GameState, seat: Seat): Set<number> => {
  const blocked = new Set<number>();
  if (!s.rules.blockades) return blocked;
  for (const p of s.players) {
    if (p.seat === seat) continue;
    const counts = new Map<number, number>();
    for (const t of p.tokens) {
      const r = ringIndexOf(p.seat, t);
      if (r !== null) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    for (const [r, n] of counts) if (n >= 2 && !(s.rules.safeSquares && isSafeRingIndex(r))) blocked.add(r);
  }
  return blocked;
};

const isSafeFor = (s: GameState, ringIdx: number) => s.rules.safeSquares && isSafeRingIndex(ringIdx);

/** Opponent tokens a capture on this ring square would send home. */
const victimsAt = (s: GameState, seat: Seat, ringIdx: number): { seat: Seat; token: number }[] => {
  const out: { seat: Seat; token: number }[] = [];
  for (const p of s.players) {
    if (p.seat === seat) continue;
    p.tokens.forEach((t, i) => { if (ringIndexOf(p.seat, t) === ringIdx) out.push({ seat: p.seat, token: i }); });
  }
  return out;
};

/** Works out whether one token can spend one value, and what would happen. */
export const moveOption = (s: GameState, player: Player, token: number, die: number): MoveOption | null => {
  const from = player.tokens[token];
  if (from === FINISH) return null;
  let to: number;
  const tune = tuningOf(s.rules);
  if (from === YARD) {
    const entry = tune.entry === "any" || die === 6 || (tune.entry === "six-or-one" && die === 1);
    if (!entry) return null;
    to = 0;
  } else {
    to = from + die;
    if (to > FINISH) {
      if (tune.exactFinish) return null;
      to = FINISH;
    }
  }
  const blocked = blockedRingIndexes(s, player.seat);
  if (blocked.size) {
    for (let q = Math.max(from + 1, 0); q <= Math.min(to, LAST_RING_PROGRESS); q++) {
      const r = ringIndexOf(player.seat, q);
      if (r !== null && blocked.has(r)) return null;
    }
  }
  const landing = ringIndexOf(player.seat, to);
  const captures = landing !== null && !isSafeFor(s, landing) && victimsAt(s, player.seat, landing).length > 0;
  return { token, die, from, to, captures, finishes: to === FINISH, entersBoard: from === YARD };
};

/** Every move the current player may make right now. */
export const legalMoves = (s: GameState): MoveOption[] => {
  if (s.phase !== "move") return [];
  const player = currentPlayer(s);
  const pool = dicePool(s);
  const out: MoveOption[] = [];
  for (let token = 0; token < TOKENS_PER_PLAYER; token++) {
    for (const die of pool) {
      const opt = moveOption(s, player, token, die);
      if (opt) out.push(opt);
    }
  }
  return out;
};

const nextTurn = (s: GameState, events: GameEvent[]): StepResult => {
  const turn = (s.turn + 1) % s.players.length;
  events.push({ type: "turn", seat: s.players[turn].seat });
  return { state: { ...s, turn, phase: "roll", dice: [], sixes: 0, earned: null }, events };
};

/** The roll's dice are spent (or unusable): roll again if earned, else pass the turn. */
const endOfRoll = (s: GameState, events: GameEvent[]): StepResult => {
  if (s.earned) {
    events.push({ type: "bonus", seat: currentPlayer(s).seat, reason: s.earned });
    return { state: { ...s, phase: "roll", dice: [], earned: null }, events };
  }
  return nextTurn(s, events);
};

const withSeq = (s: GameState): GameState => ({ ...s, seq: s.seq + 1 });

const doRoll = (s: GameState): StepResult | null => {
  if (s.phase !== "roll") return null;
  const seat = currentPlayer(s).seat;
  const r = rollDice(s.rng, s.rules.twoDice ? 2 : 1);
  const events: GameEvent[] = [{ type: "roll", seat, dice: r.dice }];
  const tune = tuningOf(s.rules);
  const sixCount = r.dice.filter(d => d === 6).length;
  const sixes = sixCount > 0 ? s.sixes + sixCount : 0;
  const base: GameState = { ...s, rng: r.state, rolled: r.dice, dice: r.dice, sixes, earned: sixCount > 0 && tune.sixBonus ? "six" : null };
  if (s.rules.threeSixes && sixes >= tune.sixesLimit) {
    events.push({ type: "penalty", seat });
    return nextTurn(withSeq({ ...base, dice: [], earned: null }), events);
  }
  const moving: GameState = withSeq({ ...base, phase: "move" });
  if (legalMoves(moving).length === 0) {
    events.push({ type: "no-moves", seat });
    return endOfRoll({ ...moving, dice: [] }, events);
  }
  return { state: moving, events };
};

const doMove = (s: GameState, token: number, die: number): StepResult | null => {
  if (s.phase !== "move") return null;
  const option = legalMoves(s).find(o => o.token === token && o.die === die);
  if (!option) return null;

  const me = currentPlayer(s);
  const events: GameEvent[] = [{ type: "move", seat: me.seat, token, die, from: option.from, to: option.to }];
  const players = s.players.map(p => ({ ...p, tokens: [...p.tokens] }));
  const mine = players[s.turn];
  mine.tokens[token] = option.to;

  let earned: BonusReason | null = s.earned;
  const landing = ringIndexOf(me.seat, option.to);
  if (landing !== null && !isSafeFor(s, landing)) {
    for (const v of victimsAt(s, me.seat, landing)) {
      players.find(p => p.seat === v.seat)!.tokens[v.token] = YARD;
      events.push({ type: "capture", seat: me.seat, victim: v.seat, token: v.token });
      if (s.rules.captureBonus) earned = earned ?? "capture";
    }
  }
  if (option.finishes) {
    events.push({ type: "finish", seat: me.seat, token });
    if (s.rules.finishBonus) earned = earned ?? "finish";
  }

  const dice = [...s.dice];
  const single = dice.indexOf(die);
  if (single >= 0) dice.splice(single, 1);
  else dice.length = 0; // a sum spends both dice

  let next: GameState = withSeq({ ...s, players, dice, earned });
  if (mine.tokens.filter(t => t === FINISH).length >= tuningOf(s.rules).winTokens) {
    events.push({ type: "win", seat: me.seat });
    return { state: { ...next, phase: "over", dice: [], earned: null, winner: me.seat }, events };
  }
  if (next.tycoon) {
    const eco = economyAfterMove(next, me.seat, option, events);
    if (eco.over) return eco.over;
    next = eco.state;
    if (next.tycoon!.pending) return { state: { ...next, phase: "decide" }, events };
  }
  return afterMove(next, events);
};

/** Spends are done: keep moving with what is left of the roll, or finish the roll. */
const afterMove = (s: GameState, events: GameEvent[]): StepResult => {
  if (s.dice.length === 0 || legalMoves({ ...s, phase: "move" }).length === 0) return endOfRoll({ ...s, dice: [] }, events);
  return { state: { ...s, phase: "move" }, events };
};

/** Money and property effects of the move that was just made. Bankrupt players are forfeited. */
const economyAfterMove = (
  s: GameState, seat: Seat, o: MoveOption, events: GameEvent[],
): { state: GameState; over?: StepResult } => {
  const t = cloneTycoon(s.tycoon!);
  const tune = tuningOf(s.rules);
  let rng = s.rng;
  if (o.entersBoard) transfer(t, seat, tune.enterBonus, "left the yard", events);
  if (o.finishes) transfer(t, seat, tune.homeBonus, "token home", events);
  for (const e of [...events]) if (e.type === "capture") transfer(t, seat, tune.captureLoot, "capture", events, e.victim);
  const ring = ringIndexOf(seat, o.to);
  if (ring !== null) rng = landOn(t, s.players, seat, ring, rng, events, tune);

  let state: GameState = { ...s, rng, tycoon: t };
  const broke = settleDebts(t, state.players, events);
  for (const b of broke) {
    events.push({ type: "bankrupt", seat: b });
    releaseSeat(t, b);
    const r = doForfeit(state, b);
    if (!r) continue;
    events.push(...r.events);
    state = r.state;
    if (state.phase === "over") return { state, over: { state, events } };
  }
  if (broke.includes(seat)) return { state, over: { state, events } };
  return { state };
};

const doDecide = (s: GameState, kind: "buy" | "pass" | "build"): StepResult | null => {
  const t0 = s.tycoon;
  const p = t0?.pending;
  if (s.phase !== "decide" || !t0 || !p || p.seat !== currentPlayer(s).seat) return null;
  const t = cloneTycoon(t0);
  t.pending = null;
  const events: GameEvent[] = [];
  const sq = SQUARES[p.ring];
  if (kind === "buy") {
    if (p.kind !== "buy" || t.cash[p.seat] < sq.price) return null;
    t.cash[p.seat] -= sq.price;
    t.owner[p.ring] = p.seat;
    events.push({ type: "buy", seat: p.seat, ring: p.ring, price: sq.price });
  } else if (kind === "build") {
    if (p.kind !== "build" || t.cash[p.seat] < houseCost(p.ring) || t.level[p.ring] >= tuningOf(s.rules).maxBuild) return null;
    t.cash[p.seat] -= houseCost(p.ring);
    t.level[p.ring] += 1;
    events.push({ type: "build", seat: p.seat, ring: p.ring, level: t.level[p.ring] });
  }
  return afterMove(withSeq({ ...s, tycoon: t }), events);
};

const doForfeit = (s: GameState, seat: Seat): StepResult | null => {
  if (s.phase === "over") return null;
  const idx = s.players.findIndex(p => p.seat === seat);
  if (idx < 0) return null;
  const players = s.players.filter((_, i) => i !== idx);
  const events: GameEvent[] = [{ type: "forfeit", seat }];
  if (s.tycoon) {
    const t = cloneTycoon(s.tycoon);
    releaseSeat(t, seat);
    s = { ...s, tycoon: t };
  }
  if (players.length === 1) {
    events.push({ type: "win", seat: players[0].seat });
    return { state: withSeq({ ...s, players, turn: 0, phase: "over", dice: [], earned: null, winner: players[0].seat }), events };
  }
  if (idx < s.turn) return { state: withSeq({ ...s, players, turn: s.turn - 1 }), events };
  if (idx > s.turn) return { state: withSeq({ ...s, players }), events };
  const turn = idx % players.length;
  events.push({ type: "turn", seat: players[turn].seat });
  return { state: withSeq({ ...s, players, turn, phase: "roll", dice: [], sixes: 0, earned: null }), events };
};

/**
 * Applies one action. Returns null if the action is not legal right now, so callers can feed it
 * untrusted input (a remote player's tap) without checking first. Callers decide whose turn it is.
 */
export const applyAction = (s: GameState, action: Action): StepResult | null => {
  switch (action.type) {
    case "roll": return doRoll(s);
    case "move": return doMove(s, action.token, action.die);
    case "forfeit": return doForfeit(s, action.seat);
    case "buy": case "pass": case "build": return doDecide(s, action.type);
  }
};

/** Ring squares between two progress values, for animating a hop; excludes `from`, includes `to`. */
export const pathBetween = (from: number, to: number): number[] => {
  if (from === YARD) return to >= 0 ? [to] : [];
  const out: number[] = [];
  for (let p = from + 1; p <= to; p++) out.push(p);
  return out;
};

/** How far through the whole journey a player is, 0..1, for progress bars. */
export const journeyProgress = (p: Player): number =>
  p.tokens.reduce((sum, t) => sum + Math.max(t, 0) + (t === YARD ? 0 : 1), 0) / (TOKENS_PER_PLAYER * (FINISH + 1));

export const isHomeColumn = (progress: number) => progress >= HOME_COLUMN_START && progress < FINISH;
export const ringDistance = (fromIdx: number, toIdx: number) => (toIdx - fromIdx + RING_LENGTH) % RING_LENGTH;
