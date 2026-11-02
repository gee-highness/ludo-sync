"use client";

import { memo } from "react";
import { squareXY } from "@/lib/games/snakes/driver";
import type { Special } from "@/lib/games/snakes/boards";

export interface Theme {
  id: string; name: string;
  page: string; frame: string; frameDark: string; tileA: string; tileB: string; num: string; trail: string; finish: string;
  ladder: { rail: string; rung: string; style: "wood" | "rope" | "neon" };
  snakes: string[]; snakeSpot: string;
  special: Record<Special, { fill: string; glyph: string; label: string }>;
}

const SPECIAL = (bonus: string, skip: string, safe: string, warp: string): Theme["special"] => ({
  bonus: { fill: bonus, glyph: "★", label: "Bonus roll" }, skip: { fill: skip, glyph: "⏸", label: "Miss a turn" }, safe: { fill: safe, glyph: "✚", label: "Safe square" }, warp: { fill: warp, glyph: "◎", label: "Portal" },
});

export const THEMES: Record<string, Theme> = {
  classic: {
    id: "classic", name: "Classic", page: "#2a1a0c", frame: "#8a5a2b", frameDark: "#4a2c12", tileA: "#fde9b8", tileB: "#f5d58a", num: "#7a4a14", trail: "#b4781e", finish: "#facc15",
    ladder: { rail: "#9a5b1c", rung: "#c98a3a", style: "wood" }, snakes: ["#16a34a", "#dc2626", "#2563eb", "#9333ea", "#ea580c"], snakeSpot: "#fff7",
    special: SPECIAL("#f59e0b", "#ef4444", "#22c55e", "#8b5cf6"),
  },
  jungle: {
    id: "jungle", name: "Jungle", page: "#10261a", frame: "#5b3a1e", frameDark: "#2c1b0b", tileA: "#d9f0b4", tileB: "#b7dd86", num: "#1f4d1a", trail: "#2f7d32", finish: "#fde047",
    ladder: { rail: "#7a5a2e", rung: "#d6b46a", style: "rope" }, snakes: ["#65a30d", "#ca8a04", "#0d9488", "#b91c1c", "#4d7c0f"], snakeSpot: "#ffffff66",
    special: SPECIAL("#f59e0b", "#dc2626", "#0ea5e9", "#a855f7"),
  },
  night: {
    id: "night", name: "Night", page: "#05060f", frame: "#1f2a44", frameDark: "#0b1020", tileA: "#141b33", tileB: "#1b2547", num: "#9fb4ff", trail: "#3b82f6", finish: "#fde047",
    ladder: { rail: "#22d3ee", rung: "#67e8f9", style: "neon" }, snakes: ["#f472b6", "#a3e635", "#fb923c", "#c084fc", "#facc15"], snakeSpot: "#ffffff88",
    special: SPECIAL("#fbbf24", "#f87171", "#4ade80", "#c084fc"),
  },
};
export const themeOf = (id: unknown): Theme => THEMES[typeof id === "string" ? id : ""] ?? THEMES.classic;

interface P { x: number; y: number }
const bezier = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
};

