"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GROUP_COLORS, SQUARES } from "@/lib/ludo/tycoon";
import {
  FINISH, RING, SEATS, SEAT_INFO, SEAT_DIRECTION, YARD, cellInfo, pointOf, type Seat,
} from "@/lib/ludo/board";
import type { MoveOption } from "@/lib/ludo/types";
import { useSettings, type BoardTheme } from "@/lib/client/settings";
import { usePalette } from "@/lib/client/palette";
import { resolveDesign, useDesigns, type TrailId } from "@/lib/client/pieces";
import { PieceShape } from "./PieceShape";
import type { BoardProps } from "./types";
import { placeTokens, seatTokens, tokenKey, type TokenView } from "./layout";

const CELL = 1;
const MAX_BURSTS = 16;
const INACTIVE = "#555555";
const TRAIL_STYLE: Record<TrailId, { color: string; n: number; d: number; r: number; rise: boolean; ring?: boolean }> = {
  dust: { color: "#cccccc", n: 5, d: 0.55, r: 0.07, rise: false },
  none: { color: "#fff", n: 0, d: 0, r: 0, rise: false },
  sparkle: { color: "#FACC15", n: 7, d: 0.85, r: 0.06, rise: false },
  ember: { color: "#FB923C", n: 6, d: 0.7, r: 0.07, rise: true },
  bubbles: { color: "#7DD3FC", n: 4, d: 0.7, r: 0.1, rise: true, ring: true },
};
const IDLE_CLASS = { breathe: "tok-idle", none: "", bounce: "tok-idle-bounce", spin: "tok-idle-spin", pulse: "tok-idle-pulse", wobble: "tok-idle-wobble" } as const;

interface Palette { bg: string; cell: string; line: string; panel: string; inactiveCol: string }
const PALETTES: Record<BoardTheme, Palette> = {
  classic: { bg: "#151515", cell: "#F7F7F7", line: "#A0A0A0", panel: "#fff", inactiveCol: "#A0A0A0" },
  midnight: { bg: "#050505", cell: "#2B2B2B", line: "#555555", panel: "#1C1C1C", inactiveCol: "#555555" },
  forest: { bg: "#14281D", cell: "#E6F4D7", line: "#8FB27A", panel: "#F1F9E6", inactiveCol: "#8FB27A" },
  sunset: { bg: "#2B1424", cell: "#FFF3E0", line: "#E0A878", panel: "#FFF8EE", inactiveCol: "#C9A28A" },
  paper: { bg: "#E5E5E5", cell: "#FFFFFF", line: "#CCCCCC", panel: "#fff", inactiveCol: "#CCCCCC" },
};

interface Burst { id: number; x: number; y: number; color: string; kind: "capture" | "home" | TrailId }

const optionsByToken = (options: MoveOption[]) => {
  const map = new Map<number, MoveOption[]>();
  for (const o of options) map.set(o.token, [...(map.get(o.token) ?? []), o]);
  return map;
};

