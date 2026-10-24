import * as THREE from "three";
import type { BuildingTheme, IslandStyle } from "@/lib/client/islands";

export interface BuiltBuilding {
  /** Feet at y = 0, centred on x = z = 0, fitting inside a 0.9 x 0.9 square. */
  group: THREE.Group;
  dispose: () => void;
  /** Optional: call every frame with seconds to blink the rooftop lights. */
  update?: (t: number) => void;
}

const hasDom = typeof document !== "undefined";

// ---- a small reference-counted cache, so thirty buildings share geometry, materials and textures --------------

interface Entry { v: unknown; refs: number; free: () => void }
const cache = new Map<string, Entry>();

function lease<T>(key: string, make: () => { v: T; free: () => void }, releases: (() => void)[]): T {
  let e = cache.get(key);
  if (!e) { const m = make(); e = { v: m.v, refs: 0, free: m.free }; cache.set(key, e); }
  e.refs += 1;
  releases.push(() => {
    const x = cache.get(key);
    if (!x) return;
    x.refs -= 1;
    if (x.refs <= 0) { x.free(); cache.delete(key); }
  });
  return e.v as T;
}

/** For tests: how many shared resources are alive. */
export const buildingCacheSize = () => cache.size;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const q = (n: number) => Math.round(n * 4) / 4;
const mix = (a: string, b: string, k: number) => `#${[1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("")}`;

// ---- facade textures: a colour map and a matching glow map -------------------------------------------------------

const TILE = 0.64; // world size one texture tile covers

const facade = (style: IslandStyle) => {
  const glow = q(style.glow);
  const lit = 0.22 + 0.6 * glow;
  const mk = (glowMap: boolean) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const wall = style.theme === "glass" ? mix(style.primary, "#9fd8ff", 0.25) : style.primary;
    g.fillStyle = glowMap ? "#000" : wall; g.fillRect(0, 0, 128, 128);
    const r = rng(hash(`${style.theme}${style.windows}${style.primary}${style.accent}`));
    const warm = ["#ffd27a", "#ffe9a8", style.accent];
    const cols = 4, rows = 4, cw = 128 / cols, ch = 128 / rows;
    const paint = (x: number, y: number, w: number, h: number, on: boolean, arch: boolean) => {
      g.fillStyle = on ? warm[Math.floor(r() * 3)] : glowMap ? "#000" : "#0b1020";
      g.beginPath();
      if (arch) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); } else g.rect(x, y, w, h);
      g.fill();
    };
    for (let ry = 0; ry < rows; ry++) {
      if (style.windows === "stripes") paint(4, ry * ch + 9, 120, ch - 20, r() < lit + 0.1, false);
      else for (let cx = 0; cx < cols; cx++) paint(cx * cw + 6, ry * ch + 8, cw - 12, ch - 16, r() < lit, style.windows === "arched");
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(false), glow: mk(true) };
};

const wallMaterial = (style: IslandStyle, rel: (() => void)[]): THREE.MeshStandardMaterial => {
  const key = `wall|${style.theme}|${style.windows}|${style.primary}|${style.accent}|${q(style.glow)}`;
  return lease(key, () => {
    const tex = hasDom ? facade(style) : null;
    const glass = style.theme === "glass";
    const m = new THREE.MeshStandardMaterial({
      color: tex ? 0xffffff : style.primary, map: tex?.map ?? null, emissive: 0xffffff, emissiveMap: tex?.glow ?? null,
      emissiveIntensity: tex ? 0.35 + 1.3 * q(style.glow) : 0,
      roughness: glass ? 0.18 : style.theme === "industrial" ? 0.8 : 0.6, metalness: glass ? 0.55 : 0.08,
      transparent: glass, opacity: glass ? 0.88 : 1,
    });
    return { v: m, free: () => { m.dispose(); tex?.map.dispose(); tex?.glow.dispose(); } };
  }, rel);
};