/** A tapered snake along an S-curve: wide head, narrowing to a tail, with a pattern along the body. */
function Snake({ a, b, cell, colour, spot, eye, flip, night }: { a: P; b: P; cell: number; colour: string; spot: string; eye: string; flip: boolean; night: boolean }) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, amp = len * 0.2 * (flip ? 1 : -1);
  const p1 = { x: a.x + dx * 0.3 + nx * amp, y: a.y + dy * 0.3 + ny * amp }, p2 = { x: a.x + dx * 0.7 - nx * amp, y: a.y + dy * 0.7 - ny * amp };
  const N = 30, pts: P[] = [], ws: number[] = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(bezier(a, p1, p2, b, t)); ws.push(cell * (0.3 - 0.24 * Math.pow(t, 0.85)) + (t < 0.08 ? cell * 0.03 : 0)); }
  const left: string[] = [], right: string[] = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(N, i + 1)], r = pts[Math.max(0, i - 1)], tx = q.x - r.x, ty = q.y - r.y, tl = Math.hypot(tx, ty) || 1, ox = -ty / tl, oy = tx / tl;
    left.push(`${(p.x + ox * ws[i]).toFixed(1)},${(p.y + oy * ws[i]).toFixed(1)}`); right.push(`${(p.x - ox * ws[i]).toFixed(1)},${(p.y - oy * ws[i]).toFixed(1)}`);
  });
  const body = `M ${left.join(" L ")} L ${right.reverse().join(" L ")} Z`;
  const h = pts[0], h2 = pts[3], hx = h.x - h2.x, hy = h.y - h2.y, hl = Math.hypot(hx, hy) || 1, ux = hx / hl, uy = hy / hl, px = -uy, py = ux;
  return (
    <g>
      <path d={body} fill="#000" opacity={0.22} transform={`translate(${cell * 0.04} ${cell * 0.06})`} />
      <path d={body} fill={colour} stroke={night ? "#fff" : "#00000055"} strokeWidth={night ? 1.2 : 1} strokeLinejoin="round" />
      {pts.map((p, i) => (i % 3 === 1 && i < N - 2 ? <circle key={i} cx={p.x} cy={p.y} r={ws[i] * 0.42} fill={spot} /> : null))}
      <path d={`M ${pts.slice(2, N - 2).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={ws[8] * 0.5} strokeLinecap="round" />
      <ellipse cx={h.x + ux * cell * 0.06} cy={h.y + uy * cell * 0.06} rx={cell * 0.2} ry={cell * 0.17} fill={colour} stroke={night ? "#fff" : "#00000066"} strokeWidth={1} transform={`rotate(${(Math.atan2(uy, ux) * 180) / Math.PI} ${h.x} ${h.y})`} />
      {[-1, 1].map(s => <g key={s}><circle cx={h.x + ux * cell * 0.1 + px * s * cell * 0.09} cy={h.y + uy * cell * 0.1 + py * s * cell * 0.09} r={cell * 0.055} fill="#fff" /><circle cx={h.x + ux * cell * 0.12 + px * s * cell * 0.09} cy={h.y + uy * cell * 0.12 + py * s * cell * 0.09} r={cell * 0.028} fill={eye} /></g>)}
      <path d={`M ${h.x + ux * cell * 0.22} ${h.y + uy * cell * 0.22} l ${ux * cell * 0.14} ${uy * cell * 0.14} m ${-ux * cell * 0.05} ${-uy * cell * 0.05} l ${px * cell * 0.05} ${py * cell * 0.05} m ${-px * cell * 0.1} ${-py * cell * 0.1} l ${px * cell * 0.05} ${py * cell * 0.05}`} stroke="#ef4444" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Ladder({ a, b, cell, theme }: { a: P; b: P; cell: number; theme: Theme }) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const w0 = cell * 0.2, w1 = cell * 0.13; // a little narrower at the top, for depth
  const rungs = Math.max(2, Math.round(len / (cell * 0.34)));
  const L = theme.ladder, rail = (s: number, t: number): P => ({ x: a.x + dx * t + nx * s * (w0 + (w1 - w0) * t), y: a.y + dy * t + ny * s * (w0 + (w1 - w0) * t) });
  const neon = L.style === "neon", rope = L.style === "rope";
  return (
    <g strokeLinecap="round" filter={neon ? "url(#glow)" : undefined}>
      {!neon && [1, -1].map(s => <line key={`sh${s}`} x1={rail(s, 0).x + 2} y1={rail(s, 0).y + 3} x2={rail(s, 1).x + 2} y2={rail(s, 1).y + 3} stroke="#000" strokeOpacity={0.22} strokeWidth={cell * 0.09} />)}
      {Array.from({ length: rungs }, (_, i) => { const t = (i + 0.5) / rungs, p = rail(1, t), q = rail(-1, t); return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={L.rung} strokeWidth={rope ? cell * 0.07 : cell * 0.06} strokeDasharray={rope ? `${cell * 0.1} ${cell * 0.03}` : undefined} />; })}
      {[1, -1].map(s => <line key={s} x1={rail(s, 0).x} y1={rail(s, 0).y} x2={rail(s, 1).x} y2={rail(s, 1).y} stroke={L.rail} strokeWidth={rope ? cell * 0.045 : cell * 0.08} />)}
      {!neon && !rope && [1, -1].map(s => <line key={`hi${s}`} x1={rail(s, 0).x} y1={rail(s, 0).y} x2={rail(s, 1).x} y2={rail(s, 1).y} stroke="#fff" strokeOpacity={0.25} strokeWidth={cell * 0.02} />)}
    </g>
  );
}

export interface ArtProps { theme: Theme; cols: number; rows: number; cell: number; pad: number; size: number; jumps: Record<number, number>; special: Record<number, Special>; warp: Record<number, number> }

/** The board itself: tiles, path, ladders, snakes and special squares. Drawn once and reused while tokens move. */
export const BoardArt = memo(function BoardArt({ theme, cols, rows, cell, pad, size, jumps, special }: ArtProps) {
  const C = (sq: number): P => { const { x, y } = squareXY(Math.max(1, sq), cols, rows); return { x: pad + x * cell + cell / 2, y: pad + y * cell + cell / 2 }; };
  const night = theme.id === "night";
  const trail = Array.from({ length: size }, (_, i) => C(i + 1));
  const entries = Object.entries(jumps).map(([f, t]) => ({ from: Number(f), to: t }));
  const ladders = entries.filter(e => e.to > e.from), snakes = entries.filter(e => e.to < e.from);
  return (
    <g>
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="tileSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.28" /><stop offset="1" stopColor="#000" stopOpacity="0.1" /></linearGradient>
      </defs>
      <rect x={0} y={0} width={cols * cell + pad * 2} height={rows * cell + pad * 2} rx={cell * 0.35} fill={theme.frame} />
      <rect x={pad - 3} y={pad - 3} width={cols * cell + 6} height={rows * cell + 6} rx={5} fill={theme.frameDark} />
      {Array.from({ length: size }, (_, i) => {
        const sq = i + 1, p = C(sq), { x, y } = squareXY(sq, cols, rows), last = sq === size;
        return (
          <g key={sq}>
            <rect x={p.x - cell / 2 + 0.6} y={p.y - cell / 2 + 0.6} width={cell - 1.2} height={cell - 1.2} rx={cell * 0.1} fill={last ? theme.finish : (x + y) % 2 ? theme.tileA : theme.tileB} />
            <rect x={p.x - cell / 2 + 0.6} y={p.y - cell / 2 + 0.6} width={cell - 1.2} height={cell - 1.2} rx={cell * 0.1} fill="url(#tileSheen)" opacity={night ? 0.5 : 1} />
            {!last && <text x={p.x - cell / 2 + cell * 0.08} y={p.y - cell / 2 + cell * 0.27} fontSize={Math.max(8, cell * 0.22)} fontWeight={700} fill={theme.num} opacity={0.85}>{sq}</text>}
            {last && <text x={p.x} y={p.y + cell * 0.12} textAnchor="middle" fontSize={cell * 0.5} aria-hidden>🏁</text>}
          </g>
        );
      })}
      <polyline points={trail.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={theme.trail} strokeOpacity={0.16} strokeWidth={cell * 0.07} strokeDasharray={`${cell * 0.12} ${cell * 0.16}`} strokeLinecap="round" strokeLinejoin="round" />
      {Object.entries(special).map(([q, kind]) => {
        const p = C(Number(q)), sp = theme.special[kind];
        return (
          <g key={`sp${q}`} aria-hidden>
            <circle cx={p.x + cell * 0.22} cy={p.y + cell * 0.2} r={cell * 0.21} fill={sp.fill} stroke="#fff" strokeWidth={1.4} />
            <text x={p.x + cell * 0.22} y={p.y + cell * 0.2 + cell * 0.09} textAnchor="middle" fontSize={cell * 0.26} fontWeight={900} fill="#0f172a">{sp.glyph}</text>
          </g>
        );
      })}
      {ladders.map(e => <Ladder key={`l${e.from}`} a={C(e.from)} b={C(e.to)} cell={cell} theme={theme} />)}
      {snakes.map((e, i) => <Snake key={`s${e.from}`} a={C(e.from)} b={C(e.to)} cell={cell} colour={theme.snakes[i % theme.snakes.length]} spot={theme.snakeSpot} eye="#0f172a" flip={i % 2 === 0} night={night} />)}
      {/* direction marks, so colour is never the only cue: a ring and arrow on every foot and head */}
      {ladders.map(e => { const p = C(e.from); return <g key={`lm${e.from}`} aria-hidden><circle cx={p.x} cy={p.y} r={cell * 0.17} fill="#16a34a" stroke="#fff" strokeWidth={1.5} /><text x={p.x} y={p.y + cell * 0.07} textAnchor="middle" fontSize={cell * 0.2} fontWeight={900} fill="#fff">▲</text></g>; })}
      {snakes.map(e => { const p = C(e.from); return <g key={`sm${e.from}`} aria-hidden><circle cx={p.x + cell * 0.26} cy={p.y - cell * 0.24} r={cell * 0.15} fill="#b91c1c" stroke="#fff" strokeWidth={1.5} /><text x={p.x + cell * 0.26} y={p.y - cell * 0.24 + cell * 0.06} textAnchor="middle" fontSize={cell * 0.17} fontWeight={900} fill="#fff">▼</text></g>; })}
    </g>
  );
});
