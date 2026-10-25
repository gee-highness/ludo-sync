"use client";

import { Box, Text } from "@chakra-ui/react";

export interface BannerInfo { key: number; text: string; sub?: string; tone: "turn" | "bonus" | "capture" }

const LOOK = {
  turn: { bg: "rgba(21,21,21,.78)", fg: "#fff", ring: "rgba(255,255,255,.35)" },
  bonus: { bg: "linear-gradient(180deg, #fde047, #eab308)", fg: "#3b2f00", ring: "rgba(255,255,255,.55)" },
  capture: { bg: "linear-gradient(180deg, #f87171, #dc2626)", fg: "#fff", ring: "rgba(255,255,255,.55)" },
} as const;

/** A small pill at the top of the board that fades in and out: who is up, a bonus roll, or a capture. It stays out of the way of the board. Decorative: the status bar carries the same news for assistive tech. */
export const TurnBanner = ({ banner, reduceMotion }: { banner: BannerInfo | null; reduceMotion: boolean }) => {
  if (!banner) return null;
  const look = LOOK[banner.tone];
  return (
    <Box
      key={banner.key} position="absolute" left="50%" top="6px" zIndex={6} pointerEvents="none" aria-hidden maxW="92%"
      bg={look.bg} color={look.fg} px={4} py={1} borderRadius="full" border="1px solid" borderColor={look.ring} boxShadow="0 4px 14px rgba(0,0,0,.4)"
      sx={{
        animation: reduceMotion ? "pillFade 1.6s linear forwards" : "pillDrop 1.8s cubic-bezier(.2,.8,.2,1) forwards",
        "@keyframes pillDrop": { "0%": { opacity: 0, transform: "translate(-50%, -14px)" }, "14%": { opacity: 1, transform: "translate(-50%, 0)" }, "80%": { opacity: 1, transform: "translate(-50%, 0)" }, "100%": { opacity: 0, transform: "translate(-50%, -6px)" } },
        "@keyframes pillFade": { "0%": { opacity: 0, transform: "translate(-50%, 0)" }, "15%": { opacity: 1, transform: "translate(-50%, 0)" }, "80%": { opacity: 1, transform: "translate(-50%, 0)" }, "100%": { opacity: 0, transform: "translate(-50%, 0)" } },
      }}
    >
      <Text fontWeight={800} fontSize={{ base: "sm", md: "md" }} noOfLines={1} textShadow={banner.tone === "bonus" ? "none" : "0 1px 3px rgba(0,0,0,.45)"}>
        {banner.text}{banner.sub ? <Text as="span" fontWeight={600} fontSize="xs" ml={2} opacity={0.85}>{banner.sub}</Text> : null}
      </Text>
    </Box>
  );
};
