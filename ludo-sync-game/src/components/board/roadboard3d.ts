import * as THREE from "three";
import { SEATS, SEAT_INFO, SEAT_DIRECTION, bayPoint, cellInfo, lotOnRight, yardCentre, type Seat } from "@/lib/ludo/board";

/** How far the middle of the board stands above the road, and so how high a finished vehicle sits. */
export const ROAD_STEP = 0.24;
/** Height of the painted road above the ground. */
export const ROAD_Y = 0.052;

const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
};

const CENTRE_PTS: Record<Seat, [number, number][]> = {
  0: [[5.5, 8.5], [8.5, 8.5], [7, 7]], 1: [[5.5, 5.5], [5.5, 8.5], [7, 7]], 2: [[5.5, 5.5], [8.5, 5.5], [7, 7]], 3: [[8.5, 5.5], [8.5, 8.5], [7, 7]],
};
const INACTIVE_YARD = "#cfc6ba";
const INACTIVE_COL = "#8a8f98";
const INACTIVE_START = "#6b7078";

/**
 * Paints the whole road board on one canvas, in the same 16 by 16 units the flat board uses (the frame included),
 * so the 3D board and the flat board are the same picture. Kept as plain canvas drawing so it can be repainted when
 * players or colours change.
 */
export const paintRoadBoard = (g: CanvasRenderingContext2D, size: number, playing: ReadonlySet<Seat>) => {
  const U = size / 16;
  g.save();
  g.clearRect(0, 0, size, size);
  g.scale(U, U);
  g.translate(1, 1);

  // frame and grass
  const frame = g.createLinearGradient(-1, -1, 15, 15);
  frame.addColorStop(0, "#9aa1ab"); frame.addColorStop(0.5, "#c5cad2"); frame.addColorStop(1, "#7d848e");
  g.fillStyle = frame; rr(g, -1, -1, 16, 16, 1); g.fill();
  g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 0.06; rr(g, -0.95, -0.95, 15.9, 15.9, 0.95); g.stroke();
  const grass = g.createRadialGradient(7, 6.5, 0, 7, 7, 11);
  grass.addColorStop(0, "#8fd18f"); grass.addColorStop(1, "#5aa05a");
  g.fillStyle = grass; rr(g, -0.55, -0.55, 15.1, 15.1, 0.62); g.fill();
  g.strokeStyle = "rgba(31,61,31,.5)"; g.lineWidth = 0.08; g.stroke();

  // yards: a coloured pad with a car park inside, and a bay for each vehicle
  for (const seat of SEATS) {
    const info = SEAT_INFO[seat];
    const on = playing.has(seat);
    const x0 = seat === 0 || seat === 1 ? -0.5 : 8.5, y0 = seat === 1 || seat === 2 ? -0.5 : 8.5;
    g.fillStyle = "rgba(42,26,10,.25)"; rr(g, x0 + 0.05, y0 + 0.12, 5.9, 5.9, 0.55); g.fill();
    if (on) {
      const grad = g.createLinearGradient(x0, y0, x0 + 5.9, y0 + 5.9);
      grad.addColorStop(0, info.light); grad.addColorStop(0.55, info.main); grad.addColorStop(1, info.dark);
      g.fillStyle = grad;
    } else g.fillStyle = INACTIVE_YARD;
    rr(g, x0, y0, 5.9, 5.9, 0.55); g.fill();
    g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 0.07; rr(g, x0 + 0.08, y0 + 0.08, 5.74, 5.74, 0.48); g.stroke();
    // the player's island: a lawn for their buildings, and a car park along the edge that touches the road
    const right = lotOnRight(seat), c = yardCentre(seat);
    const lotX0 = right ? c.x + 0.3 : c.x - 2.75;
    const lawnX0 = right ? x0 + 0.3 : c.x - 0.15;
    const lawnW = right ? lotX0 - 0.15 - lawnX0 : x0 + 5.6 - lawnX0;
    const lawn = g.createLinearGradient(0, y0 + 0.3, 0, y0 + 5.6);
    lawn.addColorStop(0, on ? "#8fd18f" : "#c8c0b2"); lawn.addColorStop(1, on ? "#5fa95f" : "#b3aa9b");
    g.fillStyle = lawn; rr(g, lawnX0, y0 + 0.3, lawnW, 5.3, 0.35); g.fill();
    g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 0.04; g.stroke();
    const lot = g.createLinearGradient(0, c.y - 1.78, 0, c.y + 1.78);
    lot.addColorStop(0, on ? "#4a4f59" : "#6b6f78"); lot.addColorStop(1, on ? "#383c44" : "#555962");
    g.fillStyle = lot; rr(g, lotX0, c.y - 1.78, 2.45, 3.56, 0.22); g.fill();
    g.strokeStyle = `rgba(255,255,255,${on ? 0.85 : 0.3})`; g.lineWidth = 0.07; g.stroke();
    g.fillStyle = "rgba(248,250,252,.9)"; g.fillRect(right ? lotX0 + 2.45 - 0.07 : lotX0, c.y - 1.78, 0.07, 3.56);
    g.strokeStyle = `rgba(255,255,255,${on ? 0.75 : 0.3})`; g.lineWidth = 0.05; g.setLineDash([0.18, 0.1]);
    for (let i = 0; i < 4; i++) { const p = bayPoint(seat, i); rr(g, p.x - 0.5, p.y - 0.58, 1, 1.16, 0.08); g.stroke(); }
    g.setLineDash([]);
  }

  // the road: every square of the track and the coloured lane up to the middle
  for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
    const info = cellInfo(row, col);
    if (info.kind === "void" || info.kind === "yard" || info.kind === "centre") continue;
    const seatInfo = info.seat !== undefined ? SEAT_INFO[info.seat] : null;
    const active = info.seat === undefined || playing.has(info.seat);
    const x = col - 0.5, y = row - 0.5;
    const vArm = col >= 6 && col <= 8 && (row < 6 || row > 8), hArm = row >= 6 && row <= 8 && (col < 6 || col > 8);
    const track = info.kind !== "column" && info.kind !== "start";
    g.fillStyle = info.kind === "column" ? (active ? seatInfo!.path : INACTIVE_COL) : info.kind === "start" ? (active ? seatInfo!.main : INACTIVE_START) : "#41464f";
    g.fillRect(x, y, 1, 1);
    if (track) { g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x, y, 1, 0.5); }
    g.strokeStyle = `rgba(255,255,255,${track ? 0.07 : 0.16})`; g.lineWidth = 0.03; g.strokeRect(x, y, 1, 1);
    const vertical = info.kind === "start" ? SEAT_DIRECTION[info.seat!].y !== 0 : vArm;
    if (track) { g.fillStyle = "rgba(255,255,255,.2)"; if (vertical) g.fillRect(col - 0.025, row - 0.17, 0.05, 0.34); else g.fillRect(col - 0.17, row - 0.025, 0.34, 0.05); }
    if (info.kind !== "column") {
      g.fillStyle = "rgba(248,250,252,.92)";
      if (vArm && col === 6) g.fillRect(x, y, 0.09, 1);
      if (vArm && col === 8) g.fillRect(x + 0.91, y, 0.09, 1);
      if (hArm && row === 6) g.fillRect(x, y, 1, 0.09);
      if (hArm && row === 8) g.fillRect(x, y + 0.91, 1, 0.09);
      if (row === 0) g.fillRect(x, y, 1, 0.09);
      if (row === 14) g.fillRect(x, y + 0.91, 1, 0.09);
      if (col === 0) g.fillRect(x, y, 0.09, 1);
      if (col === 14) g.fillRect(x + 0.91, y, 0.09, 1);
    }
    if (info.kind === "column" && info.seat !== undefined) {
      const d = SEAT_DIRECTION[info.seat];
      g.save(); g.translate(col, row); g.rotate(Math.atan2(d.x, -d.y) + Math.PI);
      g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 0.07; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(-0.2, 0.1); g.lineTo(0, -0.12); g.lineTo(0.2, 0.1); g.stroke();
      g.restore();
    }
    if (info.kind === "start") {
      g.fillStyle = "rgba(255,255,255,.9)";
      for (const o of [-0.33, -0.11, 0.11, 0.33]) { if (vertical) g.fillRect(col + o - 0.05, row - 0.4, 0.1, 0.8); else g.fillRect(col - 0.4, row + o - 0.05, 0.8, 0.1); }
    }
    if (info.kind === "star") {
      g.fillStyle = "#1d4ed8"; rr(g, col - 0.3, row - 0.3, 0.6, 0.6, 0.1); g.fill();
      g.strokeStyle = "#fff"; g.lineWidth = 0.04; g.stroke();
      g.fillStyle = "#fff"; g.font = "900 0.46px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("P", col, row + 0.03);
    }
  }

  // the first step of the middle, level with the road
  for (const seat of SEATS) {
    const pts = CENTRE_PTS[seat];
    const info = SEAT_INFO[seat];
    const on = playing.has(seat);
    if (on) {
      const grad = g.createLinearGradient(5.5, 5.5, 8.5, 8.5);
      grad.addColorStop(0, info.light); grad.addColorStop(1, info.dark);
      g.fillStyle = grad;
    } else g.fillStyle = INACTIVE_YARD;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 0.06; g.lineJoin = "round"; g.stroke();
  }
  g.restore();
};

