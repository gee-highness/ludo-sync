"use client";

import { Button, useToast } from "@chakra-ui/react";
import { useEffect } from "react";

/** Registers the offline service worker, warms its cache with what this page loaded, and offers updates. */
export const ServiceWorker = () => {
  const toast = useToast();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let refreshing = false;
    // the first time a worker takes charge is not an update: reloading then would throw away a tap made in the first seconds
    let hadController = !!navigator.serviceWorker.controller;
    const onChange = () => {
      if (!hadController) { hadController = true; return; }
      if (!refreshing) { refreshing = true; window.location.reload(); }
    };
    // a reload must never eat what a person is doing: new versions wait for a quiet moment
    let touched = false;
    const touch = () => { touched = true; };
    window.addEventListener("pointerdown", touch, { once: true, capture: true });
    window.addEventListener("keydown", touch, { once: true, capture: true });
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
        // right at the start nothing has been touched yet, so it is safe now; otherwise as soon as the app is put away
        if (!touched) worker.postMessage({ type: "SKIP_WAITING" }); else pending = worker;
        return;
      }
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
      const check = () => { if (document.visibilityState === "visible") void reg.update().catch(() => undefined); };
      document.addEventListener("visibilitychange", check);
      stopChecking = () => document.removeEventListener("visibilitychange", check);
      check();
    }).catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);

    // keep saved games and settings from being evicted under storage pressure
    void navigator.storage?.persist?.().catch(() => undefined);

    return () => { cancelled = true; stopChecking(); document.removeEventListener("visibilitychange", applyWhenHidden); window.removeEventListener("pointerdown", touch, true); window.removeEventListener("keydown", touch, true); navigator.serviceWorker.removeEventListener("controllerchange", onChange); };
  }, [toast]);

  return null;
};
