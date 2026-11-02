import { createHash, timingSafeEqual } from "node:crypto";
import { parseFMsg } from "../friends/protocol";
import { isFriendCode } from "../friends/store";

/**
 * A dumb mailbox for friends who are not online: it holds a few signed messages (invites and accepts) until the owner opens the app.
 * It cannot read or forge anything that matters: messages are signed with a secret only the two friends share, and the owner checks the
 * signature. Friend *requests* never come through here, because they carry that secret.
 */
export interface MailStore {
  put(path: string, data: string): Promise<void>;
  get(path: string): Promise<string | null>;
  list(prefix: string): Promise<{ path: string; url: string }[]>;
  del(urls: string[]): Promise<void>;
}

export const MAILBOX = { maxPending: 30, maxBytes: 1024, ttlMs: 2 * 60 * 60_000, maxAllowed: 200 };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const keyPath = (code: string) => `mail/${code}/key.json`;
const allowPath = (code: string) => `mail/${code}/allow.json`;
const msgPrefix = (code: string) => `mail/${code}/m/`;
const validKey = (k: unknown): k is string => typeof k === "string" && k.length >= 16 && k.length <= 64 && /^[A-Za-z0-9_-]+$/.test(k);

const readJson = async <T,>(store: MailStore, path: string): Promise<T | null> => { try { const t = await store.get(path); return t ? (JSON.parse(t) as T) : null; } catch { return null; } };

const owns = async (store: MailStore, code: string, key: unknown): Promise<boolean> => {
  if (!isFriendCode(code) || !validKey(key)) return false;
  const k = await readJson<{ hash: string }>(store, keyPath(code));
  return !!k && safeEq(k.hash, sha(key));
};

/** A device claims its friend code with a secret key. The same key can claim it again; a different key cannot. */
export const register = async (store: MailStore, code: string, key: unknown): Promise<"ok" | "taken" | "bad"> => {
  if (!isFriendCode(code) || !validKey(key)) return "bad";
  const existing = await readJson<{ hash: string }>(store, keyPath(code));
  if (existing) return safeEq(existing.hash, sha(key)) ? "ok" : "taken";
  await store.put(keyPath(code), JSON.stringify({ hash: sha(key) }));
  return "ok";
};

/** The owner says whose mail to accept: only friends. This stops strangers filling a mailbox with junk. */
export const setAllowed = async (store: MailStore, code: string, key: unknown, from: unknown): Promise<"ok" | "denied" | "bad"> => {
  if (!(await owns(store, code, key))) return "denied";
  if (!Array.isArray(from) || from.length > MAILBOX.maxAllowed || !from.every(c => typeof c === "string" && isFriendCode(c))) return "bad";
  await store.put(allowPath(code), JSON.stringify([...new Set(from as string[])]));
  return "ok";
};

export type SendResult = "ok" | "unknown" | "refused" | "full" | "bad";

/** Leaves a signed invite or accept for `to`. Only friends the owner listed may send, one per sender and room (a new one replaces the old). */
export const send = async (store: MailStore, to: unknown, raw: unknown, now: number): Promise<SendResult> => {
  if (typeof to !== "string" || !isFriendCode(to)) return "bad";
  if (JSON.stringify(raw ?? null).length > MAILBOX.maxBytes) return "bad";
  const m = parseFMsg(raw);
  if (!m || (m.t !== "invite" && m.t !== "accept")) return "bad";
  if (!(await readJson(store, keyPath(to)))) return "unknown";
  const allowed = (await readJson<string[]>(store, allowPath(to))) ?? [];
  if (!allowed.includes(m.code)) return "refused";
  const name = m.t === "invite" ? `${m.code}-${m.room}` : `${m.code}-accept`;
  const path = `${msgPrefix(to)}${name}.json`;
  const pending = await store.list(msgPrefix(to));
  if (pending.length >= MAILBOX.maxPending && !pending.some(p => p.path === path)) return "full";
  await store.put(path, JSON.stringify({ at: now, msg: raw }));
  return "ok";
};

/** The owner collects what is waiting. Collected and expired messages are deleted. */
export const collect = async (store: MailStore, code: string, key: unknown, now: number): Promise<{ ok: true; msgs: unknown[] } | { ok: false }> => {
  if (!(await owns(store, code, key))) return { ok: false };
  const items = await store.list(msgPrefix(code));
  const msgs: unknown[] = [];
  for (const it of items.slice(0, MAILBOX.maxPending)) {
    const w = await readJson<{ at: number; msg: unknown }>(store, it.path);
    if (w && typeof w.at === "number" && now - w.at < MAILBOX.ttlMs) msgs.push(w.msg);
  }
  if (items.length) await store.del(items.map(i => i.url));
  return { ok: true, msgs };
};

/** In memory, for tests. */
export const memoryMailStore = (): MailStore & { files: Map<string, string> } => {
  const files = new Map<string, string>();
  return {
    files,
    put: async (p, d) => { files.set(p, d); },
    get: async p => files.get(p) ?? null,
    list: async prefix => [...files.keys()].filter(p => p.startsWith(prefix)).map(p => ({ path: p, url: p })),
    del: async urls => { for (const u of urls) files.delete(u); },
  };
};
