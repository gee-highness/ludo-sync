"use client";

import { shade, type AccessoryId, type ResolvedDesign, type VehicleId } from "@/lib/client/pieces";

type Pt = readonly [number, number];
/** A rounded rectangle as path data, from its top-left corner. */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
const poly = (...pts: Pt[]) => `M${pts.map(p => `${p[0]} ${p[1]}`).join("L")}Z`;

interface Spec {
  /** Body silhouette, nose pointing up (towards negative y), inside a box of about -0.4 to 0.4. */
  body: string;
  /** Wheels as [x, y, width, length]. */
  wheels: [number, number, number, number][];
  glass: string[];
  /** Extra shapes drawn over the body in a lighter or darker tone. */
  panels?: { d: string; tone: "light" | "dark"; alpha: number }[];
  /** Where accessories sit. */
  roof: Pt;
  /** y of the front lights and the rear lights, and how far from the middle they sit. */
  front: number;
  rear: number;
  lx: number;
  /** Two-wheelers show a rider instead of a roof. */
  rider?: { y: number; handlebar: number };
  /** How far the nose reaches, for the headlight beam. */
  nose: number;
  /** Wing mirrors: how far out they stand and where, and a crease down the bonnet from this y to the nose. */
  mirrors?: { x: number; y: number };
  hood?: number;
}

