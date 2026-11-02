"use client";

import { useEffect } from "react";
import { useInteraction } from "@/lib/client/interaction";

/** Applies the player's accessibility choices to the whole page: bigger text scales everything (all sizes are in rem), bigger targets set a flag the styles read. */
export function InteractionEffect() {
  const [s] = useInteraction();
  useEffect(() => {
    const h = document.documentElement;
    h.style.fontSize = s.textScale === 100 ? "" : `${s.textScale}%`;
    if (s.bigTargets) h.setAttribute("data-big-targets", "1"); else h.removeAttribute("data-big-targets");
  }, [s.textScale, s.bigTargets]);
  return null;
}
