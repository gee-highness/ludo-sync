import { newRoomCode } from "../../net/crypto";
import { SecureChannel } from "../../net/secure";
import { TransportError, type Endpoint, type Link, type Network } from "../../net/transport";
import { freshSeed } from "../../ludo/rng";
import { chooseAction } from "../bot";
import { applyAction, cleanRules, createGame, defaultRules } from "../engine";
import type { Action, BotLevel, GameEvent, GameState, PlayerSetup, Rules } from "../types";
import { viewOf, type TableView } from "../view";
import { MAX_SLOTS, PROTOCOL, ROOM_ID_PREFIX, cleanText, parseClientMsg, type ClientMsg, type HostMsg, type RoomView, type SlotView } from "./protocol";

export const HOST_ID = "host";
const MAX_MEMBERS = 12;
/** How long a seat whose owner is offline gets before the table plays for them. */
export const AWAY_GRACE_MS = 8_000;
export const DEFAULT_TURN_MS = 60_000;
/** The next round starts by itself after this long if nobody taps for it. */
export const NEXT_ROUND_MS = 30_000;

type Slot = { kind: "empty" } | { kind: "bot"; level: BotLevel; name: string } | { kind: "human"; id: string };

interface Member { id: string; name: string; host: boolean; chan: SecureChannel | null; check: string; lastReact: number }
export interface MemberView { id: string; name: string; slot: number | null; connected: boolean; check: string; host: boolean }
export type HostStatus = "opening" | "ready" | "error" | "closed";

export interface HostSnapshot { status: HostStatus; error?: string; online: boolean; code: string; room: RoomView; members: MemberView[] }
export interface Reaction { slot: number | null; name: string; emoji: string; id: number }
export interface FrameInfo { view: TableView; events: GameEvent[] }

export interface HostOptions {
  network: Network;
  name: string;
  rules?: Partial<Rules>;
  turnMs?: number;
  now?: () => number;
  code?: string;
  /** How long a bot waits before acting; zero in tests. */
  botDelayMs?: number;
}

/**
 * The authoritative side of a Skip-Bo room. Guests only ask; the host checks whose turn it is, applies the move with the engine,
 * and sends each person a view of the table that holds only what they may see: their own hand and everyone's face-up cards.
 */
