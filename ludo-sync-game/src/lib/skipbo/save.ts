import { readJSON, removeKey, writeJSON } from "../client/storage";
import { parseGameState } from "./validate";
import type { GameState } from "./types";

export interface SavedGame { state: GameState; you: number; /** Everyone plays on this one device, passing it round. */ hotseat: boolean; savedAt: number }

export const saveGame = (state: GameState, you: number, hotseat = false) => {
  if (state.phase === "over") { removeKey("skipbo-save"); return; }
  writeJSON("skipbo-save", { state, you, hotseat, savedAt: Date.now() });
};

export const loadGame = (): SavedGame | null => {
  const raw = readJSON<unknown>("skipbo-save", null);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = parseGameState(r.state);
  if (!state || state.phase === "over") return null;
  const you = typeof r.you === "number" && Number.isInteger(r.you) && r.you >= 0 && r.you < state.players.length ? r.you : 0;
  return { state, you, hotseat: r.hotseat === true, savedAt: typeof r.savedAt === "number" ? r.savedAt : 0 };
};

export const clearSavedGame = () => removeKey("skipbo-save");

export interface SkipBoStats { played: number; won: number; piles: number }
const EMPTY: SkipBoStats = { played: 0, won: 0, piles: 0 };
export const loadStats = (): SkipBoStats => {
  const r = readJSON<Partial<SkipBoStats>>("skipbo-stats", {});
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  return { played: n(r.played), won: n(r.won), piles: n(r.piles) };
};
export const recordGame = (won: boolean, piles: number): SkipBoStats => {
  const s = loadStats();
  const next = { played: s.played + 1, won: s.won + (won ? 1 : 0), piles: s.piles + piles };
  writeJSON("skipbo-stats", next);
  return next;
};
export { EMPTY as EMPTY_STATS };
