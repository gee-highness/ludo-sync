"use client";

import { useEffect, useMemo, useState } from "react";
import { useSettings, type TimeOfDay } from "@/lib/client/settings";
import { useCapabilities } from "@/lib/client/device";

interface Tod {
  sky: string;
  /** Scrim darkness at the top and bottom, so white UI text always reads. */
  far: string; mid: string; near: string; road: string; walk: string;
  lit: number; stars: number; lamp: number; neon: number; clouds: string; cloudOp: number;
}

const TODS: Record<TimeOfDay, Tod> = {
  day: { sky: "linear-gradient(#4C9BEA 0%, #8EC8F6 55%, #CDE8FB 100%)", far: "#8FA9C9", mid: "#6F86A8", near: "#4F6283", road: "#3A4152", walk: "#8A93A6",
    lit: 0.07, stars: 0, lamp: 0, neon: 0.45, clouds: "#fff", cloudOp: 0.9 },
  dusk: { sky: "linear-gradient(#1B2559 0%, #5A3F86 38%, #C9697E 68%, #F4A262 100%)", far: "#4A4274", mid: "#322D5A", near: "#221F44", road: "#1B1D31", walk: "#4A4766",
    lit: 0.55, stars: 0.4, lamp: 0.7, neon: 1, clouds: "#F2A4A0", cloudOp: 0.45 },
  night: { sky: "linear-gradient(#040817 0%, #0B1431 55%, #1B2850 100%)", far: "#18224A", mid: "#10173A", near: "#0A0F29", road: "#0C0F1F", walk: "#2A3050",
    lit: 0.88, stars: 1, lamp: 1, neon: 1, clouds: "#5D6A9A", cloudOp: 0.22 },
};

/** Small deterministic generator, so the city looks the same on every visit and on server and client alike. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const H = 700;
const BASE = 585;
const WARM = ["#FFD27A", "#FFE6A3", "#FFC15E", "#FFF1C4"];
const COOL = "#9EE7FF";
const NEON = [
  { text: "BAR", color: "#FF4DA6" }, { text: "KARAOKE", color: "#4DE1FF" }, { text: "PIZZA", color: "#FF9F43" }, { text: "CAFÉ", color: "#7CFF6B" },
];
const SUITS = ["#1E2740", "#2D2D3A", "#3A2F4B", "#223B4F"];
const PARTY = ["#FF5C8A", "#FFC145", "#5CE1E6", "#B28DFF", "#7CFF6B"];
const CARS = ["#D94B4B", "#E3B341", "#4B8FD9", "#E8E8F0", "#59B26B"];

const CSS = `
  .cb-twinkle1 { animation: cbTw 5s ease-in-out infinite; }
  .cb-twinkle2 { animation: cbTw 7s ease-in-out -2s infinite; }
  .cb-twinkle3 { animation: cbTw 9s ease-in-out -4s infinite; }
  .cb-win1 { animation: cbWin 11s ease-in-out infinite; }
  .cb-win2 { animation: cbWin 15s ease-in-out -6s infinite; }
  .cb-blink { animation: cbBlink 3.2s steps(1) infinite; }
  .cb-blink2 { animation: cbBlink 4.6s steps(1) -1.4s infinite; }
  .cb-cloud { animation: cbDrift var(--d) linear var(--delay) infinite; }
  .cb-carR { animation: cbDriveR var(--d) linear var(--delay) infinite; }
  .cb-carL { animation: cbDriveL var(--d) linear var(--delay) infinite; }
  .cb-walkR { animation: cbWalkR var(--d) linear var(--delay) infinite; }
  .cb-walkL { animation: cbWalkL var(--d) linear var(--delay) infinite; }
  .cb-bob { animation: cbBob .7s ease-in-out infinite; }
  @keyframes cbTw { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
  @keyframes cbWin { 0%,100% { opacity: 1 } 45% { opacity: .55 } 60% { opacity: .9 } }
  @keyframes cbBlink { 0%,100% { opacity: 1 } 88% { opacity: .35 } 94% { opacity: 1 } 97% { opacity: .5 } }
  @keyframes cbDrift { from { transform: translateX(-260px) } to { transform: translateX(var(--w)) } }
  @keyframes cbDriveR { from { transform: translateX(-160px) } to { transform: translateX(var(--w)) } }
  @keyframes cbDriveL { from { transform: translateX(var(--w)) } to { transform: translateX(-160px) } }
  @keyframes cbWalkR { from { transform: translateX(-40px) } to { transform: translateX(var(--w)) } }
  @keyframes cbWalkL { from { transform: translateX(var(--w)) } to { transform: translateX(-40px) } }
  @keyframes cbBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.6px) } }
  .cb-calm * { animation: none !important; }
`;

interface Building { x: number; w: number; h: number }

const skyline = (rand: () => number, width: number, min: number, max: number, minH: number, maxH: number): Building[] => {
  const out: Building[] = [];
  let x = -20 - rand() * 30;
  while (x < width + 20) {
    const w = min + rand() * (max - min);
    out.push({ x, w, h: minH + rand() * (maxH - minH) });
    x += w - 4 + rand() * 6;
  }
  return out;
};

interface Props {
  timeOfDay: TimeOfDay;
  /** Hold everything still. */
  calm?: boolean;
}

