"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { useSettings } from "@/lib/client/settings";
import type { GameEvent } from "@/lib/skipbo/types";

interface Rect { x: number; y: number; w: number; h: number }

const BASE_MS = 480;

/**
 * Makes Skip-Bo cards travel: a played card flies from your hand, stock or discard (or from the opponent's panel) to the building pile,
 * a discard flies to its pile and drawn cards fly from the draw pile. Cards carry no ids in this game, so this works from the frame's
 * events and from `data-anchor` places, remembering where every anchor was before the new frame was drawn. Respects speed and reduced motion.
 */
export function useSkipBoMotion(rootRef: RefObject<HTMLElement | null>, frame: { id: number; events: GameEvent[] }, you: number | null) {
  const [settings] = useSettings();
  const prev = useRef<Map<string, Rect & { val: string }>>(new Map());
  const last = useRef(frame.id);
  const factor = settings.speed === "instant" ? 0 : settings.speed === "fast" ? 0.55 : 1;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : BASE_MS * factor;
    const base = root.getBoundingClientRect();
    const cur = new Map<string, Rect & { val: string }>();
    root.querySelectorAll<HTMLElement>("[data-anchor]").forEach(el => {
      const b = el.getBoundingClientRect();
      cur.set(el.dataset.anchor!, { x: b.left - base.left, y: b.top - base.top, w: b.width, h: b.height, val: el.dataset.val ?? "" });
    });
    const before = prev.current;
    prev.current = cur;
    const isNew = frame.id !== last.current;
    last.current = frame.id;
    if (!isNew || dur <= 0) return;

    let layer = root.querySelector<HTMLElement>(":scope > [data-motion-layer]");
    if (!layer) {
      layer = document.createElement("div");
      layer.dataset.motionLayer = "1";
      layer.setAttribute("aria-hidden", "true");
      Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "60", overflow: "visible" });
      root.appendChild(layer);
    }
    const lay = layer;
    let n = 0;
    const fly = (name: string, from: Rect | undefined, to: Rect | undefined, hide?: HTMLElement | null) => {
      const el = root.querySelector<HTMLElement>(`[data-anchor="${name}"]`);
      const card = (el?.querySelector<HTMLElement>("[data-card]") ?? el?.firstElementChild) as HTMLElement | null;
      if (!from || !to || !card) return;
      const c = card.cloneNode(true) as HTMLElement;
      Object.assign(c.style, { position: "absolute", left: `${to.x}px`, top: `${to.y}px`, width: `${card.offsetWidth}px`, height: `${card.offsetHeight}px`, margin: "0", transformOrigin: "0 0", animation: "none", transform: "", visibility: "visible" });
      lay.appendChild(c);
      const cx = (r: Rect) => r.x + r.w / 2 - card.offsetWidth / 2, cy = (r: Rect) => r.y + r.h / 2 - card.offsetHeight / 2;
      const hold = hide ?? card;
      hold.style.visibility = "hidden";
      const a = c.animate([
        { transform: `translate(${cx(from) - cx(to)}px, ${cy(from) - cy(to)}px) scale(.9)`, opacity: 0.55 },
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      ], { duration: dur, delay: Math.min(n++, 6) * 90 * factor, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both" });
      const done = () => { c.remove(); hold.style.visibility = ""; };
      a.onfinish = done; a.oncancel = done;
    };
    const handSrc = (p: number, card?: number, index?: number) => {
      if (p !== you) return before.get(`opp${p}`);
      if (index !== undefined && before.has(`hand${index}`)) return before.get(`hand${index}`);
      for (const [k, r] of before) if (k.startsWith("hand") && r.val === String(card)) return r;
      return before.get("hand");
    };
    for (const e of frame.events) {
      if (e.type === "play") {
        const s = e.source;
        const from = s.from === "hand" ? handSrc(e.player, e.card, s.index) : s.from === "stock" ? before.get(`stock${e.player}`) : before.get(`disc${e.player}-${s.pile}`);
        fly(`build${e.to}`, from, cur.get(`build${e.to}`));
      } else if (e.type === "discard") {
        fly(`disc${e.player}-${e.pile}`, handSrc(e.player, e.card), cur.get(`disc${e.player}-${e.pile}`));
      } else if (e.type === "draw") {
        const k = Math.min(e.count, 5);
        for (let i = 0; i < k; i++) {
          const to = e.player === you ? cur.get("hand") : cur.get(`opp${e.player}`);
          // a card back copied from the draw pile, flying to the hand
          const d = root.querySelector<HTMLElement>('[data-anchor="draw"]');
          const back = d?.firstElementChild as HTMLElement | null;
          const from = before.get("draw");
          if (!to || !from || !back) continue;
          const c = back.cloneNode(true) as HTMLElement;
          const w = back.offsetWidth, h = back.offsetHeight;
          Object.assign(c.style, { position: "absolute", left: `${to.x + to.w / 2 - w / 2}px`, top: `${to.y + to.h / 2 - h / 2}px`, width: `${w}px`, height: `${h}px`, margin: "0", transformOrigin: "0 0", animation: "none" });
          lay.appendChild(c);
          const dx = from.x + from.w / 2 - (to.x + to.w / 2), dy = from.y + from.h / 2 - (to.y + to.h / 2);
          const a = c.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 }, { transform: "translate(0px, 0px) scale(.8)", opacity: 0.2 }], { duration: dur, delay: Math.min(n++, 6) * 90 * factor, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both" });
          const done = () => c.remove();
          a.onfinish = done; a.oncancel = done;
        }
      }
    }
  });
}
