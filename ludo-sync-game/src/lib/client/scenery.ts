import type { Seat } from "../ludo/board";
import { VEHICLES, type VehicleId } from "./pieces";

export const TIME_MODES = ["auto", "day", "dusk", "night"] as const;
export type TimeMode = (typeof TIME_MODES)[number];
export type DayPhase = "day" | "dusk" | "night";
export const WEATHERS = ["clear", "rain", "snow"] as const;
export type Weather = (typeof WEATHERS)[number];

/** Which part of the day an hour (0 to 23.99) falls in: 6 to 17 day, 17 to 20 dusk (and the half hour before six), the rest night. */
export const phaseAt = (hour: number): DayPhase => {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 17) return "day";
  if ((h >= 17 && h < 20) || (h >= 5.5 && h < 6)) return "dusk";
  return "night";
};

export const resolvePhase = (mode: TimeMode, hour: number): DayPhase => (mode === "auto" ? phaseAt(hour) : mode);

export interface Sky {
  top: string;
  bottom: string;
  far: string;
  near: string;
  /** How much the board is darkened, 0 to 0.5. */
  dim: number;
  stars: boolean;
  /** Lamps and windows glow. */
  lit: boolean;
  orb: { x: number; y: number; r: number; fill: string; glow: string };
  cloud: string;
}

/** Skies are kept deep enough that white text on top of them always reads, even at noon. */
export const SKIES: Record<DayPhase, Sky> = {
  day: { top: "#4b8dbb", bottom: "#2f6f8f", far: "#2f6b62", near: "#2b5a3a", dim: 0, stars: false, lit: false, orb: { x: 310, y: 150, r: 26, fill: "#fde68a", glow: "#fef3c7" }, cloud: "#ffffff" },
  dusk: { top: "#4a3d78", bottom: "#c0654a", far: "#33405c", near: "#243b3a", dim: 0.14, stars: false, lit: true, orb: { x: 90, y: 330, r: 30, fill: "#fdba74", glow: "#fed7aa" }, cloud: "#fbcfe8" },
  night: { top: "#0b1330", bottom: "#1c2a55", far: "#16213f", near: "#10222a", dim: 0.3, stars: true, lit: true, orb: { x: 300, y: 130, r: 18, fill: "#e5e7eb", glow: "#c7d2fe" }, cloud: "#64748b" },
};

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export interface Prop {
  kind: "building" | "tree" | "pine" | "lamp";
  /** Across the scene, 0 to 400. */
  x: number;
  size: number;
  /** Buildings: whose island they come from, and how developed they look. */
  seat?: Seat;
  level?: 1 | 2 | 3;
}

/** Where everything stands. The same seed and seats always give the same picture, so a game looks the same on every phone. */
export const scenePlan = (seed: number, seats: Seat[]): Prop[] => {
  const r = rng(seed);
  const props: Prop[] = [];
  const owners = seats.length ? seats : ([0, 1, 2, 3] as Seat[]);
  let x = 6;
  let i = 0;
  while (x < 392) {
    const seat = owners[i % owners.length];
    const level = (1 + Math.floor(r() * 3)) as 1 | 2 | 3;
    props.push({ kind: "building", x, size: 0.38 + r() * 0.16 + level * 0.03, seat, level });
    x += 34 + r() * 14;
    i++;
  }
  for (let k = 0; k < 9; k++) props.push({ kind: r() < 0.5 ? "tree" : "pine", x: 8 + k * 44 + r() * 26, size: 0.7 + r() * 0.5 });
  for (const lx of [60, 200, 340]) props.push({ kind: "lamp", x: lx + (r() - 0.5) * 20, size: 1 });
  return props;
};

export interface Drop { x: number; delay: number; dur: number; size: number }

/** Raindrops or snowflakes, with their own start times so they never fall in step. */
export const weatherPlan = (kind: Weather, seed: number, count = 46): Drop[] => {
  if (kind === "clear") return [];
  const r = rng(seed + (kind === "rain" ? 1 : 2));
  return Array.from({ length: count }, () => ({
    x: r() * 100,
    delay: -r() * 6,
    dur: kind === "rain" ? 0.7 + r() * 0.5 : 5 + r() * 5,
    size: kind === "rain" ? 0.6 + r() * 0.6 : 1 + r() * 2.2,
  }));
};

export interface Passer { lane: 0 | 1; delay: number; dur: number; vehicle: Exclude<VehicleId, "none">; seat: Seat }

/** The cars, bikes and buses that drive past along the bottom road. */
export const trafficPlan = (seed: number, seats: Seat[], count = 4): Passer[] => {
  const r = rng(seed + 7);
  const vehicles = VEHICLES.filter((v): v is Exclude<VehicleId, "none"> => v !== "none");
  const owners = seats.length ? seats : ([0, 1, 2, 3] as Seat[]);
  return Array.from({ length: count }, (_, i) => ({
    lane: (i % 2) as 0 | 1,
    delay: -r() * 40,
    dur: 26 + r() * 22,
    vehicle: vehicles[Math.floor(r() * vehicles.length)],
    seat: owners[i % owners.length],
  }));
};
