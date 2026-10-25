"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autoAction } from "@/lib/ludo/bot";
import { applyAction, currentPlayer } from "@/lib/ludo/engine";
import type { Action, GameState } from "@/lib/ludo/types";
import { FrameBus } from "@/lib/client/frames";
import { saveGame } from "@/lib/client/save";
import type { PaletteMap } from "@/lib/client/palette";
import type { Seat } from "@/lib/ludo/board";
import type { SpeedPref } from "@/lib/client/settings";

export interface LocalGame {
  state: GameState;
  bus: FrameBus;
  act: (action: Action) => boolean;
  /** Replace the game outright (new game, rematch). */
  reset: (state: GameState) => void;
}

/** A game that lives entirely on this device: the engine runs here and bots play themselves. */
export const useLocalGame = (initial: GameState, humanSeats: Seat[], palette: PaletteMap = {}): LocalGame => {
  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  const bus = useMemo(() => new FrameBus(), []);

  const act = useCallback((action: Action): boolean => {
    const result = applyAction(stateRef.current, action);
    if (!result) return false;
    stateRef.current = result.state;
    setState(result.state);
    bus.push(result.state, result.events);
    return true;
  }, [bus]);

  const reset = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
    bus.push(next, []);
  }, [bus]);

  // every step is saved, so closing the tab (or losing power) never loses a game
  useEffect(() => { saveGame(state, humanSeats, palette); }, [state, humanSeats, palette]);

  return { state, bus, act, reset };
};

/** Plays for bots: waits for animations to finish, pauses like a person would, then acts. */
export const useBotDriver = (
  state: GameState, busy: boolean, act: (a: Action) => boolean, speed: SpeedPref, paused = false,
) => {
  useEffect(() => {
    if (busy || paused || state.phase === "over") return;
    const player = currentPlayer(state);
    if (player.kind !== "bot") return;
    const think = speed === "instant" ? 0 : speed === "fast" ? 250 : state.phase === "roll" ? 1100 : 1400;
    const timer = setTimeout(() => {
      const action = autoAction(state);
      if (action) act(action);
    }, think);
    return () => clearTimeout(timer);
  }, [state, busy, paused, act, speed]);
};
