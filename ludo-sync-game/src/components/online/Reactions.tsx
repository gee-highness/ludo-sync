"use client";

import { Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { REACTIONS } from "@/lib/net/protocol";
import { SEAT_INFO } from "@/lib/ludo/board";
import type { Reaction } from "@/lib/net/host";

/** Six one-tap emoji, and the last few received, shown beside the player's name. */
export const ReactionPanel = ({ items, onSend }: { items: Reaction[]; onSend: (emoji: string) => void }) => (
  <VStack align="stretch" spacing={2}>
    <HStack spacing={1} justify="center" role="group" aria-label="Quick reactions">
      {REACTIONS.map(e => (
        <IconButton key={e} aria-label={`Send ${e}`} variant="ghost" fontSize="xl" size="sm" icon={<span aria-hidden>{e}</span>} onClick={() => onSend(e)} />
      ))}
    </HStack>
    <Box minH="20px" aria-live="polite">
      {items.slice(-3).map(r => (
        <Text key={r.id} fontSize="sm" color={r.seat === null ? "gray.300" : SEAT_INFO[r.seat].light}>
          <span aria-hidden>{r.emoji}</span> {r.name}
        </Text>
      ))}
    </Box>
  </VStack>
);
