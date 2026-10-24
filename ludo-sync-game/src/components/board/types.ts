import type { Seat } from "@/lib/ludo/board";
import type { GameState, MoveOption } from "@/lib/ludo/types";

/** What every board renderer (flat or 3D) is given. */
export interface BoardProps {
  /** The state to draw, which may lag the real game while tokens are still hopping. */
  state: GameState;
  /** Seat shown at the bottom of the screen. */
  viewSeat: Seat;
  /** Moves the person may pick right now; empty when the board should not accept input. */
  options: MoveOption[];
  onPick: (token: number) => void;
  symbols: boolean;
  hints: boolean;
  reduceMotion: boolean;
  /** Time for one hop, so the tokens' movement matches the animation timeline. */
  hopMs: number;
  /** The token currently hopping across the board, if any. */
  moving?: { seat: Seat; token: number } | null;
  /** Bumps on every roll, so the 3D board can throw its dice. */
  rollKey?: number;
  /** CSS px of the canvas covered by the interface on each side; the 3D scene frames the board in what is left. */
  insets?: { top: number; right: number; bottom: number; left: number };
  /** True while the person may roll: dragging across the board and letting go throws the dice. */
  rollable?: boolean;
  onThrow?: (t: import("@/lib/client/throw").ThrowInput) => void;
}
