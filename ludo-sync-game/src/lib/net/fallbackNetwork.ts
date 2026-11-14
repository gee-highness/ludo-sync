import { TransportError, type Endpoint, type EndpointStatus, type Link, type Network } from "./transport";

/** How long to keep waiting for the slower service once one of them is already up. */
const GRACE_MS = 4_000;
/** One service gets at most this long per dial when another is waiting behind it. */
const SHARE_MS = 12_000;

/**
 * Pairs through several services at once, so that when one is down or over its limit the other still works.
 * A room listens on every service that answers; a guest tries them one after another, starting with the one that worked last.
 */
export class FallbackNetwork implements Network {
  /** Index of the service that connected most recently; the next dial starts there. */
  private lastGood = 0;
  constructor(private readonly nets: Network[]) {}

  /** Used by the endpoints below to remember which service worked. */
  noteGood(i: number) { this.lastGood = i; }
  start() { return this.lastGood; }

  async open(id: string): Promise<Endpoint> {
    const eps: (Endpoint | null)[] = this.nets.map(() => null);
    const errors: TransportError[] = [];
    let composite: FallbackEndpoint | null = null;
    return new Promise<Endpoint>((resolve, reject) => {
      let pending = this.nets.length, settled = false, grace: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (settled) return; settled = true; clearTimeout(grace);
        const up = eps.some(Boolean);
        // someone still holds this id on a service (often our own earlier session): let the caller's retry logic deal with it
        const taken = errors.find(e => e.kind === "unavailable-id");
        if (taken) { eps.forEach(e => e?.close()); return reject(taken); }
        if (!up) return reject(errors[0] ?? new TransportError("network"));
        composite = new FallbackEndpoint(id, this, eps);
        resolve(composite);
      };
      this.nets.forEach((net, i) => {
        net.open(id).then(ep => {
          if (settled) { if (composite) composite.add(i, ep); else ep.close(); return; }
          eps[i] = ep;
          if (!grace) grace = setTimeout(finish, GRACE_MS);
        }, (e: unknown) => {
          errors.push(e instanceof TransportError ? e : new TransportError("network", String(e)));
        }).finally(() => { if (--pending === 0) finish(); });
      });
    });
  }
}

class FallbackEndpoint implements Endpoint {
  private incoming?: (link: Link) => void;
  private status?: (s: EndpointStatus) => void;
  private state: (EndpointStatus | null)[];
  private closed = false;

  constructor(readonly id: string, private net: FallbackNetwork, private eps: (Endpoint | null)[]) {
    this.state = eps.map(e => (e ? "open" : null));
    eps.forEach((e, i) => e && this.wire(i, e));
  }

  /** A service that came up after the grace period joins the room late. */
  add(i: number, ep: Endpoint) {
    if (this.closed) return ep.close();
    this.eps[i] = ep; this.state[i] = "open"; this.wire(i, ep); this.emit();
  }

  private wire(i: number, ep: Endpoint) {
    ep.onIncoming(l => { this.net.noteGood(i); this.incoming?.(l); });
    ep.onStatus(s => { this.state[i] = s === "closed" ? "lost" : s; this.emit(); });
  }

  /** Open while any service is open, lost only when every one is. */
  private emit() {
    if (this.closed) return;
    const live = this.state.filter(Boolean);
    this.status?.(live.some(s => s === "open") ? "open" : "lost");
  }

  async dial(remoteId: string, timeoutMs = 20_000): Promise<Link> {
    if (this.closed) throw new TransportError("closed");
    const order: number[] = [];
    const first = this.net.start();
    for (let k = 0; k < this.eps.length; k++) { const i = (first + k) % this.eps.length; if (this.eps[i]) order.push(i); }
    const per = order.length > 1 ? Math.min(timeoutMs, SHARE_MS) : timeoutMs;
    let best: TransportError | null = null;
    for (const i of order) {
      try {
        const link = await this.eps[i]!.dial(remoteId, per);
        this.net.noteGood(i);
        return link;
      } catch (e) {
        const err = e instanceof TransportError ? e : new TransportError("network", String(e));
        if (err.kind === "closed" && this.closed) throw err;
        // a service that answered "not there" is the more useful thing to tell the player
        if (!best || err.kind === "peer-unavailable") best = err;
      }
    }
    throw best ?? new TransportError("network");
  }

  onIncoming(cb: (link: Link) => void) { this.incoming = cb; }
  onStatus(cb: (s: EndpointStatus) => void) { this.status = cb; }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.eps.forEach(e => e?.close());
    this.status?.("closed");
  }
}
