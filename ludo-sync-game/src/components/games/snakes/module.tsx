"use client";

import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { stepMs } from "@/lib/client/anim";
import { useSettings } from "@/lib/client/settings";
import { num } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { snakes, squareXY, walkOf, type SAction, type SView } from "@/lib/games/snakes/driver";
import { SEAT_COLOURS } from "../../platform/TableFrame";

const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const MARKS = ["●", "▲", "■", "◆", "★", "♥"];

function Die({ v, sides }: { v: number; sides: number }) {
  return <Box as="span" display="inline-grid" placeItems="center" w="46px" h="46px" borderRadius="10px" bg="white" color="#0f172a" fontWeight={900} fontSize={sides <= 6 ? "38px" : "22px"} lineHeight={1} boxShadow="0 2px 6px rgba(0,0,0,.5)" aria-label={`die showing ${v}`}>{sides <= 6 ? FACES[v] : v}</Box>;
}

function Table({ base, view, act, frame }: TableProps<SView, SAction>) {
  const { cols, rows, size, jumps } = view;
  const me = base.you;
  const myTurn = me !== null && view.turn === me && view.phase === "play";
  const last = useRef(frame.id);
  const [settings] = useSettings();
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState<number[]>(view.pos);
  const [travel, setTravel] = useState(0);
  const posRef = useRef(view.pos);
  posRef.current = view.pos;
  const busy = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const cell = Math.min(46, Math.floor(Math.min(420, typeof window === "undefined" ? 360 : window.innerWidth - 16) / cols));
  const W = cols * cell, H = rows * cell;
  const centre = (sq: number) => { const { x, y } = squareXY(Math.max(1, sq), cols, rows); return { cx: x * cell + cell / 2, cy: y * cell + cell / 2 }; };
  const speed = settings.speed === "normal" && typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "fast" : settings.speed;
  const hop = stepMs("hop", speed);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // A roll plays out like a Ludo move: the token hops square by square, then glides up a ladder or slides down a snake.
  useEffect(() => {
    if (frame.id === last.current) return;
    last.current = frame.id;
    const rolls = frame.events.filter(e => e.type === "roll");
    if (!rolls.length) return;
    const nap = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
    for (const e of rolls) {
      busy.current += 1;
      setRolling(true);
      queue.current = queue.current.then(async () => {
        const p = e.p as number, dice = e.dice as number[], from = e.from as number, land = e.land as number;
        const slides = (e.slides as [number, number][]) ?? [], bumped = (e.bumped as number[]) ?? [];
        sound.play("dice");
        const walk = walkOf(from, dice.reduce((a, b) => a + b, 0), land, size);
        if (hop > 0 && alive.current) {
          await nap(Math.round(hop * 1.4)); // let the dice land first
          const each = Math.max(60, Math.min(Math.round(hop * 0.75), Math.floor(2600 / Math.max(1, walk.length))));
          for (const sq of walk) {
            if (!alive.current) return;
            setTravel(each);
            setShown(cur => cur.map((v, i) => (i === p ? sq : v)));
            sound.play("hop");
            (svgRef.current?.querySelector(`[data-arc="${p}"]`) as SVGGElement | null)?.animate?.([{ transform: "translateY(0)" }, { transform: "translateY(-9px)" }, { transform: "translateY(0)" }], { duration: each, easing: "ease-out" });
            await nap(each);
          }
          for (const [a, b] of slides) {
            if (!alive.current) return;
            sound.play(b > a ? "bonus" : "squeal"); buzz("bonus");
            setTravel(Math.round(hop * 2.6));
            setShown(cur => cur.map((v, i) => (i === p ? b : v)));
            await nap(Math.round(hop * 2.8));
          }
          if (bumped.length) { sound.play("capture"); setTravel(Math.round(hop * 2)); }
        } else {
          for (const [a, b] of slides) sound.play(b > a ? "bonus" : "squeal");
          if (bumped.length) sound.play("capture");
        }
        if (e.to === size) sound.play("home");
      }).catch(() => undefined).then(() => {
        busy.current -= 1;
        if (busy.current === 0 && alive.current) { setShown(posRef.current); setRolling(false); }
      });
    }
  }, [frame, size, hop]);

  // Anything that moves without a roll (a resumed game, a reset) simply snaps into place.
  useEffect(() => { if (busy.current === 0) setShown(view.pos); }, [view.pos]);

  const dice = view.last?.dice ?? [];
  const sides = num(view.rules, "sides");
  const byPos = new Map<number, number[]>();
  shown.forEach((p, i) => { if (p > 0) byPos.set(p, [...(byPos.get(p) ?? []), i]); });

  return (
    <VStack spacing={3} flex={1} justify="center" pt={1}>
      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Board of ${size} squares with ${Object.keys(jumps).length} snakes and ladders`} style={{ maxWidth: "100%" }}>
        {Array.from({ length: size }, (_, i) => {
          const sq = i + 1, { x, y } = squareXY(sq, cols, rows);
          return (
            <g key={sq}>
              <rect x={x * cell} y={y * cell} width={cell} height={cell} fill={(x + y) % 2 ? "#fde68a" : "#fef3c7"} stroke="#d6b66a" strokeWidth={0.5} />
              <text x={x * cell + 3} y={y * cell + 11} fontSize={Math.max(8, cell * 0.24)} fill="#78350f">{sq}</text>
            </g>
          );
        })}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="#92400e" strokeWidth={3} />
        {Object.entries(jumps).map(([from, to]) => {
          const a = centre(Number(from)), b = centre(to), up = to > Number(from);
          if (up) {
            const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1, nx = (-dy / len) * 5, ny = (dx / len) * 5;
            const rungs = Math.max(2, Math.floor(len / 14));
            return (
              <g key={from} stroke="#a16207" strokeWidth={3} strokeLinecap="round">
                <line x1={a.cx + nx} y1={a.cy + ny} x2={b.cx + nx} y2={b.cy + ny} /><line x1={a.cx - nx} y1={a.cy - ny} x2={b.cx - nx} y2={b.cy - ny} />
                {Array.from({ length: rungs }, (_, i) => { const t = (i + 0.5) / rungs; return <line key={i} strokeWidth={2} x1={a.cx + dx * t + nx} y1={a.cy + dy * t + ny} x2={a.cx + dx * t - nx} y2={a.cy + dy * t - ny} />; })}
              </g>
            );
          }
          const mx = (a.cx + b.cx) / 2 + (b.cy - a.cy) * 0.18, my = (a.cy + b.cy) / 2 - (b.cx - a.cx) * 0.18;
          return (
            <g key={from}>
              <path d={`M ${a.cx} ${a.cy} Q ${mx} ${my} ${b.cx} ${b.cy}`} fill="none" stroke="#15803d" strokeWidth={6} strokeLinecap="round" opacity={0.9} />
              <path d={`M ${a.cx} ${a.cy} Q ${mx} ${my} ${b.cx} ${b.cy}`} fill="none" stroke="#bbf7d0" strokeWidth={2} strokeDasharray="4 7" strokeLinecap="round" />
              <circle cx={a.cx} cy={a.cy} r={cell * 0.2} fill="#166534" /><circle cx={a.cx - 2} cy={a.cy - 2} r={1.6} fill="#fff" /><circle cx={a.cx + 3} cy={a.cy - 2} r={1.6} fill="#fff" />
            </g>
          );
        })}
        {shown.map((p, i) => {
          const here = byPos.get(p) ?? [i], idx = here.indexOf(i);
          const c = centre(p || 1);
          const ox = p === 0 ? (i - shown.length / 2) * 14 + 7 : (idx - (here.length - 1) / 2) * 10;
          return (
            <g key={i} style={{ transform: `translate(${c.cx + ox}px, ${p === 0 ? H + 12 : c.cy}px)`, transition: hop === 0 ? "none" : `transform ${travel || 500}ms ${travel > hop * 1.5 ? "ease-in-out" : "linear"}` }}>
              <g data-arc={i}>
                <ellipse cy={cell * 0.2} rx={cell * 0.22} ry={cell * 0.08} fill="#000" opacity={0.25} />
                <circle r={cell * 0.26} fill={SEAT_COLOURS[i % SEAT_COLOURS.length]} stroke="#fff" strokeWidth={2} />
                <text textAnchor="middle" y={cell * 0.1} fontSize={cell * 0.28} fill="#0f172a" fontWeight={900} aria-hidden>{MARKS[i % 6]}</text>
              </g>
            </g>
          );
        })}
      </svg>
      <Text fontSize="xs" color="gray.400" aria-hidden>{view.pos.some(p => p === 0) ? "Waiting at the start: " + base.players.filter((_, i) => view.pos[i] === 0).map(p => p.name).join(", ") : ""}</Text>
      <HStack spacing={2} minH="50px" aria-live="polite">
        {dice.map((d, i) => <Die key={i} v={d} sides={sides} />)}
        {view.last && <Text fontWeight={800}>{base.players[view.last.p]?.name}: {dice.reduce((a, b) => a + b, 0)}</Text>}
      </HStack>
      {view.phase === "play" && (
        <Button colorScheme="yellow" size="lg" isDisabled={!myTurn || rolling} onClick={() => act({ type: "roll" })}>{myTurn ? (view.bonusRun > 0 ? "Roll again" : "Roll the dice") : `${base.players[view.turn]?.name} is rolling`}</Button>
      )}
      {view.finished.length > 0 && <Text fontSize="sm" color="yellow.200">Finished: {view.finished.map((p, i) => `${i + 1}. ${base.players[p].name}`).join("  ")}</Text>}
    </VStack>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: snakes as never,
  Table: Table as never,
  accent: "#16a34a",
  icon: "🐍",
  tagline: "Race to the last square. Ladders lift you, snakes drop you. Change the board, the dice, the finish and the twists.",
  howTo: [
    { title: "Goal", text: "Be first to reach the last square (or the number of finishers you choose)." },
    { title: "Your turn", text: "Roll the dice and move that many squares. Land at the foot of a ladder to climb it, or on a snake's head to slide down." },
    { title: "Bonus rolls", text: "By default a six lets you roll again. You can change this to doubles, either, or never." },
    { title: "The finish", text: "Choose between an exact roll (stay or bounce back if too high) or any roll that reaches the end." },
    { title: "Your rules", text: "Board size, snakes, ladders, dice and sides, getting on the board, bumping, chains and more are in Rules." },
  ],
};
export default gameModule;
