"use client";

import { Box, Button, Heading, Text, VStack } from "@chakra-ui/react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { pointsOf } from "@/lib/ludo/engine";
import { tuningOf, type GameState } from "@/lib/ludo/types";

const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 29) % 100, delay: (i % 9) * 0.18, dur: 2.4 + (i % 5) * 0.4, hue: [0, 1, 2, 3][i % 4] as Seat, size: 6 + (i % 4) * 3,
}));

interface Props {
  state: GameState;
  reduceMotion: boolean;
  /** Buttons: rematch only offered to whoever may start one. */
  onRematch?: () => void;
  rematchLabel?: string;
  waitingText?: string;
  onExit: () => void;
  extra?: React.ReactNode;
}

export const WinnerOverlay = ({ state, reduceMotion, onRematch, rematchLabel = "Play again", waitingText, onExit, extra }: Props) => {
  if (state.winner === null) return null;
  const info = SEAT_INFO[state.winner];
  const name = state.players.find(p => p.seat === state.winner)?.name ?? info.name;
  return (
    <Box position="fixed" inset={0} zIndex={50} bg="blackAlpha.800" display="grid" placeItems="center" p={4} role="dialog" aria-modal="true" aria-label="Game over">
      {!reduceMotion && (
        <Box position="absolute" inset={0} overflow="hidden" pointerEvents="none" aria-hidden
          sx={{ "@keyframes fall": { from: { transform: "translateY(-10vh) rotate(0)" }, to: { transform: "translateY(110vh) rotate(720deg)" } } }}>
          {CONFETTI.map((c, i) => (
            <Box key={i} position="absolute" top={0} left={`${c.left}%`} w={`${c.size}px`} h={`${c.size * 1.6}px`} bg={SEAT_INFO[c.hue].main} borderRadius="2px"
              style={{ animation: `fall ${c.dur}s linear ${c.delay}s infinite` }} />
          ))}
        </Box>
      )}
      <VStack bg="gray.800" borderRadius="2xl" p={8} spacing={4} border="3px solid" borderColor={info.main} maxW="420px" w="100%" textAlign="center" position="relative">
        <Text fontSize="5xl" lineHeight={1} aria-hidden>🏆</Text>
        <Heading size="lg" color="white">{name} wins!</Heading>
        <Text color="gray.300">{tuningOf(state.rules).winTokens === 4 ? `All four ${info.name.toLowerCase()} tokens made it home.` : `${tuningOf(state.rules).winTokens} ${info.name.toLowerCase()} token${tuningOf(state.rules).winTokens === 1 ? "" : "s"} made it home.`}</Text>
        <VStack as="ol" w="100%" spacing={1} m={0} p={0} listStyleType="none" aria-label="Final points">
          {[...state.players].sort((a, b) => (b.seat === state.winner ? 1 : 0) - (a.seat === state.winner ? 1 : 0) || pointsOf(b) - pointsOf(a)).map(p => (
            <Box as="li" key={p.seat} display="flex" justifyContent="space-between" w="100%" px={3} py={1} borderRadius="md" bg="whiteAlpha.100">
              <Text color="white" fontWeight={p.seat === state.winner ? 800 : 500} noOfLines={1}>{p.name}</Text>
              <Text color="yellow.200" fontWeight={700}>{pointsOf(p)} pts{state.tycoon ? ` · $${state.tycoon.cash[p.seat]}` : ""}</Text>
            </Box>
          ))}
        </VStack>
        {extra}
        {onRematch ? (
          <Button colorScheme="teal" size="lg" w="100%" onClick={onRematch} autoFocus>{rematchLabel}</Button>
        ) : (
          waitingText && <Text color="gray.400" fontSize="sm">{waitingText}</Text>
        )}
        <Button variant="ghost" color="gray.200" w="100%" onClick={onExit}>Back to menu</Button>
      </VStack>
    </Box>
  );
};
