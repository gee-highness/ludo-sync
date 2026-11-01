"use client";

import { Badge, Box, Button, Flex, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { turnLine } from "@/lib/skipbo/describe";
import { WILD, type Action, type Card, type GameEvent, type Source } from "@/lib/skipbo/types";
import { hintFor, type PlayerView, type TableView } from "@/lib/skipbo/view";
import { CardFace, Slot, type CardSize } from "./CardFace";
import { RoundOverlay } from "./RoundOverlay";

export interface Frame { id: number; events: GameEvent[] }

interface Props {
  view: TableView;
  act: (a: Action) => boolean;
  frame: Frame;
  log: string[];
  /** Why the host refused the last move (online). */
  rejected?: string;
  title: string;
  onExit: () => void;
  headerExtra?: React.ReactNode;
  /** Shown under the table: reactions, chat and so on. */
  footer?: React.ReactNode;
  note?: string;
  onRematch?: () => void;
  rematchLabel?: string;
  waitingText?: string;
  streakText?: string;
  /** Names of people who are away, by player index. */
  away?: ReadonlySet<number>;
}

const same = (a: Source | null, b: Source | null) =>
  !!a && !!b && a.from === b.from && (a.from === "hand" ? a.index === (b as typeof a).index : a.from === "discard" ? a.pile === (b as typeof a).pile : true);

const useSizes = (): { hand: CardSize; pile: CardSize; side: CardSize } => {
  const [w, setW] = useState(390);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  if (w >= 900) return { hand: "lg", pile: "lg", side: "md" };
  if (w >= 420) return { hand: "md", pile: "lg", side: "md" };
  return { hand: "md", pile: "md", side: "sm" };
};

const hintText = (v: TableView, a: Action): string => {
  const me = v.players[v.you!];
  if (a.type === "discard") return `Discard your ${me.hand?.[a.index] === WILD ? "Skip-Bo" : me.hand?.[a.index]} to end your turn`;
  if (a.type === "endTurn") return "You have no cards left in your hand: end your turn";
  if (a.type !== "play") return "";
  const card = a.source.from === "hand" ? me.hand?.[a.source.index] : a.source.from === "stock" ? me.stockTop : me.discards[a.source.pile].at(-1);
  const from = a.source.from === "stock" ? "from your stock pile" : a.source.from === "discard" ? "from a discard pile" : "from your hand";
  return `Play ${card === WILD ? "a Skip-Bo" : card} ${from} on pile ${a.to + 1}`;
};

/** The whole table: other players across the top, the shared piles in the middle, and your own cards at the bottom. */
export function Table({ view, act, frame, log, rejected, title, onExit, headerExtra, footer, note, onRematch, rematchLabel, waitingText, streakText, away }: Props) {
  const sizes = useSizes();
  const me = view.you !== null ? view.players[view.you] : null;
  const myTurn = view.phase === "play" && view.you !== null && view.turn === view.you;
  const [selected, setSelected] = useState<Source | null>(null);
  const [hint, setHint] = useState<Action | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; tone: "good" | "info" } | null>(null);
  const [popped, setPopped] = useState<{ pile: number; id: number } | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const bannerId = useRef(0);
  const [showLog, setShowLog] = useState(false);

  const say = useCallback((text: string, tone: "good" | "info" = "info") => {
    const id = ++bannerId.current;
    setBanner({ id, text, tone });
    setTimeout(() => setBanner(b => (b?.id === id ? null : b)), 1800);
  }, []);

  // what just happened: sound, the pile that took a card, and a word about the big moments
  useEffect(() => {
    if (frame.id === 0) return;
    for (const e of frame.events) {
      if (e.type === "deal") sound.play("shuffle");
      else if (e.type === "play") { sound.play("card"); setPopped({ pile: e.to, id: frame.id }); }
      else if (e.type === "discard") sound.play("flip");
      else if (e.type === "pileDone") { sound.play("home"); say("Pile complete!", "good"); }
      else if (e.type === "draw" && e.bonus) { sound.play("bonus"); say(e.player === view.you ? "All five played! Draw five more" : `${view.players[e.player]?.name} plays on`, "good"); }
      else if (e.type === "reshuffle") { sound.play("shuffle"); say("Shuffling the finished piles"); }
      else if (e.type === "turn" && e.player === view.you) { sound.play("turn"); say("Your turn"); }
      else if (e.type === "roundEnd" || e.type === "gameOver") sound.duck(2.5);
    }
    // only when a new frame arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.id]);

  // a new position clears the picked-up card and any hint
  useEffect(() => { setSelected(null); setHint(null); }, [view.seq, view.turn]);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 6000);
    return () => clearTimeout(t);
  }, [hint]);
  useEffect(() => { if (rejected) say("That move was not allowed"); }, [rejected, say]);

  const cardOf = useCallback((src: Source | null): Card | undefined => {
    if (!src || !me) return undefined;
    if (src.from === "hand") return me.hand?.[src.index];
    if (src.from === "stock") return me.stockTop ?? undefined;
    return me.discards[src.pile].at(-1);
  }, [me]);

  const fitsOn = useCallback((card: Card | undefined, pile: number) => card !== undefined && (card === WILD || card === view.building[pile].length + 1), [view.building]);
  const targets = useCallback((card: Card | undefined): number[] => [0, 1, 2, 3].filter(i => fitsOn(card, i)), [fitsOn]);
  const picked = cardOf(selected);

  const tryPlay = (src: Source, to: number): boolean => {
    if (!myTurn || !fitsOn(cardOf(src), to)) { sound.play("error"); return false; }
    return act({ type: "play", source: src, to });
  };

  const onHand = (index: number) => {
    if (!myTurn) return;
    const src: Source = { from: "hand", index };
    if (same(selected, src)) {
      // a second tap plays the card if there is only one sensible place for it
      const t = [...new Set(targets(cardOf(src)).map(i => view.building[i].length))];
      if (t.length === 1) tryPlay(src, targets(cardOf(src))[0]);
      else setSelected(null);
    } else setSelected(src);
  };
  const onStock = () => {
    if (!myTurn || me?.stockTop == null) return;
    const src: Source = { from: "stock" };
    if (same(selected, src)) {
      const t = targets(me.stockTop);
      if (t.length) tryPlay(src, t[0]); else setSelected(null);
    } else setSelected(src);
  };
  const onDiscard = (pile: number) => {
    if (!myTurn || !me) return;
    if (selected?.from === "hand") { act({ type: "discard", index: selected.index, pile }); return; }
    if (!me.discards[pile].length) return;
    const src: Source = { from: "discard", pile };
    setSelected(same(selected, src) ? null : src);
  };
  const onBuilding = (pile: number) => { if (selected) tryPlay(selected, pile); };

  // drag and drop on a computer; touch screens use tap
  const dragStart = (src: Source) => (e: React.DragEvent) => {
    if (!myTurn) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", JSON.stringify(src));
    e.dataTransfer.effectAllowed = "move";
    setSelected(src);
  };
  const readSrc = (e: React.DragEvent): Source | null => {
    try { const s = JSON.parse(e.dataTransfer.getData("text/plain")); return s && typeof s.from === "string" ? (s as Source) : null; } catch { return null; }
  };
  const dropOn = (kind: "build" | "discard", i: number) => ({
    onDragOver: (e: React.DragEvent) => { if (myTurn) { e.preventDefault(); setDropOver(`${kind}${i}`); } },
    onDragLeave: () => setDropOver(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setDropOver(null);
      const s = readSrc(e);
      if (!s) return;
      if (kind === "build") tryPlay(s, i);
      else if (s.from === "hand") act({ type: "discard", index: s.index, pile: i });
    },
  });

  const wantHint = () => {
    const a = hintFor(view);
    if (a) { setHint(a); setSelected(null); } else say("Nothing to suggest right now");
  };
  const hintSrc: Source | null = hint?.type === "play" ? hint.source : hint?.type === "discard" ? { from: "hand", index: hint.index } : null;
  const hintTarget = hint?.type === "play" ? `build${hint.to}` : hint?.type === "discard" ? `discard${hint.pile}` : null;

  const others = useMemo(() => view.players.map((p, i) => ({ p, i })).filter(x => x.i !== view.you), [view.players, view.you]);
  const mustEnd = myTurn && me !== null && me.handCount === 0;
  const status = (() => {
    if (view.phase !== "play") return turnLine(view);
    if (view.you === null) return `${view.players[view.turn].name} is playing`;
    if (myTurn) return me!.handCount === 0 ? "You have no cards in hand: play from your stock or discards, or end your turn" : picked !== undefined ? (targets(picked).length ? "Tap a glowing pile to play it" : "That card does not fit yet. Tap a discard pile to discard it, or pick another") : "Play onto the middle piles, then discard one card to end your turn";
    return `${view.players[view.turn].name} is ${view.players[view.turn].kind === "bot" ? "thinking…" : "playing…"}`;
  })();

  return (
    <Box minH="100dvh" color="white" position="relative" overflow="hidden" bg="radial-gradient(ellipse at 50% 30%, #1f7a4d 0%, #14573a 55%, #0c3a27 100%)">
    <Flex direction="column" minH="100dvh" maxW="900px" mx="auto" position="relative"
      pt="max(8px, env(safe-area-inset-top))" pb="max(10px, env(safe-area-inset-bottom))" px={2}>
      <Box position="absolute" inset={0} opacity={0.16} pointerEvents="none" bgImage="repeating-linear-gradient(45deg, rgba(255,255,255,.06) 0 2px, transparent 2px 14px)" />

      <HStack position="relative" zIndex={2} spacing={2} mb={2}>
        <IconButton aria-label="Leave table" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" size="sm" onClick={onExit} />
        <VStack spacing={0} align="start" flex={1} minW={0}>
          <Text fontWeight={800} noOfLines={1}>{title}</Text>
          <Text fontSize="xs" color="whiteAlpha.800">
            {view.rules.tournament ? `Round ${view.round} · first to ${view.rules.target}` : "First to empty their stock wins"}{streakText ? ` · ${streakText}` : ""}
          </Text>
        </VStack>
        {note && <Badge colorScheme="orange">{note}</Badge>}
        {headerExtra}
        <Button size="sm" variant="outline" color="white" onClick={() => setShowLog(v => !v)} aria-pressed={showLog}>Log</Button>
        <Button size="sm" colorScheme="yellow" onClick={wantHint} isDisabled={!myTurn} aria-label="Show a hint">Hint</Button>
      </HStack>

      {/* the other players */}
      <Flex position="relative" zIndex={1} wrap="wrap" gap={2} justify="center" mb={2}>
        {others.map(({ p, i }) => <Opponent key={i} p={p} active={view.phase === "play" && view.turn === i} dealer={view.dealer === i} tournament={view.rules.tournament} away={away?.has(i)} size={sizes.side} />)}
      </Flex>

      {/* the middle */}
      <VStack position="relative" zIndex={1} spacing={3} py={2} borderRadius="2xl" bg="rgba(0,0,0,.2)" border="1px solid rgba(255,255,255,.12)" mb={2}>
        <HStack spacing={sizes.pile === "lg" ? 4 : 2.5} justify="center" wrap="wrap" align="flex-start">
          <VStack spacing={1}>
            <Box position="relative" aria-label={`Draw pile, ${view.drawCount} cards`}>
              {view.drawCount > 0 ? <CardFace faceDown size={sizes.pile} /> : <Slot size={sizes.pile} label="∅" />}
            </Box>
            <Text fontSize="xs" color="whiteAlpha.800">Draw · {view.drawCount}</Text>
          </VStack>
          <Box w="2px" alignSelf="stretch" bg="whiteAlpha.200" />
          {view.building.map((pile, i) => {
            const top = pile.at(-1);
            const hot = !!selected && targets(picked).includes(i);
            const hinted = hintTarget === `build${i}`;
            const over = dropOver === `build${i}`;
            return (
              <VStack key={i} spacing={1}>
                <Box role="button" tabIndex={myTurn && selected ? 0 : -1} aria-label={`Pile ${i + 1}, ${pile.length ? `at ${pile.length}` : "empty, needs a 1"}`}
                  cursor={hot ? "pointer" : "default"} onClick={() => onBuilding(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onBuilding(i); }} {...dropOn("build", i)}
                  borderRadius="10px" transition="transform .15s" transform={over ? "scale(1.07)" : undefined}
                  sx={popped?.pile === i && frame.id === popped.id ? { animation: "sbPop .35s ease-out", "@keyframes sbPop": { "0%": { transform: "scale(.82) translateY(-14px)", opacity: 0.4 }, "100%": { transform: "none", opacity: 1 } } } : undefined}>
                  {top !== undefined ? <CardFace value={top} size={sizes.pile} asValue={pile.length} glow={hot || hinted} />
                    : <Slot size={sizes.pile} hot={hot || hinted} label="1" />}
                </Box>
                <Text fontSize="xs" color="whiteAlpha.800">{pile.length ? `${pile.length} → ${pile.length + 1}` : "needs 1"}</Text>
              </VStack>
            );
          })}
        </HStack>
        <Text fontSize="sm" textAlign="center" px={3} minH="40px" aria-live="polite" color={rejected ? "orange.200" : "whiteAlpha.900"}>
          {hint ? <b>{hintText(view, hint)}</b> : status}
        </Text>
      </VStack>

      {/* you */}
      {me && view.you !== null && (
        <VStack position="relative" zIndex={1} spacing={2} p={2} mt="auto" borderRadius="2xl" bg={myTurn ? "rgba(253,224,71,.12)" : "rgba(0,0,0,.18)"} border="2px solid" borderColor={myTurn ? "#fde047" : "rgba(255,255,255,.14)"} transition="all .2s">
          <HStack w="100%" justify="space-between" px={1}>
            <Text fontWeight={800} noOfLines={1}>{me.name}{myTurn ? " · your turn" : ""}</Text>
            {view.rules.tournament && <Badge colorScheme="yellow">{me.score} pts</Badge>}
          </HStack>
          <HStack spacing={3} align="flex-end" justify="center" wrap="wrap">
            <VStack spacing={1}>
              <Box role="button" tabIndex={myTurn ? 0 : -1} aria-label={`Your stock pile, top card ${me.stockTop === WILD ? "Skip-Bo" : me.stockTop}, ${me.stockCount} cards`} cursor={myTurn ? "pointer" : "default"}
                onClick={onStock} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onStock(); }} draggable={myTurn && me.stockTop !== null} onDragStart={dragStart({ from: "stock" })}>
                {me.stockTop !== null && <CardFace value={me.stockTop} size={sizes.pile} selected={same(selected, { from: "stock" })} glow={same(hintSrc, { from: "stock" })} />}
              </Box>
              <Text fontSize="xs" color="#fde047" fontWeight={800}>Stock · {me.stockCount}</Text>
            </VStack>
            <Box w="2px" h="70px" bg="whiteAlpha.200" />
            <HStack spacing={2} align="flex-end">
              {me.discards.map((d, i) => {
                const top = d.at(-1);
                const dropHot = selected?.from === "hand";
                return (
                  <VStack key={i} spacing={1}>
                    <Box role="button" tabIndex={myTurn ? 0 : -1} aria-label={`Discard pile ${i + 1}${top !== undefined ? `, top card ${top === WILD ? "Skip-Bo" : top}, ${d.length} cards` : ", empty"}`}
                      cursor={myTurn ? "pointer" : "default"} onClick={() => onDiscard(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onDiscard(i); }}
                      draggable={myTurn && top !== undefined} onDragStart={dragStart({ from: "discard", pile: i })} {...dropOn("discard", i)}
                      borderRadius="8px" transform={dropOver === `discard${i}` ? "scale(1.08)" : undefined} transition="transform .15s">
                      {top !== undefined
                        ? <CardFace value={top} size={sizes.side} selected={same(selected, { from: "discard", pile: i })} glow={same(hintSrc, { from: "discard", pile: i }) || hintTarget === `discard${i}`} count={d.length} />
                        : <Slot size={sizes.side} hot={(myTurn && dropHot) || hintTarget === `discard${i}`}>{myTurn && dropHot ? "+" : ""}</Slot>}
                    </Box>
                  </VStack>
                );
              })}
            </HStack>
          </HStack>
          <Text fontSize="2xs" color="whiteAlpha.700" mt={-1}>Discard piles: tap a hand card, then a pile, to end your turn</Text>
          <HStack spacing={sizes.hand === "lg" ? 3 : 2} justify="center" minH={`${Math.round({ xs: 30, sm: 44, md: 56, lg: 68 }[sizes.hand] * 1.42) + 14}px`} pt="10px" w="100%">
            {(me.hand ?? []).map((c, i) => (
              <Box key={`${i}-${c}`} role="button" tabIndex={myTurn ? 0 : -1} aria-label={`Hand card ${i + 1}: ${c === WILD ? "Skip-Bo" : c}`} cursor={myTurn ? "pointer" : "default"} onClick={() => onHand(i)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onHand(i); }} draggable={myTurn} onDragStart={dragStart({ from: "hand", index: i })}
                sx={{ animation: "sbDeal .3s ease-out backwards", animationDelay: `${i * 40}ms`, "@keyframes sbDeal": { from: { transform: "translateY(26px) scale(.8)", opacity: 0 }, to: { transform: "none", opacity: 1 } } }}>
                <CardFace value={c} size={sizes.hand} selected={same(selected, { from: "hand", index: i })} glow={same(hintSrc, { from: "hand", index: i })} dim={!myTurn} />
              </Box>
            ))}
            {me.hand?.length === 0 && <Text color="whiteAlpha.700" fontSize="sm">{me.handCount === 0 ? "Your hand is empty" : ""}</Text>}
          </HStack>
          {mustEnd && <Button colorScheme="yellow" size="sm" onClick={() => act({ type: "endTurn" })}>End turn</Button>}
        </VStack>
      )}
      {view.you === null && <Text textAlign="center" color="whiteAlpha.800">You are watching this game.</Text>}

      {footer && <Box position="relative" zIndex={1} mt={2}>{footer}</Box>}

      {showLog && (
        <Box position="absolute" zIndex={5} top="52px" right={2} w="min(320px, 92vw)" maxH="50dvh" overflowY="auto" bg="rgba(8,20,14,.95)" borderRadius="xl" p={3} border="1px solid rgba(255,255,255,.2)" role="log" aria-label="Game log">
          {log.length === 0 ? <Text fontSize="sm" color="whiteAlpha.700">Nothing has happened yet.</Text> : [...log].reverse().map((l, i) => <Text key={i} fontSize="sm" py="2px" color={i === 0 ? "white" : "whiteAlpha.700"}>{l}</Text>)}
        </Box>
      )}

      {banner && (
        <Box key={banner.id} position="absolute" zIndex={6} top="30%" left="50%" transform="translateX(-50%)" px={5} py={2} borderRadius="full" fontWeight={900} fontSize="lg" pointerEvents="none"
          bg={banner.tone === "good" ? "linear-gradient(180deg,#fde047,#f59e0b)" : "rgba(15,23,42,.92)"} color={banner.tone === "good" ? "#1f2937" : "white"} boxShadow="0 8px 24px rgba(0,0,0,.5)"
          sx={{ animation: "sbBanner 1.8s ease-out forwards", "@keyframes sbBanner": { "0%": { opacity: 0, transform: "translate(-50%, 12px) scale(.9)" }, "12%": { opacity: 1, transform: "translate(-50%,0) scale(1)" }, "80%": { opacity: 1 }, "100%": { opacity: 0, transform: "translate(-50%,-8px)" } } }}>
          {banner.text}
        </Box>
      )}

      {(view.phase === "roundOver" || view.phase === "over") && (
        <RoundOverlay view={view} act={act} onExit={onExit} onRematch={onRematch} rematchLabel={rematchLabel} waitingText={waitingText} />
      )}
    </Flex>
    </Box>
  );
}

