import { useCallback, useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "./storage";

/**
 * How cards look on this device, in every game that uses playing cards: the back, the centre of the Jack, Queen and King, and a few
 * readability options. It is personal (each player sees their own choice) and never changes what the cards are.
 */
export const BACK_DESIGNS = ["lattice", "royal", "mandala", "waves", "stars", "argyle", "circuit", "leaves", "deco", "scales", "stripes", "plain"] as const;
export const ORNAMENTS = ["none", "crown", "star", "spade", "heart", "diamond", "club", "moon", "flame", "paw", "bolt", "gem"] as const;
export const BORDERS = ["none", "thin", "double", "ornate"] as const;
export const COURT_STYLES = ["classic", "emblem", "characters", "minimal"] as const;
export type BackDesign = (typeof BACK_DESIGNS)[number];
export type Ornament = (typeof ORNAMENTS)[number];
export type BorderStyle = (typeof BORDERS)[number];
export type CourtStyle = (typeof COURT_STYLES)[number];

export interface CardStyle {
  back: { design: BackDesign; primary: string; secondary: string; ornament: Ornament; border: BorderStyle; monogram: string; scale: number };
  court: { style: CourtStyle; accent: string; mirror: boolean; frame: boolean; chars: { 11: string; 12: string; 13: string } };
  faces: { fourColour: boolean; largeIndex: boolean; paper: string };
}

export const COLOUR_SWATCHES = ["#1e3a8a", "#2563eb", "#0ea5e9", "#0d9488", "#16a34a", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#be185d", "#7c3aed", "#4338ca", "#0f172a", "#475569", "#f8fafc", "#fde68a", "#fbcfe8", "#bbf7d0"] as const;
export const ACCENTS = ["#d4a017", "#c0c0c8", "#e11d74", "#0d9488", "#7c3aed", "#ea580c"] as const;
export const CHARACTERS = ["👑", "🦁", "🐯", "🐺", "🦅", "🐉", "🦊", "🐻", "🦄", "🧙", "🥷", "🧛", "🧜", "🦸", "🤴", "👸", "🏹", "🗡️", "🛡️", "🔮"] as const;
export const PAPERS = ["#f8fafc", "#fffbeb", "#f1f5f9", "#fef2f2"] as const;

export const DEFAULT_CARD_STYLE: CardStyle = {
  back: { design: "lattice", primary: "#1e3a8a", secondary: "#2563eb", ornament: "none", border: "thin", monogram: "", scale: 1 },
  court: { style: "classic", accent: "#d4a017", mirror: true, frame: true, chars: { 11: "🦊", 12: "🦄", 13: "🦁" } },
  faces: { fourColour: false, largeIndex: false, paper: "#f8fafc" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
/** An emoji or a short word for the middle of a card, never markup. */
const glyph = (v: unknown, d: string, max = 8) => (typeof v === "string" && v.length > 0 && v.length <= max && !/[<>&"]/.test(v) ? v : d);

/** Cleans anything read from storage or typed into a share code: unknown values fall back to the defaults, so a bad value can never break a card. */
export const sanitizeCardStyle = (raw: unknown): CardStyle => {
  const d = DEFAULT_CARD_STYLE;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const b = r.back ?? {}, c = r.court ?? {}, f = r.faces ?? {};
  const ch = (c.chars && typeof c.chars === "object" ? c.chars : {}) as Record<string, unknown>;
  const sc = typeof b.scale === "number" && Number.isFinite(b.scale) ? Math.min(1.6, Math.max(0.6, b.scale)) : d.back.scale;
  return {
    back: {
      design: oneOf(b.design, BACK_DESIGNS, d.back.design), primary: hex(b.primary, d.back.primary), secondary: hex(b.secondary, d.back.secondary),
      ornament: oneOf(b.ornament, ORNAMENTS, d.back.ornament), border: oneOf(b.border, BORDERS, d.back.border),
      monogram: typeof b.monogram === "string" ? b.monogram.replace(/[<>&"]/g, "").slice(0, 2) : "", scale: sc,
    },
    court: { style: oneOf(c.style, COURT_STYLES, d.court.style), accent: hex(c.accent, d.court.accent), mirror: bool(c.mirror, d.court.mirror), frame: bool(c.frame, d.court.frame), chars: { 11: glyph(ch["11"], d.court.chars[11]), 12: glyph(ch["12"], d.court.chars[12]), 13: glyph(ch["13"], d.court.chars[13]) } },
    faces: { fourColour: bool(f.fourColour, d.faces.fourColour), largeIndex: bool(f.largeIndex, d.faces.largeIndex), paper: hex(f.paper, d.faces.paper) },
  };
};

/** A short text that holds a whole look, to give to a friend. */
export const encodeCardStyle = (s: CardStyle): string => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(JSON.stringify(s)))) : "");
export const decodeCardStyle = (code: string): CardStyle | null => {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    return o && typeof o === "object" ? sanitizeCardStyle(o) : null;
  } catch { return null; }
};

// ---- the store: one look for the whole app, shared by every open table ----------------------------------

let current: CardStyle = DEFAULT_CARD_STYLE;
let loaded = false;
const listeners = new Set<() => void>();
const ensureLoaded = () => { if (!loaded) { loaded = true; current = sanitizeCardStyle(readJSON<unknown>("card-style", null)); } };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => { ensureLoaded(); return current; };
const getServerSnapshot = () => DEFAULT_CARD_STYLE;

export const setCardStyle = (next: CardStyle) => {
  ensureLoaded();
  current = sanitizeCardStyle(next);
  writeJSON("card-style", current);
  listeners.forEach(l => l());
};

type Patch = { back?: Partial<CardStyle["back"]>; court?: Partial<CardStyle["court"]>; faces?: Partial<CardStyle["faces"]> };
export const patchCardStyle = (p: Patch) => { ensureLoaded(); setCardStyle({ back: { ...current.back, ...p.back }, court: { ...current.court, ...p.court }, faces: { ...current.faces, ...p.faces } }); };

export const useCardStyle = (): [CardStyle, (p: Patch) => void, (s: CardStyle) => void] => {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const patch = useCallback((p: Patch) => patchCardStyle(p), []);
  const set = useCallback((n: CardStyle) => setCardStyle(n), []);
  return [s, patch, set];
};
