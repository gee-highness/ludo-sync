import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { shade, type ResolvedDesign, type VehicleId } from "@/lib/client/pieces";

/** Same scale as the other procedural pieces: the flat board's units times this. */
const S = 2.3;

type Kind = Exclude<VehicleId, "none">;
interface Car { body: [w: number, l: number, h: number]; cabin?: [w: number, l: number, h: number, z: number]; wheel: [r: number, x: number, zs: number[]]; glassFront?: boolean }

/** Sizes in the flat board's units (nose towards negative z). */
const CARS: Partial<Record<Kind, Car>> = {
  car: { body: [0.4, 0.76, 0.14], cabin: [0.3, 0.36, 0.12, 0.04], wheel: [0.085, 0.215, [-0.24, 0.24]] },
  sports: { body: [0.38, 0.82, 0.1], cabin: [0.26, 0.3, 0.09, 0.08], wheel: [0.09, 0.215, [-0.26, 0.25]] },
  taxi: { body: [0.4, 0.76, 0.14], cabin: [0.3, 0.36, 0.12, 0.04], wheel: [0.085, 0.215, [-0.24, 0.24]] },
  suv: { body: [0.46, 0.76, 0.18], cabin: [0.38, 0.46, 0.14, 0.08], wheel: [0.11, 0.245, [-0.25, 0.23]] },
  van: { body: [0.44, 0.8, 0.3], wheel: [0.1, 0.24, [-0.25, 0.25]], glassFront: true },
  bus: { body: [0.4, 0.86, 0.3], wheel: [0.1, 0.22, [-0.28, 0.27]], glassFront: true },
};

export interface Vehicle3D { group: THREE.Group; dispose: () => void }

