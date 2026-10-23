"use client";

import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Box, Button, Flex, HStack,
  IconButton, Text, VStack, useDisclosure, useMediaQuery,
} from "@chakra-ui/react";
import { ChevronLeftIcon, QuestionIcon, SettingsIcon, InfoIcon } from "@chakra-ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { currentPlayer, legalMoves } from "@/lib/ludo/engine";
import type { Action, GameEvent, GameState, MoveOption } from "@/lib/ludo/types";
import type { FrameBus, Frame } from "@/lib/client/frames";
import type { AnimStep } from "@/lib/client/anim";
import { stepMs } from "@/lib/client/anim";
import { describeFrame, type LogLine } from "@/lib/client/describe";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { useSettings, updateSettings } from "@/lib/client/settings";
import { resolveRenderer, useCapabilities, useWakeLock } from "@/lib/client/device";
import { recordGame } from "@/lib/client/stats";
import { useAnimatedGame } from "@/hooks/useAnimatedGame";
import { useBotDriver } from "@/hooks/useLocalGame";
import BoardView from "../board/BoardView";
import { Dice } from "../board/Dice";
import { PlayerCard } from "./PlayerCard";
import { HowToPlay } from "./HowToPlay";
import { SettingsDrawer } from "./SettingsDrawer";
import { WinnerOverlay } from "./WinnerOverlay";
import { LogDrawer, LogList } from "./LogPanel";
import { DecisionCard } from "./DecisionCard";
import { CityBackdrop } from "../scenery/CityBackdrop";

export interface GameScreenProps {
  state: GameState;
  bus: FrameBus;
  /** Seats that people on this device may act for. Empty means watching. */
  mySeats: Seat[];
  act: (action: Action) => boolean;
  onExit: () => void;
  exitWarning: string;
  /** Run bot players here (local games). Online, the host does it. */
  runBots?: boolean;
  recordStats?: boolean;
  onRematch?: () => void;
  rematchLabel?: string;
  waitingText?: string;
  headerExtra?: React.ReactNode;
  panelExtra?: React.ReactNode;
  tags?: Partial<Record<Seat, string>>;
  away?: ReadonlySet<Seat>;
  viewSeat?: Seat;
  /** Shown in the header, such as a room code. */
  title?: string;
}

const MAX_LOG = 120;

