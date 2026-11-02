"use client";

import { CardBackFace } from "./cards/CardBack";
import { Box } from "@chakra-ui/react";
import type { Card } from "@/lib/games/fourcolors/driver";

/** Four colours, each with its own shape, so the colour is never the only cue. */
export const COLOUR_HEX = ["#dc2626", "#eab308", "#16a34a", "#2563eb"] as const;
export const COLOUR_NAMES = ["red", "yellow", "green", "blue"] as const;
export const SHAPES = ["●", "▲", "■", "◆"] as const;
const SIZES = { sm: { w: 44, h: 64, f: 20 }, md: { w: 58, h: 84, f: 28 }, lg: { w: 74, h: 106, f: 36 } } as const;

export const faceOf = (c: Card): string => (c.k === 0 ? String(c.v) : c.k === 1 ? "⊘" : c.k === 2 ? "⇄" : c.k === 3 ? "+2" : c.k === 4 ? "★" : "+4");
export const cardName = (c: Card) => {
  const what = c.k === 0 ? String(c.v) : ["", "skip", "reverse", "draw two", "wild", "wild draw four"][c.k];
  return c.c === 4 ? what : `${COLOUR_NAMES[c.c]} ${what}`;
};

interface Props { card?: Card; faceDown?: boolean; size?: keyof typeof SIZES; selected?: boolean; glow?: boolean; dim?: boolean; onClick?: () => void; colour?: number; /** stable key so the card can fly when it moves, see useMotion */ mk?: string }

/** An original card design: a coloured card with a big face, a shape in the corners, and four coloured quarters for wilds. */
export function ColourCard({ card, faceDown, size = "md", selected, glow, dim, onClick, colour, mk }: Props) {
  const z = SIZES[size];
  const wild = card && card.c === 4;
  const bg = faceDown ? "#0f172a" : wild ? "conic-gradient(#dc2626 0 25%, #eab308 0 50%, #16a34a 0 75%, #2563eb 0 100%)" : COLOUR_HEX[card?.c ?? 0];
  const shown = colour !== undefined && wild ? COLOUR_HEX[colour] : undefined;
  const common = {
    w: `${z.w}px`, h: `${z.h}px`, borderRadius: "10px", flexShrink: 0, position: "relative" as const, userSelect: "none" as const, background: bg, color: "white", border: "3px solid #f8fafc",
    filter: dim ? "brightness(.55) saturate(.7)" : undefined, transition: "transform .15s, box-shadow .15s, opacity .15s", transform: selected ? "translateY(-12px)" : undefined,
    boxShadow: selected ? "0 0 0 3px #fde047, 0 8px 14px rgba(0,0,0,.5)" : glow ? "0 0 0 2px #38bdf8, 0 0 12px #38bdf8" : "0 2px 5px rgba(0,0,0,.5)",
  };
  const body = faceDown ? (
    <Box {...common} overflow="hidden" border="3px solid #f8fafc" data-cardback="1" aria-hidden><CardBackFace /></Box>
  ) : (
    <Box {...common} fontWeight={900} lineHeight={1} aria-hidden overflow="hidden"
      backgroundImage={wild ? undefined : "repeating-linear-gradient(135deg, rgba(255,255,255,.14) 0 6px, transparent 6px 12px)"}>
      {/* a big faint shape for the colour, and the face over it: no ovals, so the cards read as their own design */}
      {!wild && <Box position="absolute" inset={0} display="grid" placeItems="center" fontSize={`${z.f * 3.1}px`} color="rgba(255,255,255,.22)" lineHeight={1}>{SHAPES[card!.c]}</Box>}
      <Box position="absolute" inset={0} display="grid" placeItems="center" fontSize={`${z.f * 1.15}px`} color="white" style={{ WebkitTextStroke: "1.5px rgba(0,0,0,.55)", paintOrder: "stroke fill" }} textShadow="0 2px 3px rgba(0,0,0,.5)">{faceOf(card!)}</Box>
      {!wild && <Box position="absolute" top="3px" left="5px" fontSize={`${z.f * 0.42}px`} textShadow="0 1px 2px rgba(0,0,0,.6)">{SHAPES[card!.c]}</Box>}
      {!wild && <Box position="absolute" bottom="3px" right="5px" fontSize={`${z.f * 0.42}px`} textShadow="0 1px 2px rgba(0,0,0,.6)">{SHAPES[card!.c]}</Box>}
      {wild && shown && <Box position="absolute" bottom="3px" left="50%" transform="translateX(-50%)" w="20px" h="20px" borderRadius="50%" bg={shown} border="2px solid white" />}
    </Box>
  );
  const label = faceDown ? "face-down card" : cardName(card!);
  if (!onClick) return <Box role="img" aria-label={label} display="inline-block" data-mk={mk}>{body}</Box>;
  return <Box as="button" type="button" onClick={onClick} aria-label={label} aria-pressed={selected} display="inline-block" data-mk={mk} _focusVisible={{ outline: "3px solid #fde047", outlineOffset: "2px", borderRadius: "10px" }}>{body}</Box>;
}
