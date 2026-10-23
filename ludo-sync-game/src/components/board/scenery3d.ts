import * as THREE from "three";
import { SEAT_INFO, pointOf, YARD, type Seat } from "@/lib/ludo/board";
import type { TimeOfDay } from "@/lib/client/settings";

interface Mood {
  skyTop: string; skyHorizon: string; fog: string;
  hemiSky: number; hemiGround: number; hemiK: number;
  sun: number; sunK: number;
  windowsLit: number; lamps: number; stars: number; glowK: number;
  wall: string[]; ground: string; sidewalk: string; leaf: string;
  moon: string; moonPos: [number, number, number];
}

export const MOODS: Record<TimeOfDay, Mood> = {
  day: { skyTop: "#5aa9f0", skyHorizon: "#d6ecff", fog: "#d6ecff", hemiSky: 0xffffff, hemiGround: 0x8899bb, hemiK: 1.7, sun: 0xffffff, sunK: 1.5,
    windowsLit: 0.06, lamps: 0, stars: 0, glowK: 0, wall: ["#b9a89a", "#9aa7b5", "#c8b6a0", "#8d99a8"], ground: "#4c525e", sidewalk: "#9aa0ab", leaf: "#3f8f4a",
    moon: "#fff3b0", moonPos: [-26, 24, -40] },
  dusk: { skyTop: "#2c2a63", skyHorizon: "#ff9a6b", fog: "#7a5a7a", hemiSky: 0xffd9c2, hemiGround: 0x4a4f7a, hemiK: 1.45, sun: 0xffb27a, sunK: 1.2,
    windowsLit: 0.5, lamps: 0.75, stars: 0.35, glowK: 0.8, wall: ["#6b5f6d", "#5b6479", "#7a6a66", "#4f5872"], ground: "#262a36", sidewalk: "#4a4f61", leaf: "#2f6a3f",
    moon: "#ffd9a0", moonPos: [-26, 12, -40] },
  night: { skyTop: "#050818", skyHorizon: "#1d2b57", fog: "#141d3d", hemiSky: 0xa9b8ff, hemiGround: 0x1a2240, hemiK: 1.15, sun: 0x9db4ff, sunK: 0.85,
    windowsLit: 0.85, lamps: 1, stars: 1, glowK: 1, wall: ["#3a3f55", "#2f364c", "#454058", "#2b3348"], ground: "#161923", sidewalk: "#303548", leaf: "#1f4a30",
    moon: "#e8efff", moonPos: [-24, 22, -42] },
};

/** Mulberry32, so the city looks the same every visit. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export interface SceneryHandle {
  group: THREE.Group;
  /** Moves cars and people, flickers signs. */
  update: (t: number) => void;
  dispose: () => void;
}

const disposer = () => {
  const list: { dispose: () => void }[] = [];
  return { track: <T extends { dispose: () => void }>(x: T): T => { list.push(x); return x; }, all: () => list.forEach(x => x.dispose()) };
};

const canvasTex = (c: HTMLCanvasElement, repeat = false) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** A vertical sky gradient for the scene background. */
export const skyTexture = (m: Mood): THREE.CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, m.skyTop); grad.addColorStop(0.65, m.skyHorizon); grad.addColorStop(1, m.skyHorizon);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  return canvasTex(c);
};

const glowTex = (colour: string) => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, colour); grad.addColorStop(0.3, colour); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return canvasTex(c);
};

/** Building facades: a wall colour with a grid of windows, some lit. Returns the colour map and a matching glow map. */
const facade = (wall: string, litP: number, seed: number) => {
  const r = rng(seed);
  const W = 128, H = 256, cols = 6, rows = 12;
  const mk = (glowOnly: boolean) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = glowOnly ? "#000" : wall; g.fillRect(0, 0, W, H);
    const rr = rng(seed);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = rr() < litP;
      const kind = rr();
      const col = lit ? (kind < 0.7 ? "#ffd27a" : kind < 0.88 ? "#9ad0ff" : "#c9a4ff") : glowOnly ? "#000" : "#10141f";
      g.fillStyle = col;
      g.fillRect(x * (W / cols) + 4, y * (H / rows) + 5, W / cols - 8, H / rows - 10);
    }
    return canvasTex(c, true);
  };
  void r;
  return { map: mk(false), glow: mk(true) };
};

