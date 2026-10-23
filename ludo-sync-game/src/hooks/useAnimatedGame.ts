"use client";

import { useEffect, useRef, useState } from "react";
import { planSteps, rollMs, stepMs, withToken, type AnimStep } from "@/lib/client/anim";
import type { Frame, FrameBus } from "@/lib/client/frames";
import type { SpeedPref } from "@/lib/client/settings";
import type { GameState } from "@/lib/ludo/types";
import type { Seat } from "@/lib/ludo/board";

export interface AnimatedGame {
  /** What the screen should draw right now: lags the real state while tokens are still travelling. */
  shown: GameState;
  /** True while dice are rolling or tokens are moving; input should wait. */
  busy: boolean;
  /** Increases on every roll so the dice can replay their tumble. */
  rollKey: number;
  /** The token currently hopping square by square; null when everything is at rest. */
  moving: { seat: Seat; token: number } | null;
}

interface Options {
  speed: SpeedPref;
  onFrameStart?: (frame: Frame) => void;
  onStep?: (step: AnimStep) => void;
  onFrameEnd?: (frame: Frame) => void;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Plays frames in order. Each frame first shows its dice, then hops tokens along their paths,
 * then settles on the frame's true state. Frames that arrive mid-animation wait their turn, so
 * a fast bot or a burst of online updates is never skipped or shown out of order.
 */
export const useAnimatedGame = (bus: FrameBus, initial: GameState, options: Options): AnimatedGame => {
  const [shown, setShown] = useState<GameState>(initial);
  const [busy, setBusy] = useState(false);
  const [rollKey, setRollKey] = useState(0);
  const [moving, setMoving] = useState<{ seat: Seat; token: number } | null>(null);

  const opts = useRef(options);
  opts.current = options;
  const shownRef = useRef(initial);
  const queue = useRef<Frame[]>([]);
  const running = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    const show = (s: GameState) => { shownRef.current = s; setShown(s); };

    const play = async (frame: Frame) => {
      const speed = opts.current.speed;
      const prev = shownRef.current;
      const isNewGame = frame.state.seq < prev.seq || frame.state.players.length !== prev.players.length;
      if (isNewGame) { show(frame.state); return; }

      opts.current.onFrameStart?.(frame);
      // new dice and phase appear straight away; tokens stay put until they travel
      show({ ...frame.state, players: prev.players });
      if (frame.events.some(e => e.type === "roll")) {
        setRollKey(k => k + 1);
        await sleep(rollMs(speed));
        if (!alive.current) return;
      }
      for (const step of planSteps(prev, frame.state)) {
        shownRef.current = withToken(shownRef.current, step.seat, step.token, step.progress);
        setMoving(m => (m && m.seat === step.seat && m.token === step.token ? m : { seat: step.seat, token: step.token }));
        setShown(shownRef.current);
        opts.current.onStep?.(step);
        await sleep(stepMs(step.kind, speed));
        if (!alive.current) return;
      }
      setMoving(null);
      show(frame.state);
      opts.current.onFrameEnd?.(frame);
    };

    const pump = async () => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      while (queue.current.length && alive.current) {
        await play(queue.current.shift()!);
      }
      running.current = false;
      if (alive.current) setBusy(false);
    };

    const unsubscribe = bus.subscribe(frame => { queue.current.push(frame); void pump(); });
    return () => {
      alive.current = false;
      running.current = false;
      queue.current = [];
      unsubscribe();
    };
  }, [bus]);

  return { shown, busy, rollKey, moving };
};
