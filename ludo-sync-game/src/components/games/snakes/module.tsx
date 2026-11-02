"use client";

import { Box, Button, HStack, Text, VisuallyHidden, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { stepMs } from "@/lib/client/anim";
import { useSettings } from "@/lib/client/settings";
import { num } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { snakes, squareXY, walkOf, type Landing, type SAction, type SView } from "@/lib/games/snakes/driver";
import { BoardArt, themeOf } from "./Art";
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
  const theme = themeOf(view.rules.theme);
  const cell = Math.min(54, Math.floor(Math.min(520, typeof window === "undefined" ? 360 : window.innerWidth - 16) / (cols + 0.7)));
  const pad = Math.round(cell * 0.35), base0 = Math.round(cell * 0.9);
  const W = cols * cell + pad * 2, H = rows * cell + pad * 2 + base0;
  const centre = (sq: number) => { const { x, y } = squareXY(Math.max(1, sq), cols, rows); return { cx: pad + x * cell + cell / 2, cy: pad + y * cell + cell / 2 }; };
  const [info, setInfo] = useState<string | null>(null);
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
        const slides = (e.slides as [number, number, string?][]) ?? [], bumped = (e.bumped as number[]) ?? [];
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
            const warp = slides.some(x => x[2] === "warp") && !(b > a && e.jump);
            sound.play(warp ? "enter" : b > a ? "bonus" : "squeal"); buzz("bonus");
            setTravel(Math.round(hop * 2.6));
            setShown(cur => cur.map((v, i) => (i === p ? b : v)));
            await nap(Math.round(hop * 2.8));
          }
          if (bumped.length) { sound.play("capture"); setTravel(Math.round(hop * 2)); }
        } else {
          for (const [a, b] of slides) sound.play(b > a ? "bonus" : "squeal");
          if (bumped.length) sound.play("capture");
        }
        if (e.special === "skip") sound.play("penalty");
        else if (e.special === "bonus") sound.play("bonus");
        if (e.to === size) sound.play("home");
      }).catch(() => undefined).then(() => {
        busy.current -= 1;
        if (busy.current === 0 && alive.current) { setShown(posRef.current); setRolling(false); }
      });
    }
  }, [frame, size, hop]);

  // Anything that moves without a roll (a resumed game, a reset) simply snaps into place.
  useEffect(() => { if (busy.current === 0) setShown(view.pos); }, [view.pos]);

  const dice = view.pending ?? view.last?.dice ?? [];
  const infoOf = (from: number, to: number) => (to > from ? `Ladder: square ${from} up to ${to} (+${to - from})` : `Snake: square ${from} down to ${to} (${to - from})`);
  const preview = (l: Landing) => (l.to === l.land && l.slides.length === 0 ? (l.to === view.pos[view.turn] ? "stay put" : `to ${l.to}`) : l.slides[0]?.[2] === "warp" ? `to ${l.land}, portal to ${l.to}` : l.to > l.land ? `to ${l.land}, ladder to ${l.to} ▲` : `to ${l.land}, snake to ${l.to} ▼`);
  const L = view.last;
  const banner = !L ? "" : view.pending ? "" : `${base.players[L.p]?.name} rolled ${L.dice.reduce((a, b) => a + b, 0)}${L.to === L.from ? " and stayed put" : ` and went to ${L.to}`}${L.jump !== null ? (L.to > L.jump ? ": up a ladder!" : ": down a snake!") : ""}${view.special[L.to] && L.jump === null ? `: ${theme.special[view.special[L.to]].label}` : ""}`;
  const sides = num(view.rules, "sides");
  const byPos = new Map<number, number[]>();
  shown.forEach((p, i) => { if (p > 0) byPos.set(p, [...(byPos.get(p) ?? []), i]); });

  return (
    <VStack spacing={3} flex={1} justify="center" pt={1}>
      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Board of ${size} squares with ${view.report.ladders} ladders and ${view.report.snakes} snakes. Board number ${view.boardCode}.`} style={{ maxWidth: "100%", filter: "drop-shadow(0 10px 18px rgba(0,0,0,.45))" }}>
        <BoardArt theme={theme} cols={cols} rows={rows} cell={cell} pad={pad} size={size} jumps={jumps} special={view.special} warp={view.warp} />
        <rect x={pad} y={rows * cell + pad * 2 + 4} width={cols * cell} height={base0 - 10} rx={cell * 0.25} fill={theme.frame} opacity={0.9} />
        <text x={pad + cell * 0.3} y={rows * cell + pad * 2 + base0 / 2 + 1} textAnchor="start" fontSize={cell * 0.28} fontWeight={800} fill={theme.num === "#9fb4ff" ? "#9fb4ff" : "#fde68a"} opacity={0.7} aria-hidden>START</text>
        {Object.entries(jumps).map(([from, to]) => {
          const a = centre(Number(from)), b = centre(to);
          return <line key={`hit${from}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="transparent" strokeWidth={cell * 0.55} strokeLinecap="round" style={{ cursor: "pointer" }} onClick={() => setInfo(infoOf(Number(from), to))} />;
        })}
        {shown.map((p, i) => {
          const here = byPos.get(p) ?? [i], idx = here.indexOf(i);
          const c = centre(p || 1);
          const ox = p === 0 ? W / 2 - c.cx + (i - (shown.length - 1) / 2) * Math.min(cell * 0.6, 34) : (idx - (here.length - 1) / 2) * 10;
          return (
            <g key={i} style={{ transform: `translate(${c.cx + ox}px, ${p === 0 ? rows * cell + pad * 2 + base0 / 2 + cell * 0.18 : c.cy}px)`, transition: hop === 0 ? "none" : `transform ${travel || 500}ms ${travel > hop * 1.5 ? "ease-in-out" : "linear"}` }}>
              <g data-arc={i}>
                <ellipse cy={cell * 0.2} rx={cell * 0.22} ry={cell * 0.08} fill="#000" opacity={0.25} />
                <circle r={cell * 0.26} fill={SEAT_COLOURS[i % SEAT_COLOURS.length]} stroke="#fff" strokeWidth={2} />
                <text textAnchor="middle" y={cell * 0.1} fontSize={cell * 0.28} fill="#0f172a" fontWeight={900} aria-hidden>{MARKS[i % 6]}</text>
              </g>
            </g>
          );
        })}
      </svg>
      <Box minH="22px" fontSize="sm" color="yellow.100" textAlign="center" aria-live="polite" role="status">{info ?? banner}</Box>
      <HStack spacing={2} minH="54px" aria-live="polite">
        {dice.map((d, i) => <Die key={i} v={d} sides={sides} />)}
        {!view.pending && view.last && <Text fontWeight={800}>{base.players[view.last.p]?.name}: {dice.reduce((a, b) => a + b, 0)}</Text>}
      </HStack>
      {view.phase === "play" && view.pending && view.choices && (
        myTurn && !rolling ? (
          <VStack spacing={2} w="100%" maxW="360px" role="group" aria-label="Choose how to move">
            {([["a", `Use the ${view.pending[0]}`], ["b", `Use the ${view.pending[1]}`], ["sum", `Both: ${view.pending[0] + view.pending[1]}`]] as const).map(([u, label]) => (
              <Button key={u} w="100%" colorScheme={u === "sum" ? "yellow" : "gray"} variant={u === "sum" ? "solid" : "outline"} color={u === "sum" ? undefined : "white"} onClick={() => act({ type: "use", use: u })} justifyContent="space-between">
                <span>{label}</span><span style={{ fontWeight: 600, opacity: 0.85 }}>{preview(view.choices![u])}</span>
              </Button>
            ))}
          </VStack>
        ) : <Text color="gray.300" fontSize="sm">{myTurn ? "" : `${base.players[view.turn]?.name} is choosing`}</Text>
      )}
      {view.phase === "play" && !view.pending && (
        <Button colorScheme="yellow" size="lg" minW="220px" isDisabled={!myTurn || rolling} onClick={() => act({ type: "roll" })}>{myTurn ? (view.bonusRun > 0 ? "Roll again" : "Roll the dice") : `${base.players[view.turn]?.name} is rolling`}</Button>
      )}
      {view.skip.some(x => x > 0) && <Text fontSize="xs" color="orange.200">Misses the next turn: {base.players.filter((_, i) => view.skip[i] > 0).map(p => p.name).join(", ")}</Text>}
      {view.finished.length > 0 && <Text fontSize="sm" color="yellow.200">Finished: {view.finished.map((p, i) => `${i + 1}. ${base.players[p].name}`).join("  ")}</Text>}
      <Text fontSize="xs" color="gray.500" aria-label={`Board number ${view.boardCode}`}>Board {view.boardCode} · about {view.report.avg} turns to finish{view.special && Object.keys(view.special).length ? " · special squares in play" : ""}</Text>
      <VisuallyHidden>
        <ul aria-label="Ladders and snakes">
          {Object.entries(jumps).map(([f, t]) => <li key={f}><button type="button" onClick={() => setInfo(infoOf(Number(f), t))}>{infoOf(Number(f), t)}</button></li>)}
          {Object.entries(view.special).map(([q, k]) => <li key={`s${q}`}>{`Square ${q}: ${theme.special[k].label}${k === "warp" && view.warp[Number(q)] ? `, leads to square ${view.warp[Number(q)]}` : ""}`}</li>)}
        </ul>
      </VisuallyHidden>
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
