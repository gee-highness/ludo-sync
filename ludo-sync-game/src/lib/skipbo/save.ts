import { readJSON, removeKey, writeJSON } from "../client/storage";
import { parseGameState } from "./validate";
import type { GameState } from "./types";

export interface SavedGame { state: GameState; you: number; /** Everyone plays on this one device, passing it round. */ hotseat: boolean; /** Today's challenge. */ daily: boolean; savedAt: number }

export const saveGame = (state: GameState, you: number, hotseat = false, daily = false) => {
  if (state.phase === "over") { removeKey("skipbo-save"); return; }
  writeJSON("skipbo-save", { state, you, hotseat, daily, savedAt: Date.now() });
};

export const loadGame = (): SavedGame | null => {
  const raw = readJSON<unknown>("skipbo-save", null);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = parseGameState(r.state);
  if (!state || state.phase === "over") return null;
  const you = typeof r.you === "number" && Number.isInteger(r.you) && r.you >= 0 && r.you < state.players.length ? r.you : 0;
  return { state, you, hotseat: r.hotseat === true, daily: r.daily === true, savedAt: typeof r.savedAt === "number" ? r.savedAt : 0 };
};

export const clearSavedGame = () => removeKey("skipbo-save");
