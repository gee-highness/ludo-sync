"use client";

import { Button, useToast } from "@chakra-ui/react";
import { useEffect } from "react";

/** Registers the offline service worker, warms its cache with what this page loaded, and offers updates. */
export const ServiceWorker = () => {
  const toast = useToast();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let refreshing = false;
    const onChange = () => { if (!refreshing) { refreshing = true; window.location.reload(); } };

    const warm = (reg: ServiceWorkerRegistration) => {
      const urls = performance.getEntriesByType("resource")
        .map(e => { try { const u = new URL(e.name); return u.origin === location.origin ? u.pathname : ""; } catch { return ""; } })
        .filter(p => p.startsWith("/_next/static/"));
      reg.active?.postMessage({ type: "WARM", urls });
    };

    const announce = (worker: ServiceWorker) => {
      toast({
        id: "sw-update", duration: null, isClosable: true, position: "bottom",
        render: ({ onClose }) => (
          <div role="status" style={{ background: "#2D3748", color: "white", padding: 12, borderRadius: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <span>A new version is ready.</span>
            <Button size="sm" colorScheme="teal" minH="44px" onClick={() => { worker.postMessage({ type: "SKIP_WAITING" }); onClose(); }}>Update</Button>
          </div>
        ),
      });
    };

    let cancelled = false;
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
    }).catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);

    // keep saved games and settings from being evicted under storage pressure
    void navigator.storage?.persist?.().catch(() => undefined);

    return () => { cancelled = true; navigator.serviceWorker.removeEventListener("controllerchange", onChange); };
  }, [toast]);

  return null;
};
