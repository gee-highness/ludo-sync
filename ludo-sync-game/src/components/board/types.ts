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
}
