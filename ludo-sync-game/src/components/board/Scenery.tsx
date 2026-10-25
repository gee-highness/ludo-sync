"use client";

import { Box } from "@chakra-ui/react";
import { useMemo } from "react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { islandFor, useIslands } from "@/lib/client/islands";
import { resolveDesign, useDesigns } from "@/lib/client/pieces";
import { SKIES, scenePlan, trafficPlan, weatherPlan, type DayPhase, type Weather } from "@/lib/client/scenery";
import { BuildingShape } from "./BuildingGlyph";
import { VehicleShape } from "./VehicleShape";

const CSS = `
  .sc-cloud { animation: scCloud var(--d) linear infinite; animation-delay: var(--delay); }
  .sc-drive { animation: scDrive var(--d) linear infinite; animation-delay: var(--delay); }
  .sc-star { animation: scStar 3.4s ease-in-out infinite; animation-delay: var(--delay); }
  .sc-rain { animation: scRain var(--d) linear infinite; animation-delay: var(--delay); }
  .sc-snow { animation: scSnow var(--d) linear infinite; animation-delay: var(--delay); }
  .sc-glow { animation: scGlow 4s ease-in-out infinite; }
  @keyframes scCloud { from { transform: translateX(-140px); } to { transform: translateX(560px); } }
  @keyframes scDrive { from { transform: translateX(-80px); } to { transform: translateX(480px); } }
  @keyframes scStar { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
  @keyframes scRain { from { transform: translateY(-30px); } to { transform: translateY(830px); } }
  @keyframes scSnow { from { transform: translate(0,-20px); } 50% { transform: translate(14px,400px); } to { transform: translate(-4px,820px); } }
  @keyframes scGlow { 0%,100% { opacity: .75; } 50% { opacity: 1; } }
  .sc-still .sc-cloud, .sc-still .sc-drive, .sc-still .sc-star, .sc-still .sc-rain, .sc-still .sc-snow, .sc-still .sc-glow { animation: none; }
`;

interface Props {
  phase: DayPhase;
  weather: Weather;
  traffic: boolean;
  seats: Seat[];
  reduceMotion: boolean;
  seed?: number;
}

