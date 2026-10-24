"use client";

import { Box, Button, HStack, Text, VStack, useMediaQuery } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { SEAT_INFO } from "@/lib/ludo/board";
import { GROUP_COLORS, SQUARES, houseCost, rentOf, rentTable, type SquareKind } from "@/lib/ludo/tycoon";
import { tuningOf, type Action, type GameState } from "@/lib/ludo/types";
import { resolveDesign, useDesigns } from "@/lib/client/pieces";
import { PieceShape } from "../board/PieceShape";

/** Small original illustrations, one per kind of square. */
const Art = ({ kind, group, name }: { kind: SquareKind; group: number; name: string }) => {
  const colour = group >= 0 ? GROUP_COLORS[group] : "#facc15";
  if (kind === "station") {
    return (
      <svg viewBox="0 0 120 70" width="120" height="70" aria-hidden>
        <g fill="#111"><rect x="6" y="52" width="108" height="6" rx="2" />{[16, 46, 76, 100].map(x => <rect key={x} x={x} y="52" width="8" height="18" />)}</g>
        <rect x="14" y="26" width="92" height="24" rx="9" fill="#111" /><rect x="20" y="31" width="80" height="9" rx="3" fill={colour} />
        {[28, 46, 64, 82].map(x => <rect key={x} x={x} y="32" width="12" height="7" fill="#fff" opacity="0.85" />)}
        <path d="M14 26 Q60 8 106 26" fill="none" stroke="#111" strokeWidth="3" />
      </svg>
    );
  }
  if (kind === "utility") {
    const power = /power/i.test(name);
    return (
      <svg viewBox="0 0 120 70" width="120" height="70" aria-hidden>
        <circle cx="60" cy="35" r="30" fill="#111" />
        {power
          ? <path d="M66 10 L40 40 H56 L52 62 L80 28 H63 Z" fill="#facc15" />
          : <path d="M60 10 C72 28 84 36 84 46 A24 24 0 0 1 36 46 C36 36 48 28 60 10 Z" fill="#38bdf8" />}
      </svg>
    );
  }
  // a little skyline in the colour of the group
  return (
    <svg viewBox="0 0 120 70" width="120" height="70" aria-hidden>
      <rect x="0" y="62" width="120" height="8" fill="#111" />
      {[[8, 30, 22], [34, 14, 26], [64, 24, 24], [92, 38, 20]].map(([x, y, w], i) => (
        <g key={i}><rect x={x} y={y} width={w} height={62 - y} fill={i % 2 ? "#111" : colour} stroke="#111" strokeWidth="2" />
          {Array.from({ length: Math.floor((62 - y) / 12) }, (_, r) => <rect key={r} x={x + 5} y={y + 6 + r * 12} width={w - 10} height="5" fill={i % 2 ? colour : "#fff"} opacity="0.9" />)}</g>
      ))}
      <rect x="44" y="6" width="3" height="10" fill="#111" />
    </svg>
  );
};

interface Props {
  state: GameState;
  act: (a: Action) => boolean;
  /** Wide screens float the card at the bottom centre above the status bar, as in the reference; phones dock it to the bottom as a sheet. */
  wide: boolean;
}

