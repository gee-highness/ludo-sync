"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FINISH, SEATS, SEAT_INFO, SEAT_DIRECTION, YARD, cellInfo, pointOf, type Seat,
} from "@/lib/ludo/board";
import type { MoveOption } from "@/lib/ludo/types";
import type { BoardProps } from "./types";
import { placeTokens, seatTokens, tokenKey, type TokenView } from "./layout";

const CELL = 1;
const INACTIVE = "#4A5568";

interface Burst { id: number; x: number; y: number; color: string; big: boolean }

const optionsByToken = (options: MoveOption[]) => {
  const map = new Map<number, MoveOption[]>();
  for (const o of options) map.set(o.token, [...(map.get(o.token) ?? []), o]);
  return map;
};

const CSS = `
  .tok { transition: transform var(--hop) linear; }
  .tok-ret { transition-timing-function: cubic-bezier(.3,.7,.3,1); }
  .tok-hop { animation: tokHop var(--hop) ease-out; }
  .tok-pulse { animation: tokPulse 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .burst-dot { animation: burst .75s ease-out forwards; }
  .ghost { animation: ghost 1.2s ease-in-out infinite; }
  @keyframes tokHop { 0%{transform:translateY(0)} 45%{transform:translateY(-.5px)} 100%{transform:translateY(0)} }
  @keyframes tokPulse { 0%,100%{transform:scale(1);opacity:.95} 50%{transform:scale(1.3);opacity:.35} }
  @keyframes burst { from{transform:translate(0,0) scale(1);opacity:1} to{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0} }
  @keyframes ghost { 0%,100%{opacity:.9} 50%{opacity:.35} }
  .reduce .tok-hop, .reduce .tok-pulse, .reduce .burst-dot, .reduce .ghost { animation: none; }
  .tok-btn:focus-visible .focus-ring { stroke: #fff; stroke-width: .09; }
`;

/** The flat board: an SVG that scales to any screen, rotated so `viewSeat` sits at the bottom. */
export default function Board2D({
  state, viewSeat, options, onPick, symbols, hints, reduceMotion, hopMs,
}: BoardProps) {
  const rotation = -90 * viewSeat;
  const playing = useMemo(() => new Set(state.players.map(p => p.seat)), [state.players]);
  const byToken = useMemo(() => optionsByToken(options), [options]);
  const interactiveSeat = options.length ? state.players[state.turn].seat : null;
  const [preview, setPreview] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const prev = useRef<Map<string, number>>(new Map());
  const burstId = useRef(0);

  const tokens = useMemo(() => seatTokens(state), [state]);

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
        fresh.push({ id: ++burstId.current, x: p.x, y: p.y, color: "#FACC15", big: true });
      } else if (before < FINISH && t.progress === FINISH) {
        fresh.push({ id: ++burstId.current, x: t.point.x, y: t.point.y, color: SEAT_INFO[t.seat].light, big: false });
      }
    }
    prev.current = next;
    if (!fresh.length) return;
    setBursts(b => [...b, ...fresh]);
    const ids = new Set(fresh.map(f => f.id));
    const timer = setTimeout(() => setBursts(b => b.filter(x => !ids.has(x.id))), 900);
    return () => clearTimeout(timer);
  }, [tokens]);

  const placed = useMemo(() => {
    const movableLast = (t: TokenView) => (t.seat === interactiveSeat && byToken.has(t.token) ? 1 : 0);
    return placeTokens(tokens).sort((x, y) => movableLast(x) - movableLast(y));
  }, [tokens, interactiveSeat, byToken]);

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const info = cellInfo(row, col);
      if (info.kind === "void" || info.kind === "yard" || info.kind === "centre") continue;
      const seatInfo = info.seat !== undefined ? SEAT_INFO[info.seat] : null;
      const active = info.seat === undefined || playing.has(info.seat);
      let fill = "#F7FAFC";
      if (info.kind === "column") fill = active ? seatInfo!.light : "#A0AEC0";
      if (info.kind === "start") fill = active ? seatInfo!.main : INACTIVE;
      cells.push(
        <g key={`${row}-${col}`}>
          <rect x={col - 0.5} y={row - 0.5} width={CELL} height={CELL} fill={fill} stroke="#A0AEC0" strokeWidth={0.04} />
          {info.kind === "star" && (
            <text x={col} y={row + 0.05} textAnchor="middle" dominantBaseline="central" fontSize={0.78} fill="#D69E2E"
              transform={`rotate(${-rotation} ${col} ${row})`} aria-hidden>★</text>
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
        <rect x={x0} y={y0} width={6} height={6} fill={active ? info.main : INACTIVE} />
        <rect x={x0 + 0.9} y={y0 + 0.9} width={4.2} height={4.2} rx={0.5} fill="#fff" fillOpacity={active ? 0.88 : 0.35} />
        {[0, 1, 2, 3].map(i => {
          const p = pointOf(seat, i, YARD);
          return <circle key={i} cx={p.x} cy={p.y} r={0.46} fill={active ? info.main : INACTIVE} fillOpacity={0.28} stroke={active ? info.dark : "#2D3748"} strokeWidth={0.06} />;
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
      <rect x={-0.5} y={-0.5} width={15} height={15} rx={0.6} fill="#1A202C" />
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
                <g key={t.progress} className="tok-hop">
                  <ellipse cy={0.3} rx={0.34} ry={0.12} fill="#000" fillOpacity={0.25} />
                  <circle className="focus-ring" r={0.38} fill={`url(#tok-${t.seat})`} stroke={movable ? "#fff" : "#fff"} strokeOpacity={movable ? 1 : 0.85} strokeWidth={movable ? 0.09 : 0.06} />
                  <circle cx={-0.12} cy={-0.14} r={0.1} fill="#fff" fillOpacity={0.6} />
                  {symbols && (
                    <text y={0.02} textAnchor="middle" dominantBaseline="central" fontSize={0.4} fontWeight={800} fill="#fff"
                      transform={`rotate(${-rotation})`} aria-hidden>{info.glyph}</text>
                  )}
                </g>
              </g>
            </g>
          );
        })}
        {bursts.map(b => (
          <g key={b.id} transform={`translate(${b.x} ${b.y})`} aria-hidden>
            {Array.from({ length: b.big ? 12 : 8 }, (_, i) => {
              const a = (i / (b.big ? 12 : 8)) * Math.PI * 2;
              const d = b.big ? 1.6 : 1.1;
              return (
                <circle key={i} className="burst-dot" r={b.big ? 0.13 : 0.1} fill={i % 2 ? b.color : "#fff"}
                  style={{ "--dx": `${Math.cos(a) * d}px`, "--dy": `${Math.sin(a) * d}px` } as React.CSSProperties} />
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}
