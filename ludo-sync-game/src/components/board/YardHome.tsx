import { RING, SEAT_INFO, START_INDEX, pointOf, type Seat } from "@/lib/ludo/board";

const PARTY = ["#FF5C8A", "#FFC145", "#5CE1E6", "#B28DFF", "#7CFF6B"];
type Wall = "E" | "W" | "N" | "S";

/** How a seat's room is laid out, from where its start square is and where its name is drawn. */
export const homeLayout = (seat: Seat) => {
  const start = pointOf(seat, 0, 0);
  const x0 = seat === 1 || seat === 0 ? -0.5 : 8.5;
  const y0 = seat === 1 || seat === 2 ? -0.5 : 8.5;
  const cx = x0 + 3, cy = y0 + 3;
  const vx = start.x - cx, vy = start.y - cy;
  // the door faces whichever way the start square lies
  const angle = Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? 0 : 180) : vy > 0 ? 90 : 270;
  const a = (angle * Math.PI) / 180;
  const lateral = -vx * Math.sin(a) + vy * Math.cos(a);
  // the name sits on the outer edge (bottom for seats 0 and 3, top for 1 and 2), so keep that wall clear
  const lv = seat === 0 || seat === 3 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  const lx = lv.x * Math.cos(a) + lv.y * Math.sin(a), ly = -lv.x * Math.sin(a) + lv.y * Math.cos(a);
  const label: Wall = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? "E" : "W") : ly > 0 ? "S" : "N";
  const free = (["W", "N", "S"] as Wall[]).filter(w => w !== label);
  const windowWall = (["W", "S", "N"] as Wall[]).find(w => free.includes(w))!;
  const lightsWall = (["N", "S", "W"] as Wall[]).find(w => free.includes(w) && w !== windowWall)!;
  return { cx, cy, angle, lateral: Math.max(-1.6, Math.min(1.6, lateral)), windowWall, lightsWall };
};

/** Rotation that carries the west wall (where the window is drawn) onto a wall, and the north wall (string lights) onto a wall. */
const FROM_W: Record<Wall, number> = { W: 0, N: 90, E: 180, S: 270 };
const FROM_N: Record<Wall, number> = { N: 0, E: 90, S: 180, W: 270 };

const Window = () => (
  <g>
    <polygon points="-2.2,-.7 -.4,-1.1 -.4,1.1 -2.2,.7" fill="#FFE9A8" opacity={0.14} />
    <rect x={-2.88} y={-0.72} width={0.7} height={1.44} rx={0.06} fill="#F1EDE4" />
    <rect x={-2.82} y={-0.66} width={0.58} height={1.32} rx={0.04} fill="#FFD98A" />
    <path d="M-2.53 -.66V.66M-2.82 0H-2.24" stroke="#F1EDE4" strokeWidth={0.05} />
    <circle cx={-2.5} cy={0} r={0.9} fill="#FFE9A8" opacity={0.16} />
  </g>
);

const Lights = () => {
  const bulbs = Array.from({ length: 7 }, (_, i) => {
    const t = (i + 0.5) / 7;
    return { x: -2 + 4 * t, y: -2.5 * (1 - t) * (1 - t) - 2.2 * 2 * t * (1 - t) - 2.5 * t * t, c: PARTY[i % PARTY.length], d: i * 0.37 };
  });
  return (
    <g>
      <path d="M-2 -2.5Q0 -1.9 2 -2.5" fill="none" stroke="#2B2230" strokeWidth={0.03} />
      {bulbs.map((b, i) => (
        <g key={i}>
          <circle className="yh-bulb" cx={b.x} cy={b.y + 0.07} r={0.08} fill={b.c} style={{ animationDelay: `${-b.d}s` }} />
        </g>
      ))}
    </g>
  );
};

interface Props { seat: Seat; layer: "room" | "spill" }