/** A night-out-in-the-city backdrop: skyline, lit windows, neon, traffic and people heading out after work. Purely decorative. */
export function CityBackdrop({ timeOfDay, calm = false }: Props) {
  const [settings] = useSettings();
  const caps = useCapabilities();
  const reduce = calm || settings.motion === "reduce" || (settings.motion === "auto" && !!caps?.reducedMotion);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const measure = () => {
      const w = Math.round(((window.innerWidth / Math.max(window.innerHeight, 1)) * H) / 100) * 100;
      setWidth(Math.min(900, Math.max(400, w)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const tod = TODS[timeOfDay];
  const scene = useMemo(() => {
    const rand = rng(20240607);
    const stars = Array.from({ length: 18 }, () => ({ x: rand() * width, y: 12 + rand() * 280, r: 0.7 + rand() * 1.1, g: Math.floor(rand() * 3) }));
    const clouds = Array.from({ length: 3 }, (_, i) => ({ y: 70 + i * 55 + rand() * 30, scale: 0.8 + rand() * 0.8, d: 110 + rand() * 80, delay: -rand() * 150 }));
    const far = skyline(rand, width, 70, 120, 230, 430);
    const mid = skyline(rand, width, 80, 130, 170, 340).map(b => ({
      ...b,
      wins: Array.from({ length: 4 }, () => ({ cx: Math.floor(rand() * Math.max(1, Math.floor((b.w - 12) / 14))), cy: Math.floor(rand() * Math.max(1, Math.floor((b.h - 30) / 20))), c: rand() < 0.15 ? COOL : WARM[Math.floor(rand() * 4)], on: rand() })),
      g: rand() < 0.5 ? 1 : 2,
    }));
    const near = skyline(rand, width, 120, 180, 130, 260).map((b, i) => ({
      ...b,
      wins: Array.from({ length: 4 }, () => ({ cx: Math.floor(rand() * Math.max(1, Math.floor((b.w - 16) / 22))), cy: Math.floor(rand() * Math.max(1, Math.floor((b.h - 80) / 28))), c: rand() < 0.2 ? COOL : WARM[Math.floor(rand() * 4)], on: rand() })),
      shop: i % 3 !== 2, sign: NEON[i % NEON.length], awning: PARTY[Math.floor(rand() * PARTY.length)], g: i % 2 ? 1 : 2,
    }));
    const lamps = Array.from({ length: Math.max(3, Math.floor(width / 210)) }, (_, i) => 60 + i * (width - 100) / Math.max(1, Math.floor(width / 210) - 1) + rand() * 30);
    const trees = Array.from({ length: Math.max(3, Math.floor(width / 220)) }, (_, i) => 130 + i * 220 + rand() * 40).filter(x => x < width - 20);
    const cars = Array.from({ length: Math.max(3, Math.floor(width / 280)) }, (_, i) => ({ lane: i % 2, color: CARS[i % CARS.length], d: 16 + rand() * 12, delay: -rand() * 28 }));
    const people = Array.from({ length: Math.max(5, Math.floor(width / 170)) }, (_, i) => {
      const party = i % 3 === 2;
      return { dir: i % 2, color: party ? PARTY[i % PARTY.length] : SUITS[i % SUITS.length], party, case_: !party && rand() < 0.7, d: 55 + rand() * 40, delay: -rand() * 90 };
    });
    return { stars, clouds, far, mid, near, lamps, trees, cars, people };
  }, [width]);

  const w = width;
  const lit = tod.lit;
  const night = timeOfDay === "night";
  const sunY = timeOfDay === "dusk" ? 455 : 120;
  const layer = (children: React.ReactNode, animated = false) => (
    <svg viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="xMidYMax slice" width="100%" height="100%" className={animated && reduce ? "cb-calm" : undefined}
      style={{ display: "block", position: "absolute", inset: 0, willChange: "transform", contain: "strict" }}>
      {animated && <style>{CSS}</style>}
      {children}
    </svg>
  );
  // Four stacked layers, so that only the small moving ones repaint: sky, clouds, the static city, and traffic with signs.
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none", background: tod.sky }}>
      {layer(<>
        {tod.stars > 0 && <g fill="#fff" opacity={tod.stars}>{scene.stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} />)}</g>}
        {timeOfDay === "night" ? (
          <g>
            <circle cx={w * 0.78} cy={110} r={64} fill="#9DB4FF" opacity={0.12} />
            <circle cx={w * 0.78} cy={110} r={26} fill="#F4F1DE" />
            <circle cx={w * 0.78 - 8} cy={104} r={5} fill="#D8D4BE" /><circle cx={w * 0.78 + 7} cy={118} r={3.5} fill="#D8D4BE" />
          </g>
        ) : (
          <g>
            <circle cx={w * (timeOfDay === "dusk" ? 0.28 : 0.8)} cy={sunY} r={timeOfDay === "dusk" ? 90 : 70} fill={timeOfDay === "dusk" ? "#FFB070" : "#FFF3B0"} opacity={0.32} />
            <circle cx={w * (timeOfDay === "dusk" ? 0.28 : 0.8)} cy={sunY} r={timeOfDay === "dusk" ? 38 : 32} fill={timeOfDay === "dusk" ? "#FFD08A" : "#FFE98A"} />
          </g>
        )}
      </>)}
      {layer(
        <g fill={tod.clouds} opacity={tod.cloudOp}>
          {scene.clouds.map((c, i) => (
            <g key={i} className="cb-cloud" style={{ "--d": `${c.d}s`, "--delay": `${c.delay}s`, "--w": `${w + 300}px` } as React.CSSProperties}>
              <g transform={`translate(0 ${c.y}) scale(${c.scale})`}><ellipse cx={0} cy={0} rx={46} ry={13} /><ellipse cx={-22} cy={-8} rx={24} ry={12} /><ellipse cx={18} cy={-11} rx={28} ry={14} /></g>
            </g>
          ))}
        </g>, true)}
      {layer(<>
        <g fill={tod.far}>{scene.far.map((b, i) => <rect key={i} x={b.x} y={BASE - b.h} width={b.w} height={b.h} />)}</g>
        <g>
          {scene.mid.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={BASE - b.h} width={b.w} height={b.h} fill={tod.mid} />
              {b.wins.filter(x => x.on < lit).map((x, j) => <rect key={j} x={b.x + 7 + x.cx * 14} y={BASE - b.h + 12 + x.cy * 20} width={7} height={9} fill={x.c} />)}
            </g>
          ))}
        </g>
        <g>
          {scene.near.map((b, i) => {
            const top = BASE - b.h;
            return (
              <g key={i}>
                <rect x={b.x} y={top} width={b.w} height={b.h} fill={tod.near} />
                <rect x={b.x} y={top} width={b.w} height={4} fill="#000" opacity={0.25} />
                {b.wins.filter(x => x.on < lit + 0.1).map((x, j) => <rect key={j} x={b.x + 9 + x.cx * 22} y={top + 14 + x.cy * 28} width={12} height={16} fill={x.c} />)}
                {b.shop && (
                  <g>
                    <rect x={b.x + 8} y={BASE - 52} width={b.w - 16} height={52} fill="#FFC15E" opacity={0.15 + 0.7 * lit} />
                    <rect x={b.x + 14} y={BASE - 44} width={b.w - 28} height={44} fill="#FFE6A3" opacity={0.12 + 0.55 * lit} />
                    <path d={`M${b.x + 6} ${BASE - 52} h${b.w - 12} l-6 -12 h${-(b.w - 24)} z`} fill={b.awning} opacity={0.9} />
                  </g>
                )}
              </g>
            );
          })}
        </g>
        <rect x={0} y={BASE} width={w} height={H - BASE} fill={tod.road} />
        <rect x={0} y={BASE} width={w} height={16} fill={tod.walk} />
        <rect x={0} y={BASE + 16} width={w} height={3} fill="#000" opacity={0.3} />
        <line x1={0} x2={w} y1={650} y2={650} stroke="#F2D96B" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="26 22" />
        {scene.trees.map((x, i) => (
          <g key={i}>
            <rect x={x - 2.5} y={BASE - 26} width={5} height={30} fill="#3A2A22" />
            <circle cx={x} cy={BASE - 40} r={20} fill={night ? "#10301F" : timeOfDay === "dusk" ? "#23502F" : "#3E8E4F"} />
            <circle cx={x - 12} cy={BASE - 30} r={13} fill={night ? "#0D2A1A" : timeOfDay === "dusk" ? "#1E4929" : "#357E44"} />
          </g>
        ))}
        {scene.lamps.map((x, i) => (
          <g key={i}>
            <rect x={x - 1.5} y={BASE - 62} width={3} height={66} fill="#10131F" />
            <circle cx={x} cy={BASE - 64} r={46} fill="#FFD27A" opacity={0.2 * tod.lamp} />
            <circle cx={x} cy={BASE - 64} r={5} fill={tod.lamp > 0 ? "#FFE9A8" : "#9AA3B8"} />
          </g>
        ))}
      </>)}
      {layer(<>
        {scene.near.map((b, i) => b.shop && (
          <text key={`sign${i}`} x={b.x + b.w / 2} y={BASE - 74} textAnchor="middle" fontSize={14} fontWeight={800} fill={b.sign.color} opacity={tod.neon}
            className={i % 2 ? "cb-blink" : "cb-blink2"} style={{ letterSpacing: 1 }}>{b.sign.text}</text>
        ))}
        {scene.people.map((p, i) => (
          <g key={i} className={p.dir ? "cb-walkL" : "cb-walkR"} style={{ "--d": `${p.d}s`, "--delay": `${p.delay}s`, "--w": `${w + 40}px` } as React.CSSProperties}>
            <rect x={-4} y={BASE - 20} width={8} height={15} rx={3} fill={p.color} />
            <circle cx={0} cy={BASE - 25} r={4.2} fill="#E8C7A0" />
            {p.case_ && <rect x={p.dir ? -9 : 5} y={BASE - 10} width={6} height={5} fill="#7A4B2A" />}
            {p.party && <circle cx={0} cy={BASE - 30} r={2} fill="#FFC145" />}
          </g>
        ))}
        {scene.cars.map((c, i) => (
          <g key={i} className={c.lane ? "cb-carL" : "cb-carR"} style={{ "--d": `${c.d}s`, "--delay": `${c.delay}s`, "--w": `${w + 160}px` } as React.CSSProperties}>
            <g transform={`translate(0 ${c.lane ? 668 : 626})`}>
              <rect x={0} y={-14} width={62} height={16} rx={5} fill={c.color} />
              <rect x={14} y={-24} width={32} height={13} rx={5} fill={c.color} />
              <rect x={19} y={-22} width={22} height={9} rx={2} fill="#BFD9F2" opacity={0.75} />
              <circle cx={14} cy={3} r={5} fill="#0A0C14" /><circle cx={48} cy={3} r={5} fill="#0A0C14" />
              <circle cx={c.lane ? -4 : 66} cy={-6} r={9} fill="#FFF3B0" opacity={0.25 + 0.5 * tod.lamp} />
              <rect x={c.lane ? 0 : 59} y={-9} width={3} height={4} fill="#FFF3B0" />
              <rect x={c.lane ? 59 : 0} y={-9} width={3} height={4} fill="#FF4040" />
            </g>
          </g>
        ))}
      </>, true)}
      {/* keeps white interface text readable over any time of day */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(8,12,28,.62) 0%, rgba(8,12,28,.12) 22%, rgba(8,12,28,0) 55%, rgba(8,12,28,.5) 100%)" }} />
    </div>
  );
}
