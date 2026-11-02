"use client";

import { Badge, Box, Button, HStack, Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { flag } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { K, fourColors, type FAction, type FView } from "@/lib/games/fourcolors/driver";
import { COLOUR_HEX, COLOUR_NAMES, ColourCard, SHAPES } from "../../platform/ColourCard";
import { useMotion } from "../../platform/useMotion";
import { SEAT_COLOURS } from "../../platform/TableFrame";

function Table({ base, view, act, frame }: TableProps<FView, FAction>) {
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
  const [chooser, setChooser] = useState<{ card: number; swap?: number } | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const last = useRef(frame.id);
  const myHandCount = me === null ? 0 : view.hand.length;
  const catchTarget = view.catchable !== null && view.catchable !== me ? view.catchable : null;
  const mayCall = me !== null && flag(view.rules, "lastCall") && myHandCount <= 2 && !view.called[me] && view.phase === "play";

  useEffect(() => { setChooser(null); setSwapFor(null); }, [frame.id]);
  useEffect(() => {
    if (frame.id === last.current) return;
    last.current = frame.id;
    for (const e of frame.events) {
      if (e.type === "play") { sound.play("card"); buzz("tap"); }
      else if (e.type === "draw" || e.type === "drawPenalty") sound.play("flip");
      else if (e.type === "skip" || e.type === "reverse") sound.play("pop");
      else if (e.type === "challenge" || e.type === "catch") { sound.play("penalty"); buzz("penalty"); }
      else if (e.type === "call") sound.play("bonus");
      else if (e.type === "round") sound.play("shuffle");
    }
  }, [frame]);

  const playCard = (id: number) => {
    const c = view.hand.find(h => h.id === id)!;
    const out = me !== null && view.turn !== me; // jumping in
    const needsColour = c.k >= K.WILD;
    const needsSwap = flag(view.rules, "sevenZero") && c.k === K.NUM && c.v === 7 && base.players.length > 1;
    if (needsColour) { setChooser({ card: id }); return; }
    if (needsSwap) { setSwapFor(id); return; }
    act({ type: "play", card: id, call: myHandCount === 2 && mayCall });
    void out;
  };
  const clickable = new Set([...(myTurn ? view.playable : []), ...view.jumpable]);
  const dirIcon = view.dir === 1 ? "↻" : "↺";
  const topColour = view.color;

  return (
    <VStack ref={root} spacing={3} align="stretch" px={1} pt={1} pb={2} flex={1} justify="space-between" position="relative">
      <HStack spacing={2} overflowX="auto" align="start" role="list" aria-label="Opponents">
        {base.players.map((p, i) => i === me ? null : (
          <VStack key={i} role="listitem" spacing={1} minW="86px" p={2} borderRadius="lg" bg={view.turn === i && view.phase === "play" ? "whiteAlpha.300" : "whiteAlpha.100"} border="2px solid" borderColor={view.turn === i && view.phase === "play" ? SEAT_COLOURS[i % SEAT_COLOURS.length] : "transparent"}>
            <Text fontSize="xs" fontWeight={800} noOfLines={1}>{p.name}</Text>
            <Text data-anchor={`hand-${i}`} fontSize="2xl" fontWeight={900} lineHeight={1} aria-label={`${view.handCounts[i]} cards`}>🂠 {view.handCounts[i]}</Text>
            {view.handCounts[i] === 1 && <Badge colorScheme={view.called[i] ? "green" : "red"}>{view.called[i] ? "Last card!" : "uncalled"}</Badge>}
            {catchTarget === i && <Button size="xs" colorScheme="red" onClick={() => act({ type: "catch", target: i })}>Catch!</Button>}
          </VStack>
        ))}
      </HStack>

      <VStack spacing={2}>
        <HStack spacing={6} align="center" justify="center">
          <VStack spacing={0}>
            <Box as="button" data-anchor="deck" aria-label="Draw a card" onClick={() => myTurn && view.pending === 0 && view.drawn === null && act({ type: "draw" })} opacity={myTurn ? 1 : 0.7}><ColourCard faceDown size="md" glow={myTurn && view.pending === 0 && view.playable.length === 0} /></Box>
            <Text fontSize="2xs" color="gray.400">Draw ({view.deckCount})</Text>
          </VStack>
          <VStack spacing={0}>
            {view.top && <ColourCard card={view.top} mk={`c${view.top.id}`} size="lg" colour={view.top.c === 4 ? topColour : undefined} />}
            <HStack spacing={1} mt="6px" aria-label={`Colour in play: ${COLOUR_NAMES[topColour]}`}>
              <Box w="16px" h="16px" borderRadius="50%" bg={COLOUR_HEX[topColour]} border="2px solid white" />
              <Text fontSize="xs" fontWeight={800}>{SHAPES[topColour]} {COLOUR_NAMES[topColour]}</Text>
              <Text fontSize="lg" aria-label={view.dir === 1 ? "clockwise" : "anticlockwise"}>{dirIcon}</Text>
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
            {view.canChallenge && <Button size="sm" colorScheme="red" onClick={() => act({ type: "challenge" })}>Challenge the Wild Draw Four</Button>}
            {myTurn && view.pending > 0 && <Button size="sm" colorScheme="orange" onClick={() => act({ type: "draw" })}>Draw {view.pending}</Button>}
            {myTurn && view.drawn !== null && !flag(view.rules, "mustPlayDrawn") && <Button size="sm" variant="outline" color="white" onClick={() => act({ type: "pass" })}>Keep it and pass</Button>}
            {mayCall && <Button size="sm" colorScheme="yellow" onClick={() => act({ type: "call" })}>Last card!</Button>}
          </HStack>
          <Box overflowX="auto" pt={4} pb={1} role="group" aria-label="Your hand">
            <Box display="flex" w="fit-content" mx="auto" px={2}>
              {view.hand.map((c, i) => (
                <Box key={c.id} ml={i ? "-16px" : 0} zIndex={i}>
                  <ColourCard card={c} mk={`c${c.id}`} size="md" glow={clickable.has(c.id)} dim={!clickable.has(c.id) && (myTurn || view.jumpable.length > 0)} onClick={clickable.has(c.id) ? () => playCard(c.id) : undefined} />
                </Box>
              ))}
            </Box>
          </Box>
          {view.jumpable.length > 0 && !myTurn && <Text textAlign="center" fontSize="xs" color="sky.200">You can jump in with an identical card!</Text>}
        </>
      )}

      <Modal isOpen={!!chooser} onClose={() => setChooser(null)} isCentered>
        <ModalOverlay />
        <ModalContent bg="gray.800" color="white" mx={3}>
          <ModalHeader>Choose a colour</ModalHeader>
          <ModalBody pb={5}>
            <HStack spacing={3} justify="center">
              {COLOUR_HEX.map((hex, c) => (
                <Button key={c} h="72px" w="72px" bg={hex} color="white" fontSize="2xl" _hover={{ filter: "brightness(1.15)" }} aria-label={COLOUR_NAMES[c]}
                  onClick={() => { const card = chooser!.card; const cd = view.hand.find(h => h.id === card)!; setChooser(null); act({ type: "play", card, color: c, call: myHandCount === 2 && mayCall, ...(flag(view.rules, "sevenZero") && cd.k === K.NUM ? {} : {}) }); }}>
                  {SHAPES[c]}
                </Button>
              ))}
            </HStack>
          </ModalBody>
        </ModalContent>
      </Modal>
      <Modal isOpen={swapFor !== null} onClose={() => setSwapFor(null)} isCentered>
        <ModalOverlay />
        <ModalContent bg="gray.800" color="white" mx={3}>
          <ModalHeader>Swap hands with…</ModalHeader>
          <ModalBody pb={5}>
            <VStack>{base.players.map((p, i) => i === me ? null : <Button key={i} w="100%" onClick={() => { const card = swapFor!; setSwapFor(null); act({ type: "play", card, swap: i, call: myHandCount === 2 && mayCall }); }}>{p.name} ({view.handCounts[i]} cards)</Button>)}</VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </VStack>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: fourColors as never,
  Table: Table as never,
  accent: "#dc2626",
  icon: "🎴",
  tagline: "Match the colour or the number, play your action cards, and be first out. Every rule is yours to change, even the deck.",
  howTo: [
    { title: "Goal", text: "Get rid of all your cards first. Then score the points left in everyone else's hands. First to the target wins the match." },
    { title: "Play a card", text: "Play a card that matches the top card's colour, number or symbol. Wild cards go on anything and let you choose the colour." },
    { title: "Action cards", text: "Skip: the next player loses their turn. Reverse: the direction flips. Draw Two: the next player draws two. Wild Draw Four: choose a colour, the next player draws four, and can challenge you if you had a card of the colour in play." },
    { title: "Cannot play?", text: "Draw a card. If it fits you may play it, otherwise your turn passes." },
    { title: "Last card!", text: "When you are down to one card you must call “Last card!”. If someone catches you first you draw penalty cards." },
    { title: "Your rules", text: "Stacking, jump in, seven-zero, the exact deck, penalties, scoring and more are all in Rules." },
  ],
};
export default gameModule;
