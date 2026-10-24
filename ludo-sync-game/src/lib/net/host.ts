import type { PieceDesign } from "../client/pieces";
import { SEAT_INFO, SEATS, type Seat } from "../ludo/board";
import { autoAction } from "../ludo/bot";
import { applyAction, createGame, currentPlayer } from "../ludo/engine";
import { freshSeed } from "../ludo/rng";
import { DEFAULT_RULES, type Action, type BotLevel, type GameEvent, type GameState, type PlayerSetup, type Rules } from "../ludo/types";
import { FrameBus } from "../client/frames";
import { newRoomCode } from "./crypto";
import { CHAT_HISTORY, PROTOCOL, ROOM_ID_PREFIX, cleanChat, cleanText, parseClientMsg, type ChatItem, type ClientMsg, type HostMsg, type RoomView, type SlotView } from "./protocol";
import { HOST_ID, RESUME_VERSION, parseHostResume, type HostResume, type ResumeSlot } from "./resume";
import { SecureChannel } from "./secure";
import { TransportError, type Endpoint, type Link, type Network } from "./transport";

export { HOST_ID };
export type { HostResume };
const MAX_MEMBERS = 12;
/** How long a seat whose owner is offline gets before a bot-style auto-play takes their turn. */
export const AWAY_GRACE_MS = 8_000;
export const DEFAULT_TURN_MS = 45_000;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 5_000;

type Slot = { kind: "empty" } | { kind: "bot"; level: BotLevel; name: string } | { kind: "human"; id: string };

interface Member {
  id: string;
  name: string;
  host: boolean;
  chan: SecureChannel | null;
  check: string;
  lastReact: number;
  pieces: PieceDesign[] | null;
  chatAt: number[];
}

export interface MemberView { id: string; name: string; seat: Seat | null; connected: boolean; check: string; host: boolean }
export type HostStatus = "opening" | "ready" | "error" | "closed";

export interface HostSnapshot {
  status: HostStatus;
  error?: string;
  /** False while the pairing service cannot be reached; people already connected keep playing. */
  online: boolean;
  code: string;
  room: RoomView;
  members: MemberView[];
  /** The last messages in the room's chat, oldest first. */
  chat: ChatItem[];
}

export interface Reaction { seat: Seat | null; name: string; emoji: string; id: number }

export interface HostOptions {
  network: Network;
  name: string;
  rules?: Rules;
  turnMs?: number;
  now?: () => number;
  code?: string;
  /** Reopen a room that was suspended or left: same code, seats, game and chat. Checked again here; junk is ignored. */
  resume?: HostResume;
  /** How long and how often to retry while the pairing service still holds a resumed room's old id. */
  resumeRetry?: { everyMs: number; forMs: number };
}

/**
 * The authoritative side of a room. Guests only ask; the host checks seat and phase, applies the move with the
 * engine, and tells everybody. Bots and AFK players are played from here too.
 */
export class HostSession {
  readonly bus = new FrameBus();
  private endpoint?: Endpoint;
  private members = new Map<string, Member>();
  private banned = new Set<string>();
  private slots: Slot[] = SEATS.map(() => ({ kind: "empty" }));
  private phase: "lobby" | "playing" = "lobby";
  private state: GameState | null = null;
  private gameId = 0;
  private n = 0;
  private rules: Rules;
  private turnMs: number;
  private now: () => number;
  private lastActionAt = 0;
  private status: HostStatus = "opening";
  private error?: string;
  private online = true;
  private reactionId = 0;
  private chat: ChatItem[] = [];
  private chatId = 0;
  private listeners = new Set<(s: HostSnapshot) => void>();
  private reactionListeners = new Set<(r: Reaction) => void>();
  private snapshot!: HostSnapshot;
  private resumed = false;
  private ended = false;
  code: string;

  constructor(private opts: HostOptions) {
    this.rules = { ...(opts.rules ?? DEFAULT_RULES) };
    this.turnMs = opts.turnMs ?? DEFAULT_TURN_MS;
    this.now = opts.now ?? Date.now;
    this.code = opts.code ?? newRoomCode();
    this.members.set(HOST_ID, { id: HOST_ID, name: cleanText(opts.name, "Host"), host: true, chan: null, check: "", lastReact: 0, pieces: null, chatAt: [] });
    this.slots[0] = { kind: "human", id: HOST_ID };
    const resume = opts.resume ? parseHostResume(opts.resume) : null;
    if (resume) this.restore(resume);
    this.refresh();
  }

