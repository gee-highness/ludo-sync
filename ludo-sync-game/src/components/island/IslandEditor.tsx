"use client";

import { Box, Button, Flex, Heading, HStack, IconButton, Input, SimpleGrid, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Switch, Text, Textarea, VStack, Wrap, useToast } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SEATS, SEAT_INFO, type Seat } from "@/lib/ludo/board";
import BuildingGlyph from "../board/BuildingGlyph";
import {
  BUILDING_THEMES, DEFAULT_ISLAND, ROOFS, WINDOWS, islandFor, sanitizeIsland, sanitizeIslands, setIsland, setIslands, useIslands, type IslandMap, type IslandStyle,
} from "@/lib/client/islands";

const IslandPreview3D = dynamic(() => import("./IslandPreview3D"), { ssr: false, loading: () => <Box h="230px" /> });

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const THEME_BLURB: Record<IslandStyle["theme"], string> = {
  neon: "Setback towers edged in light", brownstone: "Stoops, cornices and chimneys", tropical: "Terraces and palms",
  industrial: "Chimneys, pipes and steel", glass: "Slim glass towers",
};
const WALLS = ["#1e2a4a", "#3b1f4a", "#14352f", "#4a2a1e", "#2b2f36", "#7c4a35", "#0f766e", "#475569"];
const ACCENTS = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#fb923c", "#a78bfa", "#38bdf8", "#f87171"];

const PRESETS: { name: string; style: Omit<IslandStyle, "sign"> & { sign: string } }[] = [
  { name: "Neon Nights", style: { theme: "neon", primary: "#1e2a4a", accent: "#22d3ee", roof: "antenna", windows: "grid", sign: "", glow: 0.8 } },
  { name: "Old Town", style: { theme: "brownstone", primary: "#7c4a35", accent: "#fbbf24", roof: "flat", windows: "arched", sign: "", glow: 0.45 } },
  { name: "Island Resort", style: { theme: "tropical", primary: "#0f766e", accent: "#fb7185", roof: "dome", windows: "stripes", sign: "", glow: 0.6 } },
  { name: "Factory District", style: { theme: "industrial", primary: "#475569", accent: "#fb923c", roof: "antenna", windows: "grid", sign: "", glow: 0.5 } },
  { name: "Glass Bay", style: { theme: "glass", primary: "#1d4e6b", accent: "#a7f3d0", roof: "helipad", windows: "stripes", sign: "", glow: 0.7 } },
  { name: "Candy City", style: { theme: "neon", primary: "#831843", accent: "#f472b6", roof: "dome", windows: "arched", sign: "SWEET", glow: 0.9 } },
];

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <HStack justify="space-between" spacing={4}><Text fontSize="sm" fontWeight={600}>{label}</Text>{children}</HStack>
);

const Swatches = ({ label, value, colours, onChange }: { label: string; value: string; colours: string[]; onChange: (c: string) => void }) => (
  <VStack align="stretch" spacing={2}>
    <HStack justify="space-between"><Text fontSize="sm" fontWeight={600}>{label}</Text>
      <input type="color" aria-label={`Custom ${label.toLowerCase()}`} value={value} onChange={e => onChange(e.target.value)} style={{ width: 40, height: 30, border: "none", background: "none", padding: 0 }} />
    </HStack>
    <Wrap spacing={2}>
      {colours.map(c => (
        <Box as="button" type="button" key={c} aria-label={`Use ${c}`} aria-pressed={value.toLowerCase() === c} onClick={() => onChange(c)} w="30px" h="30px" borderRadius="full" bg={c}
          border="3px solid" borderColor={value.toLowerCase() === c ? "white" : "transparent"} cursor="pointer" />
      ))}
    </Wrap>
  </VStack>
);

const randomStyle = (): IslandStyle => {
  const p = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)];
  return sanitizeIsland({ theme: p(BUILDING_THEMES), primary: p(WALLS), accent: p(ACCENTS), roof: p(ROOFS), windows: p(WINDOWS), sign: "", glow: 0.4 + Math.random() * 0.6 });
};

