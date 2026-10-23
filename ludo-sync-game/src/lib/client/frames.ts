import type { GameEvent, GameState } from "../ludo/types";

/** One step of a game: the state afterwards and what happened to get there. */
export interface Frame {
  id: number;
  state: GameState;
  events: GameEvent[];
}

/**
 * Carries frames from wherever a game lives (local engine, or snapshots from an online host)
 * to the animator, one by one and in order, even if several arrive in the same React render.
 */
export class FrameBus {
  private subs = new Set<(f: Frame) => void>();
  private nextId = 1;

  push(state: GameState, events: GameEvent[]): Frame {
    const frame: Frame = { id: this.nextId++, state, events };
    this.subs.forEach(s => s(frame));
    return frame;
  }

  subscribe(cb: (f: Frame) => void): () => void {
    this.subs.add(cb);
    return () => { this.subs.delete(cb); };
  }
}
