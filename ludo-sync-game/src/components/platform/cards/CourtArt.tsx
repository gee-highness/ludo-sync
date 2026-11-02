"use client";

import type { CardStyle } from "@/lib/client/cardStyle";
import { Suit } from "./Suit";

type Court = CardStyle["court"];

/** Suit colours: red and black as in a standard deck, or four distinct colours for players who find red and black hard to tell apart. */
export const suitColour = (suit: number, fourColour: boolean): string =>
  fourColour ? ["#15803d", "#1d4ed8", "#dc2626", "#111827"][suit] : suit === 1 || suit === 2 ? "#dc2626" : "#0f172a";

const SKIN = "#f6d3b0";

/** One half of a double-ended court card: a king, queen or jack from the chest up, drawn in a 56 by 50 box. */
function Figure({ rank, ink, accent }: { rank: number; ink: string; accent: string }) {
  const robe = ink, trim = accent;
  return (
    <g>
      {/* torso and collar */}
      <path d="M5 50 L9 35 Q28 27 47 35 L51 50 Z" fill={robe} stroke="#0006" strokeWidth={0.6} />
      <path d="M9 50 L12 38 M51 50 L48 38" stroke={trim} strokeWidth={1.4} fill="none" />
      <path d="M17 33.5 Q28 43 39 33.5 L35 29.5 Q28 36 21 29.5 Z" fill="#fff" stroke="#0003" strokeWidth={0.5} />
      <circle cx={25} cy={40} r={0.9} fill={trim} /><circle cx={31} cy={40} r={0.9} fill={trim} /><circle cx={28} cy={44} r={1.1} fill={trim} />
      {rank === 12 && <path d="M18 22 Q15 38 21 43 L22 26 Z M38 22 Q41 38 35 43 L34 26 Z" fill="#7c2d12" stroke="#0004" strokeWidth={0.5} />}
      {/* head */}
      <circle cx={28} cy={22} r={9} fill={SKIN} stroke="#0005" strokeWidth={0.6} />
      <circle cx={25} cy={21} r={0.9} fill="#1f2937" /><circle cx={31} cy={21} r={0.9} fill="#1f2937" />
      <path d="M25.5 26 Q28 27.8 30.5 26" stroke="#9a3412" strokeWidth={0.8} fill="none" strokeLinecap="round" />
      {rank === 13 && <path d="M19.5 24 Q28 41 36.5 24 Q28 31 19.5 24 Z" fill="#e5e7eb" stroke="#0004" strokeWidth={0.5} />}
      {/* headwear */}
      {rank === 13 && <g><path d="M18.5 15 L20.5 5 L25 10.5 L28 3 L31 10.5 L35.5 5 L37.5 15 Z" fill={trim} stroke="#0006" strokeWidth={0.6} /><rect x={18.5} y={14} width={19} height={3.2} fill={trim} stroke="#0006" strokeWidth={0.5} /><circle cx={28} cy={15.6} r={1.2} fill="#ef4444" /><circle cx={28} cy={3} r={1.4} fill="#ef4444" /></g>}
      {rank === 12 && <g><path d="M19.5 14.5 L21 8 L24.5 12 L28 6 L31.5 12 L35 8 L36.5 14.5 Z" fill={trim} stroke="#0006" strokeWidth={0.6} /><rect x={19.5} y={13.5} width={17} height={3} fill={trim} stroke="#0006" strokeWidth={0.5} /><circle cx={28} cy={15} r={1.1} fill="#38bdf8" /></g>}
      {rank === 11 && <g><path d="M18.5 17 Q18 6 28 5 Q38 6 37.5 17 Q28 12 18.5 17 Z" fill={robe} stroke="#0006" strokeWidth={0.6} /><path d="M18.5 15.5 Q28 11 37.5 15.5" stroke={trim} strokeWidth={1.6} fill="none" /><path d="M35 8 Q44 1 50 4 Q44 8 38 12 Z" fill="#fff" stroke={trim} strokeWidth={0.8} /></g>}
      {/* what each holds */}
      {rank === 13 && <g><line x1={46} y1={48} x2={46} y2={17} stroke={trim} strokeWidth={1.6} /><circle cx={46} cy={15} r={2.6} fill="#ef4444" stroke={trim} strokeWidth={0.8} /></g>}
      {rank === 12 && <g><line x1={46} y1={48} x2={46} y2={30} stroke="#15803d" strokeWidth={1.2} />{[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx={46} cy={26} rx={1.6} ry={3.2} transform={`rotate(${a} 46 29)`} fill="#f472b6" />)}<circle cx={46} cy={28.6} r={1.2} fill="#facc15" /></g>}
      {rank === 11 && <g><line x1={46} y1={49} x2={46} y2={14} stroke="#94a3b8" strokeWidth={1.2} /><path d="M46 14 L43 20 H49 Z" fill="#cbd5e1" stroke="#64748b" strokeWidth={0.5} /></g>}
    </g>
  );
}

