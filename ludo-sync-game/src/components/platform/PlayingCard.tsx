"use client";

import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useCardStyle, type CardStyle } from "@/lib/client/cardStyle";
import { CardBackFace } from "./cards/CardBack";
import { CourtArt, suitColour } from "./cards/CourtArt";
import { Suit } from "./cards/Suit";
export { Suit };

export const SUIT_SYMBOLS = ["♣", "♦", "♥", "♠"] as const;
export const SUIT_NAMES = ["clubs", "diamonds", "hearts", "spades"] as const;
export const RANK_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const RANK_NAMES = ["", "ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"];

/** Card ids 0..51: suit = id / 13 (clubs, diamonds, hearts, spades), rank = id % 13 + 1. */
export const cardLabel = (id: number) => `${RANK_NAMES[(id % 13) + 1]} of ${SUIT_NAMES[Math.floor(id / 13)]}`;

const SIZES = { xs: { w: 34, h: 48, f: 13 }, sm: { w: 46, h: 66, f: 17 }, md: { w: 58, h: 82, f: 21 }, lg: { w: 72, h: 102, f: 26 } } as const;

interface Props {
  id?: number;
  faceDown?: boolean;
  size?: keyof typeof SIZES;
  /** Exact width in pixels, instead of a size, for layouts that fit the screen. */
  width?: number;
  selected?: boolean;
  glow?: boolean;
  dim?: boolean;
  onClick?: () => void;
  label?: string;
  /** A stable key (the card id) so the card can fly to its new place when it moves, see useMotion. */
  mk?: string;
  children?: ReactNode;
}



/** Pip positions for 2 to 10 as fractions across a 3-column by 4-row grid: the layouts of a real deck. */
const PIPS: Record<number, [number, number][]> = {
  2: [[0.5, 0], [0.5, 1]], 3: [[0.5, 0], [0.5, 0.5], [0.5, 1]], 4: [[0, 0], [1, 0], [0, 1], [1, 1]], 5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]], 7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};

/** The rank and suit in a corner, small and tight so it never reaches into the middle of the card. */
function Index({ rank, suit, w, flipped, large }: { rank: number; suit: number; w: number; flipped?: boolean; large?: boolean }) {
  const f = Math.max(9, Math.round(w * (rank === 10 ? 0.17 : 0.2) * (large ? 1.3 : 1)));
  return (
    <Box position="absolute" {...(flipped ? { bottom: `${Math.max(2, w * 0.06)}px`, right: `${Math.max(3, w * 0.08)}px`, transform: "rotate(180deg)" } : { top: `${Math.max(2, w * 0.06)}px`, left: `${Math.max(3, w * 0.08)}px` })}
      textAlign="center" fontSize={`${f}px`} letterSpacing={rank === 10 ? "-0.08em" : undefined} aria-hidden>
      <Box>{RANK_LABELS[rank]}</Box>
      <Box mt="2px" display="flex" justifyContent="center"><Suit suit={suit} size={Math.round(f * 0.85)} /></Box>
    </Box>
  );
}

/** The middle of the card: pips in the real layout for 2 to 10 (one big symbol on small cards), a big suit for aces, a big letter for the picture cards. */
function Face({ rank, suit, w, h, court, fourColour, paper }: { rank: number; suit: number; w: number; h: number; court: CardStyle["court"]; fourColour: boolean; paper: string }) {
  if (rank === 1 || (rank <= 10 && w < 44)) return <Box position="absolute" inset={0} display="grid" placeItems="center" aria-hidden><Suit suit={suit} size={w * (rank === 1 ? 0.5 : 0.4)} /></Box>;
  if (rank > 10) return (
    <Box position="absolute" top={`${h * 0.09}px`} bottom={`${h * 0.09}px`} left={`${w * 0.2}px`} right={`${w * 0.2}px`} aria-hidden>
      <CourtArt rank={rank} suit={suit} court={court} fourColour={fourColour} paper={paper} />
    </Box>
  );
  const pip = w * 0.16, aw = w * 0.42, ah = h * 0.7, ox = w * 0.29, oy = h * 0.15;
  return (
    <Box position="absolute" left={`${ox}px`} top={`${oy}px`} w={`${aw}px`} h={`${ah}px`} aria-hidden>
      {PIPS[rank].map(([x, y], i) => (
        <Box key={i} position="absolute" left={`${pip / 2 + x * (aw - pip)}px`} top={`${pip / 2 + y * (ah - pip)}px`} lineHeight={0} transform={`translate(-50%, -50%)${y > 0.5 ? " rotate(180deg)" : ""}`}><Suit suit={suit} size={pip} /></Box>
      ))}
    </Box>
  );
}

