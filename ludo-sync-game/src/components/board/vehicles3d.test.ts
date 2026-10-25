import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ACCESSORIES, TRAILS, VEHICLES, resolveDesign, sanitizeDesign } from "@/lib/client/pieces";
import { buildPiece3D } from "./pieces3d";
import { travelDirection } from "./layout";
import { FINISH, YARD } from "@/lib/ludo/board";

describe("3D vehicles", () => {
  it("builds every vehicle with every roof extra, fitting a square and pointing somewhere", () => {
    for (const vehicle of VEHICLES.filter(v => v !== "none")) for (const accessory of ACCESSORIES) {
      const d = resolveDesign(sanitizeDesign({ vehicle, accessory, headlights: true, pattern: "stripes" }), 0);
      const b = buildPiece3D(d);
      expect(b.heading).not.toBeNull();
      const size = new THREE.Box3().setFromObject(b.group).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(2.6);
      expect(size.z).toBeLessThan(2.6);
      expect(size.y).toBeGreaterThan(0.1);
      b.dispose();
    }
  });
  it("works out which way a token faces", () => {
    const home = travelDirection(0, 0, YARD);
    expect(Math.hypot(home.x, home.y)).toBeGreaterThan(0);
    const mid = travelDirection(0, 0, 20);
    expect(Math.abs(mid.x) + Math.abs(mid.y)).toBeGreaterThan(0);
    const fin = travelDirection(0, 0, FINISH);
    expect(Math.hypot(fin.x, fin.y)).toBeGreaterThan(0);
  });
});

describe("vehicle options", () => {
  it("cleans bad values and keeps the good ones", () => {
    const d = sanitizeDesign({ vehicle: "hovercraft", accessory: "siren", headlights: "yes", trail: "smoke" });
    expect(d.vehicle).toBe("none");
    expect(d.accessory).toBe("siren");
    expect(d.headlights).toBe(true);
    expect(d.trail).toBe("smoke");
    expect(sanitizeDesign({ vehicle: "bus" }).vehicle).toBe("bus");
    expect(TRAILS).toContain("skid");
  });
});
