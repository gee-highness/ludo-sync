"use client";

import { Badge, Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { pick } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { memory, type MAction, type MView } from "@/lib/games/memory/driver";
import { SEAT_COLOURS } from "../../platform/TableFrame";

const EMOJI: Record<string, string[]> = {
  animals: "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦆🦉🦋🐢🐙🐬🐳🦒🦓🐘🦔🐝🐞🦀".split(/(?=\p{Extended_Pictographic})/u),
  food: "🍎🍐🍊🍋🍌🍉🍇🍓🍒🍑🥭🍍🥝🍅🥕🌽🥦🍞🧀🍕🍔🍟🌭🍩🍪🎂🍫🍿🥨🥐🍦🍰".split(/(?=\p{Extended_Pictographic})/u),
  nature: "🌲🌳🌴🌵🌷🌹🌻🌼🍀🍁🍄🌾🌈☀️🌙⭐⚡🔥💧❄️🌊🌋🏔️🌸🪴🌿🍂🪨🐚🌍☁️🌪️".split(/(?=\p{Extended_Pictographic})/u),
  travel: "🚗🚕🚌🚓🚑🚒🚜🚲🛵🚂✈️🚀🚁⛵🚢🛶🏍️🚡🛴🚃🚤🛸🏰🗽🗼🎡🎢⛺🏖️🏝️🌉🗻".split(/(?=\p{Extended_Pictographic})/u),
};
const SHAPES = ["●", "■", "▲", "◆", "★", "♥", "✚", "⬟"];
const SHAPE_COLOURS = ["#ef4444", "#eab308", "#22c55e", "#3b82f6"];

const symbolFor = (theme: string, i: number): { text: string; colour?: string } => {
  if (theme === "numbers") return { text: String(i + 1) };
  if (theme === "shapes") return { text: SHAPES[i % SHAPES.length], colour: SHAPE_COLOURS[Math.floor(i / SHAPES.length) % 4] };
  const list = EMOJI[theme] ?? EMOJI.animals;
  return { text: list[i % list.length] };
};

function Table({ base, view, act, frame }: TableProps<MView, MAction>) {
  const me = base.you;
  const myTurn = me !== null && view.turn === me && view.phase === "play";
  const theme = pick(view.rules, "theme");
  const total = view.faces.length;
  const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(total * 0.75))));
  const last = useRef(frame.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (frame.id === last.current) return;
    last.current = frame.id;
    for (const e of frame.events) {
      if (e.type === "flip") sound.play("flip");
      else if (e.type === "match") { sound.play("bonus"); buzz("bonus"); }
      else if (e.type === "miss") sound.play("error");
    }
  }, [frame]);

  // after a miss the cards are turned back by the person whose turn it was (everyone sees it); the first request wins
  useEffect(() => {
    if (view.phase === "mismatch" && (me === view.turn || base.players[view.turn]?.kind === "bot" && me === 0)) {
      timer.current = setTimeout(() => act({ type: "continue" }), 1300);
      return () => { if (timer.current) clearTimeout(timer.current); };
    }
    if (view.phase === "peek" && me === 0) {
      const t = setTimeout(() => act({ type: "start" }), 3500);
      return () => clearTimeout(t);
    }
  }, [view.phase, view.turn, view.flipped.length, me, act, base.players]);

  const size = Math.min(76, Math.floor((Math.min(440, typeof window === "undefined" ? 380 : window.innerWidth - 16) - 8 * cols) / cols));

  return (
    <VStack spacing={3} flex={1} justify="center" pt={1}>
      <HStack spacing={2} fontSize="sm"><Badge colorScheme="purple">{view.found} of {view.total} found</Badge>{view.streak > 1 && <Badge colorScheme="orange">{view.streak} in a row</Badge>}</HStack>
      <Box display="grid" gridTemplateColumns={`repeat(${cols}, ${size}px)`} gap="8px" justifyContent="center" role="grid" aria-label="Cards">
        {view.faces.map((f, i) => {
          const up = f >= 0;
          const sym = up ? symbolFor(theme, f) : null;
          const matched = view.matched[i];
          return (
            <Box key={i} role="gridcell" as="button" type="button" w={`${size}px`} h={`${size * 1.15}px`} position="relative" style={{ perspective: "600px" }} disabled={!myTurn || up}
              aria-label={up ? `card ${i + 1}: ${sym!.text}` : `card ${i + 1}, face down`} onClick={() => act({ type: "flip", pos: i })} cursor={myTurn && !up ? "pointer" : "default"} _focusVisible={{ outline: "3px solid #fde047" }}>
              <Box position="absolute" inset={0} style={{ transformStyle: "preserve-3d", transition: "transform .35s", transform: up ? "rotateY(180deg)" : "none" }}>
                <Box position="absolute" inset={0} borderRadius="10px" style={{ backfaceVisibility: "hidden" }} bg="repeating-linear-gradient(45deg,#4338ca,#4338ca 6px,#6366f1 6px,#6366f1 12px)" border="3px solid #e0e7ff" boxShadow="0 2px 5px rgba(0,0,0,.5)" />
                <Box position="absolute" inset={0} borderRadius="10px" display="grid" placeItems="center" fontSize={`${size * 0.5}px`} lineHeight={1} fontWeight={900}
                  bg={matched ? "#bbf7d0" : "#f8fafc"} color={sym?.colour ?? "#0f172a"} border="3px solid" borderColor={matched ? "#16a34a" : "#cbd5e1"} style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }} aria-hidden>{sym?.text}</Box>
              </Box>
            </Box>
          );
        })}
      </Box>
      <HStack spacing={2} wrap="wrap" justify="center">
        {base.players.map((p, i) => <Badge key={i} fontSize="xs" colorScheme="gray" borderRadius="full" px={2} border="2px solid" borderColor={view.turn === i && view.phase !== "over" ? SEAT_COLOURS[i % SEAT_COLOURS.length] : "transparent"}>{p.name}: {view.sets[i]} found · ★ {view.scores[i]}</Badge>)}
      </HStack>
      {view.phase === "peek" && <Text color="yellow.200" fontWeight={800}>Memorise the cards!</Text>}
    </VStack>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: memory as never,
  Table: Table as never,
  accent: "#6366f1",
  icon: "🧠",
  tagline: "Flip cards and find the matches. Play solo or with friends; choose the pictures, pairs or triples, peeking, and scoring.",
  howTo: [
    { title: "Flip", text: "On your turn flip two cards (or three or four when matches are bigger)." },
    { title: "Match", text: "If they match you keep them, score, and (by default) go again." },
    { title: "Miss", text: "If they do not match they turn back and the next player goes. Remember where things are!" },
    { title: "Win", text: "When every match is found the player with the most points wins." },
    { title: "Your rules", text: "Number of sets, cards per match, pictures, peeking, points, streak bonuses and penalties are all in Rules." },
  ],
};
export default gameModule;
