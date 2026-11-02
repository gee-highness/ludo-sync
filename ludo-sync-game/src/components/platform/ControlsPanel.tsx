"use client";

import { Box, Button, HStack, Switch, Text, VStack, FormLabel } from "@chakra-ui/react";
import { DEFAULT_INTERACTION, useInteraction } from "@/lib/client/interaction";

const Row = ({ id, title, hint, on, set }: { id: string; title: string; hint: string; on: boolean; set: (v: boolean) => void }) => (
  <HStack justify="space-between" align="start" spacing={4}>
    <Box><FormLabel m={0} htmlFor={id} fontWeight={800}>{title}</FormLabel><Text fontSize="xs" color="gray.300">{hint}</Text></Box>
    <Switch id={id} isChecked={on} onChange={e => set(e.target.checked)} mt={1} />
  </HStack>
);

/** Controls and accessibility for every game: how to move things, how big things are, and what the keyboard can do. */
export function ControlsPanel({ shortcuts }: { shortcuts?: { key: string; does: string }[] }) {
  const [s, set] = useInteraction();
  return (
    <VStack align="stretch" spacing={4}>
      <Text fontSize="sm" color="gray.300">Every move can be made by tapping, by dragging, or with a keyboard. Pick what suits you.</Text>
      <Row id="drag" title="Drag and drop" hint="Pick up a card or piece and drag it where it should go. Tapping still works." on={s.drag} set={v => set({ drag: v })} />
      <Row id="drophints" title="Light up where it can go" hint="While you drag, every place the card can land is highlighted." on={s.dropHints} set={v => set({ dropHints: v })} />
      <Row id="big" title="Bigger buttons" hint="Every button and control at least 48 px, easier for thumbs and shaky hands." on={s.bigTargets} set={v => set({ bigTargets: v })} />
      <Box>
        <Text fontWeight={800} mb={2}>Text and button size</Text>
        <HStack spacing={2} role="radiogroup" aria-label="Text size">
          {([100, 115, 130, 150] as const).map(v => <Button key={v} size="sm" role="radio" aria-checked={s.textScale === v} variant={s.textScale === v ? "solid" : "outline"} colorScheme={s.textScale === v ? "yellow" : undefined} color={s.textScale === v ? undefined : "white"} onClick={() => set({ textScale: v })}>{v === 100 ? "Normal" : `${v}%`}</Button>)}
        </HStack>
      </Box>
      <Row id="keys" title="Keyboard shortcuts" hint="Single keys for the common actions (listed below). Arrow keys always move between cards." on={s.shortcuts} set={v => set({ shortcuts: v })} />
      {shortcuts && shortcuts.length > 0 && (
        <Box bg="blackAlpha.300" borderRadius="lg" p={3}>
          <Text fontWeight={800} mb={1}>Keys in this game</Text>
          {shortcuts.map(k => <HStack key={k.key} justify="space-between" fontSize="sm"><Text>{k.does}</Text><Box as="kbd" px={2} py="1px" borderRadius="md" bg="whiteAlpha.300" fontWeight={800}>{k.key}</Box></HStack>)}
          <HStack justify="space-between" fontSize="sm"><Text>Move between cards or squares</Text><Box as="kbd" px={2} py="1px" borderRadius="md" bg="whiteAlpha.300" fontWeight={800}>← → ↑ ↓</Box></HStack>
          <HStack justify="space-between" fontSize="sm"><Text>Pick up, play or drop</Text><Box as="kbd" px={2} py="1px" borderRadius="md" bg="whiteAlpha.300" fontWeight={800}>Enter / Space</Box></HStack>
        </Box>
      )}
      <Button size="sm" variant="outline" color="white" alignSelf="start" onClick={() => set(DEFAULT_INTERACTION)}>Reset controls</Button>
    </VStack>
  );
}
