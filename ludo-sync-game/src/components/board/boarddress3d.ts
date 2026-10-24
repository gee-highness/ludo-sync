import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RING, SEATS, SEAT_INFO, cellInfo, type Seat } from "@/lib/ludo/board";
import type { IslandMap, IslandStyle } from "@/lib/client/islands";
import { DEFAULT_ISLAND } from "@/lib/client/islands";
import { GROUP_COLORS, SQUARES, type Square } from "@/lib/ludo/tycoon";
import type { TycoonState } from "@/lib/ludo/types";
import { buildBuilding, type BuiltBuilding } from "./buildings3d";

const TOP = 0.062;
/** Centre of each seat's yard on the ground, as (x, z). */
const YARD_C: Record<Seat, [number, number]> = { 0: [-4.5, 4.5], 1: [-4.5, -4.5], 2: [4.5, -4.5], 3: [4.5, 4.5] };

const tex = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

interface Lot { ring: number; cx: number; cz: number; dx: number; dz: number; seat: Seat; shared: boolean; ox: number; oz: number }

/** For each ring square, the neighbouring yard cell ("lot") on the board's inner side, which holds its building. */
const computeLots = (): Lot[] => {
  const lots: Lot[] = [];
  const count = new Map<string, number>();
  const raw = RING.map(([row, col], ring) => {
    let dir: [number, number] | null = null;
    for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const n = cellInfo(row + dr, col + dc);
      if (n.kind === "yard" && n.seat !== undefined) { dir = [dc, dr]; break; }
    }
    return { ring, row, col, dir };
  });
  for (const r of raw) if (r.dir) { const k = `${r.row + r.dir[1]},${r.col + r.dir[0]}`; count.set(k, (count.get(k) ?? 0) + 1); }
  for (const r of raw) {
    if (!r.dir) continue;
    const lr = r.row + r.dir[1], lc = r.col + r.dir[0];
    const info = cellInfo(lr, lc);
    const shared = (count.get(`${lr},${lc}`) ?? 0) > 1;
    // a shared corner lot holds two small buildings, each nudged towards its own square
    lots.push({ ring: r.ring, cx: lc - 7, cz: lr - 7, dx: r.dir[0], dz: r.dir[1], seat: info.seat as Seat, shared, ox: shared ? -r.dir[0] * 0.24 : 0, oz: shared ? -r.dir[1] * 0.24 : 0 });
  }
  return lots;
};
const LOTS = computeLots();

const wrap = (g: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
};

const chevrons = (g: CanvasRenderingContext2D, cx: number, cy: number, s: number, colour: string, alpha = 1) => {
  g.save(); g.globalAlpha = alpha; g.strokeStyle = colour; g.lineWidth = s * 0.22; g.lineJoin = "round"; g.lineCap = "round";
  for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(cx - s, cy + i * s * 0.62 + s * 0.3); g.lineTo(cx, cy + i * s * 0.62 - s * 0.3); g.lineTo(cx + s, cy + i * s * 0.62 + s * 0.3); g.stroke(); }
  g.restore();
};

const navyTile = (g: CanvasRenderingContext2D, N: number) => {
  g.fillStyle = "#0e1a3c"; g.fillRect(0, 0, N, N);
  // fine dotted texture
  g.fillStyle = "rgba(120,180,255,0.17)";
  for (let y = 6; y < N; y += 10) for (let x = ((y / 10) % 2) * 5 + 6; x < N; x += 10) g.fillRect(x, y, 2, 2);
  const grad = g.createLinearGradient(0, 0, 0, N); grad.addColorStop(0, "rgba(255,255,255,0.07)"); grad.addColorStop(1, "rgba(0,0,0,0.28)");
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  // lighter bevelled rim: bright top/left edge, darker bottom/right, like the slab tiles in the video
  g.lineWidth = 7; g.strokeStyle = "rgba(170,205,255,0.5)";
  g.beginPath(); g.moveTo(3, N - 3); g.lineTo(3, 3); g.lineTo(N - 3, 3); g.stroke();
  g.strokeStyle = "rgba(10,20,50,0.85)";
  g.beginPath(); g.moveTo(N - 3, 3); g.lineTo(N - 3, N - 3); g.lineTo(3, N - 3); g.stroke();
  g.lineWidth = 2; g.strokeStyle = "rgba(120,170,255,0.35)"; g.strokeRect(10, 10, N - 20, N - 20);
};

