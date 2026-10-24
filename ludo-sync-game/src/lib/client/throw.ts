/**
 * Throwing the dice by dragging a finger (or mouse) across the board and letting go.
 * The throw is cosmetic: the engine decides the numbers; the throw only decides how the dice fly.
 * Positions and velocities are in the viewer's own frame of the board: x to the right, z towards the viewer,
 * in board squares (the board is about 15 wide, centred on 0), so every renderer can map them to its own space.
 */
export interface ThrowInput {
  /** Where the dice were let go. */
  x: number;
  z: number;
  /** How fast they were sent, in squares per second. */
  vx: number;
  vz: number;
}

export interface PointerSample { x: number; y: number; t: number }

/** A drag shorter or slower than this is a tap or a hesitation, not a throw. */
export const MIN_THROW_PX = 40;
export const MIN_THROW_SPEED = 300; // px per second

/** Average velocity over the last ~120 ms of a drag, in px/s. */
export const flickFrom = (samples: readonly PointerSample[], windowMs = 120) => {
  if (samples.length < 2) return { distance: 0, speed: 0, vx: 0, vy: 0 };
  const last = samples[samples.length - 1];
  const first = samples[0];
  let ref = first;
  for (let i = samples.length - 1; i >= 0; i--) { if (last.t - samples[i].t >= windowMs) { ref = samples[i]; break; } }
  const dt = Math.max(1, last.t - ref.t) / 1000;
  const vx = (last.x - ref.x) / dt, vy = (last.y - ref.y) / dt;
  return { distance: Math.hypot(last.x - first.x, last.y - first.y), speed: Math.hypot(vx, vy), vx, vy };
};

export const isThrow = (f: { distance: number; speed: number }) => f.distance >= MIN_THROW_PX && f.speed >= MIN_THROW_SPEED;

/** Clamp a velocity so a wild swipe still lands on the board. */
export const MAX_THROW_SPEED = 26; // squares per second

export const toThrow = (x: number, z: number, vx: number, vz: number): ThrowInput => {
  const s = Math.hypot(vx, vz);
  const k = s > MAX_THROW_SPEED ? MAX_THROW_SPEED / s : 1;
  return { x, z, vx: vx * k, vz: vz * k };
};

/** What a throw looks like when nobody swiped: from the viewer's side towards the middle. Used for taps on Roll, bots and remote players. */
export const defaultThrow = (rand: () => number = Math.random): ThrowInput =>
  toThrow((rand() - 0.5) * 4, 6.5, (rand() - 0.5) * 8, -(11 + rand() * 6));

// ---- hand-over between the board (which sees the gesture) and the dice (which fly when the roll arrives) ----
let pending: { throw: ThrowInput; at: number } | null = null;
const FRESH_MS = 4000;

export const setPendingThrow = (t: ThrowInput) => { pending = { throw: t, at: Date.now() }; };
/** The throw waiting for the next roll, once; null if there is none or it is stale. */
export const takePendingThrow = (): ThrowInput | null => {
  const p = pending;
  pending = null;
  return p && Date.now() - p.at < FRESH_MS ? p.throw : null;
};