export default function IslandEditor() {
  const islands = useIslands();
  const toast = useToast();
  const [seat, setSeat] = useState<Seat>(0);
  const [all, setAll] = useState(false);
  const [transfer, setTransfer] = useState("");
  const style = useMemo(() => islandFor(seat, islands, SEAT_INFO[seat].main), [islands, seat]);

  const edit = (patch: Partial<IslandStyle>) => {
    const next = sanitizeIsland({ ...style, ...patch });
    if (all) { const m: IslandMap = {}; for (const s of SEATS) m[s] = next; setIslands(m); } else setIsland(seat, next);
  };
  const exportNow = async () => {
    const text = JSON.stringify({ kind: "ludo-sync-islands", version: 1, islands: Object.fromEntries(SEATS.map(s => [s, islandFor(s, islands, SEAT_INFO[s].main)])) });
    setTransfer(text);
    try { await navigator.clipboard.writeText(text); toast({ title: "Copied to the clipboard", status: "success", duration: 2000 }); } catch { /* the text is in the box */ }
  };
  const doImport = () => {
    try {
      const d = JSON.parse(transfer) as { kind?: unknown; islands?: unknown };
      if (d.kind !== "ludo-sync-islands") throw new Error("bad");
      setIslands(sanitizeIslands(d.islands));
      toast({ title: "Islands imported", status: "success", duration: 2500 });
    } catch { toast({ title: "That is not an island set", status: "error", duration: 3000 }); }
  };

  return (
    <Flex minH="100dvh" bg="#303030" color="white" justify="center" px={3} pt="max(12px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="980px" align="stretch" spacing={4} as="main">
        <HStack>
          <IconButton as={Link} href="/" aria-label="Back to menu" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" />
          <Heading as="h1" size="md">Island maker</Heading>
        </HStack>
        <Text fontSize="sm" color="gray.300">Your island is the set of buildings that appear on the properties you own in a Tycoon game. Choose how they look.</Text>

        <HStack spacing={2} overflowX="auto" role="tablist" aria-label="Colour">
          {SEATS.map(s => (
            <Button key={s} role="tab" aria-selected={s === seat} onClick={() => setSeat(s)} size="sm" variant={s === seat ? "solid" : "outline"} flexShrink={0}
              bg={s === seat ? SEAT_INFO[s].dark : undefined} borderColor={SEAT_INFO[s].main} color="white" _hover={{ bg: SEAT_INFO[s].dark }}>{SEAT_INFO[s].name}</Button>
          ))}
        </HStack>

        <Flex gap={4} direction={{ base: "column", md: "row" }}>
          <VStack flex="0 0 auto" w={{ base: "100%", md: "400px" }} align="stretch" spacing={3} position={{ md: "sticky" }} top={{ md: 3 }} alignSelf="flex-start">
            <Box bg="#151515" borderRadius="xl" p={2}>
              <Text fontSize="xs" color="gray.400" textAlign="center">3D board: empty lot, then three stages</Text>
              <IslandPreview3D style={style} />
            </Box>
            <Box bg="whiteAlpha.100" borderRadius="xl" p={2}>
              <Text fontSize="xs" color="gray.400" textAlign="center">Flat board</Text>
              <SimpleGrid columns={4} gap={1} mt={1}>
                {([0, 1, 2, 3] as const).map(l => (
                  <Box key={l} bg="#171717" borderRadius="md" display="grid" placeItems="center" py={1}>
                    <BuildingGlyph style={style} level={l} size={70} label={l === 0 ? "Empty lot" : `Level ${l} building`} />
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
            <Row label="Apply edits to every colour"><Switch colorScheme="teal" isChecked={all} onChange={e => setAll(e.target.checked)} aria-label="Apply edits to every colour" /></Row>
          </VStack>

          <VStack flex={1} minW={0} align="stretch" spacing={4} bg="whiteAlpha.100" borderRadius="xl" p={4}>
            <Box>
              <Text fontWeight={700} mb={2}>Style</Text>
              <SimpleGrid columns={{ base: 3, sm: 5 }} gap={2}>
                {BUILDING_THEMES.map(t => (
                  <Button key={t} h="auto" p={1} flexDir="column" gap={0} onClick={() => edit({ theme: t })} aria-pressed={style.theme === t} variant={style.theme === t ? "solid" : "outline"} colorScheme="teal" title={THEME_BLURB[t]}>
                    <BuildingGlyph style={{ ...style, theme: t }} level={2} size={54} withSign={false} />
                    <Text fontSize="2xs">{cap(t)}</Text>
                  </Button>
                ))}
              </SimpleGrid>
              <Text fontSize="xs" color="gray.400" mt={1}>{THEME_BLURB[style.theme]}</Text>
            </Box>
            <Swatches label="Wall colour" value={style.primary} colours={WALLS} onChange={c => edit({ primary: c })} />
            <Swatches label="Trim and sign colour" value={style.accent} colours={ACCENTS} onChange={c => edit({ accent: c })} />
            <Box>
              <Text fontWeight={700} mb={2}>Roof</Text>
              <Wrap>{ROOFS.map(r => <Button key={r} size="sm" variant={style.roof === r ? "solid" : "outline"} colorScheme="teal" aria-pressed={style.roof === r} onClick={() => edit({ roof: r })}>{cap(r)}</Button>)}</Wrap>
            </Box>
            <Box>
              <Text fontWeight={700} mb={2}>Windows</Text>
              <Wrap>{WINDOWS.map(w => <Button key={w} size="sm" variant={style.windows === w ? "solid" : "outline"} colorScheme="teal" aria-pressed={style.windows === w} onClick={() => edit({ windows: w })}>{cap(w)}</Button>)}</Wrap>
            </Box>
            <Row label="Sign text">
              <Input w="150px" size="sm" bg="gray.700" maxLength={8} value={style.sign} placeholder="Automatic" aria-label="Sign text" onChange={e => edit({ sign: e.target.value })} />
            </Row>
            <Row label="Glow">
              <HStack w="200px" spacing={3}>
                <Slider min={0} max={1} step={0.05} value={style.glow} aria-label="Glow" onChange={v => edit({ glow: v })} colorScheme="teal"><SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb /></Slider>
                <Text fontSize="xs" w="34px" textAlign="right">{style.glow.toFixed(2)}</Text>
              </HStack>
            </Row>
            <Box>
              <Text fontWeight={700} mb={2}>Ready-made islands</Text>
              <Wrap>{PRESETS.map(p => <Button key={p.name} size="sm" variant="outline" onClick={() => edit(p.style)}>{p.name}</Button>)}</Wrap>
              <Wrap mt={3}>
                <Button size="sm" onClick={() => edit(randomStyle())}>Randomise</Button>
                <Button size="sm" variant="outline" colorScheme="red" onClick={() => (all ? setIslands({}) : setIsland(seat, null))}>Reset {all ? "everything" : SEAT_INFO[seat].name}</Button>
              </Wrap>
            </Box>
            <Box>
              <Text fontWeight={700} mb={2}>Share or back up</Text>
              <Textarea value={transfer} onChange={e => setTransfer(e.target.value)} bg="gray.700" fontSize="xs" rows={3} aria-label="Island set text" placeholder="Export to copy your islands, or paste a set here and import it" />
              <HStack mt={2}><Button size="sm" colorScheme="teal" onClick={exportNow}>Export</Button><Button size="sm" variant="outline" onClick={doImport} isDisabled={!transfer.trim()}>Import</Button></HStack>
            </Box>
            <Text fontSize="xs" color="gray.400">Default for a colour with no island chosen: {DEFAULT_ISLAND.theme} buildings trimmed in that colour. Changes save as you make them.</Text>
          </VStack>
        </Flex>
      </VStack>
    </Flex>
  );
}
