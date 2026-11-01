"use client";

import { Badge, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import type { Action } from "@/lib/skipbo/types";
import type { TableView } from "@/lib/skipbo/view";
import type { Award } from "@/lib/client/profile";
import { Confetti } from "./Confetti";

interface Props {
  view: TableView;
  act: (a: Action) => boolean;
  onExit: () => void;
  onRematch?: () => void;
  rematchLabel?: string;
  waitingText?: string;
  /** What the game was worth to you, once it has been recorded. */
  award?: Award | null;
}

/** The end of a round, or of the whole game: who won, what they scored, and the way on. */
export function RoundOverlay({ view, act, onExit, onRematch, rematchLabel = "Play again", waitingText, award }: Props) {
  const over = view.phase === "over";
  const winner = over ? view.winner : view.roundWinner;
  const iWon = winner !== null && winner === view.you;
  useEffect(() => { sound.play(iWon || view.you === null ? "win" : "error"); if (iWon) buzz("win"); }, [iWon, view.you]);
  const order = view.players.map((p, i) => ({ p, i }))
    .sort((a, b) => (a.i === winner ? -1 : b.i === winner ? 1 : view.rules.tournament ? b.p.score - a.p.score : a.p.stockCount - b.p.stockCount));
  return (
    <Box position="absolute" inset={0} zIndex={20} bg="rgba(4,14,9,.82)" display="grid" placeItems="center" p={4} role="dialog" aria-modal="true" aria-label={over ? "Game over" : "Round over"}
      sx={{ animation: "sbFade .3s ease-out", "@keyframes sbFade": { from: { opacity: 0 }, to: { opacity: 1 } } }}>
      {iWon && <Confetti />}
      <VStack w="100%" maxW="420px" spacing={3} p={5} borderRadius="2xl" bg="linear-gradient(180deg,#14573a,#0c3a27)" border="2px solid #fde047" boxShadow="0 20px 60px rgba(0,0,0,.6)">
        <Text fontSize="4xl" aria-hidden>{iWon ? "🏆" : over ? "🎉" : "🃏"}</Text>
        <Text fontSize="2xl" fontWeight={900} textAlign="center">
          {over ? (iWon ? "You win!" : `${view.players[winner ?? 0]?.name} wins!`) : (iWon ? "You won the round!" : `${view.players[winner ?? 0]?.name} won the round`)}
        </Text>
        {view.rules.tournament && !over && view.roundPoints > 0 && <Text color="#fde047" fontWeight={800}>+{view.roundPoints} points: 25 for the win and 5 for every card left in the other stocks</Text>}
        {!view.rules.tournament && <Text color="whiteAlpha.800" fontSize="sm">{view.players[winner ?? 0]?.name} emptied their stock pile.</Text>}
        <VStack w="100%" spacing={1} as="ol" m={0} p={0} listStyleType="none">
          {order.map(({ p, i }, rank) => (
            <HStack key={i} as="li" w="100%" justify="space-between" bg="blackAlpha.300" borderRadius="lg" px={3} py={2} border="1px solid" borderColor={i === winner ? "#fde047" : "transparent"}>
              <HStack><Text fontWeight={900} w="20px">{rank + 1}</Text><Text fontWeight={700} noOfLines={1}>{p.name}{i === view.you ? " (you)" : ""}</Text></HStack>
              <HStack spacing={2}>
                <Badge colorScheme={p.stockCount === 0 ? "green" : "gray"}>{p.stockCount === 0 ? "stock empty" : `${p.stockCount} left`}</Badge>
                <Text fontWeight={800} color="#fdba74" aria-label={`${p.points} points`}>★ {p.points}</Text>
                {view.rules.tournament && <Text fontWeight={800} color="#fde047">{p.score}</Text>}
              </HStack>
            </HStack>
          ))}
        </VStack>
        {over && award && (
          <VStack spacing={1} w="100%" bg="blackAlpha.300" borderRadius="lg" p={3} aria-label="Experience earned">
            <Text fontWeight={900} color="#fde047">+{award.gained} XP</Text>
            <Box w="100%" h="8px" borderRadius="full" bg="whiteAlpha.300" overflow="hidden"><Box h="100%" w={`${Math.round(award.after.fraction * 100)}%`} bg="linear-gradient(90deg,#fde047,#f59e0b)" transition="width .8s ease" /></Box>
            <Text fontSize="sm" color="whiteAlpha.800">Level {award.after.level}{award.leveledUp ? " · level up!" : ""} · {award.after.into} of {award.after.need} to the next</Text>
          </VStack>
        )}
        <HStack w="100%" spacing={2}>
          {!over && <Button flex={1} colorScheme="yellow" onClick={() => act({ type: "nextRound" })} isDisabled={view.you === null}>Next round</Button>}
          {over && onRematch && <Button flex={1} colorScheme="yellow" onClick={onRematch}>{rematchLabel}</Button>}
          <Button flex={1} variant="outline" color="white" onClick={onExit}>Leave table</Button>
        </HStack>
        {over && !onRematch && waitingText && <Text color="whiteAlpha.700" fontSize="sm">{waitingText}</Text>}
      </VStack>
    </Box>
  );
}
