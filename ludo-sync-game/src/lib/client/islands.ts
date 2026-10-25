import { useSyncExternalStore } from "react";
import { SEATS, type Seat } from "../ludo/board";
import { readJSON, writeJSON } from "./storage";

/** How a player's buildings look on the properties they own: their "island". */
export const BUILDING_THEMES = ["neon", "brownstone", "tropical", "industrial", "glass"] as const;
export type BuildingTheme = (typeof BUILDING_THEMES)[number];
export const ROOFS = ["flat", "antenna", "dome", "helipad"] as const;
export type Roof = (typeof ROOFS)[number];
export const WINDOWS = ["grid", "stripes", "arched"] as const;
export type WindowStyle = (typeof WINDOWS)[number];

export const SHAPES = ["block", "round"] as const;
export type Shape = (typeof SHAPES)[number];
export const GROUNDS = ["slab", "grass", "sand", "marble", "water"] as const;
export type Ground = (typeof GROUNDS)[number];
export const FINISHES = ["auto", "matte", "glossy", "metallic"] as const;
export type Finish = (typeof FINISHES)[number];
export const EXTRAS = ["flags", "trees", "lamps", "fence"] as const;
export type Extra = (typeof EXTRAS)[number];
/** Colour of the pad each building stands on. */
export const GROUND_COLOURS: Record<Ground, string> = { slab: "#0e1322", grass: "#2f6b3a", sand: "#d9c48f", marble: "#e6e2da", water: "#1c5d86" };

export interface IslandStyle {
  theme: BuildingTheme;
  /** Wall colour. */
  primary: string;
  /** Trim, sign and glow colour. */
  accent: string;
  roof: Roof;
  windows: WindowStyle;
  /** Up to 8 letters shown on the building's sign. */
  sign: string;
  /** 0 to 1, how strongly windows and the sign glow. */
  glow: number;
  /** How tall the building is compared with the standard, 0.6 to 1.5. */
  height: number;
  /** How much of the plot it fills, 0.7 to 1.1. */
  footprint: number;
  shape: Shape;
  /** What the plot is made of. */
  ground: Ground;
  /** The small things that stand around the building. */
  extras: Extra[];
  /** How the walls catch the light; auto follows the style. */
  finish: Finish;
  /** Colour the lit windows give off; empty means a warm white. */
  lights: string;
}

export type IslandMap = Partial<Record<Seat, IslandStyle>>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);

export const DEFAULT_ISLAND: Readonly<IslandStyle> = {
  theme: "neon", primary: "#1e2a4a", accent: "#22d3ee", roof: "antenna", windows: "grid", sign: "", glow: 0.7,
  height: 1, footprint: 1, shape: "block", ground: "slab", extras: [], finish: "auto", lights: "",
};
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Cleans anything stored or received into a complete, valid island style. */
export const sanitizeIsland = (raw: unknown): IslandStyle => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ISLAND;
  const sign = typeof r.sign === "string" ? r.sign.replace(/[^\p{L}\p{N} !&'-]/gu, "").slice(0, 8).toUpperCase() : d.sign;
  const glow = typeof r.glow === "number" && Number.isFinite(r.glow) ? Math.min(1, Math.max(0, r.glow)) : d.glow;
  return {
    theme: oneOf(r.theme, BUILDING_THEMES, d.theme), primary: hex(r.primary, d.primary), accent: hex(r.accent, d.accent),
    roof: oneOf(r.roof, ROOFS, d.roof), windows: oneOf(r.windows, WINDOWS, d.windows), sign, glow,
    height: num(r.height, 0.6, 1.5, d.height), footprint: num(r.footprint, 0.7, 1.1, d.footprint),
    shape: oneOf(r.shape, SHAPES, d.shape), ground: oneOf(r.ground, GROUNDS, d.ground), finish: oneOf(r.finish, FINISHES, d.finish),
    extras: Array.isArray(r.extras) ? EXTRAS.filter(x => (r.extras as unknown[]).includes(x)) : [],
    lights: r.lights === "" ? "" : hex(r.lights, d.lights),
  };
};

export const sanitizeIslands = (raw: unknown): IslandMap => {
  const out: IslandMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const seat of SEATS) {
    const v = (raw as Record<string, unknown>)[seat];
    if (v) out[seat] = sanitizeIsland(v);
  }
  return out;
};

// ---- store: the islands chosen on this device, one style per seat ---------------------------------------

let current: IslandMap = {};
let loaded = false;
const listeners = new Set<() => void>();
const ensureLoaded = () => { if (loaded || typeof window === "undefined") return; loaded = true; current = sanitizeIslands(readJSON("islands", null)); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const EMPTY: IslandMap = {};

export const getIslands = (): IslandMap => { ensureLoaded(); return current; };
export const setIslands = (next: IslandMap) => {
  ensureLoaded();
  current = sanitizeIslands(next);
  writeJSON("islands", current);
  listeners.forEach(l => l());
};
export const setIsland = (seat: Seat, style: IslandStyle | null) => {
  const next = { ...getIslands() };
  if (style) next[seat] = style; else delete next[seat];
  setIslands(next);
};
/** A seat's island, or a neon one in the seat's own colour when none was chosen. */
export const islandFor = (seat: Seat, map: IslandMap, seatColour: string): IslandStyle => map[seat] ?? { ...DEFAULT_ISLAND, accent: seatColour };
export const useIslands = (): IslandMap => useSyncExternalStore(subscribe, getIslands, () => EMPTY);
