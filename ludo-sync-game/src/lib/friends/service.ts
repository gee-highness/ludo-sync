import { SecureChannel } from "../net/secure";
import { TransportError, type Endpoint, type Link, type Network } from "../net/transport";
import { FRIEND_PROTOCOL, INVITE_TTL_MS, macOf, parseFMsg, textFor, verifyMac, type FMsg } from "./protocol";
import { cleanFriendCode, cleanName, isFriendCode, loadBlocked, loadFriends, loadListening, loadMyCode, newSecret, peerIdOf, saveBlocked, saveFriends, type Friend, type FriendsStore } from "./store";

export interface Invite { id: string; code: string; name: string; game: string; room: string; at: number }
export interface FriendRequest { code: string; name: string; secret: string; at: number; /** Six digits both screens show, to check nobody is in the middle. */ check: string }
export type ServiceStatus = "off" | "connecting" | "ready" | "error";
export interface FriendsSnapshot { status: ServiceStatus; error?: string; listening: boolean; code: string; friends: Friend[]; requests: FriendRequest[]; invites: Invite[] }
export interface ServiceOptions { network: Network; store: FriendsStore; name: () => string; now?: () => number; dialMs?: number; replyMs?: number }

export type RequestResult = "added" | "sent" | "offline" | "self" | "invalid" | "blocked";
export type InviteResult = "delivered" | "offline" | "not-friend";
export interface Presence { online: boolean; known: boolean; name?: string }

const MAX_REQUESTS = 20;
const RATE = { windowMs: 10_000, max: 8 };
const wire = (m: FMsg) => ({ v: FRIEND_PROTOCOL, ...m });

/**
 * Friends without an account or a server of our own. Every device listens at its own address at the pairing service (`lsf-` plus its friend code),
 * so a friend can be reached directly: an encrypted connection, one message, done. Becoming friends swaps a secret; every invite is signed with it,
 * so only the real friend can invite you. It works while the app is open on the other device: there is nobody to hold a message for a phone that is off.
 */
export class FriendsService {
  readonly code: string;
  private friends: Friend[];
  private blocked: string[];
  private requests: FriendRequest[] = [];
  private invites: Invite[] = [];
  private seen = new Set<string>();
  private limits = new Map<string, number[]>();
  private endpoint?: Endpoint;
  private dialer?: Promise<Endpoint>;
  private status: ServiceStatus = "off";
  private error?: string;
  private listening: boolean;
  private stopped = false;
  private listeners = new Set<(s: FriendsSnapshot) => void>();
  private snap!: FriendsSnapshot;
  private now: () => number;
  private dialMs: number;
  private replyMs: number;

  constructor(private o: ServiceOptions) {
    this.now = o.now ?? Date.now;
    this.dialMs = o.dialMs ?? 8_000;
    this.replyMs = o.replyMs ?? 6_000;
    this.code = loadMyCode(o.store);
    this.friends = loadFriends(o.store);
    this.blocked = loadBlocked(o.store);
    this.listening = loadListening(o.store);
    this.refresh();
  }

  // ---- lifecycle -----------------------------------------------------------------------------

  async start(): Promise<void> {
    this.stopped = false;
    this.status = "connecting";
    this.refresh();
    if (this.listening) {
      try {
        const ep = await this.o.network.open(peerIdOf(this.code));
        if (this.stopped) { ep.close(); return; }
        this.endpoint = ep;
        ep.onIncoming(link => this.incoming(link));
        ep.onStatus(s => { if (s !== "open" && !this.stopped) { this.status = "error"; this.error = "Lost the connection to the pairing service."; this.refresh(); } });
      } catch (e) {
        // another tab already listens for this device: that is fine, it will hear the invites
        if (!(e instanceof TransportError && e.kind === "unavailable-id")) {
          this.status = "error";
          this.error = e instanceof TransportError && e.kind === "network" ? "Could not reach the pairing service." : "Friends are not available on this browser.";
          this.refresh();
          return;
        }
      }
    }
    this.status = "ready";
    this.error = undefined;
    this.refresh();
  }

  stop() {
    this.stopped = true;
    this.endpoint?.close();
    this.endpoint = undefined;
    this.dialer = undefined;
    this.status = "off";
    this.refresh();
  }

  /** Switches listening on or off: off means friends can no longer invite you, but you can still invite them. */
  async setListening(on: boolean) {
    this.listening = on;
    this.o.store.set("friends-on", on);
    this.endpoint?.close();
    this.endpoint = undefined;
    await this.start();
  }