const signTex = (text: string, colour: string) => {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 96;
  const g = c.getContext("2d")!;
  g.font = "800 58px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = colour; g.shadowBlur = 22; g.fillStyle = colour;
  g.fillText(text, 128, 50);
  g.shadowBlur = 6; g.fillStyle = "#fff"; g.globalAlpha = 0.85; g.fillText(text, 128, 50);
  return canvasTex(c);
};

/**
 * A point on a rounded square loop of half-size R, with its unit direction of travel, for u in 0..1.
 * Travel is clockwise seen from above; pass `reverse` for the opposite lane.
 */
export const loop = (u: number, R: number, rc = 1.3, reverse = false) => {
  const e = R - rc, L = 2 * e, arc = (Math.PI / 2) * rc, total = 4 * (L + arc);
  let d = ((((reverse ? -u : u) % 1) + 1) % 1) * total;
  const edges: [number, number, number, number][] = [[-e, -R, 1, 0], [R, -e, 0, 1], [e, R, -1, 0], [-R, e, 0, -1]];
  const centres: [number, number][] = [[e, -e], [e, e], [-e, e], [-e, -e]];
  let out = { x: 0, z: -R, dx: 1, dz: 0 };
  for (let i = 0; i < 4; i++) {
    if (d <= L) {
      const [sx, sz, dx, dz] = edges[i];
      out = { x: sx + dx * d, z: sz + dz * d, dx, dz };
      break;
    }
    d -= L;
    if (d <= arc) {
      const a = -Math.PI / 2 + i * (Math.PI / 2) + (d / arc) * (Math.PI / 2);
      out = { x: centres[i][0] + Math.cos(a) * rc, z: centres[i][1] + Math.sin(a) * rc, dx: -Math.sin(a), dz: Math.cos(a) };
      break;
    }
    d -= arc;
  }
  return reverse ? { ...out, dx: -out.dx, dz: -out.dz } : out;
};

/** Rotation about y that turns an object built along +x to face a direction on the ground. */
const facingY = (dx: number, dz: number) => Math.atan2(-dz, dx);

