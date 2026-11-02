"use client";

import type { ReactNode } from "react";
import { useCardStyle, type CardStyle, type Ornament } from "@/lib/client/cardStyle";
import { SUIT_PATHS } from "./Suit";

type Back = CardStyle["back"];

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
/** Mixes a colour with white (t > 0) or black (t < 0). */
export const shade = (hex: string, t: number): string => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, to = t >= 0 ? 255 : 0, k = Math.abs(t);
  return `#${[r, g, b].map(v => clamp(v + (to - v) * k).toString(16).padStart(2, "0")).join("")}`;
};
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/** Shapes for the medallion in the middle of a card back, each drawn in a 100 by 100 box. */
const ORNAMENT_PATHS: Record<Exclude<Ornament, "none">, ReactNode> = {
  crown: <g><path d="M12 72 L8 32 L30 50 L50 20 L70 50 L92 32 L88 72 Z" /><rect x="12" y="78" width="76" height="11" rx="3" /></g>,
  star: <path d="M50 6 L62 38 L96 39 L69 60 L79 93 L50 73 L21 93 L31 60 L4 39 L38 38 Z" />,
  spade: SUIT_PATHS[3], heart: SUIT_PATHS[2], diamond: SUIT_PATHS[1], club: SUIT_PATHS[0],
  moon: <path d="M60 6 A44 44 0 1 0 94 62 A36 36 0 1 1 60 6 Z" />,
  flame: <path d="M50 4 C60 24 84 38 80 63 C77 83 63 96 50 96 C35 96 21 83 23 64 C24 52 31 46 38 37 C40 50 46 52 50 47 C55 35 43 22 50 4 Z" />,
  paw: <g><ellipse cx="50" cy="66" rx="24" ry="20" /><ellipse cx="20" cy="42" rx="9" ry="12" /><ellipse cx="38" cy="26" rx="9" ry="13" /><ellipse cx="62" cy="26" rx="9" ry="13" /><ellipse cx="80" cy="42" rx="9" ry="12" /></g>,
  bolt: <path d="M60 4 L20 56 H44 L36 96 L80 40 H55 Z" />,
  gem: <g><path d="M24 14 H76 L96 40 L50 94 L4 40 Z" /></g>,
};

function Medallion({ back, light, dark, cx = 50, cy = 70, r = 24 }: { back: Back; light: string; dark: string; cx?: number; cy?: number; r?: number }) {
  const has = back.monogram || back.ornament !== "none";
  if (!has) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill={dark} opacity={0.55} />
      <circle cx={cx} cy={cy} r={r} fill={back.primary} stroke={light} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={light} strokeWidth={0.8} opacity={0.7} />
      {back.monogram ? (
        <text x={cx} y={cy + r * 0.36} textAnchor="middle" fontSize={r * (back.monogram.length > 1 ? 0.95 : 1.25)} fontWeight={800} fill={light} fontFamily="Georgia, 'Times New Roman', serif">{back.monogram}</text>
      ) : back.ornament !== "none" ? (
        <svg x={cx - r * 0.55} y={cy - r * 0.55} width={r * 1.1} height={r * 1.1} viewBox="0 0 100 100" fill={light}>{ORNAMENT_PATHS[back.ornament]}</svg>
      ) : null}
    </g>
  );
}

function Border({ back, light }: { back: Back; light: string }) {
  if (back.border === "none") return null;
  const corner = (x: number, y: number, sx: number, sy: number) => <path key={`${x}${y}`} d={`M${x} ${y + sy * 14} Q${x} ${y} ${x + sx * 14} ${y} M${x + sx * 3} ${y + sy * 3} m0 0 q${sx * 5} ${sy * 0.5} ${sx * 7} ${sy * 7}`} fill="none" stroke={light} strokeWidth={1.4} strokeLinecap="round" />;
  return (
    <g fill="none" stroke={light}>
      <rect x={5} y={5} width={90} height={130} rx={5} strokeWidth={back.border === "thin" ? 1.4 : 2.2} opacity={0.95} />
      {back.border !== "thin" && <rect x={9.5} y={9.5} width={81} height={121} rx={3} strokeWidth={0.9} opacity={0.8} />}
      {back.border === "ornate" && <g>{corner(12, 12, 1, 1)}{corner(88, 12, -1, 1)}{corner(12, 128, 1, -1)}{corner(88, 128, -1, -1)}</g>}
    </g>
  );
}