/** The printed face of a Tycoon square: name, price and a glyph for the special kinds. Drawn upright; the scene keeps it facing the viewer. */
const squareFace = (sq: Square): HTMLCanvasElement => {
  const N = 192, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  navyTile(g, N);
  g.textAlign = "center";
  g.fillStyle = "#e8f1ff"; g.font = "700 25px system-ui, sans-serif"; g.textBaseline = "middle";
  const glyphY = 62;
  if (sq.kind === "chance" || sq.kind === "chest") chevrons(g, N / 2, glyphY + 8, 36, sq.kind === "chance" ? "#facc15" : "#22d3ee");
  else if (sq.kind === "station") { g.strokeStyle = "#e8f1ff"; g.lineWidth = 7; g.strokeRect(N / 2 - 34, glyphY - 26, 68, 46); g.fillStyle = "#e8f1ff"; g.fillRect(N / 2 - 40, glyphY + 28, 80, 7); g.fillRect(N / 2 - 22, glyphY - 8, 14, 14); g.fillRect(N / 2 + 8, glyphY - 8, 14, 14); }
  else if (sq.kind === "utility") { g.fillStyle = "#facc15"; g.beginPath(); g.moveTo(N / 2 + 8, glyphY - 34); g.lineTo(N / 2 - 24, glyphY + 6); g.lineTo(N / 2 - 2, glyphY + 6); g.lineTo(N / 2 - 10, glyphY + 38); g.lineTo(N / 2 + 26, glyphY - 8); g.lineTo(N / 2 + 4, glyphY - 8); g.closePath(); g.fill(); }
  else if (sq.kind === "tax") { g.strokeStyle = "#fb7185"; g.lineWidth = 7; g.beginPath(); g.arc(N / 2, glyphY, 30, 0, Math.PI * 2); g.stroke(); g.fillStyle = "#fb7185"; g.font = "800 38px system-ui"; g.fillText("$", N / 2, glyphY + 2); }
  g.fillStyle = "#e8f1ff"; g.font = "700 25px system-ui, sans-serif";
  const lines = wrap(g, sq.name.toUpperCase(), N - 28).slice(0, 3);
  const y0 = sq.kind === "property" ? 62 : 118;
  lines.forEach((l, i) => g.fillText(l, N / 2, y0 + i * 28));
  if (sq.price > 0) { g.font = "800 30px system-ui, sans-serif"; g.fillStyle = "#9fe8ff"; g.fillText(`$${sq.price}`, N / 2, N - 30); }
  return c;
};

/** The word START on a transparent plate, drawn upright. */
const startLabel = (colour: string): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = 192; c.height = 64;
  const g = c.getContext("2d")!;
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = "800 40px system-ui, sans-serif";
  g.lineWidth = 8; g.strokeStyle = "rgba(6,10,24,0.9)"; g.strokeText("START", 96, 34);
  g.shadowColor = colour; g.shadowBlur = 10; g.fillStyle = "#ffffff"; g.fillText("START", 96, 34);
  return c;
};

/** A plain navy tile for ordinary squares; star squares get chevrons; start squares an arrow. Canvas top = direction of travel. */
const plainFace = (kind: "ring" | "star" | "start", label: string, seatColour: string): HTMLCanvasElement => {
  const N = 192, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  navyTile(g, N);
  if (kind === "star") chevrons(g, N / 2, N / 2, 40, "#facc15", 0.95);
  if (kind === "start") {
    g.fillStyle = seatColour; g.globalAlpha = 0.22; g.fillRect(0, 0, N, N); g.globalAlpha = 1;
    g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(N / 2, 26); g.lineTo(N / 2 + 46, 86); g.lineTo(N / 2 + 16, 86); g.lineTo(N / 2 + 16, 128); g.lineTo(N / 2 - 16, 128); g.lineTo(N / 2 - 16, 86); g.lineTo(N / 2 - 46, 86); g.closePath(); g.fill();
    g.fillStyle = "#f87171"; g.fillRect(N / 2 - 52, 142, 104, 9);
    void label;
  }
  return c;
};

