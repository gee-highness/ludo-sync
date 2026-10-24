"use client";

import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Box, Button, Flex, HStack,
  IconButton, Text, VStack, useDisclosure, useMediaQuery,
} from "@chakra-ui/react";
import { ChevronLeftIcon, QuestionIcon, SettingsIcon, InfoIcon } from "@chakra-ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { currentPlayer, legalMoves, pointsOf } from "@/lib/ludo/engine";
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
import { useLeaveGuard } from "@/hooks/useLeaveGuard";
import { usePalette } from "@/lib/client/palette";
import BoardView from "../board/BoardView";
import { Dice } from "../board/Dice";
import { HowToPlay } from "./HowToPlay";
import { SettingsDrawer } from "./SettingsDrawer";
import { WinnerOverlay } from "./WinnerOverlay";
import { LogDrawer, LogList } from "./LogPanel";
import { PlayerPanels, type Floater } from "../hud/PlayerPanels";
import { TurnBanner, type BannerInfo } from "../hud/TurnBanner";
import { RollButton } from "../hud/RollButton";
import { StatusBar } from "../hud/StatusBar";
import { PropertyCard } from "../tycoon/PropertyCard";

export interface GameScreenProps {
  state: GameState;
  bus: FrameBus;
  /** Seats that people on this device may act for. Empty means watching. */
  mySeats: Seat[];
  act: (action: Action) => boolean;
  onExit: () => void;
  exitWarning: string;
  /** Online: quit for good (forfeit the seat). When given, the leave dialog offers it as a second, separate choice. */
  onForfeit?: () => void;
  forfeitWarning?: string;
  /** Ask the browser to confirm before the tab is closed or reloaded mid-game. */
  guardUnload?: boolean;
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
  usePalette(); // redraw everything that uses seat colours when a player's choice changes
  const [settings] = useSettings();
  const caps = useCapabilities();
  const help = useDisclosure();
  const prefs = useDisclosure();
  const log = useDisclosure();
  const exit = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [lockLeft, setLockLeft] = useState(0);
  const [wide] = useMediaQuery("(orientation: landscape) and (min-width: 700px)");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [choice, setChoice] = useState<number | null>(null);
  const [bonus, setBonus] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerInfo | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [short] = useMediaQuery("(max-height: 560px)");
  const bannerKey = useRef(0);
  const floatId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const points = useRef<Record<number, number>>(Object.fromEntries(state.players.map(p => [p.seat, pointsOf(p)])));
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const captures = useRef(0);
  const recorded = useRef(false);

  const reduceMotion = settings.motion === "reduce" || (settings.motion === "auto" && !!caps?.reducedMotion);
  const speed = reduceMotion && settings.speed === "normal" ? "fast" : settings.speed;
  const renderer = resolveRenderer(settings.renderer, caps);

  useWakeLock(settings.keepAwake && (state.phase !== "over" || !!props.guardUnload));

