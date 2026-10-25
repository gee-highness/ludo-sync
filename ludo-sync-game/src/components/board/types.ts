import type { Seat } from "@/lib/ludo/board";
import type { GameState, MoveOption } from "@/lib/ludo/types";
import type { LastMove } from "@/lib/client/lastMove";

/** What every board renderer (flat or 3D) is given. */
export interface BoardProps {
  /** The part of the day, for the sky behind the 3D board. */
  phase?: import("@/lib/client/scenery").DayPhase;
  /** How much to darken the board for evening and night, 0 to 0.5. */
  dim?: number;
  /** The token that moved most recently, so the board can keep marking where it came from and where it went. */
  lastMove?: LastMove | null;
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
  rolled?: number[];
  /** CSS px of the canvas covered by the interface on each side; the 3D scene frames the board in what is left. */
  insets?: { top: number; right: number; bottom: number; left: number };
  /** True while the person may roll: dragging across the board and letting go throws the dice. */
  rollable?: boolean;
  onThrow?: (t: import("@/lib/client/throw").ThrowInput) => void;
}
