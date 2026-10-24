import type { ThrowInput } from "./throw";

/**
 * The flight of thrown dice on the flat board, as a pure function of the throw: no randomness except a seed, so the same
 * throw always looks the same and the dice always end on the faces the engine rolled. Units are board squares in the
 * viewer's frame (x right, z towards the viewer, origin at the middle of the board).
 */
export interface DieFrame {
  x: number;
  z: number;
  /** Degrees. */
  rot: number;
  /** How high above the board the die is, 0 at rest; drives the shadow and a little scale. */
  lift: number;
  /** The face to show right now: tumbling through random faces until the end, then the rolled one. */
  face: number;
}

export interface DiceFlight {
  duration: number;
  frame: (t: number) => DieFrame[];
  /** Where every die ends up. */
  rest: { x: number; z: number; rot: number }[];
}

/** Half the width of the area the dice may stay in (inside the board's frame). */
export const BOUND = 6.1;
export const FLIGHT_SECONDS = 1.1;
const DIE_SIZE = 1.1;

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Path { t: number[]; x: number[]; z: number[] }

/** Integrates one die with friction and wall bounces on a fixed step, so playback can sample any time. */
const integrate = (x0: number, z0: number, vx0: number, vz0: number, T: number): Path => {
  const dt = 1 / 120, k = 3.1, restitution = 0.6;
  const p: Path = { t: [], x: [], z: [] };
  let x = clamp(x0, -BOUND, BOUND), z = clamp(z0, -BOUND, BOUND), vx = vx0, vz = vz0;
  for (let t = 0; t <= T + dt; t += dt) {
    p.t.push(t); p.x.push(x); p.z.push(z);
    const damp = Math.exp(-k * dt);
    vx *= damp; vz *= damp;
    x += vx * dt; z += vz * dt;
    if (x > BOUND) { x = BOUND; vx = -vx * restitution; } else if (x < -BOUND) { x = -BOUND; vx = -vx * restitution; }
    if (z > BOUND) { z = BOUND; vz = -vz * restitution; } else if (z < -BOUND) { z = -BOUND; vz = -vz * restitution; }
  }
  return p;
};

const at = (p: Path, t: number) => {
  const i = clamp(Math.floor(t * 120), 0, p.t.length - 2);
  const f = clamp(t * 120 - i, 0, 1);
  return { x: p.x[i] + (p.x[i + 1] - p.x[i]) * f, z: p.z[i] + (p.z[i + 1] - p.z[i]) * f };
};

/** A bounce curve: three hops that shrink, ending exactly at rest at `end`. */
const lift = (t: number, end: number, power: number) => {
  if (t >= end) return 0;
  const u = t / end;
  const hop = Math.abs(Math.sin(u * Math.PI * 3));
  return hop * (1 - u) * (1 - u) * power;
};

export const flyDice = (th: ThrowInput, rolled: readonly number[], seed = 1): DiceFlight => {
  const rand = mulberry(seed * 2654435761);
  const n = Math.max(1, Math.min(2, rolled.length));
  const T = FLIGHT_SECONDS;
  const speed = Math.hypot(th.vx, th.vz) || 1;
  const dirx = th.vx / speed, dirz = th.vz / speed;
  const paths: Path[] = [];
  const spin: { w: number; end: number }[] = [];
  const faces: number[][] = [];
  for (let i = 0; i < n; i++) {
    const side = n === 1 ? 0 : i === 0 ? -1 : 1;
    // the second die leaves a touch to the side and a little off-speed, as two dice in a hand do
    const ox = -dirz * side * 0.55, oz = dirx * side * 0.55;
    const tilt = side * 0.13;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const vx = (th.vx * c - th.vz * s) * (1 - 0.06 * i), vz = (th.vx * s + th.vz * c) * (1 - 0.06 * i);
    paths.push(integrate(th.x + ox, th.z + oz, vx, vz, T));
    spin.push({ w: (360 * (2 + rand() * 2) + speed * 14) * (rand() < 0.5 ? -1 : 1), end: (rand() - 0.5) * 18 });
    faces.push(Array.from({ length: 64 }, () => 1 + Math.floor(rand() * 6)));
  }

  // keep resting dice from overlapping: nudge the later one away along the line between them
  const rest = paths.map(p => ({ ...at(p, T), rot: 0 }));
  if (n === 2) {
    const dx = rest[1].x - rest[0].x, dz = rest[1].z - rest[0].z;
    const d = Math.hypot(dx, dz);
    const need = DIE_SIZE * 1.25;
    if (d < need) {
      const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
      const push = (need - d) / 2;
      rest[0].x = clamp(rest[0].x - ux * push, -BOUND, BOUND); rest[0].z = clamp(rest[0].z - uz * push, -BOUND, BOUND);
      rest[1].x = clamp(rest[1].x + ux * push, -BOUND, BOUND); rest[1].z = clamp(rest[1].z + uz * push, -BOUND, BOUND);
    }
  }
  rest.forEach((r, i) => { r.rot = spin[i].end; });

  const frame = (t: number): DieFrame[] => {
    const tt = clamp(t, 0, T);
    const done = t >= T;
    return paths.map((p, i) => {
      const pos = at(p, tt);
      // ease the last stretch onto the resting spot, so separating the dice never jumps
      const blend = clamp((tt - T * 0.7) / (T * 0.3), 0, 1);
      const x = pos.x + (rest[i].x - at(p, T).x) * blend;
      const z = pos.z + (rest[i].z - at(p, T).z) * blend;
      const u = tt / T;
      const rot = done ? rest[i].rot : spin[i].w * (1 - (1 - u) * (1 - u)) * (1 - blend) + rest[i].rot * blend;
      const face = done || tt > T * 0.82 ? rolled[i] : faces[i][Math.floor(tt * 16) % faces[i].length];
      return { x, z, rot, lift: done ? 0 : lift(tt, T, 1.2 + Math.min(1.2, speed / 20)), face };
    });
  };
  return { duration: T, frame, rest };
};
