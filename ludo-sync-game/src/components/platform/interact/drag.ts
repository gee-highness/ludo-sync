"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { getInteraction } from "@/lib/client/interaction";

/**
 * Drag and drop for cards and pieces, the same everywhere. A source is anything you can pick up (`useDraggable`); a target is anything
 * it can be dropped on (`useDropTarget`). Taps and keys keep working because a press that does not move is passed through as a click.
 * Touch: a mostly-vertical drag picks the card up while a sideways swipe still scrolls a hand; a mouse starts after a few pixels.
 */
interface Target { id: string; el: HTMLElement | null; accepts: (data: unknown) => boolean; onDrop: (data: unknown, sourceId: string) => void }
const targets = new Map<string, Target>();

let live: HTMLElement | null = null;
const announce = (text: string) => {
  if (typeof document === "undefined") return;
  if (!live) {
    live = document.createElement("div");
    live.setAttribute("role", "status"); live.setAttribute("aria-live", "assertive");
    Object.assign(live.style, { position: "fixed", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" });
    document.body.appendChild(live);
  }
  live.textContent = "";
  setTimeout(() => { if (live) live.textContent = text; }, 30);
};

const reduce = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface DragSource { id: string; data: unknown; /** Spoken when the card is picked up. */ label?: string; disabled?: boolean; /** "pan-x" lets a sideways swipe scroll a hand; "none" for a fixed layout. */ touch?: "pan-x" | "none"; onStart?: () => void; onEnd?: (dropped: boolean) => void; /** Everything that moves together (a run of cards): the first is the one picked up. */ group?: () => HTMLElement[]; /** Draws the thing that follows the pointer, for sources that cannot be copied (a piece inside an SVG). */ preview?: (box: DOMRect) => HTMLElement }

let suppressClick = false;
const swallowClick = () => {
  suppressClick = true;
  const off = (e: MouseEvent) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } };
  window.addEventListener("click", off, { capture: true, once: true });
  setTimeout(() => { suppressClick = false; window.removeEventListener("click", off, { capture: true }); }, 120);
};

