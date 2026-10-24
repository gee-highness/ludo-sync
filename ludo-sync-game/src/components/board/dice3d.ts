import * as THREE from "three";
import type { DiceFlight } from "@/lib/client/diceFlight";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const SIZE = 0.83;
/** Which value is on each BoxGeometry face: +x, -x, +y, -y, +z, -z (opposite faces add to 7). */
const FACE_VALUE = [3, 4, 1, 6, 2, 5] as const;
const FACE_NORMAL = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const faceTexture = (value: number, colour: string): THREE.CanvasTexture => {
  const N = 128, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = "#06080f"; g.fillRect(0, 0, N, N);
  g.shadowColor = colour; g.shadowBlur = 16; g.fillStyle = colour;
  for (const [x, y] of PIPS[value]) { g.beginPath(); g.arc(N / 2 + x * 32, N / 2 + y * 32, 10, 0, Math.PI * 2); g.fill(); }
  g.shadowBlur = 0; g.fillStyle = "#ffffff"; g.globalAlpha = 0.9;
  for (const [x, y] of PIPS[value]) { g.beginPath(); g.arc(N / 2 + x * 32, N / 2 + y * 32, 4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

interface Die {
  mesh: THREE.Mesh;
  mats: THREE.MeshStandardMaterial[];
  from: THREE.Vector3; to: THREE.Vector3;
  final: THREE.Quaternion; axis: THREE.Vector3; spin: number;
  t0: number; dur: number; settled: boolean;
  /** Set while the die is following a computed flight rather than the canned throw. */
  idx?: number;
}

const HOLD_Y = 1.3;
const BOUNCES: [number, number][] = [[0.42, 2.1], [0.7, 0.8], [0.88, 0.3], [1, 0]];

/** Two (or one) dark glass dice with glowing pips: thrown on to the board, they tumble, bounce and settle on the rolled values. Cosmetic only. */
export class DiceRig {
  private dice: Die[] = [];
  private geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 3, 0.07);
  private cache = new Map<string, THREE.CanvasTexture[]>();
  private fadeFrom = 0;
  private fading = false;
  private opacity = 1;
  private flight: DiceFlight | null = null;
  private flightStart = 0;
  private startY = 0;
  private held: { x: number; z: number; t0: number } | null = null;

  constructor(private parent: THREE.Object3D) {}

  private textures(colour: string): THREE.CanvasTexture[] {
    let t = this.cache.get(colour);
    if (!t) { t = FACE_VALUE.map(v => faceTexture(v, colour)); this.cache.set(colour, t); }
    return t;
  }

  private clear() {
    this.flight = null; this.held = null;
    for (const d of this.dice) { this.parent.remove(d.mesh); d.mats.forEach(m => m.dispose()); }
    this.dice = [];
  }

  /** Throws one die per value. `calm` (or a zero duration) puts them straight down on their values. */
  throw(values: number[], colour: string, durationMs: number, calm: boolean, fromAngle?: number, now = performance.now()) {
    this.clear();
    this.fading = false; this.opacity = 1;
    const tex = this.textures(colour);
    values.forEach((value, i) => {
      const mats = tex.map(map => new THREE.MeshStandardMaterial({ color: "#10131f", map, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
      const mesh = new THREE.Mesh(this.geo, mats);
      const n = values.length;
      const to = new THREE.Vector3((i - (n - 1) / 2) * 1.5 + (Math.random() - 0.5) * 0.4, SIZE / 2 + 0.07, (Math.random() - 0.5) * 0.8);
      const ang = fromAngle === undefined ? Math.random() * Math.PI * 2 : fromAngle + (Math.random() - 0.5) * 0.5;
      const from = new THREE.Vector3(Math.cos(ang) * 6.5, 2.6, Math.sin(ang) * 6.5);
      const idx = FACE_VALUE.indexOf(value as 1 | 2 | 3 | 4 | 5 | 6);
      const align = new THREE.Quaternion().setFromUnitVectors(FACE_NORMAL[idx < 0 ? 2 : idx], new THREE.Vector3(0, 1, 0));
      const final = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2).multiply(align);
      const die: Die = {
        mesh, mats, from, to, final, axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: (3 + Math.random() * 3) * Math.PI, t0: now + i * 90, dur: Math.max(1, durationMs), settled: false,
      };
      this.dice.push(die);
      this.parent.add(mesh);
      if (calm || durationMs <= 0) { mesh.position.copy(to); mesh.quaternion.copy(final); die.settled = true; }
      else { mesh.position.copy(from); mesh.visible = false; }
    });
  }

  private mesh(tex: THREE.CanvasTexture[]) {
    const mats = tex.map(map => new THREE.MeshStandardMaterial({ color: "#10131f", map, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
    return { mats, mesh: new THREE.Mesh(this.geo, mats) };
  }

  private alignTo(value: number) {
    const idx = FACE_VALUE.indexOf(value as 1 | 2 | 3 | 4 | 5 | 6);
    return new THREE.Quaternion().setFromUnitVectors(FACE_NORMAL[idx < 0 ? 2 : idx], new THREE.Vector3(0, 1, 0));
  }

  /** Picks the dice up under a finger: they hover at (x, z) and follow it until `fly` or `release`. */
  grab(count: number, colour: string, x: number, z: number, now = performance.now()) {
    if (this.held) { this.held.x = x; this.held.z = z; return; }
    this.clear();
    this.fading = false; this.opacity = 1; this.flight = null;
    const tex = this.textures(colour);
    for (let i = 0; i < count; i++) {
      const { mats, mesh } = this.mesh(tex);
      const z0 = new THREE.Vector3();
      this.dice.push({ mesh, mats, from: z0, to: z0, final: new THREE.Quaternion(), axis: new THREE.Vector3(1, 0.6, 0.3).normalize(), spin: 0, t0: now, dur: 1, settled: false, idx: i });
      this.parent.add(mesh);
    }
    this.held = { x, z, t0: now };
  }

  move(x: number, z: number) { if (this.held) { this.held.x = x; this.held.z = z; } }
  get holding() { return this.held !== null; }
  /** Puts held dice down without a throw. */
  release() { if (this.held) { this.held = null; this.clear(); } }

  /** Sends the dice along `flight`; they tumble and land on `values` exactly at its end. Continues from the held position, if any. */
  fly(values: number[], colour: string, flight: DiceFlight, now = performance.now()) {
    const tex = this.textures(colour);
    const prev = this.dice.length === values.length ? this.dice : null;
    this.startY = this.held ? HOLD_Y : 0;
    this.held = null;
    if (!prev) { this.clear(); }
    values.forEach((value, i) => {
      const reuse = prev?.[i];
      const { mats, mesh } = reuse ?? this.mesh(tex);
      const final = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (flight.rest[i]?.rot ?? 0) * Math.PI / 180).multiply(this.alignTo(value));
      const die: Die = {
        mesh, mats, from: new THREE.Vector3(), to: new THREE.Vector3(flight.rest[i]?.x ?? 0, SIZE / 2 + 0.07, flight.rest[i]?.z ?? 0), final,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: (3 + Math.random() * 3) * Math.PI, t0: now, dur: flight.duration * 1000, settled: false, idx: i,
      };
      if (reuse) this.dice[i] = die; else { this.dice.push(die); this.parent.add(mesh); }
    });
    this.flight = flight; this.flightStart = now;
    this.fading = false; this.opacity = 1;
    for (const d of this.dice) d.mats.forEach(m => { m.opacity = 0.88; });
  }

  /** Lets the dice sink away (after the move). */
  fadeOut(now = performance.now()) {
    if (!this.dice.length || this.fading) return;
    this.fading = true; this.fadeFrom = now;
  }

  get active() { return this.dice.length > 0; }

  /** Advances the animation; returns true while anything is still moving or fading. */
  update(now: number): boolean {
    let moving = false;
    const q = new THREE.Quaternion();
    if (this.held) {
      const t = (now - this.held.t0) / 1000, n = this.dice.length;
      this.dice.forEach((d, i) => {
        d.mesh.visible = true;
        d.mesh.position.set(this.held!.x + (i - (n - 1) / 2) * 0.95, HOLD_Y + Math.sin(t * 5 + i) * 0.06, this.held!.z);
        d.mesh.rotation.set(t * 2.2 + i, t * 1.7, t * 1.1);
      });
      return true;
    }
    const frames = this.flight ? this.flight.frame((now - this.flightStart) / 1000) : null;
    for (const d of this.dice) {
      if (d.settled) continue;
      if (frames && d.idx !== undefined && frames[d.idx]) {
        const k = (now - d.t0) / d.dur;
        if (k >= 1) { d.mesh.position.copy(d.to); d.mesh.quaternion.copy(d.final); d.settled = true; continue; }
        moving = true;
        const f = frames[d.idx];
        const settle = Math.max(0, 1 - k / 0.16); // from the hand's height down to the board
        d.mesh.position.set(f.x, d.to.y + f.lift * 0.9 + this.startY * settle * settle, f.z);
        q.setFromAxisAngle(d.axis, d.spin * Math.pow(1 - k, 2));
        d.mesh.quaternion.copy(d.final).premultiply(q);
        d.mesh.visible = true;
        continue;
      }
      const k = (now - d.t0) / d.dur;
      if (k < 0) { moving = true; continue; }
      d.mesh.visible = true;
      if (k >= 1) { d.mesh.position.copy(d.to); d.mesh.quaternion.copy(d.final); d.settled = true; continue; }
      moving = true;
      const e = 1 - Math.pow(1 - k, 2.2); // horizontal travel slows as the dice settle
      d.mesh.position.set(d.from.x + (d.to.x - d.from.x) * e, 0, d.from.z + (d.to.z - d.from.z) * e);
      // height: a fall, then ever smaller bounces
      let prev = 0, y = 0;
      for (let b = 0; b < BOUNCES.length; b++) {
        const [end, peak] = BOUNCES[b];
        if (k <= end) {
          const u = (k - prev) / (end - prev);
          y = b === 0 ? d.from.y * (1 - u * u) + 0 : 4 * peak * u * (1 - u);
          if (b === 0) y = d.from.y * (1 - u) * (1 - u) * (1 - u) + 0.0;
          break;
        }
        prev = end;
      }
      d.mesh.position.y = d.to.y + y;
      q.setFromAxisAngle(d.axis, d.spin * Math.pow(1 - k, 2));
      d.mesh.quaternion.copy(d.final).premultiply(q);
    }
    if (this.fading) {
      const k = (now - this.fadeFrom) / 600;
      this.opacity = Math.max(0, 1 - k);
      for (const d of this.dice) d.mats.forEach(m => { m.opacity = 0.88 * this.opacity; });
      if (k >= 1) { this.clear(); this.fading = false; return false; }
      return true;
    }
    return moving;
  }

  dispose() {
    this.clear();
    this.geo.dispose();
    this.cache.forEach(list => list.forEach(t => t.dispose()));
  }
}