export interface DressingInput {
  tycoon: TycoonState | null;
  islands: IslandMap;
  enterBonus: number;
}

export interface BoardDressing {
  group: THREE.Group;
  update: (input: DressingInput) => void;
  tick: (now: number) => boolean;
  /** Keeps printed text upright for the viewer: pass the world's current yaw. */
  orient: (worldYaw: number) => void;
  dispose: () => void;
}

/** The atlas of printed square faces: tiles of ATLAS_T px in a grid, one draw call for all of them. */
const ATLAS_T = 192, ATLAS_COLS = 8;

/** Gives a MeshBasicMaterial an instanced `aTile` attribute: each instance samples its own tile of an atlas (u/v scale = 1 / cols, rows). */
const atlasMaterial = (map: THREE.Texture, rows: number, transparent: boolean, offsetUnits: number): THREE.MeshBasicMaterial => {
  const m = new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent, depthWrite: !transparent, polygonOffset: true, polygonOffsetFactor: offsetUnits, polygonOffsetUnits: offsetUnits });
  m.onBeforeCompile = shader => {
    shader.vertexShader = "attribute vec2 aTile;\n" + shader.vertexShader.replace(
      "#include <uv_vertex>", `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(${(1 / ATLAS_COLS).toFixed(6)}, ${(1 / rows).toFixed(6)}) + aTile;\n#endif`,
    );
  };
  return m;
};

type Bucket = Map<THREE.Material, THREE.BufferGeometry[]>;
const addTo = (b: Bucket, mat: THREE.Material, geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
  const g = geo.clone();
  g.applyMatrix4(m);
  const list = b.get(mat);
  if (list) list.push(g); else b.set(mat, [g]);
};
/** Merges every geometry that shares a material into one mesh. Source geometries are disposed. */
const flush = (b: Bucket, into: THREE.Group, owned: THREE.BufferGeometry[]) => {
  for (const [mat, list] of b) {
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (!merged) continue;
    owned.push(merged);
    into.add(new THREE.Mesh(merged, mat));
  }
};

/** A faces-only copy of a unit box: the four sides, or just the roof. */
const boxPart = (faces: number[]): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const idx = g.getIndex()!.array;
  const out: number[] = [];
  faces.forEach(f => { for (let k = 0; k < 6; k++) out.push(idx[f * 6 + k]); });
  g.setIndex(out);
  return g;
};

/**
 * Everything that makes the board look like a neon city: a thick dark slab with steel girders, dark navy squares (with a
 * coloured bar, name and price in Tycoon games, chevrons on safe squares and an arrow on each start square), a lot beside
 * each square with a building in its owner's island style, and low neon blocks filling the rest of each yard's border.
 * Built for few draw calls: static parts are merged, squares share one texture atlas, and the buildings of all lots are
 * merged per material (the ones still rising into place are drawn on their own until they land).
 */
