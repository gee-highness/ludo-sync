"use client";

import { Box, HStack, Text } from "@chakra-ui/react";
import { REACTIONS } from "@/lib/skipbo/net/protocol";
import type { Reaction } from "@/lib/skipbo/net/host";

/** A row of quick emoji, and the ones other players just sent floating up. */
export function Reactions({ items, onSend }: { items: Reaction[]; onSend: (emoji: string) => void }) {
  return (
    <Box position="relative">
      <HStack spacing={1} justify="center" wrap="wrap" aria-label="Reactions">
        {REACTIONS.slice(0, 8).map(e => (
          <Box as="button" key={e} fontSize="22px" px={1} borderRadius="md" aria-label={`Send ${e}`} onClick={() => onSend(e)} _hover={{ transform: "scale(1.2)" }} transition="transform .1s">{e}</Box>
        ))}
      </HStack>
      <HStack position="absolute" bottom="100%" left={0} right={0} justify="center" spacing={2} pointerEvents="none" aria-live="polite">
        {items.map(r => (
          <Box key={r.id} bg="rgba(15,23,42,.88)" borderRadius="full" px={3} py={1} fontSize="sm" sx={{ animation: "sbFloat 3.5s ease-out forwards", "@keyframes sbFloat": { "0%": { opacity: 0, transform: "translateY(10px)" }, "10%": { opacity: 1 }, "100%": { opacity: 0, transform: "translateY(-30px)" } } }}>
            <Text as="span" mr={1}>{r.emoji}</Text><Text as="span" fontWeight={700}>{r.name}</Text>
          </Box>
        ))}
      </HStack>
    </Box>
  );
}
