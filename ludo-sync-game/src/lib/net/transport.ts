/**
 * How two phones reach each other. The sync code only knows these interfaces, so the same logic
 * runs over PeerJS in the app and over an in-memory network in tests (where links can be cut,
 * messages dropped or tampered with, and the "internet" switched off).
 */
export type Bytes = Uint8Array | string;

export type TransportErrorKind =
  /** Someone (often our own earlier session) still holds this id on the broker. */
  | "unavailable-id"
  /** The other phone is not online right now. Normal. */
  | "peer-unavailable"
  /** No route to the broker. */
  | "network"
  /** Direct connection could not be made (blocked network, no relay). */
  | "blocked"
  | "timeout"
  | "unsupported"
  | "closed";

export class TransportError extends Error {
  constructor(readonly kind: TransportErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "TransportError";
  }
}

export interface Link {
  readonly remoteId: string;
  /** True on the phone that dialled. */
  readonly initiator: boolean;
  readonly open: boolean;
  send(data: Bytes): void;
  close(): void;
  onMessage(cb: (data: Bytes) => void): void;
  onClose(cb: () => void): void;
}

export type EndpointStatus = "open" | "lost" | "closed";

export interface Endpoint {
  readonly id: string;
  dial(remoteId: string, timeoutMs?: number): Promise<Link>;
  onIncoming(cb: (link: Link) => void): void;
  onStatus(cb: (status: EndpointStatus) => void): void;
  close(): void;
}

export interface Network {
  /** Registers `id` so others can dial it. */
  open(id: string): Promise<Endpoint>;
}

// ---------------------------------------------------------------------------------------------
// In-memory network (tests)
// ---------------------------------------------------------------------------------------------

type Interceptor = (from: string, to: string, data: Bytes) => Bytes | null;

export class MemoryNetwork implements Network {
  readonly endpoints = new Map<string, MemoryEndpoint>();
  readonly links = new Set<MemoryLink>();
  /** No internet: nothing can register or dial. */
  down = false;
  /** Called for every message; return null to drop it, or different data to tamper with it. */
  intercept?: Interceptor;
  /** Every message that crossed, for assertions about what was sent. */
  readonly log: { from: string; to: string; data: Bytes }[] = [];
  latencyMs = 0;

  async open(id: string): Promise<Endpoint> {
    if (this.down) throw new TransportError("network");
    if (this.endpoints.has(id)) throw new TransportError("unavailable-id");
    const e = new MemoryEndpoint(this, id);
    this.endpoints.set(id, e);
    return e;
  }

  /** Cuts every live connection, as if the Wi-Fi dropped. */
  cutLinks() { [...this.links].forEach(l => l.close()); }

  /** Takes everyone off the broker as well. */
  goOffline() {
    this.down = true;
    this.cutLinks();
    this.endpoints.forEach(e => e.emit("lost"));
  }

  goOnline() {
    this.down = false;
    this.endpoints.forEach(e => e.emit("open"));
  }

  deliver(from: string, to: MemoryLink, data: Bytes) {
    if (!to.open) return;
    const out = this.intercept ? this.intercept(from, to.localId, data) : data;
    if (out === null) return;
    this.log.push({ from, to: to.localId, data: out });
    const copy = typeof out === "string" ? out : new Uint8Array(out);
    const run = () => to.receive(copy);
    if (this.latencyMs > 0) setTimeout(run, this.latencyMs); else queueMicrotask(run);
  }
}

class MemoryEndpoint implements Endpoint {
  private incoming?: (link: Link) => void;
  private status?: (s: EndpointStatus) => void;
  closed = false;
  constructor(private net: MemoryNetwork, readonly id: string) {}

  async dial(remoteId: string): Promise<Link> {
    if (this.closed) throw new TransportError("closed");
    if (this.net.down) throw new TransportError("network");
    const target = this.net.endpoints.get(remoteId);
    if (!target || target.closed) throw new TransportError("peer-unavailable");
    const mine = new MemoryLink(this.net, this.id, remoteId, true);
    const theirs = new MemoryLink(this.net, remoteId, this.id, false);
    mine.peer = theirs;
    theirs.peer = mine;
    this.net.links.add(mine);
    this.net.links.add(theirs);
    setTimeout(() => target.incoming?.(theirs), 0);
    return mine;
  }

  onIncoming(cb: (link: Link) => void) { this.incoming = cb; }
  onStatus(cb: (s: EndpointStatus) => void) { this.status = cb; }
  emit(s: EndpointStatus) { this.status?.(s); }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.net.endpoints.get(this.id) === this) this.net.endpoints.delete(this.id);
    this.status?.("closed");
  }
}

export class MemoryLink implements Link {
  peer!: MemoryLink;
  open = true;
  private msg?: (d: Bytes) => void;
  private closeCb?: () => void;
  private queue: Bytes[] = [];
  constructor(private net: MemoryNetwork, readonly localId: string, readonly remoteId: string, readonly initiator: boolean) {}

  send(data: Bytes) {
    if (!this.open) return;
    this.net.deliver(this.localId, this.peer, data);
  }

  receive(data: Bytes) {
    if (!this.open) return;
    if (this.msg) this.msg(data); else this.queue.push(data);
  }

  onMessage(cb: (d: Bytes) => void) {
    this.msg = cb;
    const pending = this.queue.splice(0);
    pending.forEach(cb);
  }

  onClose(cb: () => void) { this.closeCb = cb; }

  close() {
    if (!this.open) return;
    this.open = false;
    this.net.links.delete(this);
    queueMicrotask(() => this.closeCb?.());
    // The other end hears about it after anything already on the way, as with a real connection
    const peer = this.peer;
    const run = () => peer.remoteClosed();
    if (this.net.latencyMs > 0) setTimeout(run, this.net.latencyMs); else queueMicrotask(run);
  }

  remoteClosed() {
    if (!this.open) return;
    this.open = false;
    this.net.links.delete(this);
    this.closeCb?.();
  }
}
