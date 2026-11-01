"use client";

import { Box } from "@chakra-ui/react";
import { WILD, type Card } from "@/lib/skipbo/types";
import { usePrefs } from "@/lib/skipbo/prefs";
import { backById } from "@/lib/client/unlocks";

/** A number drawn by CSS: the card is described by its button's label, not by the digits painted on it. */
const Num = ({ n, ...rest }: { n: number | string } & React.ComponentProps<typeof Box>) => <Box as="span" data-n={n} sx={{ "&::before": { content: "attr(data-n)" } }} {...rest} />;

export type CardSize = "xs" | "sm" | "md" | "lg";
/** Width in px at each size; the height is 1.42 times that. */
export const CARD_W: Record<CardSize, number> = { xs: 30, sm: 44, md: 56, lg: 68 };

/** As on the real cards: low numbers blue, middle green, high red. */
export const cardColor = (v: Card): { main: string; dark: string; light: string } =>
  v === WILD ? { main: "#7c3aed", dark: "#4c1d95", light: "#c4b5fd" }
  : v <= 4 ? { main: "#2563eb", dark: "#1e3a8a", light: "#93c5fd" }
  : v <= 8 ? { main: "#16a34a", dark: "#14532d", light: "#86efac" }
  : { main: "#dc2626", dark: "#7f1d1d", light: "#fca5a5" };

interface Props {
  value?: Card;
  size?: CardSize;
  faceDown?: boolean;
  /** Raised and outlined: the card the player has picked up. */
  selected?: boolean;
  /** A soft pulse, for hints and for the card that just moved. */
  glow?: boolean;
  dim?: boolean;
  /** For a Skip-Bo on a building pile: the number it is standing in for. */
  asValue?: number;
  /** For piles: how many cards are in the stack. */
  count?: number;
  /** Show this card back instead of the one chosen in the settings (for previews). */
  backId?: string;
}

/** The shape that goes with each colour, for people who cannot tell the colours apart. */
export const markFor = (v: Card): string => (v === WILD ? "★" : v <= 4 ? "▲" : v <= 8 ? "●" : "■");