  subscribe(cb: (s: FriendsSnapshot) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  getSnapshot() { return this.snap; }

  private refresh() {
    const t = this.now();
    this.invites = this.invites.filter(i => t - i.at < INVITE_TTL_MS);
    this.snap = { status: this.status, error: this.error, listening: this.listening, code: this.code, friends: this.friends, requests: this.requests, invites: this.invites };
    this.listeners.forEach(cb => cb(this.snap));
  }
  private save() { saveFriends(this.o.store, this.friends); saveBlocked(this.o.store, this.blocked); }
  private myName = () => cleanName(this.o.name(), "Player");

  // ---- receiving -----------------------------------------------------------------------------

  private limited(key: string): boolean {
    const t = this.now();
    const hits = (this.limits.get(key) ?? []).filter(x => t - x < RATE.windowMs);
    hits.push(t);
    this.limits.set(key, hits);
    if (this.limits.size > 500) this.limits.clear();
    return hits.length > RATE.max;
  }

  private incoming(link: Link) {
    const chan = new SecureChannel(link, "host");
    let count = 0;
    chan.onMessage(raw => { if (++count > 4) { chan.close(); return; } void this.handle(chan, raw); });
    chan.handshake().catch(() => chan.close());
  }

  private async handle(chan: SecureChannel, raw: unknown) {
    const m = parseFMsg(raw);
    if (!m) return;
    const reply = (x: FMsg) => { chan.send(wire(x)); chan.closeAfterSend(); };
    if (m.t === "req") {
      if (m.code === this.code || this.blocked.includes(m.code) || this.limited(m.code)) { chan.close(); return; }
      const f = this.friends.find(x => x.code === m.code);
      if (f && (f.confirmed && f.secret === m.secret || !f.confirmed)) {
        // we already are friends (they lost the answer), or both of us asked: settle it on their secret
        Object.assign(f, { secret: m.secret, confirmed: true, name: m.name });
        this.save(); this.refresh();
        reply({ t: "accept", code: this.code, name: this.myName(), mac: await macOf(m.secret, textFor.accept(this.code, m.secret)) });
        return;
      }
      if (f) { chan.close(); return; } // a confirmed friend with a different secret: ignore, they must be removed first
      this.requests = [{ code: m.code, name: m.name, secret: m.secret, at: this.now(), check: chan.check }, ...this.requests.filter(r => r.code !== m.code)].slice(0, MAX_REQUESTS);
      this.refresh();
      reply({ t: "seen" });
      return;
    }
    if (m.t === "accept") {
      if (await this.confirmFrom(m)) reply({ t: "seen" }); else chan.close();
      return;
    }
    if (m.t === "ping" || m.t === "invite") {
      const f = this.friends.find(x => x.code === m.code && x.confirmed);
      if (!f || this.blocked.includes(m.code) || this.limited(m.code)) { if (!f) reply({ t: "unknown" }); else chan.close(); return; }
      const fresh = Math.abs(this.now() - m.ts) < INVITE_TTL_MS;
      const text = m.t === "ping" ? textFor.ping(m.code, m.ts) : textFor.invite(m.code, m.game, m.room, m.ts);
      if (!fresh || !(await verifyMac(f.secret, text, m.mac))) { chan.close(); return; }
      if (f.name !== m.name) { f.name = m.name; this.save(); }
      if (m.t === "ping") { reply({ t: "pong", name: this.myName() }); this.refresh(); return; }
      const key = `${m.code}|${m.room}`;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        this.invites = [{ id: `${key}|${m.ts}`, code: m.code, name: f.name, game: m.game, room: m.room, at: this.now() }, ...this.invites].slice(0, 10);
      }
      this.refresh();
      reply({ t: "seen" });
    }
  }

  private async confirmFrom(m: Extract<FMsg, { t: "accept" }>): Promise<boolean> {
    const p = this.friends.find(x => x.code === m.code && !x.confirmed);
    if (!p || !(await verifyMac(p.secret, textFor.accept(m.code, p.secret), m.mac))) return false;
    p.confirmed = true; p.name = m.name; p.since = this.now();
    this.save(); this.refresh();
    return true;
  }

  // ---- sending -------------------------------------------------------------------------------

  private endpointForDialing(): Promise<Endpoint> {
    if (this.endpoint) return Promise.resolve(this.endpoint);
    // not listening (or another tab is): a throwaway address is enough to make calls
    return (this.dialer ??= this.o.network.open(`${peerIdOf(this.code)}-o${Math.random().toString(36).slice(2, 8)}`).catch(e => { this.dialer = undefined; throw e; }));
  }

