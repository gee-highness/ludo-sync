import { fromB64, toB64 } from "../net/crypto";
import { TransportError, type Bytes, type Endpoint, type EndpointStatus, type Link, type Network } from "../net/transport";

/**
 * Many connections inside one. A party keeps a single connection between the leader and each member (over the internet or a
 * nearby hotspot); this splits it into a control channel for the party itself plus any number of game connections, so a game
 * opened by the party runs the same way whichever way the phones are joined.
 *
 * Frames are text: `o<ch>:<target>` open, `a<ch>` accepted, `x<ch>` closed or refused, `s<ch>:<text>` and `b<ch>:<base64>` data.
 * Channel 0 is the control channel and is always open. Each side numbers the channels it opens from a different start, so they never clash.
 */
export const CONTROL = 0;
const DIAL_MS = 15_000;

class VLink implements Link {
  open = true;
  private msg?: (d: Bytes) => void;
  private shut?: () => void;
  private queue: Bytes[] = [];
  constructor(private mux: Mux, readonly ch: number, readonly remoteId: string, readonly initiator: boolean) {}
  send(data: Bytes) { if (this.open) this.mux.sendData(this.ch, data); }
  onMessage(cb: (d: Bytes) => void) { this.msg = cb; this.queue.splice(0).forEach(cb); }
  onClose(cb: () => void) { this.shut = cb; if (!this.open) queueMicrotask(cb); }
  receive(d: Bytes) { if (!this.open) return; if (this.msg) this.msg(d); else this.queue.push(d); }
  close() { if (!this.open) return; this.ended(); this.mux.sendClose(this.ch); }
  /** Closed from the other side or because the whole connection went. */
  ended() { if (!this.open) return; this.open = false; this.mux.forget(this.ch); queueMicrotask(() => this.shut?.()); }
}

type Acceptor = (target: string) => ((link: Link) => void) | null;

export class Mux {
  readonly control: Link;
  private chans = new Map<number, VLink>();
  private pending = new Map<number, { ok: () => void; no: (e: TransportError) => void }>();
  private nextCh: number;
  private acceptor?: Acceptor;
  private closeCbs: (() => void)[] = [];
  private dead = false;

  /** `first` must differ between the two ends: the side that dialled the underlying connection passes true. */
  constructor(private link: Link, first: boolean, readonly label = link.remoteId) {
    this.nextCh = first ? 1 : 2;
    const c = new VLink(this, CONTROL, label, first);
    this.chans.set(CONTROL, c);
    this.control = c;
    link.onMessage(d => { if (typeof d === "string") this.frame(d); });
    link.onClose(() => this.shutdown());
  }

  get open() { return !this.dead && this.link.open; }
  onAccept(a: Acceptor) { this.acceptor = a; }
  onClose(cb: () => void) { if (this.dead) cb(); else this.closeCbs.push(cb); }

