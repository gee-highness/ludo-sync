import type { PieceDesign } from "../client/pieces";
import { sanitizeColors, type SeatColors } from "../client/palette";
import { parseGameState } from "../ludo/validate";
import { parseTuning } from "../ludo/tuning";
import type { BotLevel, GameState, Rules } from "../ludo/types";
import { isClientId, isRoomCode } from "./crypto";
import { CHAT_HISTORY, cleanChat, cleanText, parsePieces, type ChatItem } from "./protocol";

export const HOST_ID = "host";
export const RESUME_VERSION = 1;

export type ResumeSlot = { kind: "empty" } | { kind: "bot"; level: BotLevel; name: string } | { kind: "human"; id: string };
export interface ResumeMember { id: string; name: string; host: boolean; pieces: PieceDesign[] | null; colors?: SeatColors }

/** Everything a host needs to open the same room again after its screen was left or the page was closed. JSON-serialisable. */
export interface HostResume {
  v: typeof RESUME_VERSION;
  code: string;
  /** The host's own name. */
  name: string;
  rules: Rules;
  turnMs: number;
  phase: "lobby" | "playing";
  gameId: number;
  n: number;
  state: GameState | null;
  slots: ResumeSlot[];
  members: ResumeMember[];
  banned: string[];
  chat: ChatItem[];
  chatId: number;
  reactionId: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const BOOLS = ["threeSixes", "captureBonus", "finishBonus", "blockades", "twoDice", "safeSquares"] as const;

const parseRulesLoose = (v: unknown): Rules | null => {
  if (!isObj(v)) return null;
  const out: Record<string, unknown> = {};
  for (const k of BOOLS) { if (typeof v[k] !== "boolean") return null; out[k] = v[k]; }
  if (v.tycoon !== undefined) { if (typeof v.tycoon !== "boolean") return null; out.tycoon = v.tycoon; }
  if (v.tuning !== undefined) { const t = parseTuning(v.tuning); if (!t) return null; out.tuning = t; }
  return out as unknown as Rules;
};

const memberId = (v: unknown): v is string => v === HOST_ID || isClientId(v);

/** Checks an untrusted resume object (it comes from storage) and returns a clean copy, or null if anything is off. */
export const parseHostResume = (raw: unknown): HostResume | null => {
  if (!isObj(raw) || raw.v !== RESUME_VERSION) return null;
  if (typeof raw.code !== "string" || !isRoomCode(raw.code)) return null;
  if (typeof raw.name !== "string") return null;
  const rules = parseRulesLoose(raw.rules);
  if (!rules) return null;
  if (!int(raw.turnMs, 0, 300_000) || !int(raw.gameId, 0, Number.MAX_SAFE_INTEGER) || !int(raw.n, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (!int(raw.chatId, 0, Number.MAX_SAFE_INTEGER) || !int(raw.reactionId, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (raw.phase !== "lobby" && raw.phase !== "playing") return null;
  let state: GameState | null = null;
  if (raw.state !== null) { state = parseGameState(raw.state); if (!state) return null; }
  if ((raw.phase === "playing") !== (state !== null)) return null;

  if (!Array.isArray(raw.members) || raw.members.length < 1 || raw.members.length > 12) return null;
  const members: ResumeMember[] = [];
  for (const m of raw.members) {
    if (!isObj(m) || !memberId(m.id) || typeof m.name !== "string" || typeof m.host !== "boolean") return null;
    if (members.some(x => x.id === m.id)) return null;
    if ((m.id === HOST_ID) !== m.host) return null;
    const pieces = m.pieces === null || m.pieces === undefined ? null : parsePieces(m.pieces);
    if (m.pieces !== null && m.pieces !== undefined && !pieces) return null;
    const colors = sanitizeColors(m.colors) ?? undefined;
    members.push({ id: m.id, name: cleanText(m.name, m.host ? "Host" : "Guest"), host: m.host, pieces, ...(colors ? { colors } : {}) });
  }
  if (members.filter(m => m.host).length !== 1) return null;

  if (!Array.isArray(raw.slots) || raw.slots.length !== 4) return null;
  const slots: ResumeSlot[] = [];
  for (const s of raw.slots) {
    if (!isObj(s)) return null;
    if (s.kind === "empty") slots.push({ kind: "empty" });
    else if (s.kind === "bot") {
      if (s.level !== "easy" && s.level !== "normal" && s.level !== "hard") return null;
      if (typeof s.name !== "string") return null;
      slots.push({ kind: "bot", level: s.level, name: cleanText(s.name, "Bot") });
    } else if (s.kind === "human") {
      if (!memberId(s.id) || !members.some(m => m.id === s.id)) return null;
      if (slots.some(x => x.kind === "human" && x.id === s.id)) return null;
      slots.push({ kind: "human", id: s.id });
    } else return null;
  }

  if (!Array.isArray(raw.banned) || raw.banned.length > 100 || !raw.banned.every(isClientId)) return null;

  if (!Array.isArray(raw.chat) || raw.chat.length > 500) return null;
  const chat: ChatItem[] = [];
  for (const c of raw.chat) {
    if (!isObj(c) || !int(c.id, 0, Number.MAX_SAFE_INTEGER) || typeof c.at !== "number" || !Number.isFinite(c.at)) return null;
    if (c.seat !== null && !int(c.seat, 0, 3)) return null;
    const text = cleanChat(c.text);
    if (!text || typeof c.name !== "string") continue;
    chat.push({ id: c.id, seat: c.seat as ChatItem["seat"], name: cleanText(c.name, "Guest"), text, at: c.at });
  }

  return {
    v: RESUME_VERSION, code: raw.code, name: cleanText(raw.name, "Host"), rules, turnMs: raw.turnMs, phase: raw.phase, gameId: raw.gameId, n: raw.n,
    state, slots, members, banned: [...raw.banned] as string[], chat: chat.slice(-CHAT_HISTORY), chatId: raw.chatId, reactionId: raw.reactionId,
  };
};
