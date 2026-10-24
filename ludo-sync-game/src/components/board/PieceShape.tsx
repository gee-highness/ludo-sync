"use client";

import { outlineOf, pathOf } from "@/lib/client/pieceShapes";
import { shade, type ResolvedDesign } from "@/lib/client/pieces";

interface Props {
  design: ResolvedDesign;
  /** The video's look for default pieces: a gold or silver metal figurine on a pedestal ringed in the seat colour. */
  metal?: "gold" | "silver";
  /** Unique within the page; names the gradients and clip this piece uses. */
  id: string;
  /** Counter-rotation so a mark stays upright when the board is turned. */
  upright?: number;
}

/** Overlay marks for each pattern, drawn inside the piece's clip in a box from -0.5 to 0.5. */
const PatternMarks = ({ design }: { design: ResolvedDesign }) => {
  const c = design.secondary;
  const o = 0.35 + 0.65 * design.patternStrength;
  switch (design.pattern) {
    case "stripes":
      return <g transform="rotate(35)" fill={c} fillOpacity={o}>{Array.from({ length: 9 }, (_, i) => <rect key={i} x={-0.8 + i * 0.2} y={-0.8} width={0.09} height={1.6} />)}</g>;
    case "dots":
      return <g fill={c} fillOpacity={o}>{Array.from({ length: 25 }, (_, i) => {
        const r = Math.floor(i / 5), k = i % 5;
        return <circle key={i} cx={-0.4 + k * 0.2 + (r % 2) * 0.1} cy={-0.4 + r * 0.2} r={0.065} />;
      })}</g>;
    case "checks":
      return <g fill={c} fillOpacity={o}>{Array.from({ length: 25 }, (_, i) => {
        const r = Math.floor(i / 5), k = i % 5;
        return (r + k) % 2 ? <rect key={i} x={-0.5 + k * 0.2} y={-0.5 + r * 0.2} width={0.2} height={0.2} /> : null;
      })}</g>;
    case "rings":
      return <g fill="none" stroke={c} strokeOpacity={o} strokeWidth={0.07}>{[0.1, 0.25, 0.4].map(r => <circle key={r} r={r} />)}</g>;
    case "split":
      return <rect x={-0.5} y={-0.5} width={0.5} height={1} fill={c} fillOpacity={o} />;
    case "zigzag":
      return <polyline points="-0.5,-0.25 -0.3,-0.05 -0.1,-0.25 0.1,-0.05 0.3,-0.25 0.5,-0.05" transform="translate(0 0.15) scale(1 1.4)" fill="none" stroke={c} strokeOpacity={o} strokeWidth={0.1} />;
    default:
      return null;
  }
};

/** One piece drawn in the flat board's coordinates, centred on (0, 0) and about 0.8 across. */
const METAL = {
  gold: ["#fff3b8", "#f0b429", "#8a5a08"],
  silver: ["#ffffff", "#b9c2d0", "#586272"],
} as const;

