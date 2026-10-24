"use client";

import { Box, Button, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { BASE_SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { SWATCHES, resolveSeatColors, tooSimilar, whiteContrast, type SeatColors } from "@/lib/client/palette";

type Part = "main" | "home" | "path";
const PARTS: { id: Part; label: string; hint: string }[] = [
  { id: "main", label: "Pieces", hint: "Your pieces, start square and name" },
  { id: "home", label: "Home", hint: "The yard where your pieces wait" },
  { id: "path", label: "Path", hint: "The lane that leads to the centre" },
];

interface Props {
  seat: Seat;
  /** null means the seat's standard colours. */
  value: SeatColors | null;
  onChange: (next: SeatColors | null) => void;
  /** Main colours of the other players, to warn about look-alikes. */
  others?: string[];
}

/** Small picture of a yard, its pieces and its path, so changes can be judged at a glance. */
const Preview = ({ seat, value }: { seat: Seat; value: SeatColors | null }) => {
  const c = resolveSeatColors(seat, value);
  return (
    <svg viewBox="0 0 120 70" width="132" height="77" role="img" aria-label="Preview of your home, pieces and path" style={{ borderRadius: 8, background: "#10172E" }}>
      <rect x="4" y="4" width="62" height="62" rx="4" fill={c.home} />
      <rect x="12" y="12" width="46" height="46" rx="6" fill="#fff" opacity="0.88" />
      {[[26, 26], [44, 26], [26, 44], [44, 44]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="7" fill={c.main} stroke="#fff" strokeWidth="1.5" />)}
      <rect x="70" y="26" width="46" height="18" fill={c.path} />
      <rect x="70" y="26" width="10" height="18" fill={c.main} />
      <g stroke="#cbd5e0" strokeWidth="0.8" opacity="0.8">{[80, 90, 100, 110].map(x => <line key={x} x1={x} y1="26" x2={x} y2="44" />)}</g>
    </svg>
  );
};

/** Pick the colour of your pieces, your home and your path: ready-made swatches or any colour you like. */
export default function ColorEditor({ seat, value, onChange, others = [] }: Props) {
  const [part, setPart] = useState<Part>("main");
  const resolved = resolveSeatColors(seat, value);
  const current = resolved[part];
  const base = BASE_SEAT_INFO[seat].main;

  const set = (colour: string | null) => {
    const prev: SeatColors = value ?? { main: base, home: null, path: null };
    onChange({ ...prev, [part]: colour });
  };
  const clash = others.some(o => tooSimilar(o, resolved.main));
  const pale = whiteContrast(resolved.main) < 3;

  return (
    <VStack align="stretch" spacing={3} p={3} bg="blackAlpha.300" borderRadius="lg">
      <HStack justify="space-between" align="flex-start">
        <VStack align="start" spacing={2}>
          <HStack role="tablist" aria-label="Which colour to change" spacing={1}>
            {PARTS.map(p => (
              <Button key={p.id} role="tab" aria-selected={part === p.id} size="sm" variant={part === p.id ? "solid" : "outline"} colorScheme="teal" onClick={() => setPart(p.id)}>{p.label}</Button>
            ))}
          </HStack>
          <Text fontSize="xs" color="gray.400">{PARTS.find(p => p.id === part)!.hint}</Text>
        </VStack>
        <Preview seat={seat} value={value} />
      </HStack>

      <SimpleGrid columns={{ base: 6, sm: 12 }} gap={2} role="group" aria-label="Colours">
        {SWATCHES.map(sw => (
          <Box
            as="button" type="button" key={sw} aria-label={`Use ${sw}`} aria-pressed={current.toLowerCase() === sw} onClick={() => set(sw)}
            w="100%" minW="32px" h="32px" borderRadius="full" bg={sw} border="3px solid" borderColor={current.toLowerCase() === sw ? "white" : "transparent"}
            boxShadow={current.toLowerCase() === sw ? "0 0 0 2px #0f172a" : undefined} cursor="pointer"
          />
        ))}
      </SimpleGrid>

      <HStack spacing={3} flexWrap="wrap">
        <HStack spacing={2}>
          <input type="color" aria-label={`Custom ${part} colour`} value={current} onChange={e => set(e.target.value)} style={{ width: 44, height: 34, border: "none", background: "none", padding: 0 }} />
          <Text fontSize="sm">Any colour</Text>
        </HStack>
        {part !== "main" && <Button size="xs" variant="outline" onClick={() => set(null)} isDisabled={(value?.[part] ?? null) === null}>Match my pieces</Button>}
        <Button size="xs" variant="ghost" onClick={() => onChange(null)} isDisabled={!value}>Standard colours</Button>
      </HStack>

      {clash && <Text role="status" fontSize="xs" color="orange.300">This is close to another player&apos;s colour. Turning on token symbols in Settings helps tell them apart.</Text>}
      {pale && <Text role="status" fontSize="xs" color="orange.300">This colour is pale, so white names on it may be hard to read. A deeper shade works better.</Text>}
    </VStack>
  );
}
