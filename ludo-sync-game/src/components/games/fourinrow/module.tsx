"use client";

import { Box, Button, HStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { buzz } from "@/lib/client/haptics";
import { num, flag } from "@/lib/platform/rules";
import type { GameModule, TableProps } from "@/lib/platform/types";
import { fourInRow, dropRow, type FAction, type FView } from "@/lib/games/fourinrow/driver";
import { SEAT_COLOURS } from "../../platform/TableFrame";

const MARKS = ["✕", "○", "△", "□"];

function Table({ base, view, act, frame }: TableProps<FView, FAction>) {
  const R = view.board.length, C = view.board[0].length;
  const you = base.you;
  const myTurn = you !== null && base.actors.includes(you) && view.phase === "play";
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<"drop" | "bomb">("drop");
  const popOut = flag(view.rules, "popOut");
  const bombsLeft = you !== null ? view.bombs[you] ?? 0 : 0;
  const last = useRef(frame.id);
  const win = new Set((view.last?.cells ?? []).map(([r, c]) => `${r},${c}`));

  useEffect(() => {
    if (frame.id === last.current) return;
    last.current = frame.id;
    for (const e of frame.events) {
      if (e.type === "drop") { sound.play("pop"); buzz("tap"); }
      else if (e.type === "pop") sound.play("click");
      else if (e.type === "bomb") { sound.play("crash"); buzz("capture"); }
      else if (e.type === "round") sound.play("start");
    }
  }, [frame]);

  const cell = Math.min(64, Math.floor(Math.min(360, (typeof window === "undefined" ? 360 : window.innerWidth - 24)) / C));
  const W = cell * C, H = cell * R;
  const colour = (p: number) => SEAT_COLOURS[p % 4 === 3 ? 3 : p % 4]; // red, yellow, green, blue by seat
  const pick = (col: number) => { if (!myTurn) return; act({ type: mode === "bomb" ? "bomb" : "drop", col }); setMode("drop"); };
  const fall = (col: number) => dropRow(view.board, col);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={3} pt={2}>
      {view.phase === "roundOver" && base.you !== null && !base.over && <Button colorScheme="yellow" onClick={() => act({ type: "next" })}>Next round</Button>}
      <HStack spacing={3} fontSize="sm" aria-label="Match score">
        {base.players.map((p, i) => <span key={i} style={{ color: colour(i), fontWeight: 800 }}>{MARKS[i]} {p.name}: {view.wins[i]}{view.need > 1 ? ` / ${view.need}` : ""}</span>)}
      </HStack>
      <svg width={W} height={H + cell * 0.2} viewBox={`0 0 ${W} ${H + cell * 0.2}`} role="grid" aria-label={`Board, ${C} columns by ${R} rows`} style={{ touchAction: "manipulation", maxWidth: "100%" }}>
        <rect x={0} y={cell * 0.2} width={W} height={H} rx={cell * 0.15} fill="#1d4ed8" />
        {Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => {
          const v = view.board[r][c];
          const hot = win.has(`${r},${c}`);
          return (
            <g key={`${r}-${c}`} role="gridcell" aria-label={v < 0 ? "empty" : `${base.players[v]?.name ?? "player"}`}>
              <circle cx={c * cell + cell / 2} cy={cell * 0.2 + r * cell + cell / 2} r={cell * 0.4} fill={v < 0 ? "#0f172a" : colour(v)} stroke={hot ? "#fff" : "none"} strokeWidth={hot ? 3 : 0} style={{ transition: "fill .2s" }} />
              {v >= 0 && <text x={c * cell + cell / 2} y={cell * 0.2 + r * cell + cell / 2 + cell * 0.14} textAnchor="middle" fontSize={cell * 0.38} fill="#0f172a" fontWeight={900} aria-hidden>{MARKS[v]}</text>}
            </g>
          );
        }))}
        {myTurn && hover !== null && fall(hover) >= 0 && (
          <circle cx={hover * cell + cell / 2} cy={cell * 0.2 + fall(hover) * cell + cell / 2} r={cell * 0.4} fill={colour(you!)} opacity={0.35} pointerEvents="none" />
        )}
        {Array.from({ length: C }, (_, c) => (
          <rect key={c} x={c * cell} y={0} width={cell} height={H + cell * 0.2} fill="transparent" role="button" tabIndex={myTurn ? 0 : -1} aria-label={`${mode === "bomb" ? "Bomb" : "Drop in"} column ${c + 1}`}
            style={{ cursor: myTurn ? "pointer" : "default" }} onPointerEnter={() => setHover(c)} onPointerLeave={() => setHover(null)} onClick={() => pick(c)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(c); } }} />
        ))}
      </svg>
      <HStack>
        {bombsLeft > 0 && <Button size="sm" colorScheme={mode === "bomb" ? "orange" : "gray"} variant={mode === "bomb" ? "solid" : "outline"} isDisabled={!myTurn} onClick={() => setMode(m => (m === "bomb" ? "drop" : "bomb"))}>💣 Bomb ({bombsLeft})</Button>}
        {popOut && myTurn && <HStack spacing={0} aria-label="Pop a disc">{Array.from({ length: C }, (_, c) => view.board[R - 1][c] === you ? <Button key={c} size="xs" variant="outline" color="white" onClick={() => act({ type: "pop", col: c })} aria-label={`Pop your disc from column ${c + 1}`}>⤓{c + 1}</Button> : null)}</HStack>}
      </HStack>
      <Box fontSize="xs" color="gray.400" aria-hidden>{num(view.rules, "connect")} in a line wins{flag(view.rules, "misere") ? " (the reverse in misère!)" : ""}</Box>
    </Box>
  );
}

const gameModule: GameModule<never, never, never> = {
  driver: fourInRow as never,
  Table: Table as never,
  accent: "#eab308",
  icon: "🟡",
  tagline: "Drop discs and connect a line. Change the board, the line length, add PopOut, bombs, wrap-around, misère, up to four players, and play a whole match.",
  howTo: [
    { title: "Take turns", text: "On your turn drop one disc into a column. It falls to the lowest free square." },
    { title: "Connect a line", text: "Be first to line up the needed number of discs (four by default) in a row, column or diagonal." },
    { title: "Twists you can switch on", text: "PopOut lets you remove one of your own discs from the bottom. Bombs clear the discs around where they land. Wrap-around lets lines continue past the edges. Misère makes the line-maker lose." },
    { title: "Matches", text: "Play a single game or the first to win several rounds. A full board is a draw, or can simply clear and carry on." },
    { title: "Everything is yours to change", text: "Board size, line length, which directions count, who starts, how many can play. Open Rules before you start, or in an online room as host." },
  ],
};
export default gameModule;
