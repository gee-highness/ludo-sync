"use client";

import { Box, type BoxProps } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useDraggable, useDropTarget } from "./drag";

/** Wrap anything to make it draggable. `data` is what a drop target receives. */
export function Draggable({ id, data, label, disabled, touch, onStart, onEnd, group, children, ...rest }: { id: string; data: unknown; label?: string; disabled?: boolean; touch?: "pan-x" | "none"; onStart?: () => void; onEnd?: (dropped: boolean) => void; group?: () => HTMLElement[]; children: ReactNode } & Omit<BoxProps, "id" | "data">) {
  const d = useDraggable({ id, data, label, disabled, touch, onStart, onEnd, group });
  return <Box {...rest} {...d}>{children}</Box>;
}

/** Wrap a place things can land. While a card is dragged that it accepts, it is outlined; under the pointer it is highlighted. */
export function DropZone({ id, accepts, onDrop, children, ...rest }: { id: string; accepts: (data: unknown) => boolean; onDrop: (data: unknown, sourceId: string) => void; children: ReactNode; type?: "button"; disabled?: boolean } & Omit<BoxProps, "id">) {
  const t = useDropTarget({ id, accepts, onDrop });
  return <Box {...rest} {...t}>{children}</Box>;
}
