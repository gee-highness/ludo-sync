import { SecureChannel } from "../../net/secure";
import { TransportError, type Endpoint, type Network } from "../../net/transport";
import type { Action, GameEvent } from "../types";
import type { TableView } from "../view";
import { CHAT_HISTORY, PROTOCOL, ROOM_ID_PREFIX, cleanChat, parseHostMsg, type ChatItem, type ClientMsg, type RoomView } from "./protocol";
import type { FrameInfo, Reaction } from "./host";

export type GuestStatus = "connecting" | "connected" | "reconnecting" | "host-left" | "kicked" | "error";

export interface GuestSnapshot {
  status: GuestStatus;
  error?: string;
  room: RoomView | null;
  /** Six digits to compare with the host's screen. */
  check: string;
  view: TableView | null;
  rejected?: string;
  /** The last messages in the room's chat, oldest first. */
  chat: ChatItem[];
}

export interface GuestOptions {
  network: Network;
  code: string;
  name: string;
  clientId: string;
  retryDelays?: number[];
  /** Coming back to a game this device was in: a room that is not there yet is waited for, not reported as an error. */
  rejoin?: boolean;
}

const DEFAULT_RETRY = [500, 1000, 2000, 4000, 6000, 8000, 10000];
const PLAYING_RETRY = [...DEFAULT_RETRY, ...Array.from({ length: 40 }, () => 15000)];
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const friendly = (e: unknown): string => {
  if (e instanceof TransportError) {
    switch (e.kind) {
      case "peer-unavailable": return "No room with that code. Check the code, and that the host still has the game open.";
      case "network": return "Could not reach the pairing service. Check your connection.";
      case "blocked": return "Could not connect directly to the host. A strict network may be blocking the connection.";
      case "unsupported": return "This browser cannot make peer-to-peer connections.";
      default: return "Could not connect.";
    }
  }
  return "Could not connect.";
};

/** The joining side: one secure connection to the host, kept alive across drops. It only ever receives the viewer's own view of the table. */
export class SkipBoGuest {
  private endpoint?: Endpoint;
  private chan?: SecureChannel;
  private gameId = -1;
  private n: number | null = null;
  private snap: GuestSnapshot = { status: "connecting", room: null, check: "", view: null, chat: [] };
  private listeners = new Set<(s: GuestSnapshot) => void>();
  private frameListeners = new Set<(f: FrameInfo) => void>();
  private reactionListeners = new Set<(r: Reaction) => void>();
  private stopped = false;
  private reactionId = 0;

  constructor(private opts: GuestOptions) {}

  private delays(): number[] {
    if (this.opts.retryDelays) return this.opts.retryDelays;
    const room = this.snap.room;
    return room?.phase === "playing" && room.view?.phase !== "over" || this.opts.rejoin ? PLAYING_RETRY : DEFAULT_RETRY;
  }