export const buildBoardDressing = (high: boolean, tycoonGame: boolean): BoardDressing => {
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => { owned.push(x); return x; };
  const ownedGeo: THREE.BufferGeometry[] = [];
  const yAxis = new THREE.Vector3(0, 1, 0);

  // slab, girders and pillars: three draws
  const steel = track(new THREE.MeshStandardMaterial({ color: "#2a3042", roughness: 0.55, metalness: 0.35 }));
  const slab = new THREE.Mesh(track(new THREE.BoxGeometry(15.8, 0.7, 15.8)), track(new THREE.MeshStandardMaterial({ color: "#10131f", roughness: 0.7 })));
  slab.position.y = -0.42;
  group.add(slab);
  {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = -3; i <= 3; i++) {
      parts.push(new THREE.BoxGeometry(15.8, 0.14, 0.22).translate(0, -0.95, i * 2.5));
      parts.push(new THREE.BoxGeometry(0.22, 0.14, 15.8).translate(i * 2.5, -1.15, 0));
    }
    for (const x of [-7, 0, 7]) for (const z of [-7, 0, 7]) parts.push(new THREE.BoxGeometry(0.4, 2.6, 0.4).translate(x, -2.1, z));
    const merged = mergeGeometries(parts, false)!;
    parts.forEach(g => g.dispose());
    ownedGeo.push(merged);
    group.add(new THREE.Mesh(merged, steel));
  }
  const rim = new THREE.Mesh(track(new THREE.BoxGeometry(15.9, 0.06, 15.9)), track(new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.55 })));
  rim.position.y = -0.06;
  group.add(rim);

  // ---- square faces: one atlas, one merged mesh for the flat ones, one instanced mesh for the upright (text) ones ----
  const startOf = new Map<number, Seat>(SEATS.map(s => [[0, 13, 26, 39][s], s]));
  const lotOf = new Map(LOTS.map(l => [l.ring, l]));
  const next = (i: number) => RING[(i + 1) % RING.length];
  const tiles: HTMLCanvasElement[] = [];
  const tileOf = (c: HTMLCanvasElement) => { tiles.push(c); return tiles.length - 1; };
  const flat: { ring: number; tile: number; angle: number }[] = [];
  const upright: { ring: number; tile: number }[] = [];
  const barSpots: { x: number; z: number; rot: boolean; colour: string }[] = [];
  const labelTiles: { ring: number; tile: number }[] = [];
  const sharedTiles = new Map<string, number>();
  const shared = (key: string, make: () => HTMLCanvasElement) => { let t = sharedTiles.get(key); if (t === undefined) { t = tileOf(make()); sharedTiles.set(key, t); } return t; };
  RING.forEach(([row, col], ring) => {
    const sq = SQUARES[ring];
    const star = [8, 21, 34, 47].includes(ring);
    const seat = startOf.get(ring);
    if (tycoonGame && !star && seat === undefined) {
      upright.push({ ring, tile: tileOf(squareFace(sq)) });
      const lot = lotOf.get(ring);
      if (lot && sq.kind === "property") barSpots.push({ x: col - 7 + lot.dx * 0.42, z: row - 7 + lot.dz * 0.42, rot: lot.dx !== 0, colour: GROUP_COLORS[sq.group] ?? "#ffffff" });
    } else {
      const kind = seat !== undefined ? "start" : star ? "star" : "ring";
      const tile = shared(`${kind}${seat ?? ""}`, () => plainFace(kind, "", seat !== undefined ? SEAT_INFO[seat].main : "#ffffff"));
      // canvas top points the way pieces travel; the ring cuts the four corners diagonally, so those tiles keep the heading they arrived with
      let [nr, nc] = next(ring);
      if (nr !== row && nc !== col) { const [pr, pc] = RING[(ring + RING.length - 1) % RING.length]; nr = row + (row - pr); nc = col + (col - pc); }
      flat.push({ ring, tile, angle: Math.atan2(-(nc - col), -(nr - row)) });
    }
    if (tycoonGame && seat !== undefined) labelTiles.push({ ring, tile: -1 });
  });
  const rows = Math.ceil(tiles.length / ATLAS_COLS);
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = ATLAS_COLS * ATLAS_T; atlasCanvas.height = rows * ATLAS_T;
  {
    const g = atlasCanvas.getContext("2d")!;
    tiles.forEach((c, i) => g.drawImage(c, (i % ATLAS_COLS) * ATLAS_T, Math.floor(i / ATLAS_COLS) * ATLAS_T, ATLAS_T, ATLAS_T));
  }
  const atlas = track(tex(atlasCanvas));
  const tileUv = (i: number): [number, number] => [(i % ATLAS_COLS) / ATLAS_COLS, 1 - (Math.floor(i / ATLAS_COLS) + 1) / rows];

  // the flat faces: one merged mesh with the atlas baked into its UVs
  {
    const parts: THREE.BufferGeometry[] = [];
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    for (const f of flat) {
      const [row, col] = RING[f.ring];
      const g = new THREE.PlaneGeometry(0.94, 0.94);
      const uv = g.getAttribute("uv") as THREE.BufferAttribute;
      const [u0, v0] = tileUv(f.tile);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / ATLAS_COLS, v0 + uv.getY(i) / rows);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(col - 7, TOP, row - 7), new THREE.Quaternion().setFromAxisAngle(yAxis, f.angle).multiply(qx), new THREE.Vector3(1, 1, 1)));
      parts.push(g);
    }
    if (parts.length) {
      const merged = mergeGeometries(parts, false)!;
      parts.forEach(g => g.dispose());
      ownedGeo.push(merged);
      group.add(new THREE.Mesh(merged, track(new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))));
    }
  }

  // the upright faces (names and prices, kept readable from the viewer's seat): one instanced mesh, matrices set in orient()
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const dummy = new THREE.Object3D();
  let uprightMesh: THREE.InstancedMesh | null = null;
  let labelMesh: THREE.InstancedMesh | null = null;
  const labelAtlas: HTMLCanvasElement[] = [];
  if (upright.length) {
    const geo = track(new THREE.PlaneGeometry(0.94, 0.94));
    const tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(upright.length * 2), 2);
    upright.forEach((u, i) => { const [u0, v0] = tileUv(u.tile); tileAttr.setXY(i, u0, v0); });
    geo.setAttribute("aTile", tileAttr);
    uprightMesh = new THREE.InstancedMesh(geo, track(atlasMaterial(atlas, rows, false, -2)), upright.length);
    uprightMesh.frustumCulled = false;
    group.add(uprightMesh);
  }
  if (labelTiles.length) {
    // the START labels: a second, transparent atlas of four strips
    const lc = document.createElement("canvas"); lc.width = ATLAS_COLS * ATLAS_T; lc.height = ATLAS_T;
    const g = lc.getContext("2d")!;
    labelTiles.forEach((l, i) => { const [r0] = RING[l.ring]; void r0; labelAtlas.push(startLabel(SEAT_INFO[startOf.get(l.ring)!].main)); g.drawImage(labelAtlas[i], i * ATLAS_T, 0, ATLAS_T, 64); });
    const lmap = track(tex(lc));
    const geo = track(new THREE.PlaneGeometry(0.9, 0.3));
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - (1 - uv.getY(i)) * (64 / ATLAS_T)); // the strip is the top 64 px of its tile
    const tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(labelTiles.length * 2), 2);
    labelTiles.forEach((_, i) => tileAttr.setXY(i, i / ATLAS_COLS, 0));
    geo.setAttribute("aTile", tileAttr);
    labelMesh = new THREE.InstancedMesh(geo, track(atlasMaterial(lmap, 1, true, -3)), labelTiles.length);
    labelMesh.frustumCulled = false; labelMesh.renderOrder = 2;
    group.add(labelMesh);
  }
  let lastYaw = NaN;
  const orient = (yaw: number) => {
    if (yaw === lastYaw) return;
    lastYaw = yaw;
    q1.setFromAxisAngle(yAxis, -yaw);
    dummy.quaternion.copy(q1).multiply(q2);
    dummy.scale.set(1, 1, 1);
    if (uprightMesh) {
      upright.forEach((u, i) => { const [row, col] = RING[u.ring]; dummy.position.set(col - 7, TOP, row - 7); dummy.updateMatrix(); uprightMesh!.setMatrixAt(i, dummy.matrix); });
      uprightMesh.instanceMatrix.needsUpdate = true;
    }
    if (labelMesh) {
      labelTiles.forEach((l, i) => { const [row, col] = RING[l.ring]; dummy.position.set(col - 7, TOP + 0.012, row - 7); dummy.updateMatrix(); labelMesh!.setMatrixAt(i, dummy.matrix); });
      labelMesh.instanceMatrix.needsUpdate = true;
    }
  };
  orient(0);

  // group bars (Tycoon): one instanced mesh with a colour per bar
  if (barSpots.length) {
    const bars = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.84, 0.06, 0.1)), track(new THREE.MeshBasicMaterial({ toneMapped: false })), barSpots.length);
    barSpots.forEach((b, i) => {
      dummy.position.set(b.x, TOP + 0.04, b.z); dummy.rotation.set(0, b.rot ? Math.PI / 2 : 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      bars.setMatrixAt(i, dummy.matrix); bars.setColorAt(i, new THREE.Color(b.colour));
    });
    bars.frustumCulled = false;
    group.add(bars);
  }

  // owner bars: one instanced mesh; hidden instances are scaled to nothing
  let markers: THREE.InstancedMesh | null = null;
  const markerRing: number[] = [];
  if (tycoonGame) {
    markers = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.8, 0.07, 0.09)), track(new THREE.MeshBasicMaterial({ toneMapped: false })), LOTS.length);
    LOTS.forEach((l, i) => { markerRing[i] = l.ring; markers!.setColorAt(i, new THREE.Color("#ffffff")); markers!.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); });
    markers.frustumCulled = false;
    group.add(markers);
  }

  // ---- lots: generic blocks, and the island buildings that replace them --------------------------------------------
  const fillerMats = Array.from({ length: 3 }, (_, i) => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = ["#1a2244", "#251c48", "#17283f"][i]; g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) { g.fillStyle = (x * 7 + y * 3 + i) % 4 ? "#0b0f1e" : ["#ffd27a", "#7de3ff", "#f0a0ff"][(x + y + i) % 3]; g.fillRect(6 + x * 19, 6 + y * 15, 12, 9); }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return track(new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.7, roughness: 0.8 }));
  });
  const trims = ["#22d3ee", "#f472b6", "#a78bfa", "#facc15"].map(c => track(new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 })));
  const roofDark = track(new THREE.MeshStandardMaterial({ color: "#0b0e1c", roughness: 0.8 }));
  const sidesGeo = track(boxPart([0, 1, 4, 5])), topGeo = track(boxPart([2, 3]));
  const edgeGeo = track(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));
  const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), idQ = new THREE.Quaternion();
  /** One generic block (a box with a lit-window side texture and a neon outline) added to the buckets. */
  const genericInto = (solid: Bucket, lines: Map<THREE.Material, THREE.BufferGeometry[]>, x: number, z: number, w: number, h: number, i: number) => {
    mtx.compose(pos.set(x, TOP + h / 2, z), idQ, scl.set(w, h, w));
    addTo(solid, fillerMats[i % 3], sidesGeo, mtx);
    addTo(solid, roofDark, topGeo, mtx);
    const l = edgeGeo.clone(); l.applyMatrix4(mtx);
    const list = lines.get(trims[i % 4]);
    if (list) list.push(l); else lines.set(trims[i % 4], [l]);
  };
  const flushLines = (lines: Map<THREE.Material, THREE.BufferGeometry[]>, into: THREE.Group, geos: THREE.BufferGeometry[]) => {
    for (const [mat, list] of lines) {
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      if (!merged) continue;
      geos.push(merged);
      into.add(new THREE.LineSegments(merged, mat as THREE.LineBasicMaterial));
    }
  };

  // yard borders not used as lots: small blocks, merged once
  {
    const lotCells = new Set(LOTS.map(l => `${l.cz + 7},${l.cx + 7}`));
    const solid: Bucket = new Map(), lines = new Map<THREE.Material, THREE.BufferGeometry[]>();
    let fi = 0;
    for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
      const info = cellInfo(row, col);
      if (info.kind !== "yard") continue;
      const base = { 0: [9, 0], 1: [0, 0], 2: [0, 9], 3: [9, 9] }[info.seat as 0 | 1 | 2 | 3];
      const lr = row - base[0], lc = col - base[1];
      const border = lr === 0 || lr === 5 || lc === 0 || lc === 5;
      if (!border || lotCells.has(`${row},${col}`)) continue;
      if (!high && fi % 2) { fi++; continue; }
      genericInto(solid, lines, col - 7, row - 7, 0.78, 0.45 + ((fi * 7) % 5) * 0.16, fi++);
    }
    flush(solid, group, ownedGeo);
    flushLines(lines, group, ownedGeo);
  }

  // yard floors: a glowing street grid seen from above (one texture, four planes merged), and a pad under each token slot (instanced)
  {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0a0e1d"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(34,211,238,0.5)"; g.lineWidth = 3;
    for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * 42.6, 0); g.lineTo(i * 42.6, 256); g.moveTo(0, i * 42.6); g.lineTo(256, i * 42.6); g.stroke(); }
    g.fillStyle = "rgba(255,210,122,0.18)";
    for (let k = 0; k < 40; k++) g.fillRect(((k * 53) % 240) + 4, ((k * 97) % 240) + 4, 9, 6);
    const parts = SEATS.map(seat => { const [cx, cz] = YARD_C[seat]; return new THREE.PlaneGeometry(5.9, 5.9).rotateX(-Math.PI / 2).translate(cx, 0.04, cz); });
    const merged = mergeGeometries(parts, false)!;
    parts.forEach(p => p.dispose());
    ownedGeo.push(merged);
    group.add(new THREE.Mesh(merged, track(new THREE.MeshBasicMaterial({ map: track(tex(c)), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))));
  }
  const pads = new THREE.InstancedMesh(track(new THREE.RingGeometry(0.36, 0.5, 32).rotateX(-Math.PI / 2)), track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })), 16);
  {
    let i = 0;
    for (const seat of SEATS) {
      const [cx, cz] = YARD_C[seat];
      for (const [ox, oz] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) {
        pos.set(cx + ox, 0.07, cz + oz);
        pads.setMatrixAt(i++, mtx.compose(pos, idQ, scl.set(1, 1, 1)));
      }
    }
    pads.frustumCulled = false;
    group.add(pads);
  }
  const setPadColours = () => {
    const col = new THREE.Color();
    SEATS.forEach((seat, si) => { col.set(SEAT_INFO[seat].main); for (let k = 0; k < 4; k++) pads.setColorAt(si * 4 + k, col); });
    if (pads.instanceColor) pads.instanceColor.needsUpdate = true;
  };
  setPadColours();

  // ---- buildings per lot ----------------------------------------------------------------------------------------------
  interface Slot { lot: Lot; level: number; ownerKey: string; built: BuiltBuilding | null; holder: THREE.Group; born: number; deco: boolean; inBatch: boolean }
  const slots = new Map<number, Slot>();
  let n = 0;
  const decoIndex = new Map<number, number>();
  for (const lot of LOTS) {
    const holder = new THREE.Group();
    holder.position.set(lot.cx + lot.ox, TOP, lot.cz + lot.oz);
    holder.scale.setScalar(lot.shared ? 0.55 : 0.9);
    group.add(holder);
    decoIndex.set(lot.ring, n);
    slots.set(lot.ring, { lot, level: -1, ownerKey: "", built: null, holder, born: -1e9, deco: false, inBatch: false });
    n++;
  }
  // the merged buildings, rebuilt whenever a lot changes or a rising building lands
  const batch = new THREE.Group();
  group.add(batch);
  let batchGeos: THREE.BufferGeometry[] = [];
  let batchDirty = true;
  let firstUpdate = true;
  const rebuildBatch = (now: number) => {
    batch.clear();
    batchGeos.forEach(g => g.dispose());
    batchGeos = [];
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const solid: Bucket = new Map(), lines = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const rel = new THREE.Matrix4();
    for (const s of slots.values()) {
      s.inBatch = false;
      if (s.built) {
        if (now - s.born < 450) { s.built.group.visible = true; continue; } // still rising: drawn on its own
        s.built.group.visible = false;
        s.inBatch = true;
        s.built.group.traverse(o => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          rel.multiplyMatrices(inv, m.matrixWorld);
          addTo(solid, m.material as THREE.Material, m.geometry, rel);
        });
      } else if (s.deco) {
        const i = decoIndex.get(s.lot.ring)!;
        genericInto(solid, lines, s.lot.cx + s.lot.ox, s.lot.cz + s.lot.oz, s.lot.shared ? 0.4 : 0.62, 0.3 + (i % 3) * 0.14, i);
      }
    }
    flush(solid, batch, batchGeos);
    flushLines(lines, batch, batchGeos);
    batchDirty = false;
  };

  let animating = false;
  const styleFor = (seat: Seat, islands: IslandMap): IslandStyle => islands[seat] ?? { ...DEFAULT_ISLAND, accent: SEAT_INFO[seat].main };
  const col = new THREE.Color();

  const update = (input: DressingInput) => {
    const now = performance.now();
    setPadColours();
    for (const s of slots.values()) {
      const ownerSeat: number = input.tycoon ? input.tycoon.owner[s.lot.ring] : -1;
      const lotSeat = s.lot.seat;
      // Tycoon: the owner's island on owned squares, nothing on unowned ones. Plain Ludo: each yard's island styles its own lots.
      const seat: Seat | null = tycoonGame ? (ownerSeat >= 0 ? (ownerSeat as Seat) : null) : lotSeat;
      const level = tycoonGame ? (ownerSeat >= 0 ? input.tycoon!.level[s.lot.ring] : -1) : 1 + (s.lot.ring % 3 === 0 ? 1 : 0);
      const style = seat === null ? null : styleFor(seat, input.islands);
      const key = style ? `${seat}|${JSON.stringify(style)}|${level}` : "";
      if (key !== s.ownerKey) {
        s.built?.dispose();
        if (s.built) s.holder.remove(s.built.group);
        s.built = null;
        if (style) {
          s.built = buildBuilding(style, Math.min(3, Math.max(0, level)) as 0 | 1 | 2 | 3);
          s.holder.add(s.built.group);
          s.born = firstUpdate ? -1e9 : now; // everything that appears later rises into place; the first population just stands
          if (!firstUpdate) animating = true;
        }
        s.deco = tycoonGame && !style;
        s.ownerKey = key; s.level = level;
        batchDirty = true;
      }
      if (markers) {
        const mi = markerRing.indexOf(s.lot.ring);
        const [row, c] = RING[s.lot.ring];
        if (mi >= 0) {
          if (ownerSeat >= 0) {
            dummy.position.set(c - 7 - s.lot.dx * 0.43, TOP + 0.05, row - 7 - s.lot.dz * 0.43);
            dummy.rotation.set(0, s.lot.dx !== 0 ? Math.PI / 2 : 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
            markers.setMatrixAt(mi, dummy.matrix);
            markers.setColorAt(mi, col.set(SEAT_INFO[ownerSeat as Seat].main));
          } else markers.setMatrixAt(mi, new THREE.Matrix4().makeScale(0, 0, 0));
        }
      }
    }
    if (markers) { markers.instanceMatrix.needsUpdate = true; if (markers.instanceColor) markers.instanceColor.needsUpdate = true; }
    firstUpdate = false;
    if (batchDirty) rebuildBatch(now);
    // START squares say what entering pays in this game
    void input.enterBonus;
  };

  const tick = (now: number): boolean => {
    let any = false;
    let landed = false;
    for (const s of slots.values()) {
      if (!s.built || s.inBatch) continue;
      const k = Math.min(1, (now - s.born) / 450);
      if (k < 1) {
        const e = 1 - Math.pow(1 - k, 3);
        s.built.group.scale.set(1, Math.max(0.02, e * (1 + 0.12 * Math.sin(k * Math.PI))), 1);
        any = true;
      } else {
        s.built.group.scale.set(1, 1, 1);
        landed = true; // it joins the merged buildings
      }
    }
    if (landed) { rebuildBatch(now); }
    animating = any;
    return any;
  };

  return {
    group, update, tick, orient,
    dispose: () => {
      slots.forEach(s => s.built?.dispose());
      batchGeos.forEach(g => g.dispose());
      ownedGeo.forEach(g => g.dispose());
      uprightMesh?.dispose(); labelMesh?.dispose(); pads.dispose(); markers?.dispose();
      owned.forEach(o => o.dispose());
      void animating;
    },
  };
};
