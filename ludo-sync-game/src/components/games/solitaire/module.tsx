"use client";

import { Badge, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { flag, pick } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { solitaire, type BoardView, type SolView } from "@/lib/games/solitaire/driver";
import { applyMove, foundationIndex, variantOf, type Board, type Card, type Pile, type SAction } from "@/lib/games/solitaire/engine";
import { PlayingCard } from "../../platform/PlayingCard";
import { SEAT_COLOURS } from "../../platform/TableFrame";

const asBoard = (b: BoardView): Board => ({ ...b, hist: [], sigs: [] });
const same = (a: Pile | null, b: Pile) => !!a && a.k === b.k && a.i === b.i;

function Table({ base, view, act, frame }: TableProps<SolView, SAction>) {
  const rules = view.rules;
  const variant = variantOf(rules);
  const b = view.board;
  const [sel, setSel] = useState<{ from: Pile; n: number } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [auto, setAuto] = useState(false);
  const last = useRef(frame.id);
  const cols = b ? b.tab.length : 7;
  const gap = 4;
  // size the cards for the widest row: the columns, or in FreeCell the free cells and foundations together
  const slots = Math.max(cols, b && variant === "freecell" ? b.cells.length + 4 + 1 : 0);
  const width = Math.max(30, Math.min(58, Math.floor(((typeof window === "undefined" ? 380 : Math.min(window.innerWidth, 480)) - 12 - gap * (slots - 1)) / slots)));
  const full = width * 1.42;
  const live = !!b && !b.done && !view.over;

  useEffect(() => { setSel(null); setShowHint(false); }, [frame.id]);
  useEffect(() => {
    if (frame.id === last.current) return;
    last.current = frame.id;
    for (const e of frame.events) if (e.p === base.you) { if (e.type === "move") { sound.play("card"); buzz("tap"); } else if (e.type === "draw") sound.play("flip"); else if (e.type === "won") sound.play("win"); }
  }, [frame, base.you]);

  const local = useMemo(() => (b ? asBoard(b) : null), [b]);
  const canMove = (from: Pile, n: number, to: Pile) => !!local && !!applyMove(local, rules, { type: "move", from, n, to });

  // moves for auto-complete: cards that can go straight to a foundation, one after another
  const autoPlan = useMemo(() => {
    if (!local || variant === "spider" || !live) return [] as SAction[];
    if (local.tab.some(p => p.some(c => !c.up)) || local.stock.length) return [];
    let cur = local;
    const plan: SAction[] = [];
    for (let guard = 0; guard < 60; guard++) {
      let moved = false;
      const sources: Pile[] = [...cur.tab.map((_, i) => ({ k: "t" as const, i })), { k: "w" as const, i: 0 }, ...cur.cells.map((_, i) => ({ k: "c" as const, i }))];
      for (const from of sources) {
        const card = from.k === "t" ? cur.tab[from.i].at(-1) : from.k === "w" ? cur.waste.at(-1) : cur.cells[from.i];
        if (!card || card.id < 0) continue;
        const act1: SAction = { type: "move", from, n: 1, to: { k: "f", i: foundationIndex(card) } };
        const nb = applyMove(cur, rules, act1 as Extract<SAction, { type: "move" }>);
        if (nb) { plan.push(act1); cur = nb; moved = true; break; }
      }
      if (!moved) break;
    }
    return plan;
  }, [local, rules, variant, live]);

  useEffect(() => {
    if (!auto || !live) return;
    if (!autoPlan.length) { setAuto(false); return; }
    const t = setTimeout(() => act(autoPlan[0]), 140);
    return () => clearTimeout(t);
  }, [auto, autoPlan, live, act]);

  if (!b || !local) return <Text p={4} color="gray.300">Watching the race…</Text>;

  const tryDest = (to: Pile) => {
    if (!sel || !live) return;
    if (canMove(sel.from, sel.n, to)) { act({ type: "move", from: sel.from, n: sel.n, to }); setSel(null); }
    else { sound.play("error"); setSel(null); }
  };
  const pickSource = (from: Pile, n: number) => {
    if (!live) return;
    if (sel && same(sel.from, from) && sel.n === n) { setSel(null); return; }
    setSel({ from, n });
  };
  const home = (from: Pile, card: Card) => {
    if (!live || variant === "spider" || card.id < 0) return;
    const to: Pile = { k: "f", i: foundationIndex(card) };
    if (canMove(from, 1, to)) act({ type: "move", from, n: 1, to });
  };

  const hint = showHint && view.hint ? view.hint : null;
  const hintFrom = hint?.move?.from ?? null, hintTo = hint?.move?.to ?? null;

  const slot = (key: number, pile: Pile, children?: React.ReactNode, empty?: string) => (
    <Box key={key} as="button" type="button" w={`${width}px`} minH={`${full}px`} borderRadius="8px" border="2px dashed" borderColor={same(hintTo, pile) ? "#38bdf8" : "whiteAlpha.300"} bg="blackAlpha.200" position="relative" onClick={() => tryDest(pile)} aria-label={`${pile.k === "f" ? "foundation" : pile.k === "c" ? "free cell" : "column"} ${pile.i + 1}`} disabled={!live}>
      {empty && !children && <Box position="absolute" inset={0} display="grid" placeItems="center" color="whiteAlpha.400" fontSize={`${width * 0.45}px`}>{empty}</Box>}
      {children}
    </Box>
  );

  const found = b.found.length ? b.found : [];
  const wasteShown = pick(rules, "draw") === "3" ? b.waste.slice(-3) : b.waste.slice(-1);

  return (
    <VStack spacing={2} align="stretch" px="6px" pt={1} flex={1}>
      <HStack spacing={1} overflowX="auto" role="list" aria-label="Scores">
        {view.others.map((o, i) => (
          <Badge key={i} role="listitem" fontSize="xs" borderRadius="full" px={2} py="2px" colorScheme={o.won ? "green" : "gray"} border="2px solid" borderColor={i === base.you ? SEAT_COLOURS[i % SEAT_COLOURS.length] : "transparent"}>
            {o.name}: {variant === "spider" ? `${o.progress / 13} of 8 runs` : `${o.progress} of 52`} · {o.moves} moves{o.won ? " ✓" : o.done ? " (out)" : ""}
          </Badge>
        ))}
      </HStack>

      <HStack justify="space-between" align="start" spacing={gap}>
        <HStack spacing={gap} align="start">
          {variant === "klondike" && (<>
            <Box as="button" type="button" aria-label={b.stock.length ? "Turn a card from the stock" : "Turn the waste back over"} w={`${width}px`} minH={`${full}px`} onClick={() => live && act({ type: "draw" })} position="relative" borderRadius="8px" border="2px dashed" borderColor={hint?.draw ? "#38bdf8" : "whiteAlpha.300"}>
              {b.stock.length > 0 ? <PlayingCard faceDown width={width} /> : <Box position="absolute" inset={0} display="grid" placeItems="center" color="whiteAlpha.500" fontSize="xl">↺</Box>}
              <Badge position="absolute" bottom="-6px" right="-2px" fontSize="2xs">{b.stock.length}</Badge>
            </Box>
            <Box position="relative" w={`${width + (wasteShown.length - 1) * width * 0.35}px`} minH={`${full}px`} aria-label="Waste">
              {wasteShown.map((c, i) => (
                <Box key={i} position="absolute" left={`${i * width * 0.35}px`} top={0}>
                  <PlayingCard id={c.id} width={width} selected={i === wasteShown.length - 1 && same(sel?.from ?? null, { k: "w", i: 0 })} glow={i === wasteShown.length - 1 && same(hintFrom, { k: "w", i: 0 })}
                    onClick={i === wasteShown.length - 1 ? () => pickSource({ k: "w", i: 0 }, 1) : undefined} />
                  {i === wasteShown.length - 1 && <Box position="absolute" inset={0} onDoubleClick={() => home({ k: "w", i: 0 }, c)} />}
                </Box>
              ))}
            </Box>
          </>)}
          {variant === "freecell" && b.cells.map((c, i) => slot(i, { k: "c", i },
            c && <PlayingCard id={c.id} width={width} selected={same(sel?.from ?? null, { k: "c", i })} glow={same(hintFrom, { k: "c", i })} onClick={() => (sel ? tryDest({ k: "c", i }) : pickSource({ k: "c", i }, 1))} />))}
          {variant === "spider" && (
            <Box as="button" type="button" aria-label="Deal a row from the stock" w={`${width}px`} minH={`${full}px`} onClick={() => live && act({ type: "draw" })} position="relative" borderRadius="8px" border="2px dashed" borderColor={hint?.draw ? "#38bdf8" : "whiteAlpha.300"} disabled={b.stock.length < 10}>
              {b.stock.length >= 10 && <PlayingCard faceDown width={width} />}
              <Badge position="absolute" bottom="-6px" right="-2px" fontSize="2xs">{Math.floor(b.stock.length / 10)} deals</Badge>
            </Box>
          )}
        </HStack>
        <HStack spacing={gap} align="start">
          {variant === "spider"
            ? <Box textAlign="right"><Text fontSize="sm" fontWeight={800}>{b.completed} of 8 runs</Text><Text fontSize="xs" color="gray.400">Score {b.score}</Text></Box>
            : found.map((p, i) => slot(i, { k: "f", i },
              p.length > 0 && <PlayingCard id={p[p.length - 1].id} width={width} onClick={flag(rules, "fromFoundation") && variant === "klondike" ? () => (sel ? tryDest({ k: "f", i }) : pickSource({ k: "f", i }, 1)) : undefined} />,
              ["♣", "♦", "♥", "♠"][i]))}
        </HStack>
      </HStack>

      <Box display="grid" gridTemplateColumns={`repeat(${cols}, ${width}px)`} gap={`${gap}px`} justifyContent="center" alignItems="start" role="group" aria-label="Tableau" flex={1}>
        {b.tab.map((col, ci) => {
          const pile: Pile = { k: "t", i: ci };
          let y = 0;
          const positions = col.map(c => { const at = y; y += c.up ? width * 0.42 : width * 0.16; return at; });
          const height = col.length ? positions[positions.length - 1] + full : full;
          return (
            <Box key={ci} as="div" position="relative" h={`${Math.max(height, full)}px`} borderRadius="8px" border={col.length ? "none" : "2px dashed"} borderColor={same(hintTo, pile) ? "#38bdf8" : "whiteAlpha.300"} bg={col.length ? "transparent" : "blackAlpha.200"}
              onClick={() => (sel ? tryDest(pile) : undefined)} role="group" aria-label={`Column ${ci + 1}, ${col.length} card${col.length === 1 ? "" : "s"}`}>
              {col.map((c, i) => {
                const n = col.length - i;
                const isTop = i === col.length - 1;
                const picked = same(sel?.from ?? null, pile) && !!sel && n <= sel.n;
                const hinted = same(hintFrom, pile) && !!hint?.move && n <= hint.move.n;
                return (
                  <Box key={i} position="absolute" left={0} top={`${positions[i]}px`} onDoubleClick={isTop ? () => home(pile, c) : undefined}>
                    {c.up
                      ? <PlayingCard id={c.id} width={width} selected={picked} glow={hinted && !picked} onClick={() => { if (sel && !same(sel.from, pile)) tryDest(pile); else pickSource(pile, n); }} />
                      : <PlayingCard faceDown width={width} />}
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>

      <HStack spacing={2} justify="center" wrap="wrap" pb={1}>
        <Button size="sm" variant="outline" color="white" isDisabled={!live} onClick={() => setShowHint(h => !h)}>{showHint ? "Hide hint" : "Hint"}</Button>
        {flag(rules, "undo") && <Button size="sm" variant="outline" color="white" isDisabled={!live || !b.canUndo} onClick={() => act({ type: "undo" })}>Undo</Button>}
        {autoPlan.length > 0 && <Button size="sm" colorScheme="green" onClick={() => setAuto(true)}>Auto-finish</Button>}
        <Button size="sm" variant="ghost" color="red.200" isDisabled={!live} onClick={() => act({ type: "giveup" })}>Give up</Button>
        <Text fontSize="sm" color="gray.300" aria-live="polite">{variant === "klondike" && pick(rules, "scoring") !== "none" ? `Score ${b.score} · ` : ""}Moves {b.moves}</Text>
      </HStack>
    </VStack>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: solitaire as never,
  Table: Table as never,
  accent: "#0ea5e9",
  icon: "🃏",
  tagline: "Klondike, FreeCell and Spider with every rule adjustable. Play solo, or race friends on the same deal.",
  howTo: [
    { title: "Klondike", text: "Move all the cards onto the four foundations, Ace up to King in each suit. Build the columns down in alternating colours. Turn cards from the stock to find what you need." },
    { title: "FreeCell", text: "All cards are face up. Park cards in the free cells to get at the ones underneath, and build the columns down in alternating colours." },
    { title: "Spider", text: "Build columns down in any suit, but only same-suit runs can move. Complete a King to Ace run in one suit to clear it. Deal a new row from the stock when you are stuck." },
    { title: "Moving", text: "Tap a card to pick it up (with the cards on top of it), then tap where it should go. Double-tap a card to send it to a foundation." },
    { title: "Race", text: "With friends or bots everyone plays the same deal at the same time. First to finish wins, or play on and compare scores." },
    { title: "Your rules", text: "Turn one or three cards, how many times through the stock, how columns build, empty columns, scoring, free cells, suits and undo are all in Rules." },
  ],
};
export default gameModule;