/** One card, drawn in CSS and SVG so there is nothing to download. */
export function CardFace({ value = 1, size = "md", faceDown, selected, glow, dim, asValue, count, backId }: Props) {
  const prefs = usePrefs();
  const back = backById(backId ?? prefs.back);
  const w = CARD_W[size];
  const h = Math.round(w * 1.42);
  const c = cardColor(value);
  const wild = value === WILD;
  const big = Math.round(w * (value >= 10 ? 0.52 : 0.64));
  return (
    <Box
      position="relative" w={`${w}px`} h={`${h}px`} borderRadius={`${Math.round(w * 0.14)}px`} flexShrink={0} userSelect="none"
      transform={selected ? "translateY(-10px) scale(1.06)" : undefined} transition="transform .15s ease, box-shadow .15s ease, opacity .2s"
      opacity={dim ? 0.45 : 1}
      boxShadow={selected ? "0 0 0 3px #fde047, 0 10px 18px rgba(0,0,0,.55)" : glow ? "0 0 0 2px #fde047, 0 0 14px 2px rgba(253,224,71,.8)" : "0 2px 5px rgba(0,0,0,.45)"}
      sx={glow && !selected ? { animation: "cardGlow 1.1s ease-in-out infinite alternate", "@keyframes cardGlow": { from: { filter: "brightness(1)" }, to: { filter: "brightness(1.22)" } } } : undefined}
      aria-hidden
    >
      {faceDown ? (
        <Box w="100%" h="100%" borderRadius="inherit" border="3px solid #f8fafc" bg={`radial-gradient(circle at 50% 40%, ${back.a} 0%, ${back.b} 70%)`} display="grid" placeItems="center" overflow="hidden">
          <Box w="72%" h="72%" borderRadius="full" border={`2px solid ${back.ring}88`} display="grid" placeItems="center" color={back.mark} fontWeight={900} fontSize={`${Math.round(w * 0.3)}px`} letterSpacing="-0.04em" transform="rotate(-12deg)">
            SB
          </Box>
        </Box>
      ) : (
        <Box w="100%" h="100%" borderRadius="inherit" bg={wild ? `linear-gradient(160deg, ${c.dark}, #111827 70%)` : "#fff"} border={`${Math.max(2, Math.round(w * 0.05))}px solid ${wild ? "#f8fafc" : c.main}`} overflow="hidden" display="flex" alignItems="center" justifyContent="center">
          {wild ? (
            <svg viewBox="0 0 40 56" width="100%" height="100%" role="img" aria-label="Skip-Bo wildcard">
              <defs><linearGradient id="skb-rainbow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f87171" /><stop offset=".33" stopColor="#fde047" /><stop offset=".66" stopColor="#4ade80" /><stop offset="1" stopColor="#60a5fa" />
              </linearGradient></defs>
              <path d="M20 8l3.6 8.4 9 .8-6.8 6 2.1 8.8L20 27.2l-7.9 4.8 2.1-8.8-6.8-6 9-.8z" fill="url(#skb-rainbow)" stroke="#fff" strokeWidth="0.8" />
              <text x="20" y="43" textAnchor="middle" fontSize="7.2" fontWeight="900" fill="#fff" letterSpacing="0.2">SKIP</text>
              <text x="20" y="51" textAnchor="middle" fontSize="7.2" fontWeight="900" fill="#fde047" letterSpacing="0.2">-BO</text>
            </svg>
          ) : (
            <>
              <Box position="absolute" top="3px" left={`${Math.round(w * 0.1)}px`} fontSize={`${Math.round(w * 0.2)}px`} fontWeight={800} color={c.main} lineHeight={1}><Num n={value} /></Box>
              <Box position="absolute" bottom="3px" right={`${Math.round(w * 0.1)}px`} fontSize={`${Math.round(w * 0.2)}px`} fontWeight={800} color={c.main} lineHeight={1} transform="rotate(180deg)"><Num n={value} /></Box>
              <Box position="absolute" inset={`${Math.round(w * 0.18)}px ${Math.round(w * 0.12)}px`} borderRadius="50%" bg={`radial-gradient(circle at 35% 30%, ${c.light}55, ${c.main}22 70%)`} />
              <Box position="relative" fontSize={`${big}px`} fontWeight={900} color={c.main} lineHeight={1} textShadow={`0 2px 0 ${c.light}`} letterSpacing="-0.04em"><Num n={value} /></Box>
              {prefs.marks && <Box position="absolute" bottom={`${Math.round(w * 0.12)}px`} left="50%" transform="translateX(-50%)" fontSize={`${Math.round(w * 0.2)}px`} color={c.main} lineHeight={1}><Num n={markFor(value)} /></Box>}
            </>
          )}
        </Box>
      )}
      {asValue !== undefined && wild && (
        <Box position="absolute" top="-7px" right="-7px" minW="22px" h="22px" px="4px" borderRadius="full" bg="#fde047" color="#1f2937" fontWeight={900} fontSize="12px" display="grid" placeItems="center" border="2px solid #fff" boxShadow="0 2px 4px rgba(0,0,0,.5)">
          <Num n={asValue} />
        </Box>
      )}
      {count !== undefined && count > 1 && (
        <Box position="absolute" bottom="-8px" left="50%" transform="translateX(-50%)" px="6px" h="18px" borderRadius="full" bg="rgba(15,23,42,.92)" color="#f8fafc" fontWeight={800} fontSize="11px" display="grid" placeItems="center" border="1px solid rgba(255,255,255,.35)">
          <Num n={count} />
        </Box>
      )}
    </Box>
  );
}

/** An empty spot for a pile, optionally showing what it is waiting for. */
export function Slot({ size = "md", label, hot, children }: { size?: CardSize; label?: string; hot?: boolean; children?: React.ReactNode }) {
  const w = CARD_W[size];
  return (
    <Box position="relative" w={`${w}px`} h={`${Math.round(w * 1.42)}px`} borderRadius={`${Math.round(w * 0.14)}px`} flexShrink={0} display="grid" placeItems="center"
      border={`2px dashed ${hot ? "#fde047" : "rgba(255,255,255,.35)"}`} bg={hot ? "rgba(253,224,71,.14)" : "rgba(0,0,0,.18)"} color="rgba(255,255,255,.5)" fontWeight={800} fontSize={`${Math.round(w * 0.3)}px`} transition="all .15s">
      {children ?? label}
    </Box>
  );
}
