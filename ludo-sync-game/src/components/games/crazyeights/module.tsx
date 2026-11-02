"use client";

import { Badge, Box, Button, HStack, Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { flag, pick } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { crazyEights, rankOf, type EAction, type EView } from "@/lib/games/crazyeights/driver";
import { CardBacks, PlayingCard, SUIT_NAMES, SUIT_SYMBOLS } from "../../platform/PlayingCard";
import { useMotion } from "../../platform/useMotion";
import { SEAT_COLOURS } from "../../platform/TableFrame";

const KEY: Record<number, string> = { 8: "p8", 1: "pA", 2: "p2", 7: "p7", 11: "pJ", 12: "pQ", 13: "pK" };
const SUIT_HEX = ["#0f172a", "#dc2626", "#dc2626", "#0f172a"];

function Table({ base, view, act, frame }: TableProps<EView, EAction>) {
  const me = view.me;
  const root = useRef<HTMLDivElement>(null);
  useMotion(root, frame, {
    me,
    // a card someone else played flies in from their hand; cards I draw or am dealt come from the draw pile
    enter: (key, events) => {
      const id = Number(key.slice(1));
      const play = events.find(e => e.type === "play" && e.p !== me && ((e.card as number | undefined) === id || (e.cards as number[] | undefined)?.includes(id)));
      if (play) return `hand-${play.p}`;
      return events.some(e => e.type === "round" || e.type === "deal" || ((e.type === "draw" || e.type === "drawPenalty") && e.p === me)) ? "deck" : null;
    },
    // an opponent drawing has no card on screen: a card back flies from the pile to their hand
    fly: events => events.filter(e => (e.type === "draw" || e.type === "drawPenalty" || e.type === "catch") && e.p !== me && e.p !== undefined).map(e => ({ from: "deck", to: `hand-${e.p}`, count: typeof e.cards === "number" ? e.cards : 1 })),
  });
  const myTurn = me !== null && view.turn === me && view.phase === "play";
  const [selected, setSelected] = useState<number[]>([]);
  const [chooser, setChooser] = useState<number[] | null>(null);
  const last = useRef(frame.id);
  const multi = flag(view.rules, "multi");

  useEffect(() => { setSelected([]); setChooser(null); }, [frame.id]);
  useEffect(() => {
    if (frame.id === last.current) return;
    last.current = frame.id;
    for (const e of frame.events) {
      if (e.type === "play") { sound.play("card"); buzz("tap"); }
      else if (e.type === "draw" || e.type === "drawPenalty") sound.play("flip");
      else if (e.type === "skip" || e.type === "reverse") sound.play("pop");
      else if (e.type === "round") sound.play("shuffle");
    }
  }, [frame]);

  const isWildCard = (c: number) => pick(view.rules, KEY[rankOf(c)] ?? "none") === "wild";
  const clickable = new Set([...(myTurn ? view.playable : []), ...view.jumpable]);
  // with multi-play, other cards of a chosen rank can join it
  const joinable = (c: number) => multi && selected.length > 0 && rankOf(selected[0]) === rankOf(c) && !selected.includes(c) && view.hand.includes(c);

  const choose = (c: number) => {
    if (multi && selected.length > 0 && rankOf(selected[0]) === rankOf(c)) { setSelected(s => (s.includes(c) ? s.filter(x => x !== c) : [...s, c])); return; }
    if (multi && view.hand.filter(h => rankOf(h) === rankOf(c)).length > 1) { setSelected([c]); return; }
    submit([c]);
  };
  const submit = (cards: number[]) => {
    if (cards.some(isWildCard)) { setChooser(cards); return; }
    act({ type: "play", cards });
  };

  return (
    <VStack ref={root} spacing={3} align="stretch" px={1} pt={1} pb={2} flex={1} justify="space-between" position="relative">
      <HStack spacing={2} overflowX="auto" align="start" role="list" aria-label="Opponents">
        {base.players.map((p, i) => i === me ? null : (
          <VStack key={i} role="listitem" spacing={1} minW="86px" p={2} borderRadius="lg" bg={view.turn === i && view.phase === "play" ? "whiteAlpha.300" : "whiteAlpha.100"} border="2px solid" borderColor={view.turn === i && view.phase === "play" ? SEAT_COLOURS[i % SEAT_COLOURS.length] : "transparent"}>
            <Text fontSize="xs" fontWeight={800} noOfLines={1}>{p.name}</Text>
            <Box data-anchor={`hand-${i}`}><CardBacks count={view.handCounts[i]} /></Box>
            <Text fontSize="xs" color="gray.300">{view.handCounts[i]} cards</Text>
          </VStack>
        ))}
      </HStack>

      <VStack spacing={2}>
        <HStack spacing={6} justify="center" align="center">
          <VStack spacing={0}>
            <Box as="button" data-anchor="deck" aria-label="Draw a card" onClick={() => view.canDraw && act({ type: "draw" })} opacity={view.canDraw ? 1 : 0.75}><PlayingCard faceDown size="md" glow={view.canDraw} /></Box>
            <Text fontSize="2xs" color="gray.400">Draw ({view.deckCount})</Text>
          </VStack>
          <VStack spacing={1}>
            {view.top !== null && <PlayingCard id={view.top} size="lg" mk={`c${view.top}`} />}
            <HStack spacing={1} aria-label={`Suit in play: ${SUIT_NAMES[view.suit]}`}>
              <Text fontSize="xl" color={view.suit === 1 || view.suit === 2 ? "#f87171" : "white"} fontWeight={900}>{SUIT_SYMBOLS[view.suit]}</Text>
              <Text fontSize="xs">{SUIT_NAMES[view.suit]}</Text>
              <Text aria-label={view.dir === 1 ? "clockwise" : "anticlockwise"}>{view.dir === 1 ? "↻" : "↺"}</Text>
            </HStack>
          </VStack>
        </HStack>
        {view.pending > 0 && <Badge colorScheme="orange" fontSize="sm" role="status">{view.pending} cards to draw</Badge>}
      </VStack>

      {view.phase === "roundOver" && (
        <VStack bg="whiteAlpha.100" borderRadius="xl" p={3} spacing={2} align="stretch" role="region" aria-label="Round result">
          <Text fontWeight={800}>{base.players[view.roundWinner]?.name} went out: +{view.roundPoints} points</Text>
          <HStack spacing={2} wrap="wrap">{base.players.map((p, i) => <Badge key={i} colorScheme={i === view.roundWinner ? "green" : "gray"}>{p.name}: {view.scores[i]}</Badge>)}</HStack>
          {me !== null && <Button colorScheme="yellow" onClick={() => act({ type: "next" })}>Next round</Button>}
        </VStack>
      )}

      {view.phase === "play" && me !== null && (
        <>
          <HStack spacing={2} justify="center" wrap="wrap" minH="40px">
            {myTurn && view.pending > 0 && <Button size="sm" colorScheme="orange" onClick={() => act({ type: "draw" })}>Draw {view.pending}</Button>}
            {selected.length > 0 && <Button size="sm" colorScheme="green" onClick={() => submit(selected)}>Play {selected.length} card{selected.length === 1 ? "" : "s"}</Button>}
            {selected.length > 0 && <Button size="sm" variant="ghost" color="white" onClick={() => setSelected([])}>Clear</Button>}
            {view.canPass && <Button size="sm" variant="outline" color="white" onClick={() => act({ type: "pass" })}>Pass</Button>}
          </HStack>
          {multi && selected.length === 0 && myTurn && <Text textAlign="center" fontSize="xs" color="gray.400">Tap a card, then tap other cards of the same rank to play them together.</Text>}
          {view.jumpable.length > 0 && !myTurn && <Text textAlign="center" fontSize="xs" color="sky.200">You can jump in with an identical card!</Text>}
          <Box overflowX="auto" pt={4} pb={1} role="group" aria-label="Your hand">
            <Box display="flex" w="fit-content" mx="auto" px={2}>
              {view.hand.map((c, i) => (
                <Box key={c} ml={i ? "-18px" : 0} zIndex={i}>
                  <PlayingCard id={c} mk={`c${c}`} size="md" selected={selected.includes(c)} glow={clickable.has(c) && !selected.includes(c)} dim={!clickable.has(c) && !joinable(c) && !selected.includes(c) && (myTurn || view.jumpable.length > 0)}
                    onClick={clickable.has(c) || joinable(c) || selected.includes(c) ? () => choose(c) : undefined} />
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      <Modal isOpen={!!chooser} onClose={() => setChooser(null)} isCentered>
        <ModalOverlay />
        <ModalContent bg="gray.800" color="white" mx={3}>
          <ModalHeader>Choose a suit</ModalHeader>
          <ModalBody pb={5}>
            <HStack spacing={3} justify="center">
              {[0, 1, 2, 3].map(s => (
                <Button key={s} h="72px" w="72px" bg="#f8fafc" color={SUIT_HEX[s]} fontSize="4xl" aria-label={SUIT_NAMES[s]} onClick={() => { const cards = chooser!; setChooser(null); act({ type: "play", cards, suit: s }); }}>{SUIT_SYMBOLS[s]}</Button>
              ))}
            </HStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </VStack>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: crazyEights as never,
  Table: Table as never,
  accent: "#7c3aed",
  icon: "8️⃣",
  tagline: "Match the suit or rank; eights are wild. Every rank's power, the draw rules, stacking, multi-play and scoring are yours to change.",
  howTo: [
    { title: "Goal", text: "Be first to play all your cards. Then score the points left in the other hands." },
    { title: "Play", text: "Play a card that matches the top card's suit or rank." },
    { title: "Eights", text: "Eights are wild: play one on anything and name the suit. You can change what any rank does in Rules." },
    { title: "Cannot play?", text: "Draw a card (or more, depending on the rules). If it fits you may play it; otherwise your turn passes." },
    { title: "Your rules", text: "Powers for each rank, stacking draw cards, multi-play, jump in, draw rules and scoring are all in Rules." },
  ],
};
export default gameModule;
