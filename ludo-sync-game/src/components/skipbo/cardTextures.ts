import * as THREE from "three";
import { WILD, type Card } from "@/lib/skipbo/types";
import { cardColor, markFor } from "./CardFace";
import type { CardBack } from "@/lib/client/unlocks";

const W = 256, H = 364;

const rounded = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
};

const star = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
};

/** Paints the face of a card. `asValue` puts a gold badge on a Skip-Bo that stands in for a number. */
export const paintFace = (value: Card, asValue?: number, marks = false): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const col = cardColor(value);
  const wild = value === WILD;
  if (wild) {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#4c1d95"); bg.addColorStop(1, "#111827");
    g.fillStyle = bg; rounded(g, 0, 0, W, H, 26); g.fill();
    g.lineWidth = 10; g.strokeStyle = "#f8fafc"; rounded(g, 5, 5, W - 10, H - 10, 22); g.stroke();
    const rb = g.createLinearGradient(60, 60, 200, 200);
    rb.addColorStop(0, "#f87171"); rb.addColorStop(0.33, "#fde047"); rb.addColorStop(0.66, "#4ade80"); rb.addColorStop(1, "#60a5fa");
    g.fillStyle = rb; g.strokeStyle = "#fff"; g.lineWidth = 4; star(g, W / 2, 130, 82); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "900 44px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillText("SKIP", W / 2, 262); g.fillStyle = "#fde047"; g.fillText("-BO", W / 2, 312);
    if (asValue) {
      g.fillStyle = "#fde047"; g.strokeStyle = "#fff"; g.lineWidth = 6;
      g.beginPath(); g.arc(W - 46, 46, 34, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#1f2937"; g.font = "900 40px system-ui, sans-serif"; g.textBaseline = "middle"; g.fillText(String(asValue), W - 46, 49);
    }
  } else {
    g.fillStyle = "#ffffff"; rounded(g, 0, 0, W, H, 26); g.fill();
    g.lineWidth = 14; g.strokeStyle = col.main; rounded(g, 7, 7, W - 14, H - 14, 20); g.stroke();
    const glow = g.createRadialGradient(W * 0.38, H * 0.4, 10, W / 2, H / 2, 150);
    glow.addColorStop(0, col.light + "aa"); glow.addColorStop(1, col.main + "10");
    g.fillStyle = glow; g.beginPath(); g.ellipse(W / 2, H / 2, 98, 128, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = col.main; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `900 ${value >= 10 ? 130 : 170}px system-ui, sans-serif`;
    g.fillText(String(value), W / 2, H / 2 + 8);
    g.font = "800 44px system-ui, sans-serif"; g.textAlign = "left"; g.textBaseline = "top"; g.fillText(String(value), 26, 24);
    if (marks) { g.textAlign = "center"; g.textBaseline = "middle"; g.font = "800 46px system-ui, sans-serif"; g.fillText(markFor(value), W / 2, H - 58); g.textAlign = "left"; g.textBaseline = "top"; }
    g.save(); g.translate(W - 26, H - 24); g.rotate(Math.PI); g.fillText(String(value), 0, 0); g.restore();
  }
  return c;
};

export const paintBack = (back: Pick<CardBack, "a" | "b" | "ring" | "mark">): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, 260);
  bg.addColorStop(0, back.a); bg.addColorStop(1, back.b);
  g.fillStyle = "#f8fafc"; rounded(g, 0, 0, W, H, 26); g.fill();
  g.fillStyle = bg; rounded(g, 12, 12, W - 24, H - 24, 18); g.fill();
  g.strokeStyle = back.ring + "99"; g.lineWidth = 6; g.beginPath(); g.ellipse(W / 2, H / 2, 82, 118, -0.2, 0, Math.PI * 2); g.stroke();
  g.fillStyle = back.mark; g.font = "900 82px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.save(); g.translate(W / 2, H / 2); g.rotate(-0.2); g.fillText("SB", 0, 4); g.restore();
  return c;
};

/** Textures are made once and shared by every card of that kind. */
export class CardTextures {
  private cache = new Map<string, THREE.CanvasTexture>();
  constructor(private maxAniso = 4, private backStyle: Pick<CardBack, "a" | "b" | "ring" | "mark"> = { a: "#1d4ed8", b: "#172554", ring: "#ffffff", mark: "#fde047" }, private marks = false) {}
  private make(key: string, canvas: () => HTMLCanvasElement): THREE.CanvasTexture {
    let t = this.cache.get(key);
    if (!t) {
      t = new THREE.CanvasTexture(canvas());
      t.colorSpace = THREE.SRGBColorSpace;
      // the top face of a box reads upside down from the player's side, so turn the picture round
      t.center.set(0.5, 0.5); t.rotation = Math.PI;
      t.anisotropy = this.maxAniso;
      this.cache.set(key, t);
    }
    return t;
  }
  face(value: Card, asValue?: number): THREE.CanvasTexture {
    return value === WILD && asValue ? this.make(`w${asValue}`, () => paintFace(WILD, asValue)) : this.make(`f${value}`, () => paintFace(value, undefined, this.marks));
  }
  back(): THREE.CanvasTexture { return this.make("back", () => paintBack(this.backStyle)); }
  dispose() { this.cache.forEach(t => t.dispose()); this.cache.clear(); }
}