/** A lived-in room for one seat's yard, drawn in the board's own units with the door facing the start square. */
export function YardHome({ seat, layer }: Props) {
  const info = SEAT_INFO[seat];
  const { cx, cy, angle, lateral, windowWall, lightsWall } = homeLayout(seat);
  const s = lateral >= 0 ? 1 : -1;
  if (layer === "spill") {
    return (
      <g transform={`translate(${cx} ${cy}) rotate(${angle})`} aria-hidden>
        <defs>
          <linearGradient id={`spill-${seat}`} gradientUnits="userSpaceOnUse" x1={2.98} y1={0} x2={4.5} y2={0}>
            <stop offset="0" stopColor="#FFE9A8" stopOpacity={0.55} /><stop offset="1" stopColor="#FFE9A8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon points={`2.98,${lateral - 0.5} 4.5,${lateral - 0.9} 4.5,${lateral + 0.9} 2.98,${lateral + 0.5}`} fill={`url(#spill-${seat})`} />
      </g>
    );
  }
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${angle})`} aria-hidden>
      <g transform={`rotate(${FROM_W[windowWall]})`}><Window /></g>
      <g transform={`rotate(${FROM_N[lightsWall]})`}><Lights /></g>
      {/* floor */}
      <rect x={-2.1} y={-2.1} width={4.2} height={4.2} rx={0.45} fill="#D2A86E" />
      <path d="M-2.1 -1.4H2.1M-2.1 -.7H2.1M-2.1 0H2.1M-2.1 .7H2.1M-2.1 1.4H2.1" stroke="#A97F4C" strokeWidth={0.03} opacity={0.55} />
      <path d="M-.9 -2.1V-1.4M.8 -1.4V-.7M-1.2 -.7V0M1.1 0V.7M-.5 .7V1.4M.9 1.4V2.1" stroke="#A97F4C" strokeWidth={0.03} opacity={0.45} />
      {/* rug */}
      <ellipse rx={1.78} ry={1.38} fill={info.dark} opacity={0.9} />
      <ellipse rx={1.5} ry={1.1} fill={info.main} />
      <ellipse rx={1.5} ry={1.1} fill="none" stroke={info.light} strokeWidth={0.07} strokeDasharray="0.22 0.14" />
      {/* sofa against the north wall */}
      <g transform="translate(0 -1.8)">
        <rect x={-1.2} y={-0.3} width={2.4} height={0.34} rx={0.12} fill={info.dark} />
        <rect x={-1.05} y={0.0} width={2.1} height={0.3} rx={0.1} fill={info.main} />
        <rect x={-1.2} y={-0.28} width={0.2} height={0.6} rx={0.08} fill={info.dark} />
        <rect x={1.0} y={-0.28} width={0.2} height={0.6} rx={0.08} fill={info.dark} />
        <path d="M0 0V.3" stroke={info.dark} strokeWidth={0.03} />
      </g>
      {/* plant */}
      <g transform="translate(-1.75 1.72)">
        <ellipse cx={-0.1} cy={-0.14} rx={0.13} ry={0.22} fill="#3E8E4F" transform="rotate(-30 -0.1 -0.14)" />
        <ellipse cx={0.12} cy={-0.12} rx={0.13} ry={0.22} fill="#4BA35E" transform="rotate(30 .12 -.12)" />
        <ellipse cx={0} cy={-0.2} rx={0.12} ry={0.24} fill="#357E44" />
        <circle r={0.17} fill="#9A5B33" />
      </g>
      {/* floor lamp with a pool of light */}
      <g transform="translate(-1.7 -1.65)">
        <circle r={0.95} fill="#FFE9A8" opacity={0.2} />
        <circle r={0.07} fill="#2B2230" />
        <polygon points="-.16,-.1 .16,-.1 .1,-.3 -.1,-.3" fill="#FFD27A" />
      </g>
      {/* coffee table and mug */}
      <rect x={-0.38} y={-0.26} width={0.76} height={0.52} rx={0.09} fill="#7A5230" />
      <circle cx={0.12} cy={-0.02} r={0.08} fill="#F4F1DE" />
      <circle cx={0.12} cy={-0.02} r={0.05} fill="#5B3A22" />
      {/* the way out */}
      <rect x={1.8} y={lateral - 0.4} width={0.32} height={0.8} rx={0.05} fill={info.dark} />
      <path d={`M1.9 ${lateral - 0.3}H2.04M1.9 ${lateral}H2.04M1.9 ${lateral + 0.3}H2.04`} stroke={info.light} strokeWidth={0.04} />
      <rect x={2.12} y={lateral - 0.55} width={0.86} height={1.1} rx={0.08} fill="#5B3A22" />
      <rect x={2.2} y={lateral - 0.47} width={0.7} height={0.94} rx={0.05} fill="#FFD27A" />
      <path d={`M2.55 ${lateral - 0.47}V${lateral + 0.47}M2.2 ${lateral}H2.9`} stroke="#B9822F" strokeWidth={0.04} opacity={0.7} />
      <circle cx={2.8} cy={lateral + 0.05} r={0.045} fill="#5B3A22" />
      {/* just in from work: a briefcase and a hat by the door */}
      <g transform={`translate(1.72 ${lateral - s * 0.62})`}>
        <rect x={-0.15} y={-0.11} width={0.3} height={0.22} rx={0.04} fill="#7A4B2A" />
        <path d="M-.05 -.11V-.16H.05V-.11" fill="none" stroke="#4E2E17" strokeWidth={0.035} />
      </g>
      <g transform={`translate(1.76 ${lateral + s * 0.5})`}>
        <ellipse rx={0.17} ry={0.12} fill="#4B4A57" />
        <ellipse rx={0.09} ry={0.07} fill="#2E2D38" />
      </g>
    </g>
  );
}

/** Road details for the city board: lane dashes, zebra crossings beside each start square, a few manholes. */
export function RoadMarks({ ringIdx, row, col }: { ringIdx: number; row: number; col: number }) {
  const next = RING[(ringIdx + 1) % RING.length];
  let dx = next[1] - col, dy = next[0] - row;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const isStart = Object.values(START_INDEX).includes(ringIdx);
  const beforeStart = Object.values(START_INDEX).some(i => (i - 1 + RING.length) % RING.length === ringIdx);
  const px = -dy, py = dx;
  return (
    <g aria-hidden>
      {!isStart && !beforeStart && ringIdx % 13 !== 8 && (
        <line x1={col - dx * 0.16} y1={row - dy * 0.16} x2={col + dx * 0.16} y2={row + dy * 0.16} stroke="#fff" strokeOpacity={0.2} strokeWidth={0.05} strokeLinecap="round" />
      )}
      {beforeStart && [-0.3, 0, 0.3].map(o => (
        <line key={o} x1={col + px * o - dx * 0.28} y1={row + py * o - dy * 0.28} x2={col + px * o + dx * 0.28} y2={row + py * o + dy * 0.28} stroke="#fff" strokeOpacity={0.62} strokeWidth={0.11} />
      ))}
      {ringIdx % 13 === 5 && ringIdx !== 5 && (
        <g>
          <circle cx={col} cy={row} r={0.17} fill="#2F3648" stroke="#1B2030" strokeWidth={0.03} />
          <path d={`M${col - 0.1} ${row}H${col + 0.1}M${col} ${row - 0.1}V${row + 0.1}`} stroke="#1B2030" strokeWidth={0.025} />
        </g>
      )}
    </g>
  );
}
