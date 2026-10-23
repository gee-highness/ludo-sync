"use client";

import { Badge, Box, HStack, Text } from "@chakra-ui/react";
import { FINISH, SEAT_INFO, YARD } from "@/lib/ludo/board";
import type { Player } from "@/lib/ludo/types";
import { tokensHome } from "@/lib/ludo/engine";

interface Props {
  player: Player;
  current: boolean;
  isMe: boolean;
  symbols: boolean;
  compact: boolean;
  /** Online: this player's connection is down. */
  away?: boolean;
  /** Extra line, such as "Host". */
  tag?: string;
}

const LEVEL_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;

export const PlayerCard = ({ player, current, isMe, symbols, compact, away, tag }: Props) => {
  const info = SEAT_INFO[player.seat];
  const home = tokensHome(player);
  return (
    <HStack
      as="li" listStyleType="none" spacing={2} px={compact ? 2 : 3} py={compact ? 1.5 : 2} borderRadius="xl" minW={0}
      bg={current ? "whiteAlpha.300" : "whiteAlpha.100"} border="2px solid" borderColor={current ? info.light : "transparent"}
      opacity={away ? 0.55 : 1} transition="all .2s" aria-current={current ? "true" : undefined}
      boxShadow={current ? `0 0 14px ${info.main}88` : undefined}
    >
      <Box
        w={compact ? "22px" : "28px"} h={compact ? "22px" : "28px"} flexShrink={0} borderRadius="full" bg={`radial-gradient(circle at 35% 30%, ${info.light}, ${info.main} 55%, ${info.dark})`}
        border="2px solid #fff" display="grid" placeItems="center" fontSize="xs" color="white" fontWeight="800" aria-hidden
      >
        {symbols ? info.glyph : null}
      </Box>
      <Box minW={0} flex={1}>
        <Text fontSize={compact ? "xs" : "sm"} fontWeight={700} noOfLines={1} color="white">
          {player.name}{isMe ? " (you)" : ""}
        </Text>
        {!compact && (
          <HStack spacing={1} mt={0.5}>
            {player.kind === "bot" && <Badge colorScheme="gray" fontSize="2xs">Bot · {LEVEL_LABEL[player.level ?? "normal"]}</Badge>}
            {tag && <Badge colorScheme="teal" fontSize="2xs">{tag}</Badge>}
            {away && <Badge colorScheme="orange" fontSize="2xs">Away</Badge>}
          </HStack>
        )}
      </Box>
      <HStack spacing="3px" flexShrink={0} aria-label={`${home} of 4 tokens home`} role="img">
        {player.tokens.map((t, i) => (
          <Box key={i} w="7px" h="7px" borderRadius="full" bg={t === FINISH ? "yellow.300" : t === YARD ? "whiteAlpha.300" : info.light} />
        ))}
      </HStack>
    </HStack>
  );
};
