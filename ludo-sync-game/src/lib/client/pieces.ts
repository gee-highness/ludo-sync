import { useCallback, useSyncExternalStore } from "react";
import { SEATS, SEAT_INFO, TOKENS_PER_PLAYER, type Seat } from "../ludo/board";
import { readJSON, writeJSON } from "./storage";

export const SHAPES = [
  "classic", "disc", "pawn", "cone", "cube", "diamond", "star", "heart", "crown", "hex",
  "rocket", "ghost", "shield", "drop", "moon", "bolt", "flower", "donut",
] as const;
export type ShapeId = (typeof SHAPES)[number];

export const PATTERNS = ["gradient", "solid", "stripes", "dots", "checks", "rings", "split", "zigzag"] as const;
export type PatternId = (typeof PATTERNS)[number];
export const BASES = ["shadow", "ring", "plate", "none"] as const;
export type BaseId = (typeof BASES)[number];
export const IDLES = ["breathe", "none", "bounce", "spin", "pulse", "wobble"] as const;
export type IdleId = (typeof IDLES)[number];
export const TRAILS = ["dust", "none", "sparkle", "ember", "bubbles"] as const;
export type TrailId = (typeof TRAILS)[number];
export const FINISHES = ["glossy", "matte", "metal", "glass"] as const;
export type FinishId = (typeof FINISHES)[number];

/** Everything about how one piece looks. `null` colours follow the seat colour. */
export interface PieceDesign {
  shape: ShapeId;
  primary: string | null;
  secondary: string | null;
  pattern: PatternId;
  /** How strongly the pattern shows, 0 to 1. */
  patternStrength: number;
  outline: string | null;
  /** 0 to 1 of the maximum outline width. */
  outlineWidth: number;
  glow: string | null;
  glowStrength: number;
  /** One or two characters or an emoji drawn on the piece. */
  mark: string;
  markColor: string;
  /** 0.5 to 1.5. */
  markSize: number;
  /** 0.6 to 1.5, relative to the standard piece. */
  size: number;
  /** How deep the piece is in 3D, 0.3 to 1.6. */
  depth: number;
  finish: FinishId;
  shine: boolean;
  base: BaseId;
  idle: IdleId;
  trail: TrailId;
}

export const DEFAULT_DESIGN: Readonly<PieceDesign> = {
  shape: "classic", primary: null, secondary: null, pattern: "gradient", patternStrength: 0.6, outline: null, outlineWidth: 0.4,
  glow: null, glowStrength: 0.5, mark: "", markColor: "#ffffff", markSize: 1, size: 1, depth: 1, finish: "glossy", shine: true,
  base: "shadow", idle: "breathe", trail: "dust",
};

export type SeatDesigns = Record<Seat, PieceDesign[]>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const num = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const colour = (v: unknown, d: string | null): string | null => (v === null ? null : typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);

/** Cleans anything stored or imported into a complete, in-range design. */
export const sanitizeDesign = (raw: unknown): PieceDesign => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_DESIGN;
  const mark = typeof r.mark === "string" ? [...r.mark].slice(0, 2).join("") : d.mark;
  return {
    shape: oneOf(r.shape, SHAPES, d.shape),
    primary: colour(r.primary, d.primary),
    secondary: colour(r.secondary, d.secondary),
    pattern: oneOf(r.pattern, PATTERNS, d.pattern),
    patternStrength: num(r.patternStrength, 0, 1, d.patternStrength),
    outline: colour(r.outline, d.outline),
    outlineWidth: num(r.outlineWidth, 0, 1, d.outlineWidth),
    glow: colour(r.glow, d.glow),
    glowStrength: num(r.glowStrength, 0, 1, d.glowStrength),
    mark,
    markColor: colour(r.markColor, d.markColor) ?? d.markColor,
    markSize: num(r.markSize, 0.5, 1.5, d.markSize),
    size: num(r.size, 0.6, 1.5, d.size),
    depth: num(r.depth, 0.3, 1.6, d.depth),
    finish: oneOf(r.finish, FINISHES, d.finish),
    shine: typeof r.shine === "boolean" ? r.shine : d.shine,
    base: oneOf(r.base, BASES, d.base),
    idle: oneOf(r.idle, IDLES, d.idle),
    trail: oneOf(r.trail, TRAILS, d.trail),
  };
};

export const defaultDesigns = (): SeatDesigns =>
  Object.fromEntries(SEATS.map(s => [s, Array.from({ length: TOKENS_PER_PLAYER }, () => ({ ...DEFAULT_DESIGN }))])) as unknown as SeatDesigns;

export const sanitizeDesigns = (raw: unknown): SeatDesigns => {
  const out = defaultDesigns();
  if (!raw || typeof raw !== "object") return out;
  for (const seat of SEATS) {
    const list = (raw as Record<string, unknown>)[seat];
    if (!Array.isArray(list)) continue;
    out[seat] = Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => sanitizeDesign(list[i]));
  }
  return out;
};

export const isDefaultDesign = (d: PieceDesign) => JSON.stringify(d) === JSON.stringify(DEFAULT_DESIGN);

/** A design with seat colours filled in. */
export interface ResolvedDesign extends PieceDesign {
  primary: string;
  secondary: string;
}
export const resolveDesign = (d: PieceDesign, seat: Seat): ResolvedDesign => ({
  ...d, primary: d.primary ?? SEAT_INFO[seat].main, secondary: d.secondary ?? SEAT_INFO[seat].light,
});

/** Stable text for comparing designs, so renderers only rebuild what changed. */
export const designKey = (d: PieceDesign, seat: Seat): string => JSON.stringify(resolveDesign(d, seat));

