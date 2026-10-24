import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Night colours for the neon city: used for the sky, fog and the scene's lights. */
export const NIGHT = {
  skyTop: "#04061a", skyHorizon: "#2a1b5c", fog: "#150f35",
  hemiSky: 0xa9b8ff, hemiGround: 0x1a2240, hemiK: 1.25, sun: 0x9db4ff, sunK: 0.9,
};

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export interface CityHandle {
  group: THREE.Group;
  update: (t: number) => void;
  dispose: () => void;
}

const tex = (c: HTMLCanvasElement, repeat = false) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

export const skyTexture = (): THREE.CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, NIGHT.skyTop); grad.addColorStop(0.7, NIGHT.skyHorizon); grad.addColorStop(1, NIGHT.skyHorizon);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  return tex(c);
};

const NEON = ["#22d3ee", "#f472b6", "#a78bfa", "#facc15", "#34d399", "#fb923c"];
const WORDS = ["RAMEN", "ARCADE", "24H", "HOTEL", "SUSHI", "CLUB", "NEON", "BAR", "CAFE", "DISCO"];

/** Wall + window textures: dark façades whose windows glow in warm, cyan and violet. */
const facade = (seed: number, lit: number) => {
  const W = 128, H = 256, cols = 6, rows = 12;
  const mk = (glowOnly: boolean) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = glowOnly ? "#000" : ["#1b2240", "#241d47", "#17283f", "#2a2140"][seed % 4]; g.fillRect(0, 0, W, H);
    const rr = rng(seed);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = rr() < lit, kind = rr();
      g.fillStyle = on ? (kind < 0.55 ? "#ffd27a" : kind < 0.8 ? "#7de3ff" : kind < 0.93 ? "#f0a0ff" : "#ff8aa0") : glowOnly ? "#000" : "#0b0f1e";
      g.fillRect(x * (W / cols) + 4, y * (H / rows) + 5, W / cols - 8, H / rows - 10);
    }
    return tex(c, true);
  };
  return { map: mk(false), glow: mk(true) };
};

const vSign = (word: string, colour: string) => {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a0a14"; g.fillRect(0, 0, 64, 256);
  g.font = "800 40px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = colour; g.shadowBlur = 14; g.fillStyle = colour;
  [...word].slice(0, 6).forEach((ch, i) => g.fillText(ch, 32, 28 + i * 40));
  g.strokeStyle = colour; g.lineWidth = 4; g.strokeRect(3, 3, 58, 250);
  return tex(c);
};

const hSign = (word: string, colour: string) => {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(5,5,15,.85)"; g.fillRect(0, 0, 256, 96);
  g.font = "800 54px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = colour; g.shadowBlur = 20; g.fillStyle = colour; g.fillText(word, 128, 50);
  g.shadowBlur = 5; g.fillStyle = "#fff"; g.globalAlpha = 0.8; g.fillText(word, 128, 50);
  return tex(c);
};

const glow = (colour: string) => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, colour); gr.addColorStop(0.35, colour); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c);
};

const ACCENTS = ["#ffcf5a", "#ff4fb8", "#22d3ee", "#4ade80", "#ff8a3d", "#a78bfa"];

/** One roof atlas: six roof designs side by side (glass skylights, lit panels, vents, a glowing rim), bright enough to read from above. */
const roofAtlas = () => {
  const T = 128, c = document.createElement("canvas");
  c.width = T * ACCENTS.length; c.height = T;
  const g = c.getContext("2d")!;
  const r = rng(21);
  ACCENTS.forEach((col, i) => {
    const x0 = i * T;
    g.fillStyle = "#1d2a5c"; g.fillRect(x0, 0, T, T);
    // deck panels
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { g.fillStyle = (a + b) % 2 ? "#25357a" : "#1a2656"; g.fillRect(x0 + a * 32 + 1, b * 32 + 1, 30, 30); }
    // big lit skylight and a lit pad
    g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(x0 + 18, 18, 52, 34); g.globalAlpha = 0.45; g.fillRect(x0 + 74, 70, 40, 40);
    g.globalAlpha = 1; g.fillStyle = "rgba(255,255,255,0.55)";
    for (let k = 0; k < 6; k++) g.fillRect(x0 + 22 + k * 8, 22, 4, 26);
    // vents and small lights
    g.fillStyle = "#8fa0d8";
    for (let k = 0; k < 5; k++) g.fillRect(x0 + 10 + r() * 100, 60 + r() * 60, 8 + r() * 8, 8 + r() * 8);
    g.fillStyle = "#ffffff";
    for (let k = 0; k < 5; k++) g.fillRect(x0 + 8 + r() * 112, 8 + r() * 112, 3, 3);
    // glowing rim
    g.fillStyle = col; g.globalAlpha = 0.95;
    g.fillRect(x0, 0, T, 5); g.fillRect(x0, T - 5, T, 5); g.fillRect(x0, 0, 5, T); g.fillRect(x0 + T - 5, 0, 5, T);
    g.globalAlpha = 1;
  });
  const t = tex(c);
  t.anisotropy = 4;
  return t;
};

