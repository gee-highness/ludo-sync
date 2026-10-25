"use client";

import { Box, Button, Flex, Heading, HStack, IconButton, Input, SimpleGrid, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Switch, Text, Textarea, VStack, Wrap, useToast } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SEATS, SEAT_INFO, type Seat } from "@/lib/ludo/board";
import BuildingGlyph from "../board/BuildingGlyph";
import {
  BUILDING_THEMES, DEFAULT_ISLAND, EXTRAS, LEVEL_KEYS, resolveLevel, FINISHES, GROUNDS, GROUND_COLOURS, ROOFS, SHAPES, WINDOWS, islandFor, sanitizeIsland, sanitizeIslands, setIsland, setIslands, useIslands, type IslandMap, type IslandStyle,
} from "@/lib/client/islands";

const IslandPreview3D = dynamic(() => import("./IslandPreview3D"), { ssr: false, loading: () => <Box h="230px" /> });

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const THEME_BLURB: Record<IslandStyle["theme"], string> = {
  neon: "Setback towers edged in light", brownstone: "Stoops, cornices and chimneys", tropical: "Terraces and palms",
  industrial: "Chimneys, pipes and steel", glass: "Slim glass towers",
  castle: "Battlements, turrets and a gate", pagoda: "Tiered eaves and a finial", cottage: "A pitched roof, a chimney, a door",
  hotel: "Balconies on every floor", shop: "A striped awning over the shop front",
};
const WALLS = ["#1e2a4a", "#3b1f4a", "#14352f", "#4a2a1e", "#2b2f36", "#7c4a35", "#0f766e", "#475569"];
const ACCENTS = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#fb923c", "#a78bfa", "#38bdf8", "#f87171"];

const PRESETS: { name: string; style: IslandStyle }[] = [
  { name: "Neon Nights", style: { ...DEFAULT_ISLAND, theme: "neon", primary: "#1e2a4a", accent: "#22d3ee", roof: "antenna", windows: "grid", sign: "", glow: 0.8, height: 1.2, extras: ["lamps"], finish: "glossy" } },
  { name: "Old Town", style: { ...DEFAULT_ISLAND, theme: "brownstone", primary: "#7c4a35", accent: "#fbbf24", roof: "flat", windows: "arched", sign: "", glow: 0.45, ground: "marble", extras: ["fence", "lamps"], lights: "#ffb347" } },
  { name: "Island Resort", style: { ...DEFAULT_ISLAND, theme: "tropical", primary: "#0f766e", accent: "#fb7185", roof: "dome", windows: "stripes", sign: "", glow: 0.6, ground: "sand", shape: "round", extras: ["trees", "flags"], height: 0.9 } },
  { name: "Factory District", style: { ...DEFAULT_ISLAND, theme: "industrial", primary: "#475569", accent: "#fb923c", roof: "antenna", windows: "grid", sign: "", glow: 0.5, finish: "metallic", footprint: 1.1, extras: ["fence"], lights: "#ff8a3d" } },
  { name: "Glass Bay", style: { ...DEFAULT_ISLAND, theme: "glass", primary: "#1d4e6b", accent: "#a7f3d0", roof: "helipad", windows: "stripes", sign: "", glow: 0.7, ground: "water", height: 1.3, shape: "round", finish: "glossy", lights: "#a7f3d0" } },
  { name: "Candy City", style: { ...DEFAULT_ISLAND, theme: "neon", primary: "#831843", accent: "#f472b6", roof: "dome", windows: "arched", sign: "SWEET", glow: 0.9, ground: "grass", shape: "round", extras: ["flags", "trees"], lights: "#ff9ad5" } },
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
  return sanitizeIsland({ theme: p(BUILDING_THEMES), primary: p(WALLS), accent: p(ACCENTS), roof: p(ROOFS), windows: p(WINDOWS), sign: "", glow: 0.4 + Math.random() * 0.6,
    height: 0.8 + Math.random() * 0.5, footprint: 0.85 + Math.random() * 0.25, shape: p(SHAPES), ground: p(GROUNDS), finish: p(FINISHES),
    extras: EXTRAS.filter(() => Math.random() < 0.4), lights: Math.random() < 0.5 ? "" : p(ACCENTS) });
};

