import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Pairing without a server of our own that stays on: two phones need a go-between only to swap the few messages that set up a direct
 * connection. This keeps those messages in a small store (Redis) for a minute or two. Each phone asks for its own mail every second or two
 * while it is waiting for someone, and nothing is held longer than that.
 */
export interface SignalStore {
  /** Reads who holds this id (the hash of their token), if anyone does. */
  owner(id: string): Promise<string | null>;
  /** Holds the id for this token for `ttlSec` seconds (renewing it if the token already held it). */
  hold(id: string, hash: string, ttlSec: number): Promise<void>;
  release(id: string): Promise<void>;
  /** Adds a message to an id's mail. */
  push(id: string, msg: string, ttlSec: number): Promise<void>;
  /** Takes everything waiting, in order, all at once. */
  drain(id: string): Promise<string[]>;
  /** Counts something in a window; returns the count including this hit. */
  hit(key: string, windowSec: number): Promise<number>;
}

export const SIGNAL = { holdSec: 90, mailSec: 120, maxMsgBytes: 12_000, maxMail: 100, rate: { windowSec: 10, max: 60 } };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export const validId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{3,80}$/.test(v);
export const validToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v);

/** Does this token hold this id right now? */
const holds = async (store: SignalStore, id: unknown, token: unknown): Promise<boolean> => {
  if (!validId(id) || !validToken(token)) return false;
  const o = await store.owner(id);
  return !!o && same(o, sha(token));
};

export type OpenResult = "ok" | "taken" | "bad";
/** A phone takes an id. The same token can renew it; a different token cannot take it while it is held. */
export const open = async (store: SignalStore, id: unknown, token: unknown): Promise<OpenResult> => {
  if (!validId(id) || !validToken(token)) return "bad";
  const o = await store.owner(id);
  if (o && !same(o, sha(token))) return "taken";
  await store.hold(id, sha(token), SIGNAL.holdSec);
  return "ok";
};

/** Collects what is waiting, and keeps the id held. */
export const poll = async (store: SignalStore, id: unknown, token: unknown): Promise<{ ok: true; msgs: unknown[] } | { ok: false }> => {
  if (!(await holds(store, id, token))) return { ok: false };
  await store.hold(id as string, sha(token as string), SIGNAL.holdSec);
  const raw = await store.drain(id as string);
  const msgs: unknown[] = [];
  for (const r of raw) { try { msgs.push(JSON.parse(r)); } catch { /* skip junk */ } }
  return { ok: true, msgs };
};

export type SendResult = "ok" | "denied" | "gone" | "limited" | "bad";
/** Leaves a message for `to`, from an id the sender really holds. */
export const send = async (store: SignalStore, from: unknown, token: unknown, to: unknown, msg: unknown): Promise<SendResult> => {
  if (!validId(to)) return "bad";
  if (!(await holds(store, from, token))) return "denied";
  const text = JSON.stringify(msg ?? null);
  if (text.length > SIGNAL.maxMsgBytes || typeof msg !== "object" || msg === null) return "bad";
  if ((await store.hit(`rate:${from as string}`, SIGNAL.rate.windowSec)) > SIGNAL.rate.max) return "limited";
  if (!(await store.owner(to))) return "gone";
  await store.push(to, JSON.stringify({ from, ...(msg as object) }), SIGNAL.mailSec);
  return "ok";
};

/** Does someone hold this id right now? Used to tell "nobody there" from "no answer". */
export const present = async (store: SignalStore, id: unknown): Promise<boolean> => validId(id) && !!(await store.owner(id));

export const close = async (store: SignalStore, id: unknown, token: unknown): Promise<boolean> => {
  if (!(await holds(store, id, token))) return false;
  await store.release(id as string);
  return true;
};

// ---- stores ---------------------------------------------------------------------------------------

/** In memory: for tests, and for trying it out on one machine. Not shared between serverless instances. */
export const memorySignalStore = (now: () => number = Date.now): SignalStore & { held: Map<string, { hash: string; until: number }> } => {
  const held = new Map<string, { hash: string; until: number }>();
  const mail = new Map<string, { msgs: string[]; until: number }>();
  const counts = new Map<string, { n: number; until: number }>();
  return {
    held,
    owner: async id => { const h = held.get(id); if (!h || h.until < now()) { held.delete(id); return null; } return h.hash; },
    hold: async (id, hash, ttl) => { held.set(id, { hash, until: now() + ttl * 1000 }); },
    release: async id => { held.delete(id); mail.delete(id); },
    push: async (id, msg, ttl) => { const m = mail.get(id); const live = m && m.until >= now() ? m.msgs : []; mail.set(id, { msgs: [...live, msg].slice(-SIGNAL.maxMail), until: now() + ttl * 1000 }); },
    drain: async id => { const m = mail.get(id); mail.delete(id); return m && m.until >= now() ? m.msgs : []; },
    hit: async (key, win) => { const c = counts.get(key); const n = c && c.until >= now() ? c.n + 1 : 1; counts.set(key, { n, until: c && c.until >= now() ? c.until : now() + win * 1000 }); return n; },
  };
};

/** Upstash Redis over its REST interface: no connection to keep open, so it suits serverless functions. */
export const redisSignalStore = (url: string, token: string): SignalStore => {
  const run = async (commands: (string | number)[][], atomic = false): Promise<unknown[]> => {
    const r = await fetch(`${url.replace(/\/$/, "")}/${atomic ? "multi-exec" : "pipeline"}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(commands), cache: "no-store" });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    const out = (await r.json()) as { result?: unknown; error?: string }[];
    const bad = out.find(x => x.error);
    if (bad) throw new Error(bad.error);
    return out.map(x => x.result);
  };
  return {
    owner: async id => { const [v] = await run([["GET", `sig:id:${id}`]]); return typeof v === "string" ? v : null; },
    hold: async (id, hash, ttl) => { await run([["SET", `sig:id:${id}`, hash, "EX", ttl]]); },
    release: async id => { await run([["DEL", `sig:id:${id}`], ["DEL", `sig:in:${id}`]]); },
    push: async (id, msg, ttl) => { await run([["RPUSH", `sig:in:${id}`, msg], ["LTRIM", `sig:in:${id}`, -SIGNAL.maxMail, -1], ["EXPIRE", `sig:in:${id}`, ttl]]); },
    drain: async id => { const r = await run([["LRANGE", `sig:in:${id}`, 0, -1], ["DEL", `sig:in:${id}`]], true); return (r[0] as string[] | null) ?? []; },
    hit: async (key, win) => { const r = await run([["INCR", `sig:${key}`], ["EXPIRE", `sig:${key}`, win, "NX"]]); return Number(r[0]); },
  };
};

let shared: SignalStore | null | undefined;
/** Chooses the store from the environment: Redis when its variables exist, memory only when asked for (local trials), otherwise none (off). */
export const signalStoreFromEnv = (env: Record<string, string | undefined> = process.env): SignalStore | null => {
  if (shared !== undefined && env === process.env) return shared;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL, token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const store = url && token ? redisSignalStore(url, token) : env.SIGNAL_STORE === "memory" ? memorySignalStore() : null;
  if (env === process.env) shared = store;
  return store;
};
