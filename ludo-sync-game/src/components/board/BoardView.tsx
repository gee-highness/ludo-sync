"use client";

import { Box, IconButton, useToast } from "@chakra-ui/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { updateSettings, useSettings } from "@/lib/client/settings";
import { useCapabilities } from "@/lib/client/device";
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
  const [lowered, setLowered] = useState(false);
  const [skip, setSkip] = useState(false);

  useEffect(() => { setSkip(slowThisSession()); }, []);

  const use3d = renderer === "3d" && !failed && !skip;
  useEffect(() => { onUse3d?.(use3d); }, [use3d, onUse3d]);
  const autoQuality = caps?.lowPower ? "low" : "high";
  const quality = lowered ? "low" : settings.quality === "auto" ? autoQuality : settings.quality;

  const onSlow = useCallback(() => {
    if (quality === "high") { setLowered(true); setReady(false); return; }
    try { sessionStorage.setItem(SLOW_KEY, "1"); } catch { /* ignore */ }
    setFailed(true);
    toast({ title: "Switched to the flat board", description: "The 3D board was running slowly on this device.", status: "info", duration: 6000, isClosable: true });
  }, [quality, toast]);
  const onFail = useCallback(() => setFailed(true), []);
  const onReady = useCallback(() => setReady(true), []);

  const showing3d = use3d && ready;
  return (
    <Box position="relative" w="100%" h="100%">
      <Box position="absolute" inset={0} display={showing3d ? "none" : "block"}>{!showing3d && <Board2D {...board} />}</Box>
      {use3d && (
        <Box position="absolute" inset={0} visibility={showing3d ? "visible" : "hidden"}>
          <Board3D {...board} camera={settings.camera} quality={quality} onReady={onReady} onFail={onFail} onSlow={onSlow} />
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
