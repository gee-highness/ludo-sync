"use client";

import { Box, Button, HStack } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { cfgOf, checkers, type CAction, type CState, type CView, type Sq } from "@/lib/games/checkers/driver";

const CELL = 100, PAD = 44;
const SIDES = [
  { name: "Red", light: "#fca5a5", mid: "#ef4444", deep: "#991b1b", rim: "#7f1d1d", glyph: "#fff" },
  { name: "White", light: "#ffffff", mid: "#f1e6cf", deep: "#c9b48a", rim: "#8a7550", glyph: "#6b5a3a" },
];
const key = (q: Sq) => `${q[0]},${q[1]}`;
const startsWith = (path: Sq[], prefix: Sq[]) => prefix.every((q, i) => path[i] && path[i][0] === q[0] && path[i][1] === q[1]);
const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Disc({ side, king, mini }: { side: number; king: boolean; mini?: boolean }) {
  const c = SIDES[side];
  return (
    <g>
      <circle r={42} cy={5} fill="#000" opacity={0.35} />
      <circle r={42} fill={`url(#disc${side})`} stroke={c.rim} strokeWidth={3} />
      <circle r={30} fill="none" stroke={c.deep} strokeWidth={2.5} opacity={0.55} />
      <circle r={30} fill="none" stroke="#fff" strokeWidth={1.2} opacity={0.25} cy={-1} />
      {king && !mini && <text y={14} textAnchor="middle" fontSize={40} fontWeight={900} fill={c.glyph} stroke={c.rim} strokeWidth={1} aria-hidden>♛</text>}
      {king && mini && <circle r={10} fill={c.glyph} opacity={0.8} />}
      <ellipse cx={-12} cy={-20} rx={16} ry={8} fill="#fff" opacity={0.28} transform="rotate(-25 -12 -20)" />
    </g>
  );
}

