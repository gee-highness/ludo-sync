/** Things a player earns by levelling up. Cosmetic only: they never change how a game plays. */
export interface Unlock { id: string; name: string; level: number }

export interface CardBack extends Unlock { a: string; b: string; ring: string; mark: string }
export interface Felt extends Unlock { base: string; dark: string; fleck: string }

export const CARD_BACKS: readonly CardBack[] = [
  { id: "classic", name: "Classic blue", level: 1, a: "#1d4ed8", b: "#172554", ring: "#ffffff", mark: "#fde047" },
  { id: "sunset", name: "Sunset", level: 3, a: "#f97316", b: "#7c2d12", ring: "#fff7ed", mark: "#fef08a" },
  { id: "midnight", name: "Midnight", level: 5, a: "#4c1d95", b: "#0f0a24", ring: "#c4b5fd", mark: "#f0abfc" },
  { id: "mint", name: "Mint", level: 8, a: "#14b8a6", b: "#134e4a", ring: "#ccfbf1", mark: "#ffffff" },
  { id: "cherry", name: "Cherry", level: 12, a: "#e11d48", b: "#4c0519", ring: "#ffe4e6", mark: "#fde68a" },
  { id: "gold", name: "Gold leaf", level: 16, a: "#ca8a04", b: "#422006", ring: "#fef9c3", mark: "#ffffff" },
];

export const FELTS: readonly Felt[] = [
  { id: "green", name: "Card-room green", level: 1, base: "#1c6b47", dark: "#0c3a27", fleck: "#ffffff" },
  { id: "blue", name: "Ocean blue", level: 2, base: "#1e5a8a", dark: "#0b2a44", fleck: "#ffffff" },
  { id: "burgundy", name: "Burgundy", level: 4, base: "#7f1d3a", dark: "#3a0b19", fleck: "#ffe4e6" },
  { id: "slate", name: "Slate", level: 7, base: "#475569", dark: "#1e293b", fleck: "#e2e8f0" },
  { id: "teal", name: "Lagoon", level: 10, base: "#0f766e", dark: "#042f2e", fleck: "#ccfbf1" },
  { id: "plum", name: "Plum", level: 14, base: "#6b21a8", dark: "#2e1065", fleck: "#f3e8ff" },
];

export const backById = (id: string | undefined): CardBack => CARD_BACKS.find(b => b.id === id) ?? CARD_BACKS[0];
export const feltById = (id: string | undefined): Felt => FELTS.find(f => f.id === id) ?? FELTS[0];

export const isUnlocked = (u: Unlock, level: number) => level >= u.level;

/** What reaching `level` unlocked, for the level-up message. */
export const unlockedAt = (level: number): Unlock[] => [...CARD_BACKS, ...FELTS].filter(u => u.level === level);

/** The choice if it is open to a player of this level, otherwise the first one. */
export const allowed = <T extends Unlock>(list: readonly T[], id: string | undefined, level: number): T => {
  const hit = list.find(u => u.id === id);
  return hit && isUnlocked(hit, level) ? hit : list[0];
};