const LETTER = ["", "", "", "", "", "", "", "", "", "", "", "J", "Q", "K"];

/** The middle of a Jack, Queen or King: a drawing in one of four styles, in the player's accent colour. */
export function CourtArt({ rank, suit, court, fourColour, paper }: { rank: number; suit: number; court: Court; fourColour: boolean; paper: string }) {
  const ink = suitColour(suit, fourColour);
  const accent = court.accent;
  const tint = `${ink}14`;
  const letter = LETTER[rank];
  const frame = court.frame ? <g fill="none"><rect x={1} y={1} width={54} height={98} rx={4} fill={tint} stroke={accent} strokeWidth={1.4} /><rect x={3.6} y={3.6} width={48.8} height={92.8} rx={2.5} stroke={accent} strokeWidth={0.5} opacity={0.8} /></g> : <rect x={1} y={1} width={54} height={98} rx={4} fill={tint} />;
  void paper;
  let body: React.ReactNode;
  if (court.style === "classic") {
    body = (
      <g>
        <g><Figure rank={rank} ink={ink} accent={accent} /></g>
        {court.mirror ? <g transform="translate(56 100) rotate(180)"><Figure rank={rank} ink={ink} accent={accent} /></g> : <g transform="translate(0 50)"><Figure rank={rank} ink={ink} accent={accent} /></g>}
        <line x1={3} y1={50} x2={53} y2={50} stroke={accent} strokeWidth={1} />
        <svg x={22} y={43} width={12} height={12} viewBox="0 0 100 100" fill={ink}><circle cx={50} cy={50} r={50} fill={paper} />{<g transform="translate(18 18) scale(.64)">{<Suit suit={suit} size={100} />}</g>}</svg>
      </g>
    );
  } else if (court.style === "emblem") {
    body = (
      <g fill={ink}>
        <g transform="translate(14 8) scale(.28)" fill={accent} stroke="#0006" strokeWidth={3}><path d="M12 72 L8 32 L30 50 L50 20 L70 50 L92 32 L88 72 Z" /><rect x="12" y="78" width="76" height="11" rx="3" /></g>
        <text x={28} y={66} textAnchor="middle" fontSize={44} fontWeight={800} fontFamily="Georgia, 'Times New Roman', serif">{letter}</text>
        <svg x={19} y={72} width={18} height={18} viewBox="0 0 100 100" fill={ink}><Suit suit={suit} size={100} /></svg>
      </g>
    );
  } else if (court.style === "characters") {
    const em = court.chars[rank as 11 | 12 | 13];
    const medal = (cy: number, r: number, fs: number, rot?: boolean) => (
      <g transform={rot ? "translate(56 100) rotate(180)" : undefined}>
        <circle cx={28} cy={cy} r={r} fill={paper} stroke={accent} strokeWidth={1.5} />
        <circle cx={28} cy={cy} r={r - 3} fill="none" stroke={accent} strokeWidth={0.5} opacity={0.7} />
        <text x={28} y={cy + fs * 0.35} textAnchor="middle" fontSize={fs}>{em}</text>
      </g>
    );
    body = court.mirror ? (
      <g>
        {medal(26, 18, 22)}{medal(26, 18, 22, true)}
        <line x1={6} y1={50} x2={50} y2={50} stroke={accent} strokeWidth={1} />
        <circle cx={28} cy={50} r={7} fill={ink} stroke={paper} strokeWidth={1.5} />
        <text x={28} y={54.2} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff" fontFamily="Georgia, serif">{letter}</text>
      </g>
    ) : (
      <g>
        {medal(38, 24, 32)}
        <text x={28} y={84} textAnchor="middle" fontSize={22} fontWeight={800} fill={ink} fontFamily="Georgia, serif">{letter}</text>
        <svg x={20} y={86} width={16} height={12} viewBox="0 0 100 100" fill={ink}><Suit suit={suit} size={100} /></svg>
      </g>
    );
  } else {
    body = (
      <g fill={ink}>
        <text x={28} y={56} textAnchor="middle" fontSize={50} fontWeight={800} fontFamily="Inter, system-ui, sans-serif">{letter}</text>
        <svg x={16} y={62} width={24} height={24} viewBox="0 0 100 100" fill={ink}><Suit suit={suit} size={100} /></svg>
      </g>
    );
  }
  return <svg viewBox="0 0 56 100" width="100%" height="100%" aria-hidden style={{ display: "block", overflow: "visible" }}>{frame}{body}</svg>;
}