function Opponent({ p, active, dealer, tournament, away, size }: { p: PlayerView; active: boolean; dealer: boolean; tournament: boolean; away?: boolean; size: CardSize }) {
  return (
    <VStack spacing={1} p={2} borderRadius="xl" flex="1 1 150px" maxW="230px" minW="140px" bg={active ? "rgba(253,224,71,.14)" : "rgba(0,0,0,.2)"} border="2px solid" borderColor={active ? "#fde047" : "rgba(255,255,255,.12)"}
      transition="all .2s" opacity={away ? 0.6 : 1} aria-label={`${p.name}${active ? ", their turn" : ""}`}>
      <HStack w="100%" justify="space-between" spacing={1}>
        <Text fontWeight={800} fontSize="sm" noOfLines={1}>{p.name}</Text>
        <HStack spacing={1}>
          {dealer && <Badge fontSize="2xs">Dealer</Badge>}
          {p.kind === "bot" && <Badge fontSize="2xs" colorScheme="purple">{p.level ?? "bot"}</Badge>}
          {away && <Badge fontSize="2xs" colorScheme="orange">Away</Badge>}
        </HStack>
      </HStack>
      <HStack spacing={3} align="center" justify="center" w="100%">
        <VStack spacing={0.5}>
          {p.stockTop !== null ? <CardFace value={p.stockTop} size={size} /> : <Slot size={size} label="✓" />}
          <Text fontSize="2xs" color="#fde047" fontWeight={800}>Stock {p.stockCount}</Text>
        </VStack>
        <VStack spacing={0.5} align="flex-start">
          <Text fontSize="xs" color="whiteAlpha.800">Hand {p.handCount}</Text>
          {tournament && <Text fontSize="xs" color="#fde047" fontWeight={800}>{p.score} pts</Text>}
        </VStack>
      </HStack>
      <HStack spacing="3px" align="flex-end" justify="center" aria-label={`${p.name}'s discard piles`}>
        {p.discards.map((d, i) => d.length ? <CardFace key={i} value={d.at(-1)!} size="xs" count={d.length} /> : <Slot key={i} size="xs" />)}
      </HStack>
    </VStack>
  );
}
