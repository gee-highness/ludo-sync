import { readJSON, writeJSON } from "../client/storage";
import { cleanRoomCode, isClientId, isRoomCode, newClientId } from "./crypto";

/** This device's seat token. It stays the same across refreshes so a returning player gets their seat back. */
export const getClientId = (): string => {
  const saved = readJSON<string | null>("net-client-id", null);
  if (isClientId(saved)) return saved;
  const fresh = newClientId();
  writeJSON("net-client-id", fresh);
  return fresh;
};

export const shareLink = (code: string, origin = typeof location !== "undefined" ? location.origin : "") => `${origin}/online?join=${code}`;

/** Pulls a room code out of whatever was pasted or scanned: a bare code, or one of our links. */
export const extractRoomCode = (text: string): string | null => {
  const fromLink = /[?&]join=([^&#\s]+)/i.exec(text)?.[1];
  const code = cleanRoomCode(fromLink ?? text);
  return isRoomCode(code) ? code : null;
};