  getSnapshot() { return this.snap; }
  subscribe(cb: (s: GuestSnapshot) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  onFrame(cb: (f: FrameInfo) => void) { this.frameListeners.add(cb); return () => { this.frameListeners.delete(cb); }; }
  onReaction(cb: (r: Reaction) => void) { this.reactionListeners.add(cb); return () => { this.reactionListeners.delete(cb); }; }

  private set(patch: Partial<GuestSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach(cb => cb(this.snap));
  }
  private terminal() { return ["host-left", "kicked", "error"].includes(this.snap.status); }

  async start(): Promise<void> {
    try {
      this.endpoint = await this.opts.network.open(`${ROOM_ID_PREFIX}g-${this.opts.clientId.slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`);
    } catch (e) {
      this.set({ status: "error", error: friendly(e) });
      return;
    }
    await this.connectLoop(true);
  }

  private async connectLoop(first: boolean) {
    for (let attempt = 0; !this.stopped && !this.terminal(); attempt++) {
      try {
        const link = await this.endpoint!.dial(ROOM_ID_PREFIX + this.opts.code);
        if (this.stopped) { link.close(); return; }
        const chan = new SecureChannel(link, "guest");
        this.chan = chan;
        chan.onMessage(raw => this.onHost(chan, raw));
        chan.onClose(() => { if (this.chan === chan) this.dropped(); });
        await chan.handshake();
        this.set({ check: chan.check });
        chan.send({ t: "join", v: PROTOCOL, name: this.opts.name, id: this.opts.clientId } satisfies ClientMsg);
        return;
      } catch (e) {
        if (this.stopped || this.terminal()) return;
        const gone = e instanceof TransportError && e.kind === "peer-unavailable";
        if (first && attempt === 0 && gone && !this.opts.rejoin) { this.set({ status: "error", error: friendly(e) }); return; }
        const delays = this.delays();
        if (attempt >= delays.length) { this.set(gone ? { status: "host-left" } : { status: "error", error: friendly(e) }); return; }
        if (!first || attempt > 0 || this.opts.rejoin) this.set({ status: "reconnecting" });
        await sleep(delays[attempt]);
      }
    }
  }

  private dropped() {
    if (this.stopped || this.terminal()) return;
    this.chan = undefined;
    this.set({ status: "reconnecting" });
    void this.connectLoop(false);
  }

  private onHost(chan: SecureChannel, raw: unknown) {
    if (this.chan !== chan) return;
    const msg = parseHostMsg(raw);
    if (!msg) return;
    switch (msg.t) {
      case "room": this.onRoom(msg.room); break;
      case "frame": this.handleFrame(msg); break;
      case "reaction": this.reactionListeners.forEach(cb => cb({ slot: msg.slot, name: msg.name, emoji: msg.emoji, id: ++this.reactionId })); break;
      case "chat": if (!this.snap.chat.some(c => c.id === msg.item.id)) this.set({ chat: [...this.snap.chat, msg.item].slice(-CHAT_HISTORY) }); break;
      case "chatlog": this.set({ chat: msg.items }); break;
      case "reject": this.set({ rejected: msg.reason }); break;
      case "kicked": this.finish({ status: "kicked" }); break;
      case "bye": this.finish({ status: "host-left" }); break;
      case "error": this.finish({ status: "error", error: msg.reason === "full" ? "That room is full." : msg.reason === "kicked" ? "You were removed from this room." : "The host could not accept you." }); break;
    }
  }

  private finish(patch: Partial<GuestSnapshot>) {
    this.set(patch);
    this.chan?.close();
    this.chan = undefined;
    this.endpoint?.close();
  }

  private onRoom(room: RoomView) {
    if (room.view) {
      if (room.gameId !== this.gameId || this.n === null || room.n !== this.n) {
        this.gameId = room.gameId;
        this.n = room.n;
        this.frameListeners.forEach(cb => cb({ view: room.view!, events: [] }));
      }
    } else { this.gameId = room.gameId; this.n = null; }
    this.set({ status: "connected", room, view: room.view ?? this.snap.view });
  }

  private handleFrame(f: { gameId: number; n: number; view: TableView; events: GameEvent[] }) {
    if (f.gameId !== this.gameId || this.n === null || f.n > this.n + 1) { this.send({ t: "sync" }); return; }
    if (f.n <= this.n) return;
    this.n = f.n;
    this.frameListeners.forEach(cb => cb({ view: f.view, events: f.events }));
    this.set({ view: f.view, room: this.snap.room ? { ...this.snap.room, view: f.view, n: f.n } : null, rejected: undefined });
  }

  private send(msg: ClientMsg) { this.chan?.send(msg); }

  act = (action: Action): boolean => {
    if (this.snap.status !== "connected") return false;
    this.send({ t: "act", action });
    return true;
  };
  react(emoji: string) { this.send({ t: "react", emoji }); }
  /** Says something in the room's chat. The host cleans it and sends it to everyone, this device included. */
  sendChat(text: string): boolean {
    const clean = cleanChat(text);
    if (!clean || this.snap.status !== "connected") return false;
    this.send({ t: "chat", text: clean });
    return true;
  }
  rename(name: string) { this.send({ t: "name", name }); }

  /** Leaves. In a running game this is a soft leave (the seat is kept for a rejoin); `forfeit` hands the cards to a bot. */
  leave(opts: { forfeit?: boolean } = {}) {
    const room = this.snap.room;
    const soft = room?.phase === "playing" && !opts.forfeit && room.you.player !== null;
    this.stopped = true;
    if (soft) this.chan?.close();
    else { this.send({ t: "bye" }); this.chan?.closeAfterSend(); }
    this.chan = undefined;
    const endpoint = this.endpoint;
    setTimeout(() => endpoint?.close(), soft ? 0 : 200);
  }
}
