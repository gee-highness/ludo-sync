"use client";

import { Badge, Box, Button, HStack, Text, VStack, Wrap } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { casino } from "@/lib/games/casino/driver";
import { BIG, LITTLE, PILE_ID, blockedBuilds, buildOptions, candidates, isCapture, ownsBuild, trailAllowed, unitOf, rankOf, suitOf, type CAction, type Item, type Position } from "@/lib/games/casino/engine";
import { flag } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { CardBacks, PlayingCard, cardLabel } from "../../platform/PlayingCard";
import { Draggable, DropZone } from "../../platform/interact/Parts";
import { roveKeys, useHotkeys } from "../../platform/interact/keys";
import { useMotion } from "../../platform/useMotion";
import { SEAT_COLOURS } from "../../platform/TableFrame";
import type { CView } from "@/lib/games/casino/driver";

/** Points a card is worth to whoever holds it, so the best ones can be buried at the bottom of the pile where an opponent cannot reach them. */
const worthOf = (c: number) => (c === BIG ? 5 : c === LITTLE ? 4 : rankOf(c) === 1 ? 3 : suitOf(c) === 3 ? 2 : 1);

/** Your pile laid out face up, bottom to top. The card that made your last capture is locked on top; every other card can be moved. */
function PileEditor({ pile, lock, fresh, onOrder }: { pile: number[]; lock: number | null; fresh: number; onOrder: (order: number[]) => void }) {
  const topLocked = lock !== null && pile[pile.length - 1] === lock;
  const first = pile.length - fresh; // older cards below this are fixed
  const movable = topLocked ? pile.length - 1 : pile.length;
  // an order is sent for just the fresh cards
  const send = (o: number[]) => onOrder(o.slice(first));
  const move = (i: number, d: number) => { const j = i + d; if (j < first || j >= movable) return; const o = pile.slice(); [o[i], o[j]] = [o[j], o[i]]; send(o); };
  const bury = () => { const rest = pile.slice(first, movable).sort((a, b) => worthOf(b) - worthOf(a)); onOrder(topLocked ? [...rest, pile[pile.length - 1]] : rest); };
  return (
    <VStack align="stretch" spacing={2} p={2} borderRadius="lg" bg="blackAlpha.400" w="100%" role="group" aria-label="Arrange your pile">
      <Text fontSize="xs" color="gray.300">Bottom on the left, top on the right. Only the cards from your latest capture can be moved; {topLocked ? "the card that made it stays on top. " : ""}older cards are fixed. Whatever is on top can be built with by an opponent, so keep your points underneath.</Text>
      <Wrap spacing={2} justify="center">
        {pile.map((c, i) => (
          <VStack key={c} spacing={1}>
            <PlayingCard id={c} size="sm" />
            {i < first ? null : i < movable ? (
              <HStack spacing={1}>
                <Button size="xs" variant="ghost" color="white" aria-label={`Move ${cardLabel(c)} down the pile`} isDisabled={i === first} onClick={() => move(i, -1)}>◀</Button>
                <Button size="xs" variant="ghost" color="white" aria-label={`Move ${cardLabel(c)} up the pile`} isDisabled={i === movable - 1} onClick={() => move(i, 1)}>▶</Button>
              </HStack>
            ) : <Badge colorScheme="yellow">top</Badge>}
          </VStack>
        ))}
      </Wrap>
      <Button size="xs" colorScheme="green" alignSelf="center" isDisabled={movable - first < 2} onClick={bury}>Bury my points</Button>
    </VStack>
  );
}