export const buildVehicle3D = (d: ResolvedDesign): Vehicle3D => {
  const kind = d.vehicle as Kind;
  const group = new THREE.Group();
  const own: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => { own.push(x); return x; };
  const metal = d.finish === "metal", glassy = d.finish === "glass";
  const bodyMat = track(new THREE.MeshStandardMaterial({
    color: d.primary, roughness: d.finish === "matte" ? 0.85 : metal ? 0.3 : 0.25, metalness: metal ? 0.7 : 0.15,
    emissive: d.glow ?? d.primary, emissiveIntensity: d.glow ? 0.2 + 0.5 * d.glowStrength : 0.08, transparent: glassy, opacity: glassy ? 0.8 : 1,
  }));
  const trimMat = track(new THREE.MeshStandardMaterial({ color: d.secondary, roughness: 0.5, metalness: 0.1 }));
  const darkMat = track(new THREE.MeshStandardMaterial({ color: shade(d.primary, -0.55), roughness: 0.6 }));
  const glassMat = track(new THREE.MeshStandardMaterial({ color: "#0e1a2b", roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.92 }));
  const tyreMat = track(new THREE.MeshStandardMaterial({ color: "#16181d", roughness: 0.9 }));
  const lamp = track(new THREE.MeshBasicMaterial({ color: d.headlights ? "#fff7c2" : "#cbd5e1", toneMapped: false }));
  const tail = track(new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false }));

  const box = (mat: THREE.Material, w: number, h: number, l: number, x: number, y: number, z: number, r = 0.02) => {
    const g = track(new RoundedBoxGeometry(w * S, h * S, l * S, 2, Math.min(r, w / 2.2, h / 2.2, l / 2.2) * S));
    const m = new THREE.Mesh(g, mat);
    m.position.set(x * S, y * S, z * S);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const wheel = (r: number, w: number, x: number, z: number) => {
    const g = track(new THREE.CylinderGeometry(r * S, r * S, w * S, 16));
    g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, tyreMat);
    m.position.set(x * S, r * S, z * S);
    m.castShadow = true;
    group.add(m);
  };
  const ball = (mat: THREE.Material, r: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(track(new THREE.SphereGeometry(r * S, 12, 10)), mat);
    m.position.set(x * S, y * S, z * S);
    group.add(m);
  };

  let roofY = 0.3, roofZ = 0, rearZ = 0.4, bodyW = 0.4;
  const car = CARS[kind];
  if (car) {
    const [w, l, h] = car.body;
    const [r, wx, zs] = car.wheel;
    const lift = r * 0.9;
    zs.forEach(z => { wheel(r, 0.07, -wx, z); wheel(r, 0.07, wx, z); });
    box(bodyMat, w, h, l, 0, lift + h / 2, 0, 0.05);
    let top = lift + h;
    if (car.cabin) {
      const [cw, cl, ch, cz] = car.cabin;
      box(glassMat, cw, ch, cl, 0, top + ch / 2, cz, 0.04);
      box(bodyMat, cw + 0.01, 0.025, cl + 0.02, 0, top + ch + 0.012, cz, 0.02);
      top += ch + 0.025; roofZ = cz;
    } else if (car.glassFront) {
      box(glassMat, w * 0.86, h * 0.45, 0.08, 0, lift + h * 0.68, -l / 2 + 0.07, 0.02);
      if (kind === "bus") for (const s of [-1, 1]) box(glassMat, 0.012, 0.09, l * 0.7, s * (w / 2 + 0.004), lift + h * 0.62, 0.04, 0.005);
    }
    if (d.pattern === "stripes") for (const x of [-0.06, 0.06]) box(trimMat, 0.05, 0.012, l * 0.97, x, top + 0.004, 0, 0.004);
    if (d.pattern === "split") box(trimMat, w * 0.48, 0.012, l * 0.97, -w / 4, top + 0.004, 0, 0.004);
    if (kind === "taxi") box(trimMat, 0.14, 0.05, 0.07, 0, top + 0.03, roofZ, 0.015);
    for (const s of [-1, 1]) { box(lamp, 0.07, 0.04, 0.02, s * (w / 2 - 0.07), lift + h * 0.55, -l / 2, 0.01); box(tail, 0.07, 0.035, 0.02, s * (w / 2 - 0.07), lift + h * 0.55, l / 2, 0.01); }
    roofY = top; rearZ = l / 2; bodyW = w;
  } else if (kind === "truck") {
    for (const z of [-0.3, 0.14, 0.3]) { wheel(0.11, 0.08, -0.25, z); wheel(0.11, 0.08, 0.25, z); }
    box(bodyMat, 0.4, 0.22, 0.3, 0, 0.1 + 0.11, -0.27, 0.05);
    box(glassMat, 0.32, 0.09, 0.12, 0, 0.1 + 0.2, -0.33, 0.02);
    box(darkMat, 0.44, 0.04, 0.52, 0, 0.14, 0.16, 0.01);
    box(bodyMat, 0.44, 0.26, 0.5, 0, 0.16 + 0.13, 0.16, 0.03);
    if (d.pattern === "stripes") box(trimMat, 0.46, 0.05, 0.4, 0, 0.3, 0.16, 0.01);
    for (const s of [-1, 1]) { box(lamp, 0.07, 0.04, 0.02, s * 0.14, 0.2, -0.42, 0.01); box(tail, 0.07, 0.04, 0.02, s * 0.16, 0.22, 0.42, 0.01); }
    roofY = 0.32; roofZ = -0.27; rearZ = 0.42; bodyW = 0.44;
  } else if (kind === "tuktuk") {
    wheel(0.08, 0.06, 0, -0.34); wheel(0.09, 0.07, -0.22, 0.2); wheel(0.09, 0.07, 0.22, 0.2);
    box(bodyMat, 0.36, 0.14, 0.52, 0, 0.17, 0.08, 0.05);
    box(bodyMat, 0.14, 0.1, 0.22, 0, 0.16, -0.27, 0.04);
    box(glassMat, 0.3, 0.14, 0.1, 0, 0.32, -0.1, 0.02);
    box(trimMat, 0.38, 0.03, 0.44, 0, 0.42, 0.1, 0.03);
    box(lamp, 0.05, 0.05, 0.02, 0, 0.2, -0.39, 0.01);
    box(tail, 0.1, 0.04, 0.02, 0, 0.2, 0.34, 0.01);
    roofY = 0.44; roofZ = 0.1; rearZ = 0.34; bodyW = 0.38;
  } else {
    // two-wheelers: a rider on a narrow frame
    const bike = kind === "bicycle", scoot = kind === "scooter";
    const r = bike ? 0.11 : scoot ? 0.075 : 0.1, wz = bike ? 0.3 : scoot ? 0.27 : 0.3, ww = bike ? 0.03 : scoot ? 0.06 : 0.07;
    wheel(r, ww, 0, -wz); wheel(r, ww, 0, wz);
    box(bike ? darkMat : bodyMat, bike ? 0.035 : 0.12, bike ? 0.04 : 0.1, scoot ? 0.5 : 0.56, 0, r + 0.06, 0, 0.02);
    if (!bike) box(bodyMat, 0.14, 0.09, 0.22, 0, r + 0.14, -0.1, 0.04);
    box(darkMat, 0.4, 0.03, 0.03, 0, r + 0.26, -0.2, 0.01); // handlebars
    box(darkMat, 0.025, 0.2, 0.025, 0, r + 0.16, -0.22, 0.005);
    box(darkMat, 0.1, 0.03, 0.2, 0, r + 0.2, 0.12, 0.01); // seat
    box(darkMat, 0.17, 0.16, 0.1, 0, r + 0.33, 0.03, 0.04); // torso
    ball(trimMat, 0.075, 0, r + 0.5, 0.0); // helmet
    box(lamp, 0.05, 0.04, 0.02, 0, r + 0.2, -0.3, 0.01);
    roofY = r + 0.5; roofZ = 0.03; rearZ = wz + 0.1; bodyW = 0.2;
  }

  // roof extras
  const A = d.accessory;
  if (A === "siren") {
    const red = track(new THREE.MeshBasicMaterial({ color: "#ef4444", toneMapped: false })), blue = track(new THREE.MeshBasicMaterial({ color: "#3b82f6", toneMapped: false }));
    box(darkMat, 0.22, 0.03, 0.07, 0, roofY + 0.015, roofZ, 0.01);
    box(red, 0.1, 0.045, 0.06, -0.055, roofY + 0.045, roofZ, 0.015);
    box(blue, 0.1, 0.045, 0.06, 0.055, roofY + 0.045, roofZ, 0.015);
  } else if (A === "spoiler") {
    box(darkMat, 0.34, 0.025, 0.07, 0, roofY * 0.8, rearZ - 0.03, 0.01);
    for (const s of [-1, 1]) box(darkMat, 0.025, 0.07, 0.05, s * 0.12, roofY * 0.55, rearZ - 0.03, 0.005);
  } else if (A === "rack") {
    for (const s of [-1, 1]) box(darkMat, 0.02, 0.03, 0.22, s * 0.1, roofY + 0.03, roofZ, 0.005);
    for (const z of [-0.1, 0.1]) box(darkMat, 0.2, 0.02, 0.02, 0, roofY + 0.03, roofZ + z, 0.005);
  } else if (A === "flag") {
    box(darkMat, 0.012, 0.22, 0.012, bodyW * 0.3, roofY + 0.11, roofZ, 0.004);
    box(trimMat, 0.01, 0.07, 0.12, bodyW * 0.3, roofY + 0.2, roofZ + 0.07, 0.003);
  } else if (A === "box") {
    box(trimMat, 0.26, 0.14, 0.22, 0, roofY + 0.07, roofZ, 0.02);
  }
  if (d.mark) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.font = `800 ${72 * d.markSize}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,.5)"; g.strokeText(d.mark, 64, 68);
    g.fillStyle = d.markColor; g.fillText(d.mark, 64, 68);
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    const m = track(new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
    const p = new THREE.Mesh(track(new THREE.PlaneGeometry(0.3 * S, 0.3 * S)), m);
    p.rotation.x = -Math.PI / 2;
    p.position.set(0, (roofY + (A === "none" ? 0.03 : 0.2)) * S, roofZ * S);
    group.add(p);
  }
  return { group, dispose: () => own.forEach(x => x.dispose()) };
};
