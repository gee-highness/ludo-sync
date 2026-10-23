import { useEffect, useState } from "react";

export interface Capabilities {
  webgl2: boolean;
  /** Few cores, little memory, or the user asked to save data. */
  lowPower: boolean;
  reducedMotion: boolean;
  /** Primary input is a finger. */
  coarsePointer: boolean;
  /** Launched from the home screen rather than a browser tab. */
  standalone: boolean;
}

interface NavigatorExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
  standalone?: boolean;
  wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
}

export const detectCapabilities = (): Capabilities => {
  if (typeof window === "undefined") {
    return { webgl2: false, lowPower: false, reducedMotion: false, coarsePointer: false, standalone: false };
  }
  const nav = navigator as Navigator & NavigatorExtras;
  let webgl2 = false;
  try {
    const canvas = document.createElement("canvas");
    webgl2 = !!canvas.getContext("webgl2");
    canvas.width = canvas.height = 1; // let the context be collected
  } catch { /* no webgl */ }
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  return {
    webgl2,
    lowPower: memory <= 2 || cores <= 2 || nav.connection?.saveData === true,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    standalone: window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true,
  };
};

export const useCapabilities = (): Capabilities | null => {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => { setCaps(detectCapabilities()); }, []);
  return caps;
};

/** Which renderer to use for the preference and device. */
export const resolveRenderer = (pref: "auto" | "3d" | "2d", caps: Capabilities | null): "3d" | "2d" => {
  if (!caps) return "2d";
  if (pref === "2d") return "2d";
  if (!caps.webgl2) return "2d";
  if (pref === "3d") return "3d";
  return caps.lowPower || caps.reducedMotion ? "2d" : "3d";
};

export const useOnline = (): boolean => {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
};

/** Keeps the screen on while `active`, where the browser allows it. */
export const useWakeLock = (active: boolean) => {
  useEffect(() => {
    const nav = navigator as Navigator & NavigatorExtras;
    if (!active || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await nav.wakeLock!.request("screen");
        if (cancelled) void l.release(); else lock = l;
      } catch { /* denied or unsupported */ }
    };
    void acquire();
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
};