  // Back, swipe-back and (online) closing the tab all ask first; the leave buttons then stay locked for a moment
  // online, the guard stays up after the game ends too: the room carries on to a rematch
  useLeaveGuard(state.phase !== "over" || !!props.guardUnload, exit.onOpen, props.guardUnload);
  useEffect(() => {
    if (!exit.isOpen) return;
    setLockLeft(2);
    const t1 = setTimeout(() => setLockLeft(1), 800);
    const t2 = setTimeout(() => setLockLeft(0), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [exit.isOpen]);

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

  useEffect(() => { setCanFullscreen(!!document.fullscreenEnabled); }, []);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const mine = useRef(mySeats);
  mine.current = mySeats;

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => { const live = timers.current; return () => { live.forEach(clearTimeout); live.clear(); }; }, []);
  const addFloater = useCallback((seat: Seat, text: string, tone: Floater["tone"]) => {
    const id = ++floatId.current;
    setFloaters(f => [...f.slice(-11), { id, seat, text, tone }]);
    later(() => setFloaters(f => f.filter(x => x.id !== id)), 1600);
  }, [later]);
  const showBanner = useCallback((text: string, tone: BannerInfo["tone"], sub?: string) => {
    const key = ++bannerKey.current;
    setBanner({ key, text, tone, sub });
    later(() => setBanner(b => (b && b.key === key ? null : b)), 1750);
  }, [later]);

  const onFrameStart = useCallback((frame: Frame) => {
    setLines(l => [...l, ...describeFrame(frame.events, frame.state)].slice(-MAX_LOG));
    frame.events.forEach((e: GameEvent) => {
      switch (e.type) {
        case "roll": sound.play("dice"); buzz("tap"); setBonus(null); break;
        case "penalty": sound.play("penalty"); buzz("penalty"); break;
        case "bonus":
          sound.play("bonus"); buzz("bonus");
          setBonus(e.reason === "finish" ? "A token is home! Roll again" : e.reason === "capture" ? "Capture! Roll again" : "A six! Roll again");
          showBanner("Roll again!", "bonus", e.reason === "finish" ? "a token is home" : e.reason === "capture" ? "capture" : "a six");
          break;
        case "turn":
          if (mine.current.includes(e.seat)) sound.play("turn");
          showBanner(`${frame.state.players.find(p => p.seat === e.seat)?.name ?? "Next player"}'s turn`, "turn");
          break;
        case "money": {
          addFloater(e.seat, `${e.amount < 0 ? "-" : "+"}$${Math.abs(e.amount)}`, e.amount < 0 ? "loss" : "gain");
          if (e.other !== undefined) addFloater(e.other, `${e.amount < 0 ? "+" : "-"}$${Math.abs(e.amount)}`, e.amount < 0 ? "gain" : "loss");
          break;
        }
        case "capture": if (mine.current.includes(e.seat)) captures.current += 1; break;
      }
    });
    if (frame.state.seq === 0) {
      sound.play("start");
      points.current = Object.fromEntries(frame.state.players.map(p => [p.seat, pointsOf(p)]));
      showBanner(`${frame.state.players[frame.state.turn].name}'s turn`, "turn");
    } else if (!frame.state.tycoon) {
      // classic: points that moved since the last frame float up beside the player
      for (const p of frame.state.players) {
        const now = pointsOf(p), before = points.current[p.seat];
        if (before !== undefined && now !== before) addFloater(p.seat, `${now > before ? "+" : ""}${now - before}`, now > before ? "gain" : "loss");
        points.current[p.seat] = now;
      }
    }
  }, [addFloater, showBanner]);
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

  const anim = useAnimatedGame(bus, state, { speed, longRoll: renderer === "3d", onFrameStart, onStep, onFrameEnd });
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

  const pending = shown.tycoon?.pending ?? null;
  const status = (() => {
    if (shown.phase === "over") return "Game over";
    const others = `${me.name}`;
    if (shown.phase === "decide") {
      if (iAct) return pending?.kind === "build" ? "Your call: build here or pass" : "Your call: buy this property or pass";
      return pending?.kind === "build" ? `${others} is thinking about building here` : `${others} is thinking about buying this property`;
    }
    if (busy) return shown.phase === "roll" ? `${others} is rolling…` : `${others} is moving…`;
    if (canRoll && bonus) return mySeats.length > 1 ? `${me.name}: ${bonus}` : bonus;
    if (canRoll) return mySeats.length > 1 ? `${me.name}, roll the dice` : "Your turn: roll the dice";
    if (iAct) return choice !== null ? "Choose which number to use" : mySeats.length > 1 ? `${me.name}, pick a glowing token` : "Pick a glowing token";
    return shown.phase === "roll" ? `${others} is rolling…` : `${others} is choosing a move`;
  })();
  const announce = lines.length ? lines[lines.length - 1].text : "";

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const compact = !wide || short;
  const round = (label: string, icon: React.ReactElement, onClick: () => void, extra: Record<string, unknown> = {}) => (
    <IconButton
      key={label} aria-label={label} icon={icon} onClick={onClick} isRound w="44px" h="44px" minW="44px" bg="#fff" color="#1c1c1c" fontSize="lg"
      boxShadow="0 3px 10px rgba(0,0,0,.5)" _hover={{ bg: "gray.100" }} _active={{ bg: "gray.200" }} {...extra}
    />
  );
  const leaveBtn = round("Leave game", <ChevronLeftIcon boxSize={6} />, exit.onOpen);
  const iconButtons = [
    !wide && round("Game log", <InfoIcon />, log.onOpen),
    round(settings.sound ? "Mute sound" : "Unmute sound", <span aria-hidden>{settings.sound ? "🔊" : "🔇"}</span>, () => { sound.unlock(); updateSettings({ sound: !settings.sound }); }),
    canFullscreen && round(fullscreen ? "Exit full screen" : "Full screen", <span aria-hidden>{fullscreen ? "🗗" : "⛶"}</span>, toggleFullscreen, { display: { base: "none", md: "inline-flex" } }),
    round("How to play", <QuestionIcon />, help.onOpen),
    round("Settings", <SettingsIcon />, prefs.onOpen),
  ];

  const panels = (
    <PlayerPanels
      players={shown.players} currentSeat={shown.phase !== "over" ? me.seat : null} mySeats={mySeats} cash={shown.tycoon?.cash} away={props.away} tags={props.tags}
      compact={compact} twoColumns={!wide} floaters={floaters}
    />
  );
  const tycoonCard = iAct && shown.phase === "decide" ? <PropertyCard state={shown} act={act} wide={wide} /> : null;
  const controls = (
    <VStack align="stretch" spacing={2}>
      <HStack spacing={3} align="center">
        <Dice
          values={shown.rolled} rollKey={anim.rollKey} canRoll={canRoll} onRoll={roll} accent={accent} tumble={!reduceMotion && speed !== "instant"}
          size={wide && !short ? 64 : 50} label={canRoll ? "Roll the dice" : `Dice showing ${shown.rolled.join(" and ") || "nothing yet"}`}
        />
        <RollButton enabled={canRoll} label={canRoll && bonus ? "Roll again" : "Roll dice"} onClick={roll} />
      </HStack>
      {choiceOptions.length > 0 && (
        <HStack spacing={2} flexWrap="wrap">
          {choiceOptions.map(o => (
            <Button key={o.die} size="md" minH="44px" colorScheme="teal" onClick={() => move(o)}>
              Use {o.die}{shown.dice.length === 2 && o.die === shown.dice[0] + shown.dice[1] ? " (both)" : ""}
            </Button>
          ))}
          <Button size="md" minH="44px" variant="ghost" onClick={() => setChoice(null)}>Cancel</Button>
        </HStack>
      )}
      <StatusBar
        text={status} tone={canRoll && bonus ? "bonus" : undefined}
        extra={shown.sixes > 0 && shown.phase !== "over" ? <Text fontSize="xs" color="#fde047">Sixes in a row: {shown.sixes}</Text> : undefined}
      />
    </VStack>
  );
  const logBox = (
    <Box bg="whiteAlpha.100" borderRadius="xl" p={3} maxH="200px" overflowY="auto" flexShrink={0}
      display="none" sx={wide ? { "@media (min-height: 561px)": { display: "block" } } : { "@media (min-height: 780px)": { display: "block" } }}>
      <Text fontSize="xs" textTransform="uppercase" color="gray.400" mb={1}>Game log</Text>
      <LogList lines={lines} limit={8} />
    </Box>
  );

  return (
    <Flex
      direction="column" h="100dvh" w="100%" bg="#303030" color="white" overflow="hidden" position="relative" isolation="isolate"
      pt="env(safe-area-inset-top)" pb="env(safe-area-inset-bottom)" pl="env(safe-area-inset-left)" pr="env(safe-area-inset-right)"
    >
      {!wide && (
        <HStack px={2} py={1.5} spacing={2} flexShrink={0} bg="#151515">
          {leaveBtn}
          <Text fontWeight={700} fontSize="sm" noOfLines={1} flex={1} color="gray.200">{props.title ?? "Ludo Sync"}</Text>
          {props.headerExtra}
          {iconButtons}
        </HStack>
      )}

      <Flex flex={1} minH={0} direction={wide ? "row" : "column"} gap={wide ? 3 : 2} px={2} pt={wide ? 2 : 0} pb={2} w="100%" maxW="1400px" mx="auto">
        {wide && (
          <VStack flex="0 0 auto" spacing={3} align="center" pt={1} aria-label="Game controls" role="group">
            {leaveBtn}{iconButtons}{props.headerExtra}
          </VStack>
        )}
        <Box
          flex={wide ? 1 : "0 0 auto"} minH={0} minW={0} display="grid" placeItems="center" position="relative"
          w={wide ? undefined : "min(100%, calc(100dvh - 330px))"} alignSelf={wide ? undefined : "center"}
          sx={wide ? { containerType: "size" } : { aspectRatio: "1 / 1" }}
        >
          <Box position="relative" sx={wide ? { width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" } : { width: "100%", height: "100%" }}>
            <BoardView
              renderer={renderer} state={shown} viewSeat={viewSeat} options={moves} onPick={pick}
              symbols={settings.symbols} hints={settings.hints} reduceMotion={reduceMotion} hopMs={stepMs("hop", speed)} moving={anim.moving} rollKey={anim.rollKey}
            />
            <TurnBanner banner={banner} reduceMotion={reduceMotion} />
          </Box>
        </Box>

        <VStack
          flex={wide ? "0 0 auto" : 1} minH={0} align="stretch" spacing={3} w={wide ? "clamp(280px, 30vw, 380px)" : "100%"} overflowY="auto" overflowX="hidden"
          pb={2} pr={wide ? 1 : 0}
        >
          {wide && <Text fontWeight={700} fontSize="sm" noOfLines={1} color="gray.300">{props.title ?? "Ludo Sync"}</Text>}
          {panels}
          {controls}
          {props.panelExtra}
          {logBox}
        </VStack>
      </Flex>
      {tycoonCard}

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
            <AlertDialogBody>
              <Text>{exitWarning}</Text>
              {props.onForfeit && <Text mt={3} color="orange.200" fontSize="sm">{props.forfeitWarning ?? "Quitting for good gives up your seat and cannot be undone."}</Text>}
            </AlertDialogBody>
            <AlertDialogFooter flexDirection="column" alignItems="stretch" gap={2}>
              <Button ref={cancelRef} colorScheme="teal" size="lg" onClick={exit.onClose}>Keep playing</Button>
              <Button variant="outline" color="white" isDisabled={lockLeft > 0} onClick={() => { exit.onClose(); onExit(); }}>
                {lockLeft > 0 ? `Leave for now (${lockLeft})` : "Leave for now"}
              </Button>
              {props.onForfeit && (
                <Button variant="ghost" colorScheme="red" size="sm" isDisabled={lockLeft > 0} onClick={() => { exit.onClose(); props.onForfeit?.(); }}>
                  {lockLeft > 0 ? `Quit for good (${lockLeft})` : "Quit for good"}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Flex>
  );
}