function Table({ base, view, act, frame }: TableProps<CView, CAction>) {
  const size = view.size;
  const you = base.you;
  const myTurn = you !== null && base.actors.includes(you) && view.phase === "play";
  const flip = you === 1;
  const svgRef = useRef<SVGSVGElement>(null);
  const [sel, setSel] = useState<{ from: Sq; path: Sq[] } | null>(null);
  const [hint, setHint] = useState<{ from: Sq; to: Sq } | null>(null);
  const [ghosts, setGhosts] = useState<{ id: number; sq: Sq; side: number }[]>([]);
  const lastFrame = useRef(frame.id);

  const pos = useCallback((q: Sq): [number, number] => {
    const r = flip ? size - 1 - q[0] : q[0], c = flip ? size - 1 - q[1] : q[1];
    return [PAD + c * CELL + CELL / 2, PAD + r * CELL + CELL / 2];
  }, [flip, size]);

  const moves = useMemo(() => (myTurn ? view.moves : []), [myTurn, view.moves]);
  const movable = useMemo(() => { const m = new Map<string, Sq>(); for (const x of moves) m.set(key(x.from), x.from); return [...m.values()]; }, [moves]);
  const mustCapture = moves.length > 0 && moves[0].captured.length > 0;
  const active = useMemo(() => sel ?? (movable.length === 1 ? { from: movable[0], path: [] as Sq[] } : null), [sel, movable]);
  const cands = useMemo(() => (active ? moves.filter(m => key(m.from) === key(active.from) && startsWith(m.path, active.path)) : []), [moves, active]);
  const hops = useMemo(() => new Map(cands.filter(m => m.path.length > (active?.path.length ?? 0)).map(m => [key(m.path[active!.path.length]), m.captured.length > 0] as const)), [cands, active]);

  // new frame: clear the picked piece and the hint, play sounds, slide the piece along its route and leave the captured pieces fading
  useEffect(() => {
    if (frame.id === lastFrame.current) return;
    lastFrame.current = frame.id;
    setSel(null); setHint(null);
    for (const e of frame.events) {
      if (e.type !== "move") continue;
      const path = e.path as Sq[], caps = e.captured as Sq[], p = e.p as number;
      sound.play(caps.length ? "capture" : "hop"); buzz(caps.length ? "capture" : "tap");
      if (e.crowned) setTimeout(() => sound.play("bonus"), 220);
      if (caps.length) setGhosts(caps.map((sq, i) => ({ id: frame.id * 100 + i, sq, side: 1 - p })));
      const to = path[path.length - 1], from = e.from as Sq;
      const el = svgRef.current?.querySelector(`[data-piece="${key(to)}"]`) as SVGGElement | null;
      if (el && !reduceMotion() && el.animate) {
        const pts = [from, ...path].map(q => pos(q));
        const [tx, ty] = pos(to);
        el.animate(pts.map(([x, y]) => ({ transform: `translate(${x - tx}px, ${y - ty}px)` })).concat([{ transform: "translate(0px, 0px)" }]), { duration: 220 * (pts.length - 1) + 80, easing: "ease-in-out" });
      }
      setTimeout(() => setGhosts([]), 700);
    }
  }, [frame, pos]);

  const tap = (q: Sq) => {
    if (!myTurn) return;
    const own = movable.find(m => key(m) === key(q));
    if (active && hops.has(key(q))) {
      const path = [...active.path, q];
      const next = cands.filter(m => startsWith(m.path, path));
      const done = next.find(m => m.path.length === path.length);
      if (done && next.length === 1) { act({ type: "move", path: [active.from, ...path] }); setSel(null); buzz("tap"); }
      else setSel({ from: active.from, path });
      return;
    }
    if (own) { setSel(sel && key(sel.from) === key(own) && !sel.path.length ? null : { from: own, path: [] }); sound.play("click"); return; }
    if (sel) setSel(null);
  };

  const showHint = () => {
    if (!myTurn || you === null) return;
    const a = checkers.bot({ rules: view.rules, cfg: cfgOf(view.rules), board: view.board, turn: view.turn, quiet: view.quiet, plies: 0, captures: view.captures, phase: view.phase, winner: view.winner, lastMove: view.lastMove, names: [], rng: 1 } as CState, you, "normal");
    if (a) { setHint({ from: a.path[0], to: a.path[1] }); setSel(null); sound.play("click"); setTimeout(() => setHint(null), 3500); }
  };

  const counts = [0, 1].map(p => view.board.flat().filter(v => v >= 0 && (v & 1) === p).length);
  const total = size * CELL + PAD * 2;
  const lm = view.lastMove;
  const dispRows = Array.from({ length: size }, (_, i) => i);
  const order = flip ? [1, 0] : [0, 1]; // the player facing you is shown at the bottom

  const side = (p: number) => (
    <HStack justify="space-between" px={2} py={1} borderRadius="lg" bg={view.turn === p && view.phase === "play" ? "whiteAlpha.300" : "whiteAlpha.100"} border="2px solid" borderColor={view.turn === p && view.phase === "play" ? SIDES[p].mid : "transparent"} w="100%" aria-label={`${base.players[p]?.name}: ${counts[p]} pieces left, ${view.captures[p]} captured`}>
      <HStack spacing={2}>
        <svg width={26} height={26} viewBox="-48 -48 96 96" aria-hidden><Disc side={p} king={false} /></svg>
        <Box fontWeight={800} fontSize="sm" noOfLines={1} maxW="140px">{base.players[p]?.name}{you === p ? " (you)" : ""}</Box>
      </HStack>
      <HStack spacing={0} aria-hidden minH="18px">
        {Array.from({ length: Math.min(view.captures[p], 12) }, (_, i) => <svg key={i} width={16} height={16} viewBox="-48 -48 96 96" style={{ marginLeft: -4 }}><Disc side={1 - p} king={false} mini /></svg>)}
        {view.captures[p] === 0 && <Box fontSize="xs" color="gray.400">{counts[p]} left</Box>}
      </HStack>
    </HStack>
  );

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" flex={1} gap={2} pt={1} maxW="640px" w="100%" mx="auto">
      {side(order[0])}
      <svg ref={svgRef} viewBox={`0 0 ${total} ${total}`} role="grid" aria-label={`Checkers board, ${size} by ${size}`} style={{ width: "100%", maxHeight: "calc(100dvh - 300px)", minHeight: 280, touchAction: "manipulation", filter: "drop-shadow(0 10px 18px rgba(0,0,0,.5))" }}>
        <defs>
          <radialGradient id="disc0" cx="38%" cy="30%" r="80%"><stop offset="0" stopColor={SIDES[0].light} /><stop offset="0.55" stopColor={SIDES[0].mid} /><stop offset="1" stopColor={SIDES[0].deep} /></radialGradient>
          <radialGradient id="disc1" cx="38%" cy="30%" r="80%"><stop offset="0" stopColor={SIDES[1].light} /><stop offset="0.6" stopColor={SIDES[1].mid} /><stop offset="1" stopColor={SIDES[1].deep} /></radialGradient>
          <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7a4a22" /><stop offset="1" stopColor="#3b210d" /></linearGradient>
          <linearGradient id="sqDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a5a30" /><stop offset="1" stopColor="#6b4220" /></linearGradient>
          <style>{`@keyframes ckpulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes ckfade{from{opacity:.9;transform:scale(1)}to{opacity:0;transform:scale(.4)}}@media (prefers-reduced-motion: reduce){.ckanim{animation:none!important}}`}</style>
        </defs>
        <rect width={total} height={total} rx={26} fill="url(#frame)" />
        <rect x={PAD - 6} y={PAD - 6} width={size * CELL + 12} height={size * CELL + 12} rx={8} fill="#2a170a" />
        {dispRows.map(r => dispRows.map(c => {
          const rr = flip ? size - 1 - r : r, cc = flip ? size - 1 - c : c; // the square in game coordinates
          const isDark = (rr + cc) % 2 === 1;
          return <rect key={`${r}-${c}`} x={PAD + c * CELL} y={PAD + r * CELL} width={CELL} height={CELL} fill={isDark ? "url(#sqDark)" : "#f0d9b0"} />;
        }))}
        {dispRows.map(i => (
          <g key={`lab${i}`} fontSize={24} fontWeight={700} fill="#e7cfa6" opacity={0.8} aria-hidden>
            <text x={PAD + i * CELL + CELL / 2} y={total - 12} textAnchor="middle">{String.fromCharCode(97 + (flip ? size - 1 - i : i))}</text>
            <text x={16} y={PAD + i * CELL + CELL / 2 + 8} textAnchor="middle">{size - (flip ? size - 1 - i : i)}</text>
          </g>
        ))}
        {lm && [lm.from, ...lm.path].map((q, i) => { const [x, y] = pos(q); return <rect key={`lm${i}`} x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="#fde047" opacity={i === 0 ? 0.18 : 0.3} pointerEvents="none" />; })}
        {active && (() => { const [x, y] = pos(active.from); return <rect x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="#38bdf8" opacity={0.4} pointerEvents="none" />; })()}
        {active && active.path.map((q, i) => { const [x, y] = pos(q); return <rect key={`sp${i}`} x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="#38bdf8" opacity={0.25} pointerEvents="none" />; })}
        {hint && [hint.from, hint.to].map((q, i) => { const [x, y] = pos(q); return <rect key={`h${i}`} className="ckanim" x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="#a3e635" style={{ animation: "ckpulse 1s infinite" }} pointerEvents="none" />; })}

        {view.board.map((row, r) => row.map((v, c) => {
          if (v < 0) return null;
          const q: Sq = [r, c], [x, y] = pos(q), p = v & 1, can = movable.some(m => key(m) === key(q)), isSel = !!active && key(active.from) === key(q);
          return (
            <g key={`p${r}-${c}`} data-piece={key(q)} transform={`translate(${x} ${y})`} style={{ transition: "none" }} pointerEvents="none">
              <g style={{ transform: isSel ? "translateY(-7px) scale(1.06)" : undefined, transition: "transform .15s" }}>
                {can && !isSel && <circle className="ckanim" r={50} fill="none" stroke={mustCapture ? "#f87171" : "#facc15"} strokeWidth={5} style={{ animation: "ckpulse 1.4s infinite" }} />}
                <Disc side={p} king={v >= 2} />
              </g>
            </g>
          );
        }))}

        {ghosts.map(g => { const [x, y] = pos(g.sq); return <g key={g.id} transform={`translate(${x} ${y})`} pointerEvents="none"><g className="ckanim" style={{ animation: "ckfade .6s ease-out forwards", transformBox: "fill-box", transformOrigin: "center" }}><Disc side={g.side} king={false} /></g></g>; })}

        {[...hops].map(([k, cap]) => { const [r, c] = k.split(",").map(Number), [x, y] = pos([r, c]); return <g key={`hop${k}`} pointerEvents="none"><circle cx={x} cy={y} r={cap ? 30 : 20} fill={cap ? "#ef4444" : "#22c55e"} opacity={0.85} stroke="#fff" strokeWidth={4} /><circle className="ckanim" cx={x} cy={y} r={cap ? 40 : 30} fill="none" stroke={cap ? "#fca5a5" : "#86efac"} strokeWidth={3} style={{ animation: "ckpulse 1.2s infinite" }} /></g>; })}

        {/* touch targets: every dark square, labelled for keyboard and screen readers */}
        {view.board.map((row, r) => row.map((v, c) => {
          if ((r + c) % 2 === 0) return null;
          const q: Sq = [r, c], [x, y] = pos(q);
          const clickable = myTurn && (hops.has(key(q)) || movable.some(m => key(m) === key(q)) || !!sel);
          const label = `${String.fromCharCode(97 + c)}${size - r}${v >= 0 ? `, ${SIDES[v & 1].name} ${v >= 2 ? "king" : "man"}` : ", empty"}${hops.has(key(q)) ? ", you can move here" : movable.some(m => key(m) === key(q)) ? ", can move" : ""}`;
          return <rect key={`t${r}-${c}`} x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="transparent" role="gridcell" tabIndex={clickable ? 0 : -1} aria-label={label}
            style={{ cursor: clickable ? "pointer" : "default", outline: "none" }} onClick={() => tap(q)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(q); } }} />;
        }))}
      </svg>
      {side(order[1])}
      <HStack spacing={2}>
        <Button size="sm" colorScheme="yellow" variant="outline" onClick={showHint} isDisabled={!myTurn} aria-label="Show a suggested move">Hint</Button>
        {sel && sel.path.length > 0 && <Button size="sm" variant="outline" color="white" onClick={() => setSel(null)}>Start the move again</Button>}
        {mustCapture && <Box fontSize="xs" color="red.200" fontWeight={700}>Capture is compulsory</Box>}
      </HStack>
      {view.phase === "play" && view.quiet >= view.drawAt * 0.6 && <Box fontSize="xs" color="gray.400" aria-live="polite">Draw in {Math.max(0, Math.ceil((view.drawAt - view.quiet) / 2))} moves each if nothing is captured or no man moves</Box>}
    </Box>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: checkers as never,
  Table: Table as never,
  accent: "#dc2626",
  icon: "⛀",
  tagline: "Jump and crown your way across the board. American, Brazilian and big-board rules, compulsory captures, flying kings: every rule is yours to change.",
  howTo: [
    { title: "Move diagonally", text: "Tap one of your glowing pieces, then a green square. Men step one square forward on the dark squares; kings can also go backwards." },
    { title: "Capture by jumping", text: "Jump over an enemy piece into the empty square behind it to take it. Red squares show captures. Keep jumping if you can: pick each landing square in turn." },
    { title: "Captures can be compulsory", text: "By default, if you can capture you must. The pieces that must capture pulse red. Switch this off, or require the longest capture, in Rules." },
    { title: "Get crowned", text: "Reach the far row and your man becomes a king (♛). With flying kings on, a king slides any distance and captures from afar." },
    { title: "Win", text: "Capture every enemy piece or leave your opponent with no legal move. If nothing is captured and no man moves for long enough, it is a draw." },
    { title: "Stuck?", text: "Tap Hint for a suggested move. The yellow squares show the last move." },
  ],
};
export default gameModule;
