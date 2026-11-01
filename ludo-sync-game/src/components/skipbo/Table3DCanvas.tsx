"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { registerSnapshot } from "@/lib/client/photo";
import type { Tier } from "@/lib/client/quality";
import { SkipBoScene, type Pick, type SceneInput } from "./SkipBoScene";

interface Props {
  input: SceneInput;
  quality: Tier;
  onPick: (p: Pick) => void;
  onTier: (dir: "down" | "up") => void;
  onFail: () => void;
  onReady: () => void;
}

/** The canvas of the 3D table: it owns the scene for as long as it is on screen and hands it every new position. */
export default function Table3DCanvas({ input, quality, onPick, onTier, onFail, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SkipBoScene | null>(null);
  const cb = useRef({ onPick, onTier, onFail, onReady });
  cb.current = { onPick, onTier, onFail, onReady };
  const inputRef = useRef(input);
  inputRef.current = input;
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setDrawn(false);
    let scene: SkipBoScene;
    try {
      scene = new SkipBoScene(el, {
        quality,
        onPick: p => cb.current.onPick(p),
        onTier: d => cb.current.onTier(d),
        onContextLost: () => cb.current.onFail(),
        onFirstFrame: () => { setDrawn(true); cb.current.onReady(); },
      });
    } catch {
      cb.current.onFail();
      return;
    }
    sceneRef.current = scene;
    scene.update(inputRef.current);
    registerSnapshot(() => scene.snapshot());
    return () => { registerSnapshot(null); scene.dispose(); sceneRef.current = null; };
  }, [quality]);

  useEffect(() => { sceneRef.current?.update(input); }, [input]);

  return (
    <Box position="absolute" inset={0}>
      <Box ref={host} position="absolute" inset={0} bg="#07140e" />
      {!drawn && <Box position="absolute" inset={0} display="grid" placeItems="center" bg="#0c3a27" color="whiteAlpha.800" fontSize="sm" letterSpacing="0.08em" role="status">Setting the table…</Box>}
    </Box>
  );
}
