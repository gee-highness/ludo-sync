import * as THREE from "three";
import { GROUND_COLOURS, resolveLevel, type BuildingTheme, type IslandStyle } from "@/lib/client/islands";

export interface BuiltBuilding {
  /** Feet at y = 0, centred on x = z = 0, fitting inside a 0.9 x 0.9 square. */
  group: THREE.Group;
  dispose: () => void;
  /** Optional: call every frame with seconds to blink the rooftop lights. */
  update?: (t: number) => void;
}

const TAU = Math.PI * 2;
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
    const r = rng(hash(`${style.theme}${style.windows}${style.primary}${style.accent}${style.lights}`));
    const warm = style.lights ? [style.lights, mix(style.lights, "#ffffff", 0.45), style.lights] : ["#ffd27a", "#ffe9a8", style.accent];
    const cols = 4, rows = 4, cw = 128 / cols, ch = 128 / rows;
    const paint = (x: number, y: number, w: number, h: number, on: boolean, arch: boolean, circle = false) => {
      g.fillStyle = on ? warm[Math.floor(r() * 3)] : glowMap ? "#000" : "#0b1020";
      g.beginPath();
      if (circle) g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      else if (arch) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); } else g.rect(x, y, w, h);
      g.fill();
    };
    for (let ry = 0; ry < rows; ry++) {
      if (style.windows === "stripes") paint(4, ry * ch + 9, 120, ch - 20, r() < lit + 0.1, false);
      else if (style.windows === "slit") for (let cx = 0; cx < cols * 2; cx++) paint(cx * (cw / 2) + 9, ry * ch + 6, cw / 2 - 18, ch - 12, r() < lit + 0.1, false);
      else for (let cx = 0; cx < cols; cx++) paint(cx * cw + 6, ry * ch + 8, cw - 12, ch - 16, r() < lit, style.windows === "arched", style.windows === "round");
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(false), glow: mk(true) };
};

