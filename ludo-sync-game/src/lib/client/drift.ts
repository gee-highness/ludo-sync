/** A turn at least this sharp (degrees) makes a vehicle drift round the corner instead of simply turning. */
export const DRIFT_MIN = 40;

/** The signed difference between two headings in degrees, in -180..180. */
export const turnBetween = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;

/** Does turning by this many degrees count as a drift? */
export const isDrift = (delta: number): boolean => Math.abs(delta) >= DRIFT_MIN;

/** How far (degrees) the tail swings out past the new heading before settling: more for sharper turns, never wild. */
export const driftSwing = (delta: number): number => (isDrift(delta) ? Math.sign(delta) * Math.min(26, 8 + Math.abs(delta) * 0.14) : 0);
