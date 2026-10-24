import { pointOf, type Point, type Seat } from "../ludo/board";
import { pathBetween } from "../ludo/engine";
import type { MoveOption } from "../ludo/types";

export interface MovePreviewPath {
  token: number;
  die: number;
  /** The squares the token passes over, not including where it stands or where it lands. */
  dots: Point[];
  /** Where it will land. */
  end: Point;
}

/** What to draw for one possible move: a dot on each square it crosses and a mark on the last one. */
export const previewPath = (seat: Seat, o: MoveOption): MovePreviewPath => {
  const steps = pathBetween(o.from, o.to);
  const squares = steps.map(p => pointOf(seat, o.token, p));
  const end = squares[squares.length - 1] ?? pointOf(seat, o.token, o.to);
  return { token: o.token, die: o.die, dots: squares.slice(0, -1), end };
};