/** The offer to buy (or build on) the square a player just landed on, laid out like the reference's white card. */
export const PropertyCard = ({ state, act, wide }: Props) => {
  const t = state.tycoon;
  const p = t?.pending;
  const designs = useDesigns();
  const buy = useRef<HTMLButtonElement>(null);
  const [short] = useMediaQuery("(max-height: 640px)");
  const tight = !wide || short; // phones and short windows: no picture, smaller rows, so the board stays in view
  useEffect(() => { buy.current?.focus({ preventScroll: true }); }, [p?.ring, p?.kind]);
  if (!t || !p) return null;
  const tune = tuningOf(state.rules);
  const sq = SQUARES[p.ring];
  const table = rentTable(p.ring, tune);
  const cost = p.kind === "buy" ? sq.price : houseCost(p.ring);
  const cash = t.cash[p.seat];
  const info = SEAT_INFO[p.seat];
  const owner = state.players.find(pl => pl.seat === p.seat);
  const design = resolveDesign(designs[p.seat][0], p.seat);
  const next = p.kind === "build" ? rentOf({ ...t, level: t.level.map((l, i) => (i === p.ring ? l + 1 : l)) }, p.ring, tune.rentFactor) : 0;
  const now = p.kind === "build" ? rentOf(t, p.ring, tune.rentFactor) : 0;
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <HStack justify="space-between" px={2} py={tight ? "1px" : "3px"} bg={strong ? "#d4d4d8" : undefined} fontSize={tight ? "xs" : "sm"} fontWeight={strong ? 700 : 500}><Text>{label}</Text><Text fontWeight={700}>{value}</Text></HStack>
  );
  return (
    <Box
      role="dialog" aria-label={`${p.kind === "buy" ? "For sale" : "Build"}: ${sq.name}`} aria-modal="false" color="#151515"
      position="fixed" zIndex={40} bottom={wide ? "calc(env(safe-area-inset-bottom) + 84px)" : "calc(env(safe-area-inset-bottom) + 8px)"} w={wide ? "clamp(260px, calc(100vw - 600px), 340px)" : "min(92vw, 340px)"}
      maxH={wide ? "calc(100dvh - 100px - env(safe-area-inset-bottom))" : "56dvh"} overflowY="auto" left="50%"
      sx={{ transform: "translateX(-50%)", animation: "cardUp .28s ease-out", "@keyframes cardUp": { from: { opacity: 0, marginTop: "24px" }, to: { opacity: 1, marginTop: 0 } } }}
    >
      <Box mx="auto" w="62%" textAlign="center" bg="linear-gradient(180deg, #a3e635, #65a30d)" color="#fff" fontWeight={900} fontSize="lg" py={1} borderRadius="14px 14px 0 0"
        textShadow="0 2px 3px rgba(0,0,0,.4)" aria-hidden>{p.kind === "buy" ? "For sale" : "Build here"}</Box>
      <VStack align="stretch" spacing={2} bg="#fff" borderRadius="6px" boxShadow="0 10px 30px rgba(0,0,0,.55)" p={3} borderTop={sq.group >= 0 ? `10px solid ${GROUP_COLORS[sq.group]}` : "10px solid #111"}>
        {!tight && <Box display="flex" justifyContent="center"><Art kind={sq.kind} group={sq.group} name={sq.name} /></Box>}
        <Text textAlign="center" fontWeight={900} fontSize={tight ? "lg" : "xl"} lineHeight={1.1} textTransform="uppercase" letterSpacing="0.01em">{sq.name}</Text>
        {p.kind === "buy" ? (
          <Box borderTop="2px solid #111" pt={1}>
            <Row label="Purchase Price" value={`$${table.price}`} strong />
            <Row label="Mortgage Value" value={`$${table.mortgage}`} />
            <Box mt={2} fontSize="xs" color="#444" px={2}>Rent</Box>
            {table.rows.map((r, i) => <Row key={i} label={i === 0 ? "Base rent" : r.label} value={`$${r.amount}`} />)}
            {sq.kind === "property" && <Row label="Each building costs" value={`$${table.buildCost}`} />}
          </Box>
        ) : (
          <Box borderTop="2px solid #111" pt={1}>
            <Row label="Building cost" value={`$${cost}`} strong />
            <Row label="Rent today" value={`$${now}`} />
            <Row label="Rent after building" value={`$${next}`} />
            <Row label="Buildings now" value={`${t.level[p.ring]} of ${tune.maxBuild}`} />
          </Box>
        )}
        <HStack spacing={2} pt={1} position="sticky" bottom={0} bg="#fff">
          <Button ref={buy} flex={1} minH="48px" bg="#16a34a" color="#fff" _hover={{ bg: "#15803d" }} _disabled={{ bg: "#9ca3af", color: "#fff", opacity: 1 }} fontWeight={800} isDisabled={cash < cost} onClick={() => act({ type: p.kind })}>
            {p.kind === "buy" ? `Buy $${cost}` : `Build $${cost}`}
          </Button>
          <Button flex={1} minH="48px" variant="outline" borderColor="#111" color="#111" fontWeight={800} onClick={() => act({ type: "pass" })}>Pass</Button>
        </HStack>
        <HStack spacing={2} justify="center" fontSize="xs" color="#444">
          <svg viewBox="-0.55 -0.55 1.1 1.1" width="22" height="22" aria-hidden><PieceShape design={design} id="card-owner" /></svg>
          <Text><b style={{ color: info.dark }}>{owner?.name ?? info.name}</b> has ${cash}</Text>
        </HStack>
      </VStack>
    </Box>
  );
};
