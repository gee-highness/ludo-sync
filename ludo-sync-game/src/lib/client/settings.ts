import { useCallback, useSyncExternalStore } from "react";
import { parseTuning } from "../ludo/tuning";
import { sanitizeColors, sanitizePalette, type PaletteMap, type SeatColors } from "./palette";
import { DEFAULT_RULES, type BotLevel, type Rules } from "../ludo/types";
import { readJSON, writeJSON } from "./storage";

export type RendererPref = "auto" | "3d" | "2d";
export type SpeedPref = "normal" | "fast" | "instant";
export type MotionPref = "auto" | "reduce" | "full";
export type QualityPref = "auto" | "high" | "low";
export type CameraPref = "tilt" | "top";
/** What to show on the board for a token that can move: its whole path as dots plus the landing square, just the landing square, or nothing. */
export type MovePreview = "dots" | "end" | "off";
export const MOVE_PREVIEWS: readonly MovePreview[] = ["dots", "end", "off"];
export type BoardTheme = "neon" | "classic" | "midnight" | "forest" | "sunset" | "paper";
export const BOARD_THEMES: readonly BoardTheme[] = ["neon", "classic", "midnight", "forest", "sunset", "paper"];

export interface Settings {
  sound: boolean;
  volume: number;
  haptics: boolean;
  renderer: RendererPref;
  quality: QualityPref;
  /** 3D camera angle. */
  camera: CameraPref;
  speed: SpeedPref;
  motion: MotionPref;
  /** Draw a shape on each token so colours are never the only cue. */
  symbols: boolean;
  /** Pulse the tokens that can move. */
  hints: boolean;
  movePreview: MovePreview;
  /** Play the move automatically when only one is possible. */
  autoMove: boolean;
  /** Pass-and-play: turn the board towards whoever is up. */
  followTurn: boolean;
  keepAwake: boolean;
  playerName: string;
  botLevel: BotLevel;
  /** Colours of the flat board. */
  boardTheme: BoardTheme;
  /** Colours chosen for each seat in games on this device (pass and play, bots). */
  palette: PaletteMap;
  /** Colours chosen for yourself in online rooms, whichever seat you sit in. */
  myColors: SeatColors | null;
  rules: Rules;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  sound: true,
  volume: 0.7,
  haptics: true,
  renderer: "auto",
  quality: "auto",
  camera: "tilt",
  speed: "normal",
  motion: "auto",
  symbols: false,
  hints: true,
  movePreview: "dots",
  autoMove: false,
  followTurn: false,
  keepAwake: true,
  playerName: "",
  botLevel: "normal",
  boardTheme: "neon",
  palette: {},
  myColors: null,
  rules: DEFAULT_RULES,
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Accepts whatever was stored and returns a complete, valid Settings. */
export const sanitizeSettings = (raw: unknown): Settings => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const rr = (r.rules && typeof r.rules === "object" ? r.rules : {}) as Record<string, unknown>;
  return {
    sound: bool(r.sound, d.sound),
    volume: typeof r.volume === "number" && r.volume >= 0 && r.volume <= 1 ? r.volume : d.volume,
    haptics: bool(r.haptics, d.haptics),
    renderer: oneOf(r.renderer, ["auto", "3d", "2d"], d.renderer),
    quality: oneOf(r.quality, ["auto", "high", "low"], d.quality),
    camera: oneOf(r.camera, ["tilt", "top"], d.camera),
    speed: oneOf(r.speed, ["normal", "fast", "instant"], d.speed),
    motion: oneOf(r.motion, ["auto", "reduce", "full"], d.motion),
    symbols: bool(r.symbols, d.symbols),
    hints: bool(r.hints, d.hints),
    movePreview: oneOf(r.movePreview, MOVE_PREVIEWS, d.movePreview),
    autoMove: bool(r.autoMove, d.autoMove),
    followTurn: bool(r.followTurn, d.followTurn),
    keepAwake: bool(r.keepAwake, d.keepAwake),
    playerName: typeof r.playerName === "string" ? r.playerName.slice(0, 20) : d.playerName,
    botLevel: oneOf(r.botLevel, ["easy", "normal", "hard"], d.botLevel),
    boardTheme: oneOf(r.boardTheme, BOARD_THEMES, d.boardTheme),
    palette: sanitizePalette(r.palette),
    myColors: sanitizeColors(r.myColors),
    rules: {
      threeSixes: bool(rr.threeSixes, d.rules.threeSixes),
      captureBonus: bool(rr.captureBonus, d.rules.captureBonus),
      finishBonus: bool(rr.finishBonus, d.rules.finishBonus),
      blockades: bool(rr.blockades, d.rules.blockades),
      twoDice: bool(rr.twoDice, d.rules.twoDice),
      safeSquares: bool(rr.safeSquares, d.rules.safeSquares),
      tycoon: bool(rr.tycoon, d.rules.tycoon ?? false),
      ...(parseTuning(rr.tuning) ? { tuning: parseTuning(rr.tuning)! } : {}),
    },
  };
};

let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

const ensureLoaded = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  current = sanitizeSettings(readJSON("settings", null));
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

const getSnapshot = () => { ensureLoaded(); return current; };
const getServerSnapshot = () => DEFAULT_SETTINGS;

export const getSettings = getSnapshot;

export const updateSettings = (patch: Partial<Settings>) => {
  ensureLoaded();
  current = sanitizeSettings({ ...current, ...patch });
  writeJSON("settings", current);
  listeners.forEach(l => l());
};

export const useSettings = (): [Settings, (patch: Partial<Settings>) => void] => {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback((patch: Partial<Settings>) => updateSettings(patch), []);
  return [s, update];
};