export class SkipBoHost {
  private endpoint?: Endpoint;
  private members = new Map<string, Member>();
  private banned = new Set<string>();
  private slots: Slot[] = Array.from({ length: MAX_SLOTS }, () => ({ kind: "empty" }));
  /** The slot each player at the table came from. */
  private playerSlots: number[] = [];
  private phase: "lobby" | "playing" = "lobby";
  private state: GameState | null = null;
  private gameId = 0;
  private n = 0;
  private rules: Partial<Rules>;
  private turnMs: number;
  private now: () => number;
  private lastActionAt = 0;
  private status: HostStatus = "opening";
  private error?: string;
  private online = true;
  private reactionId = 0;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: HostSnapshot) => void>();
  private frameListeners = new Set<(f: FrameInfo) => void>();
  private reactionListeners = new Set<(r: Reaction) => void>();
  private snapshot!: HostSnapshot;
  code: string;

  constructor(private opts: HostOptions) {
    this.rules = { ...(opts.rules ?? {}) };
    this.turnMs = opts.turnMs ?? DEFAULT_TURN_MS;
    this.now = opts.now ?? Date.now;
    this.code = opts.code ?? newRoomCode();
    this.members.set(HOST_ID, { id: HOST_ID, name: cleanText(opts.name, "Host"), host: true, chan: null, check: "", lastReact: 0 });
    this.slots[0] = { kind: "human", id: HOST_ID };
    this.refresh();
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  async open(): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt++) {
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
        if (e instanceof TransportError && e.kind === "unavailable-id" && !this.opts.code) { this.code = newRoomCode(); continue; }
        this.status = "error";
        this.error = e instanceof TransportError && e.kind === "network"
          ? "Could not reach the pairing service. Check your connection and try again." : "Could not open a room on this device.";
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

  subscribe(cb: (s: HostSnapshot) => void): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  onFrame(cb: (f: FrameInfo) => void): () => void { this.frameListeners.add(cb); return () => { this.frameListeners.delete(cb); }; }
  onReaction(cb: (r: Reaction) => void): () => void { this.reactionListeners.add(cb); return () => { this.reactionListeners.delete(cb); }; }
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
      if (member.chan !== chan) return;
      this.handle(member, msg);
    });
    chan.onClose(() => { if (member && member.chan === chan) { member.chan = null; this.refresh(); this.broadcastRooms(); } });
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
      m = { id: msg.id, name: msg.name, host: false, chan, check: "", lastReact: 0 };
      this.members.set(m.id, m);
      const free = this.slots.findIndex(s => s.kind === "empty");
      if (this.seatsOpen() && free >= 0) this.slots[free] = { kind: "human", id: m.id };
    }
    m.check = chan.check;
    this.refresh();
    this.broadcastRooms();
    return m;
  }

  private handle(m: Member, msg: ClientMsg) {
    switch (msg.t) {
      case "act": {
        const err = this.actFrom(m, msg.action);
        if (err) m.chan?.send({ t: "reject", reason: err } satisfies HostMsg);
        break;
      }
      case "name": m.name = msg.name; this.refresh(); this.broadcastRooms(); break;
      case "react": this.react(m, msg.emoji); break;
      case "sync": m.chan?.send({ t: "room", room: this.roomFor(m) } satisfies HostMsg); break;
      case "bye": this.leave(m); break;
      case "join": break;
    }
  }

  // ---- seats -------------------------------------------------------------------------------

  private slotOf(id: string): number | null {
    const i = this.slots.findIndex(s => s.kind === "human" && s.id === id);
    return i < 0 ? null : i;
  }
  private seatsOpen(): boolean { return this.phase === "lobby" || this.state?.phase === "over"; }
  private playerOf(id: string): number | null {
    const slot = this.slotOf(id);
    if (slot === null || this.phase !== "playing") return null;
    const p = this.playerSlots.indexOf(slot);
    return p < 0 ? null : p;
  }

  /** Host only, in the lobby: make a seat open, or fill it with a bot. */
  setSlot(slot: number, kind: "empty" | "bot", level: BotLevel = "normal"): boolean {
    if (!this.seatsOpen() || !Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS || this.slots[slot].kind === "human") return false;
    this.slots[slot] = kind === "bot" ? { kind: "bot", level, name: `Bot ${slot + 1}` } : { kind: "empty" };
    this.refresh();
    this.broadcastRooms();
    return true;
  }

  setRules(rules: Partial<Rules>): boolean {
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

  setHostName(name: string) {
    this.members.get(HOST_ID)!.name = cleanText(name, "Host");
    this.refresh();
    this.broadcastRooms();
  }

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

  private leave(m: Member) {
    m.chan?.closeAfterSend();
    this.remove(m);
  }

  /** A person leaves for good: the seat frees up in the lobby, and at a running table a bot takes over their cards. */
  private remove(m: Member) {
    const slot = this.slotOf(m.id);
    this.members.delete(m.id);
    m.chan = null;
    if (slot !== null) {
      const player = this.playerSlots.indexOf(slot);
      if (this.phase === "playing" && this.state && this.state.phase !== "over" && player >= 0) {
        const name = `${this.state.players[player].name} (bot)`;
        this.slots[slot] = { kind: "bot", level: "normal", name };
        const next = structuredClone(this.state);
        next.players[player].kind = "bot";
        next.players[player].level = "normal";
        next.players[player].name = name.slice(0, 24);
        this.commit(next, []);
      } else this.slots[slot] = { kind: "empty" };
    }
    this.refresh();
    this.broadcastRooms();
  }

  // ---- playing -----------------------------------------------------------------------------

  canStart(): boolean {
    return this.seatsOpen() && this.slots.filter(s => s.kind !== "empty").length >= 2;
  }

  /** Starts the first game, or a rematch once one has finished. */
  start(): boolean {
    if (!this.canStart()) return false;
    const setups: PlayerSetup[] = [];
    this.playerSlots = [];
    this.slots.forEach((s, i) => {
      if (s.kind === "human") { setups.push({ name: this.members.get(s.id)?.name ?? `Player ${i + 1}`, kind: "human" }); this.playerSlots.push(i); }
      else if (s.kind === "bot") { setups.push({ name: s.name, kind: "bot", level: s.level }); this.playerSlots.push(i); }
    });
    this.state = createGame(setups, this.rules, freshSeed());
    this.phase = "playing";
    this.gameId += 1;
    this.n = 0;
    this.lastActionAt = this.now();
    this.emitFrame([]);
    this.refresh();
    this.broadcastRooms();
    this.scheduleBot();
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
    for (const m of this.members.values()) {
      if (!m.chan?.established) continue;
      m.chan.send({ t: "frame", gameId: this.gameId, n: this.n, view: viewOf(state, this.playerOf(m.id)), events } satisfies HostMsg);
    }
    this.emitFrame(events);
    this.refresh();
    this.scheduleBot();
  }

  private emitFrame(events: GameEvent[]) {
    if (!this.state) return;
    const view = viewOf(this.state, this.playerOf(HOST_ID));
    this.frameListeners.forEach(cb => cb({ view, events }));
  }

  private scheduleBot() {
    if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    const s = this.state;
    if (this.phase !== "playing" || !s || s.phase !== "play" || s.players[s.turn].kind !== "bot" || this.status === "closed") return;
    const delay = this.opts.botDelayMs ?? 1100;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const cur = this.state;
      if (!cur || cur.phase !== "play" || cur.players[cur.turn].kind !== "bot") return;
      const action = chooseAction(cur);
      if (action) this.applyNow(action);
    }, delay);
  }

  /** Returns why an action was refused, or null once it has been applied. */
  private actFrom(m: Member, action: Action): string | null {
    const s = this.state;
    if (this.phase !== "playing" || !s) return "no-game";
    const mine = this.playerOf(m.id);
    if (mine === null) return "spectator";
    if (action.type === "nextRound") return s.phase === "roundOver" ? this.applyNow(action) : "illegal";
    if (s.phase !== "play") return "game-over";
    if (s.turn !== mine || s.players[s.turn].kind !== "human") return "not-your-turn";
    return this.applyNow(action);
  }

  private applyNow(action: Action): string | null {
    if (!this.state) return "no-game";
    const r = applyAction(this.state, action);
    if (!r) return "illegal";
    this.commit(r.state, r.events);
    return null;
  }

  /** The host's own moves. */
  act = (action: Action): boolean => this.actFrom(this.members.get(HOST_ID)!, action) === null;

  /** Call about once a second: plays for people who are away or out of time, and starts the next round if nobody does. */
  tick(now: number = this.now()): boolean {
    const s = this.state;
    if (this.phase !== "playing" || !s) return false;
    if (s.phase === "roundOver") return now - this.lastActionAt >= NEXT_ROUND_MS && this.applyNow({ type: "nextRound" }) === null;
    if (s.phase !== "play") return false;
    const cur = s.players[s.turn];
    if (cur.kind !== "human") return false;
    const slot = this.slots[this.playerSlots[s.turn]];
    const m = slot?.kind === "human" ? this.members.get(slot.id) : undefined;
    if (m?.host) return false;
    const away = !m || !m.chan?.open;
    const limit = away ? AWAY_GRACE_MS : this.turnMs;
    if (limit <= 0 || now - this.lastActionAt < limit) return false;
    const action = chooseAction(s, "normal");
    return action ? this.applyNow(action) === null : false;
  }

  // ---- reactions ---------------------------------------------------------------------------

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

  // ---- views -------------------------------------------------------------------------------

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
      code: this.code, hostName: this.members.get(HOST_ID)!.name, gameId: this.gameId, phase: this.phase,
      rules: { ...defaultRules(Math.max(2, this.slots.filter(s => s.kind !== "empty").length)), ...cleanRulesLoose(this.rules) },
      turnMs: this.turnMs, slots: this.slotViews(), spectators: [...this.members.keys()].filter(id => !seated.has(id)).length,
      you: { slot: this.slotOf(m.id), player: you }, n: this.n, view: this.state ? viewOf(this.state, you) : null,
      away: this.phase === "playing" ? this.playerSlots.flatMap((slot, i) => { const s = this.slots[slot]; const mem = s?.kind === "human" ? this.members.get(s.id) : undefined; return s?.kind === "human" && !(mem && (mem.host || mem.chan?.open)) ? [i] : []; }) : [],
    };
  }

  private broadcastRooms() {
    for (const m of this.members.values()) if (m.chan?.established) m.chan.send({ t: "room", room: this.roomFor(m) } satisfies HostMsg);
  }

  private refresh() {
    const host = this.members.get(HOST_ID)!;
    this.snapshot = {
      status: this.status, error: this.error, online: this.online, code: this.code, room: this.roomFor(host),
      members: [...this.members.values()].map(m => ({ id: m.id, name: m.name, slot: this.slotOf(m.id), connected: m.host || !!m.chan?.open, check: m.check, host: m.host })),
    };
    this.listeners.forEach(cb => cb(this.snapshot));
  }
}

/** Only the fields the host actually set, so the lobby can show defaults for the rest. */
const cleanRulesLoose = (r: Partial<Rules>): Partial<Rules> => {
  const out: Partial<Rules> = {};
  if (Number.isInteger(r.stockSize)) out.stockSize = Math.max(5, Math.min(30, r.stockSize as number));
  if (typeof r.tournament === "boolean") out.tournament = r.tournament;
  if (Number.isInteger(r.target)) out.target = Math.max(50, Math.min(5000, r.target as number));
  return out;
};

export { cleanRules };
