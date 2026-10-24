import * as THREE from "three";
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

/**
 * Everything that makes the board look like a neon city: a thick dark slab with steel girders, dark navy squares (with a
 * coloured bar, name and price in Tycoon games, chevrons on safe squares and an arrow on each start square), a lot beside
 * each square with a building in its owner's island style, and low neon blocks filling the rest of each yard's border.
 */
export const buildBoardDressing = (high: boolean, tycoonGame: boolean): BoardDressing => {
  const group = new THREE.Group();
  const owned: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => { owned.push(x); return x; };

  // slab and girders
  const steel = track(new THREE.MeshStandardMaterial({ color: "#2a3042", roughness: 0.55, metalness: 0.35 }));
  const slab = new THREE.Mesh(track(new THREE.BoxGeometry(15.8, 0.7, 15.8)), track(new THREE.MeshStandardMaterial({ color: "#10131f", roughness: 0.7 })));
  slab.position.y = -0.42;
  group.add(slab);
  const girder = track(new THREE.BoxGeometry(15.8, 0.14, 0.22));
  for (let i = -3; i <= 3; i++) {
    const a = new THREE.Mesh(girder, steel); a.position.set(0, -0.95, i * 2.5);
    const b = new THREE.Mesh(girder, steel); b.rotation.y = Math.PI / 2; b.position.set(i * 2.5, -1.15, 0);
    group.add(a, b);
  }
  const pillar = track(new THREE.BoxGeometry(0.4, 2.6, 0.4));
  for (const x of [-7, 0, 7]) for (const z of [-7, 0, 7]) { const p = new THREE.Mesh(pillar, steel); p.position.set(x, -2.1, z); group.add(p); }
  const rim = new THREE.Mesh(track(new THREE.BoxGeometry(15.9, 0.06, 15.9)), track(new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.55 })));
  rim.position.y = -0.06; rim.scale.set(1, 1, 1);
  group.add(rim);

  // printed square faces
  const faces: THREE.Mesh[] = [];
  const upright: THREE.Mesh[] = [];
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), yAxis = new THREE.Vector3(0, 1, 0);
  const barGeo = track(new THREE.BoxGeometry(0.84, 0.06, 0.1));
  const labelGeo = track(new THREE.PlaneGeometry(0.9, 0.3));
  const planeGeo = track(new THREE.PlaneGeometry(0.94, 0.94));
  const next = (i: number) => RING[(i + 1) % RING.length];
  const startOf = new Map<number, Seat>(SEATS.map(s => [[0, 13, 26, 39][s], s]));
  const lotOf = new Map(LOTS.map(l => [l.ring, l]));
  RING.forEach(([row, col], ring) => {
    const sq = SQUARES[ring];
    const star = [8, 21, 34, 47].includes(ring);
    const seat = startOf.get(ring);
    let map: THREE.CanvasTexture;
    let angle = 0;
    if (tycoonGame && !star && seat === undefined) {
      map = track(tex(squareFace(sq)));
      const lot = lotOf.get(ring);
      if (lot && sq.kind === "property") {
        const bar = new THREE.Mesh(barGeo, track(new THREE.MeshBasicMaterial({ color: GROUP_COLORS[sq.group] ?? "#ffffff", toneMapped: false })));
        bar.position.set(col - 7 + lot.dx * 0.42, TOP + 0.04, row - 7 + lot.dz * 0.42);
        if (lot.dx !== 0) bar.rotation.y = Math.PI / 2;
        group.add(bar);
      }
    } else {
      map = track(tex(plainFace(seat !== undefined ? "start" : star ? "star" : "ring", seat !== undefined && tycoonGame ? "" : "", seat !== undefined ? SEAT_INFO[seat].main : "#ffffff")));
      const [nr, nc] = next(ring);
      const tx = nc - col, tz = nr - row;
      angle = Math.atan2(-tx, -tz); // canvas top points the way pieces travel
    }
    const mat = track(new THREE.MeshBasicMaterial({ map, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const m = new THREE.Mesh(planeGeo, mat);
    m.rotation.set(-Math.PI / 2, 0, 0);
    if (tycoonGame && !star && seat === undefined) upright.push(m);
    else m.rotateOnWorldAxis(yAxis, angle);
    m.position.set(col - 7, TOP, row - 7);
    group.add(m);
    faces.push(m);
    if (tycoonGame && seat !== undefined) {
      const lab = new THREE.Mesh(labelGeo, track(new THREE.MeshBasicMaterial({ map: track(tex(startLabel(SEAT_INFO[seat].main))), transparent: true, toneMapped: false, depthWrite: false })));
      lab.rotation.x = -Math.PI / 2; lab.position.set(col - 7, TOP + 0.012, row - 7);
      group.add(lab); upright.push(lab);
    }
  });

  // owner bars, on the side of each square away from its lot
  const markGeo = track(new THREE.BoxGeometry(0.8, 0.07, 0.09));
  const markers = new Map<number, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }>();
  if (tycoonGame) for (const lot of LOTS) {
    const [row, col] = RING[lot.ring];
    const mat = track(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
    const m = new THREE.Mesh(markGeo, mat);
    m.position.set(col - 7 - lot.dx * 0.43, TOP + 0.05, row - 7 - lot.dz * 0.43);
    if (lot.dx !== 0) m.rotation.y = Math.PI / 2;
    m.visible = false;
    group.add(m);
    markers.set(lot.ring, { mesh: m, mat });
  }

  // lots: decorative generic blocks, replaced by island buildings
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
  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const edgeGeo = track(new THREE.EdgesGeometry(boxGeo));
  const generic = (x: number, z: number, w: number, h: number, i: number): THREE.Group => {
    const g = new THREE.Group();
    const side = fillerMats[i % 3];
    const b = new THREE.Mesh(boxGeo, [side, side, roofDark, roofDark, side, side]); b.scale.set(w, h, w); b.position.y = h / 2;
    const t = new THREE.LineSegments(edgeGeo, trims[i % 4]); t.scale.set(w, h, w); t.position.y = h / 2;
    g.add(b, t); g.position.set(x, TOP, z);
    return g;
  };

  // yard borders not used as lots: small blocks
  const lotCells = new Set(LOTS.map(l => `${l.cz + 7},${l.cx + 7}`));
  let fi = 0;
  for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
    const info = cellInfo(row, col);
    if (info.kind !== "yard") continue;
    const base = { 0: [9, 0], 1: [0, 0], 2: [0, 9], 3: [9, 9] }[info.seat as 0 | 1 | 2 | 3];
    const lr = row - base[0], lc = col - base[1];
    const border = lr === 0 || lr === 5 || lc === 0 || lc === 5;
    if (!border || lotCells.has(`${row},${col}`)) continue;
    if (!high && fi % 2) { fi++; continue; }
    group.add(generic(col - 7, row - 7, 0.78, 0.45 + ((fi * 7) % 5) * 0.16, fi++));
  }

  const padMats: { seat: Seat; mat: THREE.MeshBasicMaterial }[] = [];
  // yard floors: a glowing street grid seen from above, and a pad under each of the four token slots
  for (const seat of SEATS) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0a0e1d"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(34,211,238,0.5)"; g.lineWidth = 3;
    for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * 42.6, 0); g.lineTo(i * 42.6, 256); g.moveTo(0, i * 42.6); g.lineTo(256, i * 42.6); g.stroke(); }
    g.fillStyle = "rgba(255,210,122,0.18)";
    for (let k = 0; k < 40; k++) g.fillRect(((k * 53) % 240) + 4, ((k * 97) % 240) + 4, 9, 6);
    const [cx, cz] = YARD_C[seat];
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(5.9, 5.9)), track(new THREE.MeshBasicMaterial({ map: track(tex(c)), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.04, cz);
    group.add(floor);
    for (const [ox, oz] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) {
      const padMat = track(new THREE.MeshBasicMaterial({ color: SEAT_INFO[seat].main, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
      padMats.push({ seat, mat: padMat });
      const pad = new THREE.Mesh(track(new THREE.RingGeometry(0.36, 0.5, 32)), padMat);
      pad.rotation.x = -Math.PI / 2; pad.position.set(cx + ox, 0.07, cz + oz);
      group.add(pad);
    }
  }

  // buildings per lot
  interface Slot { lot: Lot; level: number; ownerKey: string; built: BuiltBuilding | null; holder: THREE.Group; born: number; deco: THREE.Group }
  const slots = new Map<number, Slot>();
  let n = 0;
  for (const lot of LOTS) {
    const holder = new THREE.Group();
    holder.position.set(lot.cx + lot.ox, TOP, lot.cz + lot.oz);
    holder.scale.setScalar(lot.shared ? 0.55 : 0.9);
    group.add(holder);
    const deco = tycoonGame ? generic(lot.cx + lot.ox, lot.cz + lot.oz, lot.shared ? 0.4 : 0.62, 0.3 + (n % 3) * 0.14, n) : new THREE.Group();
    if (tycoonGame) group.add(deco);
    slots.set(lot.ring, { lot, level: -1, ownerKey: "", built: null, holder, born: 0, deco });
    n++;
  }

  let animating = false;
  const styleFor = (seat: Seat, islands: IslandMap): IslandStyle => islands[seat] ?? { ...DEFAULT_ISLAND, accent: SEAT_INFO[seat].main };

  const update = (input: DressingInput) => {
    const now = performance.now();
    for (const pm of padMats) pm.mat.color.set(SEAT_INFO[pm.seat].main);
    for (const s of slots.values()) {
      const ownerSeat: number = input.tycoon ? input.tycoon.owner[s.lot.ring] : -1;
      const lotSeat = s.lot.seat;
      // Tycoon: the owner's island on owned squares, nothing on unowned ones. Plain Ludo: each yard's island styles its own lots.
      const seat: Seat | null = tycoonGame ? (ownerSeat >= 0 ? (ownerSeat as Seat) : null) : lotSeat;
      const level = tycoonGame ? (ownerSeat >= 0 ? input.tycoon!.level[s.lot.ring] : -1) : 1 + (s.lot.ring % 3 === 0 ? 1 : 0);
      const style = seat === null ? null : styleFor(seat, input.islands);
      const key = style ? `${seat}|${JSON.stringify(style)}|${level}` : "";
      if (key !== s.ownerKey) {
        const grew = s.level >= 0 && level > s.level && seat !== null && s.ownerKey.startsWith(`${seat}|`);
        s.built?.dispose();
        if (s.built) s.holder.remove(s.built.group);
        s.built = null;
        if (style) {
          s.built = buildBuilding(style, Math.min(3, Math.max(0, level)) as 0 | 1 | 2 | 3);
          s.holder.add(s.built.group);
          s.born = now; // everything that appears rises into place
          void grew;
          animating = true;
        }
        s.deco.visible = tycoonGame && !style;
        s.ownerKey = key; s.level = level;
      }
      const mk = markers.get(s.lot.ring);
      if (mk) { mk.mesh.visible = ownerSeat >= 0; if (ownerSeat >= 0) mk.mat.color.set(SEAT_INFO[ownerSeat as Seat].main); }
    }
    // START squares say what entering pays in this game
    void input.enterBonus;
  };

  const tick = (now: number): boolean => {
    let any = false;
    for (const s of slots.values()) {
      if (!s.built) continue;
      const k = Math.min(1, (now - s.born) / 450);
      if (k < 1) {
        const e = 1 - Math.pow(1 - k, 3);
        s.built.group.scale.set(1, Math.max(0.02, e * (1 + 0.12 * Math.sin(k * Math.PI))), 1);
        any = true;
      } else if (s.built.group.scale.y !== 1) s.built.group.scale.set(1, 1, 1);
    }
    animating = any;
    return any;
  };

  const orient = (yaw: number) => {
    q1.setFromAxisAngle(yAxis, -yaw);
    for (const m of upright) m.quaternion.copy(q1).multiply(q2);
  };

  return {
    group, update, tick, orient,
    dispose: () => { slots.forEach(s => s.built?.dispose()); owned.forEach(o => o.dispose()); void animating; void faces; },
  };
};
