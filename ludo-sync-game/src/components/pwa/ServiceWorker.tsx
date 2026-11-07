"use client";

import { Button, useToast } from "@chakra-ui/react";
import { useEffect } from "react";
import { isNative } from "@/lib/native";

/** Registers the offline service worker, warms its cache with what this page loaded, and offers updates. */
export const ServiceWorker = () => {
  const toast = useToast();

  useEffect(() => {
    // the Android app carries every file inside itself: no worker, no update toast (a new version arrives as a new app)
    if (isNative() || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let refreshing = false;
    // the first time a worker takes charge is not an update: reloading then would throw away a tap made in the first seconds
    let hadController = !!navigator.serviceWorker.controller;
    const onChange = () => {
      if (!hadController) { hadController = true; return; }
      if (!refreshing) { refreshing = true; window.location.reload(); }
    };
    // a reload must never eat what a person is doing: in a game the new version waits for the Update tap or for the app to be put away
    let pending: ServiceWorker | null = null;
    const applyWhenHidden = () => { if (document.visibilityState === "hidden" && pending) { pending.postMessage({ type: "SKIP_WAITING" }); pending = null; } };
    document.addEventListener("visibilitychange", applyWhenHidden);

    const warm = (reg: ServiceWorkerRegistration) => {
      const urls = performance.getEntriesByType("resource")
        .map(e => { try { const u = new URL(e.name); return u.origin === location.origin ? u.pathname : ""; } catch { return ""; } })
        .filter(p => p.startsWith("/_next/static/"));
      reg.active?.postMessage({ type: "WARM", urls });
    };

    // on a menu nothing can be lost, so a new version simply takes over; in the middle of a game the player is asked
    const MENUS = new Set(["/", "/profile", "/ludo", "/skipbo", "/garage", "/pieces", "/island"]);
    const announce = (worker: ServiceWorker) => {
      if (MENUS.has(window.location.pathname)) {
        // a menu holds nothing to lose: the new version takes over at once
        worker.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      pending = worker;
      toast({
        id: "sw-update", duration: null, isClosable: true, position: "bottom",
        render: ({ onClose }) => (
          <div role="status" style={{ background: "#151515", color: "white", padding: 12, borderRadius: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <span>A new version is ready.</span>
            <Button size="sm" colorScheme="teal" minH="44px" onClick={() => { worker.postMessage({ type: "SKIP_WAITING" }); onClose(); }}>Update</Button>
          </div>
        ),
      });
    };

    let cancelled = false;
    let stopChecking: () => void = () => undefined;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(reg => {
      if (cancelled) return;
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) announce(w);
        });
      });
      void navigator.serviceWorker.ready.then(warm);
      // an installed app can stay open for days: look for a new version whenever it comes back to the front
      const check = () => { if (document.visibilityState === "visible" && navigator.onLine) void reg.update().catch(() => undefined); };
      // ...and while it is open, look again every minute and the moment the connection returns
      const timer = window.setInterval(check, 60_000);
      document.addEventListener("visibilitychange", check);
      window.addEventListener("online", check);
      window.addEventListener("focus", check);
      stopChecking = () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check); window.removeEventListener("focus", check); };
      check();
    }).catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);

    // keep saved games and settings from being evicted under storage pressure
    void navigator.storage?.persist?.().catch(() => undefined);

    return () => { cancelled = true; stopChecking(); document.removeEventListener("visibilitychange", applyWhenHidden); navigator.serviceWorker.removeEventListener("controllerchange", onChange); };
  }, [toast]);

  return null;
};
