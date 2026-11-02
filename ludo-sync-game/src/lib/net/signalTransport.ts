import { randomBytes, toB64 } from "./crypto";
import { TransportError, type Bytes, type Endpoint, type EndpointStatus, type Link, type Network } from "./transport";

/** The few parts of a WebRTC connection this needs. A real RTCPeerConnection fits; tests use a fake. */
export interface RtcChannelLike {
  binaryType: string;
  readyState: string;
  send(data: string | Uint8Array): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
}
export interface RtcPeerLike {
  createDataChannel(label: string, opts?: { ordered?: boolean }): RtcChannelLike;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(d?: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(d: { type: string; sdp?: string }): Promise<void>;
  readonly localDescription: { type: string; sdp: string } | null;
  readonly iceGatheringState: string;
  addEventListener(type: string, cb: (e: never) => void): void;
  close(): void;
}
export interface SignalApi { post(body: unknown): Promise<{ status: number; body: unknown } | null> }

export const fetchSignalApi = (url = "/api/signal"): SignalApi => ({
  post: async body => {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      let b: unknown = null;
      try { b = await r.json(); } catch { /* no body */ }
      return { status: r.status, body: b };
    } catch { return null; }
  },
});

const DEFAULT_ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const iceFromEnv = (): unknown[] => { try { const raw = process.env.NEXT_PUBLIC_ICE_SERVERS; const v = raw ? JSON.parse(raw) : null; return Array.isArray(v) && v.length ? v : DEFAULT_ICE; } catch { return DEFAULT_ICE; } };
const browserRtc = (): RtcPeerLike => new RTCPeerConnection({ iceServers: iceFromEnv() as RTCIceServer[] }) as unknown as RtcPeerLike;

export interface SignalNetworkOptions {
  api?: SignalApi;
  rtc?: () => RtcPeerLike;
  /** How often to look for mail while idle, and while a connection is being made. */
  idleMs?: number;
  busyMs?: number;
  /** How long to wait for a phone to finish gathering its connection details. */
  gatherMs?: number;
}

/**
 * Pairing through our own endpoint instead of PeerJS's. Phones leave each other connection details (a few kilobytes) through `/api/signal`,
 * then talk directly over WebRTC, so no game traffic goes through the server. Same `Network` interface, so everything above is unchanged.
 */
export class SignalNetwork implements Network {
  constructor(private o: SignalNetworkOptions = {}) {}

  async open(id: string): Promise<Endpoint> {
    const api = this.o.api ?? fetchSignalApi();
    const token = toB64(randomBytes(24)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const r = await api.post({ op: "open", id, token });
    if (!r) throw new TransportError("network", "Could not reach the pairing endpoint");
    if (r.status === 409) throw new TransportError("unavailable-id");
    if (r.status === 503) throw new TransportError("unsupported", "Pairing is not switched on");
    if (r.status !== 200) throw new TransportError("network", `Pairing refused (${r.status})`);
    return new SignalEndpoint(id, token, api, this.o.rtc ?? browserRtc, this.o.idleMs ?? 1500, this.o.busyMs ?? 600, this.o.gatherMs ?? 3000);
  }
}

class RtcLink implements Link {
  private msg?: (d: Bytes) => void;
  private shut?: () => void;
  private closed = false;
  constructor(private ch: RtcChannelLike, readonly remoteId: string, readonly initiator: boolean) {
    ch.binaryType = "arraybuffer";
    ch.onmessage = e => { const d = e.data; this.msg?.(typeof d === "string" ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : (d as Uint8Array)); };
    ch.onclose = () => { this.closed = true; this.shut?.(); };
  }
  get open() { return !this.closed && this.ch.readyState === "open"; }
  send(data: Bytes) { if (this.open) this.ch.send(data); }
  close() { if (this.closed) return; this.closed = true; try { this.ch.close(); } catch { /* already closed */ } this.shut?.(); }
  onMessage(cb: (d: Bytes) => void) { this.msg = cb; }
  onClose(cb: () => void) { this.shut = cb; if (this.closed) cb(); }
}

const gathered = (pc: RtcPeerLike, ms: number): Promise<void> => new Promise(resolve => {
  if (pc.iceGatheringState === "complete") return resolve();
  const done = () => { clearTimeout(t); resolve(); };
  const t = setTimeout(done, ms);
  pc.addEventListener("icegatheringstatechange", (() => { if (pc.iceGatheringState === "complete") done(); }) as never);
});

class SignalEndpoint implements Endpoint {
  private incoming?: (l: Link) => void;
  private status?: (s: EndpointStatus) => void;
  private closed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private fails = 0;
  private lost = false;
  private answers = new Map<string, (sdp: string) => void>();
  private pcs = new Set<RtcPeerLike>();
  private busy = 0;

