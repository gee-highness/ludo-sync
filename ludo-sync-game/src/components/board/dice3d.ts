import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const SIZE = 0.52;
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
}

const BOUNCES: [number, number][] = [[0.42, 2.1], [0.7, 0.8], [0.88, 0.3], [1, 0]];

/** Two (or one) dark glass dice with glowing pips: thrown on to the board, they tumble, bounce and settle on the rolled values. Cosmetic only. */
export class DiceRig {
  private dice: Die[] = [];
  private geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 3, 0.07);
  private cache = new Map<string, THREE.CanvasTexture[]>();
  private fadeFrom = 0;
  private fading = false;
  private opacity = 1;

  constructor(private parent: THREE.Object3D) {}

  private textures(colour: string): THREE.CanvasTexture[] {
    let t = this.cache.get(colour);
    if (!t) { t = FACE_VALUE.map(v => faceTexture(v, colour)); this.cache.set(colour, t); }
    return t;
  }

  private clear() {
    for (const d of this.dice) { this.parent.remove(d.mesh); d.mats.forEach(m => m.dispose()); }
    this.dice = [];
  }

  /** Throws one die per value. `calm` (or a zero duration) puts them straight down on their values. */
  throw(values: number[], colour: string, durationMs: number, calm: boolean, now = performance.now()) {
    this.clear();
    this.fading = false; this.opacity = 1;
    const tex = this.textures(colour);
    values.forEach((value, i) => {
      const mats = tex.map(map => new THREE.MeshStandardMaterial({ color: "#10131f", map, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
      const mesh = new THREE.Mesh(this.geo, mats);
      const n = values.length;
      const to = new THREE.Vector3((i - (n - 1) / 2) * 0.95 + (Math.random() - 0.5) * 0.35, SIZE / 2 + 0.07, (Math.random() - 0.5) * 0.8);
      const ang = Math.random() * Math.PI * 2;
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
    for (const d of this.dice) {
      if (d.settled) continue;
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