/** One tile of ground: dark blocks, glowing street lines on the tile edges, a few lit courtyards. Repeats across the whole floor. */
const groundTile = () => {
  const N = 256, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a0f26"; g.fillRect(0, 0, N, N);
  g.fillStyle = "#0e1634"; g.fillRect(14, 14, N - 28, N - 28);
  g.fillStyle = "rgba(255,200,110,0.2)";
  for (let k = 0; k < 26; k++) g.fillRect(24 + ((k * 61) % 200), 24 + ((k * 37) % 200), 10, 6);
  g.shadowBlur = 14;
  g.shadowColor = "#22d3ee"; g.strokeStyle = "#22d3ee"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, 2); g.lineTo(N, 2); g.moveTo(0, N - 2); g.lineTo(N, N - 2); g.stroke();
  g.shadowColor = "#f472b6"; g.strokeStyle = "#f472b6";
  g.beginPath(); g.moveTo(2, 0); g.lineTo(2, N); g.moveTo(N - 2, 0); g.lineTo(N - 2, N); g.stroke();
  const t = tex(c, true);
  t.anisotropy = 4;
  return t;
};

/** A wide patch of harbour water: deep blue with neon reflections of the towers. */
const waterTexture = () => {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#08204a"); gr.addColorStop(1, "#051233");
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const r = rng(5);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = ["rgba(34,211,238,.35)", "rgba(244,114,182,.3)", "rgba(255,207,90,.3)"][i % 3];
    g.fillRect(r() * 512, r() * 512, 2 + r() * 3, 14 + r() * 50);
  }
  g.strokeStyle = "rgba(120,200,255,.12)"; g.lineWidth = 2;
  for (let y = 12; y < 512; y += 22) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3); g.stroke(); }
  const t = tex(c, true);
  return t;
};

/**
 * The neon night city around and under the board, filling the view to every edge: a glowing street grid under the slab, thousands
 * of lit towers (merged into a handful of meshes) with glowing rooftops, antennas and signs, a harbour, and traffic.
 * `high` = denser and animated; low = sparser, still.
 */
