"use client";

import { Badge, Box, Button, DrawerCloseButton, Flex, HStack, IconButton, Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, Text, VStack, useDisclosure } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { InGameMenu, type MenuTab } from "./InGameMenu";
import { useHotkeys } from "./interact/keys";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import type { Award } from "@/lib/client/profile";
import { describeStreak } from "@/lib/client/streak";
import { metaOf } from "@/lib/platform/registry";
import { describeRules, type RuleValues } from "@/lib/platform/rules";
import type { BaseView, GameModule, GameEvent } from "@/lib/platform/types";

export const SEAT_COLOURS = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#14b8a6", "#ec4899", "#84cc16", "#64748b"];

export interface FrameProps {
  mod: GameModule;
  base: BaseView;
  view: unknown;
  rules: RuleValues;
  frame: { id: number; events: GameEvent[] };
  log: string[];
  act: (a: unknown) => void;
  title: string;
  onExit: () => void;
  exitLabel?: string;
  onRematch?: () => void;
  rematchLabel?: string;
  waitingText?: string;
  note?: string;
  away?: Set<number>;
  award?: Award | null;
  rejected?: string;
  headerExtra?: ReactNode;
  footer?: ReactNode;
}

const HowTo = ({ mod, isOpen, onClose }: { mod: GameModule; isOpen: boolean; onClose: () => void }) => (
  <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside" size="lg">
    <ModalOverlay />
    <ModalContent bg="gray.800" color="white" mx={3}>
      <ModalHeader>How to play {mod.driver.name}</ModalHeader>
      <DrawerCloseButton />
      <ModalBody pb={5}>
        <VStack align="stretch" spacing={3}>
          {mod.howTo.map((s, i) => <Box key={i}><Text fontWeight={800}>{i + 1}. {s.title}</Text><Text fontSize="sm" color="gray.300">{s.text}</Text></Box>)}
          <Text fontSize="xs" color="gray.400">Every rule can be changed by whoever sets up the game, so check the rules button for what is in use.</Text>
        </VStack>
      </ModalBody>
    </ModalContent>
  </Modal>
);
export { HowTo };