const SPECS: Record<Exclude<VehicleId, "none">, Spec> = {
  car: {
    body: rr(-0.2, -0.38, 0.4, 0.76, 0.13),
    wheels: [[-0.225, -0.24, 0.07, 0.17], [0.225, -0.24, 0.07, 0.17], [-0.225, 0.22, 0.07, 0.17], [0.225, 0.22, 0.07, 0.17]],
    glass: [poly([-0.15, -0.15], [0.15, -0.15], [0.12, -0.04], [-0.12, -0.04]), poly([-0.12, 0.2], [0.12, 0.2], [0.15, 0.3], [-0.15, 0.3])],
    panels: [{ d: rr(-0.13, -0.03, 0.26, 0.22, 0.05), tone: "light", alpha: 0.28 }],
    roof: [0, 0.08], front: -0.355, rear: 0.355, lx: 0.13, nose: -0.38, mirrors: { x: 0.2, y: -0.12 }, hood: -0.15,
  },
  sports: {
    body: rr(-0.19, -0.41, 0.38, 0.82, 0.18),
    wheels: [[-0.215, -0.26, 0.07, 0.16], [0.215, -0.26, 0.07, 0.16], [-0.22, 0.24, 0.08, 0.19], [0.22, 0.24, 0.08, 0.19]],
    glass: [poly([-0.12, -0.13], [0.12, -0.13], [0.09, -0.03], [-0.09, -0.03]), poly([-0.1, 0.14], [0.1, 0.14], [0.12, 0.2], [-0.12, 0.2])],
    panels: [{ d: rr(-0.035, -0.41, 0.07, 0.82, 0.03), tone: "light", alpha: 0.55 }, { d: rr(-0.1, -0.02, 0.2, 0.15, 0.04), tone: "light", alpha: 0.2 }],
    roof: [0, 0.05], front: -0.385, rear: 0.385, lx: 0.12, nose: -0.41, mirrors: { x: 0.19, y: -0.1 }, hood: -0.13,
  },
  taxi: {
    body: rr(-0.2, -0.38, 0.4, 0.76, 0.12),
    wheels: [[-0.225, -0.24, 0.07, 0.17], [0.225, -0.24, 0.07, 0.17], [-0.225, 0.22, 0.07, 0.17], [0.225, 0.22, 0.07, 0.17]],
    glass: [poly([-0.15, -0.15], [0.15, -0.15], [0.12, -0.04], [-0.12, -0.04]), poly([-0.12, 0.2], [0.12, 0.2], [0.15, 0.3], [-0.15, 0.3])],
    panels: [{ d: rr(-0.13, -0.03, 0.26, 0.22, 0.05), tone: "light", alpha: 0.3 }, { d: rr(-0.07, 0.03, 0.14, 0.07, 0.02), tone: "light", alpha: 0.95 }],
    roof: [0, 0.08], front: -0.355, rear: 0.355, lx: 0.13, nose: -0.38, mirrors: { x: 0.2, y: -0.12 }, hood: -0.15,
  },
  suv: {
    body: rr(-0.23, -0.38, 0.46, 0.76, 0.1),
    wheels: [[-0.255, -0.25, 0.08, 0.19], [0.255, -0.25, 0.08, 0.19], [-0.255, 0.22, 0.08, 0.19], [0.255, 0.22, 0.08, 0.19]],
    glass: [poly([-0.17, -0.17], [0.17, -0.17], [0.15, -0.07], [-0.15, -0.07]), poly([-0.15, 0.27], [0.15, 0.27], [0.17, 0.33], [-0.17, 0.33])],
    panels: [{ d: rr(-0.16, -0.05, 0.32, 0.3, 0.04), tone: "light", alpha: 0.22 }],
    roof: [0, 0.1], front: -0.355, rear: 0.355, lx: 0.15, nose: -0.38, mirrors: { x: 0.23, y: -0.16 }, hood: -0.17,
  },
  van: {
    body: rr(-0.22, -0.4, 0.44, 0.8, 0.08),
    wheels: [[-0.245, -0.25, 0.07, 0.17], [0.245, -0.25, 0.07, 0.17], [-0.245, 0.24, 0.07, 0.17], [0.245, 0.24, 0.07, 0.17]],
    glass: [poly([-0.17, -0.31], [0.17, -0.31], [0.15, -0.16], [-0.15, -0.16])],
    panels: [{ d: rr(-0.17, -0.1, 0.34, 0.46, 0.03), tone: "light", alpha: 0.18 }, { d: rr(-0.005, -0.1, 0.01, 0.46, 0), tone: "dark", alpha: 0.35 }],
    roof: [0, 0.1], front: -0.375, rear: 0.375, lx: 0.15, nose: -0.4, mirrors: { x: 0.22, y: -0.3 },
  },
  truck: {
    body: `${rr(-0.2, -0.42, 0.4, 0.3, 0.09)}${rr(-0.23, -0.1, 0.46, 0.52, 0.04)}`,
    wheels: [[-0.25, -0.3, 0.07, 0.16], [0.25, -0.3, 0.07, 0.16], [-0.26, 0.12, 0.08, 0.16], [0.26, 0.12, 0.08, 0.16], [-0.26, 0.31, 0.08, 0.16], [0.26, 0.31, 0.08, 0.16]],
    glass: [poly([-0.15, -0.34], [0.15, -0.34], [0.13, -0.22], [-0.13, -0.22])],
    panels: [{ d: rr(-0.18, -0.07, 0.36, 0.46, 0.03), tone: "dark", alpha: 0.16 }, { d: rr(-0.18, -0.07, 0.36, 0.06, 0.02), tone: "light", alpha: 0.3 }],
    roof: [0, -0.2], front: -0.395, rear: 0.4, lx: 0.14, nose: -0.42, mirrors: { x: 0.21, y: -0.3 },
  },
  bus: {
    body: rr(-0.2, -0.43, 0.4, 0.86, 0.07),
    wheels: [[-0.225, -0.28, 0.07, 0.17], [0.225, -0.28, 0.07, 0.17], [-0.225, 0.26, 0.07, 0.17], [0.225, 0.26, 0.07, 0.17]],
    glass: [poly([-0.16, -0.38], [0.16, -0.38], [0.15, -0.3], [-0.15, -0.3])],
    panels: [{ d: rr(-0.13, -0.2, 0.26, 0.14, 0.03), tone: "light", alpha: 0.35 }, { d: rr(-0.13, 0.02, 0.26, 0.14, 0.03), tone: "light", alpha: 0.35 }, { d: rr(-0.13, 0.24, 0.26, 0.14, 0.03), tone: "light", alpha: 0.35 }],
    roof: [0, 0], front: -0.405, rear: 0.405, lx: 0.14, nose: -0.43, mirrors: { x: 0.2, y: -0.36 },
  },
  motorbike: {
    body: `${rr(-0.065, -0.3, 0.13, 0.62, 0.065)}${rr(-0.2, -0.2, 0.4, 0.05, 0.02)}`,
    wheels: [[-0.035, -0.4, 0.07, 0.2], [-0.04, 0.2, 0.08, 0.22]],
    glass: [],
    panels: [{ d: rr(-0.045, -0.26, 0.09, 0.2, 0.04), tone: "light", alpha: 0.4 }],
    roof: [0, 0.02], front: -0.31, rear: 0.33, lx: 0, rider: { y: 0.02, handlebar: -0.18 }, nose: -0.4,
  },
  scooter: {
    body: `${rr(-0.08, -0.28, 0.16, 0.56, 0.08)}${rr(-0.17, -0.2, 0.34, 0.045, 0.02)}`,
    wheels: [[-0.03, -0.38, 0.06, 0.15], [-0.035, 0.24, 0.07, 0.15]],
    glass: [],
    panels: [{ d: rr(-0.055, -0.1, 0.11, 0.3, 0.05), tone: "dark", alpha: 0.25 }],
    roof: [0, 0.05], front: -0.29, rear: 0.3, lx: 0, rider: { y: 0.06, handlebar: -0.18 }, nose: -0.38,
  },
  bicycle: {
    body: `${rr(-0.022, -0.34, 0.044, 0.68, 0.02)}${rr(-0.19, -0.22, 0.38, 0.035, 0.015)}`,
    wheels: [[-0.022, -0.42, 0.044, 0.22], [-0.022, 0.2, 0.044, 0.22]],
    glass: [],
    roof: [0, 0.04], front: -0.33, rear: 0.34, lx: 0, rider: { y: 0.04, handlebar: -0.2 }, nose: -0.42,
  },
  tuktuk: {
    body: `${rr(-0.19, -0.2, 0.38, 0.54, 0.1)}${rr(-0.075, -0.4, 0.15, 0.26, 0.075)}`,
    wheels: [[-0.035, -0.4, 0.07, 0.14], [-0.225, 0.16, 0.07, 0.17], [0.225, 0.16, 0.07, 0.17]],
    glass: [poly([-0.13, -0.17], [0.13, -0.17], [0.11, -0.09], [-0.11, -0.09])],
    panels: [{ d: rr(-0.17, -0.06, 0.34, 0.37, 0.09), tone: "light", alpha: 0.3 }],
    roof: [0, 0.12], front: -0.385, rear: 0.32, lx: 0.12, nose: -0.4,
  },
};