export const buildCityscape = (high: boolean): CityHandle => {
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => { owned.push(x); return x; };
  const r = rng(11);
  const FLOOR = -3.4;
  const BLOCK = 4.2;
  const HALF = high ? 17 : 12; // blocks each way from the centre

  // ground: one big plane with the repeating street tile
  const gt = track(groundTile());
  gt.repeat.set(2 * HALF + 2, 2 * HALF + 2);
  gt.offset.set(0.5, 0.5);
  const groundMat = track(new THREE.MeshBasicMaterial({ map: gt, toneMapped: false }));
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry((2 * HALF + 2) * BLOCK, (2 * HALF + 2) * BLOCK)), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = FLOOR;
  group.add(ground);

  // harbour: water to the south-east (screen bottom-right in the default view), with a neon quay line
  const wt = track(waterTexture());
  wt.repeat.set(3, 3);
  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(34, 26)), track(new THREE.MeshBasicMaterial({ map: wt, toneMapped: false })));
  water.rotation.x = -Math.PI / 2; water.position.set(19, FLOOR + 0.04, 17);
  group.add(water);
  const quay = new THREE.Mesh(track(new THREE.BoxGeometry(34.4, 0.08, 0.2)), track(new THREE.MeshBasicMaterial({ color: "#22d3ee", toneMapped: false })));
  quay.position.set(19, FLOOR + 0.07, 4);
  const quay2 = quay.clone(); quay2.rotation.y = Math.PI / 2; quay2.scale.x = 0.75; quay2.position.set(2, FLOOR + 0.07, 17);
  group.add(quay, quay2);

  // towers: merged per wall variant so a thousand of them cost a handful of draw calls
  const variants = Array.from({ length: 5 }, (_, i) => { const f = facade(7 + i * 13, 0.42 + (i % 3) * 0.12); track(f.map); track(f.glow); return f; });
  const wallMats = variants.map(v => track(new THREE.MeshStandardMaterial({ map: v.map, emissive: 0xffffff, emissiveMap: v.glow, emissiveIntensity: 1.25, roughness: 0.8 })));
  const atlas = track(roofAtlas());
  const roofMat = track(new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false }));
  const bucket: THREE.BufferGeometry[][] = variants.map(() => []);
  const roofs: THREE.BufferGeometry[] = [];
  const trims: THREE.BufferGeometry[] = [];
  const details: THREE.BufferGeometry[] = [];
  const lights: number[] = [];
  const colourOf = (hex: string) => new THREE.Color(hex);
  const paint = (geo: THREE.BufferGeometry, colour: THREE.Color) => {
    const n = geo.getAttribute("position").count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = colour.r; arr[i * 3 + 1] = colour.g; arr[i * 3 + 2] = colour.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  const signSpots: { x: number; z: number; w: number; d: number; h: number }[] = [];
  for (let bx = -HALF; bx <= HALF; bx++) for (let bz = -HALF; bz <= HALF; bz++) {
    const cx = bx * BLOCK, cz = bz * BLOCK;
    const edge = Math.max(Math.abs(cx), Math.abs(cz));
    if (edge < 9.2) continue; // the board and the ring road around it stay clear
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (!high && r() < 0.3) continue;
      const x = cx + ox * 1.02 + (r() - 0.5) * 0.12, z = cz + oz * 1.02 + (r() - 0.5) * 0.12;
      const e = Math.max(Math.abs(x), Math.abs(z));
      const w = 1.55 + r() * 0.5, d = 1.55 + r() * 0.5;
      // low next to the board and to the sides (so the overhead view looks down on lit roofs), rising with distance,
      // and tallest on the far side where the tilted views see the skyline
      // The board stands on girders above the city, so the roofs right next to it sit below it, and the towers rise with distance.
      // The far side (where the tilted camera sees the skyline) gets the tallest ones.
      const farSide = z < -16;
      const h = farSide
        ? Math.min(40, 6 + r() * 6 + (-z - 16) * (0.7 + r() * 0.9))
        : Math.min(26, 0.9 + Math.max(0, e - 9) * (0.4 + r() * 0.2) + r() * 1.8);
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
      const accent = Math.floor(r() * ACCENTS.length);
      for (let face = 0; face < 6; face++) for (let v = 0; v < 4; v++) {
        const i = face * 4 + v;
        if (face === 2) uv.setXY(i, (accent + uv.getX(i)) / ACCENTS.length, uv.getY(i)); // roof: pick one of the atlas designs
        else if (face === 3) uv.setXY(i, 0.001, 0.001); // underside: never seen
        else uv.setXY(i, uv.getX(i) * ((face < 2 ? d : w) / 2.2), uv.getY(i) * (h / 2.6));
      }
      geo.translate(x, FLOOR + h / 2, z);
      // split the box into its four walls and its roof: walls take the facade texture of their variant, roofs the shared atlas
      const index = geo.getIndex()!.array;
      const pick = (faces: number[]) => { const out: number[] = []; faces.forEach(f => { for (let k = 0; k < 6; k++) out.push(index[f * 6 + k]); }); return out; };
      const wallGeo = geo.clone(); wallGeo.setIndex(pick([0, 1, 4, 5]));
      const roofGeo = geo.clone(); roofGeo.setIndex(pick([2]));
      geo.dispose();
      bucket[Math.floor(r() * variants.length)].push(wallGeo);
      roofs.push(roofGeo);
      const top = FLOOR + h;
      // glowing roof edge on some, rooftop gear on most
      if (r() < 0.55) {
        // a glowing parapet: four thin bars round the roof edge, so the roof design still shows between them
        const col = colourOf(ACCENTS[accent]), t = 0.07, y = top + 0.06;
        trims.push(
          paint(new THREE.BoxGeometry(w, 0.12, t).translate(x, y, z - d / 2 + t / 2), col), paint(new THREE.BoxGeometry(w, 0.12, t).translate(x, y, z + d / 2 - t / 2), col),
          paint(new THREE.BoxGeometry(t, 0.12, d).translate(x - w / 2 + t / 2, y, z), col), paint(new THREE.BoxGeometry(t, 0.12, d).translate(x + w / 2 - t / 2, y, z), col),
        );
      }
      if (r() < 0.7) details.push(paint(new THREE.BoxGeometry(0.35 + r() * 0.3, 0.3 + r() * 0.3, 0.35 + r() * 0.3).translate(x + (r() - 0.5) * w * 0.5, top + 0.2, z + (r() - 0.5) * d * 0.5), colourOf(r() < 0.5 ? "#2b3358" : ACCENTS[accent])));
      if (r() < 0.4) {
        const ah = 0.8 + r() * 1.6;
        details.push(paint(new THREE.CylinderGeometry(0.03, 0.04, ah, 5).translate(x + (r() - 0.5) * 0.3, top + ah / 2, z + (r() - 0.5) * 0.3), colourOf("#9aa6c8")));
        lights.push(x, top + ah, z);
      }
      if (e > 11 && h > 5 && signSpots.length < 90) signSpots.push({ x, z, w, d, h });
    }
  }
  bucket.forEach((list, i) => {
    if (!list.length) return;
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (!merged) return;
    group.add(new THREE.Mesh(track(merged), wallMats[i]));
  });
  if (roofs.length) {
    const merged = mergeGeometries(roofs, false);
    roofs.forEach(g => g.dispose());
    if (merged) group.add(new THREE.Mesh(track(merged), roofMat));
  }
  const addColoured = (list: THREE.BufferGeometry[]) => {
    if (!list.length) return;
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (!merged) return;
    track(merged);
    group.add(new THREE.Mesh(merged, track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))));
  };
  addColoured(trims);
  addColoured(details);

  // blinking aircraft lights on the antennas
  let blink: THREE.Points | null = null;
  if (lights.length) {
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lights), 3));
    blink = new THREE.Points(geo, track(new THREE.PointsMaterial({ color: "#ff3b3b", size: 0.5, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    group.add(blink);
  }

  // vertical neon signs and billboards on the tower sides that face the board
  const signs: { m: THREE.MeshBasicMaterial; phase: number }[] = [];
  const maxSigns = high ? 70 : 0;
  for (let i = 0; i < Math.min(maxSigns, signSpots.length); i++) {
    const s = signSpots[Math.floor(r() * signSpots.length)];
    const colour = NEON[Math.floor(r() * NEON.length)];
    const vertical = r() < 0.6;
    const map = track(vertical ? vSign(WORDS[Math.floor(r() * WORDS.length)], colour) : hSign(WORDS[Math.floor(r() * WORDS.length)], colour));
    const m = track(new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    const plane = new THREE.Mesh(track(new THREE.PlaneGeometry(vertical ? 0.9 : 2.2, vertical ? 3.4 : 0.9)), m);
    const toCentre = new THREE.Vector2(-s.x, -s.z).normalize();
    plane.position.set(s.x + toCentre.x * (Math.abs(toCentre.x) * s.w / 2 + 0.06), FLOOR + Math.min(s.h - 1.8, 2.5 + r() * 9), s.z + toCentre.y * (Math.abs(toCentre.y) * s.d / 2 + 0.06));
    plane.lookAt(plane.position.x + toCentre.x, plane.position.y, plane.position.z + toCentre.y);
    group.add(plane);
    signs.push({ m, phase: r() * 9 });
  }

  // traffic: bright dots sliding along the streets
  const trafficGeo = track(new THREE.BoxGeometry(0.5, 0.1, 0.16));
  const traffic: { mesh: THREE.Mesh; axis: 0 | 1; lane: number; speed: number; u: number }[] = [];
  const count = high ? 90 : 0;
  const trafficMats = ["#ff4d6d", "#fff2c2", "#7de3ff"].map(c => track(new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(trafficGeo, trafficMats[i % 3]);
    const lane = (Math.floor(r() * (2 * HALF)) - HALF) * BLOCK + BLOCK / 2 + (r() < 0.5 ? 0.3 : -0.3);
    const axis = (i % 2) as 0 | 1;
    traffic.push({ mesh, axis, lane, speed: (6 + r() * 8) * (r() < 0.5 ? 1 : -1), u: r() * 160 });
    group.add(mesh);
  }

  const halo = track(glow("rgba(120,200,255,0.9)"));
  const haloMat = track(new THREE.SpriteMaterial({ map: halo, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const sprite = new THREE.Sprite(haloMat); sprite.scale.set(110, 50, 1); sprite.position.set(0, 6, -85);
  group.add(sprite);

  const update = (t: number) => {
    for (const s of signs) s.m.opacity = 0.6 + 0.4 * (Math.sin(t * 2.4 + s.phase) > -0.9 ? 1 : 0.2);
    if (blink) (blink.material as THREE.PointsMaterial).opacity = Math.sin(t * 3) > 0 ? 1 : 0.15;
    wt.offset.x = (t * 0.004) % 1;
    for (const c of traffic) {
      const span = 2 * HALF * BLOCK;
      const p = ((c.u + t * c.speed) % span + span) % span - span / 2;
      if (c.axis === 0) { c.mesh.position.set(p, FLOOR + 0.1, c.lane); c.mesh.rotation.y = 0; }
      else { c.mesh.position.set(c.lane, FLOOR + 0.1, p); c.mesh.rotation.y = Math.PI / 2; }
    }
  };
  update(0);
  return { group, update, dispose: () => owned.forEach(o => o.dispose()) };
};
