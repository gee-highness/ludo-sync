import { useSyncExternalStore } from "react";
import { BASE_SEAT_INFO, SEATS, SEAT_INFO, type Seat } from "../ludo/board";
import { shade } from "./pieces";

/** What a player chooses: the colour of their pieces and start square, of their home (yard), and of their path (home column). */
export interface SeatColors {
  main: string;
  /** null follows `main`. */
  home: string | null;
  /** null follows a lighter shade of `main`. */
  path: string | null;
}
export type PaletteMap = Partial<Record<Seat, SeatColors | null>>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown): string | null => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null);

/** Cleans anything stored or received. Returns null when there is no usable main colour. */
export const sanitizeColors = (raw: unknown): SeatColors | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const main = hex(r.main);
  if (!main) return null;
  return { main, home: hex(r.home), path: hex(r.path) };
};

export const sanitizePalette = (raw: unknown): PaletteMap => {
  const out: PaletteMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const seat of SEATS) {
    const c = sanitizeColors((raw as Record<string, unknown>)[seat]);
    if (c) out[seat] = c;
  }
  return out;
};

/** The colours the game draws a seat with, given a choice (or none). */
export const resolveSeatColors = (seat: Seat, c: SeatColors | null | undefined) => {
  const base = BASE_SEAT_INFO[seat];
  if (!c) return { main: base.main, light: base.light, dark: base.dark, home: base.main, path: base.light };
  return {
    main: c.main, light: shade(c.main, 0.35), dark: shade(c.main, -0.38),
    home: c.home ?? c.main, path: c.path ?? shade(c.main, 0.35),
  };
};

let version = 0;
const listeners = new Set<() => void>();
let applied = "";

/** Makes the game draw each seat with the given colours (seats left out go back to the originals). */
export const applyPalette = (map: PaletteMap) => {
  const key = JSON.stringify(SEATS.map(s => map[s] ?? null));
  if (key === applied) return;
  applied = key;
  for (const seat of SEATS) Object.assign(SEAT_INFO[seat], resolveSeatColors(seat, map[seat]));
  version += 1;
  listeners.forEach(l => l());
};

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
/** Changes whenever the palette does; call it in any component that draws seat colours. */
export const usePalette = (): number => useSyncExternalStore(subscribe, () => version, () => 0);

/** Twelve ready-made colours, the four classic ones first. */
export const SWATCHES = [
  "#e53e3e", "#38a169", "#3182ce", "#805ad5", "#dd6b20", "#d69e2e",
  "#319795", "#d53f8c", "#2b6cb0", "#718096", "#c05621", "#e91e63",
] as const;

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** True when two colours would be hard to tell apart on the board. */
export const tooSimilar = (a: string, b: string): boolean => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 70;
};

const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Contrast of white text on a colour; below 3 the colour is too pale for the white labels used on the board. */
export const whiteContrast = (h: string): number => {
  const [r, g, b] = rgb(h);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (L + 0.05);
};