const plainMaterial = (color: string, rel: (() => void)[], emissive = 0, rough = 0.7): THREE.MeshStandardMaterial =>
  lease(`plain|${color}|${emissive}|${rough}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive, roughness: rough, metalness: 0.1 });
    return { v: m, free: () => m.dispose() };
  }, rel);

const trimMaterial = (accent: string, rel: (() => void)[]): THREE.MeshBasicMaterial =>
  lease(`trim|${accent}`, () => { const m = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }); return { v: m, free: () => m.dispose() }; }, rel);

const textTexture = (text: string, accent: string, glow: number, big = false) => {
  const c = document.createElement("canvas");
  c.width = 256; c.height = big ? 256 : 96;
  const g = c.getContext("2d")!;
  g.font = `800 ${big ? 150 : 58}px system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "rgba(6,10,24,.82)"; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.shadowColor = accent; g.shadowBlur = 8 + 20 * glow; g.fillStyle = accent;
  g.fillText(text, 128, c.height / 2 + 3);
  g.shadowBlur = 3; g.fillStyle = "#fff"; g.globalAlpha = 0.85; g.fillText(text, 128, c.height / 2 + 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const SIGNS: Record<BuildingTheme, [string, string, string]> = {
  neon: ["BAR", "DISCO", "SKY"], brownstone: ["INN", "HOTEL", "GRAND"], tropical: ["TIKI", "RESORT", "PARADISE"],
  industrial: ["FORGE", "FACTORY", "WORKS"], glass: ["CAFE", "OFFICE", "TOWER"],
};
export const defaultSign = (theme: BuildingTheme, level: 1 | 2 | 3) => SIGNS[theme][level - 1];

const signMaterial = (text: string, accent: string, glow: number, rel: (() => void)[], big = false): THREE.MeshBasicMaterial =>
  lease(`sign|${text}|${accent}|${q(glow)}|${big}`, () => {
    const t = textTexture(text, accent, glow, big);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
    return { v: m, free: () => { m.dispose(); t.dispose(); } };
  }, rel);

const helipadMaterial = (accent: string, rel: (() => void)[]): THREE.MeshBasicMaterial =>
  lease(`pad|${accent}`, () => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1a1f2e"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = accent; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#fff"; g.font = "900 70px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("H", 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    return { v: m, free: () => { m.dispose(); t.dispose(); } };
  }, rel);

// ---- geometry ------------------------------------------------------------------------------------------------------

/** A box whose side faces are scaled so one facade tile covers TILE world units. */
const boxGeo = (w: number, h: number, d: number, rel: (() => void)[], tiled = true): THREE.BufferGeometry =>
  lease(`box|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${tiled}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tiled) {
      const uv = g.getAttribute("uv") as THREE.BufferAttribute;
      // faces: +x, -x (width d), +y, -y, +z, -z (width w)
      for (let f = 0; f < 6; f++) {
        if (f === 2 || f === 3) continue;
        const along = f < 2 ? d : w;
        for (let v = 0; v < 4; v++) uv.setXY(f * 4 + v, (uv.getX(f * 4 + v) * along) / TILE, (uv.getY(f * 4 + v) * h) / TILE);
      }
    }
    return { v: g, free: () => g.dispose() };
  }, rel);

const cylGeo = (rt: number, rb: number, h: number, seg: number, rel: (() => void)[]): THREE.BufferGeometry =>
  lease(`cyl|${rt}|${rb}|${h}|${seg}`, () => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); return { v: g, free: () => g.dispose() }; }, rel);
const sphGeo = (r: number, half: boolean, rel: (() => void)[]): THREE.BufferGeometry =>
  lease(`sph|${r}|${half}`, () => { const g = half ? new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 10, 8); return { v: g, free: () => g.dispose() }; }, rel);
const planeGeo = (w: number, h: number, rel: (() => void)[]): THREE.BufferGeometry =>
  lease(`plane|${w}|${h}`, () => { const g = new THREE.PlaneGeometry(w, h); return { v: g, free: () => g.dispose() }; }, rel);

interface Tier { w: number; d: number; h: number }
const TIERS: Record<BuildingTheme, Tier[][]> = {
  neon: [[{ w: 0.62, d: 0.62, h: 0.6 }], [{ w: 0.7, d: 0.7, h: 0.7 }, { w: 0.5, d: 0.5, h: 0.6 }], [{ w: 0.74, d: 0.74, h: 0.8 }, { w: 0.58, d: 0.58, h: 0.8 }, { w: 0.4, d: 0.4, h: 0.8 }]],
  brownstone: [[{ w: 0.74, d: 0.6, h: 0.55 }], [{ w: 0.78, d: 0.62, h: 0.95 }], [{ w: 0.8, d: 0.66, h: 1.0 }, { w: 0.68, d: 0.54, h: 0.7 }]],
  tropical: [[{ w: 0.6, d: 0.6, h: 0.5 }], [{ w: 0.72, d: 0.72, h: 0.55 }, { w: 0.52, d: 0.52, h: 0.5 }], [{ w: 0.76, d: 0.76, h: 0.6 }, { w: 0.6, d: 0.6, h: 0.55 }, { w: 0.44, d: 0.44, h: 0.55 }]],
  industrial: [[{ w: 0.7, d: 0.55, h: 0.45 }], [{ w: 0.74, d: 0.6, h: 0.75 }], [{ w: 0.78, d: 0.64, h: 0.85 }, { w: 0.5, d: 0.5, h: 0.65 }]],
  glass: [[{ w: 0.5, d: 0.5, h: 0.8 }], [{ w: 0.5, d: 0.5, h: 1.45 }], [{ w: 0.5, d: 0.5, h: 1.6 }, { w: 0.36, d: 0.36, h: 1.0 }]],
};

/**
 * A building for one owned square in a player's island style. `level` is how developed the square is:
 * 0 an empty owned lot with a marker, 1 a low building, 2 a mid-rise, 3 a tall landmark. Sits on y = 0 and fits a 0.9 square.
 */
export const buildBuilding = (style: IslandStyle, level: 0 | 1 | 2 | 3): BuiltBuilding => {
  const group = new THREE.Group();
  const rel: (() => void)[] = [];
  const blinkers: THREE.MeshBasicMaterial[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const trim = trimMaterial(style.accent, rel);
  const slab = plainMaterial("#0e1322", rel, 0, 0.9);

  // the plot every building stands on, edged in the island's accent colour
  add(boxGeo(0.86, 0.04, 0.86, rel, false), slab, 0, 0.02, 0);
  for (const [sx, sz, w, d] of [[0, 0.42, 0.86, 0.025], [0, -0.42, 0.86, 0.025], [0.42, 0, 0.025, 0.86], [-0.42, 0, 0.025, 0.86]] as const) add(boxGeo(w, 0.03, d, rel, false), trim, sx, 0.045, sz);

  if (level === 0) {
    const pyramid = lease("lot|pyramid", () => { const g = new THREE.ConeGeometry(0.16, 0.3, 4); return { v: g, free: () => g.dispose() }; }, rel);
    const m = add(pyramid, plainMaterial(style.accent, rel, 0.8 * (0.4 + style.glow), 0.4), 0, 0.19, 0);
    m.rotation.y = Math.PI / 4;
    return { group, dispose: () => rel.forEach(r => r()) };
  }

  const lv = level as 1 | 2 | 3;
  const tiers = TIERS[style.theme][lv - 1];
  const wall = wallMaterial(style, rel);
  const stone = plainMaterial(mix(style.primary, "#ffffff", 0.35), rel, 0, 0.8);
  let y = 0.04;
  let top = { w: tiers[0].w, d: tiers[0].d };
  tiers.forEach((t, i) => {
    add(boxGeo(t.w, t.h, t.d, rel), wall, 0, y + t.h / 2, 0);
    y += t.h;
    // a glowing band at the top of every tier; brownstone gets a stone cornice instead
    if (style.theme === "brownstone" || style.theme === "industrial") add(boxGeo(t.w + 0.05, 0.05, t.d + 0.05, rel, false), stone, 0, y + 0.01, 0);
    else add(boxGeo(t.w + 0.03, 0.03, t.d + 0.03, rel, false), trim, 0, y + 0.005, 0);
    if (style.theme === "neon" && i < tiers.length - 1) for (const sx of [-1, 1]) add(boxGeo(0.025, tiers[i].h, 0.025, rel, false), trim, sx * (t.w / 2 + 0.005), y - t.h / 2, t.d / 2 + 0.005);
    top = { w: t.w, d: t.d };
  });
  const roofY = y + 0.03;
  const first = tiers[0];

  // theme details
  if (style.theme === "brownstone") {
    add(boxGeo(0.26, 0.1, 0.12, rel, false), stone, 0, 0.09, first.d / 2 + 0.06); // stoop
    add(boxGeo(0.1, 0.18, 0.1, rel, false), plainMaterial("#3b2a22", rel), 0.22, roofY + 0.09, -0.1); // chimney
  } else if (style.theme === "industrial") {
    const metal = plainMaterial("#6b7280", rel, 0, 0.45);
    add(cylGeo(0.07, 0.08, 0.5 + lv * 0.12, 12, rel), plainMaterial("#7f8791", rel, 0, 0.5), -0.2, roofY + 0.25 + lv * 0.06, -0.12);
    add(cylGeo(0.075, 0.075, 0.04, 12, rel), trim, -0.2, roofY + 0.5 + lv * 0.12, -0.12);
    const pipe = add(cylGeo(0.03, 0.03, first.w * 0.9, 8, rel), metal, 0, 0.18, first.d / 2 + 0.03);
    pipe.rotation.z = Math.PI / 2;
  } else if (style.theme === "tropical") {
    const leaf = plainMaterial("#22c55e", rel, 0, 0.8);
    const trunk = plainMaterial("#92613a", rel, 0, 0.9);
    const palm = (x: number, z: number, yy: number, h: number) => {
      add(cylGeo(0.015, 0.025, h, 6, rel), trunk, x, yy + h / 2, z);
      for (let k = 0; k < 5; k++) {
        const l = add(boxGeo(0.16, 0.012, 0.05, rel, false), leaf, x + Math.cos((k * Math.PI * 2) / 5) * 0.06, yy + h, z + Math.sin((k * Math.PI * 2) / 5) * 0.08);
        l.rotation.y = -(k * Math.PI * 2) / 5;
        l.rotation.z = -0.35;
      }
    };
    palm(first.w / 2 - 0.12, first.d / 2 - 0.12, 0.04, 0.3);
    if (tiers.length > 1) palm(-top.w / 2 + 0.08, top.d / 2 - 0.08, roofY, 0.26);
  } else if (style.theme === "glass") {
    const cap = lease("glass|cap", () => { const g = new THREE.ConeGeometry(0.26, 0.2, 4); return { v: g, free: () => g.dispose() }; }, rel);
    if (style.roof === "flat") { const m = add(cap, trim, 0, roofY + 0.1, 0); m.rotation.y = Math.PI / 4; m.scale.set(top.w / 0.5, 1, top.d / 0.5); }
  } else if (style.roof === "flat") {
    for (const [x, z] of [[-0.15, -0.12], [0.14, 0.1]] as const) add(boxGeo(0.14, 0.09, 0.14, rel, false), plainMaterial("#475569", rel, 0, 0.6), x * (top.w / 0.6), roofY + 0.045, z * (top.d / 0.6)); // rooftop units
  }

  // the roof the player picked
  const mastBase = roofY;
  if (style.roof === "antenna") {
    const h = 0.35 + lv * 0.14;
    add(cylGeo(0.012, 0.014, h, 6, rel), plainMaterial("#cbd5e1", rel, 0, 0.4), 0, mastBase + h / 2, 0);
    add(boxGeo(0.2, 0.012, 0.012, rel, false), plainMaterial("#cbd5e1", rel, 0, 0.4), 0, mastBase + h * 0.72, 0);
    const light = lease("blink|red", () => { const m = new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false }); m.userData.base = "#ff3b3b"; return { v: m, free: () => m.dispose() }; }, rel);
    blinkers.push(light);
    add(sphGeo(0.03, false, rel), light, 0, mastBase + h + 0.02, 0);
  } else if (style.roof === "dome") {
    const r = Math.min(top.w, top.d) * 0.4;
    const mat = lease(`dome|${style.accent}`, () => { const m = new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.45, transparent: true, opacity: 0.62, roughness: 0.2, metalness: 0.4 }); return { v: m, free: () => m.dispose() }; }, rel);
    add(sphGeo(r, true, rel), mat, 0, mastBase, 0);
    add(cylGeo(0.012, 0.012, 0.16, 6, rel), trim, 0, mastBase + r + 0.07, 0);
  } else if (style.roof === "helipad" && hasDom) {
    const w = Math.min(top.w, top.d) * 0.92;
    add(cylGeo(w / 2, w / 2, 0.035, 20, rel), plainMaterial("#1a1f2e", rel, 0, 0.8), 0, mastBase + 0.018, 0);
    const pad = add(planeGeo(w * 0.86, w * 0.86, rel), helipadMaterial(style.accent, rel), 0, mastBase + 0.04, 0);
    pad.rotation.x = -Math.PI / 2;
    const light = lease("blink|pad", () => { const m = new THREE.MeshBasicMaterial({ color: "#7dd3fc", toneMapped: false }); m.userData.base = "#7dd3fc"; return { v: m, free: () => m.dispose() }; }, rel);
    blinkers.push(light);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) add(sphGeo(0.022, false, rel), light, (sx * w) / 2.15, mastBase + 0.05, (sz * w) / 2.15);
  }

  // the sign: custom text, or a name that suits the theme and level
  if (hasDom) {
    const text = style.sign || defaultSign(style.theme, lv);
    const sw = Math.min(0.62, first.w * 0.86);
    const sign = add(planeGeo(sw, sw * 0.375, rel), signMaterial(text, style.accent, style.glow, rel), 0, Math.min(0.04 + first.h * 0.72, 0.04 + first.h - 0.1), first.d / 2 + 0.012);
    sign.renderOrder = 2;
    if (lv >= 2 && (style.theme === "neon" || style.theme === "glass")) {
      const blade = add(planeGeo(0.14, 0.14, rel), signMaterial(text.slice(0, 1), style.accent, style.glow, rel, true), first.w / 2 + 0.012, 0.04 + first.h * 0.6, first.d / 2 - 0.1);
      blade.rotation.y = Math.PI / 2;
    }
  }

  const update = (t: number) => { const on = Math.sin(t * 4 + (hash(style.accent) % 7)) > -0.2 ? 1 : 0.15; for (const m of blinkers) m.color.set(m.userData.base as string).multiplyScalar(on); };
  return { group, update: blinkers.length ? update : undefined, dispose: () => { rel.forEach(r => r()); group.clear(); } };
};