const CSS = `
  .tok { transition: transform var(--hop) linear; }
  .tok-ret { transition-timing-function: cubic-bezier(.3,.7,.3,1); transition-duration: calc(var(--hop) * 2.2); }
  .tok-hop { animation: tokHop var(--hop) ease-out; transform-origin: 0 .3px; }
  .tok-spin { animation: tokSpin calc(var(--hop) * 2.2) ease-in; transform-origin: 0 0; }
  .tok-idle { animation: tokBreath 3.2s ease-in-out infinite; transform-origin: 0 .3px; }
  .tok-bounce { animation: tokBounce .9s ease-in-out infinite; transform-origin: 0 .3px; }
  .tok-idle-bounce { animation: tokBounce 1.6s ease-in-out infinite; transform-origin: 0 .3px; }
  .tok-idle-spin { animation: idleSpin 3.5s linear infinite; transform-origin: 0 0; }
  .tok-idle-pulse { animation: idlePulse 1.8s ease-in-out infinite; transform-origin: 0 0; }
  .tok-idle-wobble { animation: idleWobble 1.4s ease-in-out infinite; transform-origin: 0 .3px; }
  .tok-dance { animation: tokDance .7s ease-in-out infinite; transform-origin: 0 .3px; }
  .tok-pulse { animation: tokPulse 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .burst-dot { animation: burst .75s ease-out forwards; }
  .dust-dot { animation: dust .55s ease-out forwards; }
  .shock { animation: shock .7s ease-out forwards; }
  .ghost { animation: ghost 1.2s ease-in-out infinite; }
  .twinkle { animation: twinkle 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .yard-glow { animation: yardGlow 1.4s ease-in-out infinite; }
  .banner { animation: banner 1.6s ease-out forwards; }
  @keyframes tokHop { 0%{transform:translateY(0) scale(1.18,.8)} 25%{transform:translateY(-.38px) scale(.9,1.14)} 60%{transform:translateY(-.3px) scale(.96,1.06)} 85%{transform:translateY(0) scale(1.14,.86)} 100%{transform:translateY(0) scale(1,1)} }
  @keyframes tokSpin { 0%{transform:translateY(0) rotate(0) scale(1)} 50%{transform:translateY(-.9px) rotate(360deg) scale(1.15)} 100%{transform:translateY(0) rotate(720deg) scale(1)} }
  @keyframes tokBreath { 0%,100%{transform:scale(1,1)} 50%{transform:scale(1.04,.96)} }
  @keyframes tokBounce { 0%,100%{transform:translateY(0) scale(1.06,.94)} 45%{transform:translateY(-.22px) scale(.96,1.06)} }
  @keyframes tokDance { 0%,100%{transform:translateY(0) rotate(-10deg) scale(1.08,.92)} 50%{transform:translateY(-.3px) rotate(10deg) scale(.94,1.08)} }
  @keyframes idleSpin { to { transform: rotate(360deg) } }
  @keyframes idlePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.14)} }
  @keyframes idleWobble { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
  @keyframes tokPulse { 0%,100%{transform:scale(1);opacity:.95} 50%{transform:scale(1.3);opacity:.35} }
  @keyframes burst { from{transform:translate(0,0) scale(1);opacity:1} to{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0} }
  @keyframes dust { from{transform:translate(0,.2px) scale(.6);opacity:.7} to{transform:translate(var(--dx),var(--dy)) scale(1.5);opacity:0} }
  @keyframes shock { from{r:.2;opacity:.9;stroke-width:.22} to{r:2;opacity:0;stroke-width:.02} }
  @keyframes ghost { 0%,100%{opacity:.9} 50%{opacity:.35} }
  @keyframes twinkle { 0%,100%{transform:scale(1) rotate(0);opacity:1} 50%{transform:scale(1.25) rotate(14deg);opacity:.55} }
  @keyframes yardGlow { 0%,100%{opacity:.25} 50%{opacity:.85} }
  @keyframes banner { 0%{opacity:0;transform:scale(.6)} 15%{opacity:1;transform:scale(1.05)} 25%{transform:scale(1)} 80%{opacity:1} 100%{opacity:0} }
  .reduce .tok-idle-bounce, .reduce .tok-idle-spin, .reduce .tok-idle-pulse, .reduce .tok-idle-wobble, .reduce .tok-hop, .reduce .tok-spin, .reduce .tok-idle, .reduce .tok-bounce, .reduce .tok-dance, .reduce .tok-pulse, .reduce .burst-dot,
  .reduce .dust-dot, .reduce .shock, .reduce .ghost, .reduce .twinkle, .reduce .yard-glow, .reduce .banner { animation: none; }
  .reduce .banner { opacity: 0; }
  .tok-btn:focus-visible .focus-ring { stroke: #fff; stroke-width: .09; }
`;

