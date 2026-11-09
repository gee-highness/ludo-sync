"use client";

import { useEffect, useRef, useState } from "react";
import { defaultNetwork } from "@/lib/net/network";
import type { Network } from "@/lib/net/transport";
import { getClientId } from "@/lib/net/identity";
import { readJSON, removeKey, writeJSON } from "@/lib/client/storage";
import { awardGame, type Award } from "@/lib/client/profile";
import { GameGuest, type GuestSnapshot } from "@/lib/platform/net/guest";
import { GameHost, type HostSave, type HostSnapshot, type Reaction } from "@/lib/platform/net/host";
import { isRoomCode } from "@/lib/net/crypto";
import type { RuleValues } from "@/lib/platform/rules";
import type { Frame } from "@/lib/platform/table";
import type { GameDriver, GameEvent } from "@/lib/platform/types";

export interface Feed { frame: { id: number; events: GameEvent[] }; log: string[] }
const useFeed = (driver: GameDriver, names: () => string[]) => {
  const [feed, setFeed] = useState<Feed>({ frame: { id: 0, events: [] }, log: [] });
  const counter = useRef(0);
  const push = (f: Frame<unknown>) => {
    counter.current += 1;
    const id = counter.current;
    const lines = f.events.flatMap(e => { const t = driver.describe(e, names()); return t ? [t] : []; });
    setFeed(old => ({ frame: { id, events: f.events }, log: f.events.length ? [...old.log, ...lines].slice(-60) : [] }));
  };
  return { feed, push };
};

export const useReactionLog = (subscribe: ((cb: (r: Reaction) => void) => () => void) | undefined) => {
  const [items, setItems] = useState<Reaction[]>([]);
  useEffect(() => {
    if (!subscribe) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = subscribe(r => {
      setItems(l => [...l.slice(-4), r]);
      const t = setTimeout(() => { setItems(l => l.filter(x => x.id !== r.id)); timers.delete(t); }, 3500);
      timers.add(t);
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, [subscribe]);
  return items;
};

/** Gives XP, points and the result for the viewer once an online game ends. Online games never touch bot streaks. */
export const useOnlineAward = (driver: GameDriver, frame: Frame<unknown> | null | undefined, humans: number) => {
  const [award, setAward] = useState<Award | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!frame?.base.over) { done.current = false; setAward(null); return; }
    if (done.current || frame.base.you === null) return;
    done.current = true;
    setAward(awardGame({ game: driver.id, won: frame.base.winners.includes(frame.base.you), players: frame.base.players.length, withFriends: humans > 1, points: Math.max(0, Math.floor(frame.base.scores[frame.base.you] ?? 0)) }));
  }, [frame, driver, humans]);
  return award;
};

export interface RoomRecord { role: "guest"; code: string; name: string }
export const roomKey = (id: string) => `g-room:${id}`;
export const loadRoom = (id: string): RoomRecord | null => { const r = readJSON<Partial<RoomRecord> | null>(roomKey(id), null); return r && r.role === "guest" && typeof r.code === "string" && typeof r.name === "string" ? { role: "guest", code: r.code, name: r.name } : null; };
export const clearRoom = (id: string) => removeKey(roomKey(id));

/** The room this device was hosting, kept while its game is unfinished so the host can open it again. */
export const hostKey = (id: string) => `g-host:${id}`;
export const clearHostRoom = (id: string) => removeKey(hostKey(id));
export const loadHostRoom = (id: string, maxAgeMs = 6 * 3600e3): { save: HostSave; savedAt: number } | null => {
  const r = readJSON<{ savedAt?: number; save?: Partial<HostSave> } | null>(hostKey(id), null);
  const sv = r?.save;
  const ok = !!r && typeof r.savedAt === "number" && Date.now() - r.savedAt <= maxAgeMs && !!sv && sv.v === 1 && typeof sv.code === "string" && isRoomCode(sv.code) && typeof sv.name === "string"
    && Array.isArray(sv.slots) && Array.isArray(sv.members) && Array.isArray(sv.seats) && Array.isArray(sv.playerSlots) && Array.isArray(sv.banned) && Array.isArray(sv.chat) && sv.phase === "playing";
  if (!ok) { if (r) clearHostRoom(id); return null; }
  return { save: sv as HostSave, savedAt: r!.savedAt! };
};

export const useGameHost = (driver: GameDriver, name: string, rules: RuleValues, network?: Network, save?: HostSave) => {
  const [session, setSession] = useState<GameHost<unknown, unknown, unknown> | null>(null);
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const { feed, push } = useFeed(driver, () => sessionNames.current);
  const sessionNames = useRef<string[]>([]);
  const sessionRef = useRef<GameHost<unknown, unknown, unknown> | null>(null);
  useEffect(() => {
    const s = new GameHost(driver, { network: network ?? defaultNetwork(), name, rules, save });
    sessionRef.current = s;
    setSession(s);
    setSnap(s.getSnapshot());
    // an unfinished game is kept so the host can reopen the room later; a finished one is let go
    const keep = () => { if (s.resumable) writeJSON(hostKey(driver.id), { savedAt: Date.now(), save: s.exportSave() }); else if (s.exportSave().phase === "playing") clearHostRoom(driver.id); };
    const off = s.subscribe(sn => { setSnap(sn); sessionNames.current = sn.room.frame?.base.players.map(p => p.name) ?? []; keep(); });
    const offFrame = s.onFrame(f => { sessionNames.current = f.base.players.map(p => p.name); push(f); keep(); });
    void s.open();
    const timer = setInterval(() => s.tick(), 1000);
    return () => { clearInterval(timer); off(); offFrame(); s.close(); setSession(null); };
    // the room is made once, for the name and rules chosen on the previous screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { session, snap, feed, endRoom: () => sessionRef.current?.close() };
};

export const useGameGuest = (driver: GameDriver, code: string, name: string, rejoin = false, network?: Network) => {
  const [client, setClient] = useState<GameGuest | null>(null);
  const [snap, setSnap] = useState<GuestSnapshot | null>(null);
  const names = useRef<string[]>([]);
  const { feed, push } = useFeed(driver, () => names.current);
  const quit = useRef(false);
  const clientRef = useRef<GameGuest | null>(null);
  useEffect(() => {
    quit.current = false;
    const c = new GameGuest({ network: network ?? defaultNetwork(), gameId: driver.id, maxSlots: driver.maxPlayers, code, name, clientId: getClientId(), rejoin });
    clientRef.current = c;
    setClient(c);
    setSnap(c.getSnapshot());
    let saved = false;
    const off = c.subscribe(sn => {
      setSnap(sn);
      if (sn.status === "kicked" || sn.status === "error") { if (saved) clearRoom(driver.id); saved = false; }
      else if (sn.room?.phase === "playing" && sn.frame && !saved && !quit.current) saved = writeJSON(roomKey(driver.id), { role: "guest", code, name });
    });
    const offFrame = c.onFrame(f => { names.current = f.base.players.map(p => p.name); push(f); });
    void c.start();
    return () => { off(); offFrame(); c.leave(quit.current ? { forfeit: true } : undefined); clientRef.current = null; setClient(null); };
    // one connection per visit to this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return { client, snap, feed, quitForGood: () => { quit.current = true; clearRoom(driver.id); clientRef.current?.leave({ forfeit: true }); } };
};
