"use client";

import {
  Accordion, AccordionButton, AccordionItem, AccordionIcon, AccordionPanel, Box, Button, Flex, Heading, HStack, IconButton, Input, Select, SimpleGrid, Slider,
  SliderFilledTrack, SliderThumb, SliderTrack, Switch, Text, Textarea, VStack, Wrap, useToast,
} from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SEATS, SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { PieceShape } from "../board/PieceShape";
import { ACCESSORY_LABEL, VEHICLE_LABEL } from "../board/VehicleShape";
import { SHAPE_LABEL } from "@/lib/client/pieceShapes";
import {
  ACCESSORIES, BASES, DEFAULT_DESIGN, FINISHES, IDLES, PACKS, PATTERNS, SHAPES, TRAILS, VEHICLES, applyPack, defaultDesigns, exportDesigns, importDesigns, randomDesign,
  resolveDesign, sanitizeDesign, setDesigns, updatePiece, useLocalDesigns, type PieceDesign,
} from "@/lib/client/pieces";

const PiecePreview3D = dynamic(() => import("./PiecePreview3D"), { ssr: false, loading: () => <Box h="220px" /> });

const EMOJI = ["★", "♥", "♛", "☀", "⚡", "A", "7", "🙂", "😎", "🔥", "🐶", "🐱", "👑", "🚀", "💎", "👻"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <HStack justify="space-between" spacing={4}><Text fontSize="sm" fontWeight={600}>{label}</Text>{children}</HStack>
);