/** The repeating part of each design, as an SVG pattern. `u` is the pattern size in card units. */
function pattern(design: Back["design"], id: string, p: string, s: string, light: string, dark: string, u: number): ReactNode {
  const W = 100, H = 140;
  void W; void H;
  switch (design) {
    case "lattice":
      return <pattern id={id} width={u} height={u} patternUnits="userSpaceOnUse"><rect width={u} height={u} fill={p} /><path d={`M0 0 L${u} ${u} M${u} 0 L0 ${u}`} stroke={s} strokeWidth={1.5} /><circle cx={u / 2} cy={u / 2} r={1.6} fill={light} opacity={0.8} /><circle cx={0} cy={0} r={1.4} fill={light} opacity={0.6} /></pattern>;
    case "royal":
      return <pattern id={id} width={u} height={u * 1.3} patternUnits="userSpaceOnUse"><rect width={u} height={u * 1.3} fill={p} /><path d={`M${u / 2} 2 C${u * 0.75} ${u * 0.25} ${u * 0.75} ${u * 0.5} ${u / 2} ${u * 0.65} C${u * 0.25} ${u * 0.5} ${u * 0.25} ${u * 0.25} ${u / 2} 2 Z`} fill={s} opacity={0.75} /><circle cx={u / 2} cy={u * 0.95} r={2} fill={light} opacity={0.7} /><path d={`M0 ${u * 0.65} H${u} `} stroke={s} strokeWidth={0.6} opacity={0.5} /></pattern>;
    case "mandala":
      return <pattern id={id} width={u * 1.2} height={u * 1.2} patternUnits="userSpaceOnUse"><rect width={u * 1.2} height={u * 1.2} fill={p} /><g transform={`translate(${u * 0.6} ${u * 0.6})`} fill="none" stroke={s} strokeWidth={1.1}>{[0, 45, 90, 135].map(a => <ellipse key={a} rx={u * 0.42} ry={u * 0.15} transform={`rotate(${a})`} />)}<circle r={u * 0.12} fill={light} stroke="none" opacity={0.8} /></g></pattern>;
    case "waves":
      return <pattern id={id} width={u} height={u / 2} patternUnits="userSpaceOnUse"><rect width={u} height={u / 2} fill={p} />{[0, 1].map(i => <g key={i} fill="none" stroke={i ? s : light} strokeWidth={1.2} opacity={i ? 1 : 0.7}>{[0.5, 0.35, 0.2].map(r => <path key={r} d={`M${u / 2 - u * r + i * u} ${u / 2} a${u * r} ${u * r} 0 0 1 ${u * r * 2} 0`} />)}</g>)}{[0, 1].map(i => <g key={`b${i}`} fill="none" stroke={s} strokeWidth={1.2}>{[0.5, 0.35, 0.2].map(r => <path key={r} d={`M${-u * r} ${u / 2} a${u * r} ${u * r} 0 0 1 ${u * r * 2} 0`} transform={`translate(${i * u} ${-u / 4})`} />)}</g>)}</pattern>;
    case "stars":
      return <pattern id={id} width={u * 1.1} height={u * 1.1} patternUnits="userSpaceOnUse"><rect width={u * 1.1} height={u * 1.1} fill={dark} /><path transform={`translate(${u * 0.3} ${u * 0.3}) scale(.13)`} d="M50 6 L62 38 L96 39 L69 60 L79 93 L50 73 L21 93 L31 60 L4 39 L38 38 Z" fill={s} /><circle cx={u * 0.85} cy={u * 0.8} r={1.2} fill={light} /><circle cx={u * 0.15} cy={u * 0.9} r={0.9} fill={light} opacity={0.7} /></pattern>;
    case "argyle":
      return <pattern id={id} width={u} height={u * 1.4} patternUnits="userSpaceOnUse"><rect width={u} height={u * 1.4} fill={p} /><path d={`M${u / 2} 0 L${u} ${u * 0.7} L${u / 2} ${u * 1.4} L0 ${u * 0.7} Z`} fill={s} /><path d={`M0 0 L${u} ${u * 1.4} M${u} 0 L0 ${u * 1.4}`} stroke={light} strokeWidth={0.8} strokeDasharray="2 2.5" opacity={0.75} /></pattern>;
    case "circuit":
      return <pattern id={id} width={u} height={u} patternUnits="userSpaceOnUse"><rect width={u} height={u} fill={dark} /><path d={`M0 ${u * 0.3} H${u * 0.4} L${u * 0.55} ${u * 0.45} V${u} M${u * 0.7} 0 V${u * 0.25} L${u} ${u * 0.55}`} fill="none" stroke={s} strokeWidth={1.2} strokeLinejoin="round" /><circle cx={u * 0.4} cy={u * 0.3} r={1.8} fill={light} /><circle cx={u} cy={u * 0.55} r={1.8} fill={light} /><circle cx={u * 0.55} cy={u} r={1.8} fill={light} /></pattern>;
    case "leaves":
      return <pattern id={id} width={u} height={u} patternUnits="userSpaceOnUse"><rect width={u} height={u} fill={p} />{[[0.25, 0.25, 35], [0.75, 0.75, 35], [0.75, 0.25, -35], [0.25, 0.75, -35]].map(([x, y, a], i) => <g key={i} transform={`translate(${x * u} ${y * u}) rotate(${a})`}><ellipse rx={u * 0.2} ry={u * 0.09} fill={i % 2 ? s : light} opacity={i % 2 ? 0.95 : 0.6} /><path d={`M${-u * 0.2} 0 H${u * 0.2}`} stroke={dark} strokeWidth={0.6} opacity={0.6} /></g>)}</pattern>;
    case "deco":
      return <pattern id={id} width={u} height={u / 2} patternUnits="userSpaceOnUse"><rect width={u} height={u / 2} fill={p} />{[0, 1].map(i => <g key={i} transform={`translate(${i * u} ${u / 2})`} fill="none" stroke={i ? light : s} strokeWidth={1.1}>{[0.5, 0.38, 0.26, 0.14].map(r => <path key={r} d={`M${-u * r} 0 A${u * r} ${u * r} 0 0 1 ${u * r} 0`} />)}</g>)}{[0, 1].map(i => <g key={`d${i}`} transform={`translate(${i * u - u / 2} ${u / 4 * 2 + u / 2 - u / 2})`} fill="none" stroke={s} strokeWidth={1.1}>{[0.5, 0.38, 0.26, 0.14].map(r => <path key={r} d={`M${-u * r} 0 A${u * r} ${u * r} 0 0 1 ${u * r} 0`} />)}</g>)}</pattern>;
    case "scales":
      return <pattern id={id} width={u} height={u / 2} patternUnits="userSpaceOnUse"><rect width={u} height={u / 2} fill={p} /><g fill={shadeOf(s, 0)} stroke={dark} strokeWidth={0.9}><circle cx={0} cy={0} r={u / 2} /><circle cx={u} cy={0} r={u / 2} /><circle cx={u / 2} cy={u / 2} r={u / 2} fill={p} stroke={light} strokeOpacity={0.6} /></g><g fill="none" stroke={light} strokeWidth={0.8} opacity={0.5}><circle cx={u / 2} cy={u / 2} r={u / 3.2} /></g></pattern>;
    case "stripes":
      return <pattern id={id} width={u} height={u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={u} height={u} fill={p} /><rect width={u / 2} height={u} fill={s} /></pattern>;
    default:
      return <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse"><rect width={4} height={4} fill={p} /></pattern>;
  }
}
const shadeOf = (c: string, t: number) => shade(c, t);

/** Which size of repeat looks right for each design. */
const UNIT: Record<Back["design"], number> = { lattice: 14, royal: 16, mandala: 24, waves: 20, stars: 22, argyle: 20, circuit: 22, leaves: 22, deco: 22, scales: 18, stripes: 10, plain: 4 };

/** The back of a playing card, drawn as scalable art, from the player's own style (or a given one for the preview). */
export function CardBackArt({ back }: { back: Back }) {
  const p = back.primary, s = back.secondary, light = shade(p, 0.7), dark = shade(p, -0.45), id = `cb${hash(JSON.stringify(back))}`;
  const u = UNIT[back.design] * back.scale;
  const rich = back.design === "royal" || back.design === "mandala";
  const medal = back.monogram || back.ornament !== "none" ? back : rich ? { ...back, ornament: (back.design === "royal" ? "crown" : "star") as Ornament } : back;
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden style={{ display: "block" }}>
      <defs>{pattern(back.design, id, p, s, light, dark, u)}</defs>
      <rect width={100} height={140} fill={`url(#${id})`} />
      <Border back={back} light={light} />
      <Medallion back={medal} light={light} dark={dark} />
    </svg>
  );
}

/** A card back that follows the player's chosen style: use it wherever a face-down card is drawn. */
export function CardBackFace({ back }: { back?: Back }) {
  const [style] = useCardStyle();
  return <CardBackArt back={back ?? style.back} />;
}
