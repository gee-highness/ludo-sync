import { SecureChannel } from "../net/secure";
import type { Link } from "../net/transport";
import { decide, settleVote } from "./decide";
import { Mux, PartyNetwork } from "./mux";

export interface PartyMemberView { id: string; name: string; game: string | null; leader: boolean }
export interface PartyRoom { game: string; code: string }
export interface PartyVote { options: string[]; deadline: number; votes: Record<string, string> }
export interface PartyState {
  code: string;
  leaderId: string;
  members: PartyMemberView[];
  /** The game the party is going to play, once decided. */
  target: string | null;
  /** The leader's room for that game, once it is open. */
  room: PartyRoom | null;
  vote: PartyVote | null;
  /** Goes up each time the party settles on a game, so the same game chosen again is a fresh start. */
  round: number;
}
export type PartyStatus = "connecting" | "ready" | "closed";
export interface Me { id: string; name: string }

/** What the screens use, whether this phone leads the party or is a member. */
export interface Party {
  readonly leader: boolean;
  readonly me: Me;
  readonly network: PartyNetwork;
  status: PartyStatus;
  error?: string;
  state: PartyState | null;
  setGame(game: string | null): void;
  vote(game: string): void;
  subscribe(cb: () => void): () => void;
  close(): void;
}

type MemberMsg = { t: "hello"; id: string; name: string; code: string } | { t: "game"; game: string | null } | { t: "vote"; game: string };
type LeaderMsg = { t: "state"; state: PartyState } | { t: "bye"; reason: string };

const MAX_MEMBERS = 8;
const clean = (s: unknown, max = 24) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");
const cleanGame = (g: unknown): string | null => (typeof g === "string" && /^[a-z0-9-]{1,32}$/.test(g) ? g : null);

abstract class Base implements Party {
  abstract readonly leader: boolean;
  readonly network = new PartyNetwork();
  status: PartyStatus = "connecting";
  error?: string;
  state: PartyState | null = null;
  private subs = new Set<() => void>();
  constructor(readonly me: Me) {}
  abstract setGame(game: string | null): void;
  abstract vote(game: string): void;
  abstract close(): void;
  subscribe(cb: () => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  protected changed() { this.subs.forEach(cb => cb()); }
}

interface Seat { id: string; name: string; game: string | null; chan: SecureChannel; mux: Mux }
export interface LeaderOptions { settleMs?: number; voteMs?: number; now?: () => number; requireCode?: boolean }

/**
 * The phone that started the party. It keeps the list of members and which game each has open, decides what the party plays,
 * and hosts that game's room, which members reach through their party connection.
 */
export class PartyLeader extends Base {
  readonly leader = true;
  private seats = new Map<string, Seat>();
  private myGame: string | null = null;
  private settle?: ReturnType<typeof setTimeout>;
  private voteTimer?: ReturnType<typeof setTimeout>;
  private o: Required<LeaderOptions>;

  constructor(me: Me, readonly code: string, o: LeaderOptions = {}) {
    super(me);
    this.o = { settleMs: 2500, voteMs: 20_000, now: Date.now, requireCode: true, ...o };
    this.status = "ready";
    this.state = { code, leaderId: me.id, members: [], target: null, room: null, vote: null, round: 0 };
    this.publish();
  }

  /** A member's connection arrived (online through the party address, or nearby through an invite). */
  addLink(link: Link) {
    if (this.status === "closed") return link.close();
    const mux = new Mux(link, false);
    const chan = new SecureChannel(mux.control, "host");
    let seat: Seat | null = null;
    chan.onMessage(raw => {
      const m = raw as MemberMsg;
      if (!m || typeof m !== "object") return;
      if (!seat) {
        if (m.t !== "hello") return chan.close();
        const id = clean(m.id, 64);
        if (!id || id === this.me.id || (this.o.requireCode && m.code !== this.code)) return this.refuse(chan, "That party code is not right.");
        if (!this.seats.has(id) && this.seats.size >= MAX_MEMBERS - 1) return this.refuse(chan, "This party is full.");
        this.seats.get(id)?.mux.close(); // the same person reconnecting
        seat = { id, name: clean(m.name) || "Player", game: null, chan, mux };
        this.seats.set(id, seat);
        this.network.add(mux);
        this.changedPresence();
        return;
      }
      if (m.t === "game") { seat.game = cleanGame(m.game); this.changedPresence(); }
      else if (m.t === "vote") this.takeVote(seat.id, m.game);
    });
    chan.onClose(() => { if (seat && this.seats.get(seat.id) === seat) { this.seats.delete(seat.id); this.changedPresence(); } mux.close(); });
    chan.handshake().catch(() => mux.close());
  }

  setGame(game: string | null) { if (game !== this.myGame) { this.myGame = game; this.changedPresence(); } }
  vote(game: string) { this.takeVote(this.me.id, game); }

