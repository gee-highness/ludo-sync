"use client";

import { Box } from "@chakra-ui/react";

/** The big red glossy pill from the reference. Stays in place, dimmed, when it is not your turn to roll. */
export const RollButton = ({ enabled, label, onClick, pulse = false, block = false, small = false }: {
  enabled: boolean; label: string; onClick: () => void; pulse?: boolean; block?: boolean; small?: boolean;
}) => (
  <Box
    as="button" type="button" onClick={onClick} aria-disabled={!enabled} disabled={!enabled} minH={small ? "48px" : "52px"} flex={1} minW={small ? "0" : "140px"} w={block ? "100%" : undefined} px={small ? 3 : 6} borderRadius="full" color="#fff"
    fontWeight={900} fontSize={small ? "md" : { base: "lg", md: "xl" }} whiteSpace="nowrap" letterSpacing="0.04em" textShadow="0 2px 2px rgba(80,0,0,.6)" textTransform="uppercase"
    bg="linear-gradient(180deg, #ff7a7a 0%, #e11d1d 45%, #b30f0f 100%)" border="3px solid #fff" boxShadow="0 5px 0 #7f0d0d, 0 10px 18px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.55)"
    transition="transform .08s, box-shadow .08s, opacity .2s, filter .2s" opacity={enabled ? 1 : 0.45} filter={enabled ? undefined : "grayscale(.5)"} cursor={enabled ? "pointer" : "default"}
    _active={enabled ? { transform: "translateY(4px)", boxShadow: "0 1px 0 #7f0d0d, 0 4px 10px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.55)" } : undefined}
    _focusVisible={{ outline: "3px solid #fff", outlineOffset: "3px" }}
    sx={enabled && pulse ? { animation: "pillPulse 1.4s ease-in-out infinite", "@keyframes pillPulse": { "0%,100%": { transform: "scale(1)" }, "50%": { transform: "scale(1.045)" } } } : undefined}
  >{label}</Box>
);
