"use client";

import { Badge, Box, Button, HStack, IconButton, Text, VStack, useToast } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resetCameraView } from "@/lib/client/cameraView";
import { useCapabilities } from "@/lib/client/device";
import { detectStartTier, recalledTier, rememberTier, stepDown, stepUp, type Tier } from "@/lib/client/quality";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { RoundOverlay } from "./RoundOverlay";
import type { Pick, SceneInput } from "./SkipBoScene";
import type { TableExtras, TableProps } from "./Table";
import { PointsFloaters } from "./PointsFloaters";
import { useTableInput } from "./useTableInput";
import { usePrefs } from "@/lib/skipbo/prefs";

const Canvas = dynamic(() => import("./Table3DCanvas"), { ssr: false });

export const SLOW_KEY = "ludo-sync:slow3d";
export const slowThisSession = () => { try { return sessionStorage.getItem(SLOW_KEY) === "1"; } catch { return false; } };

interface Props extends TableProps, TableExtras {
  toggle: React.ReactNode;
  onFail: () => void;
}

/** The 3D table: the picture fills the screen, and the controls float over it. */
export default function Table3DView({ award, floaters, badge, view, act, frame, log, rejected, title, onExit, headerExtra, footer, note, onRematch, rematchLabel, waitingText, streakText, toggle, onFail }: Props) {
  const input = useTableInput(view, act, frame, rejected);
  const { myTurn, selected, hintSrc, hintTarget, targets, picked, banner, status, mustEnd, hintLine } = input;
  const [settings] = useSettings();
  const prefs = usePrefs();
  const caps = useCapabilities();
  const toast = useToast();
  const [showLog, setShowLog] = useState(false);
  const [shifted, setShifted] = useState<Tier | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 56, right: 0, bottom: 150, left: 0 });

  // how much of the screen the controls cover, so the table is framed in what is left
  useEffect(() => {
    const measure = () => {
      const t = topRef.current?.getBoundingClientRect().height ?? 56, b = bottomRef.current?.getBoundingClientRect().height ?? 150;
      setInsets(p => (Math.abs(p.top - t) < 2 && Math.abs(p.bottom - b) < 2 ? p : { top: Math.round(t), right: 0, bottom: Math.round(b), left: 0 }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setShifted(null); }, [settings.quality]);
  const start = (): Tier => {
    const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & { deviceMemory?: number });
    return recalledTier() ?? detectStartTier(caps, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, nav?.hardwareConcurrency ?? 8, nav?.deviceMemory ?? 8);
  };
  const base: Tier = settings.quality === "auto" ? start() : settings.quality;
  const quality: Tier = shifted ?? base;
  const onTier = useCallback((dir: "down" | "up") => {
    if (dir === "up" && settings.quality !== "auto") return;
    const next = dir === "down" ? stepDown(quality) : stepUp(quality);
    if (next) { setShifted(next); if (settings.quality === "auto") rememberTier(next); return; }
    if (dir === "up") return;
    try { sessionStorage.setItem(SLOW_KEY, "1"); } catch { /* ignore */ }
    toast({ title: "Switched to the flat table", description: "The 3D table was running slowly on this device.", status: "info", duration: 6000, isClosable: true });
    onFail();
  }, [quality, settings.quality, toast, onFail]);

  const reduceMotion = settings.motion === "reduce" || (settings.motion === "auto" && !!caps?.reducedMotion);
  const sceneInput: SceneInput = useMemo(() => ({
    view, frame, selected, hintSrc, hintTarget, targets: picked !== undefined ? targets(picked) : [], camera: settings.camera, look: { back: prefs.back, felt: prefs.felt, marks: prefs.marks }, reduceMotion, insets,
  }), [view, frame, prefs.back, prefs.felt, prefs.marks, selected, hintSrc, hintTarget, targets, picked, settings.camera, reduceMotion, insets]);

  const onPick = (p: Pick) => {
    if (p.kind === "hand") input.onHand(p.index);
    else if (p.kind === "stock") input.onStock();
    else if (p.kind === "discard") input.onDiscard(p.pile);
    else input.onBuilding(p.pile);
  };

  const drone = settings.camera === "drone";
  const topCamera = settings.camera === "top";
  return (
    <Box position="relative" minH="100dvh" h="100dvh" color="white" overflow="hidden" bg="#07140e">
      <PointsFloaters items={floaters} />
      <Canvas input={sceneInput} look={{ back: prefs.back, felt: prefs.felt, marks: prefs.marks }} quality={quality} onPick={onPick} onTier={onTier} onFail={onFail} onReady={() => undefined} />

      <Box position="absolute" inset={0} display="flex" flexDirection="column" pointerEvents="none">
        <Box ref={topRef} pointerEvents="auto" pt="max(8px, env(safe-area-inset-top))" px={2} pb={2} bg="linear-gradient(180deg, rgba(4,14,9,.82), rgba(4,14,9,0))">
          <HStack spacing={2}>
            <IconButton aria-label="Leave table" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" size="sm" onClick={onExit} />
            <VStack spacing={0} align="start" flex={1} minW={0}>
              <Text fontWeight={800} noOfLines={1}>{title}</Text>
              <Text fontSize="xs" color="whiteAlpha.800" noOfLines={1}>
                {view.rules.tournament ? `Round ${view.round} · first to ${view.rules.target}` : "First to empty their stock wins"}{streakText ? ` · ${streakText}` : ""}{badge ? ` · ${badge}` : ""}
                {view.you !== null ? ` · ★ ${view.players[view.you].points}` : ""}
              </Text>
            </VStack>
            {note && <Badge colorScheme="orange">{note}</Badge>}
            {headerExtra}
            {toggle}
            <Button size="sm" variant="outline" color="white" onClick={() => setShowLog(v => !v)} aria-pressed={showLog}>Log</Button>
            <Button size="sm" colorScheme="yellow" onClick={input.wantHint} isDisabled={!myTurn} aria-label="Show a hint">Hint</Button>
          </HStack>
          <HStack spacing={2} mt={2} justify="flex-end">
            <IconButton size="sm" aria-label="Reset camera" icon={<span aria-hidden>⟲</span>} variant="solid" bg="whiteAlpha.300" color="white" onClick={resetCameraView} />
            <IconButton size="sm" aria-label={topCamera ? "Switch to the angled view" : "Switch to the top-down view"} icon={<span aria-hidden>{topCamera ? "◩" : "⬒"}</span>} variant="solid" bg="whiteAlpha.300" color="white"
              onClick={() => updateSettings({ camera: topCamera ? "tilt" : "top" })} />
            <IconButton size="sm" aria-label={drone ? "Leave drone camera" : "Drone camera"} icon={<span aria-hidden>🛸</span>} variant="solid" bg={drone ? "#facc15" : "whiteAlpha.300"} color={drone ? "black" : "white"}
              onClick={() => updateSettings({ camera: drone ? "tilt" : "drone" })} />
          </HStack>
        </Box>

        <Box flex={1} />

        <Box ref={bottomRef} pointerEvents="auto" px={3} pt={6} pb="max(10px, env(safe-area-inset-bottom))" textAlign="center" bg="linear-gradient(0deg, rgba(4,14,9,.85), rgba(4,14,9,0))">
          <Text fontSize="sm" aria-live="polite" color={rejected ? "orange.200" : "whiteAlpha.900"} mb={mustEnd ? 2 : 1}>{hintLine ? <b>{hintLine}</b> : status}</Text>
          {mustEnd && <Button colorScheme="yellow" size="sm" mb={2} onClick={() => act({ type: "endTurn" })}>End turn</Button>}
          {footer}
        </Box>
      </Box>

      {showLog && (
        <Box position="absolute" zIndex={5} top="96px" right={2} w="min(320px, 92vw)" maxH="45dvh" overflowY="auto" bg="rgba(8,20,14,.95)" borderRadius="xl" p={3} border="1px solid rgba(255,255,255,.2)" role="log" aria-label="Game log">
          {log.length === 0 ? <Text fontSize="sm" color="whiteAlpha.700">Nothing has happened yet.</Text> : [...log].reverse().map((l, i) => <Text key={i} fontSize="sm" py="2px" color={i === 0 ? "white" : "whiteAlpha.700"}>{l}</Text>)}
        </Box>
      )}
      {banner && (
        <Box key={banner.id} position="absolute" zIndex={6} top="38%" left="50%" transform="translateX(-50%)" px={5} py={2} borderRadius="full" fontWeight={900} fontSize="lg" pointerEvents="none"
          bg={banner.tone === "good" ? "linear-gradient(180deg,#fde047,#f59e0b)" : "rgba(15,23,42,.92)"} color={banner.tone === "good" ? "#1f2937" : "white"} boxShadow="0 8px 24px rgba(0,0,0,.5)"
          sx={{ animation: "sbBanner 1.8s ease-out forwards", "@keyframes sbBanner": { "0%": { opacity: 0, transform: "translate(-50%, 12px) scale(.9)" }, "12%": { opacity: 1, transform: "translate(-50%,0) scale(1)" }, "80%": { opacity: 1 }, "100%": { opacity: 0, transform: "translate(-50%,-8px)" } } }}>
          {banner.text}
        </Box>
      )}
      {(view.phase === "roundOver" || view.phase === "over") && (
        <RoundOverlay view={view} act={act} onExit={onExit} onRematch={onRematch} rematchLabel={rematchLabel} waitingText={waitingText} award={award} />
      )}
    </Box>
  );
}
