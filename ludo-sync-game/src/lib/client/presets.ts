import { parseGameState } from "../ludo/validate";
import { BUILT_IN_PRESETS, type RulePreset } from "../ludo/tuning";
import type { Rules } from "../ludo/types";
import { readJSON, writeJSON } from "./storage";

const MAX_SAVED = 20;

/** Rules the person saved under their own name. Each is re-checked on load, so edited storage cannot inject bad rules. */
export const loadSavedPresets = (): RulePreset[] => {
  const raw = readJSON<unknown>("presets", []);
  if (!Array.isArray(raw)) return [];
  const out: RulePreset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, name, rules } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || !rules) continue;
    // reuse the game-state validator by wrapping the rules in a minimal state
    const probe = parseGameState({
      version: 1, rules, players: [
        { seat: 0, name: "a", kind: "human", tokens: [-1, -1, -1, -1] }, { seat: 1, name: "b", kind: "human", tokens: [-1, -1, -1, -1] },
      ], turn: 0, phase: "roll", dice: [], rolled: [], sixes: 0, earned: null, winner: null, rng: 1, seq: 0,
      ...((rules as Rules).tycoon ? { tycoon: { cash: [0, 0, 0, 0], owner: new Array(52).fill(-1), level: new Array(52).fill(0), pending: null } } : {}),
    });
    if (probe) out.push({ id, name: name.slice(0, 24), blurb: "Your preset", rules: probe.rules });
  }
  return out.slice(0, MAX_SAVED);
};

export const savePreset = (name: string, rules: Rules): RulePreset[] => {
  const clean = name.trim().slice(0, 24) || "My rules";
  const list = loadSavedPresets().filter(p => p.name !== clean);
  list.unshift({ id: `u-${Date.now().toString(36)}`, name: clean, blurb: "Your preset", rules });
  const kept = list.slice(0, MAX_SAVED);
  writeJSON("presets", kept);
  return kept;
};

export const deletePreset = (id: string): RulePreset[] => {
  const kept = loadSavedPresets().filter(p => p.id !== id);
  writeJSON("presets", kept);
  return kept;
};

export const allPresets = (saved: RulePreset[]): RulePreset[] => [...BUILT_IN_PRESETS, ...saved];