export default function GameScreen(props: GameScreenProps) {
  const { state, bus, mySeats, act, onExit, exitWarning, runBots = false, recordStats = false } = props;
  const [settings] = useSettings();
  const caps = useCapabilities();
  const help = useDisclosure();
  const prefs = useDisclosure();
  const log = useDisclosure();
  const exit = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [wide] = useMediaQuery("(orientation: landscape) and (min-width: 700px)");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [choice, setChoice] = useState<number | null>(null);
  const [bonus, setBonus] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const captures = useRef(0);
  const recorded = useRef(false);

  const reduceMotion = settings.motion === "reduce" || (settings.motion === "auto" && !!caps?.reducedMotion);
  const speed = reduceMotion && settings.speed === "normal" ? "fast" : settings.speed;
  const renderer = state.rules.tycoon ? "2d" : resolveRenderer(settings.renderer, caps);

  useWakeLock(settings.keepAwake && state.phase !== "over");

  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    const onVis = () => { if (document.hidden) sound.suspend(); else sound.unlock(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const mine = useRef(mySeats);
  mine.current = mySeats;

  const onFrameStart = useCallback((frame: Frame) => {
    setLines(l => [...l, ...describeFrame(frame.events, frame.state)].slice(-MAX_LOG));
    frame.events.forEach((e: GameEvent) => {
      switch (e.type) {
        case "roll": sound.play("dice"); buzz("tap"); setBonus(null); break;
        case "penalty": sound.play("penalty"); buzz("penalty"); break;
        case "bonus":
          sound.play("bonus"); buzz("bonus");
          setBonus(e.reason === "finish" ? "A token is home! Roll again" : e.reason === "capture" ? "Capture! Roll again" : "A six! Roll again");
          break;
        case "turn": if (mine.current.includes(e.seat)) sound.play("turn"); break;
        case "capture": if (mine.current.includes(e.seat)) captures.current += 1; break;
      }
    });
    if (frame.state.seq === 0) sound.play("start");
  }, []);
  const onStep = useCallback((step: AnimStep) => {
    if (step.kind === "hop") sound.play("hop");
    else if (step.kind === "enter") sound.play("enter");
    else if (step.kind === "finish") sound.play("home");
    else { sound.play("capture"); buzz("capture"); }
  }, []);
  const onFrameEnd = useCallback((frame: Frame) => {
    if (frame.events.some(e => e.type === "win")) {
      const won = frame.state.winner !== null && mine.current.includes(frame.state.winner);
      sound.play(won || mine.current.length === 0 ? "win" : "error");
      buzz("win");
      if (recordStats && !recorded.current) {
        recorded.current = true;
        const bot = frame.state.players.find(p => p.kind === "bot");
        recordGame({ won, captures: captures.current, botLevel: bot?.level });
      }
    }
  }, [recordStats]);

  const anim = useAnimatedGame(bus, state, { speed, onFrameStart, onStep, onFrameEnd });
  const { shown, busy } = anim;
  useBotDriver(state, busy, act, speed, !runBots);

  const me = currentPlayer(shown);
  const iAct = !busy && shown.phase !== "over" && mySeats.includes(me.seat) && me.kind === "human";
  const moves: MoveOption[] = useMemo(() => (iAct && shown.phase === "move" ? legalMoves(shown) : []), [iAct, shown]);
  const canRoll = iAct && shown.phase === "roll";

  const roll = useCallback(() => { if (canRoll) { sound.unlock(); act({ type: "roll" }); } }, [canRoll, act]);
  const move = useCallback((o: MoveOption) => { setChoice(null); act({ type: "move", token: o.token, die: o.die }); }, [act]);

  const pick = useCallback((token: number) => {
    const opts = moves.filter(o => o.token === token);
    if (opts.length === 1) move(opts[0]);
    else if (opts.length > 1) { setChoice(token); sound.play("click"); }
  }, [moves, move]);

  useEffect(() => { setChoice(null); }, [shown.phase, shown.turn, busy]);

  // one forced move can play itself, if asked
  useEffect(() => {
    if (!settings.autoMove || moves.length !== 1) return;
    const t = setTimeout(() => move(moves[0]), 350);
    return () => clearTimeout(t);
  }, [settings.autoMove, moves, move]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.tagName === "BUTTON" || el.isContentEditable)) return;
      if ((e.key === " " || e.key === "Enter") && canRoll) { e.preventDefault(); roll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRoll, roll]);

  const viewSeat: Seat = props.viewSeat ?? (mySeats.length === 1 ? mySeats[0] : settings.followTurn ? me.seat : 0);
  const accent = SEAT_INFO[me.seat].main;
  const choiceOptions = choice === null ? [] : moves.filter(o => o.token === choice);

  const status = (() => {
    if (shown.phase === "over") return "Game over";
    if (busy) return `${me.name}…`;
    if (shown.phase === "decide") return iAct ? "Your call: buy, build or pass" : `${me.name} is deciding…`;
    if (canRoll && bonus) return mySeats.length > 1 ? `${me.name}: ${bonus}` : bonus;
    if (canRoll) return mySeats.length > 1 ? `${me.name}, roll the dice` : "Your turn: roll the dice";
    if (iAct) return choice !== null ? "Choose which number to use" : mySeats.length > 1 ? `${me.name}, pick a glowing token` : "Pick a glowing token";
    if (me.kind === "bot") return `${me.name} is thinking…`;
    return mySeats.length === 0 ? `${me.name}'s turn` : `Waiting for ${me.name}…`;
  })();
  const announce = lines.length ? lines[lines.length - 1].text : "";

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const players = (
    <Box as="ul" display="grid" gridTemplateColumns={wide ? "1fr" : "repeat(2, minmax(0, 1fr))"} gap={2} m={0} p={0} role="list" aria-label="Players">
      {shown.players.map(p => (
        <PlayerCard key={p.seat} player={p} current={p.seat === me.seat && shown.phase !== "over"} isMe={mySeats.length === 1 && mySeats[0] === p.seat}
          symbols={settings.symbols} compact={!wide} away={props.away?.has(p.seat)} tag={props.tags?.[p.seat]} cash={shown.tycoon?.cash[p.seat]} />
      ))}
    </Box>
  );

  return (
    <Flex
      direction="column" h="100dvh" w="100%" bg="#10172E" color="white" overflow="hidden" position="relative" isolation="isolate"
      pt="env(safe-area-inset-top)" pb="env(safe-area-inset-bottom)" pl="env(safe-area-inset-left)" pr="env(safe-area-inset-right)"
    >
      {settings.scenery === "city" && <CityBackdrop timeOfDay={settings.timeOfDay} calm={reduceMotion} />}
      <HStack px={2} py={1.5} spacing={1} flexShrink={0}>
        <IconButton aria-label="Leave game" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={exit.onOpen} />
        <Text fontWeight={700} fontSize="sm" noOfLines={1} flex={1} color="gray.200">{props.title ?? "Ludo Sync"}</Text>
        {props.headerExtra}
        {!wide && <IconButton aria-label="Game log" icon={<InfoIcon />} variant="ghost" color="white" onClick={log.onOpen} />}
        <IconButton aria-label={settings.sound ? "Mute sound" : "Unmute sound"} variant="ghost" color="white" fontSize="lg"
          icon={<span aria-hidden>{settings.sound ? "🔊" : "🔇"}</span>} onClick={() => { sound.unlock(); updateSettings({ sound: !settings.sound }); }} />
        {typeof document !== "undefined" && document.fullscreenEnabled && (
          <IconButton aria-label={fullscreen ? "Exit full screen" : "Full screen"} variant="ghost" color="white" fontSize="lg"
            icon={<span aria-hidden>{fullscreen ? "🗗" : "⛶"}</span>} onClick={toggleFullscreen} display={{ base: "none", md: "inline-flex" }} />
        )}
        <IconButton aria-label="How to play" icon={<QuestionIcon />} variant="ghost" color="white" onClick={help.onOpen} />
        <IconButton aria-label="Settings" icon={<SettingsIcon />} variant="ghost" color="white" onClick={prefs.onOpen} />
      </HStack>

      <Flex flex={1} minH={0} direction={wide ? "row" : "column"} gap={wide ? 4 : 2} px={2} pb={2} w="100%" maxW="1320px" mx="auto">
        <Box
          flex={wide ? 1 : "0 0 auto"} minH={0} minW={0} display="grid" placeItems="center"
          w={wide ? undefined : "min(100%, calc(100dvh - 330px))"} alignSelf={wide ? undefined : "center"}
          sx={wide ? { containerType: "size" } : { aspectRatio: "1 / 1" }}
        >
          <Box sx={wide ? { width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" } : { width: "100%", height: "100%" }}>
            <BoardView
              renderer={renderer} state={shown} viewSeat={viewSeat} options={moves} onPick={pick}
              symbols={settings.symbols} hints={settings.hints} reduceMotion={reduceMotion} hopMs={stepMs("hop", speed)}
            />
          </Box>
        </Box>

        <VStack
          flex={wide ? "0 0 auto" : 1} minH={0} align="stretch" spacing={3} w={wide ? "clamp(280px, 30vw, 380px)" : "100%"} overflowY="auto"
          pb={2}
        >
          {players}
          {iAct && shown.phase === "decide" && <DecisionCard state={shown} act={act} />}
          <HStack spacing={3} justify="center" align="center">
            <Dice
              values={shown.rolled} rollKey={anim.rollKey} canRoll={canRoll} onRoll={roll} accent={accent} tumble={!reduceMotion && speed !== "instant"}
              size={wide ? 64 : 50} label={canRoll ? "Roll the dice" : `Dice showing ${shown.rolled.join(" and ") || "nothing yet"}`}
            />
            <VStack align="start" spacing={1} flex={1} minW={0}>
              <Text fontSize={wide ? "md" : "sm"} fontWeight={700} role="status" color={canRoll && bonus ? "yellow.300" : undefined}>{status}</Text>
              {shown.sixes > 0 && shown.phase !== "over" && <Text fontSize="xs" color="yellow.300">Sixes in a row: {shown.sixes}</Text>}
              {choiceOptions.length > 0 && (
                <HStack spacing={2} flexWrap="wrap">
                  {choiceOptions.map(o => (
                    <Button key={o.die} size="sm" colorScheme="teal" onClick={() => move(o)}>
                      Use {o.die}{shown.dice.length === 2 && o.die === shown.dice[0] + shown.dice[1] ? " (both)" : ""}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setChoice(null)}>Cancel</Button>
                </HStack>
              )}
            </VStack>
          </HStack>
          {props.panelExtra}
          {(
            <Box bg={settings.scenery === "city" ? "blackAlpha.600" : "whiteAlpha.100"} borderRadius="xl" p={3} maxH="200px" overflowY="auto"
              display={wide ? "block" : "none"} sx={wide ? undefined : { "@media (min-height: 780px)": { display: "block" } }}>
              <Text fontSize="xs" textTransform="uppercase" color="gray.400" mb={1}>Game log</Text>
              <LogList lines={lines} limit={8} />
            </Box>
          )}
        </VStack>
      </Flex>

      <Box position="absolute" w="1px" h="1px" overflow="hidden" clipPath="inset(50%)" aria-live="polite" role="log">{announce}</Box>

      {shown.phase === "over" && !busy && (
        <WinnerOverlay
          state={shown} reduceMotion={reduceMotion} onRematch={props.onRematch} rematchLabel={props.rematchLabel}
          waitingText={props.waitingText} onExit={onExit}
        />
      )}
      <HowToPlay isOpen={help.isOpen} onClose={help.onClose} />
      <SettingsDrawer isOpen={prefs.isOpen} onClose={prefs.onClose} />
      <LogDrawer isOpen={log.isOpen} onClose={log.onClose} lines={lines} />
      <AlertDialog isOpen={exit.isOpen} onClose={exit.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="gray.800" color="white" mx={3}>
            <AlertDialogHeader>Leave this game?</AlertDialogHeader>
            <AlertDialogBody>{exitWarning}</AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} onClick={exit.onClose}>Keep playing</Button>
              <Button colorScheme="red" onClick={() => { exit.onClose(); onExit(); }}>Leave</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Flex>
  );
}
