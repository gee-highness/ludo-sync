import { isClientId } from "../../net/crypto";
import { CHAT_HISTORY, cleanChat } from "../../net/protocol";
import type { RuleValues } from "../rules";
import type { Frame } from "../table";
import type { BaseView, BotLevel, GameEvent } from "../types";

export const PROTOCOL = 1;
export const roomId = (gameId: string, code: string) => `g-${gameId}-${code}`;
export { CHAT_HISTORY, cleanChat };
export const MAX_NAME = 20;
export const REACTIONS = ["👍", "😂", "😮", "😡", "🎉", "🙏", "❤️", "👏", "🔥", "😢", "🤔", "😎"] as const;

export interface ChatItem { id: number; slot: number | null; name: string; text: string; at: number }
export type SlotView =
  | { slot: number; kind: "empty" }
  | { slot: number; kind: "bot"; name: string; level: BotLevel }
  | { slot: number; kind: "human"; name: string; connected: boolean; host: boolean };

export interface RoomView {
  code: string;
  hostName: string;
  gameId: number;
  phase: "lobby" | "playing";
  rules: RuleValues;
  turnMs: number;
  slots: SlotView[];
  spectators: number;
  you: { slot: number | null; player: number | null };
  n: number;
  frame: Frame<unknown> | null;
  away: number[];
}

export type ClientMsg =
  | { t: "join"; v: number; name: string; id: string }
  | { t: "act"; action: unknown }
  | { t: "name"; name: string }
  | { t: "react"; emoji: string }
  | { t: "chat"; text: string }
  | { t: "sync" }
  | { t: "bye" };