  /** Puts a validated resume back: members are offline until they reconnect, so away seats are auto-played. */
  private restore(r: HostResume) {
    this.resumed = true;
    this.code = r.code;
    this.rules = { ...r.rules };
    this.turnMs = r.turnMs;
    this.phase = r.phase;
    this.gameId = r.gameId;
    this.n = r.n;
    this.state = r.state;
    this.chat = [...r.chat];
    this.chatId = r.chatId;
    this.reactionId = r.reactionId;
    this.banned = new Set(r.banned);
    this.members = new Map();
    for (const m of r.members) {
      this.members.set(m.id, { id: m.id, name: m.name, host: m.host, chan: null, check: "", lastReact: 0, pieces: m.pieces, chatAt: [] });
    }
    this.slots = r.slots.map((s): Slot => (s.kind === "human" ? { kind: "human", id: s.id } : s.kind === "bot" ? { ...s } : { kind: "empty" }));
    this.lastActionAt = this.now();
    if (this.state) this.bus.push(this.state, []);
  }

  /** A copy of the room that can be saved and used to open it again. Null once the room has been closed for good. */
  exportResume(): HostResume | null {
    if (this.ended) return null;
    return {
      v: RESUME_VERSION,
      code: this.code,
      name: this.members.get(HOST_ID)!.name,
      rules: { ...this.rules },
      turnMs: this.turnMs,
      phase: this.phase,
      gameId: this.gameId,
      n: this.n,
      state: this.state,
      slots: this.slots.map((s): ResumeSlot => (s.kind === "human" ? { kind: "human", id: s.id } : s.kind === "bot" ? { kind: "bot", level: s.level, name: s.name } : { kind: "empty" })),
      members: [...this.members.values()].map(m => ({ id: m.id, name: m.name, host: m.host, pieces: m.pieces })),
      banned: [...this.banned],
      chat: this.chat.slice(-CHAT_HISTORY),
      chatId: this.chatId,
      reactionId: this.reactionId,
    };
  }