export default function IslandEditor() {
  const islands = useIslands();
  const toast = useToast();
  const [seat, setSeat] = useState<Seat>(0);
  const [all, setAll] = useState(false);
  const [transfer, setTransfer] = useState("");
  const style = useMemo(() => islandFor(seat, islands, SEAT_INFO[seat].main), [islands, seat]);

  // 0 edits the whole island; 1 to 3 edit what only that stage of development looks like
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const shown = stage ? resolveLevel(style, stage) : style;
  const save = (next: IslandStyle) => {
    if (all) { const m: IslandMap = {}; for (const s of SEATS) m[s] = next; setIslands(m); } else setIsland(seat, next);
  };
  const edit = (patch: Partial<IslandStyle>) => {
    if (!stage) { save(sanitizeIsland({ ...style, ...patch })); return; }
    const here: Record<string, unknown> = { ...(style.levels[stage] ?? {}) }, base: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) (LEVEL_KEYS.includes(k as (typeof LEVEL_KEYS)[number]) ? here : base)[k] = v;
    save(sanitizeIsland({ ...style, ...base, levels: { ...style.levels, [stage]: here } }));
  };
  const setWhole = (next: IslandStyle) => { setStage(0); save(sanitizeIsland(next)); };
  const clearStage = () => { if (!stage) return; const lv = { ...style.levels }; delete lv[stage]; save(sanitizeIsland({ ...style, levels: lv })); };
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
              <Text fontWeight={700} mb={2}>Which stage are you editing?</Text>
              <HStack spacing={2} role="tablist" aria-label="Development stage" overflowX="auto">
                {([[0, "Whole island"], [1, "Stage 1 · house"], [2, "Stage 2 · mid-rise"], [3, "Stage 3 · landmark"]] as const).map(([n, label]) => (
                  <Button key={n} role="tab" aria-selected={stage === n} size="sm" flexShrink={0} variant={stage === n ? "solid" : "outline"} colorScheme="teal" onClick={() => setStage(n)}>
                    {label}{n && style.levels[n] ? " ●" : ""}
                  </Button>
                ))}
              </HStack>
              <Text fontSize="xs" color="gray.400" mt={1}>
                {stage === 0 ? "Everything you change here applies to all three stages." : "Colours, roof, windows, sign, height, width, shape, finish and window light can differ here. Style, ground, extras and glow stay shared."}
              </Text>
              {stage > 0 && style.levels[stage as 1 | 2 | 3] && <Button size="xs" mt={2} variant="outline" onClick={clearStage}>Make this stage match the island</Button>}
            </Box>
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
            <Swatches label="Wall colour" value={shown.primary} colours={WALLS} onChange={c => edit({ primary: c })} />
            <Swatches label="Trim and sign colour" value={shown.accent} colours={ACCENTS} onChange={c => edit({ accent: c })} />
            <Box>
              <Text fontWeight={700} mb={2}>Roof</Text>
              <Wrap>{ROOFS.map(r => <Button key={r} size="sm" variant={shown.roof === r ? "solid" : "outline"} colorScheme="teal" aria-pressed={shown.roof === r} onClick={() => edit({ roof: r })}>{cap(r)}</Button>)}</Wrap>
            </Box>
            <Box>
              <Text fontWeight={700} mb={2}>Windows</Text>
              <Wrap>{WINDOWS.map(w => <Button key={w} size="sm" variant={shown.windows === w ? "solid" : "outline"} colorScheme="teal" aria-pressed={shown.windows === w} onClick={() => edit({ windows: w })}>{cap(w)}</Button>)}</Wrap>
            </Box>
            <Row label="Height">
              <HStack w="200px" spacing={3}>
                <Slider min={0.6} max={1.5} step={0.05} value={shown.height} aria-label="Height" onChange={v => edit({ height: v })} colorScheme="teal"><SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb /></Slider>
                <Text fontSize="xs" w="34px" textAlign="right">{shown.height.toFixed(2)}</Text>
              </HStack>
            </Row>
            <Row label="Width">
              <HStack w="200px" spacing={3}>
                <Slider min={0.7} max={1.1} step={0.05} value={shown.footprint} aria-label="Width" onChange={v => edit({ footprint: v })} colorScheme="teal"><SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb /></Slider>
                <Text fontSize="xs" w="34px" textAlign="right">{shown.footprint.toFixed(2)}</Text>
              </HStack>
            </Row>
            <Box>
              <Text fontWeight={700} mb={2}>Shape</Text>
              <Wrap>{SHAPES.map(x => <Button key={x} size="sm" variant={shown.shape === x ? "solid" : "outline"} colorScheme="teal" aria-pressed={shown.shape === x} onClick={() => edit({ shape: x })}>{cap(x)}</Button>)}</Wrap>
            </Box>
            <Box>
              <Text fontWeight={700} mb={2}>Wall finish</Text>
              <Wrap>{FINISHES.map(x => <Button key={x} size="sm" variant={shown.finish === x ? "solid" : "outline"} colorScheme="teal" aria-pressed={shown.finish === x} onClick={() => edit({ finish: x })}>{cap(x)}</Button>)}</Wrap>
            </Box>
            <Box>
              <Text fontWeight={700} mb={2}>Ground</Text>
              <Wrap>{GROUNDS.map(x => (
                <Button key={x} size="sm" variant={style.ground === x ? "solid" : "outline"} colorScheme="teal" aria-pressed={style.ground === x} onClick={() => edit({ ground: x })} leftIcon={<Box w="12px" h="12px" borderRadius="sm" bg={GROUND_COLOURS[x]} border="1px solid #fff8" />}>{cap(x)}</Button>
              ))}</Wrap>
            </Box>
            <Box>
              <Text fontWeight={700} mb={2}>Around the building</Text>
              <Wrap>{EXTRAS.map(x => {
                const on = style.extras.includes(x);
                return <Button key={x} size="sm" variant={on ? "solid" : "outline"} colorScheme="teal" aria-pressed={on} onClick={() => edit({ extras: on ? style.extras.filter(e => e !== x) : [...style.extras, x] })}>{cap(x)}</Button>;
              })}</Wrap>
            </Box>
            <Swatches label="Window light" value={shown.lights || "#ffd27a"} colours={["#ffd27a", ...ACCENTS]} onChange={c => edit({ lights: c })} />
            <Row label="Sign text">
              <Input w="150px" size="sm" bg="gray.700" maxLength={8} value={shown.sign} placeholder="Automatic" aria-label="Sign text" onChange={e => edit({ sign: e.target.value })} />
            </Row>
            <Row label="Glow">
              <HStack w="200px" spacing={3}>
                <Slider min={0} max={1} step={0.05} value={style.glow} aria-label="Glow" onChange={v => edit({ glow: v })} colorScheme="teal"><SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb /></Slider>
                <Text fontSize="xs" w="34px" textAlign="right">{style.glow.toFixed(2)}</Text>
              </HStack>
            </Row>
            <Box>
              <Text fontWeight={700} mb={2}>Ready-made islands</Text>
              <Wrap>{PRESETS.map(p => <Button key={p.name} size="sm" variant="outline" onClick={() => setWhole(p.style)}>{p.name}</Button>)}</Wrap>
              <Wrap mt={3}>
                <Button size="sm" onClick={() => setWhole(randomStyle())}>Randomise</Button>
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
