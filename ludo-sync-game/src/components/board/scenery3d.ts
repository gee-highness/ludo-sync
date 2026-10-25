import * as THREE from "three";
import type { DayPhase } from "@/lib/client/scenery";

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TAU = Math.PI * 2;

export interface Scenery3D {
  group: THREE.Group;
  /** Recolours the world for the time of day. */
  setPhase: (phase: DayPhase) => void;
  dispose: () => void;
}

const PHASE = {
  day: { grass: 0x4f9a55, hill: 0x3f8460, hill2: 0x2f6f6a, leaf: 0x2f8f46, pine: 0x256f3a, tower: 0x9fb4c8, glow: 0.0, fog: 0x3a7ea6 },
  dusk: { grass: 0x35603f, hill: 0x2c4a52, hill2: 0x2a3d5a, leaf: 0x265c36, pine: 0x1d4a30, tower: 0x6b7388, glow: 0.7, fog: 0x7a5a78 },
  night: { grass: 0x17331f, hill: 0x13262d, hill2: 0x10203a, leaf: 0x14301f, pine: 0x0f2a1b, tower: 0x2a3550, glow: 1.3, fog: 0x141c3c },
} as const;

const windowTexture = (): THREE.CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#101828"; g.fillRect(0, 0, 128, 128);
  const r = rng(11);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = r() < 0.62 ? (r() < 0.5 ? "#ffd27a" : "#ffe9a8") : "#1b2538";
    g.fillRect(x * 32 + 6, y * 16 + 4, 20, 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/**
 * The country around the road board in 3D: grass, rolling hills, pines and round trees, and a distant skyline.
 * Everything is instanced, so the whole world is a handful of draw calls and costs a phone almost nothing.
 */
export const buildScenery3D = (high: boolean, seed = 5, minimal = false): Scenery3D => {
  const group = new THREE.Group();
  const own: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => { own.push(x); return x; };
  const r = rng(seed);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => {
    e.set(0, ry, 0); q.setFromEuler(e); p.set(x, y, z); sc.set(sx, sy, sz);
    mesh.setMatrixAt(i, m4.compose(p, q, sc));
  };
  /** A point in the ring round the board, out of the way of the play area. */
  const ring = (min: number, max: number): [number, number] => {
    for (let tries = 0; tries < 20; tries++) {
      const a = r() * TAU, d = min + r() * (max - min);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      // keep the strip in front of the board (where the camera sits) clear, so nothing grows in the way
      if (z > 4 && Math.abs(x) < 14) continue;
      return [x, z];
    }
    return [-20, -20];
  };

  // a soft, mottled lawn instead of one flat colour
  let lawn: THREE.CanvasTexture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256);
      const rr = rng(seed + 3);
      // soft blotches, drawn again at every edge so the texture tiles without a seam
      for (let i = 0; i < 90; i++) {
        const x = rr() * 256, y = rr() * 256, radius = 14 + rr() * 34, dark = rr() < 0.55, alpha = 0.035 + rr() * 0.04;
        for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
          const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
          gr.addColorStop(0, `rgba(${dark ? "0,45,0" : "255,255,230"},${alpha})`); gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr; g.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
        }
      }
      lawn = new THREE.CanvasTexture(c);
      lawn.wrapS = lawn.wrapT = THREE.RepeatWrapping; lawn.repeat.set(14, 14); lawn.colorSpace = THREE.SRGBColorSpace; track(lawn);
    }
  }
  const grass = track(new THREE.MeshStandardMaterial({ color: PHASE.day.grass, roughness: 1, map: lawn }));
  const ground = new THREE.Mesh(track(new THREE.CircleGeometry(90, 48)), grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true;
  group.add(ground);

  const setGround = (phase: DayPhase) => grass.color.setHex(PHASE[phase].grass);
  if (minimal) return { group, setPhase: setGround, dispose: () => own.forEach(x => x.dispose()) }; // just the lawn, for the slowest devices

  // hills
  const hillMat = track(new THREE.MeshStandardMaterial({ color: PHASE.day.hill, roughness: 1, flatShading: true }));
  const hillMat2 = track(new THREE.MeshStandardMaterial({ color: PHASE.day.hill2, roughness: 1, flatShading: true }));
  const hillGeo = track(new THREE.SphereGeometry(1, 14, 8));
  const hills = [new THREE.InstancedMesh(hillGeo, hillMat, 9), new THREE.InstancedMesh(hillGeo, hillMat2, 9)];
  hills.forEach((mesh, k) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + k * 0.35 + r() * 0.2, d = (k ? 62 : 48) + r() * 8, s = 10 + r() * 9;
      place(mesh, i, Math.cos(a) * d, -1, Math.sin(a) * d, s * 1.5, s * (k ? 0.5 : 0.38), s * 1.2);
    }
    group.add(mesh);
  });

  // trees
  const pineMat = track(new THREE.MeshStandardMaterial({ color: PHASE.day.pine, roughness: 0.9, flatShading: true }));
  const leafMat = track(new THREE.MeshStandardMaterial({ color: PHASE.day.leaf, roughness: 0.9, flatShading: true }));
  const barkMat = track(new THREE.MeshStandardMaterial({ color: 0x5b3d24, roughness: 1 }));
  const count = high ? 46 : 24;
  const pines = new THREE.InstancedMesh(track(new THREE.ConeGeometry(0.75, 2.4, 7)), pineMat, count);
  const crowns = new THREE.InstancedMesh(track(new THREE.IcosahedronGeometry(0.95, 1)), leafMat, count);
  const trunks = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.12, 0.17, 1.2, 6)), barkMat, count * 2);
  for (let i = 0; i < count; i++) {
    const [x, z] = ring(13, 32);
    const s = 0.8 + r() * 0.8;
    place(pines, i, x, 1.3 * s, z, s, s, s);
    place(trunks, i, x, 0.55 * s, z, s, s, s);
    const [x2, z2] = ring(13, 32);
    place(crowns, i, x2, 1.35 * s, z2, s, s * 0.95, s);
    place(trunks, count + i, x2, 0.55 * s, z2, s, s, s);
  }
  group.add(pines, crowns, trunks);

  // a distant skyline: three sizes of tower, windows lit more as the day goes
  const win = windowTexture();
  const towerMat = track(new THREE.MeshStandardMaterial({ color: PHASE.day.tower, map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0, roughness: 0.7 }));
  if (win) track(win);
  const sizes: [number, number][] = [[2.2, 5], [2.6, 8], [2, 11]];
  const towers = sizes.map(([w, h], k) => {
    const geo = track(new THREE.BoxGeometry(w, h, w));
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) { if (f === 2 || f === 3) continue; for (let v = 0; v < 4; v++) uv.setXY(f * 4 + v, uv.getX(f * 4 + v) * (w / 1.6), uv.getY(f * 4 + v) * (h / 2)); }
    const n = high ? 6 : 3;
    const mesh = new THREE.InstancedMesh(geo, towerMat, n);
    for (let i = 0; i < n; i++) {
      const a = ((i + k * 0.37) / n) * TAU + r() * 0.5, d = 34 + r() * 10;
      place(mesh, i, Math.cos(a) * d, h / 2 - 0.5, Math.sin(a) * d, 1, 1, 1, r() * TAU);
    }
    group.add(mesh);
    return mesh;
  });
  void towers;

  const setPhase = (phase: DayPhase) => {
    const c = PHASE[phase];
    grass.color.setHex(c.grass); hillMat.color.setHex(c.hill); hillMat2.color.setHex(c.hill2);
    pineMat.color.setHex(c.pine); leafMat.color.setHex(c.leaf); towerMat.color.setHex(c.tower); towerMat.emissiveIntensity = c.glow;
  };
  return { group, setPhase, dispose: () => own.forEach(x => x.dispose()) };
};

export const FOG_COLOUR: Record<DayPhase, number> = { day: PHASE.day.fog, dusk: PHASE.dusk.fog, night: PHASE.night.fog };
