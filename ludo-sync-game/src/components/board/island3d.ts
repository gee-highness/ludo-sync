import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SEATS, SEAT_INFO, lotOnRight, yardCentre, type Seat } from "@/lib/ludo/board";
import { islandFor, type IslandMap } from "@/lib/client/islands";
import { buildBuilding, type BuiltBuilding } from "./buildings3d";
import { ROAD_Y } from "./roadboard3d";

/** Where each seat's buildings stand on its lawn, in board squares from the yard's top left (a 2 by 3 grid), and how developed each one is. */
const GRID: { col: 0 | 1; row: 0 | 1; level: 1 | 2 | 3 }[] = [
  { col: 0, row: 0, level: 3 }, { col: 1, row: 0, level: 2 },
  { col: 0, row: 1, level: 1 }, { col: 1, row: 1, level: 3 },
];
const SCALE = 1.28;

export interface Island3D {
  group: THREE.Group;
  /** Rebuilds the districts when the players or their island styles change; cheap when nothing did. */
  sync: (islands: IslandMap, playing: ReadonlySet<Seat>) => void;
  dispose: () => void;
}

/**
 * The player's island in 3D: their own customised buildings standing on the lawn beside their car park. Each seat's buildings are
 * merged into a few meshes (one per material), so a whole district costs a handful of draw calls.
 */
export const buildIslands3D = (): Island3D => {
  const group = new THREE.Group();
  let built: BuiltBuilding[] = [];
  let merged: THREE.Mesh[] = [];
  let key = "";

  const clear = () => {
    for (const m of merged) { group.remove(m); m.geometry.dispose(); }
    merged = [];
    built.forEach(b => b.dispose());
    built = [];
  };

  const sync = (islands: IslandMap, playing: ReadonlySet<Seat>) => {
    const k = JSON.stringify([islands, [...playing].sort(), SEATS.map(s => SEAT_INFO[s].main)]);
    if (k === key) return;
    key = k;
    clear();
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const seat of SEATS) {
      if (!playing.has(seat)) continue;
      const style = islandFor(seat, islands, SEAT_INFO[seat].main);
      const right = lotOnRight(seat);
      const c = yardCentre(seat);
      const x0 = c.x - 3;
      const lotX0 = right ? c.x + 0.3 : c.x - 2.75;
      const lawnX0 = right ? x0 + 0.3 : c.x - 0.15;
      const lawnW = right ? lotX0 - 0.15 - lawnX0 : x0 + 5.6 - lawnX0;
      const mid = lawnX0 + lawnW / 2;
      const y0 = c.y - 3;
      for (const spot of GRID) {
        const b = buildBuilding(style, spot.level);
        built.push(b);
        const cx = mid + (spot.col ? 0.78 : -0.78) - 7, cz = y0 + (spot.row === 0 ? 2.35 : 4.55) - 7;
        const root = new THREE.Group();
        root.add(b.group);
        b.group.scale.setScalar(SCALE);
        root.position.set(cx, ROAD_Y, cz);
        root.updateMatrixWorld(true);
        root.traverse(o => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
          const geo = m.geometry.clone();
          geo.applyMatrix4(m.matrixWorld);
          for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
          if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((geo.getAttribute("position").count) * 2), 2));
          const list = byMaterial.get(mat) ?? [];
          list.push(geo.index ? geo.toNonIndexed() : geo);
          byMaterial.set(mat, list);
        });
      }
    }
    for (const [mat, list] of byMaterial) {
      const geo = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      merged.push(mesh);
    }
  };

  return { group, sync, dispose: clear };
};
