import { readJSON, writeJSON } from "../client/storage";

/**
 * Every rule of every game is an option here, so the people playing decide the rules: the host in an online room, whoever sets up a
 * local game. One schema drives the editor, validation of untrusted input, presets and share codes.
 */
export type RuleValue = boolean | number | string;
export type RuleValues = Record<string, RuleValue>;

interface Base { key: string; label: string; hint?: string; group?: string; /** Only shown (and used) when this returns true for the other values. */ when?: (v: RuleValues) => boolean }
export interface BoolRule extends Base { kind: "bool"; def: boolean }
export interface NumberRule extends Base { kind: "number"; def: number; min: number; max: number; step?: number; prefix?: string; suffix?: string; /** Shown instead of the number at this value, e.g. 0 -> "Off". */ zeroLabel?: string }
export interface ChoiceRule extends Base { kind: "choice"; def: string; choices: { value: string; label: string }[] }
export type RuleDef = BoolRule | NumberRule | ChoiceRule;

export interface RulePreset { id: string; name: string; blurb: string; values: RuleValues }
export interface RuleSchema { rules: RuleDef[]; presets: RulePreset[] }

export const defaultsOf = (schema: RuleSchema): RuleValues => Object.fromEntries(schema.rules.map(r => [r.key, r.def]));

const clampNum = (r: NumberRule, v: number): number => {
  const step = r.step ?? 1;
  const snapped = Math.round((v - r.min) / step) * step + r.min;
  return Math.max(r.min, Math.min(r.max, Math.round(snapped * 1000) / 1000));
};

/** Cleans untrusted values: unknown keys are dropped, wrong types and out-of-range numbers fall back or clamp. Always returns a complete set. */
export const sanitizeRules = (schema: RuleSchema, raw: unknown): RuleValues => {
  const out = defaultsOf(schema);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const r of schema.rules) {
    const v = o[r.key];
    if (r.kind === "bool" && typeof v === "boolean") out[r.key] = v;
    else if (r.kind === "number" && typeof v === "number" && Number.isFinite(v)) out[r.key] = clampNum(r, v);
    else if (r.kind === "choice" && typeof v === "string" && r.choices.some(c => c.value === v)) out[r.key] = v;
  }
  return out;
};

export const num = (v: RuleValues, k: string): number => v[k] as number;
export const flag = (v: RuleValues, k: string): boolean => v[k] === true;
export const pick = (v: RuleValues, k: string): string => v[k] as string;

/** The rules that currently apply, i.e. whose `when` is satisfied. */
export const visibleRules = (schema: RuleSchema, v: RuleValues): RuleDef[] => schema.rules.filter(r => !r.when || r.when(v));

export const sameRules = (a: RuleValues, b: RuleValues): boolean => Object.keys(a).every(k => a[k] === b[k]) && Object.keys(b).every(k => a[k] === b[k]);

export const presetMatching = (schema: RuleSchema, v: RuleValues, saved: RulePreset[] = []): RulePreset | null =>
  [...schema.presets, ...saved].find(p => sameRules(sanitizeRules(schema, p.values), v)) ?? null;

/** A line for each rule that differs from the defaults, for lobbies and "how this game is set up". */
export const describeRules = (schema: RuleSchema, v: RuleValues): string[] => {
  const d = defaultsOf(schema);
  return visibleRules(schema, v).filter(r => v[r.key] !== d[r.key]).map(r => {
    const x = v[r.key];
    if (r.kind === "bool") return `${r.label}: ${x ? "on" : "off"}`;
    if (r.kind === "choice") return `${r.label}: ${r.choices.find(c => c.value === x)?.label ?? x}`;
    return `${r.label}: ${x === 0 && r.zeroLabel ? r.zeroLabel : `${r.prefix ?? ""}${x}${r.suffix ?? ""}`}`;
  });
};

// ---- share codes: rules as a short piece of text that can be pasted to a friend -------------------

const b64 = (s: string) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64"));
const unb64 = (s: string) => (typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary"));

/** Only the values that differ from the defaults, so codes stay short. */
export const encodeRules = (gameId: string, schema: RuleSchema, v: RuleValues): string => {
  const d = defaultsOf(schema);
  const diff = Object.fromEntries(Object.entries(v).filter(([k, x]) => d[k] !== x));
  return `${gameId}:${b64(JSON.stringify(diff)).replace(/=+$/, "")}`;
};

export const decodeRules = (gameId: string, schema: RuleSchema, code: string): RuleValues | null => {
  const [id, body] = code.trim().split(":");
  if (id !== gameId || !body || body.length > 2000) return null;
  try { return sanitizeRules(schema, JSON.parse(unb64(body))); } catch { return null; }
};

// ---- the player's own saved presets and last-used rules, per game -------------------------------

const MAX_SAVED = 12;

export const loadSavedPresets = (gameId: string, schema: RuleSchema): RulePreset[] => {
  const raw = readJSON<unknown>(`rules-presets:${gameId}`, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is RulePreset => !!p && typeof p.id === "string" && typeof p.name === "string")
    .slice(0, MAX_SAVED).map(p => ({ id: p.id.slice(0, 24), name: p.name.replace(/[\u0000-\u001f]/g, "").slice(0, 24) || "My rules", blurb: "Saved on this device", values: sanitizeRules(schema, p.values) }));
};
export const savePresets = (gameId: string, list: RulePreset[]) => writeJSON(`rules-presets:${gameId}`, list.slice(0, MAX_SAVED));
export const loadLastRules = (gameId: string, schema: RuleSchema): RuleValues => sanitizeRules(schema, readJSON<unknown>(`rules-last:${gameId}`, null));
export const saveLastRules = (gameId: string, v: RuleValues) => writeJSON(`rules-last:${gameId}`, v);
