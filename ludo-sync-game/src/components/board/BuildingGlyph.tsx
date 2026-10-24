"use client";

import type { IslandStyle } from "@/lib/client/islands";
import { shade } from "@/lib/client/pieces";
import { defaultSign } from "./buildings3d";

type Level = 0 | 1 | 2 | 3;

/** Tier sizes in glyph units (the glyph is drawn in a 100 x 100 box with the ground at y = 90). */
const TIERS: Record<IslandStyle["theme"], { w: number; h: number }[][]> = {
  neon: [[{ w: 38, h: 26 }], [{ w: 42, h: 30 }, { w: 30, h: 22 }], [{ w: 44, h: 28 }, { w: 34, h: 26 }, { w: 24, h: 24 }]],
  brownstone: [[{ w: 46, h: 24 }], [{ w: 48, h: 40 }], [{ w: 50, h: 42 }, { w: 40, h: 28 }]],
  tropical: [[{ w: 38, h: 22 }], [{ w: 44, h: 22 }, { w: 32, h: 20 }], [{ w: 46, h: 24 }, { w: 36, h: 22 }, { w: 26, h: 22 }]],
  industrial: [[{ w: 44, h: 20 }], [{ w: 46, h: 32 }], [{ w: 48, h: 36 }, { w: 30, h: 26 }]],
  glass: [[{ w: 30, h: 32 }], [{ w: 30, h: 54 }], [{ w: 30, h: 56 }, { w: 22, h: 32 }]],
};

const WARM = ["#ffd27a", "#ffe9a8"];

interface Props { style: IslandStyle; level: Level; withSign?: boolean }

