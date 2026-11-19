"use client";

import { useEffect, useState } from "react";
import { nearbyPlayers } from "@/lib/native/nearbyPlayers";

/**
 * Shows any crash on screen (Android app): page errors and unhandled promises as they happen, and a native crash
 * from the last run when the app reopens. Lets a tester read what went wrong without a computer.
 */
export function CrashOverlay() {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    const g = globalThis as { Capacitor?: { isNativePlatform?: () => boolean } };
    if (!g.Capacitor?.isNativePlatform?.()) return;
    const add = (t: string) => setItems(a => (a.includes(t) || a.length >= 5 ? a : [...a, t.slice(0, 3000)]));
    const onError = (e: ErrorEvent) => add(`JS error: ${e.message}\n${e.filename ?? ""}:${e.lineno ?? ""}\n${e.error?.stack ?? ""}`);
    const onReject = (e: PromiseRejectionEvent) => { const r = e.reason; add(`Unhandled promise: ${r?.message ?? String(r)}\n${r?.stack ?? ""}`); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    void nearbyPlayers().lastCrash().then(c => { if (c) add(`Crash last time:\n${c}`); });
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
  }, []);

  if (!items.length) return null;
  const text = items.join("\n\n---\n\n");
  return (
    <div role="alert" style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(60,0,0,.96)", color: "#fff", padding: 12, overflow: "auto", font: "12px/1.4 monospace" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <b style={{ flex: 1, fontSize: 15 }}>⚠ Crash report ({items.length})</b>
        <button onClick={() => void navigator.clipboard?.writeText(text)} style={{ padding: "6px 12px", background: "#fff", color: "#000", borderRadius: 8 }}>Copy</button>
        <button onClick={() => setItems([])} style={{ padding: "6px 12px", background: "#fff", color: "#000", borderRadius: 8 }}>Dismiss</button>
      </div>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{text}</pre>
    </div>
  );
}