/** The small raised square on top of the middle: the four colours again, with a gold gem. */
export const paintCentreTop = (g: CanvasRenderingContext2D, size: number, playing: ReadonlySet<Seat>) => {
  g.save();
  g.clearRect(0, 0, size, size);
  const k = size / 3; // the middle 3 by 3 units
  g.scale(k, k);
  g.translate(-5.5, -5.5);
  for (const seat of SEATS) {
    const pts = CENTRE_PTS[seat];
    const info = SEAT_INFO[seat];
    if (playing.has(seat)) {
      const grad = g.createLinearGradient(5.5, 5.5, 8.5, 8.5);
      grad.addColorStop(0, info.light); grad.addColorStop(1, info.dark);
      g.fillStyle = grad;
    } else g.fillStyle = INACTIVE_YARD;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 0.06; g.lineJoin = "round"; g.stroke();
  }
  const gem = g.createRadialGradient(6.85, 6.8, 0, 7, 7, 0.9);
  gem.addColorStop(0, "#fff6c9"); gem.addColorStop(0.5, "#f0b429"); gem.addColorStop(1, "#9a6208");
  g.fillStyle = gem; g.beginPath(); g.arc(7, 7, 0.75, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#fff"; g.lineWidth = 0.1; g.stroke();
  g.fillStyle = "rgba(255,255,255,.8)"; g.beginPath(); g.arc(6.8, 6.78, 0.17, 0, Math.PI * 2); g.fill();
  g.restore();
};

export interface RoadBoard {
  group: THREE.Group;
  /** Repaints for a set of seated players; cheap to call when nothing changed. */
  paint: (playing: ReadonlySet<Seat>) => void;
  dispose: () => void;
}

const hasDom = typeof document !== "undefined";

/** A tall thin picture that fades from the top of the sky to the horizon, used as the scene's background. */
export const skyGradient = (top: string, bottom: string): THREE.CanvasTexture | null => {
  if (!hasDom) return null;
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** The board as a painted road with the raised middle, in 3D. */
export const buildRoadBoard = (high: boolean): RoadBoard => {
  const group = new THREE.Group();
  const size = high ? 2048 : 1024;
  const make = (px: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = px;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = high ? 8 : 4;
    return { c, t };
  };
  const road = make(size), top = make(256);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshStandardMaterial({ map: road.t, roughness: 0.82, metalness: 0, transparent: true, alphaTest: 0.05 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = ROAD_Y;
  plane.receiveShadow = true;
  group.add(plane);

  const side = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8 });
  const topMat = new THREE.MeshStandardMaterial({ map: top.t, roughness: 0.55, metalness: 0.05 });
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, ROAD_STEP, 1.8), [side, side, topMat, side, side, side]);
  step.position.set(0, ROAD_Y + ROAD_STEP / 2, 0);
  step.receiveShadow = true;
  step.castShadow = true;
  group.add(step);

  let key = "";
  const paint = (playing: ReadonlySet<Seat>) => {
    if (!hasDom) return;
    const k = `${[...playing].sort().join("")}|${SEATS.map(s => `${SEAT_INFO[s].main}${SEAT_INFO[s].light}${SEAT_INFO[s].dark}${SEAT_INFO[s].path}`).join("")}`;
    if (k === key) return;
    key = k;
    const g = road.c.getContext("2d"), g2 = top.c.getContext("2d");
    if (g) { paintRoadBoard(g, size, playing); road.t.needsUpdate = true; }
    if (g2) { paintCentreTop(g2, 256, playing); top.t.needsUpdate = true; }
  };
  return {
    group, paint,
    dispose: () => { plane.geometry.dispose(); (plane.material as THREE.Material).dispose(); step.geometry.dispose(); side.dispose(); topMat.dispose(); road.t.dispose(); top.t.dispose(); },
  };
};
