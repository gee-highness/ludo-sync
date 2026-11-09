"use client";

export type PushResult = "on" | "denied" | "unsupported" | "unavailable";

export const pushSupported = (): boolean =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const keyBytes = (b64: string): Uint8Array => {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

/** Whether this browser already holds a push address (so it can be sent again quietly when the app opens). */
export const hasPushAddress = async (): Promise<PushSubscription | null> => {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
};

/**
 * Asks permission (must follow a tap), creates this browser's push address with the server's public key, and hands it to `store`.
 * `vapidKey` is the server's public key, or null when the server has no push set up.
 */
export const enablePush = async (vapidKey: () => Promise<string | null>, store: (sub: PushSubscriptionJSON) => Promise<boolean>): Promise<PushResult> => {
  if (!pushSupported()) return "unsupported";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const key = await vapidKey();
  if (!key) return "unavailable";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
    return (await store(sub.toJSON())) ? "on" : "unavailable";
  } catch { return "unavailable"; }
};

export const disablePush = async (): Promise<void> => {
  try { await (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.unsubscribe(); } catch { /* nothing to remove */ }
};
