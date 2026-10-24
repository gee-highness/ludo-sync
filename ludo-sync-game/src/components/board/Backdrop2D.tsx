"use client";

import { useEffect, useRef } from "react";
import { worldOf } from "@/lib/client/themes";
import type { BoardTheme } from "@/lib/client/settings";

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};


/**
 * A neon city seen from above, drawn once onto a canvas: tilted streets with a glowing grid, blocks of lit towers,
 * a dark harbour and a few billboards. No animation and no redraw until the size changes, so it costs nothing per frame.
 */
export const drawCity = (ctx: CanvasRenderingContext2D, w: number, h: number, theme: BoardTheme = "neon", seed = 7) => {
  const T = worldOf(theme);
  const NEON: readonly string[] = T.lights, WALL: readonly string[] = T.walls;
  const rand = mulberry(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const sky = ctx.createLinearGradient(0, 0, w * 0.4, h);
  sky.addColorStop(0, T.skyTop); sky.addColorStop(0.55, T.fog); sky.addColorStop(1, T.skyTop);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  // the whole city sits at an angle, like the reference's tilted street grid
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.46);
  const R = Math.hypot(w, h) * 0.62;
  const block = Math.max(70, Math.min(w, h) * 0.2);
  const street = block * 0.2;
  const step = block + street;

  // harbour: a dark inlet in one quarter, with a few shimmer lines
  const hx = R * 0.18, hy = R * 0.1, hw = R * 0.55, hh = R * 0.42;
  const water = ctx.createLinearGradient(hx, hy, hx + hw, hy + hh);
  water.addColorStop(0, T.skyTop); water.addColorStop(1, T.fog);

  for (let gy = -R; gy < R; gy += step) {
    for (let gx = -R; gx < R; gx += step) {
      const inWater = gx > hx && gx < hx + hw && gy > hy && gy < hy + hh;
      if (inWater) continue;
      // a block of towers, each a little darker box with a lit roof edge and windows
      const cols = 2 + Math.floor(rand() * 2), rows = 2 + Math.floor(rand() * 2);
      const bw = block / cols, bh = block / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = gx + c * bw + 2, y = gy + r * bh + 2, ww = bw - 4, hh2 = bh - 4;
        const height = 0.6 + rand() * 1.4;
        // the long soft shadow of a tall building falls to one side
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.fillRect(x + 5 * height, y + 7 * height, ww, hh2);
        ctx.fillStyle = pick(WALL);
        ctx.fillRect(x, y, ww, hh2);
        const accent = pick(NEON);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.55 + rand() * 0.4;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x + 0.7, y + 0.7, ww - 1.4, hh2 - 1.4);
        ctx.globalAlpha = 1;
        // lit windows: a coarse grid, a few of them on
        const wcol = Math.max(2, Math.floor(ww / 9)), wrow = Math.max(2, Math.floor(hh2 / 9));
        const lit = pick(["#ffd27a", "#9ad0ff", "#ff9bd5", "#9bffb0"]);
        for (let j = 0; j < wrow; j++) for (let i = 0; i < wcol; i++) {
          if (rand() < 0.55) continue;
          ctx.globalAlpha = 0.5 + rand() * 0.5;
          ctx.fillStyle = lit;
          ctx.fillRect(x + 3 + i * ((ww - 6) / wcol), y + 3 + j * ((hh2 - 6) / wrow), Math.max(2, (ww - 6) / wcol - 3), Math.max(2, (hh2 - 6) / wrow - 3));
        }
        ctx.globalAlpha = 1;
        if (rand() < 0.22) { // a rooftop sign
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x + ww * 0.2, y + hh2 * 0.4, ww * 0.6, Math.max(3, hh2 * 0.14));
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  ctx.fillStyle = water;
  ctx.fillRect(hx, hy, hw, hh);
  ctx.strokeStyle = "rgba(120,200,255,.18)";
  ctx.lineWidth = 1;
  for (let y = hy + 10; y < hy + hh; y += 14) { ctx.beginPath(); ctx.moveTo(hx + 6, y); ctx.lineTo(hx + hw - 6, y + (rand() - 0.5) * 6); ctx.stroke(); }

  // glowing street grid: a faint wide line under a thin bright one
  for (const [alpha, lw, color] of [[0.16, 7, T.accent], [0.7, 1.4, T.accent]] as const) {
    ctx.globalAlpha = alpha; ctx.lineWidth = lw; ctx.strokeStyle = color;
    ctx.beginPath();
    for (let g = -R; g < R; g += step) {
      ctx.moveTo(g - street / 2, -R); ctx.lineTo(g - street / 2, R);
      ctx.moveTo(-R, g - street / 2); ctx.lineTo(R, g - street / 2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // soft neon pools where signs and plazas would be
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 2 * R, y = (rand() - 0.5) * 2 * R, r = 40 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = pick(NEON);
    g.addColorStop(0, c + "44"); g.addColorStop(1, c + "00");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // a vignette keeps the middle (the board) calm and the edges rich
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, "rgba(5,8,20,.55)"); v.addColorStop(1, "rgba(5,8,20,0)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
};

/** Fills its parent. Draws once, again only when the size changes. */
export default function Backdrop2D({ theme = "neon" }: { theme?: BoardTheme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let last = "";
    let timer = 0;
    const paint = () => {
      const w = Math.max(1, Math.round(parent.clientWidth)), h = Math.max(1, Math.round(parent.clientHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const key = `${w}x${h}@${dpr}`;
      if (key === last) return;
      last = key;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCity(ctx, w, h, theme);
    };
    paint();
    const ro = new ResizeObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(paint, 120); });
    ro.observe(parent);
    return () => { window.clearTimeout(timer); ro.disconnect(); };
  }, [theme]);
  return <canvas ref={ref} aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />;
}
