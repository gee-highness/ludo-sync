"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_DESIGN, setRemoteDesigns, useDesigns, type PieceDesign } from "@/lib/client/pieces";
import type { RoomView } from "@/lib/net/protocol";
import type { Seat } from "@/lib/ludo/board";
import { getClientId } from "@/lib/net/identity";
import { GuestClient, type GuestSnapshot } from "@/lib/net/guest";
import { HostSession, type HostSnapshot, type Reaction } from "@/lib/net/host";
import { PeerNetwork } from "@/lib/net/peerTransport";
import type { Rules } from "@/lib/ludo/types";

/** Opens a room on this device and follows it. Null until the browser has made the session. */
export const useHostSession = (name: string, rules: Rules) => {
  const [session, setSession] = useState<HostSession | null>(null);
  const [snap, setSnap] = useState<HostSnapshot | null>(null);

  useEffect(() => {
    const s = new HostSession({ network: new PeerNetwork(), name, rules });
    setSession(s);
    setSnap(s.getSnapshot());
    const off = s.subscribe(setSnap);
    void s.open();
    // plays for anyone away or out of time
    const timer = setInterval(() => s.tick(), 1000);
    return () => { clearInterval(timer); off(); s.close(); setSession(null); };
    // the room is made once, for the name and rules chosen on the previous screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { session, snap };
};

export const useGuestClient = (code: string, name: string) => {
  const [client, setClient] = useState<GuestClient | null>(null);
  const [snap, setSnap] = useState<GuestSnapshot | null>(null);

  useEffect(() => {
    const c = new GuestClient({ network: new PeerNetwork(), code, name, clientId: getClientId() });
    setClient(c);
    setSnap(c.getSnapshot());
    const off = c.subscribe(setSnap);
    void c.start();
    return () => { off(); c.leave(); setClient(null); };
    // one connection per visit to this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return { client, snap };
};

/** Recent reactions, each lasting a few seconds. */
export const useReactions = (subscribe: ((cb: (r: Reaction) => void) => () => void) | undefined) => {
  const [items, setItems] = useState<Reaction[]>([]);
  useEffect(() => {
    if (!subscribe) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = subscribe(r => {
      setItems(l => [...l.slice(-4), r]);
      const t = setTimeout(() => { timers.delete(t); setItems(l => l.filter(x => x.id !== r.id)); }, 4000);
      timers.add(t);
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, [subscribe]);
  return items;
};

/**
 * Pieces in an online room: sends this player's own designs to the room, and draws everyone else's seats
 * with the designs they sent. Seats whose player has not sent any use the standard pieces.
 */
export const usePieceSync = (room: RoomView | null, send: ((designs: PieceDesign[]) => void) | undefined) => {
  const designs = useDesigns();
  const sendRef = useRef(send);
  sendRef.current = send;
  const mySeat = room?.you.seat ?? null;
  const mine = mySeat === null ? null : JSON.stringify(designs[mySeat]);
  const mySlot = room && mySeat !== null ? room.slots[mySeat] : null;
  const roomHasMine = mySlot?.kind === "human" && !!mySlot.pieces;

  // send on every change, and again if the room does not have them yet (a new connection, a reconnect)
  useEffect(() => {
    if (mine && sendRef.current) sendRef.current(JSON.parse(mine) as PieceDesign[]);
  }, [mine, roomHasMine, mySeat, send !== undefined]);

  const others = room
    ? JSON.stringify(room.slots.map(s => (s.seat !== mySeat && s.kind === "human" && s.pieces ? s.pieces : null)))
    : null;
  useEffect(() => {
    if (!others || !room) { setRemoteDesigns(null); return; }
    const list = JSON.parse(others) as (PieceDesign[] | null)[];
    const map: Partial<Record<Seat, PieceDesign[]>> = {};
    list.forEach((d, i) => { if (i !== mySeat) map[i as Seat] = d ?? Array.from({ length: 4 }, () => ({ ...DEFAULT_DESIGN })); });
    setRemoteDesigns(map);
    return () => setRemoteDesigns(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others, mySeat]);
};