const Accessory = ({ kind, at, d, spec }: { kind: AccessoryId; at: Pt; d: ResolvedDesign; spec: Spec }) => {
  const [x, y] = at;
  switch (kind) {
    case "siren":
      return (
        <g>
          <rect x={x - 0.11} y={y - 0.035} width={0.22} height={0.07} rx={0.03} fill="#111827" />
          <rect x={x - 0.1} y={y - 0.028} width={0.095} height={0.056} rx={0.025} fill="#ef4444" />
          <rect x={x + 0.005} y={y - 0.028} width={0.095} height={0.056} rx={0.025} fill="#3b82f6" />
          <circle className="siren-glow" cx={x} cy={y} r={0.2} fill="#fff" fillOpacity={0.18} />
        </g>
      );
    case "spoiler":
      return <g><rect x={-0.17} y={spec.rear - 0.07} width={0.34} height={0.06} rx={0.025} fill={shade(d.primary, -0.5)} /><rect x={-0.15} y={spec.rear - 0.09} width={0.3} height={0.025} rx={0.012} fill={d.secondary} /></g>;
    case "rack":
      return <g fill="none" stroke="#1f2937" strokeWidth={0.025} strokeLinejoin="round"><rect x={x - 0.1} y={y - 0.11} width={0.2} height={0.22} rx={0.02} /><line x1={x - 0.1} y1={y} x2={x + 0.1} y2={y} /></g>;
    case "flag":
      return <g><line x1={x} y1={y + 0.04} x2={x} y2={y - 0.12} stroke="#d5dbe5" strokeWidth={0.022} /><path d={`M${x} ${y - 0.12}l0.13 0.045l-0.13 0.045z`} fill={d.secondary} stroke="#00000055" strokeWidth={0.012} /></g>;
    case "box":
      return <g><rect x={x - 0.12} y={y - 0.1} width={0.24} height={0.2} rx={0.025} fill={d.secondary} stroke="#00000066" strokeWidth={0.02} /><line x1={x} y1={y - 0.1} x2={x} y2={y + 0.1} stroke="#00000055" strokeWidth={0.02} /></g>;
    default:
      return null;
  }
};