  dial(target: string, timeoutMs = DIAL_MS): Promise<Link> {
    if (!this.open) return Promise.reject(new TransportError("network"));
    const ch = this.nextCh; this.nextCh += 2;
    const v = new VLink(this, ch, target, true);
    this.chans.set(ch, v);
    return new Promise<Link>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(ch); v.ended(); reject(new TransportError("timeout")); }, timeoutMs);
      this.pending.set(ch, {
        ok: () => { clearTimeout(timer); resolve(v); },
        no: e => { clearTimeout(timer); v.ended(); reject(e); },
      });
      this.raw(`o${ch}:${target}`);
    });
  }

  close() { if (!this.dead) { this.link.close(); this.shutdown(); } }

  // ---- used by the virtual links ---------------------------------------------------------------
  sendData(ch: number, d: Bytes) { this.raw(typeof d === "string" ? `s${ch}:${d}` : `b${ch}:${toB64(d)}`); }
  sendClose(ch: number) { this.raw(`x${ch}`); }
  forget(ch: number) { if (ch !== CONTROL) this.chans.delete(ch); }

  // ---- internals -------------------------------------------------------------------------------
  private raw(s: string) { if (this.open) this.link.send(s); }

  private frame(s: string) {
    const kind = s[0];
    const colon = s.indexOf(":");
    const ch = Number(colon < 0 ? s.slice(1) : s.slice(1, colon));
    if (!Number.isInteger(ch) || ch < 0) return;
    const body = colon < 0 ? "" : s.slice(colon + 1);
    switch (kind) {
      case "o": {
        if (ch === CONTROL || this.chans.has(ch)) return;
        const take = this.acceptor?.(body);
        if (!take) return this.raw(`x${ch}`);
        const v = new VLink(this, ch, body, false);
        this.chans.set(ch, v);
        this.raw(`a${ch}`);
        take(v);
        return;
      }
      case "a": { const p = this.pending.get(ch); this.pending.delete(ch); p?.ok(); return; }
      case "x": {
        const p = this.pending.get(ch);
        if (p) { this.pending.delete(ch); p.no(new TransportError("peer-unavailable")); return; }
        this.chans.get(ch)?.ended();
        return;
      }
      case "s": this.chans.get(ch)?.receive(body); return;
      case "b": { const v = this.chans.get(ch); if (v) { try { v.receive(fromB64(body)); } catch { /* bad frame */ } } return; }
    }
  }

  private shutdown() {
    if (this.dead) return;
    this.dead = true;
    this.pending.forEach(p => p.no(new TransportError("network")));
    this.pending.clear();
    [...this.chans.values()].forEach(v => v.ended());
    this.chans.clear();
    this.closeCbs.splice(0).forEach(cb => cb());
  }
}

/**
 * A `Network` whose addresses live inside the party: a game room opened on the leader's phone is reachable by every member through
 * their party connection, and by nobody else. Games take it in place of the usual network and need no other change.
 */
export class PartyNetwork implements Network {
  private endpoints = new Map<string, PartyEndpoint>();
  private muxes = new Set<Mux>();

  add(m: Mux) {
    this.muxes.add(m);
    m.onAccept(target => { const e = this.endpoints.get(target); return e ? l => e.incoming(l) : null; });
    m.onClose(() => this.muxes.delete(m));
  }

  async open(id: string): Promise<Endpoint> {
    if (this.endpoints.has(id)) throw new TransportError("unavailable-id");
    const e = new PartyEndpoint(id, this);
    this.endpoints.set(id, e);
    return e;
  }

  /** Tries every connection the party has; a member has one (to the leader), the leader one per member. */
  async dialOut(remoteId: string, timeoutMs: number): Promise<Link> {
    let last: TransportError = new TransportError("peer-unavailable");
    for (const m of [...this.muxes]) {
      try { return await m.dial(remoteId, timeoutMs); } catch (e) { last = e instanceof TransportError ? e : new TransportError("network"); }
    }
    throw last;
  }

  drop(e: PartyEndpoint) { if (this.endpoints.get(e.id) === e) this.endpoints.delete(e.id); }
}

class PartyEndpoint implements Endpoint {
  private onIn?: (l: Link) => void;
  private status?: (s: EndpointStatus) => void;
  private closed = false;
  constructor(readonly id: string, private net: PartyNetwork) {}
  incoming(l: Link) { if (this.closed) l.close(); else this.onIn?.(l); }
  dial(remoteId: string, timeoutMs = DIAL_MS) {
    if (this.closed) return Promise.reject(new TransportError("closed"));
    return this.net.dialOut(remoteId, timeoutMs);
  }
  onIncoming(cb: (l: Link) => void) { this.onIn = cb; }
  onStatus(cb: (s: EndpointStatus) => void) { this.status = cb; }
  close() { if (this.closed) return; this.closed = true; this.net.drop(this); this.status?.("closed"); }
}
