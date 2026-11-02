import { newRoomCode } from "../../net/crypto";
import { SecureChannel } from "../../net/secure";
import { TransportError, type Endpoint, type Link, type Network } from "../../net/transport";
import { freshSeed } from "../rng";
import { sanitizeRules, type RuleValues } from "../rules";
import { GameTable, type Frame } from "../table";
import type { BotLevel, GameDriver, GameEvent, SeatInfo } from "../types";
import { CHAT_HISTORY, PROTOCOL, cleanChat, cleanText, parseClientMsg, roomId, type ChatItem, type ClientMsg, type HostMsg, type RoomView, type SlotView } from "./protocol";

export const HOST_ID = "host";
const MAX_MEMBERS = 16;
export const AWAY_GRACE_MS = 8_000;
export const DEFAULT_TURN_MS = 0;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 5_000;

type Slot = { kind: "empty" } | { kind: "bot"; level: BotLevel; name: string } | { kind: "human"; id: string };
interface Member { id: string; name: string; host: boolean; chan: SecureChannel | null; check: string; lastReact: number; chatAt: number[] }
export interface MemberView { id: string; name: string; slot: number | null; connected: boolean; check: string; host: boolean }
export type HostStatus = "opening" | "ready" | "error" | "closed";
export interface HostSnapshot { status: HostStatus; error?: string; online: boolean; code: string; room: RoomView; members: MemberView[]; chat: ChatItem[] }
export interface Reaction { slot: number | null; name: string; emoji: string; id: number }
export interface HostOptions { network: Network; name: string; rules?: unknown; turnMs?: number; now?: () => number; code?: string; botDelayMs?: number }

/**
 * The authoritative side of a room for any game. Guests only ask; the host checks whose move it is, applies it with the driver and
 * sends each person a view that holds only what they may see.
 */
