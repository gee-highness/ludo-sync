import type { Capabilities } from "./device";

/** How much the 3D board spends on looks, from the most to the least. Each step down roughly halves the cost. */
export type Tier = "ultra" | "high" | "medium" | "low" | "lite";
export const TIERS: readonly Tier[] = ["ultra", "high", "medium", "low", "lite"];

export interface TierSpec {
  /** Upper bound on the canvas pixel ratio. */
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  /** Denser, animated city (towers, signs, traffic) and the glowing board lines. */
  rich: boolean;
  /** Minimum milliseconds between ambient frames (animation always runs flat out). */
  ambientGap: number;
  /** Particle budget for trails and fireworks. */
  particles: number;
}

export const TIER_SPECS: Record<Tier, TierSpec> = {
  ultra: { pixelRatio: 2, antialias: true, shadows: true, rich: true, ambientGap: 16, particles: 640 },
  high: { pixelRatio: 1.5, antialias: true, shadows: false, rich: true, ambientGap: 33, particles: 480 },
  medium: { pixelRatio: 1.25, antialias: false, shadows: false, rich: true, ambientGap: 33, particles: 240 },
  low: { pixelRatio: 1, antialias: false, shadows: false, rich: false, ambientGap: 66, particles: 120 },
  lite: { pixelRatio: 0.75, antialias: false, shadows: false, rich: false, ambientGap: 100, particles: 40 },
};

export type QualityPref = "auto" | Tier;

/** Reads a stored preference, including the old "high"/"low" ones. */
export const parseQuality = (v: unknown, fallback: QualityPref = "auto"): QualityPref =>
  v === "auto" || (TIERS as readonly string[]).includes(v as string) ? (v as QualityPref) : fallback;

export const stepDown = (t: Tier): Tier | null => TIERS[TIERS.indexOf(t) + 1] ?? null;
export const stepUp = (t: Tier): Tier | null => TIERS[TIERS.indexOf(t) - 1] ?? null;

/** Where to start before anything has been measured. */
export const detectStartTier = (caps: Pick<Capabilities, "lowPower" | "coarsePointer"> | null, dpr = 1, cores = 8, memory = 8): Tier => {
  if (!caps) return "medium";
  if (caps.lowPower) return "low";
  if (caps.coarsePointer) return cores >= 8 && memory >= 6 ? "high" : "medium";
  return cores >= 8 && dpr <= 2 ? "high" : "medium";
};

const LAST_KEY = "ludo-sync:tier";
/** The tier that last ran well on this device, so the next visit starts there. */
export const rememberTier = (t: Tier) => { try { localStorage.setItem(LAST_KEY, t); } catch { /* ignore */ } };
export const recalledTier = (): Tier | null => {
  try { const v = localStorage.getItem(LAST_KEY); return (TIERS as readonly string[]).includes(v as string) ? (v as Tier) : null; } catch { return null; }
};

/**
 * Watches frame times and says when to change tier. Down: a median under ~24 fps over 60 frames. Up: a median over ~57 fps
 * for 6 s of animation, at most once, and never within 20 s of a step down (so it cannot flap).
 */
export class TierGovernor {
  private samples: number[] = [];
  private goodSince = 0;
  private lastChange = 0;
  private triedUp = false;

  constructor(private onChange: (dir: "down" | "up") => void, private canGoUp: () => boolean) {}

  /** Feed the time of each frame that was part of an animation. */
  frame(dt: number, now: number) {
    if (dt <= 0 || dt > 400) return;
    this.samples.push(dt);
    if (this.samples.length < 60) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const fps = 1000 / sorted[sorted.length >> 1];
    this.samples = [];
    if (fps < 24) { this.goodSince = 0; this.lastChange = now; this.triedUp = true; this.onChange("down"); return; }
    if (fps > 57 && !this.triedUp && this.canGoUp() && now - this.lastChange > 20000) {
      if (!this.goodSince) this.goodSince = now;
      else if (now - this.goodSince > 6000) { this.goodSince = 0; this.lastChange = now; this.onChange("up"); }
    } else this.goodSince = 0;
  }
}
