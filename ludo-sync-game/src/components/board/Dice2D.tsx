"use client";

import { useEffect, useRef } from "react";
import { FLIGHT_SECONDS, flyDice, type DiceFlight } from "@/lib/client/diceFlight";
import { defaultThrow, takePendingThrow } from "@/lib/client/throw";

/** Which of seven pip positions (top-left, top-right, middle-left, centre, middle-right, bottom-left, bottom-right) each face lights. */
const PIPS: Record<number, number[]> = { 1: [3], 2: [0, 6], 3: [0, 3, 6], 4: [0, 1, 5, 6], 5: [0, 1, 3, 5, 6], 6: [0, 1, 2, 4, 5, 6] };
const PIP_AT: [number, number][] = [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0], [0, 0], [0.26, 0], [-0.26, 0.26], [0.26, 0.26]];

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

interface Props {
  /** Bumps on every roll. */
  rollKey?: number;
  /** The faces the engine rolled; the dice always settle on these. */
  rolled: number[];
  /** Centre of the board in the svg's own coordinates. */
  cx?: number;
  cy?: number;
  reduceMotion: boolean;
  /** A token is travelling: the dice fade out of the way. */
  moving: boolean;
  /** Tint of the pips. */
  pip?: string;
}

/**
 * Two (or one) dice thrown across the board when a roll arrives: they fly from where the finger let go, bounce off the board's
 * edge, tumble and settle on the faces the engine rolled. Animated by writing to a few SVG elements from requestAnimationFrame,
 * so a frame costs a handful of attribute writes, not a React render. Drawn in the viewer's frame, over the (rotated) board.
 */
export default function Dice2D({ rollKey, rolled, cx = 7, cy = 7, reduceMotion, moving, pip = "#16337a" }: Props) {
  const root = useRef<SVGGElement>(null);
  const dieEls = useRef<(SVGGElement | null)[]>([]);
  const bodyEls = useRef<(SVGGElement | null)[]>([]);
  const shadowEls = useRef<(SVGEllipseElement | null)[]>([]);
  const pipEls = useRef<(SVGCircleElement | null)[][]>([[], []]);
  const latest = useRef({ rolled, reduceMotion, moving });
  latest.current = { rolled, reduceMotion, moving };
  const firstKey = useRef(rollKey);
  const flight = useRef<{ f: DiceFlight; t0: number; raf: number; fade: number } | null>(null);
  const count = Math.max(1, Math.min(2, rolled.length || 1));

  const draw = (f: DiceFlight, t: number) => {
    const frames = f.frame(t);
    frames.forEach((d, i) => {
      const el = dieEls.current[i], body = bodyEls.current[i], shadow = shadowEls.current[i];
      if (!el || !body || !shadow) return;
      el.setAttribute("transform", `translate(${cx + d.x} ${cy + d.z})`);
      const s = 1 + d.lift * 0.12;
      body.setAttribute("transform", `translate(0 ${-d.lift * 0.55}) rotate(${d.rot}) scale(${s})`);
      shadow.setAttribute("transform", `translate(${d.lift * 0.18} ${0.5 + d.lift * 0.12})`);
      shadow.setAttribute("opacity", String(Math.max(0.12, 0.4 - d.lift * 0.16)));
      const lit = PIPS[d.face] ?? PIPS[1];
      pipEls.current[i].forEach((c, k) => c?.setAttribute("opacity", lit.includes(k) ? "1" : "0"));
    });
  };

  const stop = () => {
    const cur = flight.current;
    if (cur) { cancelAnimationFrame(cur.raf); window.clearTimeout(cur.fade); }
  };

  useEffect(() => {
    if (rollKey === undefined || rollKey === firstKey.current) return;
    const { rolled: faces, reduceMotion: calm } = latest.current;
    if (!faces.length) return;
    stop();
    const th = takePendingThrow() ?? defaultThrow(mulberry(rollKey * 977));
    const f = flyDice(th, faces, rollKey);
    const g = root.current;
    if (!g) return;
    g.style.transition = "none";
    g.setAttribute("opacity", "1");
    const state = { f, t0: performance.now(), raf: 0, fade: 0 };
    flight.current = state;
    const done = () => {
      // the dice stay on the board for the move, then slip away
      state.fade = window.setTimeout(() => { g.style.transition = "opacity .4s"; g.setAttribute("opacity", "0"); }, 2600);
    };
    if (calm) { draw(f, FLIGHT_SECONDS); done(); return; }
    const tick = (now: number) => {
      const t = (now - state.t0) / 1000;
      draw(f, Math.min(t, FLIGHT_SECONDS));
      if (t < FLIGHT_SECONDS) state.raf = requestAnimationFrame(tick); else done();
    };
    state.raf = requestAnimationFrame(tick);
    return undefined;
    // a roll is an event: only a new key starts a throw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey]);

  // out of the way as soon as a token starts to move
  useEffect(() => {
    if (!moving) return;
    const cur = flight.current;
    const g = root.current;
    if (!cur || !g) return;
    window.clearTimeout(cur.fade);
    g.style.transition = "opacity .35s";
    g.setAttribute("opacity", "0");
  }, [moving]);

  useEffect(() => () => stop(), []);

  return (
    <g ref={root} opacity={0} pointerEvents="none" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <g key={i} ref={el => { dieEls.current[i] = el; }}>
          <ellipse ref={el => { shadowEls.current[i] = el; }} rx={0.55} ry={0.2} fill="#000" opacity={0.4} />
          <g ref={el => { bodyEls.current[i] = el; }}>
            <rect x={-0.55} y={-0.55} width={1.1} height={1.1} rx={0.2} fill="#f6f4ec" stroke="#9fb4e8" strokeWidth={0.06} />
            <rect x={-0.5} y={-0.5} width={1.0} height={0.42} rx={0.18} fill="#fff" opacity={0.55} />
            {PIP_AT.map(([x, y], k) => <circle key={k} ref={el => { (pipEls.current[i] ||= [])[k] = el; }} cx={x} cy={y} r={0.1} fill={pip} opacity={0} />)}
          </g>
        </g>
      ))}
    </g>
  );
}
