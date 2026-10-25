"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_DESIGN, setRemoteDesigns, useDesigns, type PieceDesign } from "@/lib/client/pieces";
import type { RoomView } from "@/lib/net/protocol";
import { applyPalette, sanitizeColors, type PaletteMap, type SeatColors } from "@/lib/client/palette";
import { getSettings, useSettings } from "@/lib/client/settings";
import type { Seat } from "@/lib/ludo/board";
import { getClientId } from "@/lib/net/identity";
import { GuestClient, type GuestSnapshot } from "@/lib/net/guest";
import { HostSession, type HostSnapshot, type Reaction } from "@/lib/net/host";
import { PeerNetwork } from "@/lib/net/peerTransport";
import type { Network } from "@/lib/net/transport";
import type { Rules } from "@/lib/ludo/types";
import type { HostResume } from "@/lib/net/resume";
import { clearRoomRecord, saveRoomRecord } from "@/lib/client/rooms";

/**
 * Opens a room on this device (or opens a saved one again) and follows it. Leaving the screen only pauses the room:
 * the game is saved as it goes, guests wait for the host to come back, and `endRoom` is the one way to close it for good.
 */
export interface SessionOptions {
  /** How the phones reach each other; the online pairing service unless given. */
  network?: Network;
  /** Keep a record so the game can be rejoined from the menu. Nearby games cannot be rejoined that way. */
  persist?: boolean;
}

export const useHostSession = (name: string, rules: Rules, resume?: HostResume, options: SessionOptions = {}) => {
  const { network, persist: keepRecord = true } = options;
  const [session, setSession] = useState<HostSession | null>(null);
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const ended = useRef(false);
  const sessionRef = useRef<HostSession | null>(null);

  useEffect(() => {
    ended.current = false;
    const s = new HostSession({ network: network ?? new PeerNetwork(), name, rules, ...(resume ? { resume } : {}) });
    sessionRef.current = s;
    setSession(s);
    setSnap(s.getSnapshot());
    // keep a copy of a game in progress, so the room can be opened again after leaving, a crash or a closed tab
    const persist = () => {
      if (ended.current || !keepRecord) return;
      const r = s.exportResume();
      if (!r) return;
      // a finished game is kept too: the room goes on if the host starts a rematch
      if (r.phase === "playing" && r.state) saveRoomRecord({ role: "host", code: s.code, name, host: r });
      else if (!resume) clearRoomRecord();
    };
    const off = s.subscribe(snapshot => { setSnap(snapshot); persist(); });
    void s.open();
    // plays for anyone away or out of time
    const timer = setInterval(() => s.tick(), 1000);
    return () => {
      clearInterval(timer); off();
      if (ended.current) s.close(); else s.suspend();
      sessionRef.current = null;
      setSession(null);
    };
    // the room is made once, for the name and rules chosen on the previous screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Closes the room for everyone and forgets it. */
  const endRoom = () => {
    ended.current = true;
    if (keepRecord) clearRoomRecord();
    sessionRef.current?.close();
  };
  return { session, snap, endRoom };
};

export const useGuestClient = (code: string, name: string, rejoin = false, options: SessionOptions = {}) => {
  const { network, persist: keepRecord = true } = options;
  const [client, setClient] = useState<GuestClient | null>(null);
  const [snap, setSnap] = useState<GuestSnapshot | null>(null);
  const quit = useRef(false);
  const clientRef = useRef<GuestClient | null>(null);

  useEffect(() => {
    quit.current = false;
    const c = new GuestClient({ network: network ?? new PeerNetwork(), code, name, clientId: getClientId(), rejoin });
    clientRef.current = c;
    setClient(c);
    setSnap(c.getSnapshot());
    let saved = false;
    const off = c.subscribe(snapshot => {
      setSnap(snapshot);
      const playing = snapshot.room?.phase === "playing" && !!snapshot.state;
      if (snapshot.status === "kicked" || snapshot.status === "host-left" || snapshot.status === "error") {
        if (saved && keepRecord) clearRoomRecord();
        saved = false;
      } else if (keepRecord && playing && !saved && !quit.current) {
        saved = saveRoomRecord({ role: "guest", code, name });
      }
    });
    void c.start();
    return () => { off(); c.leave(quit.current ? { forfeit: true } : undefined); clientRef.current = null; setClient(null); };
    // one connection per visit to this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** Gives up the seat for good. */
  const quitForGood = () => {
    quit.current = true;
    if (keepRecord) clearRoomRecord();
    clientRef.current?.leave({ forfeit: true });
  };
  return { client, snap, quitForGood };
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

  const canSend = send !== undefined;

  // send on every change, and again if the room does not have them yet (a new connection, a reconnect)
  useEffect(() => {
    if (mine && sendRef.current) sendRef.current(JSON.parse(mine) as PieceDesign[]);
  }, [mine, roomHasMine, mySeat, canSend]);

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

export interface ReactionEntry extends Reaction { at: number }

/** Every reaction received this session, newest last, so the chat log can show them alongside messages. */
export const useReactionLog = (subscribe: ((cb: (r: Reaction) => void) => () => void) | undefined, max = 100): ReactionEntry[] => {
  const [items, setItems] = useState<ReactionEntry[]>([]);
  useEffect(() => {
    if (!subscribe) return;
    return subscribe(r => setItems(l => [...l.slice(-(max - 1)), { ...r, at: Date.now() }]));
  }, [subscribe, max]);
  return items;
};

/**
 * Colours in an online room: sends this player's own colours to the room, and draws every seat with the colours its
 * player chose (your own seat with yours). Seats with no human choice, such as bots, keep the standard colours.
 * Leaving the room puts this device's own palette back.
 */
export const usePaletteSync = (room: RoomView | null, send: ((colors: SeatColors | null) => void) | undefined) => {
  const [settings] = useSettings();
  const sendRef = useRef(send);
  sendRef.current = send;
  const mySeat = room?.you.seat ?? null;
  const mine = JSON.stringify(settings.myColors ?? null);
  const mySlot = room && mySeat !== null ? room.slots[mySeat] : null;
  const roomHas = mySlot?.kind === "human" ? JSON.stringify(mySlot.colors ?? null) : null;
  const canSend = send !== undefined;
  const roomMatches = roomHas !== null && roomHas === mine;

  // send on every change, and again if the room does not hold the same colours yet (a new connection, a reconnect)
  useEffect(() => {
    if (mySeat !== null && sendRef.current) sendRef.current(JSON.parse(mine) as SeatColors | null);
  }, [mine, mySeat, canSend, roomMatches]);

  const others = room
    ? JSON.stringify(room.slots.map(s => (s.seat !== mySeat && s.kind === "human" && s.colors ? s.colors : null)))
    : null;
  useEffect(() => {
    if (!others) return;
    const list = JSON.parse(others) as (SeatColors | null)[];
    const map: PaletteMap = {};
    list.forEach((c, i) => { if (i !== mySeat && c) map[i as Seat] = sanitizeColors(c); });
    if (mySeat !== null) { const own = sanitizeColors(JSON.parse(mine)); if (own) map[mySeat] = own; }
    applyPalette(map);
  }, [others, mine, mySeat]);
  useEffect(() => () => applyPalette(getSettings().palette), []);
};