const wallMaterial = (style: IslandStyle, rel: (() => void)[]): THREE.MeshStandardMaterial => {
  const key = `wall|${style.theme}|${style.windows}|${style.primary}|${style.accent}|${q(style.glow)}|${style.lights}|${style.finish}`;
  return lease(key, () => {
    const tex = hasDom ? facade(style) : null;
    const glass = style.theme === "glass";
    const m = new THREE.MeshStandardMaterial({
      color: tex ? 0xffffff : style.primary, map: tex?.map ?? null, emissive: 0xffffff, emissiveMap: tex?.glow ?? null,
      emissiveIntensity: tex ? 0.35 + 1.3 * q(style.glow) : 0,
      roughness: style.finish === "glossy" ? 0.12 : style.finish === "metallic" ? 0.3 : style.finish === "matte" ? 0.9 : glass ? 0.18 : style.theme === "industrial" ? 0.8 : 0.6,
      metalness: style.finish === "metallic" ? 0.85 : style.finish === "glossy" ? 0.25 : style.finish === "matte" ? 0 : glass ? 0.55 : 0.08,
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
  let px = big ? 150 : 58;
  g.font = `800 ${px}px system-ui, sans-serif`;
  // long names shrink to fit inside the sign's frame
  const room = c.width - 34;
  const wide = g.measureText(text).width;
  if (wide > room) { px = Math.floor((px * room) / wide); g.font = `800 ${px}px system-ui, sans-serif`; }
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
  castle: ["GATE", "KEEP", "CASTLE"], pagoda: ["TEA", "TEMPLE", "PAGODA"], cottage: ["HOME", "COTTAGE", "MANOR"],
  hotel: ["B&B", "HOTEL", "PALACE"], shop: ["SHOP", "STORE", "MALL"],
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
/** A drum whose side faces are scaled so the facade tiles round it as they do a box. */
const drumGeo = (r: number, h: number, rel: (() => void)[]): THREE.BufferGeometry =>
  lease(`drum|${r.toFixed(3)}|${h.toFixed(3)}`, () => {
    const g = new THREE.CylinderGeometry(r, r, h, 28, 1, false);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const around = Math.max(3, Math.round((2 * Math.PI * r) / TILE));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, (uv.getY(i) * h) / TILE);
    return { v: g, free: () => g.dispose() };
  }, rel);
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
  castle: [[{ w: 0.7, d: 0.7, h: 0.55 }], [{ w: 0.74, d: 0.74, h: 0.7 }, { w: 0.5, d: 0.5, h: 0.4 }], [{ w: 0.78, d: 0.78, h: 0.75 }, { w: 0.56, d: 0.56, h: 0.5 }, { w: 0.34, d: 0.34, h: 0.45 }]],
  pagoda: [[{ w: 0.6, d: 0.6, h: 0.4 }], [{ w: 0.66, d: 0.66, h: 0.4 }, { w: 0.5, d: 0.5, h: 0.35 }], [{ w: 0.7, d: 0.7, h: 0.38 }, { w: 0.56, d: 0.56, h: 0.34 }, { w: 0.42, d: 0.42, h: 0.32 }]],
  cottage: [[{ w: 0.66, d: 0.56, h: 0.38 }], [{ w: 0.7, d: 0.6, h: 0.5 }], [{ w: 0.74, d: 0.62, h: 0.5 }, { w: 0.5, d: 0.5, h: 0.35 }]],
  hotel: [[{ w: 0.76, d: 0.6, h: 0.5 }], [{ w: 0.78, d: 0.62, h: 0.9 }], [{ w: 0.8, d: 0.64, h: 1.1 }, { w: 0.62, d: 0.5, h: 0.5 }]],
  shop: [[{ w: 0.78, d: 0.6, h: 0.4 }], [{ w: 0.8, d: 0.62, h: 0.7 }], [{ w: 0.82, d: 0.64, h: 0.7 }, { w: 0.6, d: 0.5, h: 0.45 }]],
};

/**
 * A building for one owned square in a player's island style. `level` is how developed the square is:
 * 0 an empty owned lot with a marker, 1 a low building, 2 a mid-rise, 3 a tall landmark. Sits on y = 0 and fits a 0.9 square.
 */
export const buildBuilding = (island: IslandStyle, level: 0 | 1 | 2 | 3): BuiltBuilding => {
  const style = resolveLevel(island, level);
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
  const slab = plainMaterial(GROUND_COLOURS[style.ground], rel, 0, style.ground === "marble" ? 0.25 : style.ground === "water" ? 0.1 : 0.9);

  // the plot every building stands on, edged in the island's accent colour
  add(boxGeo(0.86, 0.04, 0.86, rel, false), slab, 0, 0.02, 0);
  for (const [sx, sz, w, d] of [[0, 0.42, 0.86, 0.025], [0, -0.42, 0.86, 0.025], [0.42, 0, 0.025, 0.86], [-0.42, 0, 0.025, 0.86]] as const) add(boxGeo(w, 0.03, d, rel, false), trim, sx, 0.045, sz);

  // the small things standing around the plot
  const extras = new Set(style.extras);
  if (extras.has("fence")) {
    const post = plainMaterial("#caa87a", rel, 0, 0.8);
    for (const [x, z, w, d] of [[0, 0.4, 0.8, 0.014], [0, -0.4, 0.8, 0.014], [0.4, 0, 0.014, 0.8], [-0.4, 0, 0.014, 0.8]] as const) {
      add(boxGeo(w, 0.02, d, rel, false), post, x, 0.14, z);
      add(boxGeo(w, 0.02, d, rel, false), post, x, 0.09, z);
    }
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4], [0, 0.4], [0, -0.4], [0.4, 0], [-0.4, 0]] as const) add(boxGeo(0.025, 0.14, 0.025, rel, false), post, x, 0.11, z);
  }
  if (extras.has("lamps")) {
    const pole = plainMaterial("#2a2f3a", rel, 0, 0.5);
    const bulb = plainMaterial("#fff2b0", rel, 1.4, 0.4);
    for (const x of [-0.38, 0.38]) {
      add(cylGeo(0.01, 0.012, 0.3, 6, rel), pole, x, 0.19, 0.38);
      add(sphGeo(0.03, false, rel), bulb, x, 0.35, 0.38);
    }
  }
  if (extras.has("trees")) {
    const leaf = plainMaterial(style.ground === "sand" ? "#3f9d52" : "#2f8f46", rel, 0, 0.8), bark = plainMaterial("#6b4a2c", rel, 0, 0.9);
    const cone = lease("tree|cone", () => { const g = new THREE.ConeGeometry(0.09, 0.26, 8); return { v: g, free: () => g.dispose() }; }, rel);
    for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36]] as const) {
      add(cylGeo(0.012, 0.015, 0.1, 6, rel), bark, x, 0.09, z);
      add(cone, leaf, x, 0.27, z);
    }
  }
  if (extras.has("garden")) {
    const hedge = plainMaterial("#2f8f46", rel, 0, 0.9);
    for (const [x, z, w, d] of [[0, 0.37, 0.7, 0.07], [0, -0.37, 0.7, 0.07], [0.37, 0, 0.07, 0.62], [-0.37, 0, 0.07, 0.62]] as const) add(boxGeo(w, 0.1, d, rel, false), hedge, x, 0.09, z);
  }
  if (extras.has("flags")) {
    const pole = plainMaterial("#d5dbe5", rel, 0, 0.4);
    const flag = plainMaterial(style.accent, rel, 0.5, 0.6);
    add(cylGeo(0.008, 0.008, 0.5, 6, rel), pole, -0.38, 0.29, 0.38);
    add(boxGeo(0.16, 0.1, 0.01, rel, false), flag, -0.3, 0.48, 0.38);
  }

  if (level === 0) {
    const pyramid = lease("lot|pyramid", () => { const g = new THREE.ConeGeometry(0.16, 0.3, 4); return { v: g, free: () => g.dispose() }; }, rel);
    const m = add(pyramid, plainMaterial(style.accent, rel, 0.8 * (0.4 + style.glow), 0.4), 0, 0.19, 0);
    m.rotation.y = Math.PI / 4;
    return { group, dispose: () => rel.forEach(r => r()) };
  }

  const lv = level as 1 | 2 | 3;
  const round = style.shape === "round";
  const tiers = TIERS[style.theme][lv - 1].map(t => ({ w: t.w * style.footprint, d: (round ? t.w : t.d) * style.footprint, h: t.h * style.height }));
  const wall = wallMaterial(style, rel);
  const stone = plainMaterial(mix(style.primary, "#ffffff", 0.35), rel, 0, 0.8);
  let y = 0.04;
  let top = { w: tiers[0].w, d: tiers[0].d };
  tiers.forEach((t, i) => {
    add(round ? drumGeo(t.w / 2, t.h, rel) : boxGeo(t.w, t.h, t.d, rel), wall, 0, y + t.h / 2, 0);
    y += t.h;
    // a glowing band at the top of every tier; brownstone gets a stone cornice instead
    if (style.theme === "brownstone" || style.theme === "industrial") add(round ? cylGeo(t.w / 2 + 0.025, t.w / 2 + 0.025, 0.05, 28, rel) : boxGeo(t.w + 0.05, 0.05, t.d + 0.05, rel, false), stone, 0, y + 0.01, 0);
    else add(round ? cylGeo(t.w / 2 + 0.015, t.w / 2 + 0.015, 0.03, 28, rel) : boxGeo(t.w + 0.03, 0.03, t.d + 0.03, rel, false), trim, 0, y + 0.005, 0);
    if (style.theme === "neon" && !round && i < tiers.length - 1) for (const sx of [-1, 1]) add(boxGeo(0.025, tiers[i].h, 0.025, rel, false), trim, sx * (t.w / 2 + 0.005), y - t.h / 2, t.d / 2 + 0.005);
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
  } else if (style.roof === "flat" && !["castle", "pagoda", "cottage", "hotel", "shop"].includes(style.theme)) {
    for (const [x, z] of [[-0.15, -0.12], [0.14, 0.1]] as const) add(boxGeo(0.14, 0.09, 0.14, rel, false), plainMaterial("#475569", rel, 0, 0.6), x * (top.w / 0.6), roofY + 0.045, z * (top.d / 0.6)); // rooftop units
  }

  // the new styles' own character: battlements, tiered eaves, a pitched roof, balconies, an awning
  const stripeA = trim, stripeB = plainMaterial("#f8fafc", rel, 0, 0.7), darkRoof = plainMaterial(mix(style.accent, "#000000", 0.45), rel, 0, 0.75);
  const tierTops: number[] = [];
  { let yy = 0.04; for (const t of tiers) { yy += t.h; tierTops.push(yy); } }
  const awning = (w: number, d: number, yy: number) => {
    const n = 6;
    for (let k = 0; k < n; k++) {
      const m = add(boxGeo(w / n, 0.02, 0.15, rel, false), k % 2 ? stripeB : stripeA, -w / 2 + (w / n) * (k + 0.5), yy, d / 2 + 0.07);
      m.rotation.x = 0.4;
    }
  };
  const balconies = (t: { w: number; d: number; h: number }, yTop: number) => {
    const yy = yTop - t.h * 0.62;
    add(boxGeo(t.w * 0.6, 0.025, 0.1, rel, false), stone, 0, yy, t.d / 2 + 0.05);
    add(boxGeo(t.w * 0.6, 0.05, 0.012, rel, false), trim, 0, yy + 0.04, t.d / 2 + 0.095);
  };
  const perimeter = (t: { w: number; d: number }, step: number): [number, number][] => {
    const out: [number, number][] = [];
    if (round) { const n = Math.max(8, Math.round((Math.PI * t.w) / step)); for (let k = 0; k < n; k++) out.push([Math.cos((k / n) * TAU) * (t.w / 2 - 0.02), Math.sin((k / n) * TAU) * (t.w / 2 - 0.02)]); }
    else { const nx = Math.max(2, Math.round(t.w / step)), nz = Math.max(2, Math.round(t.d / step)); for (let k = 0; k <= nx; k++) for (const sz of [-1, 1]) out.push([-t.w / 2 + 0.03 + ((t.w - 0.06) * k) / nx, sz * (t.d / 2 - 0.03)]); for (let k = 1; k < nz; k++) for (const sx of [-1, 1]) out.push([sx * (t.w / 2 - 0.03), -t.d / 2 + 0.03 + ((t.d - 0.06) * k) / nz]); }
    return out;
  };
  if (style.theme === "castle") {
    tiers.forEach((t, i) => { for (const [x, z] of perimeter(t, 0.16)) add(boxGeo(0.07, 0.07, 0.07, rel, false), stone, x, tierTops[i] + 0.035, z); });
    if (lv >= 2) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = sx * (first.w / 2 - 0.02), z = sz * (first.d / 2 - 0.02);
      add(cylGeo(0.07, 0.075, tierTops[0] + 0.12, 12, rel), stone, x, (tierTops[0] + 0.12) / 2, z);
      const cap = add(lease("cone|turret", () => { const g = new THREE.ConeGeometry(0.095, 0.16, 12); return { v: g, free: () => g.dispose() }; }, rel), darkRoof, x, tierTops[0] + 0.12 + 0.08, z);
      cap.rotation.y = 0;
    }
    add(boxGeo(0.14, 0.2, 0.03, rel, false), plainMaterial("#2b1d14", rel, 0, 0.8), 0, 0.14, first.d / 2 + 0.014); // gate
  } else if (style.theme === "pagoda") {
    tiers.forEach((t, i) => {
      const slab = round ? cylGeo(t.w / 2 + 0.09, t.w / 2 + 0.09, 0.035, 28, rel) : boxGeo(t.w + 0.18, 0.035, t.d + 0.18, rel, false);
      add(slab, darkRoof, 0, tierTops[i] + 0.012, 0);
      if (!round) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(sphGeo(0.025, false, rel), trim, sx * (t.w / 2 + 0.085), tierTops[i] + 0.04, sz * (t.d / 2 + 0.085));
    });
    add(cylGeo(0.01, 0.014, 0.22, 6, rel), trim, 0, tierTops[tierTops.length - 1] + 0.13, 0);
  } else if (style.theme === "cottage") {
    const r = Math.max(first.w, first.d) * 0.68, h = 0.22 + lv * 0.06;
    const top = tiers[tiers.length - 1];
    const roof = add(lease(`cone|cot|${(Math.max(top.w, top.d) * 0.68).toFixed(2)}|${h}`, () => { const g = new THREE.ConeGeometry(Math.max(top.w, top.d) * 0.68, h, 4); return { v: g, free: () => g.dispose() }; }, rel), darkRoof, 0, tierTops[tierTops.length - 1] + h / 2, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(top.w / Math.max(top.w, top.d), 1, top.d / Math.max(top.w, top.d));
    void r;
    add(boxGeo(0.1, 0.2, 0.1, rel, false), stone, top.w * 0.22, tierTops[tierTops.length - 1] + h * 0.55, -top.d * 0.15);
    add(boxGeo(0.11, 0.2, 0.03, rel, false), plainMaterial("#5b3a24", rel, 0, 0.8), 0, 0.14, first.d / 2 + 0.014); // door
  } else if (style.theme === "hotel") {
    tiers.forEach((t, i) => balconies(t, tierTops[i]));
    add(boxGeo(0.26, 0.04, 0.12, rel, false), trim, 0, 0.2, first.d / 2 + 0.06); // porte-cochère
  } else if (style.theme === "shop") {
    awning(first.w * 0.94, first.d, first.h * 0.62 + 0.04);
  }
  if (extras.has("awning") && style.theme !== "shop") awning(first.w * 0.94, first.d, first.h * 0.62 + 0.04);
  if (extras.has("balconies") && style.theme !== "hotel") tiers.forEach((t, i) => { if (t.h > 0.3) balconies(t, tierTops[i]); });
  const upTop = tiers[tiers.length - 1];
  if (extras.has("solar")) for (const sx of [-1, 1]) {
    const m = add(boxGeo(upTop.w * 0.36, 0.015, upTop.d * 0.5, rel, false), plainMaterial("#1e3a8a", rel, 0.15, 0.2), sx * upTop.w * 0.22, tierTops[tierTops.length - 1] + 0.06, 0);
    m.rotation.z = sx * -0.35;
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
  } else if (style.roof === "pitched") {
    const r = Math.max(top.w, top.d) * 0.7, h = 0.2 + lv * 0.06;
    const m = add(lease(`cone|pitch|${r.toFixed(2)}|${h}`, () => { const g = new THREE.ConeGeometry(r, h, 4); return { v: g, free: () => g.dispose() }; }, rel), darkRoof, 0, mastBase + h / 2, 0);
    m.rotation.y = Math.PI / 4;
    m.scale.set(top.w / Math.max(top.w, top.d), 1, top.d / Math.max(top.w, top.d));
  } else if (style.roof === "spire") {
    const h = 0.45 + lv * 0.12;
    add(lease(`cone|spire|${h}`, () => { const g = new THREE.ConeGeometry(0.1, h, 10); return { v: g, free: () => g.dispose() }; }, rel), trim, 0, mastBase + h / 2, 0);
    add(sphGeo(0.025, false, rel), trim, 0, mastBase + h + 0.02, 0);
  } else if (style.roof === "garden") {
    add(boxGeo(top.w * 0.92, 0.05, top.d * 0.92, rel, false), plainMaterial("#3f9d52", rel, 0, 0.9), 0, mastBase + 0.025, 0);
    const bush = plainMaterial("#2f8f46", rel, 0, 0.9);
    for (const [x, z] of [[-0.18, -0.1], [0.12, 0.12], [0.16, -0.14]] as const) add(sphGeo(0.06, false, rel), bush, x * (top.w / 0.6), mastBase + 0.075, z * (top.d / 0.6));
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
