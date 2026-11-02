import { randomBytes, toB64 } from "../net/crypto";
import { readJSON, writeJSON } from "../client/storage";

/** A friend code names one device: eight characters with nothing easily mixed up (no 0, O, 1 or I). */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export const newFriendCode = (): string => [...randomBytes(CODE_LENGTH)].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
export const cleanFriendCode = (input: string): string => input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
export const isFriendCode = (c: string): boolean => c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch));
export const formatFriendCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
/** Pulls a friend code out of whatever was pasted or scanned: a bare code, or one of our links. */
export const extractFriendCode = (text: string): string | null => {
  const fromLink = /[?&]add=([^&#\s]+)/i.exec(text)?.[1];
  const code = cleanFriendCode(fromLink ?? text);
  return isFriendCode(code) ? code : null;
};
export const friendLink = (code: string, origin = typeof location !== "undefined" ? location.origin : "") => `${origin}/friends?add=${code}`;
/** The address a device listens on at the pairing service. */
export const peerIdOf = (code: string) => `lsf-${code}`;

export interface Friend {
  code: string;
  name: string;
  /** Shared by the two of you when you became friends; every invite is signed with it, so nobody else can send one in your friend's name. */
  secret: string;
  since: number;
  /** False while you are waiting for them to accept. */
  confirmed: boolean;
}

/** Where friends are kept. The app uses the device's storage; tests use memory. */
export interface FriendsStore { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void }
export const deviceStore: FriendsStore = { get: (k, f) => readJSON(k, f), set: (k, v) => { writeJSON(k, v); } };
export const memoryStore = (): FriendsStore => { const m = new Map<string, unknown>(); return { get: <T,>(k: string, f: T) => (m.has(k) ? (m.get(k) as T) : f), set: (k, v) => { m.set(k, v); } }; };

const MAX_FRIENDS = 200;
export const cleanName = (v: unknown, fallback = "Friend"): string =>
  (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 20) : "") || fallback;

export const cleanFriends = (raw: unknown): Friend[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Friend[] = [];
  for (const f of raw as Partial<Friend>[]) {
    if (!f || typeof f.code !== "string" || !isFriendCode(f.code) || seen.has(f.code) || typeof f.secret !== "string" || f.secret.length < 16 || f.secret.length > 64) continue;
    seen.add(f.code);
    out.push({ code: f.code, name: cleanName(f.name), secret: f.secret, since: typeof f.since === "number" ? f.since : 0, confirmed: f.confirmed !== false });
  }
  return out.slice(0, MAX_FRIENDS);
};

export const loadMyCode = (store: FriendsStore): string => {
  const saved = store.get<string | null>("friend-code", null);
  if (typeof saved === "string" && isFriendCode(saved)) return saved;
  const fresh = newFriendCode();
  store.set("friend-code", fresh);
  return fresh;
};
export const newSecret = () => toB64(randomBytes(24));
export const loadFriends = (store: FriendsStore) => cleanFriends(store.get<unknown>("friends-v1", []));
export const saveFriends = (store: FriendsStore, list: Friend[]) => store.set("friends-v1", list);
export const loadBlocked = (store: FriendsStore): string[] => { const r = store.get<unknown>("friends-blocked", []); return Array.isArray(r) ? r.filter((c): c is string => typeof c === "string" && isFriendCode(c)).slice(0, 200) : []; };
export const saveBlocked = (store: FriendsStore, list: string[]) => store.set("friends-blocked", list.slice(0, 200));
/** Whether this device accepts invites and requests while the app is open. */
export const loadListening = (store: FriendsStore) => store.get<boolean>("friends-on", true) !== false;
