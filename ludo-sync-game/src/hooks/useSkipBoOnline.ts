"use client";

import { useEffect, useRef, useState } from "react";
import { describeEvents } from "@/lib/skipbo/describe";
import { SkipBoGuest, type GuestSnapshot } from "@/lib/skipbo/net/guest";
import { SkipBoHost, parseHostResume, type HostResume, type HostSnapshot, type Reaction } from "@/lib/skipbo/net/host";
import type { Rules } from "@/lib/skipbo/types";
import { defaultNetwork } from "@/lib/net/network";
import type { Network } from "@/lib/net/transport";
import { getClientId } from "@/lib/net/identity";
import { readJSON, removeKey, writeJSON } from "@/lib/client/storage";
import { useFeed, type Feed } from "./useSkipBoLocal";

/** The room this device was last in: as a guest (to rejoin), or as the host (to open the room again). */
export interface RoomRecord { role: "guest" | "host"; code: string; name: string; host?: HostResume }
export const loadSkipBoRoom = (): RoomRecord | null => {
  const r = readJSON<Partial<RoomRecord> | null>("skipbo-room", null);
  if (!r || typeof r.code !== "string" || typeof r.name !== "string") return null;
  if (r.role === "host") {
    const host = parseHostResume(r.host);
    return host ? { role: "host", code: host.code, name: r.name, host } : null;
  }
  return { role: "guest", code: r.code, name: r.name };
};
export const clearSkipBoRoom = () => removeKey("skipbo-room");

/** Recent reactions, each lasting a few seconds. */
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

/** Opens a room on this device and follows it. Closing the screen closes the room: the table lives on the host's phone. */
export interface SessionOptions { network?: Network; /** Keep a record so the game can be rejoined from the menu. Nearby games cannot be rejoined that way. */ persist?: boolean }

export const useSkipBoHost = (name: string, rules: Partial<Rules>, options: SessionOptions = {}, resume?: HostResume) => {
  const { network, persist: keepRecord = true } = options;
  const [session, setSession] = useState<SkipBoHost | null>(null);
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const { feed, push, reset } = useFeed();
  const ended = useRef(false);
  const sessionRef = useRef<SkipBoHost | null>(null);

  useEffect(() => {
    ended.current = false;
    const s = new SkipBoHost({ network: network ?? defaultNetwork(), name, rules, ...(resume ? { resume } : {}) });
    sessionRef.current = s;
    setSession(s);
    setSnap(s.getSnapshot());
    // keep a copy of a game in progress, so the room can be opened again after leaving, a crash or a closed tab
    const off = s.subscribe(snapshot => {
      setSnap(snapshot);
      if (!keepRecord || ended.current) return;
      const r = s.exportResume();
      if (r && r.phase === "playing" && r.state) writeJSON("skipbo-room", { role: "host", code: s.code, name, host: r });
    });
    const offFrame = s.onFrame(f => { if (f.events.length) push(f.events, describeEvents(f.events, f.view)); else reset(); });
    void s.open();
    const timer = setInterval(() => s.tick(), 1000);
    return () => { clearInterval(timer); off(); offFrame(); if (ended.current) s.close(); else s.suspend(); setSession(null); };
    // the room is made once, for the name and rules chosen on the previous screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Closes the room for everyone and forgets it. */
  const endRoom = () => { ended.current = true; if (keepRecord) clearSkipBoRoom(); sessionRef.current?.close(); };
  return { session, snap, feed, endRoom };
};

export const useSkipBoGuest = (code: string, name: string, rejoin = false, options: SessionOptions = {}) => {
  const { network, persist: keepRecord = true } = options;
  const [client, setClient] = useState<SkipBoGuest | null>(null);
  const [snap, setSnap] = useState<GuestSnapshot | null>(null);
  const { feed, push, reset } = useFeed();
  const quit = useRef(false);
  const clientRef = useRef<SkipBoGuest | null>(null);

  useEffect(() => {
    quit.current = false;
    const c = new SkipBoGuest({ network: network ?? defaultNetwork(), code, name, clientId: getClientId(), rejoin });
    clientRef.current = c;
    setClient(c);
    setSnap(c.getSnapshot());
    let saved = false;
    const off = c.subscribe(snapshot => {
      setSnap(snapshot);
      if (snapshot.status === "kicked" || snapshot.status === "host-left" || snapshot.status === "error") { if (saved) clearSkipBoRoom(); saved = false; }
      else if (keepRecord && snapshot.room?.phase === "playing" && snapshot.view && !saved && !quit.current) saved = writeJSON("skipbo-room", { role: "guest", code, name });
    });
    const offFrame = c.onFrame(f => { if (f.events.length) push(f.events, describeEvents(f.events, f.view)); else reset(); });
    void c.start();
    return () => { off(); offFrame(); c.leave(quit.current ? { forfeit: true } : undefined); clientRef.current = null; setClient(null); };
    // one connection per visit to this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const quitForGood = () => { quit.current = true; clearSkipBoRoom(); clientRef.current?.leave({ forfeit: true }); };
  return { client, snap, feed, quitForGood };
};

export type { Feed };