export class GameHost<S, A, V> {
  private endpoint?: Endpoint;
  private members = new Map<string, Member>();
  private banned = new Set<string>();
  private slots: Slot[];
  private playerSlots: number[] = [];
  private phase: "lobby" | "playing" = "lobby";
  private table: GameTable<S, A, V> | null = null;
  private gameId = 0;
  private n = 0;
  private rules: RuleValues;
  private turnMs: number;
  private now: () => number;
  private lastActionAt = 0;
  private status: HostStatus = "opening";
  private error?: string;
  private online = true;
  private reactionId = 0;
  private chat: ChatItem[] = [];
  private chatId = 0;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: HostSnapshot) => void>();
  private frameListeners = new Set<(f: Frame<V>) => void>();
  private reactionListeners = new Set<(r: Reaction) => void>();
  private snapshot!: HostSnapshot;
  code: string;

  constructor(readonly driver: GameDriver<S, A, V>, private opts: HostOptions) {
    this.rules = sanitizeRules(driver.schema, opts.rules);
    this.turnMs = opts.turnMs ?? DEFAULT_TURN_MS;
    this.now = opts.now ?? Date.now;
    this.code = opts.code ?? newRoomCode();
    this.slots = Array.from({ length: driver.maxPlayers }, () => ({ kind: "empty" as const }));
    this.members.set(HOST_ID, { id: HOST_ID, name: cleanText(opts.name, "Host"), host: true, chan: null, check: "", lastReact: 0, chatAt: [] });
    this.slots[0] = { kind: "human", id: HOST_ID };
    this.refresh();
  }

  async open(): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const endpoint = await this.opts.network.open(roomId(this.driver.id, this.code));
        if (this.status === "closed") { endpoint.close(); return; }
        this.endpoint = endpoint;
        endpoint.onIncoming(link => this.accept(link));
        endpoint.onStatus(s => { this.online = s === "open"; if (s === "closed" && this.status === "ready") this.status = "closed"; this.refresh(); });
        this.status = "ready";
        this.refresh();
        return;
      } catch (e) {
        if (e instanceof TransportError && e.kind === "unavailable-id" && !this.opts.code) { this.code = newRoomCode(); continue; }
        this.status = "error";
        this.error = e instanceof TransportError && e.kind === "network" ? "Could not reach the pairing service. Check your connection and try again." : "Could not open a room on this device.";
        this.refresh();
        return;
      }
    }
  }

  close() {
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.status === "closed") return;
    for (const m of this.members.values()) { m.chan?.send({ t: "bye" } satisfies HostMsg); m.chan?.closeAfterSend(); }
    this.status = "closed";
    const endpoint = this.endpoint;
    setTimeout(() => endpoint?.close(), 200);
    this.refresh();
  }

  subscribe(cb: (s: HostSnapshot) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  onFrame(cb: (f: Frame<V>) => void) { this.frameListeners.add(cb); return () => { this.frameListeners.delete(cb); }; }
  onReaction(cb: (r: Reaction) => void) { this.reactionListeners.add(cb); return () => { this.reactionListeners.delete(cb); }; }
  getSnapshot(): HostSnapshot { return this.snapshot; }

  // ---- connections ---------------------------------------------------------------------------
  private accept(link: Link) {
    if (this.status !== "ready") { link.close(); return; }
    const chan = new SecureChannel(link, "host");
    let member: Member | null = null;
    chan.onMessage(raw => {
      const msg = parseClientMsg(raw);
      if (!msg) return;
      if (!member) { if (msg.t !== "join") return chan.close(); member = this.join(chan, msg); return; }
      if (member.chan !== chan) return;
      this.handle(member, msg);
    });
    chan.onClose(() => { if (member && member.chan === chan) { member.chan = null; this.refresh(); this.broadcastRooms(); } });
    chan.handshake().catch(() => chan.close());
  }

  private reject(chan: SecureChannel, reason: string) { chan.send({ t: "error", reason } satisfies HostMsg); chan.closeAfterSend(); }

  private join(chan: SecureChannel, msg: Extract<ClientMsg, { t: "join" }>): Member | null {
    if (this.banned.has(msg.id)) { this.reject(chan, "kicked"); return null; }
    let m = this.members.get(msg.id);
    if (m) { const old = m.chan; m.chan = chan; m.name = msg.name; old?.close(); }
    else {
      if (this.members.size >= MAX_MEMBERS) { this.reject(chan, "full"); return null; }
      m = { id: msg.id, name: msg.name, host: false, chan, check: "", lastReact: 0, chatAt: [] };
      this.members.set(m.id, m);
      const free = this.slots.findIndex(s => s.kind === "empty");
      if (this.seatsOpen() && free >= 0) this.slots[free] = { kind: "human", id: m.id };
    }
    m.check = chan.check;
    this.refresh();
    this.broadcastRooms();
    chan.send({ t: "chatlog", items: this.chat } satisfies HostMsg);
    return m;
  }

  private handle(m: Member, msg: ClientMsg) {
    switch (msg.t) {
      case "act": { const err = this.actFrom(m, msg.action); if (err) m.chan?.send({ t: "reject", reason: err } satisfies HostMsg); break; }
      case "name": m.name = msg.name; this.refresh(); this.broadcastRooms(); break;
      case "react": this.react(m, msg.emoji); break;
      case "chat": this.postChat(m, msg.text); break;
      case "sync": m.chan?.send({ t: "room", room: this.roomFor(m) } satisfies HostMsg); m.chan?.send({ t: "chatlog", items: this.chat } satisfies HostMsg); break;
      case "bye": this.leave(m); break;
      case "join": break;
    }
  }

  // ---- seats ---------------------------------------------------------------------------------
  private slotOf(id: string): number | null { const i = this.slots.findIndex(s => s.kind === "human" && s.id === id); return i < 0 ? null : i; }
  private seatsOpen(): boolean { return this.phase === "lobby" || !!this.table?.over; }
  private playerOf(id: string): number | null {
    const slot = this.slotOf(id);
    if (slot === null || this.phase !== "playing") return null;
    const p = this.playerSlots.indexOf(slot);
    return p < 0 ? null : p;
  }

  setSlot(slot: number, kind: "empty" | "bot", level: BotLevel = "normal"): boolean {
    if (!this.seatsOpen() || !Number.isInteger(slot) || slot < 0 || slot >= this.slots.length || this.slots[slot].kind === "human") return false;
    this.slots[slot] = kind === "bot" ? { kind: "bot", level, name: `Bot ${slot + 1}` } : { kind: "empty" };
    this.refresh(); this.broadcastRooms();
    return true;
  }

  /** The host changes any rule, in the lobby or between games. Everyone sees the change at once. */
  setRules(rules: unknown): boolean {
    if (!this.seatsOpen()) return false;
    this.rules = sanitizeRules(this.driver.schema, rules);
    this.refresh(); this.broadcastRooms();
    return true;
  }
  setTurnMs(ms: number) { this.turnMs = Math.max(0, Math.min(300_000, Math.floor(ms))); this.refresh(); this.broadcastRooms(); }
  setHostName(name: string) { this.members.get(HOST_ID)!.name = cleanText(name, "Host"); this.refresh(); this.broadcastRooms(); }

  kick(slot: number): boolean {
    const s = this.slots[slot];
    if (!s || s.kind !== "human" || s.id === HOST_ID) return false;
    const m = this.members.get(s.id);
    if (!m) return false;
    this.banned.add(m.id);
    m.chan?.send({ t: "kicked" } satisfies HostMsg);
    m.chan?.closeAfterSend();
    this.remove(m);
    return true;
  }

  private leave(m: Member) { m.chan?.closeAfterSend(); this.remove(m); }

  private remove(m: Member) {
    const slot = this.slotOf(m.id);
    this.members.delete(m.id);
    m.chan = null;
    if (slot !== null) {
      const player = this.playerSlots.indexOf(slot);
      if (this.phase === "playing" && this.table && !this.table.over && player >= 0) {
        this.table.replaceWithBot(player);
        const s = this.table.seats[player];
        this.slots[slot] = { kind: "bot", level: s.level ?? "normal", name: s.name };
        this.broadcastFrame([]);
      } else this.slots[slot] = { kind: "empty" };
    }
    this.refresh(); this.broadcastRooms();
  }

  // ---- playing -------------------------------------------------------------------------------
  canStart(): boolean {
    const n = this.slots.filter(s => s.kind !== "empty").length;
    return this.seatsOpen() && n >= this.driver.minPlayers && n <= this.driver.maxPlayers;
  }

  start(): boolean {
    if (!this.canStart()) return false;
    const seats: SeatInfo[] = [];
    this.playerSlots = [];
    this.slots.forEach((s, i) => {
      if (s.kind === "human") { seats.push({ name: this.members.get(s.id)?.name ?? `Player ${i + 1}`, kind: "human" }); this.playerSlots.push(i); }
      else if (s.kind === "bot") { seats.push({ name: s.name, kind: "bot", level: s.level }); this.playerSlots.push(i); }
    });
    this.table = new GameTable(this.driver, seats, this.rules, freshSeed());
    this.phase = "playing";
    this.gameId += 1;
    this.n = 0;
    this.lastActionAt = this.now();
    this.emitHostFrame([]);
    this.refresh(); this.broadcastRooms();
    this.scheduleBot();
    return true;
  }
  rematch = () => this.start();

  toLobby(): boolean {
    if (this.phase !== "playing" || !this.table?.over) return false;
    this.phase = "lobby"; this.table = null; this.gameId += 1; this.n = 0;
    this.refresh(); this.broadcastRooms();
    return true;
  }

  private broadcastFrame(events: GameEvent[]) {
    const t = this.table;
    if (!t) return;
    this.n += 1;
    this.lastActionAt = this.now();
    for (const m of this.members.values()) if (m.chan?.established) m.chan.send({ t: "frame", gameId: this.gameId, n: this.n, frame: t.frame(this.playerOf(m.id), events) } satisfies HostMsg);
    this.emitHostFrame(events);
    this.refresh();
    this.scheduleBot();
  }

  private emitHostFrame(events: GameEvent[]) {
    if (!this.table) return;
    const f = this.table.frame(this.playerOf(HOST_ID), events);
    this.frameListeners.forEach(cb => cb(f));
  }

  private scheduleBot() {
    if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    const t = this.table;
    if (this.phase !== "playing" || !t || t.over || this.status === "closed" || !t.botTurn()) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const ev = this.table?.botStep();
      if (ev) this.broadcastFrame(ev); else this.scheduleBot();
    }, this.opts.botDelayMs ?? 900);
  }

  private actFrom(m: Member, raw: unknown): string | null {
    const t = this.table;
    if (this.phase !== "playing" || !t) return "no-game";
    const mine = this.playerOf(m.id);
    if (mine === null) return "spectator";
    if (t.over) return "game-over";
    const action = this.driver.parseAction(raw);
    if (action === null) return "illegal";
    const ev = t.act(mine, action as A);
    if (!ev) return t.actors().includes(mine) ? "illegal" : "not-your-turn";
    this.broadcastFrame(ev);
    return null;
  }

  /** The host's own moves. */
  act = (action: A): boolean => this.actFrom(this.members.get(HOST_ID)!, action) === null;

  /** Call about once a second: plays for people who are away or out of time. */
  tick(now: number = this.now()): boolean {
    const t = this.table;
    if (this.phase !== "playing" || !t || t.over) return false;
    for (const p of t.actors()) {
      const slot = this.slots[this.playerSlots[p]];
      if (slot?.kind !== "human") continue;
      const m = this.members.get(slot.id);
      if (m?.host) continue;
      const away = !m || !m.chan?.open;
      const limit = away ? AWAY_GRACE_MS : this.turnMs;
      if (limit <= 0 || now - this.lastActionAt < limit) continue;
      const ev = t.playFor(p);
      if (ev) { this.broadcastFrame(ev); return true; }
    }
    return false;
  }

  // ---- reactions and chat --------------------------------------------------------------------
  private react(m: Member, emoji: string) {
    const t = this.now();
    if (t - m.lastReact < 700) return;
    m.lastReact = t;
    const slot = this.slotOf(m.id);
    const msg: HostMsg = { t: "reaction", slot, name: m.name, emoji };
    for (const o of this.members.values()) o.chan?.send(msg);
    const r: Reaction = { slot, name: m.name, emoji, id: ++this.reactionId };
    this.reactionListeners.forEach(cb => cb(r));
  }
  sendReaction(emoji: string) { this.react(this.members.get(HOST_ID)!, emoji); }

  private postChat(m: Member, raw: string) {
    const text = cleanChat(raw);
    if (!text || !this.members.has(m.id)) return;
    const t = this.now();
    m.chatAt = m.chatAt.filter(x => t - x < CHAT_WINDOW_MS);
    if (m.chatAt.length >= CHAT_BURST) return;
    m.chatAt.push(t);
    const item: ChatItem = { id: ++this.chatId, slot: this.slotOf(m.id), name: m.name, text, at: t };
    this.chat = [...this.chat, item].slice(-CHAT_HISTORY);
    for (const o of this.members.values()) if (o.chan?.established) o.chan.send({ t: "chat", item } satisfies HostMsg);
    this.refresh();
  }
  sendChat(text: string): boolean { const before = this.chatId; this.postChat(this.members.get(HOST_ID)!, text); return this.chatId !== before; }

  // ---- views ---------------------------------------------------------------------------------
  private slotViews(): SlotView[] {
    return this.slots.map((s, slot): SlotView => {
      if (s.kind === "empty") return { slot, kind: "empty" };
      if (s.kind === "bot") return { slot, kind: "bot", name: s.name, level: s.level };
      const m = this.members.get(s.id);
      return { slot, kind: "human", name: m?.name ?? "Player", connected: !!m && (m.host || !!m.chan?.open), host: !!m?.host };
    });
  }

  private roomFor(m: Member): RoomView {
    const seated = new Set(this.slots.flatMap(s => (s.kind === "human" ? [s.id] : [])));
    const you = this.playerOf(m.id);
    return {
      code: this.code, hostName: this.members.get(HOST_ID)!.name, gameId: this.gameId, phase: this.phase, rules: this.rules, turnMs: this.turnMs, slots: this.slotViews(),
      spectators: [...this.members.keys()].filter(id => !seated.has(id)).length, you: { slot: this.slotOf(m.id), player: you }, n: this.n,
      frame: this.table ? this.table.frame(you) : null,
      away: this.phase === "playing" ? this.playerSlots.flatMap((slot, i) => { const s = this.slots[slot]; const mem = s?.kind === "human" ? this.members.get(s.id) : undefined; return s?.kind === "human" && !(mem && (mem.host || mem.chan?.open)) ? [i] : []; }) : [],
    };
  }

  private broadcastRooms() { for (const m of this.members.values()) if (m.chan?.established) m.chan.send({ t: "room", room: this.roomFor(m) } satisfies HostMsg); }

  private refresh() {
    const host = this.members.get(HOST_ID)!;
    this.snapshot = {
      status: this.status, error: this.error, online: this.online, code: this.code, room: this.roomFor(host), chat: this.chat,
      members: [...this.members.values()].map(m => ({ id: m.id, name: m.name, slot: this.slotOf(m.id), connected: m.host || !!m.chan?.open, check: m.check, host: m.host })),
    };
    this.listeners.forEach(cb => cb(this.snapshot));
  }
}

export { PROTOCOL };
