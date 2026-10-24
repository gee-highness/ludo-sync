import * as THREE from "three";

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

/**
 * The neon night city around and under the board: a deep street grid glowing under the slab, a dense skyline of lit towers,
 * vertical neon signs and billboards, and traffic lights moving along the streets. `high` = more and animated; low = fewer, still.
 */
export const buildCityscape = (high: boolean): CityHandle => {
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => { owned.push(x); return x; };
  const r = rng(11);
  const FLOOR = -3.4;

  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(240, 240)), track(new THREE.MeshStandardMaterial({ color: "#070a18", roughness: 0.9 })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = FLOOR;
  group.add(ground);

  // glowing street grid on the ground (two colours), beneath the board
  const lineMat = [track(new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.7 })), track(new THREE.MeshBasicMaterial({ color: "#f472b6", transparent: true, opacity: 0.55 }))];
  const strip = track(new THREE.BoxGeometry(1, 0.02, 0.12));
  for (let i = -9; i <= 9; i++) {
    const a = new THREE.Mesh(strip, lineMat[i % 2 ? 0 : 1]); a.scale.x = 90; a.position.set(0, FLOOR + 0.02, i * 4.2);
    const b = new THREE.Mesh(strip, lineMat[i % 2 ? 1 : 0]); b.scale.x = 90; b.rotation.y = Math.PI / 2; b.position.set(i * 4.2, FLOOR + 0.02, 0);
    group.add(a, b);
  }

  // towers: a lattice of blocks outside the board, taller and denser further out and towards the far side
  const variants = Array.from({ length: 5 }, (_, i) => { const f = facade(7 + i * 13, 0.42 + (i % 3) * 0.12); track(f.map); track(f.glow); return f; });
  const mats = variants.map(v => track(new THREE.MeshStandardMaterial({ map: v.map, emissive: 0xffffff, emissiveMap: v.glow, emissiveIntensity: 1.15, roughness: 0.8 })));
  const roofMat = track(new THREE.MeshStandardMaterial({ color: "#0d1022", roughness: 0.8 }));
  const trimMats = NEON.map(c => track(new THREE.MeshBasicMaterial({ color: c })));
  const step = high ? 3.1 : 4.4;
  const signs: { m: THREE.MeshBasicMaterial; phase: number }[] = [];
  let towers = 0;
  for (let gx = -14; gx <= 14; gx++) for (let gz = -14; gz <= 14; gz++) {
    const x = gx * step + (r() - 0.5) * 0.6, z = gz * step + (r() - 0.5) * 0.6;
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge < 9.6) continue; // the board's footprint and its own lots stay clear
    if (!high && r() < 0.35) continue;
    const w = 1.6 + r() * 1.6, d = 1.6 + r() * 1.6;
    const h = (3 + r() * 9 + Math.min(edge - 9, 22) * (0.5 + r() * 0.5)) * (z < 0 ? 1.3 : 0.8);
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let face = 0; face < 6; face++) for (let v = 0; v < 4; v++) {
      if (face === 2 || face === 3) continue;
      uv.setXY(face * 4 + v, uv.getX(face * 4 + v) * ((face < 2 ? d : w) / 2.2), uv.getY(face * 4 + v) * (h / 2.6));
    }
    track(geo);
    const wall = mats[Math.floor(r() * mats.length)];
    const b = new THREE.Mesh(geo, [wall, wall, roofMat, roofMat, wall, wall]);
    b.position.set(x, FLOOR + h / 2, z);
    group.add(b);
    towers++;
    // neon roof trim on some towers
    if (r() < 0.45) {
      const t = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1)), trimMats[Math.floor(r() * trimMats.length)]);
      t.position.set(x, FLOOR + h + 0.06, z);
      group.add(t);
    }
    // vertical sign or billboard facing the board
    if (high && r() < 0.3 && signs.length < 40) {
      const colour = NEON[Math.floor(r() * NEON.length)];
      const vertical = r() < 0.6;
      const map = track(vertical ? vSign(WORDS[Math.floor(r() * WORDS.length)], colour) : hSign(WORDS[Math.floor(r() * WORDS.length)], colour));
      const m = track(new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      const plane = new THREE.Mesh(track(new THREE.PlaneGeometry(vertical ? 0.9 : 2.2, vertical ? 3.4 : 0.9)), m);
      const toCentre = new THREE.Vector2(-x, -z).normalize();
      plane.position.set(x + toCentre.x * (Math.abs(toCentre.x) * w / 2 + 0.06), FLOOR + Math.min(h - 1.8, 3 + r() * 8), z + toCentre.y * (Math.abs(toCentre.y) * d / 2 + 0.06));
      plane.lookAt(plane.position.x + toCentre.x, plane.position.y, plane.position.z + toCentre.y);
      group.add(plane);
      signs.push({ m, phase: r() * 9 });
    }
  }

  // traffic: bright dots sliding along the street grid
  const trafficGeo = track(new THREE.BoxGeometry(0.5, 0.1, 0.16));
  const traffic: { mesh: THREE.Mesh; axis: 0 | 1; lane: number; speed: number; u: number }[] = [];
  const count = high ? 46 : 0;
  for (let i = 0; i < count; i++) {
    const colour = i % 3 === 0 ? "#ff4d6d" : "#fff2c2";
    const mesh = new THREE.Mesh(trafficGeo, track(new THREE.MeshBasicMaterial({ color: colour })));
    const lane = (Math.floor(r() * 17) - 8) * 4.2 + (r() < 0.5 ? 0.35 : -0.35);
    const axis = (i % 2) as 0 | 1;
    traffic.push({ mesh, axis, lane, speed: (6 + r() * 8) * (r() < 0.5 ? 1 : -1), u: r() * 80 });
    group.add(mesh);
  }

  const halo = track(glow("rgba(120,200,255,0.9)"));
  const haloMat = track(new THREE.SpriteMaterial({ map: halo, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const sprite = new THREE.Sprite(haloMat); sprite.scale.set(70, 40, 1); sprite.position.set(0, 4, -60);
  group.add(sprite);
  void towers;

  const update = (t: number) => {
    for (const s of signs) s.m.opacity = 0.6 + 0.4 * (Math.sin(t * 2.4 + s.phase) > -0.9 ? 1 : 0.2);
    for (const c of traffic) {
      const p = ((c.u + t * c.speed) % 90 + 90) % 90 - 45;
      if (c.axis === 0) { c.mesh.position.set(p, FLOOR + 0.1, c.lane); c.mesh.rotation.y = 0; }
      else { c.mesh.position.set(c.lane, FLOOR + 0.1, p); c.mesh.rotation.y = Math.PI / 2; }
    }
  };
  update(0);
  return { group, update, dispose: () => owned.forEach(o => o.dispose()) };
};
