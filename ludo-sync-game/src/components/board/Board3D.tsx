"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useMemo, useRef } from "react";
import { SEAT_INFO, SEATS, type Seat } from "@/lib/ludo/board";
import { usePalette } from "@/lib/client/palette";
import { useIslands } from "@/lib/client/islands";
import { tuningOf } from "@/lib/ludo/types";
import { useSettings } from "@/lib/client/settings";
import { resolveDesign, useDesigns, type ResolvedDesign } from "@/lib/client/pieces";
import { LudoScene, type SceneInput } from "./LudoScene";
import { placeTokens, seatTokens } from "./layout";
import type { BoardProps } from "./types";

export interface Board3DProps extends BoardProps {
  camera: "tilt" | "top" | "follow";
  quality: "high" | "low";
  onReady: () => void;
  onFail: () => void;
  onSlow: () => void;
}

/** The 3D board: a canvas for pointers, plus hidden buttons so keyboards and screen readers can play too. */
export default function Board3D(props: Board3DProps) {
  const { state, options, viewSeat, symbols, hints, reduceMotion, hopMs, camera, quality, moving, rollKey = 0, insets } = props;
  // TEMP-DEBUG
  const dbg = typeof window !== "undefined" ? (window as unknown as { __insets?: { top: number; right: number; bottom: number; left: number } }).__insets : undefined;
  const insTop = (dbg ?? insets)?.top ?? 0, insRight = (dbg ?? insets)?.right ?? 0, insBottom = (dbg ?? insets)?.bottom ?? 0, insLeft = (dbg ?? insets)?.left ?? 0;
  const hostRef = useRef<HTMLDivElement>(null);
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
    interactiveSeat, options, viewSeat, symbols, hints, reduceMotion, hopMs, camera, designs: resolved, movePreview: settings.movePreview, neon: settings.boardTheme === "neon", look: settings.boardTheme === "neon", tycoon: state.tycoon ?? null, islands, enterBonus: tuningOf(state.rules).enterBonus,
    rollKey, rolled: state.rolled, rollMs: Math.round(hopMs * 1100 / 170), hold: state.phase === "decide", insets: { top: insTop, right: insRight, bottom: insBottom, left: insLeft },
  }), [state, interactiveSeat, options, viewSeat, symbols, hints, reduceMotion, hopMs, camera, resolved, moving, settings.movePreview, settings.boardTheme, islands, rollKey, insTop, insRight, insBottom, insLeft]);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: LudoScene;
    try {
      scene = new LudoScene(host, {
        quality,
        onPick: token => cb.current.onPick(token),
        onSlow: () => cb.current.onSlow(),
        onContextLost: () => cb.current.onFail(),
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