/** The flat board: an SVG that scales to any screen, rotated so `viewSeat` sits at the bottom. */
export default function Board2D({
  state, viewSeat, options, onPick, symbols, hints, reduceMotion, hopMs, moving,
}: BoardProps) {
  usePalette(); // seat colours are changed in place; this redraws when they are
  const [settings] = useSettings();
  const pal = PALETTES[settings.boardTheme];
  const designs = useDesigns();
  const rotation = -90 * viewSeat;
  const playing = useMemo(() => new Set(state.players.map(p => p.seat)), [state.players]);
  const byToken = useMemo(() => optionsByToken(options), [options]);
  const interactiveSeat = options.length ? state.players[state.turn].seat : null;
  const [preview, setPreview] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const prev = useRef<Map<string, number>>(new Map());
  const burstId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const tokens = useMemo(() => seatTokens(state), [state]);
  const turnSeat = state.phase === "over" ? null : state.players[state.turn].seat;
  const turnName = state.players[state.turn].name;

  // sparkles where a token is captured or reaches home
  useEffect(() => {
    const next = new Map<string, number>();
    const fresh: Burst[] = [];
    for (const t of tokens) {
      const key = tokenKey(t.seat, t.token);
      const before = prev.current.get(key);
      next.set(key, t.progress);
      if (before === undefined) continue;
      if (before >= 0 && before < FINISH && t.progress === YARD) {
        const p = pointOf(t.seat, t.token, before);
        fresh.push({ id: ++burstId.current, x: p.x, y: p.y, color: "#FACC15", kind: "capture" });
      } else if (before < FINISH && t.progress === FINISH) {
        fresh.push({ id: ++burstId.current, x: t.point.x, y: t.point.y, color: SEAT_INFO[t.seat].light, kind: "home" });
      } else if (t.progress !== before && t.progress >= 0 && t.progress < FINISH) {
        const trail = designs[t.seat][t.token].trail;
        if (trail !== "none") fresh.push({ id: ++burstId.current, x: t.point.x, y: t.point.y + 0.3, color: TRAIL_STYLE[trail].color, kind: trail });
      }
    }
    prev.current = next;
    if (!fresh.length) return;
    // keep a small cap so a fast game can never pile up particles, and let every burst expire on its own
    setBursts(b => [...b, ...fresh].slice(-MAX_BURSTS));
    const ids = new Set(fresh.map(f => f.id));
    const timer = setTimeout(() => { timers.current.delete(timer); setBursts(b => b.filter(x => !ids.has(x.id))); }, 1000);
    timers.current.add(timer);
  }, [tokens, designs]);
  useEffect(() => {
    const live = timers.current;
    return () => { live.forEach(clearTimeout); live.clear(); };
  }, []);

  const placed = useMemo(() => {
    const movableLast = (t: TokenView) => (t.seat === interactiveSeat && byToken.has(t.token) ? 1 : 0);
    return placeTokens(tokens, moving).sort((x, y) => movableLast(x) - movableLast(y));
  }, [tokens, interactiveSeat, byToken, moving]);

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const info = cellInfo(row, col);
      if (info.kind === "void" || info.kind === "yard" || info.kind === "centre") continue;
      const seatInfo = info.seat !== undefined ? SEAT_INFO[info.seat] : null;
      const active = info.seat === undefined || playing.has(info.seat);
      let fill = pal.cell;
      if (info.kind === "column") fill = active ? seatInfo!.path : pal.inactiveCol;
      if (info.kind === "start") fill = active ? seatInfo!.main : INACTIVE;
      const tycoonRing = state.tycoon && info.kind !== "column" ? RING.findIndex(c => c[0] === row && c[1] === col) : -1;
      cells.push(
        <g key={`${row}-${col}`}>
          <rect x={col - 0.5} y={row - 0.5} width={CELL} height={CELL} fill={fill} stroke={pal.line} strokeWidth={0.04} />
          {tycoonRing >= 0 && state.tycoon && (() => {
            const sq = SQUARES[tycoonRing];
            const owner = state.tycoon!.owner[tycoonRing];
            const level = state.tycoon!.level[tycoonRing];
            const icon = sq.kind === "station" ? "🚉" : sq.kind === "utility" ? "💡" : sq.kind === "chest" ? "🎁" : sq.kind === "tax" ? "💸" : sq.kind === "chance" ? "❓" : null;
            return (
              <g aria-hidden>
                {sq.kind === "property" && <rect x={col - 0.5} y={row - 0.5} width={CELL} height={0.3} fill={GROUP_COLORS[sq.group]} />}
                {icon && (
                  <text x={col} y={row + 0.05} textAnchor="middle" dominantBaseline="central" fontSize={0.55} transform={`rotate(${-rotation} ${col} ${row})`}>{icon}</text>
                )}
                {owner >= 0 && <circle cx={col + 0.3} cy={row + 0.3} r={0.14} fill={SEAT_INFO[owner as Seat].main} stroke="#fff" strokeWidth={0.04} />}
                {Array.from({ length: level }, (_, i) => (
                  <rect key={i} x={col - 0.42 + i * 0.2} y={row + 0.28} width={0.15} height={0.15} fill="#FACC15" stroke="#7B341E" strokeWidth={0.025} />
                ))}
              </g>
            );
          })()}
          {info.kind === "star" && (
            <g transform={`translate(${col} ${row}) rotate(${-rotation})`} aria-hidden>
              <text className="twinkle" y={0.05} textAnchor="middle" dominantBaseline="central" fontSize={0.78} fill="#D69E2E"
                style={{ animationDelay: `${((row * 15 + col) % 7) * 0.35}s` }}>★</text>
            </g>
          )}
          {info.kind === "start" && (
            <polygon
              points="-.22,.16 .22,.16 0,-.24" fill="#fff" fillOpacity={0.9} aria-hidden
              transform={`translate(${col} ${row}) rotate(${Math.atan2(SEAT_DIRECTION[info.seat!].x, -SEAT_DIRECTION[info.seat!].y) * (180 / Math.PI) + 180})`}
            />
          )}
        </g>,
      );
    }
  }

  const yards = SEATS.map(seat => {
    const info = SEAT_INFO[seat];
    const x0 = seat === 1 || seat === 0 ? -0.5 : 8.5;
    const y0 = seat === 1 || seat === 2 ? -0.5 : 8.5;
    const active = playing.has(seat);
    const player = state.players.find(p => p.seat === seat);
    return (
      <g key={seat}>
        <rect x={x0} y={y0} width={6} height={6} fill={active ? info.home : INACTIVE} />
        {turnSeat === seat && <rect className="yard-glow" x={x0 + 0.1} y={y0 + 0.1} width={5.8} height={5.8} fill="none" stroke="#fff" strokeWidth={0.16} rx={0.3} />}
        <rect x={x0 + 0.9} y={y0 + 0.9} width={4.2} height={4.2} rx={0.5} fill={pal.panel} fillOpacity={active ? 0.88 : 0.35} />
        {[0, 1, 2, 3].map(i => {
          const p = pointOf(seat, i, YARD);
          return <circle key={i} cx={p.x} cy={p.y} r={0.46} fill={active ? info.main : INACTIVE} fillOpacity={0.28} stroke={active ? info.dark : "#2B2B2B"} strokeWidth={0.06} />;
        })}
        {player && (
          <text x={x0 + 3} y={y0 + (seat === 0 || seat === 3 ? 5.58 : 0.42)} textAnchor="middle" dominantBaseline="central" fontSize={0.46} fontWeight={800}
            fill="#fff" stroke={info.dark} strokeWidth={0.07} paintOrder="stroke" transform={`rotate(${-rotation} ${x0 + 3} ${y0 + (seat === 0 || seat === 3 ? 5.58 : 0.42)})`} aria-hidden>
            {player.name.length > 14 ? `${player.name.slice(0, 13)}…` : player.name}
          </text>
        )}
      </g>
    );
  });

  const centre = SEATS.map(seat => {
    const pts: Record<Seat, string> = {
      0: "5.5,8.5 8.5,8.5 7,7", 1: "5.5,5.5 5.5,8.5 7,7", 2: "5.5,5.5 8.5,5.5 7,7", 3: "8.5,5.5 8.5,8.5 7,7",
    };
    return <polygon key={seat} points={pts[seat]} fill={playing.has(seat) ? SEAT_INFO[seat].main : INACTIVE} stroke="#fff" strokeWidth={0.05} />;
  });

  const ghosts = preview
    ? (byToken.get(Number(preview)) ?? []).map(o => {
        const p = pointOf(interactiveSeat!, o.token, o.to);
        return <circle key={o.die} className="ghost" cx={p.x} cy={p.y} r={0.44} fill="none" stroke="#fff" strokeWidth={0.1} strokeDasharray="0.18 0.14" />;
      })
    : null;

  return (
    <svg
      viewBox="-0.5 -0.5 15 15" role="group" aria-label="Ludo board" className={reduceMotion ? "reduce" : undefined}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "manipulation", "--hop": `${hopMs}ms` } as React.CSSProperties}
    >
      <style>{CSS}</style>
      <defs>
        {SEATS.map(seat => {
          const i = SEAT_INFO[seat];
          return (
            <radialGradient key={seat} id={`tok-${seat}`} cx="0.35" cy="0.3" r="0.85">
              <stop offset="0" stopColor={i.light} /><stop offset="0.55" stopColor={i.main} /><stop offset="1" stopColor={i.dark} />
            </radialGradient>
          );
        })}
      </defs>
      <rect x={-0.5} y={-0.5} width={15} height={15} rx={0.6} fill={pal.bg} />
      <g transform={`rotate(${rotation} 7 7)`}>
        {yards}
        {cells}
        {centre}
        {ghosts}
        {placed.map(t => {
          const isMine = t.seat === interactiveSeat;
          const opts = isMine ? byToken.get(t.token) : undefined;
          const movable = !!opts?.length;
          const info = SEAT_INFO[t.seat];
          const design = resolveDesign(designs[t.seat][t.token], t.seat);
          const label = `${info.name} token ${t.token + 1}, ${
            t.progress === YARD ? "in the yard" : t.progress === FINISH ? "home" : t.progress >= 51 ? "on the home column" : "on the board"
          }${movable ? `, can move ${opts!.map(o => o.die).join(" or ")}` : ""}`;
          const activate = () => { if (movable) onPick(t.token); };
          return (
            <g
              key={tokenKey(t.seat, t.token)}
              className={`tok tok-btn${t.progress === YARD ? " tok-ret" : ""}`}
              style={{ transform: `translate(${t.at.x}px, ${t.at.y}px)`, cursor: movable ? "pointer" : "default", outline: "none" }}
              role={movable ? "button" : "img"} aria-label={label} tabIndex={movable ? 0 : -1}
              onClick={activate}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}
              onPointerEnter={() => movable && setPreview(String(t.token))}
              onPointerLeave={() => setPreview(null)}
              onFocus={() => movable && setPreview(String(t.token))}
              onBlur={() => setPreview(null)}
            >
              <g transform={`scale(${t.scale})`}>
                {movable && hints && <circle className="tok-pulse" r={0.55} fill="#fff" fillOpacity={0.55} />}
                {movable && <circle r={0.72} fill="transparent" />}
                <g className={movable ? "tok-bounce" : IDLE_CLASS[design.idle]} style={{ animationDelay: `${(t.token * 0.4 + t.seat * 0.2).toFixed(1)}s` }}>
                <g key={t.progress} className={
                  state.winner === t.seat && t.progress === FINISH ? "tok-dance"
                    : t.progress === YARD ? "tok-spin" : "tok-hop"
                }>
                  <circle className="focus-ring" r={0.44} fill="none" stroke="transparent" strokeWidth={0.06} />
                  <g transform={`scale(${design.size})`}><PieceShape design={design} id={`p${t.seat}${t.token}`} upright={-rotation} /></g>
                  {symbols && (
                    <text y={0.02} textAnchor="middle" dominantBaseline="central" fontSize={0.4} fontWeight={800} fill="#fff"
                      transform={`rotate(${-rotation})`} aria-hidden>{info.glyph}</text>
                  )}
                </g>
                </g>
              </g>
            </g>
          );
        })}
        {bursts.map(b => (
          <g key={b.id} transform={`translate(${b.x} ${b.y})`} aria-hidden>
            {b.kind === "capture" && <circle className="shock" fill="none" stroke="#FACC15" r={0.2} />}
            {Array.from({ length: b.kind === "capture" ? 12 : b.kind === "home" ? 8 : TRAIL_STYLE[b.kind].n }, (_, i) => {
              const trail = b.kind === "capture" || b.kind === "home" ? null : TRAIL_STYLE[b.kind];
              const count = b.kind === "capture" ? 12 : b.kind === "home" ? 8 : trail!.n;
              const a = (i / count) * Math.PI * 2;
              const d = b.kind === "capture" ? 1.6 : b.kind === "home" ? 1.1 : trail!.d;
              const rise = trail?.rise;
              const dx = Math.cos(a) * d * (rise ? 0.5 : 1);
              const dy = rise ? -d * (0.6 + (i % 3) * 0.25) : trail ? -Math.abs(Math.sin(a)) * d * 0.5 : Math.sin(a) * d;
              return (
                <circle key={i} className={trail && b.kind !== "sparkle" ? "dust-dot" : "burst-dot"} r={trail ? trail.r : b.kind === "capture" ? 0.13 : 0.1}
                  fill={trail?.ring ? "none" : trail && b.kind !== "sparkle" ? b.color : i % 2 ? b.color : "#fff"}
                  stroke={trail?.ring ? b.color : undefined} strokeWidth={trail?.ring ? 0.03 : undefined}
                  style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties} />
              );
            })}
          </g>
        ))}
      </g>
      {turnSeat !== null && (
        <g key={`${state.turn}-${state.players.length}`} className="banner" aria-hidden style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <rect x={3.5} y={6.2} width={8} height={1.6} rx={0.8} fill={SEAT_INFO[turnSeat].dark} fillOpacity={0.92} stroke="#fff" strokeWidth={0.06} />
          <text x={7.5} y={7} textAnchor="middle" dominantBaseline="central" fontSize={0.7} fontWeight={800} fill="#fff">
            {turnName.length > 12 ? `${turnName.slice(0, 11)}…` : turnName}{"'s turn"}
          </text>
        </g>
      )}
    </svg>
  );
}
