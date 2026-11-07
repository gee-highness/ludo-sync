"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/native";

/** In the Android app: the system back button goes back a screen (and leaves the app from the first one), and the bars match the table. */
export const NativeShell = () => {
  useEffect(() => {
    if (!isNative()) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
          import("@capacitor/app"), import("@capacitor/status-bar"), import("@capacitor/splash-screen"),
        ]);
        if (cancelled) return;
        const h = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack && window.location.pathname !== "/") window.history.back();
          else void App.exitApp();
        });
        off = () => void h.remove();
        await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
        await StatusBar.setBackgroundColor({ color: "#303030" }).catch(() => undefined);
        await SplashScreen.hide().catch(() => undefined);
      } catch { /* a plugin that is missing must never stop the games */ }
    })();
    return () => { cancelled = true; off?.(); };
  }, []);
  return null;
};
