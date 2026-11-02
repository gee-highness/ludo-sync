"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { getInteraction } from "@/lib/client/interaction";

/** Keyboard shortcuts for one screen: `{ d: draw, p: pass }`. Ignored while typing, and when the player has switched shortcuts off. */
export function useHotkeys(map: Record<string, (() => void) | undefined>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!getInteraction().shortcuts) return;
      const fn = ref.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Arrow keys, Home and End move between the buttons of a hand or a row, so a keyboard or switch user can walk along it. */
export const roveKeys = (e: KeyboardEvent<HTMLElement | SVGElement>) => {
  const k = e.key;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(k)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), [role=gridcell][tabindex='0']"));
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = k === "Home" ? 0 : k === "End" ? items.length - 1 : (i + (k === "ArrowLeft" || k === "ArrowUp" ? -1 : 1) + items.length) % items.length;
  e.preventDefault();
  items[next]?.focus();
};

/** The key to show on a button. */
export const keyHint = (k: string) => (getInteraction().shortcuts ? k : undefined);