/** The building drawn as an SVG group in a 100 x 100 box, for the flat board and the editor. */
export function BuildingShape({ style, level, withSign = false }: Props) {
  const gy = 90;
  const wallFront = style.primary;
  const wallSide = shade(style.primary, -0.35);
  const wallTop = shade(style.primary, 0.3);
  const glow = style.glow;
  const els: React.ReactNode[] = [];

  // ground plot with an accent edge
  els.push(<polygon key="plot" points="50,98 92,88 50,78 8,88" fill="#0e1322" stroke={style.accent} strokeWidth={1.6} strokeOpacity={0.9} />);

  if (level === 0) {
    els.push(<polygon key="pyr" points="50,64 60,86 50,90 40,86" fill={style.accent} fillOpacity={0.9} />, <polygon key="pyr2" points="50,64 60,86 50,90" fill={shade(style.accent, -0.3)} />);
    return <g>{els}</g>;
  }

  const tiers = TIERS[style.theme][level - 1];
  let yb = gy;
  let topW = tiers[0].w, topX = 0, topY = 0;
  tiers.forEach((t, i) => {
    const x = 50 - t.w / 2 - t.w * 0.09; // leaves room for the side face
    const dx = t.w * 0.28, dy = t.w * 0.16;
    const yt = yb - t.h;
    els.push(
      <g key={`t${i}`}>
        <rect x={x} y={yt} width={t.w} height={t.h} fill={wallFront} />
        <polygon points={`${x + t.w},${yt} ${x + t.w + dx},${yt - dy} ${x + t.w + dx},${yb - dy} ${x + t.w},${yb}`} fill={wallSide} />
        <polygon points={`${x},${yt} ${x + dx},${yt - dy} ${x + t.w + dx},${yt - dy} ${x + t.w},${yt}`} fill={wallTop} />
        <polygon points={`${x},${yt} ${x + dx},${yt - dy} ${x + t.w + dx},${yt - dy} ${x + t.w},${yt}`} fill="none" stroke={style.accent} strokeWidth={1.2} strokeOpacity={style.theme === "brownstone" || style.theme === "industrial" ? 0.2 : 0.95} />
        {/* windows on the front face */}
        {(() => {
          const cols = Math.max(2, Math.round(t.w / 11)), rows = Math.max(1, Math.round(t.h / 9));
          const out: React.ReactNode[] = [];
          for (let r = 0; r < rows; r++) {
            if (style.windows === "stripes") {
              const on = (r + level + i) % 3 !== 0;
              out.push(<rect key={`s${r}`} x={x + 2.5} y={yt + 3 + r * (t.h / rows)} width={t.w - 5} height={Math.max(2, t.h / rows - 5)} fill={on ? WARM[r % 2] : "#0b1020"} fillOpacity={on ? 0.55 + 0.45 * glow : 0.9} />);
              continue;
            }
            for (let c = 0; c < cols; c++) {
              const on = (c * 7 + r * 3 + level + i) % 3 !== 0;
              const w = (t.w - 4) / cols - 2.4, h = Math.max(2, t.h / rows - 4.5);
              const wx = x + 2.5 + c * ((t.w - 4) / cols), wy = yt + 2.5 + r * (t.h / rows);
              out.push(
                <rect key={`w${r}-${c}`} x={wx} y={wy} width={w} height={h} rx={style.windows === "arched" ? w / 2 : 0.6}
                  fill={on ? (c % 3 === 0 ? style.accent : WARM[(r + c) % 2]) : "#0b1020"} fillOpacity={on ? 0.5 + 0.5 * glow : 0.9} />,
              );
            }
          }
          return out;
        })()}
      </g>,
    );
    topW = t.w; topX = x; topY = yt; yb = yt;
  });
  const cx = topX + topW / 2 + topW * 0.14;

  // theme details and the roof the player chose
  if (style.theme === "industrial") els.push(<g key="chim"><rect x={topX + 4} y={topY - 20} width={6} height={20} fill="#7f8791" /><rect x={topX + 4} y={topY - 20} width={6} height={2.5} fill={style.accent} /></g>);
  if (style.theme === "brownstone") els.push(<rect key="chim" x={topX + topW - 8} y={topY - 12} width={5} height={12} fill="#3b2a22" />);
  if (style.theme === "tropical") els.push(<g key="palm" stroke="#22c55e" strokeWidth={2.2} strokeLinecap="round"><line x1={topX + 6} y1={topY} x2={topX + 6} y2={topY - 14} stroke="#92613a" /><line x1={topX + 6} y1={topY - 14} x2={topX - 1} y2={topY - 11} /><line x1={topX + 6} y1={topY - 14} x2={topX + 13} y2={topY - 11} /><line x1={topX + 6} y1={topY - 14} x2={topX + 6} y2={topY - 20} /></g>);
  if (style.theme === "glass" && style.roof === "flat") els.push(<polygon key="cap" points={`${topX},${topY} ${cx},${topY - 14} ${topX + topW + topW * 0.28},${topY - topW * 0.16}`} fill={style.accent} fillOpacity={0.85} />);
  if (style.roof === "antenna") els.push(<g key="ant"><line x1={cx} y1={topY - 3} x2={cx} y2={topY - 24} stroke="#cbd5e1" strokeWidth={1.6} /><line x1={cx - 5} y1={topY - 17} x2={cx + 5} y2={topY - 17} stroke="#cbd5e1" strokeWidth={1.2} /><circle cx={cx} cy={topY - 25} r={2.2} fill="#ff3b3b" /></g>);
  if (style.roof === "dome") els.push(<path key="dome" d={`M${cx - topW * 0.36},${topY - 2} a${topW * 0.36},${topW * 0.36} 0 0 1 ${topW * 0.72},0 z`} fill={style.accent} fillOpacity={0.6} stroke={style.accent} strokeWidth={1} />);
  if (style.roof === "helipad") els.push(<g key="pad"><ellipse cx={cx} cy={topY - 2} rx={topW * 0.42} ry={topW * 0.17} fill="#1a1f2e" stroke={style.accent} strokeWidth={1.4} /><text x={cx} y={topY} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">H</text></g>);

  if (withSign) {
    const text = style.sign || defaultSign(style.theme, level);
    const first = tiers[0];
    els.push(
      <g key="sign">
        <rect x={50 - first.w * 0.5 - first.w * 0.09} y={gy - first.h * 0.62} width={first.w * 0.9} height={9} rx={1.5} fill="#060a18" fillOpacity={0.85} stroke={style.accent} strokeWidth={0.9} />
        <text x={50 - first.w * 0.05 - first.w * 0.09} y={gy - first.h * 0.62 + 6.6} textAnchor="middle" fontSize={6.6} fontWeight={800} fill={style.accent}>{text}</text>
      </g>,
    );
  }
  return <g>{els}</g>;
}

/** The building as a stand-alone picture. */
export default function BuildingGlyph({ style, level, size = 64, withSign = size >= 64, label }: Props & { size?: number; label?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <BuildingShape style={style} level={level} withSign={withSign} />
    </svg>
  );
}
