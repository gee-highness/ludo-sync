"use client";

import { Box, HStack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { TableView } from "@/lib/skipbo/view";

export interface Floater { id: number; player: number; name: string; amount: number; you: boolean }

/** Who just scored: compares each player's points with what they had a moment ago. */
export const usePointsFloaters = (view: TableView): Floater[] => {
  const prev = useRef<number[] | null>(null);
  const idRef = useRef(0);
  const [items, setItems] = useState<Floater[]>([]);
  useEffect(() => {
    const now = view.players.map(p => p.points);
    const was = prev.current;
    prev.current = now;
    if (!was || was.length !== now.length) return;
    const fresh: Floater[] = [];
    now.forEach((n, i) => { if (n > was[i]) fresh.push({ id: ++idRef.current, player: i, name: view.players[i].name, amount: n - was[i], you: i === view.you }); });
    if (!fresh.length) return;
    setItems(l => [...l, ...fresh].slice(-4));
    const ids = new Set(fresh.map(f => f.id));
    const t = setTimeout(() => setItems(l => l.filter(x => !ids.has(x.id))), 1700);
    return () => clearTimeout(t);
  }, [view]);
  return items;
};

/** Little "+3 ★" pills that rise and fade when someone scores. */
export function PointsFloaters({ items }: { items: Floater[] }) {
  if (!items.length) return null;
  return (
    <HStack position="absolute" zIndex={7} top="112px" left={0} right={0} justify="center" spacing={2} pointerEvents="none" aria-hidden>
      {items.map(f => (
        <Box key={f.id} px={3} py={1} borderRadius="full" bg={f.you ? "linear-gradient(180deg,#fde047,#f59e0b)" : "rgba(15,23,42,.9)"} color={f.you ? "#1f2937" : "white"} boxShadow="0 4px 14px rgba(0,0,0,.45)"
          sx={{ animation: "sbPts 1.7s ease-out forwards", "@keyframes sbPts": { "0%": { opacity: 0, transform: "translateY(10px) scale(.8)" }, "15%": { opacity: 1, transform: "translateY(0) scale(1.05)" }, "100%": { opacity: 0, transform: "translateY(-30px)" } } }}>
          <Text fontWeight={900} fontSize="sm">{f.you ? "You" : f.name} +{f.amount} ★</Text>
        </Box>
      ))}
    </HStack>
  );
}
