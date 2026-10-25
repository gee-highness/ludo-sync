import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { outlineOf } from "@/lib/client/pieceShapes";
import { shade, type ResolvedDesign } from "@/lib/client/pieces";
import { buildVehicle3D } from "./vehicles3d";

/** Pieces are built in the same units as the shipped model, which the scene shrinks to 0.42 of this. */
const S = 2.3;

export interface Built3D {
  /** Everything, with its feet at y = 0. */
  group: THREE.Group;
  /** Flat standing pieces turn to face the camera; the scene rotates this to stay facing it. */
  facing: THREE.Object3D | null;
  /** Set for vehicles: turn this about the vertical axis to point the nose (towards negative z) where it is going. */
  heading: THREE.Object3D | null;
  dispose: () => void;
}

const tex = (canvas: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** Draws the design's colours and pattern onto a canvas, in a box from -0.5 to 0.5 mapped onto the canvas. */
export const paintFace = (d: ResolvedDesign, withMark: boolean, size = 256): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.scale(size, size);
  g.translate(0.5, 0.5);
  const dark = shade(d.primary, -0.35), light = shade(d.secondary, 0.25);
  if (d.pattern === "gradient") {
    const grad = g.createRadialGradient(-0.15, -0.2, 0, 0, 0, 0.8);
    grad.addColorStop(0, light); grad.addColorStop(0.55, d.primary); grad.addColorStop(1, dark);
    g.fillStyle = grad;
  } else g.fillStyle = d.primary;
  g.fillRect(-0.5, -0.5, 1, 1);
  g.globalAlpha = 0.35 + 0.65 * d.patternStrength;
  g.fillStyle = d.secondary; g.strokeStyle = d.secondary;
  switch (d.pattern) {
    case "stripes":
      g.save(); g.rotate(0.61);
      for (let i = 0; i < 9; i++) g.fillRect(-0.8 + i * 0.2, -0.8, 0.09, 1.6);
      g.restore(); break;
    case "dots":
      for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(-0.4 + k * 0.2 + (r % 2) * 0.1, -0.4 + r * 0.2, 0.065, 0, Math.PI * 2); g.fill(); }
      break;
    case "checks":
      for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) if ((r + k) % 2) g.fillRect(-0.5 + k * 0.2, -0.5 + r * 0.2, 0.2, 0.2);
      break;
    case "rings":
      g.lineWidth = 0.07;
      for (const r of [0.1, 0.25, 0.4]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
      break;
    case "split": g.fillRect(-0.5, -0.5, 0.5, 1); break;
    case "zigzag":
      g.lineWidth = 0.1; g.beginPath();
      [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5].forEach((x, i) => { const y = 0.15 + (i % 2 ? -0.05 : -0.25) * 1.4; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke(); break;
    default: break;
  }
  g.globalAlpha = 1;
  if (d.finish === "metal") {
    const m = g.createLinearGradient(-0.5, -0.5, 0.5, 0.5);
    m.addColorStop(0, "rgba(255,255,255,.65)"); m.addColorStop(0.35, "rgba(255,255,255,0)"); m.addColorStop(0.65, "rgba(0,0,0,.15)");
    m.addColorStop(0.8, "rgba(255,255,255,.35)"); m.addColorStop(1, "rgba(0,0,0,.4)");
    g.fillStyle = m; g.fillRect(-0.5, -0.5, 1, 1);
  }
  if (withMark && d.mark) {
    g.font = `800 ${0.4 * d.markSize}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 0.03; g.strokeStyle = "rgba(0,0,0,.4)"; g.strokeText(d.mark, 0, 0.03);
    g.fillStyle = d.markColor; g.fillText(d.mark, 0, 0.03);
  }
  return c;
};

const halo = (colour: string, strength: number): THREE.Sprite => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, colour); grad.addColorStop(0.35, colour); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = 0.8 * strength; g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(3.4, 3.4, 1);
  sprite.renderOrder = 1;
  return sprite;
};

const markSprite = (d: ResolvedDesign): THREE.Sprite => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.font = `800 ${72 * d.markSize}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,.5)"; g.strokeText(d.mark, 64, 68);
  g.fillStyle = d.markColor; g.fillText(d.mark, 64, 68);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthTest: false }));
  sprite.scale.set(1.5, 1.5, 1);
  sprite.renderOrder = 5;
  return sprite;
};

const materialFor = (d: ResolvedDesign, map: THREE.Texture | null): THREE.MeshStandardMaterial => {
  const glow = d.glow ? new THREE.Color(d.glow) : new THREE.Color(d.primary);
  const m = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : d.primary, map, emissive: glow, emissiveIntensity: d.glow ? 0.15 + 0.6 * d.glowStrength : 0.16,
    roughness: d.finish === "matte" ? 0.9 : d.finish === "metal" ? 0.28 : d.finish === "glass" ? 0.08 : d.shine ? 0.28 : 0.55,
    metalness: d.finish === "metal" ? 0.35 : 0.04,
  });
  if (d.finish === "glass") { m.transparent = true; m.opacity = 0.75; }
  return m;
};