/** The frame every game sits in: back button, scores, a banner saying what to do, the log, and the result. */
export function TableFrame(p: FrameProps) {
  const { mod, base, rules } = p;
  const menu = useDisclosure();
  const [menuTab, setMenuTab] = useState<MenuTab>("settings");
  const openMenu = (t: MenuTab) => { setMenuTab(t); menu.onOpen(); };
  const leave = useDisclosure();
  const you = base.you;
  const myTurn = you !== null && base.actors.includes(you) && !base.over;
  const was = useRef(false);

  useEffect(() => {
    if (myTurn && !was.current) { sound.play("turn"); buzz("tap"); }
    was.current = myTurn;
  }, [myTurn]);
  const overSeen = useRef(false);
  useEffect(() => {
    if (base.over && !overSeen.current) { overSeen.current = true; const won = you !== null && base.winners.includes(you); sound.play(won ? "win" : "error"); buzz(won ? "win" : "penalty"); }
    if (!base.over) overSeen.current = false;
  }, [base.over, base.winners, you]);

  useHotkeys({ m: () => openMenu("settings"), "?": () => openMenu("help") });
  const won = you !== null && base.winners.includes(you);
  const winnerNames = base.winners.map(w => base.players[w]?.name).filter(Boolean).join(" and ");
  const streak = p.award?.streak ? describeStreak(p.award.streak) : null;

  return (
    <Flex direction="column" minH="100dvh" bg={`linear-gradient(180deg, ${mod.accent}33 0%, transparent 220px), #0b1020`} color="white" pt="max(8px, env(safe-area-inset-top))" pb="max(8px, env(safe-area-inset-bottom))" px={2}>
      <HStack spacing={1} mb={1}>
        <IconButton aria-label="Leave the table" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={leave.onOpen} />
        <Text fontWeight={900} fontSize="lg" letterSpacing="-0.01em" flex={1} noOfLines={1} as="h1">{p.title}</Text>
        {p.note && <Badge colorScheme="orange">{p.note}</Badge>}
        {p.headerExtra}
        <Button size="sm" variant="outline" color="white" onClick={() => openMenu("settings")} aria-label="Menu: settings, rules, how to play, log, controls" leftIcon={<span aria-hidden>☰</span>}>Menu</Button>
      </HStack>

      <HStack spacing={2} overflowX="auto" py={1} role="list" aria-label="Players">
        {base.players.map((pl, i) => {
          const active = base.actors.includes(i);
          return (
            <HStack key={i} role="listitem" spacing={2} px={3} py={1} borderRadius="full" flexShrink={0} bg={active ? "whiteAlpha.300" : "whiteAlpha.100"} border="2px solid" borderColor={active ? SEAT_COLOURS[i % SEAT_COLOURS.length] : "whiteAlpha.100"} boxShadow={active ? `0 0 0 4px ${SEAT_COLOURS[i % SEAT_COLOURS.length]}33` : "none"} transition="all .2s">
              <Box w="10px" h="10px" borderRadius="full" bg={SEAT_COLOURS[i % SEAT_COLOURS.length]} aria-hidden />
              <Text fontSize="sm" fontWeight={700} noOfLines={1} maxW="110px">{pl.name}{you === i ? " (you)" : ""}</Text>
              {pl.kind === "bot" && <Badge fontSize="2xs">{pl.level}</Badge>}
              {p.away?.has(i) && <Badge colorScheme="orange" fontSize="2xs">away</Badge>}
              <Text fontSize="sm" fontWeight={800} color="yellow.200" aria-label={`${base.scores[i] ?? 0} points`}>★ {base.scores[i] ?? 0}</Text>
            </HStack>
          );
        })}
      </HStack>

      <Box role="status" aria-live="polite" textAlign="center" alignSelf="center" my={1} px={4} py="3px" borderRadius="full" fontWeight={800} bg={myTurn ? "rgba(250,204,21,.14)" : "whiteAlpha.100"} border="1px solid" borderColor={myTurn ? "rgba(250,204,21,.45)" : "whiteAlpha.100"} color={myTurn ? "yellow.200" : "gray.300"}>
        {p.rejected ? `That move is not allowed (${p.rejected.replace(/-/g, " ")})` : base.prompt}
      </Box>

      <Box flex={1} minH={0} position="relative" display="flex" flexDirection="column">
        <mod.Table base={base} view={p.view as never} act={p.act as never} frame={p.frame} rules={rules} />
      </Box>

      {p.footer}
      <Box maxH="72px" overflowY="auto" fontSize="xs" color="gray.400" px={2} role="log" aria-label="Game log">
        {p.log.slice(-4).map((l, i) => <Text key={i}>{l}</Text>)}
      </Box>

      {base.over && (
        <Flex position="fixed" inset={0} zIndex={50} bg="blackAlpha.700" align="center" justify="center" p={4} role="dialog" aria-modal="true" aria-label="Game over">
          <VStack bg={`linear-gradient(180deg, ${mod.accent}33, #151a2b 55%)`} borderRadius="3xl" p={7} spacing={3} maxW="380px" w="100%" textAlign="center" border="1px solid" borderColor={mod.accent} boxShadow="lift">
            <Text fontSize="4xl" aria-hidden>{won ? "🏆" : "🎲"}</Text>
            <Text fontSize="xl" fontWeight={900}>{you === null ? `${winnerNames || "Nobody"} won` : won ? "You won!" : winnerNames ? `${winnerNames} won` : "A draw"}</Text>
            {p.award && (
              <VStack spacing={1}>
                <Text fontWeight={800} color="yellow.200">+{p.award.gained} XP · ★ +{p.award.pointsGained}</Text>
                <Text fontSize="sm" color="gray.300">Level {p.award.after.level}{p.award.leveledUp ? " · level up!" : ""} · {p.award.after.into} of {p.award.after.need}</Text>
                {streak && <Text fontSize="sm" fontWeight={800} color="red.200" role="status">{streak.title} · {streak.detail}</Text>}
                {p.award.rankedUp && <Text fontSize="sm" fontWeight={800} color="orange.200">{p.award.rankAfter.rank.icon} New rank: {p.award.rankAfter.rank.name}</Text>}
              </VStack>
            )}
            {p.onRematch ? <Button colorScheme="yellow" w="100%" onClick={p.onRematch}>{p.rematchLabel ?? "Play again"}</Button> : p.waitingText && <Text color="gray.300">{p.waitingText}</Text>}
            <Button variant="outline" color="white" w="100%" onClick={p.onExit}>{p.exitLabel ?? "Back to the menu"}</Button>
          </VStack>
        </Flex>
      )}

      <Modal isOpen={leave.isOpen} onClose={leave.onClose} isCentered>
        <ModalOverlay />
        <ModalContent bg="gray.800" color="white" mx={3}>
          <ModalHeader>Leave the table?</ModalHeader>
          <ModalBody pb={5}>
            <Text color="gray.300" mb={4}>Your game is saved, so you can pick it up again from the menu.</Text>
            <VStack><Button w="100%" colorScheme="yellow" onClick={() => { leave.onClose(); p.onExit(); }}>Leave for now</Button><Button w="100%" variant="outline" onClick={leave.onClose}>Keep playing</Button></VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
      <InGameMenu isOpen={menu.isOpen} onClose={menu.onClose} tab={menuTab} setTab={setMenuTab} c={{ name: mod.driver.name, rules: describeRules(mod.driver.schema, rules), howTo: mod.howTo, log: p.log, keys: mod.keys, cards: metaOf(mod.driver.id)?.category === "Cards" }} />
    </Flex>
  );
}