/** Does any piece use something the shipped 3D model cannot show? Used to decide whether the model or procedural pieces are built. */
export const usesCustomShape = (d: PieceDesign) => d.shape !== "classic";

// ---- ready-made packs -----------------------------------------------------------------------------

export interface PiecePack { id: string; name: string; blurb: string; designs: (i: number) => Partial<PieceDesign> }

const pick = <T,>(list: readonly T[], i: number) => list[i % list.length];

export const PACKS: readonly PiecePack[] = [
  { id: "classic", name: "Classic", blurb: "The standard glossy pieces", designs: () => ({}) },
  { id: "chess", name: "Chess set", blurb: "Pawns, a crown and a shield", designs: i => ({ shape: pick(["pawn", "pawn", "shield", "crown"], i), pattern: "gradient", finish: "matte", base: "plate" }) },
  { id: "candy", name: "Candy", blurb: "Soft hearts, flowers and drops", designs: i => ({ shape: pick(["heart", "flower", "drop", "donut"], i), pattern: pick(["dots", "stripes", "gradient", "rings"], i), finish: "glossy", trail: "sparkle", idle: "bounce" }) },
  { id: "space", name: "Space", blurb: "Rockets, moons, stars and bolts", designs: i => ({ shape: pick(["rocket", "moon", "star", "bolt"], i), pattern: "gradient", finish: "metal", glow: "#7dd3fc", glowStrength: 0.6, trail: "ember", idle: "pulse" }) },
  { id: "royal", name: "Royal", blurb: "Crowns with gold outlines", designs: () => ({ shape: "crown", pattern: "solid", outline: "#facc15", outlineWidth: 0.7, finish: "metal", mark: "♛", markColor: "#facc15", idle: "wobble" }) },
  { id: "neon", name: "Neon", blurb: "Dark pieces that glow", designs: i => ({ shape: pick(["disc", "diamond", "hex", "donut"], i), primary: "#0f172a", pattern: "solid", outline: null, glowStrength: 0.9, finish: "glass", base: "ring", trail: "sparkle", idle: "pulse" }) },
  { id: "ghosts", name: "Spooky", blurb: "Ghosts and bats with a wobble", designs: i => ({ shape: pick(["ghost", "ghost", "moon", "ghost"], i), pattern: "gradient", finish: "glass", mark: pick(["👻", "🎃", "🦇", "💀"], i), idle: "wobble", trail: "bubbles" }) },
  { id: "zoo", name: "Animals", blurb: "A face on every piece", designs: i => ({ shape: "disc", pattern: "solid", mark: pick(["🐶", "🐱", "🐸", "🦊"], i), markSize: 1.3, idle: "bounce", finish: "matte" }) },
];

export const applyPack = (pack: PiecePack, seat: Seat, current: PieceDesign[]): PieceDesign[] =>
  current.map((_, i) => sanitizeDesign({ ...DEFAULT_DESIGN, ...pack.designs(i + seat) }));

export const randomDesign = (rand: () => number = Math.random): PieceDesign => {
  const hex = () => `#${Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0")}`;
  const p = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  return sanitizeDesign({
    ...DEFAULT_DESIGN, shape: p(SHAPES.filter(s => s !== "classic")), primary: hex(), secondary: hex(), pattern: p(PATTERNS),
    outline: rand() < 0.4 ? hex() : null, glow: rand() < 0.3 ? hex() : null, finish: p(FINISHES), idle: p(IDLES), trail: p(TRAILS),
    mark: rand() < 0.3 ? p(["★", "♥", "A", "7", "🙂", "🔥"]) : "",
  });
};

// ---- export / import -------------------------------------------------------------------------------

export const exportDesigns = (d: SeatDesigns): string => JSON.stringify({ kind: "ludo-sync-pieces", version: 1, pieces: d });

/** Parses an exported string. Returns null for anything that is not a piece set. */
export const importDesigns = (text: string): SeatDesigns | null => {
  try {
    const data = JSON.parse(text) as { kind?: unknown; pieces?: unknown };
    if (data?.kind !== "ludo-sync-pieces") return null;
    return sanitizeDesigns(data.pieces);
  } catch { return null; }
};

// ---- store -----------------------------------------------------------------------------------------

let current: SeatDesigns = defaultDesigns();
let loaded = false;
const listeners = new Set<() => void>();
const ensureLoaded = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  current = sanitizeDesigns(readJSON("pieces", null));
};
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const snapshot = () => { ensureLoaded(); return current; };
const serverSnapshot = () => SERVER_DEFAULT;
const SERVER_DEFAULT = defaultDesigns();

export const getDesigns = snapshot;
export const setDesigns = (next: SeatDesigns) => {
  ensureLoaded();
  current = sanitizeDesigns(next);
  writeJSON("pieces", current);
  listeners.forEach(l => l());
};
export const updatePiece = (seat: Seat, token: number, patch: Partial<PieceDesign>) => {
  const all = snapshot();
  setDesigns({ ...all, [seat]: all[seat].map((d, i) => (i === token ? sanitizeDesign({ ...d, ...patch }) : d)) } as SeatDesigns);
};

export const useDesigns = (): SeatDesigns => useSyncExternalStore(subscribe, snapshot, serverSnapshot);
export const useSetDesigns = () => useCallback(setDesigns, []);

// ---- colour helpers --------------------------------------------------------------------------------

const parse = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** Mixes a hex colour towards white (amount > 0) or black (amount < 0). */
export const shade = (hex: string, amount: number): string => {
  const target = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  const c = parse(hex).map(v => Math.round(v + (target - v) * k));
  return `#${c.map(v => v.toString(16).padStart(2, "0")).join("")}`;
};
