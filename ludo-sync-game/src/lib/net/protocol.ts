import type { Seat } from "../ludo/board";
import { parseGameState, parsePlayerAction } from "../ludo/validate";
import type { Action, BotLevel, GameEvent, GameState, Rules } from "../ludo/types";
import { isClientId } from "./crypto";
import { sanitizeDesign, type PieceDesign } from "../client/pieces";

export const PROTOCOL = 1;
export const REACTIONS = ["👍", "😂", "😮", "😡", "🎉", "🙏"] as const;
export const ROOM_ID_PREFIX = "ludosync-";
export const MAX_NAME = 20;

export type SlotView =
  | { seat: Seat; kind: "empty" }
  | { seat: Seat; kind: "bot"; name: string; level: BotLevel }
  | { seat: Seat; kind: "human"; name: string; connected: boolean; host: boolean; pieces?: PieceDesign[] };

export interface RoomView {
  code: string;
  hostName: string;
  /** Changes whenever a new game starts, so clients know to start counting frames afresh. */
  gameId: number;
  phase: "lobby" | "playing";
  rules: Rules;
  turnMs: number;
  slots: SlotView[];
  spectators: number;
  /** Which seat this viewer holds, or null when watching. */
  you: { seat: Seat | null };
  /** Frames applied so far in this game. */
  n: number;
  state: GameState | null;
}

/** Messages a guest may send the host. */
export type ClientMsg =
  | { t: "join"; v: number; name: string; id: string }
  | { t: "act"; action: Exclude<Action, { type: "forfeit" }> }
  | { t: "name"; name: string }
  | { t: "seat"; seat: Seat }
  | { t: "react"; emoji: string }
  /** The sender's four piece designs, so everyone sees their pieces the way they made them. */
  | { t: "pieces"; designs: PieceDesign[] }
  | { t: "sync" }
  | { t: "bye" };

/** Messages the host sends a guest. */
export type HostMsg =
  | { t: "room"; room: RoomView }
  | { t: "frame"; gameId: number; n: number; state: GameState; events: GameEvent[] }
  | { t: "reaction"; seat: Seat | null; name: string; emoji: string }
  | { t: "reject"; reason: string }
  | { t: "kicked" }
  | { t: "bye" }
  | { t: "error"; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const cleanText = (v: unknown, fallback: string): string =>
  (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "") || fallback;

/** Four designs, each cleaned into range. Anything else is dropped. */
export const parsePieces = (v: unknown): PieceDesign[] | null =>
  Array.isArray(v) && v.length === 4 ? v.map(sanitizeDesign) : null;

export const parseClientMsg = (raw: unknown): ClientMsg | null => {
  if (!isObj(raw) || typeof raw.t !== "string") return null;
  switch (raw.t) {
    case "join":
      if (raw.v !== PROTOCOL || !isClientId(raw.id) || typeof raw.name !== "string") return null;
      return { t: "join", v: PROTOCOL, name: cleanText(raw.name, "Guest"), id: raw.id };
    case "act": {
      const action = parsePlayerAction(raw.action);
      return action ? { t: "act", action } : null;
    }
    case "name":
      return typeof raw.name === "string" ? { t: "name", name: cleanText(raw.name, "Guest") } : null;
    case "seat":
      return typeof raw.seat === "number" && Number.isInteger(raw.seat) && raw.seat >= 0 && raw.seat <= 3
        ? { t: "seat", seat: raw.seat as Seat } : null;
    case "react":
      return typeof raw.emoji === "string" && (REACTIONS as readonly string[]).includes(raw.emoji) ? { t: "react", emoji: raw.emoji } : null;
    case "pieces": {
      const designs = parsePieces(raw.designs);
      return designs ? { t: "pieces", designs } : null;
    }
    case "sync": return { t: "sync" };
    case "bye": return { t: "bye" };
    default: return null;
  }
};

const parseSlots = (v: unknown): SlotView[] | null => {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const out: SlotView[] = [];
  for (let i = 0; i < 4; i++) {
    const s = v[i];
    if (!isObj(s) || s.seat !== i) return null;
    if (s.kind === "empty") out.push({ seat: i as Seat, kind: "empty" });
    else if (s.kind === "bot" && typeof s.name === "string" && (s.level === "easy" || s.level === "normal" || s.level === "hard")) {
      out.push({ seat: i as Seat, kind: "bot", name: cleanText(s.name, "Bot"), level: s.level });
    } else if (s.kind === "human" && typeof s.name === "string") {
      const pieces = parsePieces(s.pieces) ?? undefined;
      out.push({ seat: i as Seat, kind: "human", name: cleanText(s.name, "Guest"), connected: s.connected === true, host: s.host === true, ...(pieces ? { pieces } : {}) });
    } else return null;
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
  if (!isObj(raw.rules) || !isObj(raw.you)) return null;
  const rules: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(raw.rules)) if (typeof val === "boolean" || typeof val === "number") rules[k] = val;
  const seat = raw.you.seat === null ? null : raw.you.seat;
  if (seat !== null && !(typeof seat === "number" && Number.isInteger(seat) && seat >= 0 && seat <= 3)) return null;
  let state: GameState | null = null;
  if (raw.state !== null) {
    state = parseGameState(raw.state);
    if (!state) return null;
  }
  const int = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER;
  if (!int(raw.gameId) || !int(raw.n) || !int(raw.turnMs) || !int(raw.spectators)) return null;
  return {
    code: raw.code, hostName: cleanText(raw.hostName, "Host"), gameId: raw.gameId as number, phase: raw.phase, rules: rules as unknown as Rules,
    turnMs: raw.turnMs as number, slots, spectators: raw.spectators as number, you: { seat: seat as Seat | null }, n: raw.n as number, state,
  };
};

export const parseHostMsg = (raw: unknown): HostMsg | null => {
  if (!isObj(raw) || typeof raw.t !== "string") return null;
  switch (raw.t) {
    case "room": {
      const room = parseRoom(raw.room);
      return room ? { t: "room", room } : null;
    }
    case "frame": {
      const state = parseGameState(raw.state);
      const events = parseEvents(raw.events);
      const ok = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;
      return state && events && ok(raw.gameId) && ok(raw.n) ? { t: "frame", gameId: raw.gameId as number, n: raw.n as number, state, events } : null;
    }
    case "reaction": {
      const seat = raw.seat === null ? null : typeof raw.seat === "number" && raw.seat >= 0 && raw.seat <= 3 ? (raw.seat as Seat) : undefined;
      if (seat === undefined || typeof raw.emoji !== "string" || !(REACTIONS as readonly string[]).includes(raw.emoji)) return null;
      return { t: "reaction", seat, name: cleanText(raw.name, "?"), emoji: raw.emoji };
    }
    case "reject": return { t: "reject", reason: cleanText(raw.reason, "rejected") };
    case "kicked": return { t: "kicked" };
    case "bye": return { t: "bye" };
    case "error": return { t: "error", reason: cleanText(raw.reason, "error") };
    default: return null;
  }
};
