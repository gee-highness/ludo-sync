"use client";

import { Box, Button, Heading, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { pointsOf } from "@/lib/ludo/engine";
import { tuningOf, type GameState, type Player } from "@/lib/ludo/types";
import { resolveDesign, useDesigns } from "@/lib/client/pieces";
import { sharePhoto } from "@/lib/client/photo";
import { PieceShape } from "../board/PieceShape";

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
  /** Wins in a row, shown when it is more than one. */
  streak?: number;
}

/** Winner first, then by points. */
export const rankPlayers = (state: GameState): Player[] =>
  [...state.players].sort((a, b) => (b.seat === state.winner ? 1 : 0) - (a.seat === state.winner ? 1 : 0) || pointsOf(b) - pointsOf(a));

const STEP_H = [112, 82, 64, 52];
/** On screen the second place stands left of the winner, third to the right, fourth beyond. */
const POSITIONS = [1, 0, 2, 3];

const Podium = ({ ranked, state, reduceMotion }: { ranked: Player[]; state: GameState; reduceMotion: boolean }) => {
  const designs = useDesigns();
  const shown = POSITIONS.filter(i => i < ranked.length);
  return (
    <Box display="flex" alignItems="flex-end" justifyContent="center" gap={1} w="100%" h="210px" role="list" aria-label="Podium">
      {shown.map(rank => {
        const p = ranked[rank];
        const info = SEAT_INFO[p.seat];
        const d = resolveDesign(designs[p.seat][0], p.seat);
        return (
          <Box key={p.seat} role="listitem" display="flex" flexDir="column" alignItems="center" flex={1} minW={0} aria-label={`${rank + 1}. ${p.name}, ${pointsOf(p)} points`}>
            <Box
              sx={reduceMotion ? undefined : { animation: `podiumDrive 900ms cubic-bezier(.2,.9,.3,1) ${rank * 160}ms backwards`, "@keyframes podiumDrive": { "0%": { opacity: 0, transform: "translateX(-90px) scale(.7)" }, "100%": { opacity: 1, transform: "translateX(0) scale(1)" } } }}
            >
              <svg viewBox="-0.6 -0.6 1.2 1.2" width={rank === 0 ? 62 : 48} height={rank === 0 ? 62 : 48} aria-hidden><PieceShape design={d} id={`pod${p.seat}`} /></svg>
            </Box>
            <Text fontWeight={800} fontSize="sm" color="white" noOfLines={1} maxW="100%" px={1}>{p.name}</Text>
            <Box
              w="100%" h={`${STEP_H[rank]}px`} mt={1} borderRadius="10px 10px 0 0" display="flex" flexDir="column" alignItems="center" justifyContent="flex-start" pt={2}
              bg={`linear-gradient(180deg, ${info.light}, ${info.main} 60%, ${info.dark})`} boxShadow="inset 0 2px 0 rgba(255,255,255,.45)"
              sx={reduceMotion ? undefined : { animation: `podiumRise 600ms ease-out ${rank * 120}ms backwards`, "@keyframes podiumRise": { "0%": { transform: "scaleY(.2)" }, "100%": { transform: "scaleY(1)" } }, transformOrigin: "bottom" }}
            >
              <Text fontWeight={900} fontSize={rank === 0 ? "3xl" : "2xl"} color="white" lineHeight={1} textShadow="0 2px 4px rgba(0,0,0,.4)">{rank + 1}</Text>
              <Text fontSize="xs" fontWeight={800} color="whiteAlpha.900">{pointsOf(p)} pts{state.tycoon ? ` · $${state.tycoon.cash[p.seat]}` : ""}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export const WinnerOverlay = ({ state, reduceMotion, onRematch, rematchLabel = "Play again", waitingText, onExit, extra, streak = 0 }: Props) => {
  const [photo, setPhoto] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  if (state.winner === null) return null;
  const info = SEAT_INFO[state.winner];
  const name = state.players.find(p => p.seat === state.winner)?.name ?? info.name;
  const ranked = rankPlayers(state);
  const take = async () => {
    setPhoto("busy");
    const r = await sharePhoto(`${name} wins!`);
    setPhoto(r === "failed" ? "failed" : "saved");
  };
  return (
    <Box position="fixed" inset={0} zIndex={50} bg="blackAlpha.800" display="grid" placeItems="center" p={4} role="dialog" aria-modal="true" aria-label="Game over" overflowY="auto">
      {!reduceMotion && (
        <Box position="absolute" inset={0} overflow="hidden" pointerEvents="none" aria-hidden
          sx={{ "@keyframes fall": { from: { transform: "translateY(-10vh) rotate(0)" }, to: { transform: "translateY(110vh) rotate(720deg)" } } }}>
          {CONFETTI.map((c, i) => (
            <Box key={i} position="absolute" top={0} left={`${c.left}%`} w={`${c.size}px`} h={`${c.size * 1.6}px`} bg={SEAT_INFO[c.hue].main} borderRadius="2px"
              style={{ animation: `fall ${c.dur}s linear ${c.delay}s infinite` }} />
          ))}
        </Box>
      )}
      <VStack bg="gray.800" borderRadius="2xl" p={6} spacing={3} border="3px solid" borderColor={info.main} maxW="420px" w="100%" textAlign="center" position="relative">
        <Text fontSize="4xl" lineHeight={1} aria-hidden>🏆</Text>
        <Heading size="lg" color="white">{name} wins!</Heading>
        <Text color="gray.300" fontSize="sm">{tuningOf(state.rules).winTokens === 4 ? `All four ${info.name.toLowerCase()} vehicles made it home.` : `${tuningOf(state.rules).winTokens} ${info.name.toLowerCase()} vehicle${tuningOf(state.rules).winTokens === 1 ? "" : "s"} made it home.`}</Text>
        {streak > 1 && <Text color="yellow.200" fontWeight={800}>🔥 {streak} wins in a row</Text>}
        <Podium ranked={ranked} state={state} reduceMotion={reduceMotion} />
        {extra}
        {onRematch ? (
          <Button colorScheme="teal" size="lg" w="100%" onClick={onRematch} autoFocus>{rematchLabel}</Button>
        ) : (
          waitingText && <Text color="gray.400" fontSize="sm">{waitingText}</Text>
        )}
        <Button variant="outline" color="white" w="100%" isLoading={photo === "busy"} onClick={take}>
          {photo === "saved" ? "Photo ready. Take another" : photo === "failed" ? "Could not take a photo" : "Share a photo of the finish"}
        </Button>
        <Button variant="ghost" color="gray.200" w="100%" onClick={onExit}>Back to menu</Button>
      </VStack>
    </Box>
  );
};
