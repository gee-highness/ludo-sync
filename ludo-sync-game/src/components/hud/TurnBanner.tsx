"use client";

import { Box, Text } from "@chakra-ui/react";

export interface BannerInfo { key: number; text: string; sub?: string; tone: "turn" | "bonus" }

/** A lime ribbon that sweeps across the board for a moment, like the reference's "X's turn". Decorative: the status bar carries the same news for assistive tech. */
export const TurnBanner = ({ banner, reduceMotion }: { banner: BannerInfo | null; reduceMotion: boolean }) => {
  if (!banner) return null;
  const gold = banner.tone === "bonus";
  return (
    <Box
      key={banner.key} position="absolute" left={0} right={0} top="50%" mt="-26px" h="52px" zIndex={6} pointerEvents="none" aria-hidden display="grid" placeItems="center"
      bg={gold ? "linear-gradient(180deg, #fde047, #eab308)" : "linear-gradient(180deg, #a3e635, #65a30d)"} boxShadow="0 6px 18px rgba(0,0,0,.5)"
      borderY="2px solid rgba(255,255,255,.55)"
      sx={{
        animation: reduceMotion ? "bannerFade 1.6s linear forwards" : "bannerSweep 1.7s cubic-bezier(.2,.8,.2,1) forwards",
        "@keyframes bannerSweep": { "0%": { transform: "translateX(-105%)" }, "18%": { transform: "translateX(0)" }, "78%": { transform: "translateX(0)", opacity: 1 }, "100%": { transform: "translateX(105%)", opacity: 0.9 } },
        "@keyframes bannerFade": { "0%": { opacity: 0 }, "15%": { opacity: 1 }, "80%": { opacity: 1 }, "100%": { opacity: 0 } },
      }}
    >
      <Text fontWeight={900} fontSize={{ base: "lg", md: "xl" }} color={gold ? "#3b2f00" : "#fff"} textShadow={gold ? "none" : "0 2px 4px rgba(0,0,0,.45)"} letterSpacing="0.02em" noOfLines={1} px={3}>
        {banner.text}{banner.sub ? <Text as="span" fontWeight={700} fontSize="sm" ml={2} opacity={0.85}>{banner.sub}</Text> : null}
      </Text>
    </Box>
  );
};
