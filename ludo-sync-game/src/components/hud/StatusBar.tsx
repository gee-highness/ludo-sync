"use client";

import { Box, Text } from "@chakra-ui/react";

/** The translucent bar from the reference ("X is considering buying this property"). It is the screen's live status for assistive tech too. */
export const StatusBar = ({ text, tone, extra }: { text: string; tone?: "bonus"; extra?: React.ReactNode }) => (
  <Box bg="rgba(64, 84, 64, 0.82)" border="1px solid rgba(255,255,255,.12)" borderRadius="12px" px={4} py={2.5} minH="44px" display="flex" alignItems="center" justifyContent="center" flexDirection="column" backdropFilter="blur(2px)">
    <Text role="status" aria-live="polite" textAlign="center" fontWeight={700} fontSize={{ base: "sm", md: "md" }} color={tone === "bonus" ? "#fde047" : "#fff"}>{text}</Text>
    {extra}
  </Box>
);