  constructor(readonly id: string, private token: string, private api: SignalApi, private rtc: () => RtcPeerLike, private idleMs: number, private busyMs: number, private gatherMs: number) {
    this.schedule(this.idleMs);
  }

  private schedule(ms: number) { if (!this.closed) this.timer = setTimeout(() => void this.tick(), ms); }

  private async tick() {
    if (this.closed) return;
    const r = await this.api.post({ op: "poll", id: this.id, token: this.token });
    if (this.closed) return;
    if (!r || r.status >= 500) {
      if (++this.fails >= 3 && !this.lost) { this.lost = true; this.status?.("lost"); }
    } else if (r.status === 403) {
      // our hold lapsed (the phone slept): take the id again
      await this.api.post({ op: "open", id: this.id, token: this.token });
    } else {
      if (this.lost) { this.lost = false; this.status?.("open"); }
      this.fails = 0;
      for (const m of ((r.body as { msgs?: unknown[] } | null)?.msgs ?? [])) this.onMail(m as { from?: string; t?: string; cid?: string; sdp?: string });
    }
    this.schedule(this.busy > 0 ? this.busyMs : this.idleMs);
  }

  private onMail(m: { from?: string; t?: string; cid?: string; sdp?: string }) {
    if (typeof m.cid !== "string" || typeof m.sdp !== "string" || typeof m.from !== "string") return;
    if (m.t === "answer") this.answers.get(m.cid)?.(m.sdp);
    else if (m.t === "offer") void this.answerOffer(m.from, m.cid, m.sdp);
  }

  private async answerOffer(from: string, cid: string, sdp: string) {
    this.busy++;
    const pc = this.rtc();
    this.pcs.add(pc);
    const done = () => { this.busy = Math.max(0, this.busy - 1); };
    const giveUp = setTimeout(() => { done(); this.pcs.delete(pc); try { pc.close(); } catch { /* ignore */ } }, 20_000);
    pc.addEventListener("datachannel", ((e: { channel: RtcChannelLike }) => {
      const ch = e.channel;
      const ready = () => { clearTimeout(giveUp); done(); this.incoming?.(new RtcLink(ch, from, false)); };
      if (ch.readyState === "open") ready(); else ch.onopen = ready;
    }) as never);
    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await gathered(pc, this.gatherMs);
      await this.api.post({ op: "send", from: this.id, token: this.token, to: from, msg: { t: "answer", cid, sdp: pc.localDescription?.sdp ?? answer.sdp } });
    } catch { clearTimeout(giveUp); done(); try { pc.close(); } catch { /* ignore */ } }
  }

  dial(remoteId: string, timeoutMs = 20_000): Promise<Link> {
    return new Promise<Link>((resolve, reject) => {
      if (this.closed) return reject(new TransportError("closed"));
      const cid = toB64(randomBytes(9)).replace(/[+/=]/g, "x");
      const pc = this.rtc();
      this.pcs.add(pc);
      this.busy++;
      let answered = false, settled = false;
      const finish = (fn: () => void, drop = false) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.answers.delete(cid); this.busy = Math.max(0, this.busy - 1);
        if (drop) { this.pcs.delete(pc); try { pc.close(); } catch { /* ignore */ } }
        fn();
      };
      const timer = setTimeout(() => finish(() => reject(new TransportError(answered ? "blocked" : "peer-unavailable")), true), timeoutMs);
      const ch = pc.createDataChannel("ludo", { ordered: true });
      ch.onopen = () => finish(() => resolve(new RtcLink(ch, remoteId, true)));
      this.answers.set(cid, sdp => { answered = true; pc.setRemoteDescription({ type: "answer", sdp }).catch(() => finish(() => reject(new TransportError("blocked")), true)); });
      void (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await gathered(pc, this.gatherMs);
          const r = await this.api.post({ op: "send", from: this.id, token: this.token, to: remoteId, msg: { t: "offer", cid, sdp: pc.localDescription?.sdp ?? offer.sdp } });
          if (!r) finish(() => reject(new TransportError("network")), true);
          else if (r.status === 404) finish(() => reject(new TransportError("peer-unavailable")), true);
          else if (r.status !== 200) finish(() => reject(new TransportError("network", `Pairing refused (${r.status})`)), true);
        } catch { finish(() => reject(new TransportError("network")), true); }
      })();
    });
  }

  onIncoming(cb: (l: Link) => void) { this.incoming = cb; }
  onStatus(cb: (s: EndpointStatus) => void) { this.status = cb; }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    for (const pc of this.pcs) { /* connections that are up stay up: only unfinished ones need closing */ void pc; }
    void this.api.post({ op: "close", id: this.id, token: this.token });
    this.status?.("closed");
  }
}
