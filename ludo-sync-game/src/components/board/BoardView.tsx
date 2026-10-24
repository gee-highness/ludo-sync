"use client";

import { Box, IconButton, useToast } from "@chakra-ui/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { useCapabilities } from "@/lib/client/device";
import { detectStartTier, recalledTier, rememberTier, stepDown, stepUp, type Tier } from "@/lib/client/quality";
import Board2D from "./Board2D";
import type { BoardProps } from "./types";

const Board3D = dynamic(() => import("./Board3D"), { ssr: false });

const SLOW_KEY = "ludo-sync:slow3d";
const slowThisSession = () => { try { return sessionStorage.getItem(SLOW_KEY) === "1"; } catch { return false; } };

/**
 * Picks the renderer. The flat board shows straight away and until the 3D one has loaded its models;
 * if 3D cannot start, loses its context, or runs too slowly, play carries on in 2D without interruption.
 */
export default function BoardView(props: BoardProps & {
  renderer: "2d" | "3d";
  /** Tells the screen whether the 3D board is in use (even while it is still loading), so it can lay itself out full-bleed. */
  onUse3d?: (use3d: boolean) => void;
  /** The screen supplies its own camera button when the board is full-bleed. */
  hideCameraToggle?: boolean;
}) {
  const { renderer, onUse3d, hideCameraToggle, ...board } = props;
  const [settings] = useSettings();
  const caps = useCapabilities();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shifted, setShifted] = useState<Tier | null>(null);
  const [skip, setSkip] = useState(false);

  useEffect(() => { setSkip(slowThisSession()); }, []);
  useEffect(() => { setShifted(null); }, [settings.quality]);

  const use3d = renderer === "3d" && !failed && !skip;
  useEffect(() => { onUse3d?.(use3d); }, [use3d, onUse3d]);
  const start = (): Tier => {
    const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & { deviceMemory?: number });
    return recalledTier() ?? detectStartTier(caps, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, nav?.hardwareConcurrency ?? 8, nav?.deviceMemory ?? 8);
  };
  const base: Tier = settings.quality === "auto" ? start() : settings.quality;
  const quality: Tier = shifted ?? base;

  const onTier = useCallback((dir: "down" | "up") => {
    if (dir === "up" && settings.quality !== "auto") return;
    const next = dir === "down" ? stepDown(quality) : stepUp(quality);
    if (next) {
      setShifted(next); setReady(false);
      if (settings.quality === "auto") rememberTier(next);
      return;
    }
    if (dir === "up") return;
    try { sessionStorage.setItem(SLOW_KEY, "1"); } catch { /* ignore */ }
    setFailed(true);
    toast({ title: "Switched to the flat board", description: "The 3D board was running slowly on this device.", status: "info", duration: 6000, isClosable: true });
  }, [quality, settings.quality, toast]);
  const onFail = useCallback(() => setFailed(true), []);
  const onReady = useCallback(() => setReady(true), []);

  const showing3d = use3d && ready;
  return (
    <Box position="relative" w="100%" h="100%">
      <Box position="absolute" inset={0} display={showing3d ? "none" : "block"}>{!showing3d && <Board2D {...board} />}</Box>
      {use3d && (
        <Box position="absolute" inset={0} visibility={showing3d ? "visible" : "hidden"}>
          <Board3D {...board} camera={settings.camera} quality={quality} onReady={onReady} onFail={onFail} onTier={onTier} />
        </Box>
      )}
      {showing3d && !hideCameraToggle && (
        <IconButton
          aria-label={settings.camera !== "top" ? "Switch to top-down view" : "Switch to the moving camera"} size="sm" variant="solid"
          colorScheme="whiteAlpha" bg="whiteAlpha.300" color="white" position="absolute" top={2} right={2} fontSize="md"
          icon={<span aria-hidden>{settings.camera !== "top" ? "⬒" : "◩"}</span>}
          onClick={() => updateSettings({ camera: settings.camera !== "top" ? "top" : "follow" })}
        />
      )}
    </Box>
  );
}
