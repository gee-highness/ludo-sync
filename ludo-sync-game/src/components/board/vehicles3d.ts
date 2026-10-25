import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { shade, type AccessoryId, type ResolvedDesign, type VehicleId } from "@/lib/client/pieces";

/** Same scale as the other procedural pieces: the flat board's units times this. */
const S = 2.3 * 1.18;

type Kind = Exclude<VehicleId, "none">;
type P2 = [z: number, y: number];

export interface Vehicle3D {
  group: THREE.Group;
  /** Wheels, each a group that turns about its own x axis, so the scene can roll them as the vehicle travels. */
  wheels: THREE.Object3D[];
  /** Rough wheel radius in the vehicle's own units, to turn the wheels the right amount. */
  wheelRadius: number;
  dispose: () => void;
}

const hasDom = typeof document !== "undefined";

/** Rounds the corners of a closed outline by cutting each one off twice, so car silhouettes read as soft pressed steel rather than polygons. */
const soften = (pts: P2[], rounds = 2): P2[] => {
  let cur = pts;
  for (let r = 0; r < rounds; r++) {
    const next: P2[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    cur = next;
  }
  return cur;
};

let haloTexture: THREE.CanvasTexture | null = null;
const halo = (): THREE.CanvasTexture | null => {
  if (!hasDom) return null;
  if (haloTexture) return haloTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,247,194,1)"); grad.addColorStop(0.35, "rgba(255,247,194,.45)"); grad.addColorStop(1, "rgba(255,247,194,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(c);
  return haloTexture;
};

export const buildVehicle3D = (d: ResolvedDesign): Vehicle3D => {
  const kind = d.vehicle as Kind;
  const group = new THREE.Group();
  const own: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => { own.push(x); return x; };
  const wheels: THREE.Object3D[] = [];
  const metal = d.finish === "metal", glassy = d.finish === "glass", matte = d.finish === "matte";

  // ---- materials -----------------------------------------------------------------------------------------------
  const M = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o }));
  const paint = M(d.primary, {
    roughness: matte ? 0.85 : metal ? 0.28 : 0.24, metalness: metal ? 0.75 : matte ? 0.02 : 0.3,
    emissive: d.glow ?? d.primary, emissiveIntensity: d.glow ? 0.2 + 0.5 * d.glowStrength : 0.05, transparent: glassy, opacity: glassy ? 0.82 : 1,
  });
  const trim = M(d.secondary, { roughness: 0.4, metalness: 0.2 });
  const dark = M(shade(d.primary, -0.6), { roughness: 0.55 });
  const glass = M("#28425e", { roughness: 0.05, metalness: 0.55, transparent: true, opacity: 0.5, depthWrite: false, emissive: "#0c1c30", emissiveIntensity: 0.35 });
  const rubber = M("#14161a", { roughness: 0.95 });
  const chrome = M("#d7dce4", { roughness: 0.18, metalness: 0.95 });
  const plastic = M("#252a33", { roughness: 0.5 });
  const lamp = track(new THREE.MeshBasicMaterial({ color: d.headlights ? "#fff7c2" : "#bcc4d0", toneMapped: false }));
  const tail = track(new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false }));
  const amber = track(new THREE.MeshBasicMaterial({ color: "#ffb02e", toneMapped: false }));

  // ---- geometry helpers ----------------------------------------------------------------------------------------
  const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, parent: THREE.Object3D = group): T => { o.position.set(x, y, z); parent.add(o); return o; };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    return put(m, x, y, z);
  };
  const box = (mat: THREE.Material, w: number, h: number, l: number, x: number, y: number, z: number, r = 0.012) =>
    mesh(new RoundedBoxGeometry(w, h, l, 2, Math.max(0.001, Math.min(r, w / 2.1, h / 2.1, l / 2.1))), mat, x, y, z);
  /** A side-view outline (z along the vehicle, y up) pushed out sideways to a width, centred on x = 0. */
  const slab = (mat: THREE.Material, pts: P2[], width: number, x = 0, bevel = 0.012, smooth = true): THREE.Mesh => {
    const outline = smooth ? soften(pts) : pts;
    const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
    const depth = Math.max(0.002, width - bevel * 2);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, -depth / 2);
    geo.rotateY(-Math.PI / 2);
    geo.computeVertexNormals();
    return mesh(geo, mat, x, 0, 0);
  };
  const cyl = (mat: THREE.Material, r: number, len: number, x: number, y: number, z: number, axis: "x" | "y" | "z" = "y", seg = 12) => {
    const geo = new THREE.CylinderGeometry(r, r, len, seg);
    if (axis === "x") geo.rotateZ(Math.PI / 2); else if (axis === "z") geo.rotateX(Math.PI / 2);
    return mesh(geo, mat, x, y, z);
  };
  const ball = (mat: THREE.Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = mesh(new THREE.SphereGeometry(r, 14, 10), mat, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  /** A rod between two points. */
  const tube = (mat: THREE.Material, a: [number, number, number], b: [number, number, number], r: number) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return m;
  };
  const capsule = (mat: THREE.Material, a: [number, number, number], b: [number, number, number], r: number) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = Math.max(0.001, va.distanceTo(vb) - r * 2);
    const m = mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return m;
  };
  /** A flat strip that follows a side-view path (hood, roof, boot), for racing stripes and two-tone paint. */
  const ribbon = (mat: THREE.Material, path: P2[], x0: number, x1: number) => {
    const pos: number[] = [], idx: number[] = [];
    path.forEach(([z, y], i) => { pos.push(x0, y + 0.0015, z, x1, y + 0.0015, z); if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    track(g);
    group.add(m);
    return m;
  };
  const wheel = (r: number, w: number, x: number, z: number, y = r) => {
    const g = new THREE.Group();
    const tyreGeo = new THREE.CylinderGeometry(r, r, w, 24); tyreGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 1.04, 20); rimGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 1.1, 10); hubGeo.rotateZ(Math.PI / 2);
    track(tyreGeo); track(rimGeo); track(hubGeo);
    const tyre = new THREE.Mesh(tyreGeo, rubber); tyre.castShadow = true;
    g.add(tyre, new THREE.Mesh(rimGeo, chrome), new THREE.Mesh(hubGeo, plastic));
    // spokes show the wheel turning
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.BoxGeometry(w * 1.06, r * 0.5, r * 0.09);
      track(sp);
      const s = new THREE.Mesh(sp, plastic);
      s.position.y = Math.cos(0) * 0; s.rotation.x = (k / 5) * Math.PI;
      g.add(s);
    }
    put(g, x, y, z);
    wheels.push(g);
    return g;
  };
  /** A dark disc round a wheel on the side of the body, so the tyre sits in an arch. */
  const arch = (r: number, x: number, z: number, y = r) => { const side = Math.sign(x) || 1; cyl(plastic, r * 1.2, 0.012, side * (Math.abs(x) - 0.004), y, z, "x", 18); };
  const headlamp = (x: number, y: number, z: number, r = 0.032) => {
    const m = mesh(new THREE.CylinderGeometry(r, r, 0.014, 14).rotateX(Math.PI / 2), lamp, x, y, z - 0.004, false);
    if (d.headlights) { const tex = halo(); if (tex) { const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }))); sp.scale.set(0.14, 0.14, 1); put(sp, x, y, z - 0.03); } }
    return m;
  };
  const taillamp = (x: number, y: number, z: number, w = 0.07, h = 0.026) => box(tail, w, h, 0.012, x, y, z, 0.006);
  const mirror = (x: number, y: number, z: number) => { box(paint, 0.034, 0.026, 0.03, x, y, z, 0.01); tube(plastic, [x * 0.9, y - 0.008, z], [x * 0.7, y - 0.012, z], 0.004); };
  const seam = (x: number, y: number, z: number, h: number) => box(dark, 0.003, h, 0.004, x, y, z, 0.001);
  const handle = (x: number, y: number, z: number) => box(chrome, 0.005, 0.008, 0.026, x, y, z, 0.002);
  const plate = (y: number, z: number, front = false) => box(M("#f4f4f2"), 0.09, 0.034, 0.006, 0, y, z + (front ? -0.003 : 0.003), 0.003);

  let roofY = 0.31, roofZ = 0.04, bodyW = 0.4, rearZ = 0.4, rearY = 0.2, wheelR = 0.095;
  const stripes: { path: P2[]; x0: number; x1: number }[] = [];

  /** The common four-wheeler: a smoothed lower body, a glass greenhouse with pillars and a roof cap, wheels in arches, lamps, mirrors and doors. */
  const car = (o: { hull: P2[]; w: number; house: P2[]; houseW: number; roof: [number, number, number]; wheelR: number; wheelX: number; zs: [number, number]; wheelW: number; mirrorZ: number; doors: number[]; sill: number; top: number; path: P2[][]; roofPath: P2[]; lampY: number; grille?: boolean; height?: number }) => {
    slab(paint, o.hull, o.w, 0, 0.012);
    const [rz0, rz1, ry] = o.roof;
    slab(glass, o.house, o.houseW, 0, 0.006, false);
    // the player's own token in the driver's seat, seen through the windows
    const seatZ = (o.house[0][0] + o.house[o.house.length - 1][0]) / 2, seatY = (o.sill + o.roof[2]) / 2;
    cyl(trim, 0.045, 0.09, 0, seatY - 0.055, seatZ);
    ball(trim, 0.04, 0, seatY + 0.012, seatZ);
    box(paint, o.houseW + 0.014, 0.014, rz1 - rz0 + 0.02, 0, ry + 0.003, (rz0 + rz1) / 2, 0.006);
    // pillars: the front, middle and rear ones frame the windows
    const base = o.sill;
    const xs = o.houseW / 2 + 0.002;
    const front = o.house[0], rear = o.house[o.house.length - 1];
    for (const sx of [-1, 1]) {
      tube(paint, [sx * xs, base, front[0]], [sx * xs, ry, rz0 + 0.005], 0.0085);
      tube(paint, [sx * xs, base, rear[0]], [sx * xs, ry, rz1 - 0.005], 0.0095);
      const mid = (rz0 + rz1) / 2 + 0.01;
      box(paint, 0.012, ry - base, 0.014, sx * xs, (ry + base) / 2, mid, 0.004);
    }
    for (const sx of [-1, 1]) {
      arch(o.wheelR, sx * (o.w / 2), o.zs[0]); arch(o.wheelR, sx * (o.w / 2), o.zs[1]);
      wheel(o.wheelR, o.wheelW, sx * (o.w / 2 - o.wheelW * 0.2), o.zs[0]); wheel(o.wheelR, o.wheelW, sx * (o.w / 2 - o.wheelW * 0.2), o.zs[1]);
      mirror(sx * (o.houseW / 2 + 0.03), base + 0.006, o.mirrorZ);
      for (const dz of o.doors) seam(sx * (o.w / 2 + 0.001), (o.sill + 0.08) / 2 + 0.02, dz, o.sill - 0.08);
      handle(sx * (o.w / 2 + 0.003), o.sill - 0.03, o.doors[0] + 0.045);
      headlamp(sx * (o.w / 2 - 0.075), o.lampY, o.hull[0][0] + 0.002);
      taillamp(sx * (o.w / 2 - 0.08), o.lampY + 0.005, o.hull[o.hull.length - 1][0] - 0.002);
    }
    if (o.grille !== false) box(plastic, o.w * 0.5, 0.032, 0.01, 0, o.lampY - 0.008, o.hull[0][0] + 0.002, 0.005);
    box(chrome, o.w * 0.92, 0.012, 0.016, 0, o.hull[0][1] + 0.008, o.hull[0][0] + 0.004, 0.005);
    box(chrome, o.w * 0.92, 0.012, 0.016, 0, o.hull[o.hull.length - 1][1] + 0.008, o.hull[o.hull.length - 1][0] - 0.004, 0.005);
    plate(o.hull[o.hull.length - 1][1] + 0.05, o.hull[o.hull.length - 1][0]);
    plate(o.hull[0][1] + 0.025, o.hull[0][0], true);
    for (const p of o.path) stripes.push({ path: p, x0: -0.05, x1: 0.05 });
    stripes.push({ path: o.roofPath, x0: -0.05, x1: 0.05 });
    roofY = ry + 0.012; roofZ = (rz0 + rz1) / 2; bodyW = o.w; rearZ = o.hull[o.hull.length - 1][0]; rearY = o.top; wheelR = o.wheelR;
  };

  if (kind === "car" || kind === "taxi") {
    car({
      hull: [[-0.385, 0.07], [-0.385, 0.135], [-0.34, 0.178], [-0.2, 0.196], [0.2, 0.2], [0.34, 0.186], [0.385, 0.15], [0.385, 0.07]], w: 0.4,
      house: [[-0.14, 0.196], [-0.065, 0.305], [0.13, 0.305], [0.235, 0.196]], houseW: 0.34, roof: [-0.065, 0.13, 0.306], wheelR: 0.088, wheelX: 0.2, zs: [-0.245, 0.245], wheelW: 0.07,
      mirrorZ: -0.12, doors: [-0.03, 0.12], sill: 0.196, top: 0.2, lampY: 0.15,
      path: [[[-0.38, 0.15], [-0.34, 0.18], [-0.2, 0.197], [-0.13, 0.201]], [[0.2, 0.201], [0.34, 0.187], [0.382, 0.152]]], roofPath: [[-0.06, 0.32], [0.13, 0.32]],
    });
    if (kind === "taxi") {
      box(M("#fff7c2", { emissive: "#fff2a0", emissiveIntensity: 0.9 }), 0.13, 0.034, 0.06, 0, roofY + 0.022, roofZ, 0.012);
      box(amber, 0.1, 0.012, 0.004, 0, roofY + 0.024, roofZ - 0.031, 0.002);
      // a chequered belt along both sides
      for (const sx of [-1, 1]) for (let k = 0; k < 14; k++) box(k % 2 ? M("#101010") : M("#f4f4f2"), 0.004, 0.012, 0.0535, sx * 0.2015, 0.145, -0.3 + k * 0.0535 + 0.026, 0.001);
    }
  } else if (kind === "sports") {
    car({
      hull: [[-0.415, 0.065], [-0.415, 0.105], [-0.32, 0.148], [-0.12, 0.172], [0.22, 0.172], [0.36, 0.155], [0.415, 0.118], [0.415, 0.065]], w: 0.38,
      house: [[-0.04, 0.17], [0.045, 0.255], [0.18, 0.255], [0.29, 0.172]], houseW: 0.3, roof: [0.04, 0.185, 0.256], wheelR: 0.088, wheelX: 0.2, zs: [-0.265, 0.25], wheelW: 0.08,
      mirrorZ: -0.01, doors: [0.09], sill: 0.17, top: 0.172, lampY: 0.118, grille: false,
      path: [[[-0.41, 0.12], [-0.32, 0.15], [-0.12, 0.174], [-0.04, 0.178]], [[0.22, 0.174], [0.36, 0.157], [0.412, 0.12]]], roofPath: [[0.045, 0.269], [0.185, 0.269]],
    });
    // intakes and a splitter
    for (const sx of [-1, 1]) box(plastic, 0.004, 0.026, 0.1, sx * 0.1915, 0.12, 0.06, 0.002);
    box(plastic, 0.3, 0.012, 0.04, 0, 0.07, -0.41, 0.005);
    box(plastic, 0.2, 0.02, 0.01, 0, 0.1, -0.415, 0.004);
  } else if (kind === "suv") {
    car({
      hull: [[-0.385, 0.085], [-0.385, 0.175], [-0.345, 0.22], [-0.2, 0.236], [0.34, 0.236], [0.385, 0.205], [0.385, 0.085]], w: 0.46,
      house: [[-0.2, 0.234], [-0.125, 0.37], [0.3, 0.37], [0.36, 0.234]], houseW: 0.4, roof: [-0.125, 0.3, 0.371], wheelR: 0.105, wheelX: 0.23, zs: [-0.25, 0.25], wheelW: 0.085,
      mirrorZ: -0.16, doors: [-0.05, 0.12], sill: 0.234, top: 0.236, lampY: 0.17,
      path: [[[-0.38, 0.18], [-0.34, 0.222], [-0.2, 0.238], [-0.2, 0.238]]], roofPath: [[-0.12, 0.385], [0.3, 0.385]],
    });
    for (const sx of [-1, 1]) tube(chrome, [sx * 0.15, roofY + 0.012, -0.1], [sx * 0.15, roofY + 0.012, 0.28], 0.007); // roof rails
    box(plastic, 0.2, 0.026, 0.012, 0, 0.12, 0.392, 0.005); // rear spare
    for (const sx of [-1, 1]) box(plastic, 0.012, 0.03, 0.26, sx * 0.233, 0.1, 0, 0.005); // skirts
  } else if (kind === "van") {
    slab(paint, [[-0.4, 0.07], [-0.4, 0.2], [-0.365, 0.265], [-0.27, 0.355], [-0.19, 0.43], [0.39, 0.43], [0.4, 0.4], [0.4, 0.07]], 0.44, 0, 0.012);
    slab(glass, [[-0.352, 0.278], [-0.222, 0.408], [-0.2303, 0.4166], [-0.3603, 0.2866]], 0.38, 0, 0.004, false);
    for (const sx of [-1, 1]) {
      box(glass, 0.004, 0.09, 0.15, sx * 0.2205, 0.34, -0.17, 0.004);
      seam(sx * 0.2215, 0.25, -0.07, 0.35); seam(sx * 0.2215, 0.25, 0.14, 0.35);
      handle(sx * 0.2235, 0.25, 0.04);
      arch(0.1, sx * 0.22, -0.26); arch(0.1, sx * 0.22, 0.26);
      wheel(0.1, 0.075, sx * 0.205, -0.26); wheel(0.1, 0.075, sx * 0.205, 0.26);
      mirror(sx * 0.255, 0.35, -0.25);
      headlamp(sx * 0.15, 0.17, -0.398); taillamp(sx * 0.17, 0.28, 0.4);
    }
    box(plastic, 0.22, 0.036, 0.01, 0, 0.165, -0.401, 0.005);
    box(chrome, 0.4, 0.012, 0.016, 0, 0.09, -0.4, 0.005); box(plastic, 0.4, 0.016, 0.016, 0, 0.09, 0.4, 0.005);
    seam(0, 0.25, 0.4, 0.34);
    plate(0.15, 0.4); plate(0.12, -0.4, true);
    roofY = 0.43; roofZ = 0.1; bodyW = 0.44; rearZ = 0.4; rearY = 0.43; wheelR = 0.1;
    stripes.push({ path: [[-0.18, 0.431], [0.39, 0.431]], x0: -0.05, x1: 0.05 });
  } else if (kind === "bus") {
    box(paint, 0.4, 0.34, 0.86, 0, 0.23, 0, 0.035);
    box(trim, 0.4, 0.022, 0.862, 0, 0.19, 0, 0.008); // a belt line in the second colour
    box(glass, 0.34, 0.14, 0.006, 0, 0.3, -0.431, 0.01); // windscreen
    box(M("#1a1208", { emissive: "#ffb02e", emissiveIntensity: 0.85 }), 0.26, 0.036, 0.006, 0, 0.395, -0.431, 0.008); // destination board
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 6; k++) box(glass, 0.004, 0.1, 0.095, sx * 0.201, 0.31, -0.3 + k * 0.125 + (k > 2 ? 0.04 : 0), 0.008);
      box(plastic, 0.005, 0.2, 0.11, sx * 0.2015, 0.22, -0.31 + 0.02, 0.006); // door
      arch(0.1, sx * 0.2, -0.29); arch(0.1, sx * 0.2, 0.27);
      wheel(0.1, 0.075, sx * 0.185, -0.29); wheel(0.1, 0.075, sx * 0.185, 0.27);
      mirror(sx * 0.235, 0.36, -0.4);
      headlamp(sx * 0.14, 0.15, -0.431); taillamp(sx * 0.15, 0.22, 0.431);
    }
    box(M("#c9cfd8", { roughness: 0.5 }), 0.16, 0.034, 0.16, 0, 0.42, 0.12, 0.012); // roof unit
    box(plastic, 0.3, 0.03, 0.01, 0, 0.12, -0.432, 0.005);
    plate(0.14, 0.43); plate(0.1, -0.43, true);
    roofY = 0.4; roofZ = -0.05; bodyW = 0.4; rearZ = 0.43; rearY = 0.4; wheelR = 0.1;
    stripes.push({ path: [[-0.4, 0.4], [0.4, 0.4]], x0: -0.05, x1: 0.05 });
  } else if (kind === "truck") {
    // chassis, cab, cargo box
    box(dark, 0.34, 0.07, 0.86, 0, 0.115, 0.0, 0.01);
    slab(paint, [[-0.42, 0.14], [-0.42, 0.22], [-0.395, 0.285], [-0.34, 0.385], [-0.28, 0.43], [-0.16, 0.43], [-0.115, 0.38], [-0.115, 0.14]], 0.38, 0, 0.012);
    slab(glass, [[-0.385, 0.3], [-0.31, 0.405], [-0.3198, 0.412], [-0.3948, 0.307]], 0.34, 0, 0.004, false);
    for (const sx of [-1, 1]) {
      box(glass, 0.004, 0.09, 0.14, sx * 0.1915, 0.34, -0.22, 0.004);
      seam(sx * 0.1925, 0.26, -0.15, 0.2);
      mirror(sx * 0.23, 0.36, -0.36);
      headlamp(sx * 0.12, 0.2, -0.419); taillamp(sx * 0.16, 0.2, 0.42);
      cyl(chrome, 0.012, 0.2, sx * 0.205, 0.3, -0.1, "y", 8); // exhaust stack
      cyl(chrome, 0.05, 0.12, sx * 0.17, 0.12, -0.05, "x", 14); // fuel tank
    }
    box(plastic, 0.24, 0.07, 0.012, 0, 0.19, -0.422, 0.006);
    box(chrome, 0.36, 0.014, 0.02, 0, 0.14, -0.42, 0.006);
    box(paint, 0.44, 0.34, 0.5, 0, 0.3, 0.17, 0.02);
    box(trim, 0.446, 0.02, 0.504, 0, 0.145, 0.17, 0.006);
    for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) box(dark, 0.006, 0.3, 0.012, sx * 0.222, 0.3, -0.04 + k * 0.1, 0.002);
    for (const z of [-0.28, 0.14, 0.31]) for (const sx of [-1, 1]) {
      cyl(plastic, 0.12, 0.012, sx * 0.19, 0.1, z, "x", 18);
      wheel(0.1, 0.085, sx * 0.205, z);
    }
    box(chrome, 0.06, 0.02, 0.01, 0, 0.17, 0.425, 0.004);
    plate(0.2, 0.42);
    roofY = 0.43; roofZ = -0.22; bodyW = 0.44; rearZ = 0.42; rearY = 0.47; wheelR = 0.1;
  } else if (kind === "tuktuk") {
    // front wheel on a fork, a cowl, a bench seat and a canopy on four posts
    wheel(0.078, 0.06, 0, -0.34);
    tube(chrome, [-0.03, 0.078, -0.34], [-0.03, 0.26, -0.3], 0.008); tube(chrome, [0.03, 0.078, -0.34], [0.03, 0.26, -0.3], 0.008);
    box(paint, 0.09, 0.012, 0.14, 0, 0.17, -0.34, 0.006); // mudguard
    slab(paint, [[-0.31, 0.12], [-0.31, 0.24], [-0.24, 0.31], [-0.13, 0.31], [-0.1, 0.2], [-0.1, 0.12]], 0.16, 0, 0.012);
    headlamp(0, 0.27, -0.305, 0.036);
    box(paint, 0.34, 0.1, 0.4, 0, 0.17, 0.14, 0.03);
    box(trim, 0.342, 0.016, 0.402, 0, 0.145, 0.14, 0.006);
    box(plastic, 0.3, 0.07, 0.12, 0, 0.255, 0.27, 0.02); // seat back
    box(plastic, 0.3, 0.04, 0.2, 0, 0.23, 0.14, 0.015); // seat
    for (const sx of [-1, 1]) {
      arch(0.09, sx * 0.17, 0.24, 0.09); wheel(0.09, 0.07, sx * 0.19, 0.24);
      tube(chrome, [sx * 0.165, 0.22, -0.04], [sx * 0.165, 0.46, -0.04], 0.008); tube(chrome, [sx * 0.165, 0.22, 0.34], [sx * 0.165, 0.46, 0.34], 0.008);
      taillamp(sx * 0.12, 0.2, 0.342, 0.05);
    }
    box(glass, 0.3, 0.14, 0.008, 0, 0.38, -0.05, 0.004); // windscreen
    box(paint, 0.38, 0.03, 0.44, 0, 0.47, 0.15, 0.014); // canopy
    box(trim, 0.386, 0.012, 0.446, 0, 0.456, 0.15, 0.005);
    tube(chrome, [0, 0.3, -0.3], [0, 0.36, -0.3], 0.005);
    box(chrome, 0.12, 0.014, 0.012, 0, 0.36, -0.3, 0.005); // handlebar
    roofY = 0.485; roofZ = 0.15; bodyW = 0.38; rearZ = 0.35; rearY = 0.2; wheelR = 0.09;
    stripes.push({ path: [[-0.05, 0.486], [0.34, 0.486]], x0: -0.05, x1: 0.05 });
  } else {
    // the two-wheelers
    const bike = kind === "bicycle", scoot = kind === "scooter";
    const r = bike ? 0.115 : scoot ? 0.08 : 0.105, wz = bike ? 0.3 : scoot ? 0.27 : 0.31;
    const ww = bike ? 0.026 : scoot ? 0.06 : 0.068;
    const suit = M(shade(d.primary, -0.5), { roughness: 0.7 });
    const helmet = M(d.secondary, { roughness: 0.25, metalness: 0.2 });
    wheel(r, ww, 0, -wz, r); wheel(r, ww, 0, wz, r);
    if (bike) {
      for (const z of [-wz, wz]) { const t = mesh(new THREE.TorusGeometry(r * 0.98, 0.006, 6, 28).rotateY(Math.PI / 2), chrome, 0, r, z); t.castShadow = false; }
      const bb: [number, number, number] = [0, 0.14, 0.04], seatTop: [number, number, number] = [0, 0.34, 0.1], head: [number, number, number] = [0, 0.33, -0.17], top: [number, number, number] = [0, 0.325, 0.09];
      tube(paint, bb, seatTop, 0.009); tube(paint, bb, head, 0.011); tube(paint, top, head, 0.01); tube(paint, seatTop, [0, r, wz], 0.007); tube(paint, bb, [0, r, wz], 0.007);
      tube(chrome, head, [0, r, -wz], 0.007); tube(chrome, head, [0, 0.4, -0.18], 0.008);
      tube(plastic, [-0.15, 0.4, -0.18], [0.15, 0.4, -0.18], 0.007);
      for (const sx of [-1, 1]) box(plastic, 0.02, 0.016, 0.03, sx * 0.152, 0.4, -0.18, 0.006);
      box(plastic, 0.04, 0.014, 0.1, 0, 0.355, 0.11, 0.006); // saddle
      cyl(chrome, 0.04, 0.008, 0.02, 0.14, 0.04, "x", 16); // chainring
      for (const sx of [-1, 1]) { tube(plastic, [sx * 0.03, 0.14, 0.04], [sx * 0.03, 0.09 + sx * 0.04, 0.04 + sx * 0.05], 0.006); box(plastic, 0.04, 0.008, 0.05, sx * 0.045, 0.09 + sx * 0.04, 0.04 + sx * 0.05, 0.003); }
      headlamp(0, 0.37, -0.205, 0.02);
      taillamp(0, 0.32, wz + 0.02, 0.03, 0.02);
      box(paint, 0.02, 0.006, 0.12, 0, r + 0.07, -wz, 0.003); // front mudguard
    } else {
      // frame, tank, seat, engine
      const bodyMat = paint;
      capsule(bodyMat, [0, 0.31, scoot ? -0.07 : -0.09], [0, 0.31, scoot ? 0.04 : 0.02], scoot ? 0.05 : 0.055);
      box(plastic, 0.065, 0.032, scoot ? 0.22 : 0.17, 0, scoot ? 0.275 : 0.282, scoot ? 0.11 : 0.1, 0.012); // seat
      box(dark, 0.07, 0.08, 0.12, 0, 0.15, scoot ? 0.06 : 0.0, 0.015); // engine
      for (const z of [-0.04, 0.03]) cyl(chrome, 0.012, 0.018, 0, 0.19, z + (scoot ? 0.06 : 0), "y", 8);
      tube(chrome, [0.06, 0.1, scoot ? 0.04 : -0.02], [0.065, 0.12, wz + 0.05], 0.014); // exhaust
      box(chrome, 0.03, 0.03, 0.06, 0.065, 0.12, wz + 0.07, 0.01);
      tube(plastic, [0, 0.16, scoot ? 0.06 : 0.04], [0, r, wz], 0.012); // swing arm
      const head: [number, number, number] = [0, scoot ? 0.33 : 0.34, scoot ? -0.2 : -0.22];
      tube(chrome, head, [0, r, -wz], 0.011); // fork
      tube(chrome, head, [0, scoot ? 0.4 : 0.41, scoot ? -0.2 : -0.22], 0.01);
      tube(plastic, [-0.17, 0.41, head[2]], [0.17, 0.41, head[2]], 0.009); // bars
      for (const sx of [-1, 1]) cyl(rubber, 0.013, 0.05, sx * 0.17, 0.41, head[2], "x", 8);
      ball(lamp, 0.04, 0, scoot ? 0.37 : 0.36, head[2] - 0.045, 1, 1, 0.6);
      if (d.headlights) { const tex = halo(); if (tex) { const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }))); sp.scale.set(0.14, 0.14, 1); put(sp, 0, 0.36, head[2] - 0.08); } }
      taillamp(0, 0.29, wz + (scoot ? 0.06 : 0.02), 0.04, 0.02);
      box(paint, 0.034, 0.008, 0.16, 0, r + 0.075, -wz, 0.004); box(paint, 0.034, 0.008, 0.16, 0, r + 0.065, wz, 0.004); // mudguards
      if (scoot) { box(paint, 0.09, 0.2, 0.025, 0, 0.26, -0.15, 0.012).rotation.x = -0.25; box(plastic, 0.12, 0.015, 0.26, 0, 0.115, -0.02, 0.006); } // leg shield and floor
    }
    // the rider, leaning into the ride
    const seatY = bike ? 0.37 : scoot ? 0.31 : 0.315, seatZ = bike ? 0.1 : scoot ? 0.12 : 0.1;
    const lean = bike ? 0.1 : scoot ? 0.03 : 0.07;
    const hip: [number, number, number] = [0, seatY + 0.01, seatZ];
    const shoulder: [number, number, number] = [0, seatY + 0.13, seatZ - lean - 0.04];
    capsule(suit, hip, shoulder, 0.052);
    ball(helmet, 0.066, 0, seatY + 0.215, seatZ - lean - 0.06, 1, 0.98, 1.08);
    ball(glass, 0.05, 0, seatY + 0.208, seatZ - lean - 0.105, 1, 0.55, 0.45);
    const grip: [number, number, number] = bike ? [0.15, 0.4, -0.18] : [0.17, 0.41, scoot ? -0.2 : -0.22];
    for (const sx of [-1, 1]) {
      capsule(suit, [sx * 0.06, shoulder[1] - 0.01, shoulder[2]], [sx * grip[0], grip[1], grip[2]], 0.019); // arms
      const knee: [number, number, number] = [sx * 0.085, seatY - (bike ? 0.02 : 0.04), seatZ - (bike ? 0.07 : 0.1)];
      const foot: [number, number, number] = bike ? [sx * 0.045, 0.09 + sx * 0.04, 0.04 + sx * 0.05] : [sx * 0.09, scoot ? 0.14 : 0.13, scoot ? -0.05 : 0.03];
      capsule(suit, [sx * 0.05, hip[1], hip[2]], knee, 0.026); capsule(suit, knee, foot, 0.022); // legs
      box(plastic, 0.03, 0.02, 0.06, foot[0], foot[1] - 0.01, foot[2] - 0.01, 0.008);
    }
    roofY = seatY + 0.29; roofZ = seatZ - lean; bodyW = 0.2; rearZ = wz + 0.08; rearY = seatY; wheelR = r;
  }

  // racing stripes and two-tone paint follow the body's top surface
  if (d.pattern === "stripes") for (const s of stripes) { ribbon(trim, s.path, -0.045, -0.015); ribbon(trim, s.path, 0.015, 0.045); }
  else if (d.pattern === "split") for (const s of stripes) ribbon(trim, s.path, -bodyW / 2 + 0.01, 0);

  // ---- roof extras ---------------------------------------------------------------------------------------------
  const extra: AccessoryId = d.accessory;
  const topY = roofY;
  if (extra === "siren") {
    const red = track(new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false })), blue = track(new THREE.MeshBasicMaterial({ color: "#3b82f6", toneMapped: false }));
    box(plastic, 0.2, 0.016, 0.06, 0, topY + 0.008, roofZ, 0.006);
    const dome = (m: THREE.Material, x: number) => { const g = new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); mesh(g, m, x, topY + 0.016, roofZ).scale.set(1.5, 0.9, 1.1); };
    dome(red, -0.05); dome(blue, 0.05);
  } else if (extra === "spoiler") {
    const y = Math.max(rearY + 0.08, topY - 0.16);
    box(paint, bodyW * 0.92, 0.014, 0.075, 0, y, rearZ - 0.03, 0.006);
    for (const sx of [-1, 1]) { box(dark, 0.008, 0.045, 0.08, sx * bodyW * 0.47, y - 0.002, rearZ - 0.03, 0.003); box(plastic, 0.012, 0.07, 0.014, sx * bodyW * 0.28, y - 0.04, rearZ - 0.05, 0.004); }
  } else if (extra === "rack") {
    for (const sx of [-1, 1]) tube(chrome, [sx * 0.11, topY + 0.03, roofZ - 0.12], [sx * 0.11, topY + 0.03, roofZ + 0.12], 0.006);
    for (const z of [-0.12, 0, 0.12]) { tube(chrome, [-0.11, topY + 0.03, roofZ + z], [0.11, topY + 0.03, roofZ + z], 0.005); for (const sx of [-1, 1]) tube(chrome, [sx * 0.11, topY, roofZ + z], [sx * 0.11, topY + 0.03, roofZ + z], 0.005); }
  } else if (extra === "flag") {
    tube(chrome, [bodyW * 0.3, topY, roofZ], [bodyW * 0.3, topY + 0.26, roofZ], 0.005);
    const g = new THREE.PlaneGeometry(0.14, 0.085);
    const m = mesh(g, M(d.secondary, { side: THREE.DoubleSide }), bodyW * 0.3, topY + 0.215, roofZ + 0.075);
    m.rotation.y = Math.PI / 2;
    ball(chrome, 0.01, bodyW * 0.3, topY + 0.265, roofZ);
  } else if (extra === "box") {
    box(trim, 0.26, 0.15, 0.24, 0, topY + 0.085, roofZ, 0.014);
    box(dark, 0.264, 0.018, 0.03, 0, topY + 0.085, roofZ, 0.004); box(dark, 0.03, 0.152, 0.244, 0, topY + 0.085, roofZ, 0.004); // tape
  }

  // an emoji badge on the roof
  if (d.mark && hasDom) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    if (g) {
      g.font = `800 ${72 * d.markSize}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,.5)"; g.strokeText(d.mark, 64, 68);
      g.fillStyle = d.markColor; g.fillText(d.mark, 64, 68);
      const t = track(new THREE.CanvasTexture(c));
      t.colorSpace = THREE.SRGBColorSpace;
      const p = mesh(new THREE.PlaneGeometry(0.2, 0.2), track(new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false })), 0, topY + (extra === "none" ? 0.022 : 0.2), roofZ, false);
      p.rotation.x = -Math.PI / 2;
    }
  }

  group.scale.setScalar(S);
  return { group, wheels, wheelRadius: wheelR * S, dispose: () => own.forEach(x => x.dispose()) };
};
