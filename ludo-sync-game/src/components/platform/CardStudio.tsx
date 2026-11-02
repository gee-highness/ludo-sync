"use client";

import { Box, Button, FormControl, FormLabel, HStack, Input, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Switch, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Textarea, VStack, Wrap } from "@chakra-ui/react";
import { useState } from "react";
import {
  ACCENTS, BACK_DESIGNS, BORDERS, CHARACTERS, COLOUR_SWATCHES, COURT_STYLES, DEFAULT_CARD_STYLE, ORNAMENTS, PAPERS, decodeCardStyle, encodeCardStyle, useCardStyle,
  type BackDesign, type CardStyle, type Ornament,
} from "@/lib/client/cardStyle";
import { PlayingCard } from "./PlayingCard";
import { CardBackArt, shade } from "./cards/CardBack";
import { SUIT_PATHS } from "./cards/Suit";

const DESIGN_NAMES: Record<BackDesign, string> = { lattice: "Lattice", royal: "Royal", mandala: "Mandala", waves: "Waves", stars: "Starfield", argyle: "Argyle", circuit: "Circuit", leaves: "Leaves", deco: "Art deco", scales: "Scales", stripes: "Stripes", plain: "Plain" };
const ORNAMENT_NAMES: Record<Ornament, string> = { none: "None", crown: "Crown", star: "Star", spade: "Spade", heart: "Heart", diamond: "Diamond", club: "Club", moon: "Moon", flame: "Flame", paw: "Paw", bolt: "Bolt", gem: "Gem" };
const BORDER_NAMES = { none: "None", thin: "Thin", double: "Double", ornate: "Ornate" } as const;
const COURT_NAMES = { classic: "Classic figures", emblem: "Emblem", characters: "Characters", minimal: "Minimal" } as const;
/** Ready-made looks: one tap sets the back to a matched design and pair of colours. */
const LOOKS: { name: string; back: Partial<CardStyle["back"]> }[] = [
  { name: "Ocean", back: { design: "waves", primary: "#0c4a6e", secondary: "#0ea5e9", ornament: "none", border: "double" } },
  { name: "Ruby", back: { design: "royal", primary: "#7f1d1d", secondary: "#dc2626", ornament: "crown", border: "ornate" } },
  { name: "Forest", back: { design: "leaves", primary: "#14532d", secondary: "#65a30d", ornament: "none", border: "thin" } },
  { name: "Midnight", back: { design: "stars", primary: "#0f172a", secondary: "#fde68a", ornament: "moon", border: "double" } },
  { name: "Gold", back: { design: "deco", primary: "#0f172a", secondary: "#ca8a04", ornament: "none", border: "ornate" } },
  { name: "Neon", back: { design: "circuit", primary: "#1e1b4b", secondary: "#22d3ee", ornament: "bolt", border: "thin" } },
  { name: "Rose", back: { design: "mandala", primary: "#831843", secondary: "#f9a8d4", ornament: "star", border: "double" } },
  { name: "Classic", back: DEFAULT_CARD_STYLE.back },
];

