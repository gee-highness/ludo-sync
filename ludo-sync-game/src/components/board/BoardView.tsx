"use client";

import Board2D from "./Board2D";
import type { BoardProps } from "./types";

/** Picks the renderer. Kept as one seam so the 3D board loads only when it is actually used. */
export default function BoardView(props: BoardProps & { renderer: "2d" | "3d" }) {
  const { renderer: _renderer, ...board } = props;
  return <Board2D {...board} />;
}
