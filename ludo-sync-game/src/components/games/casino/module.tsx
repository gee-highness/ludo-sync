"use client";

import { Badge, Box, Button, HStack, Text, VStack, Wrap } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { casino } from "@/lib/games/casino/driver";
import { PILE_ID, buildOptions, candidates, isCapture, ownsBuild, trailAllowed, unitOf, type CAction, type Item, type Position } from "@/lib/games/casino/engine";
import { flag } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { CardBacks, PlayingCard } from "../../platform/PlayingCard";
import { SEAT_COLOURS } from "../../platform/TableFrame";
import type { CView } from "@/lib/games/casino/driver";

function Table({ base, view, act, frame }: TableProps<CView, CAction>) {
  const me = view.me;
  const myTurn = me !== null && base.actors.includes(me) && view.phase === "play";
  const [card, setCard] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const last = useRef(frame.id);

  useEffect(() => { setCard(null); setPicked([]); }, [frame.id]);
  useEffect(() => {
    if (frame.id === last.current) return;
    last.current = frame.id;
    for (const e of frame.events) {
      if (e.type === "capture") { sound.play("card"); buzz("capture"); }
      else if (e.type === "trail") sound.play("flip");
      else if (e.type === "build") sound.play("shuffle");
      else if (e.type === "sweep") { sound.play("bonus"); buzz("bonus"); }
      else if (e.type === "redeal" || e.type === "deal") sound.play("shuffle");
    }
  }, [frame]);

  const pos: Position | null = useMemo(() => me === null ? null : ({
    rules: view.rules, n: base.players.length, me, hand: view.hand, table: view.table, pileTops: view.pileTops,
  }), [view, base.players.length, me]);

  const items = useMemo(() => (pos ? candidates(pos) : view.table), [pos, view.table]);
  const chosen = items.filter(i => picked.includes(i.id));
  const canCapture = !!pos && card !== null && isCapture(pos, card, chosen);
  const buildValues = pos && card !== null && chosen.length ? buildOptions(pos, card, chosen) : [];
  const canTrail = !!pos && card !== null && picked.length === 0 && trailAllowed(pos, card);

  // table cards that take part in some legal play of the selected card glow, so the options are easy to see
  const hint = useMemo(() => {
    const ids = new Set<number>();
    if (!pos || card === null || !myTurn) return ids;
    const pool = items.slice(0, 13);
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const sub = pool.filter((_, i) => (mask >> i) & 1);
      if (sub.length > 4) continue;
      if (isCapture(pos, card, sub) || buildOptions(pos, card, sub).length) sub.forEach(s => ids.add(s.id));
    }
    return ids;
  }, [pos, card, items, myTurn]);

  const toggle = (id: number) => { if (myTurn && card !== null) setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); };
  const bestCapture = () => {
    if (!pos || card === null) return;
    const pool = items.slice(0, 13);
    let best: Item[] = [];
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const sub = pool.filter((_, i) => (mask >> i) & 1);
      if (sub.length > best.length && isCapture(pos, card, sub)) best = sub;
    }
    setPicked(best.map(b => b.id));
  };

  const unitColour = (p: number) => SEAT_COLOURS[unitOf(view.rules, base.players.length, p) % SEAT_COLOURS.length];
  const owns = pos ? ownsBuild(pos) : false;

  return (
    <VStack spacing={3} align="stretch" px={1} pt={1} pb={2} flex={1} justify="space-between">
      <HStack spacing={3} overflowX="auto" align="start">
        {base.players.map((p, i) => i === me ? null : (
          <VStack key={i} spacing={1} minW="96px" p={2} borderRadius="lg" bg={view.turn === i ? "whiteAlpha.300" : "whiteAlpha.100"} border="2px solid" borderColor={view.turn === i && view.phase === "play" ? unitColour(i) : "transparent"}>
            <Text fontSize="xs" fontWeight={800} noOfLines={1}>{p.name}</Text>
            <CardBacks count={view.handCounts[i]} />
            <HStack spacing={1} fontSize="2xs">
              <Badge>{view.pileCounts[i]} won</Badge>
              {view.sweeps[view.units[i]] > 0 && <Badge colorScheme="yellow">{view.sweeps[view.units[i]]} sweep{view.sweeps[view.units[i]] === 1 ? "" : "s"}</Badge>}
            </HStack>
            {view.pileTops[i] !== null && <HStack spacing={1}><Text fontSize="2xs" color="gray.400">top</Text><PlayingCard id={view.pileTops[i]!} size="xs" /></HStack>}
          </VStack>
        ))}
        <VStack spacing={0} minW="64px" fontSize="xs" color="gray.300"><Text>Deck {view.deckCount}</Text><Text>Deal {view.deal}</Text></VStack>
      </HStack>

      <Box minH="120px" bg="#14532d" borderRadius="xl" p={3} border="2px solid #166534" role="group" aria-label="Table">
        {view.table.length === 0 && <Text color="whiteAlpha.600" textAlign="center" py={6}>The table is empty</Text>}
        <Wrap spacing={3} justify="center">
          {view.table.map(it => (
            <Box key={it.id} position="relative">
              {it.build ? (
                <VStack spacing={1} p={2} borderRadius="lg" bg="blackAlpha.300" border="2px solid" borderColor={picked.includes(it.id) ? "#fde047" : hint.has(it.id) ? "#38bdf8" : unitColour(it.owner)}
                  as="button" type="button" onClick={() => toggle(it.id)} aria-label={`Build of ${it.value} owned by ${base.players[it.owner]?.name}`} aria-pressed={picked.includes(it.id)}>
                  <HStack spacing="-26px">{it.cards.slice(0, 5).map(c => <PlayingCard key={c} id={c} size="xs" />)}</HStack>
                  <Badge colorScheme="yellow">Build {it.value}</Badge>
                  <Text fontSize="2xs" color="gray.300">{base.players[it.owner]?.name}</Text>
                </VStack>
              ) : (
                <PlayingCard id={it.cards[0]} size="md" selected={picked.includes(it.id)} glow={hint.has(it.id) && !picked.includes(it.id)} dim={card !== null && myTurn && !hint.has(it.id) && !picked.includes(it.id)} onClick={() => toggle(it.id)} />
              )}
            </Box>
          ))}
        </Wrap>
        {view.pileTops.some((t, i) => t !== null && i !== me && myTurn && card !== null && flag(view.rules, "stealPileTop")) && (
          <Wrap spacing={2} mt={2} justify="center">
            {view.pileTops.map((t, i) => t === null || i === me || unitOf(view.rules, base.players.length, i) === unitOf(view.rules, base.players.length, me ?? 0) ? null : (
              <HStack key={i} spacing={1}><Text fontSize="2xs" color="gray.300">{base.players[i].name}&apos;s pile</Text><PlayingCard id={t} size="sm" selected={picked.includes(PILE_ID + i)} glow={hint.has(PILE_ID + i)} onClick={() => toggle(PILE_ID + i)} /></HStack>
            ))}
          </Wrap>
        )}
      </Box>

      {view.phase === "dealOver" && (
        <VStack bg="whiteAlpha.100" borderRadius="xl" p={3} spacing={2} align="stretch" role="region" aria-label="Deal result">
          <Text fontWeight={800}>Deal {view.deal} scores</Text>
          {view.summary.map(s => (
            <Box key={s.unit}>
              <Text fontWeight={700}>{base.players.filter((_, i) => view.units[i] === s.unit).map(p => p.name).join(" & ")}: +{s.total} (total {view.scores[s.unit]})</Text>
              <Text fontSize="xs" color="gray.300">{s.lines.length ? s.lines.join(" · ") : "No points"}</Text>
            </Box>
          ))}
          {me !== null && <Button colorScheme="yellow" onClick={() => act({ type: "next" })}>Next deal</Button>}
        </VStack>
      )}

      {view.phase === "play" && me !== null && (
        <>
          <HStack spacing={2} wrap="wrap" justify="center" minH="40px">
            <Button size="sm" colorScheme="green" isDisabled={!myTurn || !canCapture} onClick={() => card !== null && act({ type: "capture", card, take: picked })}>Capture</Button>
            {buildValues.map(v => <Button key={v} size="sm" colorScheme="orange" isDisabled={!myTurn} onClick={() => card !== null && act({ type: "build", card, take: picked, value: v })}>Build {v}</Button>)}
            <Button size="sm" variant="outline" color="white" isDisabled={!myTurn || !canTrail} onClick={() => card !== null && act({ type: "trail", card })}>Trail</Button>
            <Button size="sm" variant="ghost" color="white" isDisabled={!myTurn || card === null} onClick={bestCapture}>Pick the most I can take</Button>
            {picked.length > 0 && <Button size="sm" variant="ghost" color="white" onClick={() => setPicked([])}>Clear</Button>}
          </HStack>
          {myTurn && card === null && <Text textAlign="center" fontSize="sm" color="gray.300">Tap a card in your hand, then the table cards you want to take or build with.</Text>}
          {myTurn && card !== null && owns && <Text textAlign="center" fontSize="xs" color="orange.200">You own a build, so trailing is not allowed while you can capture or build.</Text>}
          <HStack justify="center" spacing={2} wrap="wrap" aria-label="Your hand" role="group">
            {view.hand.map(c => <PlayingCard key={c} id={c} size="lg" selected={card === c} dim={!myTurn} onClick={() => { if (!myTurn) return; setCard(x => (x === c ? null : c)); setPicked([]); }} />)}
          </HStack>
        </>
      )}
    </VStack>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: casino as never,
  Table: Table as never,
  accent: "#16a34a",
  icon: "♠️",
  tagline: "The South African card game of capturing, building and trailing. Every rule is yours to set: aces, picture cards, builds, taking from piles, sweeps, points and teams.",
  howTo: [
    { title: "Goal", text: "Win cards from the table and score points for the most cards, the most spades, the Big Casino (10 of diamonds), the Little Casino (2 of spades), aces and sweeps. First to the target score wins." },
    { title: "Capture", text: "Play a card and take table cards of the same rank, or cards that add up to it (a 9 takes 4 + 5). You can take several sets at once." },
    { title: "Build", text: "Combine your card with table cards into a build of a higher value, such as a 4 and a 5 as a 9, if you hold a 9. Opponents can capture your build with a 9, or add to it." },
    { title: "Trail", text: "If you cannot or do not want to capture or build, put a card on the table." },
    { title: "Sweep", text: "Clear the whole table with a capture for a sweep." },
    { title: "Your rules", text: "Ace as 1 or 14, picture cards counting 11 to 13 or pairing only, whether you may build, take from an opponent's pile, must capture, every point value, the target and teams: all in Rules." },
  ],
};
export default gameModule;