/** The city around the board: ground, roads, sidewalks, lamps, trees, buildings with lit windows, neon signs, traffic and people. */
export const buildCity = (time: TimeOfDay, high: boolean): SceneryHandle & { mood: Mood; stars: THREE.Points | null } => {
  const m = MOODS[time];
  const d = disposer();
  const group = new THREE.Group();
  const r = rng(7);
  const std = (colour: string, rough = 0.9) => d.track(new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: 0 }));
  const basic = (colour: string | number, opacity = 1) => d.track(new THREE.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity }));

  // ground, sidewalks, road markings
  const ground = new THREE.Mesh(d.track(new THREE.PlaneGeometry(160, 160)), std(m.ground));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06;
  group.add(ground);
  const walkMat = std(m.sidewalk, 0.8);
  const frame = (inner: number, outer: number, y: number, h: number) => {
    const w = outer - inner, mid = (inner + outer) / 2;
    [[0, -mid, outer * 2, w], [0, mid, outer * 2, w], [-mid, 0, w, inner * 2], [mid, 0, w, inner * 2]].forEach(([x, z, sx, sz]) => {
      const b = new THREE.Mesh(d.track(new THREE.BoxGeometry(sx, h, sz)), walkMat);
      b.position.set(x, y, z);
      group.add(b);
    });
  };
  frame(7.7, 8.7, -0.01, 0.1);
  frame(10.7, 11.7, -0.01, 0.1);
  const dash = new THREE.InstancedMesh(d.track(new THREE.BoxGeometry(0.7, 0.01, 0.12)), basic("#d9d2a0", 0.7), 64);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 64; i++) {
    const p = loop(i / 64, 9.7);
    mtx.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingY(p.dx, p.dz)), new THREE.Vector3(1, 1, 1));
    dash.setMatrixAt(i, mtx);
  }
  group.add(dash);

  // buildings
  const variants = m.wall.map((w, i) => facade(w, m.windowsLit, 11 + i * 17));
  variants.forEach(v => { d.track(v.map); d.track(v.glow); });
  const roofMat = std("#1c2030");
  const bMats = variants.map(v => {
    const mat = d.track(new THREE.MeshStandardMaterial({ map: v.map, emissive: 0xffffff, emissiveMap: v.glow, emissiveIntensity: 0.4 + 0.9 * m.windowsLit, roughness: 0.85 }));
    return mat;
  });
  const signs: { mesh: THREE.Mesh; phase: number }[] = [];
  const SIGNS: [string, string][] = [["BAR", "#ff4fa3"], ["KARAOKE", "#4fd2ff"], ["PIZZA", "#ffb84f"], ["CAFÉ", "#8cff6b"], ["CLUB", "#c26bff"], ["NOODLES", "#ff6b6b"]];
  let signIdx = 0;
  const addBuilding = (x: number, z: number, w: number, depth: number, h: number, faceX: number, faceZ: number) => {
    const geo = new THREE.BoxGeometry(w, h, depth);
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let face = 0; face < 6; face++) for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      if (face === 2 || face === 3) continue;
      const along = face < 2 ? depth : w;
      uv.setXY(i, uv.getX(i) * (along / 2.3), uv.getY(i) * (h / 2.8));
    }
    d.track(geo);
    const wall = bMats[Math.floor(r() * bMats.length)];
    const mats = [wall, wall, roofMat, roofMat, wall, wall];
    const b = new THREE.Mesh(geo, mats);
    b.position.set(x, h / 2 - 0.06, z);
    group.add(b);
    if (high && signIdx < 14 && r() < 0.42 && h > 3.2) {
      const [text, col] = SIGNS[signIdx++ % SIGNS.length];
      const tex = d.track(signTex(text, col));
      const sign = new THREE.Mesh(d.track(new THREE.PlaneGeometry(1.9, 0.72)), d.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.4 + 0.6 * m.glowK })));
      sign.position.set(x + faceX * (w / 2 + 0.03), 1.6 + r() * 1.4, z + faceZ * (depth / 2 + 0.03));
      sign.rotation.y = faceX !== 0 ? faceX * Math.PI / 2 : faceZ > 0 ? 0 : Math.PI;
      group.add(sign);
      signs.push({ mesh: sign, phase: r() * 10 });
    }
  };
  // rows beyond the outer sidewalk: north (far), east and west; the south side is behind the camera
  const row = (side: "n" | "e" | "w", count: number) => {
    let pos = -17;
    for (let i = 0; i < count; i++) {
      const w = 2.4 + r() * 2.4, depth = 3 + r() * 2.5, h = 3.5 + r() * (side === "n" ? 11 : 9);
      const off = 13.2 + depth / 2 + r() * 0.8;
      pos += w / 2;
      if (side === "n") addBuilding(pos, -off, w, depth, h, 0, 1);
      else if (side === "e") addBuilding(off, pos, depth, w, h, -1, 0);
      else addBuilding(-off, pos, depth, w, h, 1, 0);
      pos += w / 2 + 0.25 + r() * 0.5;
      if (pos > 17) break;
    }
  };
  row("n", high ? 12 : 8); row("e", high ? 8 : 5); row("w", high ? 8 : 5);
  // far skyline
  for (let i = 0; i < (high ? 14 : 8); i++) {
    const w = 3 + r() * 4, h = 10 + r() * 22;
    addBuilding(-38 + i * (high ? 5.6 : 9) + r() * 2, -34 - r() * 8, w, 4 + r() * 3, h, 0, 1);
  }

  // street lamps
  const poleMat = std("#1a1d27", 0.5);
  const bulbMat = basic("#ffe2a0");
  const haloT = d.track(glowTex("rgba(255,214,140,1)"));
  const lampGeo = [d.track(new THREE.CylinderGeometry(0.045, 0.06, 2.1, 6)), d.track(new THREE.SphereGeometry(0.13, 10, 8))];
  const lampSpots: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const t = -6.6 + i * 2.65;
    lampSpots.push([t, -8.2], [t, 8.2], [-8.2, t], [8.2, t]);
  }
  const lampHalos: THREE.Sprite[] = [];
  const floorGlow = d.track(new THREE.CircleGeometry(1.7, 24));
  const floorGlowMat = d.track(new THREE.MeshBasicMaterial({ map: haloT, transparent: true, opacity: 0.2 * m.lamps, depthWrite: false, blending: THREE.AdditiveBlending }));
  for (const [x, z] of lampSpots) {
    const pole = new THREE.Mesh(lampGeo[0], poleMat); pole.position.set(x, 1.0, z);
    const bulb = new THREE.Mesh(lampGeo[1], m.lamps > 0 ? bulbMat : poleMat); bulb.position.set(x, 2.1, z);
    group.add(pole, bulb);
    if (m.lamps > 0) {
      const halo = new THREE.Sprite(d.track(new THREE.SpriteMaterial({ map: haloT, transparent: true, opacity: 0.55 * m.lamps, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(1.25, 1.25, 1); halo.position.set(x, 2.1, z);
      group.add(halo); lampHalos.push(halo);
      const fg = new THREE.Mesh(floorGlow, floorGlowMat); fg.rotation.x = -Math.PI / 2; fg.position.set(x, 0.07, z);
      group.add(fg);
    }
  }

  // trees along the outer sidewalk
  const trunk = std("#4a3426"), leaf = std(m.leaf, 0.95);
  const trunkGeo = d.track(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 6)), crownGeo = d.track(new THREE.IcosahedronGeometry(0.62, 0));
  for (let i = 0; i < (high ? 16 : 8); i++) {
    const p = loop(i / (high ? 16 : 8) + 0.03, 11.2, 0.9);
    const tr = new THREE.Mesh(trunkGeo, trunk); tr.position.set(p.x, 0.5, p.z);
    const c1 = new THREE.Mesh(crownGeo, leaf); c1.position.set(p.x, 1.4, p.z); c1.scale.set(1, 1.15, 1);
    const c2 = new THREE.Mesh(crownGeo, leaf); c2.position.set(p.x + 0.2, 1.85, p.z - 0.1); c2.scale.setScalar(0.7);
    group.add(tr, c1, c2);
  }

  // traffic and people
  const cars: { g: THREE.Group; u: number; speed: number; lane: number }[] = [];
  const people: { g: THREE.Group; u: number; speed: number; phase: number }[] = [];
  const carCol = ["#d94f4f", "#4f7fd9", "#e0c04f", "#e8e8ec", "#4fb37a", "#9a6bd9", "#2f3342"];
  const bodyGeo = d.track(new THREE.BoxGeometry(0.95, 0.28, 0.46)), cabGeo = d.track(new THREE.BoxGeometry(0.5, 0.22, 0.4));
  const lightGeo = d.track(new THREE.BoxGeometry(0.05, 0.07, 0.1));
  const headMat = basic("#fff2c2"), tailMat = basic("#ff3b3b");
  const carHalo = d.track(glowTex("rgba(255,240,190,1)"));
  const nCars = high ? 10 : 5;
  for (let i = 0; i < nCars; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, std(carCol[i % carCol.length], 0.45)); body.position.y = 0.2;
    const cab = new THREE.Mesh(cabGeo, std("#1d2433", 0.3)); cab.position.set(-0.05, 0.44, 0);
    g.add(body, cab);
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(lightGeo, headMat); hl.position.set(0.48, 0.22, s * 0.15);
      const tl = new THREE.Mesh(lightGeo, tailMat); tl.position.set(-0.48, 0.22, s * 0.15);
      g.add(hl, tl);
    }
    if (m.lamps > 0) {
      const halo = new THREE.Sprite(d.track(new THREE.SpriteMaterial({ map: carHalo, transparent: true, opacity: 0.6 * m.glowK, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(1.3, 1.3, 1); halo.position.set(0.9, 0.22, 0);
      g.add(halo);
    }
    group.add(g);
    cars.push({ g, u: r(), speed: (0.011 + r() * 0.01) * (i % 2 ? 1 : -1), lane: i % 2 });
  }
  const coat = ["#2d3350", "#5a4a3a", "#3c4a42", "#6a6a74", "#7a3f4a", "#d8c9a0"];
  const bodyP = d.track(new THREE.CapsuleGeometry(0.075, 0.22, 3, 8)), headP = d.track(new THREE.SphereGeometry(0.075, 8, 6)), caseP = d.track(new THREE.BoxGeometry(0.1, 0.08, 0.04));
  const skin = ["#f1c9a5", "#c98f66", "#8d5a3b", "#e3b48f"];
  for (let i = 0; i < (high ? 14 : 6); i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(bodyP, std(coat[i % coat.length], 0.8)); b.position.y = 0.26;
    const h = new THREE.Mesh(headP, std(skin[i % skin.length], 0.8)); h.position.y = 0.52;
    g.add(b, h);
    if (i % 3 === 0) { const c = new THREE.Mesh(caseP, std("#3a2a1e", 0.6)); c.position.set(0.1, 0.16, 0); g.add(c); }
    group.add(g);
    people.push({ g, u: r(), speed: (0.0035 + r() * 0.002) * (i % 2 ? 1 : -1), phase: r() * 6 });
  }

  // sky: moon or sun, stars
  const moonSprite = new THREE.Sprite(d.track(new THREE.SpriteMaterial({ map: d.track(glowTex(m.moon)), transparent: true, depthWrite: false, fog: false })));
  moonSprite.scale.set(time === "day" ? 12 : 9, time === "day" ? 12 : 9, 1);
  moonSprite.position.set(...m.moonPos);
  group.add(moonSprite);
  let stars: THREE.Points | null = null;
  if (m.stars > 0) {
    const n = 220, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, e = 0.15 + r() * 0.8;
      pos[i * 3] = Math.cos(a) * 70 * Math.cos(e); pos[i * 3 + 1] = 15 + Math.sin(e) * 45; pos[i * 3 + 2] = -Math.abs(Math.sin(a)) * 70 * Math.cos(e) - 10;
    }
    const geo = d.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(geo, d.track(new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.9 * m.stars, depthWrite: false, fog: false })));
    group.add(stars);
  }

  const update = (t: number) => {
    for (const c of cars) {
      const p = loop(c.u + t * Math.abs(c.speed), c.lane ? 9.15 : 10.25, 1.3, c.speed < 0);
      c.g.position.set(p.x, 0, p.z);
      c.g.rotation.y = facingY(p.dx, p.dz);
    }
    for (const pp of people) {
      const p = loop(pp.u + t * Math.abs(pp.speed), 8.2, 0.9, pp.speed < 0);
      pp.g.position.set(p.x, 0.06 + Math.abs(Math.sin(t * 6 + pp.phase)) * 0.025, p.z);
      pp.g.rotation.y = facingY(p.dx, p.dz);
    }
    for (const s of signs) (s.mesh.material as THREE.MeshBasicMaterial).opacity = (0.55 + 0.45 * m.glowK) * (Math.sin(t * 3 + s.phase) > -0.92 ? 1 : 0.35);
    for (const [i, h] of lampHalos.entries()) h.material.opacity = 0.55 * m.lamps * (0.93 + 0.07 * Math.sin(t * 5 + i));
    if (stars) (stars.material as THREE.PointsMaterial).opacity = m.stars * (0.78 + 0.22 * Math.sin(t * 1.3));
  };
  update(0);
  return { group, update, mood: m, stars, dispose: () => d.all() };
};

/** The doorway direction of a seat's yard, as a unit vector on the ground, and how far along the edge its start square sits. */
const yardFrame = (seat: Seat) => {
  const slots = [0, 1, 2, 3].map(i => pointOf(seat, i, YARD));
  const cx = slots.reduce((a, p) => a + p.x, 0) / 4, cy = slots.reduce((a, p) => a + p.y, 0) / 4;
  const start = pointOf(seat, 0, 0);
  const dx = start.x - cx, dz = start.y - cy;
  const f = Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) };
  const right = { x: -f.z, z: f.x };
  const lateral = dx * right.x + dz * right.z;
  return { cx: cx - 7, cz: cy - 7, f, right, lateral };
};