function Table({ base, view, act, frame }: TableProps<CView, CAction>) {
  const me = view.me;
  const root = useRef<HTMLDivElement>(null);
  const idOf = (key: string) => Number(key.slice(1));
  useMotion(root, frame, {
    me,
    // someone else's card arrives from their hand; dealt cards come from the deck
    enter: (key, events) => {
      const id = idOf(key);
      const e = events.find(x => (x.card === id || (Array.isArray(x.cards) && (x.cards as number[]).includes(id))) && x.p !== undefined && x.p !== me);
      if (e) return `hand-${e.p}`;
      return events.some(x => x.type === "deal" || x.type === "redeal") ? "deck" : null;
    },
    // captured cards go to the pile of whoever took them
    exit: (key, events) => {
      const id = idOf(key);
      const e = events.find(x => x.type === "capture" && (x.card === id || (x.cards as number[] | undefined)?.includes(id)));
      return e ? `pile-${e.p}` : null;
    },
  });
  const myTurn = me !== null && base.actors.includes(me) && view.phase === "play";
  const [card, setCard] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const last = useRef(frame.id);

  useEffect(() => { if (frame.events.length && frame.events.every(e => e.type === "arrange")) return; setCard(null); setPicked([]); }, [frame.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showPile, setShowPile] = useState(false);
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
  const blocked = pos && card !== null && chosen.length ? blockedBuilds(pos, card, chosen) : [];
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

  /** The table cards a given hand card can capture or build with (alone or together with others). */
  const usableWith = (c: number): Set<number> => {
    const ids = new Set<number>();
    if (!pos) return ids;
    const pool = items.slice(0, 13);
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const sub = pool.filter((_, i) => (mask >> i) & 1);
      if (sub.length > 4) continue;
      if (isCapture(pos, c, sub) || buildOptions(pos, c, sub).length) sub.forEach(x => ids.add(x.id));
    }
    return ids;
  };
  /** Dropping a card on a table card: do the move if it is clear, otherwise pick both and let the buttons finish it. */
  const dropOn = (c: number, it: Item) => {
    if (!pos || !myTurn) return;
    if (isCapture(pos, c, [it])) { act({ type: "capture", card: c, take: [it.id] }); return; }
    const b = buildOptions(pos, c, [it]);
    if (b.length === 1) { act({ type: "build", card: c, take: [it.id], value: b[0] }); return; }
    setCard(c); setPicked([it.id]);
  };
  const trailNow = (c: number) => { if (pos && myTurn && trailAllowed(pos, c)) act({ type: "trail", card: c }); };
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

  useHotkeys({
    c: () => { if (card !== null && canCapture) act({ type: "capture", card, take: picked }); },
    t: () => { if (card !== null && canTrail) act({ type: "trail", card }); },
    b: () => { if (card !== null && buildValues.length === 1) act({ type: "build", card, take: picked, value: buildValues[0] }); },
    m: () => bestCapture(),
    Escape: () => { setPicked([]); setCard(null); },
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), () => { const h = view.hand[i]; if (myTurn && h !== undefined) { setCard(x => (x === h ? null : h)); setPicked([]); } }])),
  }, me !== null && view.phase === "play");
  const unitColour = (p: number) => SEAT_COLOURS[unitOf(view.rules, base.players.length, p) % SEAT_COLOURS.length];
  const owns = pos ? ownsBuild(pos) : false;

  return (
    <VStack ref={root} spacing={3} align="stretch" px={1} pt={1} pb={2} flex={1} justify="space-between" position="relative">
      <HStack spacing={3} overflowX="auto" align="start">
        {base.players.map((p, i) => i === me ? null : (
          <VStack key={i} spacing={1} minW="96px" p={2} borderRadius="lg" bg={view.turn === i ? "whiteAlpha.300" : "whiteAlpha.100"} border="2px solid" borderColor={view.turn === i && view.phase === "play" ? unitColour(i) : "transparent"}>
            <Text fontSize="xs" fontWeight={800} noOfLines={1}>{p.name}</Text>
            <Box data-anchor={`hand-${i}`}><CardBacks count={view.handCounts[i]} /></Box>
            <HStack spacing={1} fontSize="2xs" data-anchor={`pile-${i}`}>
              <Badge>{view.pileCounts[i]} won</Badge>
              {view.sweeps[view.units[i]] > 0 && <Badge colorScheme="yellow">{view.sweeps[view.units[i]]} sweep{view.sweeps[view.units[i]] === 1 ? "" : "s"}</Badge>}
            </HStack>
            {view.pileTops[i] !== null && <HStack spacing={1}><Text fontSize="2xs" color="gray.400">top</Text><PlayingCard id={view.pileTops[i]!} size="xs" mk={`c${view.pileTops[i]}`} /></HStack>}
          </VStack>
        ))}
        <VStack spacing={0} minW="64px" fontSize="xs" color="gray.300" data-anchor="deck"><Text>Deck {view.deckCount}</Text><Text>Deal {view.deal}</Text></VStack>
      </HStack>

      <DropZone id="table" accepts={d => typeof d === "number" && !!pos && myTurn && trailAllowed(pos, d)} onDrop={d => trailNow(d as number)} minH="120px" bg="#14532d" borderRadius="xl" p={3} border="2px solid #166534" role="group" aria-label="Table">
        {view.table.length === 0 && <Text color="whiteAlpha.600" textAlign="center" py={6}>The table is empty</Text>}
        <Wrap spacing={3} justify="center">
          {view.table.map(it => (
            <DropZone key={it.id} id={`t${it.id}`} accepts={d => typeof d === "number" && usableWith(d).has(it.id)} onDrop={d => dropOn(d as number, it)} position="relative" p="2px">
              {it.build ? (
                <VStack spacing={1} p={2} borderRadius="lg" bg="blackAlpha.300" border="2px solid" borderColor={picked.includes(it.id) ? "#fde047" : hint.has(it.id) ? "#38bdf8" : unitColour(it.owner)}
                  as="button" type="button" onClick={() => toggle(it.id)} aria-label={`Build of ${it.value} owned by ${base.players[it.owner]?.name}`} aria-pressed={picked.includes(it.id)}>
                  <HStack spacing="-26px">{it.cards.slice(0, 5).map(c => <PlayingCard key={c} id={c} size="xs" mk={`c${c}`} />)}</HStack>
                  <Badge colorScheme="yellow">Build {it.value}</Badge>
                  <Text fontSize="2xs" color="gray.300">{base.players[it.owner]?.name}</Text>
                </VStack>
              ) : (
                <PlayingCard id={it.cards[0]} size="md" mk={`c${it.cards[0]}`} selected={picked.includes(it.id)} glow={hint.has(it.id) && !picked.includes(it.id)} dim={card !== null && myTurn && !hint.has(it.id) && !picked.includes(it.id)} onClick={() => toggle(it.id)} />
              )}
            </DropZone>
          ))}
        </Wrap>
        {view.pileTops.some((t, i) => t !== null && i !== me && myTurn && card !== null && flag(view.rules, "stealPileTop")) && (
          <Wrap spacing={2} mt={2} justify="center">
            {view.pileTops.map((t, i) => t === null || i === me || unitOf(view.rules, base.players.length, i) === unitOf(view.rules, base.players.length, me ?? 0) ? null : (
              <HStack key={i} spacing={1}><Text fontSize="2xs" color="gray.300">{base.players[i].name}&apos;s pile</Text><PlayingCard id={t} size="sm" selected={picked.includes(PILE_ID + i)} glow={hint.has(PILE_ID + i)} onClick={() => toggle(PILE_ID + i)} /></HStack>
            ))}
          </Wrap>
        )}
      </DropZone>

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
          {myTurn && blocked.length > 0 && <Text textAlign="center" fontSize="xs" color="orange.200" role="status">There is already a build of {blocked.join(" and ")} on the table, and two builds of one number cannot stand. Capture it, or add to it with loose cards that make {blocked.length === 1 ? "that number" : "the number"}.</Text>}
          {myTurn && card === null && <Text textAlign="center" fontSize="sm" color="gray.300">Tap a card in your hand, then the table cards you want to take or build with. An opponent\u2019s pile card can only be added to a build.</Text>}
          {myTurn && card !== null && owns && <Text textAlign="center" fontSize="xs" color="orange.200">You own a build, so trailing is not allowed while you can capture or build.</Text>}
          <VStack spacing={2} data-anchor={`pile-${me}`} aria-label="Your pile">
            <HStack justify="center" spacing={3} fontSize="sm" color="gray.200">
              {view.myPile.length ? <PlayingCard id={view.myPile[view.myPile.length - 1]} size="lg" mk={`c${view.myPile[view.myPile.length - 1]}`} label={`Top of your pile: ${cardLabel(view.myPile[view.myPile.length - 1])}`} />
                : <Box w="72px" h="102px" borderRadius="8px" border="2px dashed" borderColor="whiteAlpha.400" aria-hidden />}
              <VStack spacing={1} align="start">
                <Text fontWeight={800}>My pile: {view.pileCounts[me]} card{view.pileCounts[me] === 1 ? "" : "s"}</Text>
                <Text fontSize="xs" color="gray.400">{view.rules.stealPileTop ? "The top card can be built with by opponents" : "Face up. Your latest capture can be rearranged"}</Text>
                <Button size="xs" variant="outline" color="white" isDisabled={view.pileFresh < 3} aria-expanded={showPile} onClick={() => setShowPile(x => !x)}>{showPile ? "Close pile" : "See and arrange"}</Button>
              </VStack>
            </HStack>
            {showPile && <PileEditor pile={view.myPile} lock={view.pileLock} fresh={view.pileFresh} onOrder={order => act({ type: "arrange", order })} />}
          </VStack>
          <HStack justify="center" spacing={2} wrap="wrap" aria-label="Your hand" role="group" onKeyDown={roveKeys}>
            {view.hand.map(c => <Draggable key={c} id={`hand${c}`} data={c} label={cardLabel(c)} disabled={!myTurn} onStart={() => { setCard(c); setPicked([]); }}><PlayingCard id={c} mk={`c${c}`} size="lg" selected={card === c} dim={!myTurn} onClick={() => { if (!myTurn) return; setCard(x => (x === c ? null : c)); setPicked([]); }} /></Draggable>)}
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
  tagline: "The South African card game of capturing, building and trailing, with the top card of every pile up for grabs. Every rule is yours to set.",
  keys: [{ key: "1 – 9", does: "Pick the card in that position" }, { key: "C", does: "Capture" }, { key: "B", does: "Build (when there is one choice)" }, { key: "T", does: "Trail the card" }, { key: "M", does: "Pick the most you can take" }, { key: "Esc", does: "Clear" }],
  howTo: [
    { title: "Goal", text: "Win cards and score points for the Mummy (10 of diamonds, 2), most cards (2), most spades (2), the Spy Two (2 of spades, 1) and each ace (1): 11 points a deal. First to 11 wins (7 when three or four play alone)." },
    { title: "Capture", text: "Play a card and take table cards of the same rank, or cards that add up to it (a 9 takes 4 + 5). You can take several sets at once." },
    { title: "Build", text: "Combine your card with table cards into a build of a higher value, such as a 4 and a 5 as a 9, if you hold a 9. Opponents can capture your build with a 9, or add to it." },
    { title: "Trail", text: "If you cannot or do not want to capture or build, put a card on the table." },
    { title: "Steal", text: "Capture piles lie face up with the lowest card on top. That top card counts as a table card: you can capture it or build with it." },
    { title: "Sweep", text: "Clear the whole table with a capture. Sweeps score only if you switch them on." },
    { title: "Your rules", text: "Ace as 1 or 14, picture cards counting 11 to 13 or pairing only, whether you may build, take from an opponent's pile, must capture, every point value, the target and teams: all in Rules." },
  ],
};
export default gameModule;