export type HostMsg =
  | { t: "room"; room: RoomView }
  | { t: "frame"; gameId: number; n: number; frame: Frame<unknown> }
  | { t: "reaction"; slot: number | null; name: string; emoji: string }
  | { t: "chat"; item: ChatItem }
  | { t: "chatlog"; items: ChatItem[] }
  | { t: "reject"; reason: string }
  | { t: "kicked" }
  | { t: "bye" }
  | { t: "error"; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const cleanText = (v: unknown, fallback: string): string =>
  (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "") || fallback;

export const parseClientMsg = (raw: unknown): ClientMsg | null => {
  if (!isObj(raw) || typeof raw.t !== "string") return null;
  switch (raw.t) {
    case "join": return raw.v === PROTOCOL && isClientId(raw.id) && typeof raw.name === "string" ? { t: "join", v: PROTOCOL, name: cleanText(raw.name, "Guest"), id: raw.id } : null;
    case "act": return "action" in raw ? { t: "act", action: raw.action } : null;
    case "name": return typeof raw.name === "string" ? { t: "name", name: cleanText(raw.name, "Guest") } : null;
    case "react": return typeof raw.emoji === "string" && (REACTIONS as readonly string[]).includes(raw.emoji) ? { t: "react", emoji: raw.emoji } : null;
    case "chat": { const text = cleanChat(raw.text); return text ? { t: "chat", text } : null; }
    case "sync": return { t: "sync" };
    case "bye": return { t: "bye" };
    default: return null;
  }
};

const parseChatItem = (v: unknown): ChatItem | null => {
  if (!isObj(v) || !Number.isInteger(v.id) || typeof v.name !== "string" || typeof v.at !== "number") return null;
  const text = cleanChat(v.text);
  return text ? { id: v.id as number, slot: Number.isInteger(v.slot) ? (v.slot as number) : null, name: cleanText(v.name, "Player"), text, at: v.at } : null;
};

const parseBase = (v: unknown): BaseView | null => {
  if (!isObj(v) || !Array.isArray(v.players) || v.players.length > 12 || !Array.isArray(v.actors) || !Array.isArray(v.scores) || !Array.isArray(v.winners)) return null;
  if (typeof v.over !== "boolean" || typeof v.prompt !== "string") return null;
  if (v.you !== null && !Number.isInteger(v.you)) return null;
  const players = v.players.map(p => (isObj(p) && typeof p.name === "string" && (p.kind === "human" || p.kind === "bot") ? { name: cleanText(p.name, "Player"), kind: p.kind, level: p.level === "easy" || p.level === "normal" || p.level === "hard" ? p.level : undefined } : null));
  if (players.some(p => !p)) return null;
  const ints = (a: unknown[]) => a.filter((x): x is number => Number.isInteger(x));
  return { you: v.you as number | null, players: players as BaseView["players"], actors: ints(v.actors), over: v.over, winners: ints(v.winners), scores: v.scores.map(x => (typeof x === "number" && Number.isFinite(x) ? x : 0)), prompt: v.prompt.slice(0, 120) };
};

const parseEvents = (v: unknown): GameEvent[] | null =>
  Array.isArray(v) && v.length < 80 && v.every(e => isObj(e) && typeof e.type === "string") ? (v as unknown as GameEvent[]) : null;

export const parseFrame = (raw: unknown): Frame<unknown> | null => {
  if (!isObj(raw)) return null;
  const base = parseBase(raw.base), events = parseEvents(raw.events);
  if (!base || !events || !("view" in raw)) return null;
  return { base, view: raw.view, events };
};

const parseSlots = (v: unknown, max: number): SlotView[] | null => {
  if (!Array.isArray(v) || v.length !== max) return null;
  const out: SlotView[] = [];
  for (let i = 0; i < max; i++) {
    const s = v[i];
    if (!isObj(s) || s.slot !== i) return null;
    if (s.kind === "empty") out.push({ slot: i, kind: "empty" });
    else if (s.kind === "bot" && typeof s.name === "string" && (s.level === "easy" || s.level === "normal" || s.level === "hard")) out.push({ slot: i, kind: "bot", name: cleanText(s.name, "Bot"), level: s.level });
    else if (s.kind === "human" && typeof s.name === "string") out.push({ slot: i, kind: "human", name: cleanText(s.name, "Guest"), connected: s.connected === true, host: s.host === true });
    else return null;
  }
  return out;
};

export const parseRoom = (raw: unknown, maxSlots: number): RoomView | null => {
  if (!isObj(raw)) return null;
  const slots = parseSlots(raw.slots, maxSlots);
  if (!slots || typeof raw.code !== "string" || typeof raw.hostName !== "string" || (raw.phase !== "lobby" && raw.phase !== "playing")) return null;
  if (!Number.isInteger(raw.gameId) || !Number.isInteger(raw.n) || !Number.isInteger(raw.turnMs) || !Number.isInteger(raw.spectators) || !isObj(raw.rules) || !isObj(raw.you)) return null;
  const frame = raw.frame === null ? null : parseFrame(raw.frame);
  if (raw.frame !== null && !frame) return null;
  return {
    code: raw.code, hostName: cleanText(raw.hostName, "Host"), gameId: raw.gameId as number, phase: raw.phase, rules: raw.rules as RuleValues, turnMs: raw.turnMs as number,
    slots, spectators: raw.spectators as number, you: { slot: Number.isInteger(raw.you.slot) ? (raw.you.slot as number) : null, player: Number.isInteger(raw.you.player) ? (raw.you.player as number) : null },
    n: raw.n as number, frame, away: Array.isArray(raw.away) ? raw.away.filter((x): x is number => Number.isInteger(x)).slice(0, 12) : [],
  };
};

export const parseHostMsg = (raw: unknown, maxSlots: number): HostMsg | null => {
  if (!isObj(raw) || typeof raw.t !== "string") return null;
  switch (raw.t) {
    case "room": { const room = parseRoom(raw.room, maxSlots); return room ? { t: "room", room } : null; }
    case "frame": { const frame = parseFrame(raw.frame); return frame && Number.isInteger(raw.gameId) && Number.isInteger(raw.n) ? { t: "frame", gameId: raw.gameId as number, n: raw.n as number, frame } : null; }
    case "reaction": return typeof raw.emoji === "string" && (REACTIONS as readonly string[]).includes(raw.emoji) ? { t: "reaction", slot: Number.isInteger(raw.slot) ? (raw.slot as number) : null, name: cleanText(raw.name, "Player"), emoji: raw.emoji } : null;
    case "reject": return typeof raw.reason === "string" ? { t: "reject", reason: raw.reason.slice(0, 40) } : null;
    case "chat": { const item = parseChatItem(raw.item); return item ? { t: "chat", item } : null; }
    case "chatlog": {
      if (!Array.isArray(raw.items) || raw.items.length > CHAT_HISTORY) return null;
      const items = raw.items.map(parseChatItem);
      return items.every(Boolean) ? { t: "chatlog", items: items as ChatItem[] } : null;
    }
    case "kicked": return { t: "kicked" };
    case "bye": return { t: "bye" };
    case "error": return typeof raw.reason === "string" ? { t: "error", reason: raw.reason.slice(0, 40) } : null;
    default: return null;
  }
};