/** A vehicle seen from above, nose pointing up. The board turns it to face the way it is travelling. */
export function VehicleShape({ design, id }: { design: ResolvedDesign; id: string }) {
  const d = design;
  const spec = SPECS[d.vehicle as Exclude<VehicleId, "none">];
  const dark = shade(d.primary, -0.38);
  const light = shade(d.secondary, 0.25);
  const outline = d.outline ?? shade(d.primary, -0.5);
  const strokeW = Math.max(0.012, d.outlineWidth * 0.06);
  const metal = d.finish === "metal", glassy = d.finish === "glass";
  const fill = d.pattern === "gradient" ? `url(#vg-${id})` : d.primary;
  const stripe = d.pattern === "stripes";
  const rider = spec.rider;
  const halfW = Math.max(...spec.wheels.map(w => Math.abs(w[0]) + w[2] / 2), rider ? 0.2 : 0.18);
  const halfL = Math.max(...spec.wheels.map(w => Math.abs(w[1]) + w[3] / 2));
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id={`vg-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={dark} /><stop offset="0.35" stopColor={light} /><stop offset="0.55" stopColor={d.primary} /><stop offset="1" stopColor={dark} />
        </linearGradient>
        <clipPath id={`vc-${id}`}><path d={spec.body} /></clipPath>
        {spec.glass.map((g, i) => <clipPath key={i} id={`vc-${id}-g${i}`}><path d={g} /></clipPath>)}
        <linearGradient id={`vb-${id}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#fff7c2" stopOpacity={0} /><stop offset="1" stopColor="#fff7c2" stopOpacity={0.55} /></linearGradient>
        {d.glow && <radialGradient id={`vh-${id}`}><stop offset="0.3" stopColor={d.glow} stopOpacity={0.9 * d.glowStrength} /><stop offset="1" stopColor={d.glow} stopOpacity={0} /></radialGradient>}
      </defs>
      {d.glow && d.glowStrength > 0 && <circle r={0.7} fill={`url(#vh-${id})`} />}
      {/* headlight beam */}
      {d.headlights && (
        <g>
          {spec.lx > 0 ? (
            <>
              <path d={poly([-spec.lx, spec.front], [-spec.lx - 0.12, spec.nose - 0.34], [-spec.lx + 0.12, spec.nose - 0.34])} fill={`url(#vb-${id})`} />
              <path d={poly([spec.lx, spec.front], [spec.lx - 0.12, spec.nose - 0.34], [spec.lx + 0.12, spec.nose - 0.34])} fill={`url(#vb-${id})`} />
            </>
          ) : <path d={poly([0, spec.front], [-0.14, spec.nose - 0.36], [0.14, spec.nose - 0.36])} fill={`url(#vb-${id})`} />}
        </g>
      )}
      {d.base === "shadow" && <ellipse cx={0.025} cy={0.035} rx={halfW - 0.025} ry={halfL - 0.02} fill="#000" fillOpacity={0.22} />}
      {d.base === "ring" && <ellipse rx={0.4} ry={0.5} fill="none" stroke={d.secondary} strokeWidth={0.05} strokeOpacity={0.9} />}
      {d.base === "plate" && <rect x={-0.34} y={-0.46} width={0.68} height={0.92} rx={0.12} fill={d.secondary} fillOpacity={0.55} stroke={dark} strokeWidth={0.02} />}
      {/* wheels */}
      {spec.wheels.map(([x, y, w, l], i) => (
        <g key={i}>
          <rect x={x - w / 2} y={y - l / 2} width={w} height={l} rx={w * 0.4} fill="#16181d" />
          <rect x={x - w / 2 + w * 0.2} y={y - l / 2 + l * 0.1} width={w * 0.25} height={l * 0.8} rx={w * 0.1} fill="#ffffff" fillOpacity={0.12} />
        </g>
      ))}
      <g opacity={glassy ? 0.85 : 1}>
        <path d={spec.body} fill={fill} fillRule="nonzero" />
        <g clipPath={`url(#vc-${id})`}>
          {stripe && <g fill={d.secondary} fillOpacity={0.35 + 0.65 * d.patternStrength}>{[-0.12, 0, 0.12].map(x => <rect key={x} x={x - 0.02} y={-0.5} width={0.04} height={1} />)}</g>}
          {d.pattern === "split" && <rect x={-0.5} y={-0.5} width={0.5} height={1} fill={d.secondary} fillOpacity={0.35 + 0.65 * d.patternStrength} />}
          {d.pattern === "dots" && <g fill={d.secondary} fillOpacity={0.35 + 0.65 * d.patternStrength}>{Array.from({ length: 20 }, (_, i) => <circle key={i} cx={-0.15 + (i % 4) * 0.1} cy={-0.38 + Math.floor(i / 4) * 0.17} r={0.025} />)}</g>}
          {d.pattern === "checks" && <g fill={d.secondary} fillOpacity={0.35 + 0.65 * d.patternStrength}>{Array.from({ length: 40 }, (_, i) => ((i % 5) + Math.floor(i / 5)) % 2 ? <rect key={i} x={-0.25 + (i % 5) * 0.1} y={-0.42 + Math.floor(i / 5) * 0.105} width={0.1} height={0.105} /> : null)}</g>}
          {d.pattern === "rings" && <g fill="none" stroke={d.secondary} strokeOpacity={0.35 + 0.65 * d.patternStrength} strokeWidth={0.03}>{[0.1, 0.2].map(r => <ellipse key={r} rx={r} ry={r * 1.7} />)}</g>}
          {d.pattern === "zigzag" && <polyline points="-0.3,-0.3 -0.1,-0.2 -0.3,-0.1 -0.1,0 -0.3,0.1 -0.1,0.2 -0.3,0.3 0.3,-0.3 0.1,-0.2 0.3,-0.1 0.1,0 0.3,0.1 0.1,0.2 0.3,0.3" fill="none" stroke={d.secondary} strokeOpacity={0.35 + 0.65 * d.patternStrength} strokeWidth={0.03} />}
          {(spec.panels ?? []).map((p, i) => <path key={i} d={p.d} fill={p.tone === "light" ? "#fff" : "#000"} fillOpacity={p.alpha} />)}
          {metal && <rect x={-0.4} y={-0.5} width={0.8} height={1} fill="#fff" fillOpacity={0.12} />}
          {d.shine && d.finish !== "matte" && <ellipse cx={-0.09} cy={-0.2} rx={0.05} ry={0.14} fill="#fff" fillOpacity={glassy ? 0.7 : 0.4} />}
        </g>
        {strokeW > 0 && <path d={spec.body} fill="none" stroke={outline} strokeOpacity={0.9} strokeWidth={strokeW} strokeLinejoin="round" />}
      </g>
      {spec.glass.map((g, i) => (
        <g key={i}>
          <path d={g} fill="#10223a" fillOpacity={0.94} />
          <path d={g} fill="#bfe3ff" fillOpacity={0.2} />
          <path d={g} fill="none" stroke="#e6f4ff" strokeOpacity={0.5} strokeWidth={0.012} strokeLinejoin="round" />
          <path d={g} fill="#fff" fillOpacity={0.14} clipPath={`url(#vc-${id}-g${i})`} />
        </g>
      ))}
      {spec.mirrors && [-1, 1].map(s => (
        <g key={`m${s}`}>
          <ellipse cx={s * spec.mirrors!.x} cy={spec.mirrors!.y} rx={0.034} ry={0.022} fill={dark} stroke="#00000066" strokeWidth={0.01} transform={`rotate(${s * 18} ${s * spec.mirrors!.x} ${spec.mirrors!.y})`} />
          <ellipse cx={s * (spec.mirrors!.x + 0.006)} cy={spec.mirrors!.y - 0.004} rx={0.016} ry={0.009} fill="#cfe8ff" fillOpacity={0.55} />
        </g>
      ))}
      {spec.hood !== undefined && [-1, 1].map(s => <line key={`h${s}`} x1={s * 0.075} y1={spec.hood} x2={s * 0.085} y2={spec.nose + 0.04} stroke="#000" strokeOpacity={0.22} strokeWidth={0.012} strokeLinecap="round" />)}
      {rider && (
        <g>
          {/* arms to the bars, shoulders, then the helmet with its visor and a stripe */}
          {[-1, 1].map(sx => <path key={`a${sx}`} d={`M${sx * 0.075} ${rider.y + 0.035}Q${sx * 0.15} ${(rider.y + rider.handlebar) / 2} ${sx * 0.18} ${rider.handlebar}`} fill="none" stroke={dark} strokeWidth={0.05} strokeLinecap="round" />)}
          {[-1, 1].map(sx => <circle key={`g${sx}`} cx={sx * 0.185} cy={rider.handlebar} r={0.024} fill="#1f2937" />)}
          <rect x={-0.2} y={rider.handlebar - 0.02} width={0.4} height={0.04} rx={0.02} fill="#1f2937" />
          {[-1, 1].map(sx => <rect key={`l${sx}`} x={sx * 0.11 - 0.025} y={rider.y + 0.02} width={0.05} height={0.15} rx={0.025} fill={dark} stroke="#00000044" strokeWidth={0.01} />)}
          <ellipse cx={0} cy={rider.y + 0.06} rx={0.15} ry={0.09} fill={dark} stroke="#00000066" strokeWidth={0.015} />
          <ellipse cx={0} cy={rider.y + 0.04} rx={0.09} ry={0.05} fill="#fff" fillOpacity={0.1} />
          <circle cx={0} cy={rider.y} r={0.088} fill={d.secondary} stroke="#00000077" strokeWidth={0.02} />
          <path d={`M-0.06 ${rider.y - 0.03}Q0 ${rider.y - 0.075} 0.06 ${rider.y - 0.03}Q0 ${rider.y - 0.012} -0.06 ${rider.y - 0.03}Z`} fill="#10223a" fillOpacity={0.9} />
          <rect x={-0.012} y={rider.y - 0.085} width={0.024} height={0.17} rx={0.008} fill="#fff" fillOpacity={0.35} />
          <ellipse cx={-0.03} cy={rider.y + 0.025} rx={0.026} ry={0.014} fill="#fff" fillOpacity={0.5} />
        </g>
      )}
      {d.accessory !== "none" && <Accessory kind={d.accessory} at={spec.roof} d={d} spec={spec} />}
      {/* lights */}
      {spec.lx > 0 ? (
        <g>
          {[-1, 1].map(s => <circle key={`f${s}`} cx={s * spec.lx} cy={spec.front} r={0.032} fill={d.headlights ? "#fff7c2" : "#cbd5e1"} stroke="#00000044" strokeWidth={0.01} />)}
          {[-1, 1].map(s => <rect key={`r${s}`} x={s * spec.lx - 0.035} y={spec.rear - 0.015} width={0.07} height={0.03} rx={0.012} fill="#ef4444" />)}
        </g>
      ) : (
        <g><circle cx={0} cy={spec.front} r={0.035} fill={d.headlights ? "#fff7c2" : "#cbd5e1"} /><circle cx={0} cy={spec.rear} r={0.022} fill="#ef4444" /></g>
      )}
      {d.mark && (
        <text y={spec.roof[1] + 0.03} textAnchor="middle" dominantBaseline="central" fontSize={0.26 * d.markSize} fontWeight={800} fill={d.markColor}
          stroke="#000" strokeOpacity={0.35} strokeWidth={0.02} paintOrder="stroke">{d.mark}</text>
      )}
    </g>
  );
}

export const VEHICLE_LABEL: Record<VehicleId, string> = {
  none: "None", car: "Car", sports: "Sports car", taxi: "Taxi", suv: "SUV", van: "Van", truck: "Truck", bus: "Bus", motorbike: "Motorbike", scooter: "Scooter",
  bicycle: "Bicycle", tuktuk: "Tuk-tuk",
};
export const ACCESSORY_LABEL: Record<AccessoryId, string> = { none: "None", siren: "Siren", spoiler: "Spoiler", rack: "Roof rack", flag: "Flag", box: "Delivery box" };
