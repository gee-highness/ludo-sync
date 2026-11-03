"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { useSettings } from "@/lib/client/settings";
import type { GameEvent } from "@/lib/platform/types";

interface Rect { x: number; y: number; w: number; h: number }
interface Snap { r: Rect; el: HTMLElement }

export interface MotionConfig {
  /** The seat looking at this screen, so a card played by someone else flies in from their hand. */
  me: number | null;
  /** Where a card that was not on screen a moment ago comes from: the name of a `data-anchor` element, or null to fade it in. */
  enter?: (key: string, events: GameEvent[]) => string | null;
  /** Where a card that left the screen goes: the name of a `data-anchor`, or null to fade it out where it was. */
  exit?: (key: string, events: GameEvent[]) => string | null;
  /** Card backs that fly between two anchors for something with no card on screen, like an opponent drawing. */
  fly?: (events: GameEvent[]) => { from: string; to: string; count?: number }[];
}

const BASE_MS = 640;

/**
 * Makes cards travel instead of vanishing and reappearing. Give every card `data-mk` (a stable key such as its id) and every place
 * cards come from or go to `data-anchor`. After each new frame, a card that moved glides from where it was to where it is, a card that
 * arrived flies in from its source, and a card that left flies to its destination. Respects the speed setting and reduced motion.
 */
