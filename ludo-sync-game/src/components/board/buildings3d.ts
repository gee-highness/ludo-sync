import * as THREE from "three";
import type { IslandStyle } from "@/lib/client/islands";

export interface BuiltBuilding {
  /** Feet at y = 0, centred on x = z = 0, fitting inside a 0.9 x 0.9 square. */
  group: THREE.Group;
  dispose: () => void;
}

/**
 * A building for one owned square in a player's island style. `level` is how developed the square is:
 * 0 an empty lot with a marker, 1 to 3 progressively taller buildings. PLACEHOLDER: the island fork replaces this with the real styles.
 */
export const buildBuilding = (style: IslandStyle, level: 0 | 1 | 2 | 3): BuiltBuilding => {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.7, 0.3 + level * 0.5, 0.7);
  const mat = new THREE.MeshStandardMaterial({ color: style.primary, emissive: style.accent, emissiveIntensity: 0.25 * style.glow });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = (0.3 + level * 0.5) / 2;
  group.add(mesh);
  return { group, dispose: () => { geo.dispose(); mat.dispose(); } };
};
