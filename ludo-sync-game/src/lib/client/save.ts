import { parseGameState } from "../ludo/validate";
import type { GameState } from "../ludo/types";
import type { Seat } from "../ludo/board";
import { sanitizePalette, type PaletteMap } from "./palette";
import { readJSON, removeKey, writeJSON } from "./storage";

export interface SavedGame {
  state: GameState;
  /** Seats played by people on this device. */
  humanSeats: Seat[];
  /** The colours chosen for each seat, so a resumed game looks the way it did. */
  palette: PaletteMap;
  savedAt: number;
}

export const saveGame = (state: GameState, humanSeats: Seat[], palette: PaletteMap = {}) => {
  if (state.phase === "over") { removeKey("save"); return; }
  writeJSON("save", { state, humanSeats, palette, savedAt: Date.now() });
};

export const loadGame = (): SavedGame | null => {
  const raw = readJSON<unknown>("save", null);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = parseGameState(r.state);
  if (!state || state.phase === "over") return null;
  const humanSeats = Array.isArray(r.humanSeats)
    ? (r.humanSeats.filter(s => Number.isInteger(s) && (s as number) >= 0 && (s as number) <= 3) as Seat[])
    : [];
  return { state, humanSeats, palette: sanitizePalette(r.palette), savedAt: typeof r.savedAt === "number" ? r.savedAt : 0 };
};

export const clearSavedGame = () => removeKey("save");
