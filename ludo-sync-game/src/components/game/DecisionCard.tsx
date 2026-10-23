"use client";

import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { houseCost, rentOf, SQUARES } from "@/lib/ludo/tycoon";
import { tuningOf, type Action, type GameState } from "@/lib/ludo/types";

/** Tycoon: the offer to buy or build on the square the player just landed on. */
export const DecisionCard = ({ state, act }: { state: GameState; act: (a: Action) => boolean }) => {
  const t = state.tycoon;
  const p = t?.pending;
  if (!t || !p) return null;
  const sq = SQUARES[p.ring];
  const cost = p.kind === "buy" ? sq.price : houseCost(p.ring);
  const cash = t.cash[p.seat];
  return (
    <Box bg="whiteAlpha.200" borderRadius="xl" p={3} role="group" aria-label="Property offer">
      <Text fontWeight={800}>{sq.name}</Text>
      <Text fontSize="sm" color="gray.300">
        {p.kind === "buy"
          ? `For sale: $${sq.price}. You have $${cash}.`
          : `You own the whole set. Build level ${t.level[p.ring] + 1} for $${cost}. Rent rises to $${rentAfterBuild(state, p.ring)}.`}
      </Text>
      <HStack mt={2} spacing={2}>
        <Button size="sm" colorScheme="green" isDisabled={cash < cost} onClick={() => act({ type: p.kind })}>
          {p.kind === "buy" ? `Buy $${cost}` : `Build $${cost}`}
        </Button>
        <Button size="sm" variant="outline" colorScheme="gray" onClick={() => act({ type: "pass" })}>Pass</Button>
      </HStack>
    </Box>
  );
};

const rentAfterBuild = (state: GameState, ring: number) => {
  const t = state.tycoon!;
  const next = { ...t, level: t.level.map((l, i) => (i === ring ? l + 1 : l)) };
  return rentOf(next, ring, tuningOf(state.rules).rentFactor);
};
