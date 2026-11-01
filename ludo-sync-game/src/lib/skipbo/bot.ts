import { canEndTurn, currentPlayer, discardTop, fits, heightOf, stockTop, targetsFor } from "./engine";
import { BUILDING_PILES, DISCARD_PILES, WILD, type Action, type BotLevel, type Card, type GameState, type Source } from "./types";

interface Play { source: Source; card: Card; to: number }

/** A stable pseudo-random number from the game, so the same position always gets the same choice. */
const noise = (s: GameState, salt: number): number => (((s.seq + 1) * 2654435761 + salt * 40503 + s.rng) >>> 0) / 4294967296;

/** Every play the current player could make, one entry per distinct pile height. */
const allPlays = (s: GameState): Play[] => {
  const me = currentPlayer(s);
  const out: Play[] = [];
  const add = (source: Source, card: Card | undefined) => {
    for (const to of targetsFor(s, card, true)) out.push({ source, card: card!, to });
  };
  add({ from: "stock" }, stockTop(me));
  for (let pile = 0; pile < DISCARD_PILES; pile++) add({ from: "discard", pile }, discardTop(me, pile));
  const seen = new Set<Card>();
  me.hand.forEach((card, index) => { if (!seen.has(card)) { seen.add(card); add({ from: "hand", index }, card); } });
  return out;
};

interface Sim { heights: number[]; hand: Card[]; discards: Card[][]; stock: Card | undefined }

const simOf = (s: GameState): Sim => {
  const me = currentPlayer(s);
  return { heights: s.building.map(b => b.length), hand: [...me.hand], discards: me.discards.map(d => [...d]), stock: stockTop(me) };
};

/**
 * Looks for a few plays that get the face-up stock card onto a pile (the heart of the game), and returns the first of them.
 * Cards only come from the hand and the discard tops, so the search stays small.
 */
const planStock = (s: GameState, depth: number): Play | null => {
  const me = currentPlayer(s);
  const stock = stockTop(me);
  if (stock === undefined) return null;
  const fitsH = (c: Card, h: number) => c === WILD || c === h + 1;
  const search = (sim: Sim, left: number, first: Play | null): Play | null => {
    if (sim.stock !== undefined && sim.heights.some(h => fitsH(sim.stock!, h))) return first;
    if (left === 0) return null;
    // plays that bring a pile closer to the stock card
    const moves: { src: Source; card: Card; pile: number }[] = [];
    sim.hand.forEach((card, index) => { for (let pile = 0; pile < BUILDING_PILES; pile++) if (fitsH(card, sim.heights[pile])) moves.push({ src: { from: "hand", index }, card, pile }); });
    sim.discards.forEach((d, pile) => { const card = d[d.length - 1]; if (card === undefined) return; for (let b = 0; b < BUILDING_PILES; b++) if (fitsH(card, sim.heights[b])) moves.push({ src: { from: "discard", pile }, card, pile: b }); });
    for (const m of moves) {
      // only worthwhile if it climbs towards the stock card without passing it
      const h = sim.heights[m.pile];
      if (h + 1 >= stock) continue;
      const next: Sim = { heights: [...sim.heights], hand: [...sim.hand], discards: sim.discards.map(d => [...d]), stock: sim.stock };
      next.heights[m.pile] = h + 1;
      if (m.src.from === "hand") next.hand.splice(m.src.index, 1);
      else if (m.src.from === "discard") next.discards[m.src.pile].pop();
      const res = search(next, left - 1, first ?? { source: m.src, card: m.card, to: m.pile });
      if (res) return res;
    }
    return null;
  };
  return search(simOf(s), depth, null);
};

/** Would playing here hand an opponent the card they are waiting for? */
const helpsOpponent = (s: GameState, to: number): boolean => {
  const h = heightOf(s, to) + 1;
  return s.players.some((p, i) => i !== s.turn && (stockTop(p) === h + 1 || stockTop(p) === WILD));
};

/** Which card to throw away, and where: keep chains in descending order and never bury what the stock card needs. */
const chooseDiscard = (s: GameState, level: BotLevel): Action => {
  const me = currentPlayer(s);
  const want = stockTop(me);
  let best: { cost: number; index: number; pile: number } | null = null;
  me.hand.forEach((card, index) => {
    for (let pile = 0; pile < DISCARD_PILES; pile++) {
      const top = discardTop(me, pile);
      let cost = 0;
      if (level === "easy") cost = noise(s, index * 7 + pile);
      else {
        if (card === WILD) cost += 100;
        if (want !== undefined && want !== WILD) { if (card === want) cost += 60; else if (card < want) cost += 6 - Math.min(5, want - card); }
        if (top === undefined) cost -= 3;
        else {
          if (top === card) cost -= 4;
          else if (top === card + 1) cost -= 7;
          else if (top < card) cost += (card - top) * 3 + 8;
          else cost += (top - card - 1) * 1.2;
          if (want !== undefined && top === want) cost += 30;
          if (top === WILD) cost += 60;
        }
        if (level === "normal") cost += noise(s, index * 7 + pile) * 3;
      }
      if (!best || cost < best.cost) best = { cost, index, pile };
    }
  });
  return { type: "discard", index: best!.index, pile: best!.pile };
};

/** The next thing this player's bot would do: play a card if it helps, otherwise discard (or pass when it has no cards). */
export const chooseAction = (s: GameState, level: BotLevel = currentPlayer(s).level ?? "normal"): Action | null => {
  if (s.phase !== "play") return null;
  const me = currentPlayer(s);
  const plays = allPlays(s);

  // the stock pile is what wins the game: play that card whenever it fits
  const stockPlay = plays.find(p => p.source.from === "stock");
  if (stockPlay) return { type: "play", source: stockPlay.source, to: stockPlay.to };

  if (level !== "easy") {
    const plan = planStock(s, level === "hard" ? 4 : 2);
    if (plan) return { type: "play", source: plan.source, to: plan.to };
  } else if (plays.length && noise(s, 99) < 0.55) {
    const p = plays[Math.floor(noise(s, 5) * plays.length)];
    return { type: "play", source: p.source, to: p.to };
  }

  if (level !== "easy") {
    // other plays: discard tops first (they free a pile), then the hand; wildcards are kept back
    const rank = (p: Play) => (p.card === WILD ? 3 : p.source.from === "discard" ? 0 : 1);
    const sensible = plays
      .filter(p => p.card !== WILD && !(level === "hard" && helpsOpponent(s, p.to)))
      .sort((a, b) => rank(a) - rank(b) || b.card - a.card);
    // with a full hand of choices, spare wildcards are still worth using to clear the hand when they sweep several cards
    if (sensible.length) return { type: "play", source: sensible[0].source, to: sensible[0].to };
  }

  if (me.hand.length === 0) return canEndTurn(s) ? { type: "endTurn" } : null;
  return chooseDiscard(s, level);
};

/** A suggestion for a person who asks for a hint: what the strongest bot would do now. */
export const hint = (s: GameState): Action | null => chooseAction(s, "hard");

export { fits };