/** The world behind the flat board: a sky for the time of day, hills, a skyline made of the players' own island buildings, trees, lamps, a road with traffic, and weather. */
export default function Scenery({ phase, weather, traffic, seats, reduceMotion, seed = 3 }: Props) {
  const sky = SKIES[phase];
  const islands = useIslands();
  const designs = useDesigns();
  const props = useMemo(() => scenePlan(seed, seats), [seed, seats]);
  const drops = useMemo(() => weatherPlan(weather, seed), [weather, seed]);
  const cars = useMemo(() => (traffic ? trafficPlan(seed, seats) : []), [traffic, seed, seats]);
  const stars = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ x: (i * 97) % 400, y: 20 + ((i * 53) % 300), r: 0.6 + (i % 3) * 0.5, d: -((i * 7) % 30) / 10 })), []);
  return (
    <Box
      position="absolute" inset={0} zIndex={0} pointerEvents="none" aria-hidden overflow="hidden" className={reduceMotion ? "sc-still" : undefined}
      style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.bottom} 62%)`, transition: "background 1.2s" }}
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" style={{ display: "block" }}>
        <defs>
          <radialGradient id="sc-orb"><stop offset="0.3" stopColor={sky.orb.glow} stopOpacity={0.9} /><stop offset="1" stopColor={sky.orb.glow} stopOpacity={0} /></radialGradient>
          <radialGradient id="sc-lamp"><stop offset="0" stopColor="#fff4b8" stopOpacity={0.95} /><stop offset="1" stopColor="#fff4b8" stopOpacity={0} /></radialGradient>
        </defs>
        {sky.stars && stars.map((s, i) => <circle key={i} className="sc-star" cx={s.x} cy={s.y} r={s.r} fill="#fff" style={{ ["--delay" as string]: `${s.d}s` }} />)}
        <circle cx={sky.orb.x} cy={sky.orb.y} r={sky.orb.r * 3} fill="url(#sc-orb)" />
        <circle cx={sky.orb.x} cy={sky.orb.y} r={sky.orb.r} fill={sky.orb.fill} />
        {[[40, 70, 1, 110], [150, 120, 0.8, 140], [260, 40, 1.2, 100]].map(([x, y, s, d], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <g className="sc-cloud" style={{ ["--d" as string]: `${d}s`, ["--delay" as string]: `${-i * 31}s` }} fill={sky.cloud} fillOpacity={phase === "night" ? 0.35 : 0.8}>
              <ellipse cx={0} cy={0} rx={34} ry={11} /><ellipse cx={-16} cy={-7} rx={18} ry={11} /><ellipse cx={14} cy={-9} rx={22} ry={13} />
            </g>
          </g>
        ))}
        <path d="M0 560 Q 80 505 170 548 T 330 528 T 400 548 V800 H0Z" fill={sky.far} />
        {props.filter(p => p.kind === "building").map((p, i) => {
          const seat = p.seat as Seat;
          const s = p.size;
          return (
            <g key={i} transform={`translate(${p.x} ${560 - 92 * s}) scale(${s})`} opacity={phase === "night" ? 0.9 : 1}>
              <BuildingShape style={{ ...islandFor(seat, islands, SEAT_INFO[seat].main), ground: "slab", extras: [] }} level={p.level ?? 2} />
            </g>
          );
        })}
        <path d="M0 645 Q 110 600 230 640 T 400 622 V800 H0Z" fill={sky.near} />
        {props.filter(p => p.kind === "tree" || p.kind === "pine").map((p, i) => (
          <g key={i} transform={`translate(${p.x} 650) scale(${p.size})`}>
            <rect x={-2} y={-14} width={4} height={14} fill="#3b2a1a" />
            {p.kind === "tree" ? <circle cx={0} cy={-26} r={14} fill="#2f8f46" /> : <polygon points="0,-48 12,-10 -12,-10" fill="#256f3a" />}
            {p.kind === "tree" && <circle cx={-5} cy={-30} r={6} fill="#fff" fillOpacity={0.08} />}
          </g>
        ))}
        {props.filter(p => p.kind === "lamp").map((p, i) => (
          <g key={i} transform={`translate(${p.x} 652)`}>
            <rect x={-1.5} y={-46} width={3} height={46} fill="#1f2937" />
            <rect x={-1.5} y={-48} width={11} height={3} fill="#1f2937" />
            {sky.lit && <circle className="sc-glow" cx={8} cy={-42} r={22} fill="url(#sc-lamp)" />}
            <circle cx={8} cy={-44} r={3} fill={sky.lit ? "#fff4b8" : "#9ca3af"} />
          </g>
        ))}
        <rect x={0} y={715} width={400} height={85} fill="#23272f" />
        <rect x={0} y={715} width={400} height={3} fill="#f8fafc" fillOpacity={0.55} />
        <line x1={0} y1={757} x2={400} y2={757} stroke="#f8fafc" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="16 14" />
        {cars.map((c, i) => {
          const d = resolveDesign({ ...designs[c.seat][i % 4], vehicle: c.vehicle, headlights: true, mark: "", accessory: "none" }, c.seat);
          const y = c.lane === 0 ? 736 : 779;
          return (
            <g key={i} transform={`translate(0 ${y})`}>
              <g className="sc-drive" style={{ ["--d" as string]: `${c.dur}s`, ["--delay" as string]: `${c.delay}s` }}>
                <g transform={`${c.lane === 0 ? "rotate(90)" : "translate(0 0) rotate(-90)"} scale(34)`}><VehicleShape design={d} id={`sc${i}`} /></g>
              </g>
            </g>
          );
        })}
      </svg>
      {drops.length > 0 && (
        <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block" }}>
          {drops.map((d, i) => weather === "rain"
            ? <rect key={i} className="sc-rain" x={d.x * 4} y={0} width={d.size} height={16} fill="#cfe6ff" fillOpacity={0.55} style={{ ["--d" as string]: `${d.dur}s`, ["--delay" as string]: `${d.delay}s` }} />
            : <circle key={i} className="sc-snow" cx={d.x * 4} cy={0} r={d.size} fill="#fff" fillOpacity={0.85} style={{ ["--d" as string]: `${d.dur}s`, ["--delay" as string]: `${d.delay}s` }} />)}
        </svg>
      )}
      {weather === "rain" && <Box position="absolute" inset={0} bg="rgba(15,23,42,.18)" />}
    </Box>
  );
}
