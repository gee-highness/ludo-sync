"use client";

import {
  Box, Button, Divider, Flex, Heading, HStack, IconButton, Input, Select, Text, VStack,
} from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import { useMemo, useState } from "react";
import { SEATS, SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { cleanName } from "@/lib/ludo/engine";
import type { BotLevel, PlayerSetup, Rules } from "@/lib/ludo/types";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { sound } from "@/lib/client/audio";
import RulesEditor from "./RulesEditor";
import { CityBackdrop } from "../scenery/CityBackdrop";

type SlotKind = "off" | "human" | "bot";
interface Slot { kind: SlotKind; name: string; level: BotLevel }

export type Preset = "bot" | "local";

export const initialSlots = (preset: Preset, name: string, level: BotLevel): Slot[] => {
  const slot = (kind: SlotKind, n: string): Slot => ({ kind, name: n, level });
  return preset === "bot"
    ? [slot("human", name), slot("off", ""), slot("bot", ""), slot("off", "")]
    : [slot("human", name), slot("off", ""), slot("human", ""), slot("off", "")];
};

export const slotsToSetups = (slots: Slot[]): PlayerSetup[] =>
  slots.flatMap((s, i): PlayerSetup[] => {
    if (s.kind === "off") return [];
    const seat = i as Seat;
    return s.kind === "bot"
      ? [{ seat, name: `${SEAT_INFO[seat].name} bot`, kind: "bot", level: s.level }]
      : [{ seat, name: cleanName(s.name, `Player ${i + 1}`), kind: "human" }];
  });

interface Props {
  preset: Preset;
  onStart: (setups: PlayerSetup[], rules: Rules) => void;
  onBack: () => void;
}

export default function SetupScreen({ preset, onStart, onBack }: Props) {
  const [settings] = useSettings();
  const [slots, setSlots] = useState<Slot[]>(() => initialSlots(preset, settings.playerName, settings.botLevel));
  const [rules, setRules] = useState<Rules>(settings.rules);
  const active = slots.filter(s => s.kind !== "off").length;
  const humans = slots.filter(s => s.kind === "human").length;
  const error = useMemo(
    () => (active < 2 ? "Pick at least two players." : humans === 0 ? "Add at least one person to play." : null),
    [active, humans],
  );

  const patch = (i: number, p: Partial<Slot>) => setSlots(s => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const start = () => {
    if (error) return;
    sound.unlock();
    sound.play("click");
    const first = slots.find(s => s.kind === "human");
    const firstBot = slots.find(s => s.kind === "bot");
    updateSettings({ rules, playerName: first?.name ?? "", ...(firstBot ? { botLevel: firstBot.level } : {}) });
    onStart(slotsToSetups(slots), rules);
  };

  return (
    <Flex minH="100dvh" bg="#10172E" color="white" justify="center" position="relative" isolation="isolate" px={4} pt="max(16px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      {settings.scenery === "city" && <CityBackdrop timeOfDay={settings.timeOfDay} />}
      <VStack w="100%" maxW="560px" align="stretch" spacing={5} p={3} borderRadius="2xl" bg={settings.scenery === "city" ? "blackAlpha.700" : undefined} backdropFilter={settings.scenery === "city" ? "blur(8px)" : undefined}>
        <HStack>
          <IconButton aria-label="Back to menu" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={onBack} />
          <Heading size="md">{preset === "bot" ? "Play vs bots" : "Pass and play"}</Heading>
        </HStack>

        <VStack align="stretch" spacing={3} as="section" aria-label="Players">
          {SEATS.map(seat => {
            const s = slots[seat];
            const info = SEAT_INFO[seat];
            return (
              <HStack key={seat} bg="whiteAlpha.100" p={3} borderRadius="xl" spacing={3} border="2px solid" borderColor={s.kind === "off" ? "transparent" : info.main}>
                <Box w="30px" h="30px" borderRadius="full" flexShrink={0} bg={s.kind === "off" ? "gray.600" : info.main} border="2px solid #fff" aria-hidden />
                <Select
                  w="112px" size="sm" bg="gray.700" aria-label={`${info.name} player type`} value={s.kind}
                  onChange={e => patch(seat, { kind: e.target.value as SlotKind })}
                >
                  <option value="human">Person</option><option value="bot">Bot</option><option value="off">Empty</option>
                </Select>
                {s.kind === "human" && (
                  <Input
                    size="sm" bg="gray.700" placeholder={`Player ${seat + 1}`} value={s.name} maxLength={20} aria-label={`${info.name} player name`}
                    onChange={e => patch(seat, { name: e.target.value })}
                  />
                )}
                {s.kind === "bot" && (
                  <Select size="sm" bg="gray.700" aria-label={`${info.name} bot level`} value={s.level} onChange={e => patch(seat, { level: e.target.value as BotLevel })}>
                    <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
                  </Select>
                )}
                {s.kind === "off" && <Text color="gray.400" fontSize="sm">{info.name} sits this one out</Text>}
              </HStack>
            );
          })}
        </VStack>

        <Divider borderColor="whiteAlpha.300" />
        <VStack align="stretch" spacing={3} as="section" aria-label="Rules">
          <Heading size="sm" color="teal.200">Rules</Heading>
          <RulesEditor rules={rules} onChange={setRules} />
        </VStack>

        {error && <Text color="orange.300" role="alert" fontSize="sm">{error}</Text>}
        <Button colorScheme="teal" size="lg" onClick={start} isDisabled={!!error}>Start game</Button>
      </VStack>
    </Flex>
  );
}