  /** The leader's room for the decided game is open (or closed again with null). */
  setRoom(room: PartyRoom | null) {
    const s = this.state!;
    if (JSON.stringify(s.room) === JSON.stringify(room)) return;
    this.state = { ...s, room, target: room ? room.game : s.target };
    this.publish();
  }

  close() {
    if (this.status === "closed") return;
    this.status = "closed";
    clearTimeout(this.settle); clearTimeout(this.voteTimer);
    for (const seat of this.seats.values()) { seat.chan.send({ t: "bye", reason: "The leader ended the party." } satisfies LeaderMsg); seat.chan.closeAfterSend(); }
    this.seats.clear();
    this.changed();
  }

  // ---- deciding ------------------------------------------------------------------------------------
  private presence() { return [{ id: this.me.id, game: this.myGame }, ...[...this.seats.values()].map(s => ({ id: s.id, game: s.game }))]; }

  private changedPresence() {
    this.publish();
    clearTimeout(this.settle);
    // people tap around; wait for things to settle before choosing
    this.settle = setTimeout(() => this.evaluate(), this.o.settleMs);
  }

  /** Exposed for tests: runs the decision now. */
  evaluate() {
    if (this.status === "closed") return;
    const s = this.state!;
    const games = this.presence().map(p => p.game);
    // a room in play, or a choice already made, stands while anybody is in that game
    if ((s.room || s.target) && games.includes(s.room?.game ?? s.target)) return;
    if (s.vote) return; // a vote is running; its timer settles it
    const d = decide(this.presence());
    if (d.kind === "none") { this.state = { ...s, target: null, room: null }; return this.publish(); }
    if (d.kind === "game") { this.state = { ...s, target: d.game, room: null, round: s.round + 1 }; return this.publish(); }
    this.state = { ...s, target: null, room: null, vote: { options: d.options, deadline: this.o.now() + this.o.voteMs, votes: {} } };
    this.voteTimer = setTimeout(() => this.endVote(), this.o.voteMs);
    this.publish();
  }

  private takeVote(id: string, game: unknown) {
    const s = this.state!;
    const g = cleanGame(game);
    if (!s.vote || !g || !s.vote.options.includes(g)) return;
    const votes = { ...s.vote.votes, [id]: g };
    this.state = { ...s, vote: { ...s.vote, votes } };
    this.publish();
    if (Object.keys(votes).length >= this.seats.size + 1) { clearTimeout(this.voteTimer); this.endVote(); } // everyone has voted
  }

  private endVote() {
    const s = this.state!;
    if (!s.vote || this.status === "closed") return;
    const game = settleVote(s.vote.options, s.vote.votes, this.me.id, this.myGame);
    this.state = { ...s, vote: null, target: game, room: null, round: s.round + 1 };
    this.publish();
  }

  private publish() {
    const s = this.state!;
    this.state = {
      ...s,
      members: [{ id: this.me.id, name: this.me.name, game: this.myGame, leader: true }, ...[...this.seats.values()].map(x => ({ id: x.id, name: x.name, game: x.game, leader: false }))],
    };
    const msg: LeaderMsg = { t: "state", state: this.state };
    for (const seat of this.seats.values()) if (seat.chan.established) seat.chan.send(msg);
    this.changed();
  }

  private refuse(chan: SecureChannel, reason: string) { chan.send({ t: "bye", reason } satisfies LeaderMsg); chan.closeAfterSend(); }
}

/** A phone that joined someone else's party. */
export class PartyMember extends Base {
  readonly leader = false;
  private chan: SecureChannel;
  private mux: Mux;
  private myGame: string | null = null;

  /** `link` is this phone's connection to the leader, which this phone dialled. */
  constructor(me: Me, link: Link, readonly code: string) {
    super(me);
    this.mux = new Mux(link, true);
    this.network.add(this.mux);
    this.chan = new SecureChannel(this.mux.control, "guest");
    this.chan.onMessage(raw => {
      const m = raw as LeaderMsg;
      if (m?.t === "state" && m.state && Array.isArray(m.state.members)) { this.state = m.state; this.status = "ready"; this.changed(); }
      else if (m?.t === "bye") { this.error = clean(m.reason, 120) || "The party ended."; this.end(); }
    });
    this.chan.onClose(() => { if (this.status !== "closed") { this.error ??= "Lost the connection to the party."; this.end(); } });
    this.chan.handshake().then(() => {
      this.chan.send({ t: "hello", id: me.id, name: me.name, code } satisfies MemberMsg);
      if (this.myGame) this.chan.send({ t: "game", game: this.myGame } satisfies MemberMsg);
    }).catch(() => { this.error = "Could not join the party."; this.end(); });
  }

  setGame(game: string | null) {
    if (game === this.myGame) return;
    this.myGame = game;
    if (this.chan.established) this.chan.send({ t: "game", game } satisfies MemberMsg);
  }
  vote(game: string) { if (this.chan.established) this.chan.send({ t: "vote", game } satisfies MemberMsg); }
  close() { if (this.status !== "closed") { this.end(); this.chan.close(); this.mux.close(); } }
  private end() { this.status = "closed"; this.changed(); }
}