  /** One short conversation with a friend's device: connect, send one message, wait for the answer. Null means they could not be reached. */
  private async call(code: string, msg: FMsg): Promise<FMsg | null> {
    let link: Link;
    try {
      // opening an address can hang when there is no connection: give up after the dial time
      const ep = await Promise.race([this.endpointForDialing(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no connection")), this.dialMs))]);
      link = await ep.dial(peerIdOf(code), this.dialMs);
    } catch { return null; }
    const chan = new SecureChannel(link, "guest");
    try { await chan.handshake(); } catch { return null; }
    return new Promise<FMsg | null>(resolve => {
      const timer = setTimeout(() => { chan.close(); resolve(null); }, this.replyMs);
      chan.onMessage(raw => { const r = parseFMsg(raw); if (!r) return; clearTimeout(timer); resolve(r); chan.close(); });
      chan.onClose(() => { clearTimeout(timer); resolve(null); });
      chan.send(wire(msg));
    });
  }

  /** Asks someone to be your friend. They see it the next time their app is open, and you hear back when they accept. */
  async request(input: string): Promise<RequestResult> {
    const code = cleanFriendCode(input);
    if (!isFriendCode(code)) return "invalid";
    if (code === this.code) return "self";
    if (this.blocked.includes(code)) return "blocked";
    let f = this.friends.find(x => x.code === code);
    if (f?.confirmed) return "added";
    if (!f) { f = { code, name: "Friend", secret: newSecret(), since: this.now(), confirmed: false }; this.friends = [...this.friends, f]; this.save(); this.refresh(); }
    const r = await this.call(code, { t: "req", code: this.code, name: this.myName(), secret: f.secret });
    if (!r) return "offline";
    if (r.t === "accept" && (await this.confirmFrom(r))) return "added";
    return "sent";
  }

  /** Accepts a request: they are your friend now, and (if their app is open) they hear about it at once. */
  async acceptRequest(code: string): Promise<boolean> {
    const r = this.requests.find(x => x.code === code);
    if (!r) return false;
    this.requests = this.requests.filter(x => x.code !== code);
    this.friends = [...this.friends.filter(f => f.code !== code), { code, name: r.name, secret: r.secret, since: this.now(), confirmed: true }];
    this.save(); this.refresh();
    const mac = await macOf(r.secret, textFor.accept(this.code, r.secret));
    return (await this.call(code, { t: "accept", code: this.code, name: this.myName(), mac })) !== null;
  }
  declineRequest(code: string) { this.requests = this.requests.filter(x => x.code !== code); this.refresh(); }
  block(code: string) {
    this.blocked = [...new Set([...this.blocked, code])];
    this.requests = this.requests.filter(x => x.code !== code);
    this.friends = this.friends.filter(f => f.code !== code);
    this.save(); this.refresh();
  }
  remove(code: string) { this.friends = this.friends.filter(f => f.code !== code); this.save(); this.refresh(); }
  rename(code: string, name: string) { const f = this.friends.find(x => x.code === code); if (f) { f.name = cleanName(name, f.name); this.save(); this.refresh(); } }
  dismissInvite(id: string) { this.invites = this.invites.filter(i => i.id !== id); this.refresh(); }

  /** Sends a friend an invite to a room. "delivered" means their app showed it. */
  async invite(code: string, game: string, room: string): Promise<InviteResult> {
    const f = this.friends.find(x => x.code === code && x.confirmed);
    if (!f) return "not-friend";
    const ts = this.now();
    const mac = await macOf(f.secret, textFor.invite(this.code, game, room, ts));
    const r = await this.call(code, { t: "invite", code: this.code, name: this.myName(), game, room, ts, mac });
    return r?.t === "seen" ? "delivered" : r?.t === "unknown" ? "not-friend" : "offline";
  }

  /** Is this friend's app open right now? Also finishes a friend request that was answered while you were away. */
  async ping(code: string): Promise<Presence> {
    const f = this.friends.find(x => x.code === code);
    if (!f) return { online: false, known: false };
    if (!f.confirmed) { const r = await this.request(code); return { online: r === "added" || r === "sent", known: r === "added" }; }
    const ts = this.now();
    const r = await this.call(code, { t: "ping", code: this.code, name: this.myName(), ts, mac: await macOf(f.secret, textFor.ping(this.code, ts)) });
    if (!r) return { online: false, known: true };
    if (r.t === "pong") { if (f.name !== r.name) { f.name = r.name; this.save(); this.refresh(); } return { online: true, known: true, name: r.name }; }
    return { online: true, known: false };
  }
}
