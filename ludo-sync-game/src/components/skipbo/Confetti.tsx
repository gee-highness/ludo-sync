"use client";

import { Box } from "@chakra-ui/react";
import { useMemo } from "react";

const COLOURS = ["#fde047", "#f87171", "#60a5fa", "#4ade80", "#f0abfc", "#fb923c"];

/** A burst of paper that falls once. It is decoration only, so it is hidden from screen readers and skipped for reduced motion. */
export function Confetti({ count = 36 }: { count?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: `${(i * 97) % 100}%`, delay: `${((i * 53) % 90) / 100}s`, dur: `${1.8 + ((i * 37) % 14) / 10}s`, colour: COLOURS[i % COLOURS.length], size: 6 + (i % 4) * 2, spin: (i % 2 ? 1 : -1) * (360 + (i % 5) * 120),
  })), [count]);
  return (
    <Box position="absolute" inset={0} overflow="hidden" pointerEvents="none" aria-hidden sx={{ "@media (prefers-reduced-motion: reduce)": { display: "none" } }}>
      {bits.map((b, i) => (
        <Box key={i} position="absolute" top="-12px" left={b.left} w={`${b.size}px`} h={`${b.size * 1.6}px`} bg={b.colour} borderRadius="1px"
          sx={{ animation: `sbFall ${b.dur} ${b.delay} ease-in forwards`, "--spin": `${b.spin}deg`, "@keyframes sbFall": { "0%": { transform: "translateY(0) rotate(0)", opacity: 1 }, "100%": { transform: "translateY(105dvh) rotate(var(--spin))", opacity: 0.9 } } }} />
      ))}
    </Box>
  );
}
