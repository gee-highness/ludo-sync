import { useCallback, useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "./storage";

/**
 * How this person likes to interact, in every game: dragging, bigger buttons, bigger text, keyboard help. Personal to the device,
 * and never changes the rules.
 */
export interface Interaction {
  /** Let cards and pieces be dragged (taps and keys always work too). */
  drag: boolean;
  /** Light up every place a dragged card can go. */
  dropHints: boolean;
  /** At least 48 px for every button and control, with more space between them. */
  bigTargets: boolean;
  /** Scale all text and controls. */
  textScale: 100 | 115 | 130 | 150;
  /** Ask "are you sure" before a move that cannot be undone (a capture, a played card). */
  confirm: boolean;
  /** Show keyboard shortcuts on buttons and allow them. */
  shortcuts: boolean;
}

export const DEFAULT_INTERACTION: Interaction = { drag: true, dropHints: true, bigTargets: false, textScale: 100, confirm: false, shortcuts: true };
const SCALES = [100, 115, 130, 150] as const;

export const sanitizeInteraction = (raw: unknown): Interaction => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (k: keyof Interaction) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (DEFAULT_INTERACTION[k] as boolean));
  const t = SCALES.find(s => s === r.textScale) ?? DEFAULT_INTERACTION.textScale;
  return { drag: b("drag"), dropHints: b("dropHints"), bigTargets: b("bigTargets"), textScale: t, confirm: b("confirm"), shortcuts: b("shortcuts") };
};

let current: Interaction = DEFAULT_INTERACTION;
let loaded = false;
const listeners = new Set<() => void>();
const ensure = () => { if (!loaded) { loaded = true; current = sanitizeInteraction(readJSON<unknown>("interaction", null)); } };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => { ensure(); return current; };

export const getInteraction = (): Interaction => snapshot();
export const updateInteraction = (patch: Partial<Interaction>) => {
  ensure();
  current = sanitizeInteraction({ ...current, ...patch });
  writeJSON("interaction", current);
  listeners.forEach(l => l());
};

export const useInteraction = (): [Interaction, (p: Partial<Interaction>) => void] => {
  const s = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_INTERACTION);
  return [s, useCallback((p: Partial<Interaction>) => updateInteraction(p), [])];
};
