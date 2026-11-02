"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { awardGame, type Award } from "@/lib/client/profile";
import { readJSON, removeKey, writeJSON } from "@/lib/client/storage";
import { freshSeed } from "@/lib/platform/rng";
import { sanitizeRules, type RuleValues } from "@/lib/platform/rules";
import { GameTable, type Frame } from "@/lib/platform/table";
import type { BotLevel, GameEvent, GameModule, SeatInfo } from "@/lib/platform/types";

export interface LocalSetup { seats: SeatInfo[]; rules: RuleValues; hotseat: boolean; daily?: boolean }
interface Saved { v: 1; seats: SeatInfo[]; rules: RuleValues; hotseat: boolean; state: unknown }

export const saveKey = (id: string) => `g-save:${id}`;
export const setupKey = (id: string) => `g-setup:${id}`;
export const loadSaved = (id: string): Saved | null => {
  const s = readJSON<Saved | null>(saveKey(id), null);
  return s && s.v === 1 && Array.isArray(s.seats) && s.state && typeof s.state === "object" ? s : null;
};
export const clearSaved = (id: string) => removeKey(saveKey(id));
export const hasSaved = (id: string) => loadSaved(id) !== null;

const BOT_DELAY = { normal: 750, fast: 350, instant: 0 } as const;

/** Runs a game on this device: bots on a timer, autosave after every move, pass and play with a cover screen, and rewards at the end. */
export function useLocalTable(mod: GameModule, initial: { setup: LocalSetup } | { resume: Saved }, speed: keyof typeof BOT_DELAY = "normal") {
  const driver = mod.driver;
  const tableRef = useRef<GameTable<unknown, unknown, unknown> | null>(null);
  const hotseat = "setup" in initial ? initial.setup.hotseat : initial.resume.hotseat;
  const daily = "setup" in initial ? !!initial.setup.daily : false;
  if (!tableRef.current) {
    const seats = "setup" in initial ? initial.setup.seats : initial.resume.seats;
    const rules = "setup" in initial ? initial.setup.rules : initial.resume.rules;
    tableRef.current = new GameTable(driver as never, seats, rules, freshSeed(), "resume" in initial ? initial.resume.state : undefined);
  }
  const table = tableRef.current;
  const idRef = useRef(0);
  const [frame, setFrame] = useState<{ id: number; events: GameEvent[] }>({ id: 0, events: [] });
  const [log, setLog] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [award, setAward] = useState<Award | null>(null);
  const [viewer, setViewer] = useState(() => table.seats.findIndex(s => s.kind === "human"));
  const [covered, setCovered] = useState(hotseat && driver.hidden);
  const rewarded = useRef(false);

  const humans = useMemo(() => table.seats.flatMap((s, i) => (s.kind === "human" ? [i] : [])), [table.seats]);

  const push = useCallback((events: GameEvent[]) => {
    idRef.current += 1;
    setFrame({ id: idRef.current, events });
    const lines = events.flatMap(e => { const t = driver.describe(e, table.names()); return t ? [t] : []; });
    if (lines.length) setLog(l => [...l, ...lines].slice(-60));
    setVersion(v => v + 1);
    writeJSON(saveKey(driver.id), { v: 1, seats: table.seats, rules: table.rules, hotseat, state: table.state } satisfies Saved);
    // pass and play: when the move passes to another person, hide the cards until they take the device
    if (hotseat) {
      const next = table.actors().find(a => table.seats[a]?.kind === "human");
      if (next !== undefined && next !== viewerRef.current) { setViewer(next); if (driver.hidden) setCovered(true); }
    }
  }, [driver, table, hotseat]);
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  const act = useCallback((action: unknown) => {
    const who = hotseat ? viewerRef.current : humans[0];
    const ev = table.act(who, action);
    if (ev) push(ev);
  }, [table, humans, hotseat, push]);

  // bots
  useEffect(() => {
    if (table.over) return;
    if (covered) return;
    const due = table.botTurn();
    if (!due) return;
    const t = setTimeout(() => { const ev = table.botStep(); if (ev) push(ev); }, BOT_DELAY[speed]);
    return () => clearTimeout(t);
  }, [version, table, push, speed, covered]);

  // rewards, once per game
  useEffect(() => {
    if (!table.over) { rewarded.current = false; return; }
    if (rewarded.current) return;
    rewarded.current = true;
    clearSaved(driver.id);
    if (hotseat || humans.length !== 1) return;
    const me = humans[0];
    const rank = { easy: 1, normal: 2, hard: 3 } as const;
    const hardest = table.seats.filter(s => s.kind === "bot").reduce<BotLevel | undefined>((m, s) => (!m || rank[s.level ?? "normal"] > rank[m] ? (s.level ?? "normal") : m), undefined);
    const won = driver.winners(table.state).includes(me);
    setAward(awardGame({ game: driver.id, won, players: table.seats.length, botLevel: hardest, daily, points: Math.max(0, Math.floor(driver.scores(table.state)[me] ?? 0)) }));
    // the result is reported once, when the game ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const rematch = useCallback(() => {
    const fresh = new GameTable(driver as never, table.seats.map(s => ({ ...s, name: s.name.replace(/ \(bot\)$/, "") })), table.rules, freshSeed());
    table.state = fresh.state;
    setAward(null);
    setLog([]);
    idRef.current += 1;
    setFrame({ id: idRef.current, events: [] });
    setVersion(v => v + 1);
    writeJSON(saveKey(driver.id), { v: 1, seats: table.seats, rules: table.rules, hotseat, state: table.state } satisfies Saved);
  }, [driver, table, hotseat]);

  const view: Frame<unknown> = useMemo(() => table.frame(viewer >= 0 ? viewer : null), [table, viewer, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    base: view.base, view: view.view, frame, log, act, rematch, award, rules: table.rules, covered, coverName: table.seats[viewer]?.name ?? "", uncover: () => setCovered(false),
  };
}

export { sanitizeRules };