/** A metal figurine on a round pedestal; the seat colour shows as the ring and glow around the base. */
function Figurine({ design, id, metal }: { design: ResolvedDesign; id: string; metal: "gold" | "silver" }) {
  const [hi, mid, lo] = METAL[metal];
  const body = pathOf("pawn");
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id={`mt-${id}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={hi} /><stop offset="0.45" stopColor={mid} /><stop offset="0.62" stopColor={hi} stopOpacity={0.9} /><stop offset="1" stopColor={lo} />
        </linearGradient>
      </defs>
      <ellipse cy={0.4} rx={0.5} ry={0.17} fill={design.primary} opacity={0.3} />
      <ellipse cy={0.38} rx={0.41} ry={0.14} fill="#10131f" />
      <ellipse cy={0.36} rx={0.41} ry={0.14} fill="none" stroke={design.primary} strokeWidth={0.07} />
      <ellipse cy={0.34} rx={0.3} ry={0.09} fill="#232838" />
      <g transform="translate(0 -0.06) scale(0.92)">
        <path d={body} fill={`url(#mt-${id})`} stroke="#1b1305" strokeOpacity={0.45} strokeWidth={0.03} strokeLinejoin="round" />
        <ellipse cx={-0.07} cy={-0.2} rx={0.045} ry={0.09} fill="#fff" opacity={0.75} transform="rotate(-18 -0.07 -0.2)" />
        <path d="M-0.2 0.14 Q-0.13 0.1 -0.06 0.24" fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={0.03} strokeLinecap="round" />
      </g>
    </g>
  );
}

export function PieceShape({ design, id, upright = 0, metal }: Props) {
  if (metal) return <Figurine design={design} id={id} metal={metal} />;
  const d = design;
  const shape = d.shape === "classic" ? "disc" : d.shape;
  const path = pathOf(shape);
  const hasHole = !!outlineOf(shape).holes;
  const dark = shade(d.primary, -0.35);
  const light = shade(d.secondary, 0.25);
  const strokeW = d.outlineWidth * 0.12;
  const gradient = d.pattern === "gradient";
  const main = gradient ? `url(#g-${id})` : d.primary;
  const glassy = d.finish === "glass";
  return (
    <g aria-hidden>
      <defs>
        <clipPath id={`c-${id}`}><path d={path} clipRule="evenodd" /></clipPath>
        {gradient && (
          <radialGradient id={`g-${id}`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor={light} /><stop offset="0.55" stopColor={d.primary} /><stop offset="1" stopColor={dark} />
          </radialGradient>
        )}
        {d.finish === "metal" && (
          <linearGradient id={`m-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0.65} /><stop offset="0.35" stopColor="#fff" stopOpacity={0} />
            <stop offset="0.65" stopColor="#000" stopOpacity={0.15} /><stop offset="0.8" stopColor="#fff" stopOpacity={0.35} /><stop offset="1" stopColor="#000" stopOpacity={0.4} />
          </linearGradient>
        )}
        {d.glow && (
          <radialGradient id={`h-${id}`}><stop offset="0.35" stopColor={d.glow} stopOpacity={0.95 * d.glowStrength} /><stop offset="1" stopColor={d.glow} stopOpacity={0} /></radialGradient>
        )}
      </defs>
      {d.glow && d.glowStrength > 0 && <circle r={0.78} fill={`url(#h-${id})`} />}
      {d.base === "shadow" && <ellipse cy={0.38} rx={0.32} ry={0.1} fill="#000" fillOpacity={0.28} />}
      {d.base === "ring" && <ellipse cy={0.4} rx={0.4} ry={0.13} fill="none" stroke={d.secondary} strokeWidth={0.07} />}
      {d.base === "plate" && <g><ellipse cy={0.42} rx={0.42} ry={0.14} fill={dark} /><ellipse cy={0.4} rx={0.42} ry={0.14} fill={d.secondary} /></g>}
      <g opacity={glassy ? 0.82 : 1}>
        <path d={path} fillRule={hasHole ? "evenodd" : "nonzero"} fill={main} />
        <g clipPath={`url(#c-${id})`}>
          <PatternMarks design={d} />
          {d.finish === "metal" && <rect x={-0.5} y={-0.5} width={1} height={1} fill={`url(#m-${id})`} />}
          {d.shine && d.finish !== "matte" && <ellipse cx={-0.14} cy={-0.16} rx={0.11} ry={0.07} transform="rotate(-35 -0.14 -0.16)" fill="#fff" fillOpacity={glassy ? 0.85 : 0.6} />}
          {glassy && <path d={path} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={0.07} />}
        </g>
        {strokeW > 0 && <path d={path} fillRule={hasHole ? "evenodd" : "nonzero"} fill="none" stroke={d.outline ?? "#fff"} strokeWidth={strokeW} strokeLinejoin="round" />}
      </g>
      {d.mark && (
        <text y={0.03} textAnchor="middle" dominantBaseline="central" fontSize={0.4 * d.markSize} fontWeight={800} fill={d.markColor}
          stroke="#000" strokeOpacity={0.35} strokeWidth={0.025} paintOrder="stroke" transform={`rotate(${upright})`}>{d.mark}</text>
      )}
    </g>
  );
}