/** A lived-in room for one start area: rug, sofa, plant, lamp, table with a mug, string lights, a lit door, a briefcase and hat. */
export const buildYardProps = (seat: Seat, time: TimeOfDay, high: boolean): SceneryHandle => {
  const m = MOODS[time];
  const d = disposer();
  const info = SEAT_INFO[seat];
  const fr = yardFrame(seat);
  const root = new THREE.Group();
  root.position.set(fr.cx, 0, fr.cz);
  // local frame: +z forward = door direction, +x = right of that
  const inner = new THREE.Group();
  inner.rotation.y = Math.atan2(fr.f.x, fr.f.z);
  root.add(inner);
  const std = (c: string, rough = 0.8, emissive?: string, ei = 0) =>
    d.track(new THREE.MeshStandardMaterial({ color: c, roughness: rough, ...(emissive ? { emissive, emissiveIntensity: ei } : {}) }));
  const box = (w: number, h: number, dd: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(d.track(new THREE.BoxGeometry(w, h, dd)), mat);
    mesh.position.set(x, y + h / 2, z);
    inner.add(mesh);
    return mesh;
  };
  const warm = m.lamps > 0 || time === "dusk";

  // rug
  const rugMat = (c: string) => { const mt = std(c, 1); mt.polygonOffset = true; mt.polygonOffsetFactor = -2; mt.polygonOffsetUnits = -2; return mt; };
  [[1.75, info.dark], [1.5, info.light], [1.15, info.main]].forEach(([rad, c], i) => {
    const disc = new THREE.Mesh(d.track(new THREE.CircleGeometry(rad as number, 36)), rugMat(c as string));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.075 + i * 0.002;
    inner.add(disc);
  });
  // back wall with a window, string lights, sofa
  const wall = std("#d9c7a8", 0.9);
  box(5.4, 1.15, 0.14, wall, 0, 0.05, -2.85);
  const win = new THREE.Mesh(d.track(new THREE.PlaneGeometry(1.2, 0.6)), d.track(new THREE.MeshBasicMaterial({ color: warm ? "#ffd98a" : "#bfe3ff" })));
  win.position.set(1.4, 0.75, -2.77);
  inner.add(win);
  box(2.2, 0.28, 0.9, std(info.dark, 0.9), -0.8, 0.05, -2.25);
  box(2.2, 0.55, 0.22, std(info.dark, 0.9), -0.8, 0.2, -2.62);
  box(0.22, 0.4, 0.9, std(info.dark, 0.9), -1.8, 0.1, -2.25);
  box(0.22, 0.4, 0.9, std(info.dark, 0.9), 0.2, 0.1, -2.25);
  box(0.8, 0.12, 0.6, std(info.light, 0.9), -0.4, 0.33, -2.2);
  // coffee table and mug
  box(0.7, 0.05, 0.5, std("#7a5632", 0.6), 0, 0.28, 0.0);
  [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]].forEach(([x, z]) => box(0.05, 0.22, 0.05, std("#5a3f24"), x, 0.07, z));
  const mug = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 10)), std("#f4f1ea", 0.4));
  mug.position.set(0.12, 0.38, 0.02); inner.add(mug);
  // plant
  const pot = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10)), std("#b5653a", 0.8));
  pot.position.set(2.35, 0.2, -2.3); inner.add(pot);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(d.track(new THREE.IcosahedronGeometry(0.22 - i * 0.03, 0)), std(m.leaf === "#3f8f4a" ? "#3f9a52" : "#2f7a45", 0.9));
    leaf.position.set(2.35 + (i - 1) * 0.12, 0.5 + i * 0.2, -2.3 + (i % 2) * 0.08); inner.add(leaf);
  }
  // floor lamp
  const lampPole = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.03, 0.05, 1.2, 6)), std("#222733"));
  lampPole.position.set(-2.35, 0.6, -2.3); inner.add(lampPole);
  const shade = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.17, 0.26, 0.3, 12, 1, true)), d.track(new THREE.MeshBasicMaterial({ color: warm ? "#ffe0a0" : "#f4ecd0", side: THREE.DoubleSide })));
  shade.position.set(-2.35, 1.3, -2.3); inner.add(shade);
  if (m.lamps > 0) {
    const halo = new THREE.Sprite(d.track(new THREE.SpriteMaterial({ map: d.track(glowTex("rgba(255,214,140,1)")), transparent: true, opacity: 0.8 * m.lamps, depthWrite: false, blending: THREE.AdditiveBlending })));
    halo.scale.set(2.2, 2.2, 1); halo.position.set(-2.35, 1.2, -2.3); inner.add(halo);
  }
  // door: frame, glowing leaf, mat, briefcase and hat
  const dz = 2.95, dx = Math.max(-1.6, Math.min(1.6, fr.lateral));
  const frameMat = std("#3b2a1c", 0.7);
  box(0.1, 1.5, 0.12, frameMat, dx - 0.6, 0.05, dz); box(0.1, 1.5, 0.12, frameMat, dx + 0.6, 0.05, dz); box(1.3, 0.1, 0.12, frameMat, dx, 1.5, dz);
  const leaf = new THREE.Mesh(d.track(new THREE.PlaneGeometry(1.1, 1.45)), d.track(new THREE.MeshBasicMaterial({ color: "#ffcf7a", transparent: true, opacity: 0.55 })));
  leaf.position.set(dx, 0.8, dz); inner.add(leaf);
  const mat = new THREE.Mesh(d.track(new THREE.PlaneGeometry(1.0, 0.5)), d.track(new THREE.MeshStandardMaterial({ color: "#6b4f35", roughness: 1 })));
  mat.rotation.x = -Math.PI / 2; mat.position.set(dx, 0.09, dz - 0.45); inner.add(mat);
  box(0.34, 0.24, 0.1, std("#4a3322", 0.5), dx + 0.62, 0.08, dz - 0.7);
  const hatBase = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 10)), std("#2a2f3d", 0.6)); hatBase.position.set(dx - 0.7, 0.17, dz - 0.7);
  const hatBrim = new THREE.Mesh(d.track(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 14)), std("#2a2f3d", 0.6)); hatBrim.position.set(dx - 0.7, 0.115, dz - 0.7);
  inner.add(hatBase, hatBrim);

  // party string lights along the wall top
  const bulbs: THREE.Mesh[] = [];
  const bulbCols = ["#ff5fa8", "#ffd34f", "#5fd4ff", "#8cff6b", "#c26bff"];
  if (high) for (let i = 0; i < 9; i++) {
    const x = -2.5 + i * 0.62;
    const b = new THREE.Mesh(d.track(new THREE.SphereGeometry(0.06, 8, 6)), d.track(new THREE.MeshBasicMaterial({ color: bulbCols[i % bulbCols.length] })));
    b.position.set(x, 1.12 + Math.sin(i * 1.7) * 0.05, -2.7);
    inner.add(b); bulbs.push(b);
  }
  const update = (t: number) => {
    bulbs.forEach((b, i) => { b.scale.setScalar(0.8 + 0.5 * Math.max(0, Math.sin(t * 3 + i * 1.3))); });
    (leaf.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.08 * Math.sin(t * 2 + seat);
  };
  update(0);
  return { group: root, update, dispose: () => d.all() };
};