const Range = ({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) => (
  <HStack w="200px" spacing={3}>
    <Slider min={min} max={max} step={step} value={value} onChange={onChange} aria-label={label} colorScheme="teal">
      <SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb />
    </Slider>
    <Text fontSize="xs" w="34px" textAlign="right">{value.toFixed(step < 1 ? 2 : 0)}</Text>
  </HStack>
);

/** A colour that may follow the seat colour (null). */
const ColourField = ({ label, value, fallback, onChange, allowNone, noneLabel }: {
  label: string; value: string | null; fallback: string; onChange: (v: string | null) => void; allowNone?: boolean; noneLabel?: string;
}) => (
  <Row label={label}>
    <HStack spacing={2}>
      <input type="color" aria-label={label} value={value ?? fallback} onChange={e => onChange(e.target.value)}
        style={{ width: 40, height: 30, border: "none", background: "none", padding: 0 }} />
      {allowNone && <Button size="xs" variant={value === null ? "solid" : "outline"} onClick={() => onChange(null)}>{noneLabel ?? "Seat colour"}</Button>}
    </HStack>
  </Row>
);

export default function PieceMaker() {
  const designs = useLocalDesigns();
  const toast = useToast();
  const [seat, setSeat] = useState<Seat>(0);
  const [token, setToken] = useState<number | "all">("all");
  const [allSeats, setAllSeats] = useState(false);
  const [transfer, setTransfer] = useState("");

  const shownIndex = token === "all" ? 0 : token;
  const design = designs[seat][shownIndex];
  const resolved = useMemo(() => resolveDesign(design, seat), [design, seat]);
  const info = SEAT_INFO[seat];

  const edit = (patch: Partial<PieceDesign>) => {
    const seats = allSeats ? SEATS : [seat];
    for (const s of seats) for (let i = 0; i < 4; i++) if (token === "all" || i === token) updatePiece(s, i, patch);
  };

  const applyPackNow = (id: string) => {
    const pack = PACKS.find(p => p.id === id)!;
    const next = { ...designs };
    for (const s of allSeats ? SEATS : [seat]) next[s] = applyPack(pack, s, designs[s]);
    setDesigns(next);
  };

  const copyTo = (scope: "colour" | "all") => {
    const next = { ...designs };
    const copy = { ...design, ...(scope === "all" ? { primary: null, secondary: null } : {}) };
    for (const s of scope === "all" ? SEATS : [seat]) next[s] = next[s].map(() => sanitizeDesign(copy));
    setDesigns(next);
    toast({ title: scope === "all" ? "Applied to every piece, keeping each colour" : `Applied to all four ${info.name} pieces`, status: "success", duration: 2500 });
  };

  const randomise = () => {
    const d = randomDesign();
    if (token === "all") for (let i = 0; i < 4; i++) updatePiece(seat, i, d); else updatePiece(seat, token, d);
  };

  const reset = (scope: "piece" | "seat" | "everything") => {
    const base = defaultDesigns();
    if (scope === "everything") { setDesigns(base); return; }
    const next = { ...designs };
    next[seat] = designs[seat].map((d, i) => (scope === "seat" || token === "all" || i === token ? { ...DEFAULT_DESIGN } : d));
    setDesigns(next);
  };

  const doImport = () => {
    const parsed = importDesigns(transfer);
    if (!parsed) { toast({ title: "That is not a piece set", status: "error", duration: 3000 }); return; }
    setDesigns(parsed);
    toast({ title: "Pieces imported", status: "success", duration: 2500 });
  };

  const exportNow = async () => {
    const text = exportDesigns(designs);
    setTransfer(text);
    try { await navigator.clipboard.writeText(text); toast({ title: "Copied to the clipboard", status: "success", duration: 2000 }); } catch { /* the text is in the box */ }
  };

  const mini = (d: PieceDesign, s: Seat, key: string, size = 56) => (
    <svg width={size} height={size} viewBox="-0.6 -0.6 1.2 1.2" aria-hidden><PieceShape design={resolveDesign(d, s)} id={key} /></svg>
  );

  return (
    <Flex minH="100dvh" bg="#303030" color="white" justify="center" px={3} pt="max(12px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="980px" align="stretch" spacing={4}>
        <HStack>
          <IconButton as={Link} href="/" aria-label="Back to menu" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" />
          <Heading size="md">Piece maker</Heading>
        </HStack>

        <HStack spacing={2} overflowX="auto" role="tablist" aria-label="Colour">
          {SEATS.map(s => (
            <Button key={s} role="tab" aria-selected={s === seat} onClick={() => setSeat(s)} size="sm" variant={s === seat ? "solid" : "outline"} flexShrink={0}
              bg={s === seat ? SEAT_INFO[s].main : undefined} borderColor={SEAT_INFO[s].main} color="white" _hover={{ bg: SEAT_INFO[s].dark }}>{SEAT_INFO[s].name}</Button>
          ))}
        </HStack>

        <Flex gap={4} direction={{ base: "column", md: "row" }}>
          <VStack flex="0 0 auto" w={{ base: "100%", md: "380px" }} align="stretch" spacing={3} position={{ md: "sticky" }} top={{ md: 3 }} alignSelf="flex-start">
            <SimpleGrid columns={2} gap={2}>
              <Box bg="whiteAlpha.100" borderRadius="xl" p={2}>
                <Text fontSize="xs" color="gray.400" textAlign="center">Flat board</Text>
                <Box display="grid" placeItems="center" h="220px" bg="#F7FAFC" borderRadius="lg" mt={1}>
                  <svg viewBox="-0.6 -0.6 1.2 1.2" width="170" height="170" role="img" aria-label="2D preview of the piece"><PieceShape design={resolved} id="main" /></svg>
                </Box>
              </Box>
              <Box bg="whiteAlpha.100" borderRadius="xl" p={2}>
                <Text fontSize="xs" color="gray.400" textAlign="center">3D board</Text>
                <Box bg="#151515" borderRadius="lg" mt={1}><PiecePreview3D design={resolved} seat={seat} /></Box>
              </Box>
            </SimpleGrid>
            <HStack spacing={2} role="tablist" aria-label="Piece">
              {[0, 1, 2, 3].map(i => (
                <Button key={i} role="tab" aria-selected={token === i} aria-label={`${info.name} piece ${i + 1}`} onClick={() => setToken(i)} h="auto" p={1} flex={1}
                  variant={token === i ? "solid" : "outline"} colorScheme="teal">{mini(designs[seat][i], seat, `t${i}`)}</Button>
              ))}
              <Button size="sm" onClick={() => setToken("all")} variant={token === "all" ? "solid" : "outline"} colorScheme="teal" aria-pressed={token === "all"}>All 4</Button>
            </HStack>
            <Text fontSize="xs" color="gray.400">
              {token === "all" ? `Editing all four ${info.name} pieces together.` : `Editing ${info.name} piece ${token + 1} only.`} Changes save as you make them.
            </Text>
            <Row label="Apply edits to every colour"><Switch colorScheme="teal" isChecked={allSeats} onChange={e => setAllSeats(e.target.checked)} aria-label="Apply edits to every colour" /></Row>
          </VStack>

          <Box flex={1} minW={0}>
            <Accordion allowMultiple defaultIndex={[0, 2]}>
              <Section title="Vehicle">
                <Text fontSize="xs" color="gray.400" mb={2}>Ride the road instead of standing as a shape. Vehicles face the way they are driving and take your colours, pattern, finish and outline.</Text>
                <SimpleGrid columns={{ base: 4, sm: 6 }} gap={2}>
                  {VEHICLES.map(v => (
                    <Button key={v} h="auto" p={1} flexDir="column" gap={0} onClick={() => edit({ vehicle: v })} aria-label={VEHICLE_LABEL[v]} aria-pressed={design.vehicle === v}
                      variant={design.vehicle === v ? "solid" : "outline"} colorScheme="teal">
                      {v === "none" ? <Box w="44px" h="44px" display="grid" placeItems="center" fontSize="lg" aria-hidden>🚫</Box> : mini({ ...design, vehicle: v, mark: "", accessory: "none" }, seat, `v-${v}`, 44)}
                      <Text fontSize="2xs">{VEHICLE_LABEL[v]}</Text>
                    </Button>
                  ))}
                </SimpleGrid>
                {design.vehicle !== "none" && (
                  <VStack align="stretch" spacing={3} mt={3}>
                    <Row label="Headlights"><Switch colorScheme="teal" isChecked={design.headlights} aria-label="Headlights" onChange={e => edit({ headlights: e.target.checked })} /></Row>
                    <Row label="Roof extra">
                      <Select w="150px" size="sm" bg="gray.700" value={design.accessory} aria-label="Roof extra" onChange={e => edit({ accessory: e.target.value as PieceDesign["accessory"] })}>
                        {ACCESSORIES.map(a => <option key={a} value={a}>{ACCESSORY_LABEL[a]}</option>)}
                      </Select>
                    </Row>
                    <Text fontSize="xs" color="gray.400">Second colour paints the roof sign, the rider&apos;s helmet and the stripes. Exhaust and tyre trails are under Motion.</Text>
                  </VStack>
                )}
              </Section>

              <Section title="Shape">
                <SimpleGrid columns={{ base: 4, sm: 6 }} gap={2}>
                  {SHAPES.map(s => (
                    <Button key={s} h="auto" p={1} flexDir="column" gap={0} onClick={() => edit({ shape: s })} aria-label={SHAPE_LABEL[s]} aria-pressed={design.shape === s}
                      variant={design.shape === s ? "solid" : "outline"} colorScheme="teal">
                      {mini({ ...design, shape: s, mark: "" }, seat, `s-${s}`, 44)}
                      <Text fontSize="2xs">{SHAPE_LABEL[s]}</Text>
                    </Button>
                  ))}
                </SimpleGrid>
                {design.shape === "classic" && <Text fontSize="xs" color="gray.400" mt={2}>Classic uses the original model on the 3D board and a glossy disc on the flat board. Pick another shape for matching custom pieces on both.</Text>}
              </Section>

              <Section title="Colours and finish">
                <VStack align="stretch" spacing={3}>
                  <ColourField label="Main colour" value={design.primary} fallback={info.main} onChange={v => edit({ primary: v })} allowNone />
                  <ColourField label="Second colour" value={design.secondary} fallback={info.light} onChange={v => edit({ secondary: v })} allowNone />
                  <Row label="Finish">
                    <Select w="140px" size="sm" bg="gray.700" value={design.finish} aria-label="Finish" onChange={e => edit({ finish: e.target.value as PieceDesign["finish"] })}>
                      {FINISHES.map(f => <option key={f} value={f}>{cap(f)}</option>)}
                    </Select>
                  </Row>
                  <Row label="Shine highlight"><Switch colorScheme="teal" isChecked={design.shine} aria-label="Shine highlight" onChange={e => edit({ shine: e.target.checked })} /></Row>
                  <ColourField label="Outline colour" value={design.outline} fallback="#ffffff" onChange={v => edit({ outline: v })} allowNone noneLabel="White" />
                  <Row label="Outline width"><Range value={design.outlineWidth} min={0} max={1} step={0.05} label="Outline width" onChange={v => edit({ outlineWidth: v })} /></Row>
                  <Row label="Glow">
                    <HStack>
                      <input type="color" aria-label="Glow colour" value={design.glow ?? "#ffffff"} onChange={e => edit({ glow: e.target.value })} style={{ width: 40, height: 30, border: "none", background: "none", padding: 0 }} />
                      <Button size="xs" variant={design.glow === null ? "solid" : "outline"} onClick={() => edit({ glow: null })}>Off</Button>
                    </HStack>
                  </Row>
                  {design.glow && <Row label="Glow strength"><Range value={design.glowStrength} min={0} max={1} step={0.05} label="Glow strength" onChange={v => edit({ glowStrength: v })} /></Row>}
                </VStack>
              </Section>

              <Section title="Pattern">
                <SimpleGrid columns={{ base: 4, sm: 4 }} gap={2}>
                  {PATTERNS.map(p => (
                    <Button key={p} h="auto" p={1} flexDir="column" gap={0} onClick={() => edit({ pattern: p })} aria-pressed={design.pattern === p} aria-label={cap(p)}
                      variant={design.pattern === p ? "solid" : "outline"} colorScheme="teal">
                      {mini({ ...design, pattern: p, mark: "" }, seat, `p-${p}`, 44)}<Text fontSize="2xs">{cap(p)}</Text>
                    </Button>
                  ))}
                </SimpleGrid>
                <Box mt={3}><Row label="Pattern strength"><Range value={design.patternStrength} min={0} max={1} step={0.05} label="Pattern strength" onChange={v => edit({ patternStrength: v })} /></Row></Box>
              </Section>

              <Section title="Mark">
                <VStack align="stretch" spacing={3}>
                  <Row label="Letter, number or emoji">
                    <Input w="110px" size="sm" bg="gray.700" value={design.mark} aria-label="Mark" placeholder="None" onChange={e => edit({ mark: e.target.value })} />
                  </Row>
                  <Wrap>{EMOJI.map(e => <Button key={e} size="sm" variant={design.mark === e ? "solid" : "outline"} onClick={() => edit({ mark: e })} aria-label={`Use ${e}`}>{e}</Button>)}
                    <Button size="sm" variant="ghost" onClick={() => edit({ mark: "" })}>Clear</Button></Wrap>
                  <ColourField label="Mark colour" value={design.markColor} fallback="#ffffff" onChange={v => edit({ markColor: v ?? "#ffffff" })} />
                  <Row label="Mark size"><Range value={design.markSize} min={0.5} max={1.5} step={0.05} label="Mark size" onChange={v => edit({ markSize: v })} /></Row>
                </VStack>
              </Section>

              <Section title="Size and base">
                <VStack align="stretch" spacing={3}>
                  <Row label="Size"><Range value={design.size} min={0.6} max={1.5} step={0.05} label="Size" onChange={v => edit({ size: v })} /></Row>
                  <Row label="Depth (3D)"><Range value={design.depth} min={0.3} max={1.6} step={0.05} label="Depth" onChange={v => edit({ depth: v })} /></Row>
                  <Row label="Base">
                    <Select w="140px" size="sm" bg="gray.700" value={design.base} aria-label="Base" onChange={e => edit({ base: e.target.value as PieceDesign["base"] })}>
                      {BASES.map(b => <option key={b} value={b}>{cap(b)}</option>)}
                    </Select>
                  </Row>
                </VStack>
              </Section>

              <Section title="Motion">
                <VStack align="stretch" spacing={3}>
                  <Row label="Idle animation">
                    <Select w="140px" size="sm" bg="gray.700" value={design.idle} aria-label="Idle animation" onChange={e => edit({ idle: e.target.value as PieceDesign["idle"] })}>
                      {IDLES.map(b => <option key={b} value={b}>{cap(b)}</option>)}
                    </Select>
                  </Row>
                  <Row label="Trail when moving">
                    <Select w="140px" size="sm" bg="gray.700" value={design.trail} aria-label="Trail" onChange={e => edit({ trail: e.target.value as PieceDesign["trail"] })}>
                      {TRAILS.map(b => <option key={b} value={b}>{cap(b)}</option>)}
                    </Select>
                  </Row>
                  <Text fontSize="xs" color="gray.400">Reduced-motion settings still switch idle animations off during games.</Text>
                </VStack>
              </Section>

              <Section title="Packs and tools">
                <VStack align="stretch" spacing={3}>
                  <Text fontSize="xs" textTransform="uppercase" color="gray.400">Packs{allSeats ? " (every colour)" : ` (${info.name})`}</Text>
                  <Wrap>{PACKS.map(p => <Button key={p.id} size="sm" variant="outline" title={p.blurb} onClick={() => applyPackNow(p.id)}>{p.name}</Button>)}</Wrap>
                  <Wrap>
                    <Button size="sm" onClick={randomise}>Randomise</Button>
                    <Button size="sm" variant="outline" onClick={() => copyTo("colour")}>Copy to all four {info.name}</Button>
                    <Button size="sm" variant="outline" onClick={() => copyTo("all")}>Copy to every colour</Button>
                  </Wrap>
                  <Wrap>
                    <Button size="sm" variant="outline" colorScheme="red" onClick={() => reset("piece")}>Reset {token === "all" ? "these pieces" : "this piece"}</Button>
                    <Button size="sm" variant="outline" colorScheme="red" onClick={() => reset("seat")}>Reset {info.name}</Button>
                    <Button size="sm" variant="outline" colorScheme="red" onClick={() => reset("everything")}>Reset everything</Button>
                  </Wrap>
                  <Text fontSize="xs" textTransform="uppercase" color="gray.400">Share or back up</Text>
                  <Textarea value={transfer} onChange={e => setTransfer(e.target.value)} bg="gray.700" fontSize="xs" rows={3} aria-label="Piece set text" placeholder="Export to copy your pieces, or paste a set here and import it" />
                  <HStack><Button size="sm" colorScheme="teal" onClick={exportNow}>Export</Button><Button size="sm" variant="outline" onClick={doImport} isDisabled={!transfer.trim()}>Import</Button></HStack>
                </VStack>
              </Section>
            </Accordion>
          </Box>
        </Flex>
      </VStack>
    </Flex>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <AccordionItem border="none" bg="whiteAlpha.100" borderRadius="xl" mb={2}>
    <h2><AccordionButton><Box flex={1} textAlign="left" fontWeight={700}>{title}</Box><AccordionIcon /></AccordionButton></h2>
    <AccordionPanel pb={4}>{children}</AccordionPanel>
  </AccordionItem>
);
