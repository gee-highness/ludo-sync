import { DEFAULT_RULES, DEFAULT_TUNING, type Rules, type RuleTuning } from "./types";

export interface NumberOption { key: keyof RuleTuning; kind: "number"; label: string; hint: string; min: number; max: number; step: number; tycoon?: boolean; prefix?: string }
export interface BoolOption { key: keyof RuleTuning; kind: "bool"; label: string; hint: string; tycoon?: boolean }
export interface ChoiceOption { key: keyof RuleTuning; kind: "choice"; label: string; hint: string; choices: { value: string; label: string }[] }
export type TuningOption = NumberOption | BoolOption | ChoiceOption;

/** Every tunable, in the order the editor shows them. Also the source of truth for validation. */
export const TUNING_OPTIONS: readonly TuningOption[] = [
  { key: "entry", kind: "choice", label: "Leaving the yard", hint: "Which roll lets a token out",
    choices: [{ value: "six", label: "Only a 6" }, { value: "six-or-one", label: "A 6 or a 1" }, { value: "any", label: "Any roll" }] },
  { key: "exactFinish", kind: "bool", label: "Exact roll to finish", hint: "Off: overshooting the centre still gets you home" },
  { key: "sixBonus", kind: "bool", label: "Extra roll on a 6", hint: "Rolling a six earns another roll" },
  { key: "sixesLimit", kind: "number", label: "Sixes that lose the turn", hint: "Used when three-sixes is on", min: 2, max: 5, step: 1 },
  { key: "winTokens", kind: "number", label: "Tokens needed to win", hint: "Home tokens that end the game", min: 1, max: 4, step: 1 },
  { key: "startCash", kind: "number", label: "Starting cash", hint: "Tycoon", min: 200, max: 10000, step: 100, tycoon: true, prefix: "$" },
  { key: "enterBonus", kind: "number", label: "Leaving-the-yard bonus", hint: "Tycoon", min: 0, max: 500, step: 10, tycoon: true, prefix: "$" },
  { key: "homeBonus", kind: "number", label: "Token-home bonus", hint: "Tycoon", min: 0, max: 1000, step: 10, tycoon: true, prefix: "$" },
  { key: "captureLoot", kind: "number", label: "Capture loot", hint: "Tycoon: taken from the victim", min: 0, max: 500, step: 10, tycoon: true, prefix: "$" },
  { key: "tax", kind: "number", label: "Tax square", hint: "Tycoon", min: 0, max: 500, step: 10, tycoon: true, prefix: "$" },
  { key: "rentFactor", kind: "number", label: "Rent multiplier", hint: "Tycoon: 1 is normal", min: 0.5, max: 3, step: 0.5, tycoon: true },
  { key: "maxBuild", kind: "number", label: "Buildings per square", hint: "Tycoon: 0 turns building off", min: 0, max: 3, step: 1, tycoon: true },
];

/** Checks an untrusted tuning object. Returns null if any value is out of range or unknown. */
export const parseTuning = (raw: unknown): Partial<RuleTuning> | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const opt = TUNING_OPTIONS.find(o => o.key === k);
    if (!opt) return null;
    if (opt.kind === "bool") { if (typeof v !== "boolean") return null; }
    else if (opt.kind === "choice") { if (!opt.choices.some(c => c.value === v)) return null; }
    else if (typeof v !== "number" || !Number.isFinite(v) || v < opt.min || v > opt.max) return null;
    out[k] = v;
  }
  return out as Partial<RuleTuning>;
};

export interface RulePreset { id: string; name: string; blurb: string; rules: Rules }

const base = DEFAULT_RULES;
export const BUILT_IN_PRESETS: readonly RulePreset[] = [
  { id: "classic", name: "Classic", blurb: "The standard game", rules: { ...base } },
  { id: "quick", name: "Quick match", blurb: "Any roll gets out, first two tokens home win",
    rules: { ...base, tuning: { entry: "any", winTokens: 2, exactFinish: false } } },
  { id: "hardcore", name: "Hardcore", blurb: "Two dice, no safe squares, only a 6 gets out",
    rules: { ...base, twoDice: true, safeSquares: false, tuning: { sixesLimit: 2 } } },
  { id: "friendly", name: "Friendly", blurb: "No blockades, no penalties, easy finishing",
    rules: { ...base, blockades: false, threeSixes: false, tuning: { exactFinish: false, entry: "six-or-one" } } },
  { id: "tycoon", name: "Tycoon", blurb: "Property game on the Ludo board", rules: { ...base, tycoon: true } },
  { id: "tycoon-rush", name: "Tycoon rush", blurb: "Little cash, heavy rent, fast bankruptcies",
    rules: { ...base, tycoon: true, tuning: { startCash: 600, rentFactor: 2, winTokens: 2, captureLoot: 100 } } },
  { id: "tycoon-rich", name: "Tycoon rich", blurb: "Big bank, gentle rent, long game",
    rules: { ...base, tycoon: true, tuning: { startCash: 5000, rentFactor: 0.5, homeBonus: 400 } } },
];

export const sameRules = (a: Rules, b: Rules): boolean =>
  JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));

const normalise = (r: Rules) => {
  const tuning: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_TUNING).sort()) {
    const v = (r.tuning as Record<string, unknown> | undefined)?.[k];
    tuning[k] = v === undefined ? (DEFAULT_TUNING as unknown as Record<string, unknown>)[k] : v;
  }
  return { threeSixes: r.threeSixes, captureBonus: r.captureBonus, finishBonus: r.finishBonus, blockades: r.blockades, twoDice: r.twoDice, safeSquares: r.safeSquares, tycoon: !!r.tycoon, tuning };
};
