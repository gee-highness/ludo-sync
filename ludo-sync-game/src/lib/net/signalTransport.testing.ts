import type { RtcChannelLike, RtcPeerLike } from "./signalTransport";

/** A pretend WebRTC for tests: two fake connections swap descriptions as usual and end up with a pair of linked data channels. */
export class FakeRtcHub {
  private pcs = new Map<string, FakePc>();
  private n = 0;
  create = (): RtcPeerLike => { const pc = new FakePc(this, `p${++this.n}`); this.pcs.set(pc.id, pc); return pc as unknown as RtcPeerLike; };
  find(id: string) { return this.pcs.get(id); }
  /** Made so a test can make connections fail. */
  blocked = false;
}

class FakeChannel implements RtcChannelLike {
  binaryType = "blob"; readyState = "connecting";
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onmessage: ((e: { data: unknown }) => void) | null = null; onerror: (() => void) | null = null;
  peer?: FakeChannel;
  send(data: string | Uint8Array) { const p = this.peer; if (this.readyState === "open" && p) queueMicrotask(() => p.onmessage?.({ data: typeof data === "string" ? data : data.slice().buffer })); }
  close() { if (this.readyState === "closed") return; this.readyState = "closed"; this.onclose?.(); const p = this.peer; if (p && p.readyState !== "closed") queueMicrotask(() => p.close()); }
  open() { this.readyState = "open"; this.onopen?.(); }
}

class FakePc {
  localDescription: { type: string; sdp: string } | null = null;
  iceGatheringState = "complete";
  private channel?: FakeChannel;
  private listeners: Record<string, ((e: never) => void)[]> = {};
  private remoteOffer?: string;
  constructor(private hub: FakeRtcHub, readonly id: string) {}
  createDataChannel(): RtcChannelLike { this.channel = new FakeChannel(); return this.channel; }
  async createOffer() { return { type: "offer", sdp: `fake-offer:${this.id}` }; }
  async createAnswer() { return { type: "answer", sdp: `fake-answer:${this.id}:${this.remoteOffer ?? ""}` }; }
  async setLocalDescription(d?: { type: string; sdp?: string }) { this.localDescription = { type: d?.type ?? "offer", sdp: d?.sdp ?? "" }; }
  async setRemoteDescription(d: { type: string; sdp?: string }) {
    if (d.type === "offer") { this.remoteOffer = d.sdp?.split(":")[1]; return; }
    // an answer: connect our channel to a new one on the answering side
    const answerer = this.hub.find((d.sdp ?? "").split(":")[1]);
    if (!answerer || this.hub.blocked || !this.channel) return;
    const theirs = new FakeChannel();
    this.channel.peer = theirs; theirs.peer = this.channel;
    queueMicrotask(() => { answerer.fire("datachannel", { channel: theirs }); theirs.open(); this.channel!.open(); });
  }
  addEventListener(type: string, cb: (e: never) => void) { (this.listeners[type] ??= []).push(cb); }
  fire(type: string, e: unknown) { for (const cb of this.listeners[type] ?? []) cb(e as never); }
  close() { this.channel?.close(); }
}
