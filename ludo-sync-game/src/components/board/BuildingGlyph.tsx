"use client";

import type { IslandStyle } from "@/lib/client/islands";
import { shade } from "@/lib/client/pieces";
import { GROUND_COLOURS, resolveLevel } from "@/lib/client/islands";
import { defaultSign } from "./buildings3d";

type Level = 0 | 1 | 2 | 3;

/** Tier sizes in glyph units (the glyph is drawn in a 100 x 100 box with the ground at y = 90). */
const TIERS: Record<IslandStyle["theme"], { w: number; h: number }[][]> = {
  neon: [[{ w: 38, h: 26 }], [{ w: 42, h: 30 }, { w: 30, h: 22 }], [{ w: 44, h: 28 }, { w: 34, h: 26 }, { w: 24, h: 24 }]],
  brownstone: [[{ w: 46, h: 24 }], [{ w: 48, h: 40 }], [{ w: 50, h: 42 }, { w: 40, h: 28 }]],
  tropical: [[{ w: 38, h: 22 }], [{ w: 44, h: 22 }, { w: 32, h: 20 }], [{ w: 46, h: 24 }, { w: 36, h: 22 }, { w: 26, h: 22 }]],
  industrial: [[{ w: 44, h: 20 }], [{ w: 46, h: 32 }], [{ w: 48, h: 36 }, { w: 30, h: 26 }]],
  glass: [[{ w: 30, h: 32 }], [{ w: 30, h: 54 }], [{ w: 30, h: 56 }, { w: 22, h: 32 }]],
  castle: [[{ w: 44, h: 26 }], [{ w: 46, h: 28 }, { w: 32, h: 18 }], [{ w: 48, h: 28 }, { w: 36, h: 20 }, { w: 22, h: 18 }]],
  pagoda: [[{ w: 36, h: 20 }], [{ w: 40, h: 20 }, { w: 30, h: 18 }], [{ w: 42, h: 18 }, { w: 34, h: 16 }, { w: 26, h: 16 }]],
  cottage: [[{ w: 40, h: 22 }], [{ w: 42, h: 28 }], [{ w: 44, h: 28 }, { w: 30, h: 18 }]],
  hotel: [[{ w: 46, h: 26 }], [{ w: 48, h: 44 }], [{ w: 50, h: 52 }, { w: 38, h: 24 }]],
  shop: [[{ w: 46, h: 24 }], [{ w: 48, h: 38 }], [{ w: 50, h: 38 }, { w: 36, h: 24 }]],
};

const WARM = ["#ffd27a", "#ffe9a8"];

interface Props { style: IslandStyle; level: Level; withSign?: boolean }

