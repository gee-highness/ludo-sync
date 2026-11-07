/** Whether the app runs inside the Android app (Capacitor) rather than a browser. The games are bundled there, so no service worker is needed. */
export const isNative = (): boolean => {
  try {
    const g = globalThis as { Capacitor?: { isNativePlatform?: () => boolean }; androidBridge?: unknown };
    // Capacitor's own flag, or the Android bridge it injects before any page script runs
    return !!g.Capacitor?.isNativePlatform?.() || typeof g.androidBridge !== "undefined";
  } catch { return false; }
};

/**
 * Where the online features (pairing, mailbox) live. In a browser they are on the same site, so paths stay relative;
 * the Android app has no server of its own, so the build points it at the deployed site with NEXT_PUBLIC_API_BASE.
 */
export const apiUrl = (path: string): string => `${(process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "")}${path}`;