export function useMotion(rootRef: RefObject<HTMLElement | null>, frame: { id: number; events: GameEvent[] }, cfg: MotionConfig) {
  const [settings] = useSettings();
  const snap = useRef<Map<string, Snap>>(new Map());
  const last = useRef(frame.id);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const factor = settings.speed === "instant" ? 0 : settings.speed === "fast" ? 0.55 : 1;

  // runs after every render: cheap bookkeeping, and the animation only when a new frame arrived
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : BASE_MS * factor;
    const base = root.getBoundingClientRect();
    const rel = (b: DOMRect): Rect => ({ x: b.left - base.left, y: b.top - base.top, w: b.width, h: b.height });
    const cur = new Map<string, Snap>();
    root.querySelectorAll<HTMLElement>("[data-mk]").forEach(el => { const k = el.dataset.mk!; if (!cur.has(k)) cur.set(k, { r: rel(el.getBoundingClientRect()), el }); });

    const isNew = frame.id !== last.current;
    last.current = frame.id;
    if (isNew && dur > 0) {
      const events = frame.events;
      let layer = root.querySelector<HTMLElement>(":scope > [data-motion-layer]");
      if (!layer) {
        layer = document.createElement("div");
        layer.dataset.motionLayer = "1";
        layer.setAttribute("aria-hidden", "true");
        Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "60", overflow: "visible" });
        root.appendChild(layer);
      }
      const anchor = (id: string | null): Rect | null => { if (!id) return null; const a = root.querySelector<HTMLElement>(`[data-anchor="${id}"]`); return a ? rel(a.getBoundingClientRect()) : null; };
      const place = (src: HTMLElement, at: Rect): HTMLElement => {
        const c = src.cloneNode(true) as HTMLElement;
        c.removeAttribute("data-mk");
        c.querySelectorAll("[data-mk]").forEach(n => n.removeAttribute("data-mk"));
        Object.assign(c.style, { position: "absolute", left: `${at.x}px`, top: `${at.y}px`, width: `${at.w}px`, height: `${at.h}px`, margin: "0", transformOrigin: "0 0", visibility: "visible" });
        layer!.appendChild(c);
        return c;
      };
      const centred = (a: Rect, w: number, h: number): Rect => ({ x: a.x + a.w / 2 - w / 2, y: a.y + a.h / 2 - h / 2, w, h });
      let n = 0;
      const go = (clone: HTMLElement, from: Rect, to: Rect, o: { fromOpacity?: number; toOpacity?: number; fromScale?: number; toScale?: number; real?: HTMLElement; stagger?: boolean; lift?: boolean }) => {
        const sx0 = (o.fromScale ?? from.w / to.w), sx1 = o.toScale ?? 1;
        const dx = from.x - to.x, dy = from.y - to.y;
        const far = Math.hypot(dx, dy) > 40;
        // a card travelling a distance rises a little in the middle, like a hand carrying it, then settles
        const kf: Keyframe[] = [{ transform: `translate(${dx}px, ${dy}px) scale(${sx0})`, opacity: o.fromOpacity ?? 1, offset: 0 }];
        if (far && o.lift !== false) kf.push({ transform: `translate(${dx / 2}px, ${dy / 2 - Math.min(26, Math.hypot(dx, dy) / 6)}px) scale(${(sx0 + sx1) / 2 + 0.12})`, opacity: 1, offset: 0.5 });
        kf.push({ transform: `translate(0px, 0px) scale(${sx1})`, opacity: o.toOpacity ?? 1, offset: 1 });
        if (o.real) o.real.style.visibility = "hidden";
        clone.style.willChange = "transform, opacity";
        clone.style.zIndex = "2";
        if (far) clone.style.filter = "drop-shadow(0 6px 8px rgba(0,0,0,.45))";
        const a = clone.animate(kf, { duration: dur, delay: o.stagger ? Math.min(n++, 6) * 60 * factor : 0, easing: "cubic-bezier(.45,.05,.25,1)", fill: "both" });
        const done = () => { clone.remove(); if (o.real) o.real.style.visibility = ""; };
        a.onfinish = done; a.oncancel = done;
      };

      cur.forEach((c, key) => {
        const p = snap.current.get(key);
        if (p) {
          if (Math.abs(p.r.x - c.r.x) > 3 || Math.abs(p.r.y - c.r.y) > 3 || Math.abs(p.r.w - c.r.w) > 3) go(place(c.el, c.r), p.r, c.r, { real: c.el });
          return;
        }
        const from = anchor(cfgRef.current.enter?.(key, events) ?? null);
        if (from) go(place(c.el, c.r), centred(from, c.r.w * 0.7, c.r.h * 0.7), c.r, { fromOpacity: 0.35, real: c.el, stagger: true });
        else go(place(c.el, c.r), c.r, c.r, { fromScale: 0.85, fromOpacity: 0, real: c.el, lift: false });
      });
      snap.current.forEach((p, key) => {
        if (cur.has(key)) return;
        const to = anchor(cfgRef.current.exit?.(key, events) ?? null);
        const clone = place(p.el, p.r);
        if (to) go(clone, p.r, centred(to, p.r.w * 0.6, p.r.h * 0.6), { toOpacity: 0.85, toScale: 0.6, stagger: true });
        else go(clone, p.r, p.r, { toScale: 0.8, toOpacity: 0, lift: false });
      });
      for (const f of cfgRef.current.fly?.(events) ?? []) {
        const a = anchor(f.from), b = anchor(f.to);
        if (!a || !b) continue;
        for (let i = 0; i < Math.min(f.count ?? 1, 5); i++) {
          const w = 36, h = 51;
          // a copy of a real card back on screen, so the flying card looks like the player's own deck
          const tpl = root.querySelector<HTMLElement>("[data-cardback]");
          let back: HTMLElement;
          if (tpl) { back = tpl.cloneNode(true) as HTMLElement; back.removeAttribute("data-cardback"); }
          else { back = document.createElement("div"); Object.assign(back.style, { background: "#1e3a8a", border: "3px solid #f8fafc", borderRadius: "6px", boxSizing: "border-box" }); }
          layer.appendChild(back);
          const from = centred(a, w, h), to = centred(b, w, h);
          Object.assign(back.style, { position: "absolute", left: `${to.x}px`, top: `${to.y}px`, width: `${w}px`, height: `${h}px`, transformOrigin: "0 0", margin: "0", transform: "", boxShadow: "0 2px 6px rgba(0,0,0,.5)", filter: "" });
          go(back, from, to, { fromScale: 1, toOpacity: 0.3, stagger: true });
        }
      }
    }
    snap.current = cur;
  });
}
