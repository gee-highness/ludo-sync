"use client";

import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";

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
  children?: ReactNode;
}

/** A standard playing card painted in CSS: rank and suit in the corners, a big suit in the middle. Four-colour suits are never the only cue: the symbol is always there. */
export function PlayingCard({ id, faceDown, size = "md", width, selected, glow, dim, onClick, label, children }: Props) {
  const z = width ? { w: width, h: Math.round(width * 1.42), f: Math.max(9, Math.round(width * 0.36)) } : SIZES[size];
  const suit = id === undefined ? 0 : Math.floor(id / 13);
  const rank = id === undefined ? 0 : (id % 13) + 1;
  const red = suit === 1 || suit === 2;
  const common = {
    w: `${z.w}px`, h: `${z.h}px`, borderRadius: "8px", flexShrink: 0, position: "relative" as const, userSelect: "none" as const,
    transition: "transform .15s, box-shadow .15s, filter .15s", filter: dim ? "brightness(.55) saturate(.7)" : undefined,
    transform: selected ? "translateY(-12px)" : undefined,
    boxShadow: selected ? "0 0 0 3px #fde047, 0 8px 14px rgba(0,0,0,.5)" : glow ? "0 0 0 2px #38bdf8, 0 0 12px #38bdf8" : "0 2px 5px rgba(0,0,0,.5)",
  };
  const inner = faceDown ? (
    <Box {...common} bg="repeating-linear-gradient(45deg,#1e3a8a,#1e3a8a 5px,#2563eb 5px,#2563eb 10px)" border="3px solid #f8fafc" aria-hidden />
  ) : (
    <Box {...common} bg="#f8fafc" color={red ? "#dc2626" : "#0f172a"} border="1px solid #cbd5e1" fontWeight={800} lineHeight={1} fontSize={`${z.f}px`}>
      <Box position="absolute" top="3px" left="5px" textAlign="center">{RANK_LABELS[rank]}<Box fontSize="0.8em">{SUIT_SYMBOLS[suit]}</Box></Box>
      <Box position="absolute" inset={0} display="grid" placeItems="center" fontSize={`${z.f * 1.9}px`} aria-hidden>{SUIT_SYMBOLS[suit]}</Box>
      <Box position="absolute" bottom="3px" right="5px" textAlign="center" transform="rotate(180deg)">{RANK_LABELS[rank]}<Box fontSize="0.8em">{SUIT_SYMBOLS[suit]}</Box></Box>
      {children}
    </Box>
  );
  if (!onClick) return <Box role="img" aria-label={label ?? (faceDown ? "face-down card" : id === undefined ? "card" : cardLabel(id))} display="inline-block">{inner}</Box>;
  return (
    <Box as="button" type="button" onClick={onClick} aria-label={label ?? (id === undefined ? "card" : cardLabel(id))} aria-pressed={selected} display="inline-block" _focusVisible={{ outline: "3px solid #fde047", outlineOffset: "2px", borderRadius: "8px" }}>
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