const begin = (e: ReactPointerEvent<HTMLElement | SVGElement>, src: DragSource) => {
  const set = getInteraction();
  if (!set.drag || src.disabled || e.button !== 0 || !e.isPrimary) return;
  const el = e.currentTarget as HTMLElement;
  const touch = e.pointerType === "touch";
  const sx = e.clientX, sy = e.clientY, t0 = Date.now();
  let started = false, hidden: HTMLElement[] = [], clone: HTMLElement | null = null, over: Target | null = null, offX = 0, offY = 0, rect: DOMRect | null = null;
  const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };

  const mark = (t: Target | null) => {
    if (over?.el && over !== t) over.el.removeAttribute("data-drop-over");
    over = t;
    if (t?.el) t.el.setAttribute("data-drop-over", "1");
  };
  const start = (x: number, y: number) => {
    started = true;
    rect = el.getBoundingClientRect();
    offX = x - rect.left; offY = y - rect.top;
    const parts = src.group ? src.group() : [el];
    const custom = src.preview ? src.preview(rect) : null;
    const clean = (n: HTMLElement) => { n.removeAttribute("data-mk"); n.querySelectorAll("[data-mk]").forEach(x => x.removeAttribute("data-mk")); };
    if (custom) { clone = custom; hidden = []; }
    else if (parts.length > 1) {
      clone = document.createElement("div");
      for (const part of parts) {
        const r = part.getBoundingClientRect(), c = part.cloneNode(true) as HTMLElement;
        clean(c);
        Object.assign(c.style, { position: "absolute", left: `${r.left - rect.left}px`, top: `${r.top - rect.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: "0" });
        clone.appendChild(c);
      }
      hidden = parts;
    } else { clone = el.cloneNode(true) as HTMLElement; clean(clone); hidden = [el]; }
    Object.assign(clone.style, { position: "fixed", left: "0", top: "0", width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", pointerEvents: "none", zIndex: "2000", transform: `translate(${rect.left}px, ${rect.top}px) scale(1.08) rotate(3deg)`, transformOrigin: "50% 0%", filter: "drop-shadow(0 12px 16px rgba(0,0,0,.55))", transition: "none" });
    clone.setAttribute("aria-hidden", "true");
    document.body.appendChild(clone);
    hidden.forEach(h => { h.style.opacity = "0.35"; });
    document.body.setAttribute("data-dragging", "1");
    if (set.dropHints) targets.forEach(t => { if (t.el && t.accepts(src.data)) t.el.setAttribute("data-drop-ok", "1"); });
    try { el.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    announce(src.label ? `${src.label}. Drag to a highlighted place, or release to cancel.` : "Picked up. Drag to a highlighted place.");
    src.onStart?.();
  };
  const hit = (x: number, y: number): Target | null => {
    for (const n of document.elementsFromPoint(x, y)) {
      const id = (n as HTMLElement).dataset?.dropId;
      const t = id ? targets.get(id) : undefined;
      if (t && t.accepts(src.data)) return t;
    }
    return null;
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy, dist = Math.hypot(dx, dy);
    if (!started) {
      if (touch) {
        // a sideways swipe is scrolling the hand: leave it to the browser
        if (dist > 10 && Math.abs(dy) < Math.abs(dx) * 0.7 && Date.now() - t0 < 350) { cleanup(); return; }
        if (dist < 10) return;
      } else if (dist < 5) return;
      start(ev.clientX, ev.clientY);
    }
    if (clone) clone.style.transform = `translate(${ev.clientX - offX}px, ${ev.clientY - offY}px) scale(1.08) rotate(3deg)`;
    mark(hit(ev.clientX, ev.clientY));
    ev.preventDefault();
  };
  const finish = (dropped: boolean) => {
    document.body.removeAttribute("data-dragging");
    targets.forEach(t => { t.el?.removeAttribute("data-drop-ok"); t.el?.removeAttribute("data-drop-over"); });
    hidden.forEach(h => { h.style.opacity = ""; });
    el.style.opacity = "";
    src.onEnd?.(dropped);
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    cleanup();
    if (!started) return; // a plain press: let the click happen
    swallowClick();
    const t = over;
    const c = clone;
    if (t) {
      // drop: shrink into the target, then hand over
      const tr = t.el?.getBoundingClientRect();
      if (c && tr && !reduce()) { c.style.transition = "transform .18s ease-in, opacity .18s"; c.style.transform = `translate(${tr.left + tr.width / 2 - (rect?.width ?? 0) / 2}px, ${tr.top + tr.height / 2 - (rect?.height ?? 0) / 2}px) scale(.7)`; c.style.opacity = "0.3"; setTimeout(() => c.remove(), 190); } else c?.remove();
      announce(`Dropped.`);
      finish(true);
      t.onDrop(src.data, src.id);
    } else {
      // nowhere to go: slide back
      if (c && rect && !reduce()) { c.style.transition = "transform .22s cubic-bezier(.2,.8,.3,1), opacity .22s"; c.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(1)`; setTimeout(() => c.remove(), 230); } else c?.remove();
      announce("Cancelled.");
      finish(false);
    }
  };
  const cancel = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; cleanup(); if (started) { clone?.remove(); finish(false); } };
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
};

/** Spread the result on the element to make it draggable. */
export function useDraggable(src: DragSource): { onPointerDown: (e: ReactPointerEvent<HTMLElement | SVGElement>) => void; style: CSSProperties; "data-drag": string } {
  const ref = useRef(src);
  ref.current = src;
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement | SVGElement>) => begin(e, ref.current), []);
  return { onPointerDown, style: { touchAction: src.touch ?? "pan-x", cursor: src.disabled ? undefined : "grab", WebkitTouchCallout: "none", userSelect: "none" }, "data-drag": src.id };
}

/** Register a place things can be dropped. Put the returned `ref` and data attribute on the element. */
export function useDropTarget(t: { id: string; accepts: (data: unknown) => boolean; onDrop: (data: unknown, sourceId: string) => void }) {
  const ref = useRef<HTMLElement | null>(null);
  const cfg = useRef(t);
  cfg.current = t;
  useEffect(() => {
    const entry: Target = { id: t.id, get el() { return ref.current; }, accepts: d => cfg.current.accepts(d), onDrop: (d, s) => cfg.current.onDrop(d, s) } as Target;
    targets.set(t.id, entry);
    return () => { if (targets.get(t.id) === entry) targets.delete(t.id); };
  }, [t.id]);
  return { ref: (el: HTMLElement | null) => { ref.current = el; }, "data-drop-id": t.id } as const;
}
