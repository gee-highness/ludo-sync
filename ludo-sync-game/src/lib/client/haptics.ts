import { getSettings } from "./settings";

export type Buzz = "tap" | "hop" | "capture" | "bonus" | "win" | "penalty";

const PATTERNS: Record<Buzz, number | number[]> = {
  tap: 8,
  hop: 6,
  capture: [20, 40, 30],
  bonus: [12, 30, 12],
  win: [30, 60, 30, 60, 90],
  penalty: [60, 40, 60],
};

/** Short vibration where the device supports it and the player has not turned it off. */
export const buzz = (kind: Buzz) => {
  if (!getSettings().haptics) return;
  // browsers refuse to vibrate before the person has touched the page; do not even try
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate?.(PATTERNS[kind]); } catch { /* unsupported */ }
};