  /**
   * Leaves the room without telling anyone it is over: connections just drop, so guests wait and reconnect, and
   * `exportResume()` still describes the room so it can be opened again with `resume`.
   */
  suspend() {
    if (this.status === "closed") return;
    for (const m of this.members.values()) { m.chan?.close(); m.chan = null; }
    this.status = "closed";
    this.endpoint?.close();
    this.refresh();
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  async open(): Promise<void> {
    const retry = this.opts.resumeRetry ?? { everyMs: 2000, forMs: 60_000 };
    const attempts = this.resumed ? Math.max(1, Math.ceil(retry.forMs / Math.max(1, retry.everyMs)) + 1) : 6;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const endpoint = await this.opts.network.open(ROOM_ID_PREFIX + this.code);
        if (this.status === "closed") { endpoint.close(); return; }
        this.endpoint = endpoint;
        endpoint.onIncoming(link => this.accept(link));
        endpoint.onStatus(s => { this.online = s === "open"; if (s === "closed" && this.status === "ready") this.status = "closed"; this.refresh(); });
        this.status = "ready";
        this.refresh();
        return;
      } catch (e) {
        if (e instanceof TransportError && e.kind === "unavailable-id" && this.resumed) {
          // the pairing service may still hold the old id for a little while
          if (attempt < attempts - 1) { await new Promise(r => setTimeout(r, retry.everyMs)); if (this.status === "closed") return; continue; }
        } else if (e instanceof TransportError && e.kind === "unavailable-id" && !this.opts.code) { this.code = newRoomCode(); continue; }
        this.status = "error";
        this.error = e instanceof TransportError && e.kind === "network"
          ? "Could not reach the pairing service. Check your connection and try again."
          : e instanceof TransportError && e.kind === "unavailable-id" ? "That room code is already in use." : "Could not open a room on this device.";
        this.refresh();
        return;
      }
    }
  }

  close() {
    this.ended = true;
    if (this.status === "closed") return;
    for (const m of this.members.values()) { m.chan?.send({ t: "bye" } satisfies HostMsg); m.chan?.closeAfterSend(); }
    this.status = "closed";
    // give the goodbye a moment to leave before the endpoint goes
    const endpoint = this.endpoint;
    setTimeout(() => endpoint?.close(), 200);
    this.refresh();
  }

  subscribe(cb: (s: HostSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }
  onReaction(cb: (r: Reaction) => void): () => void {
    this.reactionListeners.add(cb);
    return () => { this.reactionListeners.delete(cb); };
  }
  getSnapshot(): HostSnapshot { return this.snapshot; }

  // ---- connections -------------------------------------------------------------------------

  private accept(link: Link) {
    if (this.status !== "ready") { link.close(); return; }
    const chan = new SecureChannel(link, "host");
    let member: Member | null = null;
    chan.onMessage(raw => {
      const msg = parseClientMsg(raw);
      if (!msg) return;
      if (!member) {
        if (msg.t !== "join") return chan.close();
        member = this.join(chan, msg);
        return;
      }
      if (member.chan !== chan) return; // superseded by a newer connection
      this.handle(member, msg);
    });
    chan.onClose(() => {
      if (member && member.chan === chan) { member.chan = null; this.refresh(); this.broadcastRooms(); }
    });
    chan.handshake().catch(() => chan.close());
  }

  private reject(chan: SecureChannel, reason: string) {
    chan.send({ t: "error", reason } satisfies HostMsg);
    chan.closeAfterSend();
  }

  private join(chan: SecureChannel, msg: Extract<ClientMsg, { t: "join" }>): Member | null {
    if (msg.v !== PROTOCOL) { this.reject(chan, "version"); return null; }
    if (this.banned.has(msg.id)) { this.reject(chan, "kicked"); return null; }
    let m = this.members.get(msg.id);
    if (m) {
      const old = m.chan;
      m.chan = chan;
      m.name = msg.name;
      old?.close();
    } else {
      if (this.members.size >= MAX_MEMBERS) { this.reject(chan, "full"); return null; }
      m = { id: msg.id, name: msg.name, host: false, chan, check: "", lastReact: 0, pieces: null, chatAt: [] };
      this.members.set(msg.id, m);
      if (this.seatsOpen()) {
        const free = this.slots.findIndex(s => s.kind === "empty");
        if (free >= 0) this.slots[free] = { kind: "human", id: m.id };
      }
    }
    m.check = chan.check;
    this.refresh();
    this.broadcastRooms();
    chan.send({ t: "chatlog", items: this.chat } satisfies HostMsg);
    return m;
  }

  private handle(m: Member, msg: ClientMsg) {
    switch (msg.t) {
      case "act": {
        const err = this.actFrom(m, msg.action);
        if (err) m.chan?.send({ t: "reject", reason: err } satisfies HostMsg);
        break;
      }
      case "name":
        m.name = msg.name;
        this.refresh();
        this.broadcastRooms();
        break;
      case "pieces":
        m.pieces = msg.designs;
        this.refresh();
        this.broadcastRooms();
        break;
      case "seat": this.claimSeat(m, msg.seat); break;
      case "react": this.react(m, msg.emoji); break;
      case "chat": this.postChat(m, msg.text); break;
      case "sync":
        m.chan?.send({ t: "room", room: this.roomFor(m) } satisfies HostMsg);
        m.chan?.send({ t: "chatlog", items: this.chat } satisfies HostMsg);
        break;
      case "bye": this.leave(m); break;
      case "join": break;
    }
  }

  // ---- seats -------------------------------------------------------------------------------

  private seatOf(id: string): Seat | null {
    const i = this.slots.findIndex(s => s.kind === "human" && s.id === id);
    return i < 0 ? null : (i as Seat);
  }

  /** Seats can be taken in the lobby, and while a finished game waits for its rematch. */
  private seatsOpen(): boolean {
    return this.phase === "lobby" || this.state?.phase === "over";
  }

  private claimSeat(m: Member, seat: Seat) {
    if (!this.seatsOpen() || this.slots[seat].kind !== "empty") return;
    const old = this.seatOf(m.id);
    if (old !== null) this.slots[old] = { kind: "empty" };
    this.slots[seat] = { kind: "human", id: m.id };
    this.refresh();
    this.broadcastRooms();
  }

  /** Host only, in the lobby: turn an open or bot seat into the other. */
  setSlot(seat: Seat, kind: "empty" | "bot", level: BotLevel = "normal"): boolean {
    if (this.phase !== "lobby" || this.slots[seat].kind === "human") return false;
    this.slots[seat] = kind === "bot" ? { kind: "bot", level, name: `${SEAT_INFO[seat].name} bot` } : { kind: "empty" };
    this.refresh();
    this.broadcastRooms();
    return true;
  }

  setRules(rules: Rules): boolean {
    if (this.phase !== "lobby") return false;
    this.rules = { ...rules };
    this.refresh();
    this.broadcastRooms();
    return true;
  }

  setTurnMs(ms: number) {
    this.turnMs = Math.max(0, Math.min(300_000, Math.floor(ms)));
    this.refresh();
    this.broadcastRooms();
  }

  /** Sets the host's own piece designs, which everyone then sees. */
  setPieces(designs: PieceDesign[]) {
    this.members.get(HOST_ID)!.pieces = designs;
    this.refresh();
    this.broadcastRooms();
  }

  setHostName(name: string) {
    this.members.get(HOST_ID)!.name = cleanText(name, "Host");
    this.refresh();
    this.broadcastRooms();
  }

  kick(seat: Seat): boolean {
    const slot = this.slots[seat];
    if (slot.kind !== "human" || slot.id === HOST_ID) return false;
    const m = this.members.get(slot.id);
    if (!m) return false;
    this.banned.add(m.id);
    m.chan?.send({ t: "kicked" } satisfies HostMsg);
    m.chan?.closeAfterSend();
    this.remove(m);
    return true;
  }

  /** A guest leaves on purpose: the seat frees up, or they forfeit a game in progress. */
  private leave(m: Member) {
    m.chan?.closeAfterSend();
    this.remove(m);
  }

  private remove(m: Member) {
    const seat = this.seatOf(m.id);
    this.members.delete(m.id);
    m.chan = null;
    if (seat !== null) {
      this.slots[seat] = { kind: "empty" };
      if (this.phase === "playing" && this.state && this.state.phase !== "over" && this.state.players.some(p => p.seat === seat)) {
        const r = applyAction(this.state, { type: "forfeit", seat });
        if (r) this.commit(r.state, r.events);
      }
    }
    this.refresh();
    this.broadcastRooms();
  }

  // ---- playing -----------------------------------------------------------------------------

  private setups(): PlayerSetup[] {
    const out: PlayerSetup[] = [];
    this.slots.forEach((s, i) => {
      const seat = i as Seat;
      if (s.kind === "human") out.push({ seat, name: this.members.get(s.id)?.name ?? `Player ${i + 1}`, kind: "human" });
      else if (s.kind === "bot") out.push({ seat, name: s.name, kind: "bot", level: s.level });
    });
    return out;
  }

  canStart(): boolean {
    return (this.phase === "lobby" || this.state?.phase === "over") && this.slots.filter(s => s.kind !== "empty").length >= 2;
  }

  /** Starts the first game, or a rematch once one has finished. */
  start(): boolean {
    if (!this.canStart()) return false;
    this.state = createGame(this.setups(), this.rules, freshSeed());
    this.phase = "playing";
    this.gameId += 1;
    this.n = 0;
    this.lastActionAt = this.now();
    this.bus.push(this.state, []);
    this.refresh();
    this.broadcastRooms();
    return true;
  }

  rematch = () => this.start();

  /** After a game: back to the waiting room, keeping everyone's seats. */
  toLobby(): boolean {
    if (this.phase !== "playing" || this.state?.phase !== "over") return false;
    this.phase = "lobby";
    this.state = null;
    this.gameId += 1;
    this.n = 0;
    this.refresh();
    this.broadcastRooms();
    return true;
  }

  private commit(state: GameState, events: GameEvent[]) {
    this.state = state;
    this.n += 1;
    this.lastActionAt = this.now();
    this.bus.push(state, events);
    const msg: HostMsg = { t: "frame", gameId: this.gameId, n: this.n, state, events };
    for (const m of this.members.values()) if (m.chan?.established) m.chan.send(msg);
    this.refresh();
  }

  /** Returns why an action was refused, or null once it has been applied. */
  private actFrom(m: Member, action: Exclude<Action, { type: "forfeit" }>): string | null {
    const s = this.state;
    if (this.phase !== "playing" || !s) return "no-game";
    if (s.phase === "over") return "game-over";
    const seat = this.seatOf(m.id);
    if (seat === null) return "spectator";
    const cur = currentPlayer(s);
    if (cur.seat !== seat || cur.kind !== "human") return "not-your-turn";
    return this.applyNow(action);
  }

  private applyNow(action: Action): string | null {
    if (!this.state) return "no-game";
    const r = applyAction(this.state, action);
    if (!r) return "illegal";
    this.commit(r.state, r.events);
    return null;
  }

  /** The host's own device: its own seat, plus bots (driven by the game screen). */
  act = (action: Action): boolean => {
    const s = this.state;
    if (!s || s.phase === "over" || action.type === "forfeit") return false;
    const cur = currentPlayer(s);
    const mine = this.seatOf(HOST_ID);
    if (!(cur.kind === "bot" || (cur.kind === "human" && cur.seat === mine))) return false;
    return this.applyNow(action) === null;
  };

  /** Call about once a second: plays for people who are away or have run out of time. Returns true if it acted. */
  tick(now: number = this.now()): boolean {
    const s = this.state;
    if (this.phase !== "playing" || !s || s.phase === "over") return false;
    const cur = currentPlayer(s);
    if (cur.kind !== "human" || cur.seat === this.seatOf(HOST_ID)) return false;
    const slot = this.slots[cur.seat];
    const m = slot.kind === "human" ? this.members.get(slot.id) : undefined;
    const away = !m || !m.chan?.open;
    const limit = away ? AWAY_GRACE_MS : this.turnMs;
    if (limit <= 0 || now - this.lastActionAt < limit) return false;
    const action = autoAction(s);
    return action ? this.applyNow(action) === null : false;
  }

  // ---- reactions ---------------------------------------------------------------------------

  private react(m: Member, emoji: string) {
    const t = this.now();
    if (t - m.lastReact < 700) return;
    m.lastReact = t;
    const seat = this.seatOf(m.id);
    const msg: HostMsg = { t: "reaction", seat, name: m.name, emoji };
    for (const o of this.members.values()) o.chan?.send(msg);
    const r: Reaction = { seat, name: m.name, emoji, id: ++this.reactionId };
    this.reactionListeners.forEach(cb => cb(r));
  }

  sendReaction(emoji: string) { this.react(this.members.get(HOST_ID)!, emoji); }

  // ---- chat --------------------------------------------------------------------------------

  /** Cleans, rate-limits (5 messages per 5 seconds each) and shares one chat message. Extra messages are dropped silently. */
  private postChat(m: Member, raw: string) {
    const text = cleanChat(raw);
    if (!text || !this.members.has(m.id)) return;
    const t = this.now();
    m.chatAt = m.chatAt.filter(x => t - x < CHAT_WINDOW_MS);
    if (m.chatAt.length >= CHAT_BURST) return;
    m.chatAt.push(t);
    const item: ChatItem = { id: ++this.chatId, seat: this.seatOf(m.id), name: m.name, text, at: t };
    this.chat = [...this.chat, item].slice(-CHAT_HISTORY);
    const msg: HostMsg = { t: "chat", item };
    for (const o of this.members.values()) if (o.chan?.established) o.chan.send(msg);
    this.refresh();
  }

  /** The host's own message. Returns false if it was empty or sent too fast. */
  sendChat(text: string): boolean {
    const before = this.chatId;
    this.postChat(this.members.get(HOST_ID)!, text);
    return this.chatId !== before;
  }

  // ---- views -------------------------------------------------------------------------------

  private slotViews(): SlotView[] {
    return this.slots.map((s, i): SlotView => {
      const seat = i as Seat;
      if (s.kind === "empty") return { seat, kind: "empty" };
      if (s.kind === "bot") return { seat, kind: "bot", name: s.name, level: s.level };
      const m = this.members.get(s.id);
      return { seat, kind: "human", name: m?.name ?? "Player", connected: !!m && (m.host || !!m.chan?.open), host: !!m?.host, ...(m?.pieces ? { pieces: m.pieces } : {}) };
    });
  }

  private roomFor(m: Member): RoomView {
    const seated = new Set(this.slots.flatMap(s => (s.kind === "human" ? [s.id] : [])));
    return {
      code: this.code,
      hostName: this.members.get(HOST_ID)!.name,
      gameId: this.gameId,
      phase: this.phase,
      rules: this.rules,
      turnMs: this.turnMs,
      slots: this.slotViews(),
      spectators: [...this.members.keys()].filter(id => !seated.has(id)).length,
      you: { seat: this.seatOf(m.id) },
      n: this.n,
      state: this.state,
    };
  }

  private broadcastRooms() {
    for (const m of this.members.values()) if (m.chan?.established) m.chan.send({ t: "room", room: this.roomFor(m) } satisfies HostMsg);
  }

  private refresh() {
    const host = this.members.get(HOST_ID)!;
    this.snapshot = {
      status: this.status, error: this.error, online: this.online, code: this.code, room: this.roomFor(host),
      chat: this.chat,
      members: [...this.members.values()].map(m => ({
        id: m.id, name: m.name, seat: this.seatOf(m.id), connected: m.host || !!m.chan?.open, check: m.check, host: m.host,
      })),
    };
    this.listeners.forEach(cb => cb(this.snapshot));
  }
}
