import { useCallback, useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "./storage";

/** The games a player has pinned to the top of the home screen, in the order they pinned them. */
const KEY = "pins-v1";
const MAX = 40;
const listeners = new Set<() => void>();
let cache: readonly string[] | null = null;
const EMPTY: readonly string[] = [];

export const cleanPins = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{2,24}$/.test(x)))].slice(0, MAX) : [];

export const loadPins = (): readonly string[] => (cache ??= cleanPins(readJSON<unknown>(KEY, [])));

/** Pure: the list after pinning or unpinning one game. */
export const withPin = (pins: readonly string[], id: string, pinned: boolean): string[] => {
  const rest = pins.filter(p => p !== id);
  return pinned ? [...rest, id].slice(-MAX) : rest;
};

export const setPinned = (id: string, pinned: boolean) => {
  cache = withPin(loadPins(), id, pinned);
  writeJSON(KEY, cache);
  listeners.forEach(l => l());
};

/** Pinned games first (in pin order), everything else in its usual order. */
export const orderByPins = <T extends { id: string }>(games: readonly T[], pins: readonly string[]): { pinned: T[]; others: T[] } => {
  const pinned = pins.flatMap(p => { const g = games.find(x => x.id === p); return g ? [g] : []; });
  return { pinned, others: games.filter(g => !pins.includes(g.id)) };
};

export const usePins = () => {
  const pins = useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    loadPins,
    () => EMPTY,
  );
  const toggle = useCallback((id: string) => setPinned(id, !loadPins().includes(id)), []);
  return { pins, isPinned: (id: string) => pins.includes(id), toggle };
};