/** The building drawn as an SVG group in a 100 x 100 box, for the flat board and the editor. */
export function BuildingShape({ style: island, level, withSign = false }: Props) {
  const style = resolveLevel(island, level);
  const gy = 90;
  const wallFront = style.primary;
  const wallSide = shade(style.primary, -0.35);
  const wallTop = shade(style.primary, 0.3);
  const glow = style.glow;
  const els: React.ReactNode[] = [];

  // ground plot with an accent edge
  els.push(<polygon key="plot" points="50,98 92,88 50,78 8,88" fill={GROUND_COLOURS[style.ground]} stroke={style.accent} strokeWidth={1.6} strokeOpacity={0.9} />);

  if (level === 0) {
    els.push(<polygon key="pyr" points="50,64 60,86 50,90 40,86" fill={style.accent} fillOpacity={0.9} />, <polygon key="pyr2" points="50,64 60,86 50,90" fill={shade(style.accent, -0.3)} />);
    return <g>{els}</g>;
  }

  const tiers = TIERS[style.theme][level - 1].map(t => ({ w: t.w * style.footprint, h: Math.min(60, t.h * style.height) }));
  // tall buildings shrink to fit the picture instead of running off the top
  const fit = Math.min(1, 66 / (tiers.reduce((a, t) => a + t.h, 0) + 24));
  let yb = gy;
  let topW = tiers[0].w, topX = 0, topY = 0;
  tiers.forEach((t, i) => {
    const x = 50 - t.w / 2 - t.w * 0.09; // leaves room for the side face
    const dx = t.w * 0.28, dy = t.w * 0.16;
    const yt = yb - t.h;
    els.push(
      <g key={`t${i}`}>
        <rect x={x} y={yt} width={t.w} height={t.h} rx={style.shape === "round" ? t.w * 0.3 : 0} fill={wallFront} />
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
                <rect key={`w${r}-${c}`} x={wx} y={wy} width={w} height={h} rx={style.windows === "arched" || style.windows === "round" ? w / 2 : 0.6}
                  fill={on ? (style.lights || (c % 3 === 0 ? style.accent : WARM[(r + c) % 2])) : "#0b1020"} fillOpacity={on ? 0.5 + 0.5 * glow : 0.9} />,
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
  if (style.theme === "castle") els.push(<g key="batt" fill={wallTop}>{Array.from({ length: 5 }, (_, k) => <rect key={k} x={topX + 1 + k * (topW / 5)} y={topY - 5} width={topW / 8} height={5} />)}</g>);
  if (style.theme === "pagoda") els.push(<polygon key="eave" points={`${topX - 5},${topY + 1} ${topX + topW * 1.14 + 5},${topY + 1} ${topX + topW * 1.14 - 2},${topY - 5} ${topX + 2},${topY - 5}`} fill={shade(style.accent, -0.4)} />);
  if (style.theme === "cottage" || style.roof === "pitched") els.push(<polygon key="pitch" points={`${topX - 3},${topY} ${cx},${topY - 18} ${topX + topW + topW * 0.3},${topY - topW * 0.16}`} fill={shade(style.accent, -0.45)} />);
  if (style.theme === "hotel") els.push(<g key="balc" stroke={style.accent} strokeWidth={1.2}>{tiers.map((t, i) => <line key={i} x1={50 - t.w * 0.45} y1={gy - tiers.slice(0, i + 1).reduce((a, b) => a + b.h, 0) + t.h * 0.4} x2={50 + t.w * 0.2} y2={gy - tiers.slice(0, i + 1).reduce((a, b) => a + b.h, 0) + t.h * 0.4} />)}</g>);
  if (style.theme === "shop" || style.extras.includes("awning")) { const f = tiers[0]; els.push(<g key="awn">{Array.from({ length: 6 }, (_, k) => <rect key={k} x={50 - f.w * 0.59 + k * (f.w * 0.8 / 6)} y={gy - f.h * 0.55} width={f.w * 0.8 / 6} height={5} fill={k % 2 ? "#f8fafc" : style.accent} />)}</g>); }
  if (style.extras.includes("solar")) els.push(<polygon key="sol" points={`${topX + 4},${topY - 1} ${topX + topW * 0.6},${topY - 1} ${topX + topW * 0.6 + 4},${topY - 6} ${topX + 8},${topY - 6}`} fill="#1e3a8a" stroke="#93c5fd" strokeWidth={0.5} />);
  if (style.extras.includes("garden")) els.push(<g key="gar" fill="#2f8f46"><circle cx={30} cy={90} r={3} /><circle cx={70} cy={92} r={3.2} /><circle cx={50} cy={96} r={2.6} /></g>);
  if (style.roof === "spire") els.push(<polygon key="spire" points={`${cx - 5},${topY} ${cx},${topY - 30} ${cx + 5},${topY}`} fill={style.accent} />);
  if (style.roof === "garden") els.push(<g key="gr"><rect x={topX} y={topY - 3} width={topW * 1.14} height={3} fill="#3f9d52" /><circle cx={cx - 5} cy={topY - 5} r={3} fill="#2f8f46" /><circle cx={cx + 5} cy={topY - 5} r={2.6} fill="#2f8f46" /></g>);
  if (style.roof === "antenna") els.push(<g key="ant"><line x1={cx} y1={topY - 3} x2={cx} y2={topY - 24} stroke="#cbd5e1" strokeWidth={1.6} /><line x1={cx - 5} y1={topY - 17} x2={cx + 5} y2={topY - 17} stroke="#cbd5e1" strokeWidth={1.2} /><circle cx={cx} cy={topY - 25} r={2.2} fill="#ff3b3b" /></g>);
  if (style.roof === "dome") els.push(<path key="dome" d={`M${cx - topW * 0.36},${topY - 2} a${topW * 0.36},${topW * 0.36} 0 0 1 ${topW * 0.72},0 z`} fill={style.accent} fillOpacity={0.6} stroke={style.accent} strokeWidth={1} />);
  if (style.roof === "helipad") els.push(<g key="pad"><ellipse cx={cx} cy={topY - 2} rx={topW * 0.42} ry={topW * 0.17} fill="#1a1f2e" stroke={style.accent} strokeWidth={1.4} /><text x={cx} y={topY} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">H</text></g>);

  if (style.extras.includes("trees")) els.push(<g key="tree"><rect x={14} y={80} width={2} height={7} fill="#6b4a2c" /><polygon points="15,66 21,82 9,82" fill="#2f8f46" /></g>);
  if (style.extras.includes("flags")) els.push(<g key="flag"><line x1={84} y1={90} x2={84} y2={66} stroke="#d5dbe5" strokeWidth={1.2} /><rect x={84} y={66} width={9} height={6} fill={style.accent} /></g>);
  if (style.extras.includes("lamps")) els.push(<g key="lamp"><line x1={30} y1={92} x2={30} y2={78} stroke="#2a2f3a" strokeWidth={1.4} /><circle cx={30} cy={77} r={2.4} fill="#fff2b0" /></g>);
  if (style.extras.includes("fence")) els.push(<polyline key="fence" points="8,88 50,98 92,88" fill="none" stroke="#caa87a" strokeWidth={1.6} strokeDasharray="2 2.5" />);

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
  return <g transform={fit < 1 ? `translate(50 90) scale(${fit.toFixed(3)}) translate(-50 -90)` : undefined}>{els}</g>;
}

/** The building as a stand-alone picture. */
export default function BuildingGlyph({ style, level, size = 64, withSign = size >= 64, label }: Props & { size?: number; label?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <BuildingShape style={style} level={level} withSign={withSign} />
    </svg>
  );
}
