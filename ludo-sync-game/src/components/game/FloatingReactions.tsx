"use client";

import { Box, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";

export interface FloatingReaction { id: number; seat: Seat | null; name: string; emoji: string; at: number }

const LIFE_MS = 3200;

/** Emoji from other players drift up over the board for a moment, so a reaction is seen as well as logged. */
export const FloatingReactions = ({ items, reduceMotion }: { items: FloatingReaction[]; reduceMotion: boolean }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(t);
  }, []);
  const live = items.filter(r => now - r.at < LIFE_MS).slice(-5);
  if (!live.length || reduceMotion) return null;
  return (
    <Box position="absolute" inset={0} pointerEvents="none" zIndex={7} aria-hidden overflow="hidden">
      {live.map(r => (
        <Box
          key={r.id} position="absolute" bottom="8%" left={`${14 + ((r.id * 37) % 64)}%`} textAlign="center"
          sx={{ animation: `reactFloat ${LIFE_MS}ms ease-out forwards`, "@keyframes reactFloat": { "0%": { opacity: 0, transform: "translateY(10px) scale(.6)" }, "12%": { opacity: 1, transform: "translateY(-10px) scale(1.15)" }, "100%": { opacity: 0, transform: "translateY(-150px) scale(1)" } } }}
        >
          <Text fontSize="3xl" lineHeight={1} textShadow="0 3px 8px rgba(0,0,0,.5)">{r.emoji}</Text>
          <Text fontSize="2xs" fontWeight={800} color="#fff" bg={r.seat !== null ? SEAT_INFO[r.seat].main : "blackAlpha.700"} px={2} borderRadius="full" mt={1} noOfLines={1} maxW="90px">{r.name}</Text>
        </Box>
      ))}
    </Box>
  );
};
