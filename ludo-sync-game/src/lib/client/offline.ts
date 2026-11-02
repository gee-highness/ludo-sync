"use client";

import { useEffect, useState } from "react";

export type OfflineState =
  /** No service worker here (an old browser, or a development build). */
  | { kind: "unsupported" }
  | { kind: "checking" }
  | { kind: "downloading"; pct: number }
  | { kind: "ready" };

export const progressPct = (done: number, total: number): number => (total > 0 ? Math.max(0, Math.min(100, Math.floor((done / total) * 100))) : 0);

/**
 * Whether every page, script and model of the app is stored on this device, so every game opens with no connection.
 * The service worker fills its caches when it installs; this asks it to finish anything that was missed and listens for the answer.
 */
export const useOfflineState = (): OfflineState => {
  const [state, setState] = useState<OfflineState>({ kind: "checking" });

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") { setState({ kind: "unsupported" }); return; }
    let cancelled = false;
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; done?: number; total?: number; ready?: boolean; have?: number } | null;
      if (!m || cancelled) return;
      if (m.type === "OFFLINE_PROGRESS" && typeof m.done === "number" && typeof m.total === "number") setState({ kind: "downloading", pct: progressPct(m.done, m.total) });
      else if (m.type === "OFFLINE_STATUS" && typeof m.have === "number" && typeof m.total === "number") setState(m.ready ? { kind: "ready" } : { kind: "downloading", pct: progressPct(m.have, m.total) });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    void navigator.serviceWorker.ready.then(reg => {
      if (cancelled) return;
      reg.active?.postMessage({ type: "OFFLINE_STATUS_REQUEST" });
      // anything still missing (for example the connection dropped during the first visit) is fetched now
      if (navigator.onLine) reg.active?.postMessage({ type: "OFFLINE_CHECK" });
    });
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener("message", onMessage); };
  }, []);

  return state;
};
