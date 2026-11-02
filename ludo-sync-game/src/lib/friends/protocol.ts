import { fromB64, isRoomCode, toB64, utf8 } from "../net/crypto";
import { cleanName, isFriendCode } from "./store";

export const FRIEND_PROTOCOL = 1;
export const isGameId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]{2,24}$/.test(v);

export type FMsg =
  | { t: "req"; code: string; name: string; secret: string }
  | { t: "accept"; code: string; name: string; mac: string }
  | { t: "ping"; code: string; name: string; ts: number; mac: string }
  | { t: "pong"; name: string }
  | { t: "unknown" }
  | { t: "invite"; code: string; name: string; game: string; room: string; ts: number; mac: string }
  | { t: "seen" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);

export const parseFMsg = (raw: unknown): FMsg | null => {
  if (!isObj(raw) || raw.v !== FRIEND_PROTOCOL || typeof raw.t !== "string") return null;
  switch (raw.t) {
    case "req": { const secret = str(raw.secret, 64); return typeof raw.code === "string" && isFriendCode(raw.code) && secret && secret.length >= 16 ? { t: "req", code: raw.code, name: cleanName(raw.name), secret } : null; }
    case "accept": { const mac = str(raw.mac, 64); return typeof raw.code === "string" && isFriendCode(raw.code) && mac ? { t: "accept", code: raw.code, name: cleanName(raw.name), mac } : null; }
    case "ping": { const mac = str(raw.mac, 64); return typeof raw.code === "string" && isFriendCode(raw.code) && mac && typeof raw.ts === "number" ? { t: "ping", code: raw.code, name: cleanName(raw.name), ts: raw.ts, mac } : null; }
    case "pong": return { t: "pong", name: cleanName(raw.name) };
    case "unknown": return { t: "unknown" };
    case "seen": return { t: "seen" };
    case "invite": {
      const mac = str(raw.mac, 64);
      return typeof raw.code === "string" && isFriendCode(raw.code) && mac && typeof raw.ts === "number" && isGameId(raw.game) && typeof raw.room === "string" && isRoomCode(raw.room)
        ? { t: "invite", code: raw.code, name: cleanName(raw.name), game: raw.game, room: raw.room, ts: raw.ts, mac } : null;
    }
    default: return null;
  }
};

/** What each signed message says, so a signature for one thing can never be used for another. */
export const textFor = {
  invite: (code: string, game: string, room: string, ts: number) => `invite|${code}|${game}|${room}|${ts}`,
  ping: (code: string, ts: number) => `ping|${code}|${ts}`,
  accept: (code: string, secret: string) => `accept|${code}|${secret.slice(0, 8)}`,
};

/** HMAC-SHA-256 of a text with a friend's shared secret. */
export const macOf = async (secretB64: string, text: string): Promise<string> => {
  const key = await globalThis.crypto.subtle.importKey("raw", fromB64(secretB64) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toB64(new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, utf8(text) as BufferSource))).replace(/=+$/, "");
};

export const verifyMac = async (secretB64: string, text: string, mac: string): Promise<boolean> => {
  try {
    const want = await macOf(secretB64, text);
    if (want.length !== mac.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ mac.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
};

/** Invites older than this are ignored, so an old message cannot be played back. */
export const INVITE_TTL_MS = 10 * 60_000;
