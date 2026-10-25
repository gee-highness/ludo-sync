"use client";

import { Box, Text } from "@chakra-ui/react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { pointsOf, tokensHome } from "@/lib/ludo/engine";
import type { Player } from "@/lib/ludo/types";
import { resolveDesign, useDesigns } from "@/lib/client/pieces";
import { PieceShape } from "../board/PieceShape";

export interface Floater { id: number; seat: Seat; text: string; tone: "gain" | "loss" }

const LEVEL = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;

interface PanelProps {
  player: Player;
  current: boolean;
  isMe: boolean;
  compact: boolean;
  /** Tycoon: money in hand. Classic: undefined, and points are shown instead. */
  cash?: number;
  away?: boolean;
  tag?: string;
  /** Plays after the current player. */
  next?: boolean;
  floaters: Floater[];
}

const Avatar = ({ seat, size }: { seat: Seat; size: number }) => {
  const designs = useDesigns();
  const info = SEAT_INFO[seat];
  const d = resolveDesign(designs[seat][0], seat);
  return (
    <Box
      w={`${size}px`} h={`${size}px`} borderRadius="full" flexShrink={0} display="grid" placeItems="center" position="relative" zIndex={2}
      bg={`radial-gradient(circle at 35% 25%, #ffffff 0%, ${info.light} 45%, ${info.main} 100%)`} border="3px solid #fff" boxShadow="0 3px 10px rgba(0,0,0,.55)" aria-hidden
    >
      <svg viewBox="-0.55 -0.55 1.1 1.1" width={size * 0.72} height={size * 0.72}><PieceShape design={d} id={`av${seat}`} /></svg>
    </Box>
  );
};

/** One player: a round avatar, a pointed ribbon in their colour with the name, and a white capsule with money or points. */
export const PlayerPanel = ({ player, current, isMe, compact, cash, away, tag, next, floaters }: PanelProps) => {
  const info = SEAT_INFO[player.seat];
  const home = tokensHome(player);
  const points = pointsOf(player);
  const size = compact ? 40 : 56;
  const bot = player.kind === "bot";
  return (
    <Box
      as="li" listStyleType="none" display="flex" alignItems="center" position="relative" minW={0} aria-current={current ? "true" : undefined}
      opacity={away ? 0.55 : 1} transition="transform .25s, opacity .25s" transform={current ? (compact ? "scale(1.03)" : "translateX(-10px) scale(1.05)") : undefined}
      transformOrigin="right center" zIndex={current ? 3 : 1}
      filter={current ? `drop-shadow(0 0 10px ${info.main})` : "drop-shadow(0 2px 4px rgba(0,0,0,.4))"}
    >
      {current && !compact && (
        <Box position="absolute" left="-18px" top="50%" mt="-9px" w={0} h={0} borderTop="9px solid transparent" borderBottom="9px solid transparent" borderLeft="12px solid #a3e635" aria-hidden />
      )}
      <Avatar seat={player.seat} size={size} />
      <Box flex={1} minW={0} ml={compact ? "-14px" : "-18px"} pt={compact ? "2px" : "4px"}>
        <Box
          bg={`linear-gradient(180deg, ${info.light} 0%, ${info.main} 55%, ${info.dark} 100%)`} color="#fff" pl={compact ? "20px" : "26px"} pr={compact ? 2 : 3}
          h={compact ? "22px" : "28px"} display="flex" alignItems="center" borderRadius="0 6px 6px 0" fontWeight={800} fontSize={compact ? "xs" : "sm"}
          fontStyle="italic" textShadow="0 1px 2px rgba(0,0,0,.6)" sx={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 50%)" }}
        >
          <Text as="span" noOfLines={1}>{player.name}{isMe ? " (you)" : ""}</Text>
        </Box>
        <Box
          bg="#fff" color="#151515" ml={compact ? "14px" : "18px"} h={compact ? "20px" : "26px"} px={2} display="flex" alignItems="center" justifyContent="space-between" gap={2}
          borderRadius="0 0 8px 8px" fontWeight={800} fontSize={compact ? "xs" : "sm"} aria-label={`${cash !== undefined ? `$${cash}, ` : ""}${points} points, ${home} of 4 tokens home`}
        >
          <span>{cash !== undefined ? `$${cash}` : `${points} pts`}</span>
          <Box as="span" display="inline-flex" gap="3px" aria-hidden>
            {player.tokens.map((t, i) => <Box key={i} as="span" w="7px" h="7px" borderRadius="full" bg={t === 57 ? "#eab308" : t === -1 ? "#d4d4d4" : info.main} />)}
          </Box>
        </Box>
        {!compact && (bot || tag || away || next) && (
          <Text fontSize="2xs" color="whiteAlpha.800" ml="18px" mt="2px" textShadow="0 1px 2px #000">
            {[bot ? `Bot · ${LEVEL[player.level ?? "normal"]}` : null, tag, away ? "Away" : null, next ? "Next" : null].filter(Boolean).join(" · ")}
          </Text>
        )}
      </Box>
      <Box position="absolute" right="8px" top={0} pointerEvents="none" aria-hidden>
        {floaters.filter(f => f.seat === player.seat).map(f => (
          <Text
            key={f.id} position="absolute" right={0} top={0} fontWeight={900} fontSize={compact ? "md" : "lg"} whiteSpace="nowrap" color={f.tone === "gain" ? "#a3e635" : "#f87171"}
            textShadow="0 2px 4px #000" sx={{ animation: "hudFloat 1.5s ease-out forwards", "@keyframes hudFloat": { "0%": { opacity: 0, transform: "translateY(8px) scale(.8)" }, "15%": { opacity: 1, transform: "translateY(-6px) scale(1.1)" }, "100%": { opacity: 0, transform: "translateY(-34px) scale(1)" } } }}
          >{f.text}</Text>
        ))}
      </Box>
    </Box>
  );
};

interface Props {
  players: Player[];
  currentSeat: Seat | null;
  mySeats: Seat[];
  cash?: number[];
  away?: ReadonlySet<Seat>;
  tags?: Partial<Record<Seat, string>>;
  compact: boolean;
  /** Phones in portrait lay the panels out two across. */
  twoColumns?: boolean;
  next?: Seat | null;
  floaters: Floater[];
}

/** The players, as in the reference: a stack down the right of a wide screen, or two columns on a phone. */
export const PlayerPanels = ({ players, currentSeat, mySeats, cash, away, tags, compact, twoColumns, next, floaters }: Props) => (
  <Box
    as="ul" m={0} p={0} role="list" aria-label="Players" display="grid" gap={compact ? 2 : 3}
    gridTemplateColumns={twoColumns ? "repeat(2, minmax(0, 1fr))" : "1fr"} pl={compact ? 0 : "24px"}
  >
    {players.map(p => (
      <PlayerPanel
        key={p.seat} player={p} current={p.seat === currentSeat} isMe={mySeats.length === 1 && mySeats[0] === p.seat} compact={compact}
        cash={cash?.[p.seat]} away={away?.has(p.seat)} tag={tags?.[p.seat]} next={p.seat === next && p.seat !== currentSeat} floaters={floaters}
      />
    ))}
  </Box>
);