/** A standard playing card painted in CSS: a small rank and suit in two corners and the real pip layout in the middle. Four-colour suits are never the only cue: the symbol is always there. */
export function PlayingCard({ id, faceDown, size = "md", width, selected, glow, dim, onClick, label, mk, children }: Props) {
  const z = width ? { w: width, h: Math.round(width * 1.42), f: Math.max(9, Math.round(width * 0.36)) } : SIZES[size];
  const suit = id === undefined ? 0 : Math.floor(id / 13);
  const rank = id === undefined ? 0 : (id % 13) + 1;
  const [cs] = useCardStyle();
  const ink = suitColour(suit, cs.faces.fourColour);
  const common = {
    w: `${z.w}px`, h: `${z.h}px`, borderRadius: "8px", flexShrink: 0, position: "relative" as const, userSelect: "none" as const,
    transition: "transform .15s, box-shadow .15s, filter .15s", filter: dim ? "brightness(.55) saturate(.7)" : undefined,
    transform: selected ? "translateY(-12px)" : undefined,
    boxShadow: selected ? "0 0 0 3px #fde047, 0 8px 14px rgba(0,0,0,.5)" : glow ? "0 0 0 2px #38bdf8, 0 0 12px #38bdf8" : "0 2px 5px rgba(0,0,0,.5)",
  };
  const inner = faceDown ? (
    <Box {...common} bg={cs.faces.paper} border="3px solid" borderColor={cs.faces.paper} overflow="hidden" data-cardback="1" aria-hidden><CardBackFace /></Box>
  ) : (
    <Box {...common} bg={cs.faces.paper} color={ink} border="1px solid #cbd5e1" fontWeight={800} lineHeight={1}>
      <Index rank={rank} suit={suit} w={z.w} large={cs.faces.largeIndex} />
      <Index rank={rank} suit={suit} w={z.w} flipped large={cs.faces.largeIndex} />
      <Face rank={rank} suit={suit} w={z.w} h={z.h} court={cs.court} fourColour={cs.faces.fourColour} paper={cs.faces.paper} />
      {children}
    </Box>
  );
  if (!onClick) return <Box role="img" aria-label={label ?? (faceDown ? "face-down card" : id === undefined ? "card" : cardLabel(id))} display="inline-block" data-mk={mk}>{inner}</Box>;
  return (
    <Box as="button" type="button" onClick={onClick} aria-label={label ?? (id === undefined ? "card" : cardLabel(id))} aria-pressed={selected} display="inline-block" data-mk={mk} _focusVisible={{ outline: "3px solid #fde047", outlineOffset: "2px", borderRadius: "8px" }}>
      {inner}
    </Box>
  );
}

/** A little fan of face-down cards standing for someone's hand. */
export const CardBacks = ({ count, size = "xs" }: { count: number; size?: keyof typeof SIZES }) => (
  <Box display="flex" aria-label={`${count} card${count === 1 ? "" : "s"}`} role="img">
    {Array.from({ length: Math.min(count, 8) }, (_, i) => <Box key={i} ml={i ? "-22px" : 0}><PlayingCard faceDown size={size} /></Box>)}
  </Box>
);