const sideMaterial = (d: ResolvedDesign): THREE.MeshStandardMaterial => {
  const m = materialFor({ ...d, glow: null }, null);
  m.color.set(d.outlineWidth > 0.05 && d.outline ? d.outline : shade(d.primary, -0.3));
  m.emissive.set(m.color);
  return m;
};

const pedestal = (d: ResolvedDesign): THREE.Mesh | null => {
  if (d.base === "none") return null;
  if (d.base === "ring") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 36), new THREE.MeshStandardMaterial({ color: d.secondary, emissive: d.secondary, emissiveIntensity: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
    return ring;
  }
  const plate = d.base === "plate";
  const m = new THREE.Mesh(new THREE.CylinderGeometry(plate ? 1.05 : 0.75, plate ? 1.1 : 0.8, plate ? 0.2 : 0.08, 32),
    new THREE.MeshStandardMaterial({ color: plate ? d.secondary : "#111827", roughness: 0.6, transparent: !plate, opacity: plate ? 1 : 0.35 }));
  m.position.y = plate ? 0.1 : 0.04;
  return m;
};

/** Lathe profiles (radius, height) for the pieces that are solids of revolution. */
const profiles = (depth: number): Record<string, [number, number][]> => {
  const h = 0.55 * depth;
  return {
    disc: [[0, 0], [0.88, 0], [0.97, 0.07], [0.97, h - 0.07], [0.88, h], [0, h]],
    cone: [[0, 0], [0.92, 0], [0.92, 0.1], [0.5, 1.0], [0.08, 2.1 * depth], [0, 2.15 * depth]],
    pawn: [[0, 0], [0.95, 0], [0.95, 0.2], [0.55, 0.4], [0.4, 0.9], [0.3, 1.3], [0.62, 1.4], [0.62, 1.55], [0.3, 1.65], [0.5, 1.8], [0.55, 2.05], [0.4, 2.3], [0.2, 2.42], [0, 2.45]],
  };
};

/** A piece as a 3D object, built from the same design the flat board draws. The "classic" shape is not built here: the scene uses its shipped model. */
export const buildPiece3D = (d: ResolvedDesign): Built3D => {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  let facing: THREE.Object3D | null = null;
  let heading: THREE.Object3D | null = null;
  const track = <T extends { dispose: () => void }>(x: T): T => { disposables.push(x); return x; };
  const shape = d.shape === "classic" ? "disc" : d.shape;

  if (d.glow && d.glowStrength > 0) {
    const h = halo(d.glow, d.glowStrength); h.position.y = 1.1; group.add(h);
    track(h.material); track(h.material.map!);
  }
  const base = pedestal(d);
  if (base) { group.add(base); track(base.geometry); track(base.material as THREE.Material); }

  if (d.vehicle !== "none") {
    const v = buildVehicle3D(d);
    disposables.push(v);
    const turner = new THREE.Group();
    turner.add(v.group);
    group.add(turner);
    heading = turner;
    return { group, facing: null, heading, dispose: () => { disposables.forEach(x => x.dispose()); } };
  }

  const revolve = shape === "disc" || shape === "cone" || shape === "pawn";
  if (revolve || shape === "cube" || shape === "donut") {
    const map = track(tex(paintFace(d, false)));
    const mat = track(materialFor(d, map));
    let geo: THREE.BufferGeometry;
    let height: number;
    if (revolve) {
      const prof = profiles(d.depth)[shape];
      geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
      height = prof[prof.length - 1][1];
    } else if (shape === "cube") {
      const side = 1.5;
      geo = new RoundedBoxGeometry(side, side * d.depth, side, 4, 0.14);
      geo.translate(0, (side * d.depth) / 2 + 0.05, 0);
      height = side * d.depth + 0.05;
    } else {
      geo = new THREE.TorusGeometry(0.7, 0.3 * d.depth + 0.1, 16, 40);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0.3 * d.depth + 0.15, 0);
      height = 0.6 * d.depth + 0.3;
    }
    track(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    group.add(mesh);
    if (d.mark) {
      const s = markSprite(d);
      s.position.set(0, Math.max(0.5, height * 0.55), 0);
      group.add(s);
      track(s.material); track(s.material.map!);
    }
  } else {
    const o = outlineOf(shape);
    const toShape = (pts: readonly (readonly [number, number])[]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * S, -y * S)));
    const sh = toShape(o.outer);
    for (const hole of o.holes ?? []) sh.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x * S, -y * S))));
    const depth = 0.45 * d.depth;
    const geo = track(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3, curveSegments: 6 }));
    const map = track(tex(paintFace(d, true)));
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.repeat.set(1 / (0.8 * S), 1 / (0.8 * S));
    map.offset.set(0.5, 0.5);
    const front = track(materialFor(d, map));
    const side = track(sideMaterial(d));
    const mesh = new THREE.Mesh(geo, [front, side]);
    mesh.castShadow = true;
    mesh.position.z = -depth / 2;
    const stand = new THREE.Group();
    stand.add(mesh);
    stand.position.y = 0.4 * S + 0.22;
    stand.rotation.x = -0.32; // leans back so the top-down camera still sees the face
    const turner = new THREE.Group();
    turner.add(stand);
    group.add(turner);
    facing = turner;
  }
  return {
    group, facing, heading,
    dispose: () => { disposables.forEach(x => x.dispose()); },
  };
};

