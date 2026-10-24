"use client";

import { isWorld } from "@/lib/client/themes";
import { Box } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SEAT_INFO, SEATS, type Seat } from "@/lib/ludo/board";
import { usePalette } from "@/lib/client/palette";
import { useIslands } from "@/lib/client/islands";
import { tuningOf } from "@/lib/ludo/types";
import { useSettings } from "@/lib/client/settings";
import { resolveDesign, useDesigns, type ResolvedDesign } from "@/lib/client/pieces";
import type { Tier } from "@/lib/client/quality";
import { LudoScene, type SceneInput } from "./LudoScene";
import { placeTokens, seatTokens } from "./layout";
import type { BoardProps } from "./types";

export interface Board3DProps extends BoardProps {
  camera: "tilt" | "top" | "follow";
  quality: Tier;
  onReady: () => void;
  onFail: () => void;
  onTier: (dir: "down" | "up") => void;
}

/** The 3D board: a canvas for pointers, plus hidden buttons so keyboards and screen readers can play too. */
export default function Board3D(props: Board3DProps) {
  const { state, options, viewSeat, symbols, hints, reduceMotion, hopMs, camera, quality, moving, rollKey = 0, insets } = props;
  // TEMP-DEBUG
  const insTop = insets?.top ?? 0, insRight = insets?.right ?? 0, insBottom = insets?.bottom ?? 0, insLeft = insets?.left ?? 0;
  const hostRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const sceneRef = useRef<LudoScene | null>(null);
  const cb = useRef(props);
  cb.current = props;

  const [settings] = useSettings();
  const islands = useIslands();
  const palette = usePalette();
  const designs = useDesigns();
  const resolved = useMemo(
    () => Object.fromEntries(SEATS.map(s => [s, designs[s].map(d => resolveDesign(d, s))])) as Record<Seat, ResolvedDesign[]>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [designs, palette],
  );
  const interactiveSeat = options.length ? state.players[state.turn].seat : null;
  const input: SceneInput = useMemo(() => ({
    tokens: placeTokens(seatTokens(state), moving),
    playing: new Set(state.players.map(p => p.seat)),
    activeSeat: state.phase === "over" ? null : state.players[state.turn].seat, winnerSeat: state.winner,
    interactiveSeat, options, viewSeat, symbols, hints, reduceMotion, hopMs, camera, designs: resolved, movePreview: settings.movePreview, neon: isWorld(settings.boardTheme), look: isWorld(settings.boardTheme), theme: settings.boardTheme, tycoon: state.tycoon ?? null, islands, enterBonus: tuningOf(state.rules).enterBonus,
    rollKey, rollable: !!props.rollable, rolled: state.rolled, rollMs: Math.round(hopMs * 1100 / 170), hold: state.phase === "decide", insets: { top: insTop, right: insRight, bottom: insBottom, left: insLeft },
  }), [state, interactiveSeat, options, viewSeat, symbols, hints, reduceMotion, hopMs, camera, resolved, moving, settings.movePreview, settings.boardTheme, islands, rollKey, props.rollable, insTop, insRight, insBottom, insLeft]);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: LudoScene;
    setDrawn(false);
    try {
      scene = new LudoScene(host, {
        quality,
        onPick: token => cb.current.onPick(token),
        onTier: dir => cb.current.onTier(dir),
        onThrow: t => cb.current.onThrow?.(t),
        onContextLost: () => cb.current.onFail(),
        onFirstFrame: () => setDrawn(true),
      });
    } catch {
      cb.current.onFail();
      return;
    }
    sceneRef.current = scene;
    scene.update(inputRef.current);
    scene.load().then(() => cb.current.onReady()).catch(() => cb.current.onFail());
    return () => { scene.dispose(); sceneRef.current = null; };
  }, [quality]);

  useEffect(() => { sceneRef.current?.update(input); }, [input]);

  const movable = options.filter((o, i, all) => all.findIndex(x => x.token === o.token) === i);
  return (
    <Box position="relative" w="100%" h="100%">
      <Box ref={hostRef} position="absolute" inset={0} borderRadius="lg" overflow="hidden" bg="#151515" />
      {!drawn && (
        <Box
          position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center" pointerEvents="none"
          bg="linear-gradient(180deg, #0b1030, #1b1146 55%, #3a1a5e)" color="whiteAlpha.800" fontSize="sm" letterSpacing="0.08em"
          role="status" aria-live="polite"
        >
          Loading city…
        </Box>
      )}
      <Box as="ul" listStyleType="none" m={0} p={0} position="absolute" w="1px" h="1px" overflow="hidden" clipPath="inset(50%)">
        {movable.map(o => {
          const seat = interactiveSeat!;
          const dice = options.filter(x => x.token === o.token).map(x => x.die).join(" or ");
          return (
            <li key={o.token}>
              <button
                type="button" aria-label={`${SEAT_INFO[seat].name} token ${o.token + 1}, can move ${dice}`}
                onClick={() => props.onPick(o.token)}
                onFocus={() => sceneRef.current?.setHover(o.token)} onBlur={() => sceneRef.current?.setHover(null)}
              />
            </li>
          );
        })}
      </Box>
    </Box>
  );
}
