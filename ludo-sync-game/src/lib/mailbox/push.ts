import { isFriendCode } from "../friends/store";
import { GAMES } from "../games";
import type { MailStore } from "./server";

/**
 * Wake-up notifications for friends whose app is closed. A device leaves its browser's push address here (only the owner of the friend code can),
 * and when a friend's invite is left in the mailbox the server sends a short notice to that address. The notice carries no secret:
 * the invite itself still waits in the mailbox and is checked when the app opens.
 */
export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }
export type PushSender = (sub: PushSub, payload: string) => Promise<"sent" | "gone" | "failed">;

const pushPath = (code: string) => `mail/${code}/push.json`;
const MAX_SUB_BYTES = 2000;

export const parseSub = (raw: unknown): PushSub | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof r.endpoint !== "string" || !/^https:\/\//.test(r.endpoint) || r.endpoint.length > 700) return null;
  const { p256dh, auth } = r.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  const sub = { endpoint: r.endpoint, keys: { p256dh, auth } };
  return JSON.stringify(sub).length <= MAX_SUB_BYTES ? sub : null;
};

export const saveSub = (store: MailStore, code: string, sub: PushSub) => store.put(pushPath(code), JSON.stringify(sub));

export const dropSub = async (store: MailStore, code: string) => {
  const hit = (await store.list(pushPath(code))).find(i => i.path === pushPath(code));
  if (hit) await store.del([hit.url]);
};

const clean = (s: string, n: number) => s.replace(/[\u0000-\u001f<>]/g, "").slice(0, n);

/** Tells `to` that `from` invited them. Best effort: a missing address, missing keys or a failed send never stops the invite being queued. */
export const notifyInvite = async (store: MailStore, send: PushSender | null, to: string, from: { name: string; game: string }): Promise<boolean> => {
  if (!send || !isFriendCode(to)) return false;
  let sub: PushSub | null = null;
  try { const t = await store.get(pushPath(to)); sub = t ? parseSub(JSON.parse(t)) : null; } catch { return false; }
  if (!sub) return false;
  const body = JSON.stringify({ title: "Ludo Sync", body: `${clean(from.name, 20) || "A friend"} invited you to play ${GAMES.find(g => g.id === from.game)?.name ?? "a game"}`, url: "/friends" });
  const r = await send(sub, body);
  if (r === "gone") await dropSub(store, to).catch(() => undefined);
  return r === "sent";
};

/** Real sender, only when the VAPID keys are set on the server. */
export const vapidPublicKey = (): string | null => process.env.VAPID_PUBLIC_KEY?.trim() || null;

export const webPushSender = async (): Promise<PushSender | null> => {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim(), priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return null;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:admin@ludo-sync.invalid", pub, priv);
  return async (sub, payload) => {
    try { await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "high" }); return "sent"; }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; return c === 404 || c === 410 ? "gone" : "failed"; }
  };
};
