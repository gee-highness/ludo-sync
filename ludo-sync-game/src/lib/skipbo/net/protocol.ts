import { isClientId } from "../../net/crypto";
import { CHAT_HISTORY, cleanChat } from "../../net/protocol";
import { cleanRules } from "../engine";
import type { Action, BotLevel, GameEvent, Rules } from "../types";
import { parseAction, parseView, type TableView } from "../view";

export const PROTOCOL = 1;
/** Room ids on the pairing service. Different from Ludo's, so a Ludo code never opens a Skip-Bo room. */
export const ROOM_ID_PREFIX = "skipbo-";
export const MAX_SLOTS = 6;
export { CHAT_HISTORY, cleanChat };

export interface ChatItem { id: number; slot: number | null; name: string; text: string; at: number }
export const MAX_NAME = 20;
export const REACTIONS = ["👍", "😂", "😮", "😡", "🎉", "🙏", "❤️", "👏", "🔥", "😢", "🤔", "😎"] as const;

export type SlotView =
  | { slot: number; kind: "empty" }
  | { slot: number; kind: "bot"; name: string; level: BotLevel }
  | { slot: number; kind: "human"; name: string; connected: boolean; host: boolean };

export interface RoomView {
  code: string;
  hostName: string;
  gameId: number;
  phase: "lobby" | "playing";
  rules: Rules;
  turnMs: number;
  slots: SlotView[];
  spectators: number;
  /** The viewer's slot in the lobby, and their place at the table in a game (null when watching). */
  you: { slot: number | null; player: number | null };
  n: number;
  view: TableView | null;
  /** Players at the table whose person is offline right now. */
  away: number[];
}

export type ClientMsg =
  | { t: "join"; v: number; name: string; id: string }
  | { t: "act"; action: Action }
  | { t: "name"; name: string }
  | { t: "react"; emoji: string }
  | { t: "chat"; text: string }
  | { t: "sync" }
  | { t: "bye" };

export type HostMsg =
  | { t: "room"; room: RoomView }
  | { t: "frame"; gameId: number; n: number; view: TableView; events: GameEvent[] }
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
    case "join":
      if (raw.v !== PROTOCOL || !isClientId(raw.id) || typeof raw.name !== "string") return null;
      return { t: "join", v: PROTOCOL, name: cleanText(raw.name, "Guest"), id: raw.id };
    case "act": { const action = parseAction(raw.action); return action ? { t: "act", action } : null; }
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

const parseSlots = (v: unknown): SlotView[] | null => {
  if (!Array.isArray(v) || v.length !== MAX_SLOTS) return null;
  const out: SlotView[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const s = v[i];
    if (!isObj(s) || s.slot !== i) return null;
    if (s.kind === "empty") out.push({ slot: i, kind: "empty" });
    else if (s.kind === "bot" && typeof s.name === "string" && (s.level === "easy" || s.level === "normal" || s.level === "hard")) out.push({ slot: i, kind: "bot", name: cleanText(s.name, "Bot"), level: s.level });
    else if (s.kind === "human" && typeof s.name === "string") out.push({ slot: i, kind: "human", name: cleanText(s.name, "Guest"), connected: s.connected === true, host: s.host === true });
    else return null;
  }
  return out;
};

const parseEvents = (v: unknown): GameEvent[] | null =>
  Array.isArray(v) && v.length < 64 && v.every(e => isObj(e) && typeof e.type === "string") ? (v as unknown as GameEvent[]) : null;

export const parseRoom = (raw: unknown): RoomView | null => {
  if (!isObj(raw)) return null;
  const slots = parseSlots(raw.slots);
  if (!slots || typeof raw.code !== "string" || typeof raw.hostName !== "string") return null;
  if (raw.phase !== "lobby" && raw.phase !== "playing") return null;
  if (!Number.isInteger(raw.gameId) || !Number.isInteger(raw.n) || !Number.isInteger(raw.turnMs) || !Number.isInteger(raw.spectators)) return null;
  const rules = isObj(raw.rules) ? cleanRules(raw.rules as Partial<Rules>, 2) : null;
  const you = raw.you;
  if (!rules || !isObj(you)) return null;
  const view = raw.view === null ? null : parseView(raw.view);
  if (raw.view !== null && !view) return null;
  // keep the stock size the host chose, which `cleanRules` clamps for two players
  const stock = isObj(raw.rules) && Number.isInteger(raw.rules.stockSize) ? Math.max(5, Math.min(30, raw.rules.stockSize as number)) : rules.stockSize;
  return {
    code: raw.code, hostName: cleanText(raw.hostName, "Host"), gameId: raw.gameId as number, phase: raw.phase, rules: { ...rules, stockSize: stock },
    turnMs: raw.turnMs as number, slots, spectators: raw.spectators as number,
    you: { slot: Number.isInteger(you.slot) ? (you.slot as number) : null, player: Number.isInteger(you.player) ? (you.player as number) : null },
    n: raw.n as number, view,
    away: Array.isArray(raw.away) ? raw.away.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 6).slice(0, 6) : [],
  };
};

export const parseHostMsg = (raw: unknown): HostMsg | null => {
  if (!isObj(raw) || typeof raw.t !== "string") return null;
  switch (raw.t) {
    case "room": { const room = parseRoom(raw.room); return room ? { t: "room", room } : null; }
    case "frame": {
      const view = parseView(raw.view), events = parseEvents(raw.events);
      if (!view || !events || !Number.isInteger(raw.gameId) || !Number.isInteger(raw.n)) return null;
      return { t: "frame", gameId: raw.gameId as number, n: raw.n as number, view, events };
    }
    case "reaction":
      return typeof raw.emoji === "string" && (REACTIONS as readonly string[]).includes(raw.emoji)
        ? { t: "reaction", slot: Number.isInteger(raw.slot) ? (raw.slot as number) : null, name: cleanText(raw.name, "Player"), emoji: raw.emoji } : null;
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