const Swatches = ({ value, onPick, list, label }: { value: string; onPick: (c: string) => void; list: readonly string[]; label: string }) => (
  <Wrap spacing={2} role="radiogroup" aria-label={label}>
    {list.map(c => (
      <Box key={c} as="button" type="button" role="radio" aria-checked={value.toLowerCase() === c} aria-label={`${label} ${c}`} onClick={() => onPick(c)} w="30px" h="30px" borderRadius="full" bg={c}
        border="3px solid" borderColor={value.toLowerCase() === c ? "yellow.300" : "whiteAlpha.500"} _focusVisible={{ outline: "3px solid #fde047", outlineOffset: "2px" }} />
    ))}
    <Box as="label" w="30px" h="30px" borderRadius="full" border="2px dashed" borderColor="whiteAlpha.600" display="grid" placeItems="center" fontSize="xs" cursor="pointer" aria-label={`${label}: pick any colour`} position="relative" overflow="hidden">
      +<input type="color" value={value} onChange={e => onPick(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} aria-label={`${label}: custom colour`} />
    </Box>
  </Wrap>
);

const Chip = ({ on, children, onClick, label }: { on: boolean; children: React.ReactNode; onClick: () => void; label: string }) => (
  <Button size="sm" variant={on ? "solid" : "outline"} colorScheme={on ? "yellow" : undefined} color={on ? undefined : "white"} onClick={onClick} aria-pressed={on} aria-label={label} minH="40px">{children}</Button>
);

const Thumb = ({ back, on, name, onClick }: { back: CardStyle["back"]; on: boolean; name: string; onClick: () => void }) => (
  <Box as="button" type="button" onClick={onClick} aria-pressed={on} aria-label={`${name} card back`} textAlign="center" _focusVisible={{ outline: "3px solid #fde047", outlineOffset: "2px" }} borderRadius="10px">
    <Box w="64px" h="90px" borderRadius="8px" overflow="hidden" border="3px solid" borderColor={on ? "yellow.300" : "whiteAlpha.600"} boxShadow={on ? "0 0 0 2px #fde047" : "0 2px 6px rgba(0,0,0,.5)"}><CardBackArt back={back} /></Box>
    <Text fontSize="2xs" mt={1} color={on ? "yellow.200" : "gray.300"}>{name}</Text>
  </Box>
);

/** Everything about how cards look, with a live preview. Used on the Cards page and in the table's Cards drawer. */
export function CardStudio({ compact }: { compact?: boolean }) {
  const [cs, patch, setAll] = useCardStyle();
  const [suit, setSuit] = useState(3);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const b = cs.back, c = cs.court, f = cs.faces;
  const shareCode = encodeCardStyle(cs);

  const randomise = () => {
    const pickOf = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)];
    const p = pickOf(COLOUR_SWATCHES.slice(0, 13)), s = pickOf(COLOUR_SWATCHES);
    patch({ back: { design: pickOf(BACK_DESIGNS), primary: p, secondary: s === p ? shade(p, 0.45) : s, ornament: pickOf(ORNAMENTS), border: pickOf(BORDERS) } });
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box bg="blackAlpha.400" borderRadius="xl" p={3} aria-label="Preview of your cards" role="group">
        <HStack spacing={2} justify="center" align="end" flexWrap="wrap">
          <PlayingCard faceDown size={compact ? "md" : "lg"} label="Card back" />
          <PlayingCard id={suit * 13 + 12} size={compact ? "md" : "lg"} />
          <PlayingCard id={suit * 13 + 11} size={compact ? "md" : "lg"} />
          <PlayingCard id={suit * 13 + 10} size={compact ? "md" : "lg"} />
          <PlayingCard id={((suit + 1) % 4) * 13 + 9} size={compact ? "md" : "lg"} />
        </HStack>
        <HStack justify="center" spacing={1} mt={2} role="radiogroup" aria-label="Suit in the preview">
          {[0, 1, 2, 3].map(s => (
            <Box key={s} as="button" type="button" role="radio" aria-checked={suit === s} aria-label={["Clubs", "Diamonds", "Hearts", "Spades"][s]} onClick={() => setSuit(s)} w="38px" h="38px" display="grid" placeItems="center" borderRadius="md" bg={suit === s ? "whiteAlpha.400" : "transparent"}>
              <svg width={18} height={18} viewBox="0 0 100 100" fill={s === 1 || s === 2 ? "#f87171" : "#fff"} aria-hidden>{SUIT_PATHS[s]}</svg>
            </Box>
          ))}
        </HStack>
      </Box>

      <Tabs variant="soft-rounded" colorScheme="yellow" isLazy={false}>
        <TabList overflowX="auto" pb={1}>
          <Tab color="white" _selected={{ color: "black", bg: "yellow.300" }}>Back</Tab>
          <Tab color="white" _selected={{ color: "black", bg: "yellow.300" }}>Court cards</Tab>
          <Tab color="white" _selected={{ color: "black", bg: "yellow.300" }}>Faces</Tab>
          <Tab color="white" _selected={{ color: "black", bg: "yellow.300" }}>Share</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <VStack align="stretch" spacing={4}>
              <Box>
                <Text fontWeight={800} mb={2}>Ready-made looks</Text>
                <Wrap spacing={2}>{LOOKS.map(l => <Button key={l.name} size="sm" variant="outline" color="white" onClick={() => patch({ back: { ...l.back, monogram: b.monogram } })}>{l.name}</Button>)}<Button size="sm" colorScheme="purple" onClick={randomise}>🎲 Surprise me</Button></Wrap>
              </Box>
              <Box>
                <Text fontWeight={800} mb={2}>Design</Text>
                <Wrap spacing={3}>{BACK_DESIGNS.map(d => <Thumb key={d} back={{ ...b, design: d }} on={b.design === d} name={DESIGN_NAMES[d]} onClick={() => patch({ back: { design: d } })} />)}</Wrap>
              </Box>
              <Box><Text fontWeight={800} mb={2}>Main colour</Text><Swatches value={b.primary} list={COLOUR_SWATCHES} label="Main colour" onPick={c2 => patch({ back: { primary: c2 } })} /></Box>
              <Box><Text fontWeight={800} mb={2}>Second colour</Text><Swatches value={b.secondary} list={COLOUR_SWATCHES} label="Second colour" onPick={c2 => patch({ back: { secondary: c2 } })} /></Box>
              <Box>
                <Text fontWeight={800} mb={2}>Border</Text>
                <Wrap spacing={2}>{BORDERS.map(x => <Chip key={x} on={b.border === x} label={`${BORDER_NAMES[x]} border`} onClick={() => patch({ back: { border: x } })}>{BORDER_NAMES[x]}</Chip>)}</Wrap>
              </Box>
              <Box>
                <Text fontWeight={800} mb={2}>Emblem in the middle</Text>
                <Wrap spacing={2}>{ORNAMENTS.map(o => <Chip key={o} on={b.ornament === o && !b.monogram} label={`${ORNAMENT_NAMES[o]} emblem`} onClick={() => patch({ back: { ornament: o, monogram: "" } })}>{ORNAMENT_NAMES[o]}</Chip>)}</Wrap>
              </Box>
              <FormControl>
                <FormLabel fontWeight={800}>Monogram (one or two letters, replaces the emblem)</FormLabel>
                <Input value={b.monogram} maxLength={2} onChange={e => patch({ back: { monogram: e.target.value } })} bg="gray.700" border="none" placeholder="e.g. G" w="120px" aria-label="Monogram" />
              </FormControl>
              <FormControl>
                <FormLabel fontWeight={800}>Pattern size</FormLabel>
                <Slider aria-label="Pattern size" min={0.6} max={1.6} step={0.1} value={b.scale} onChange={v => patch({ back: { scale: v } })} maxW="320px"><SliderTrack><SliderFilledTrack bg="yellow.300" /></SliderTrack><SliderThumb boxSize={6} /></Slider>
              </FormControl>
            </VStack>
          </TabPanel>

          <TabPanel px={0}>
            <VStack align="stretch" spacing={4}>
              <Box>
                <Text fontWeight={800} mb={2}>Style of the Jack, Queen and King</Text>
                <Wrap spacing={2}>{COURT_STYLES.map(x => <Chip key={x} on={c.style === x} label={COURT_NAMES[x]} onClick={() => patch({ court: { style: x } })}>{COURT_NAMES[x]}</Chip>)}</Wrap>
              </Box>
              <Box><Text fontWeight={800} mb={2}>Accent colour</Text><Swatches value={c.accent} list={ACCENTS} label="Court accent" onPick={x => patch({ court: { accent: x } })} /></Box>
              <HStack justify="space-between"><FormLabel m={0} htmlFor="mirror">Double-ended (like a real deck)</FormLabel><Switch id="mirror" isChecked={c.mirror} onChange={e => patch({ court: { mirror: e.target.checked } })} /></HStack>
              <HStack justify="space-between"><FormLabel m={0} htmlFor="frame">Gold frame</FormLabel><Switch id="frame" isChecked={c.frame} onChange={e => patch({ court: { frame: e.target.checked } })} /></HStack>
              {c.style === "characters" && ([11, 12, 13] as const).map(r => (
                <Box key={r}>
                  <Text fontWeight={800} mb={2}>{{ 11: "Jack", 12: "Queen", 13: "King" }[r]}: {c.chars[r]}</Text>
                  <Wrap spacing={1}>{CHARACTERS.map(ch => <Box key={ch} as="button" type="button" aria-label={`${{ 11: "Jack", 12: "Queen", 13: "King" }[r]} character ${ch}`} aria-pressed={c.chars[r] === ch} onClick={() => patch({ court: { chars: { ...c.chars, [r]: ch } } })} w="40px" h="40px" borderRadius="md" fontSize="xl" bg={c.chars[r] === ch ? "yellow.300" : "whiteAlpha.200"}>{ch}</Box>)}</Wrap>
                </Box>
              ))}
            </VStack>
          </TabPanel>

          <TabPanel px={0}>
            <VStack align="stretch" spacing={4}>
              <HStack justify="space-between" align="start"><Box><FormLabel m={0} htmlFor="four" fontWeight={800}>Four-colour suits</FormLabel><Text fontSize="xs" color="gray.300">Clubs green, diamonds blue, hearts red, spades black: easier when red and black look alike.</Text></Box><Switch id="four" isChecked={f.fourColour} onChange={e => patch({ faces: { fourColour: e.target.checked } })} /></HStack>
              <HStack justify="space-between" align="start"><Box><FormLabel m={0} htmlFor="large" fontWeight={800}>Large corner numbers</FormLabel><Text fontSize="xs" color="gray.300">Bigger rank and suit in the corners, for cards that overlap in a hand.</Text></Box><Switch id="large" isChecked={f.largeIndex} onChange={e => patch({ faces: { largeIndex: e.target.checked } })} /></HStack>
              <Box><Text fontWeight={800} mb={2}>Card colour</Text><Swatches value={f.paper} list={PAPERS} label="Card colour" onPick={x => patch({ faces: { paper: x } })} /></Box>
            </VStack>
          </TabPanel>

          <TabPanel px={0}>
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm" color="gray.300">Your look applies to every card game on this device. Copy the code to give your deck to a friend, or paste one to use theirs.</Text>
              <Textarea value={shareCode} readOnly rows={3} bg="gray.700" border="none" fontSize="xs" aria-label="Your deck code" onFocus={e => e.currentTarget.select()} />
              <HStack><Button size="sm" colorScheme="yellow" onClick={() => { void navigator.clipboard?.writeText(shareCode).then(() => setNote("Copied"), () => setNote("Select the text and copy it")); }}>Copy code</Button><Button size="sm" variant="outline" color="white" onClick={() => { setAll(DEFAULT_CARD_STYLE); setNote("Back to the standard deck"); }}>Reset to standard</Button></HStack>
              <Textarea value={code} onChange={e => setCode(e.target.value)} rows={3} bg="gray.700" border="none" fontSize="xs" placeholder="Paste a deck code here" aria-label="Paste a deck code" />
              <Button size="sm" variant="outline" color="white" alignSelf="start" isDisabled={!code.trim()} onClick={() => { const s = decodeCardStyle(code); if (s) { setAll(s); setNote("Deck loaded"); setCode(""); } else setNote("That code did not work"); }}>Use this code</Button>
              <Text role="status" fontSize="sm" color="yellow.200" minH="20px">{note}</Text>
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
}
