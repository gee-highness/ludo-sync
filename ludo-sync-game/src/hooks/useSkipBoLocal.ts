"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseAction } from "@/lib/skipbo/bot";
import { describeEvents } from "@/lib/skipbo/describe";
import { applyAction, createGame } from "@/lib/skipbo/engine";
import { freshSeed } from "@/lib/ludo/rng";
import { saveGame } from "@/lib/skipbo/save";
import type { Action, GameEvent, GameState } from "@/lib/skipbo/types";
import { viewOf, type TableView } from "@/lib/skipbo/view";
import type { SpeedPref } from "@/lib/client/settings";

export interface Feed { frame: { id: number; events: GameEvent[] }; log: string[] }

const MAX_LOG = 60;

/** Keeps a log of what happened and a counter that ticks for every new frame, for sounds and animation. */
export const useFeed = () => {
  const [feed, setFeed] = useState<Feed>({ frame: { id: 0, events: [] }, log: [] });
  const counter = useRef(0);
  const push = useCallback((events: GameEvent[], lines: string[]) => {
    counter.current += 1;
    const id = counter.current;
    setFeed(f => ({ frame: { id, events }, log: [...f.log, ...lines].slice(-MAX_LOG) }));
  }, []);
  const reset = useCallback(() => setFeed({ frame: { id: ++counter.current, events: [] }, log: [] }), []);
  return { feed, push, reset };
};

export interface LocalSkipBo {
  state: GameState;
  view: TableView;
  /** Pass-and-play: whose hand the screen is showing, and whether it is hidden until they tap. */
  covered: boolean;
  coverName: string;
  uncover: () => void;
  feed: Feed;
  act: (a: Action) => boolean;
  rematch: () => void;
}

/** A game that lives entirely on this device: the engine runs here, bots play themselves, and every step is saved. */
export const useSkipBoLocal = (initial: GameState, you: number, speed: SpeedPref, hotseat = false, daily = false): LocalSkipBo => {
  const [state, setState] = useState(initial);
  const ref = useRef(initial);
  const { feed, push, reset } = useFeed();
  // pass and play: the screen shows whoever is to play, and hides their hand until they tap, so the one before cannot be seen
  const [unlocked, setUnlocked] = useState<number | null>(hotseat ? null : you);
  const lastViewer = useRef(you);

  const act = useCallback((action: Action): boolean => {
    const r = applyAction(ref.current, action);
    if (!r) return false;
    ref.current = r.state;
    setState(r.state);
    push(r.events, describeEvents(r.events, viewOf(r.state, you)));
    return true;
  }, [push, you]);

  useEffect(() => { saveGame(state, you, hotseat, daily); }, [state, you, hotseat, daily]);

  // bots take their turns one move at a time, pausing like a person would
  useEffect(() => {
    if (state.phase !== "play" || state.players[state.turn].kind !== "bot") return;
    const wait = speed === "instant" ? 0 : speed === "fast" ? 300 : 750;
    const t = setTimeout(() => { const a = chooseAction(ref.current); if (a) act(a); }, wait);
    return () => clearTimeout(t);
  }, [state, act, speed]);

  const rematch = useCallback(() => {
    const fresh = createGame(ref.current.players.map(p => ({ name: p.name, kind: p.kind, level: p.level })), ref.current.rules, freshSeed());
    ref.current = fresh;
    setState(fresh);
    reset();
  }, [reset]);

  const cur = state.players[state.turn];
  if (hotseat && state.phase === "play" && cur.kind === "human") lastViewer.current = state.turn;
  const viewer = hotseat ? lastViewer.current : you;
  const covered = hotseat && state.phase === "play" && cur.kind === "human" && unlocked !== state.turn;
  const view = useMemo(() => viewOf(state, viewer), [state, viewer]);
  const uncover = useCallback(() => setUnlocked(ref.current.turn), []);
  return { state, view, covered, coverName: cur.name, uncover, feed, act, rematch };
};
