import { SEATS, type Seat } from "../ludo/board";

/** How a player's buildings look on the properties they own: their "island". */
export const BUILDING_THEMES = ["neon", "brownstone", "tropical", "industrial", "glass"] as const;
export type BuildingTheme = (typeof BUILDING_THEMES)[number];
export const ROOFS = ["flat", "antenna", "dome", "helipad"] as const;
export type Roof = (typeof ROOFS)[number];
export const WINDOWS = ["grid", "stripes", "arched"] as const;
export type WindowStyle = (typeof WINDOWS)[number];

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
}

export type IslandMap = Partial<Record<Seat, IslandStyle>>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);

export const DEFAULT_ISLAND: Readonly<IslandStyle> = {
  theme: "neon", primary: "#1e2a4a", accent: "#22d3ee", roof: "antenna", windows: "grid", sign: "", glow: 0.7,
};

/** Cleans anything stored or received into a complete, valid island style. */
export const sanitizeIsland = (raw: unknown): IslandStyle => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ISLAND;
  const sign = typeof r.sign === "string" ? r.sign.replace(/[^\p{L}\p{N} !&'-]/gu, "").slice(0, 8).toUpperCase() : d.sign;
  const glow = typeof r.glow === "number" && Number.isFinite(r.glow) ? Math.min(1, Math.max(0, r.glow)) : d.glow;
  return {
    theme: oneOf(r.theme, BUILDING_THEMES, d.theme), primary: hex(r.primary, d.primary), accent: hex(r.accent, d.accent),
    roof: oneOf(r.roof, ROOFS, d.roof), windows: oneOf(r.windows, WINDOWS, d.windows), sign, glow,
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
