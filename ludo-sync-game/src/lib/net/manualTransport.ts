import { DECODE_MESSAGE, decodeSignal, encodeSignal, noteLabel, sdpFromSignal, signalFromSdp, type Signal } from "./offerCodec";
import { TransportError, type Bytes, type Endpoint, type EndpointStatus, type Link, type Network } from "./transport";

/**
 * A network with no server. Two phones on the same hotspot, Wi-Fi or Bluetooth tether make a direct WebRTC connection,
 * and the people introduce them by passing a short note each way (see offerCodec). Everything above this file is the
 * same host and guest code the online game uses.
 */

// ---- the bits of WebRTC we use, so tests can stand in for a browser ----------------------------------------------

export interface DataChannelLike {
  readyState: string;
  binaryType: string;
  send(data: string | Uint8Array): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface PeerConnectionLike {
  localDescription: { type: string; sdp: string } | null;
  iceGatheringState: string;
  connectionState: string;
  onicegatheringstatechange: (() => void) | null;
  onconnectionstatechange: (() => void) | null;
  ondatachannel: ((e: { channel: DataChannelLike }) => void) | null;
  createDataChannel(label: string, init?: { ordered?: boolean }): DataChannelLike;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(d?: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(d: { type: string; sdp: string }): Promise<void>;
  close(): void;
}

export type PeerFactory = () => PeerConnectionLike;

/** No STUN or TURN: only the phones' own local addresses are ever used, and nothing leaves the building. */
export const browserPeerFactory: PeerFactory = () => new RTCPeerConnection({ iceServers: [] }) as unknown as PeerConnectionLike;

export const webRtcAvailable = () => typeof RTCPeerConnection !== "undefined";

/**
 * Browsers hide a phone's real local address behind a random `.local` name until the page has been allowed to use the
 * camera. Asking once (and letting go straight away) makes the connection much more likely to work on a hotspot.
 */
export const primeLocalAddresses = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch { return false; }
};

// ---- what the screens see ------------------------------------------------------------------------------------------

export type InviteState = "creating" | "waiting" | "connecting" | "connected" | "failed";
export interface InviteView {
  /** Eight hex digits, shared by an invite and its reply. */
  id: string;
  state: InviteState;
  /** The note to show, copy or send; empty until it is ready. */
  text: string;
  /** Four characters both people can read out to be sure they hold the same note. */
  label: string;
  error?: string;
}

export type GuestStage = "idle" | "reading" | "reply" | "connecting" | "connected" | "failed";
export interface GuestView {
  stage: GuestStage;
  /** The reply to show the host. */
  reply: string;
  label: string;
  error?: string;
  /** True when a connection that worked has dropped, so a fresh invite is needed. */
  lost: boolean;
}

export interface DeskSnapshot { invites: InviteView[]; guest: GuestView }

export type Outcome = { ok: true } | { ok: false; error: string };

export const MAX_INVITES = 3;
export interface DeskTiming { gatherMs: number; connectMs: number; replyWaitMs: number }
const DEFAULT_TIMING: DeskTiming = { gatherMs: 3500, connectMs: 25_000, replyWaitMs: 180_000 };
const NO_ADDRESS = "This phone did not find a local network address. Join a Wi-Fi network or turn on a hotspot (or Bluetooth tethering) on one of the phones, then try again.";
const NOT_REACHED = "The phones could not reach each other. Put both on the same hotspot or Wi-Fi, or turn on Bluetooth tethering on one and connect the other, then try again. Allowing the camera on both phones also helps.";

const randomId = (): string => {
  const b = new Uint8Array(4);
  (globalThis.crypto ?? ({} as Crypto)).getRandomValues?.(b);
  if (b.every(x => x === 0)) for (let i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
};

const gathered = (pc: PeerConnectionLike, ms: number): Promise<void> =>
  new Promise(resolve => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => { clearTimeout(timer); pc.onicegatheringstatechange = null; resolve(); };
    const timer = setTimeout(done, ms);
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") done(); };
  });

class DataLink implements Link {
  private msgCb?: (d: Bytes) => void;
  private closeCb?: () => void;
  private pending: Bytes[] = [];
  private closed = false;
  constructor(readonly remoteId: string, readonly initiator: boolean, private dc: DataChannelLike, private done: () => void) {
    dc.binaryType = "arraybuffer";
    dc.onmessage = e => {
      const d = e.data;
      const bytes: Bytes | null = typeof d === "string" ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : null;
      if (bytes === null) return;
      if (this.msgCb) this.msgCb(bytes); else this.pending.push(bytes);
    };
    dc.onclose = () => this.shut();
    dc.onerror = () => undefined;
  }
  get open() { return !this.closed && this.dc.readyState === "open"; }
  send(data: Bytes) { if (this.open) this.dc.send(data); }
  close() { try { this.dc.close(); } catch { /* already closed */ } this.shut(); }
  onMessage(cb: (d: Bytes) => void) { this.msgCb = cb; for (const m of this.pending.splice(0)) cb(m); }
  onClose(cb: () => void) { this.closeCb = cb; if (this.closed) cb(); }
  private shut() {
    if (this.closed) return;
    this.closed = true;
    this.done();
    this.closeCb?.();
  }
}

interface HostInvite {
  view: InviteView;
  pc: PeerConnectionLike;
  dc: DataChannelLike;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * The go-between for the screens and the connection. The host asks for invites and feeds in replies; the guest feeds
 * in the invite and shows the reply. Links that open are handed to the host and guest code through the endpoint.
 */
export class NearbyDesk {
  private invites = new Map<string, HostInvite>();
  private guestPc: PeerConnectionLike | null = null;
  private guestTimer: ReturnType<typeof setTimeout> | undefined;
  private guestView: GuestView = { stage: "idle", reply: "", label: "", lost: false };
  private incoming?: (link: Link) => void;
  private queued: Link[] = [];
  private waiters: { resolve: (l: Link) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  private readyLink: Link | null = null;
  private listeners = new Set<() => void>();
  private snap: DeskSnapshot = { invites: [], guest: this.guestView };
  private closed = false;

  private timing: DeskTiming;
  constructor(private factory: PeerFactory = browserPeerFactory, timing: Partial<DeskTiming> = {}) { this.timing = { ...DEFAULT_TIMING, ...timing }; }

  // ---- observing -------------------------------------------------------------------------------------------------

  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  getSnapshot = (): DeskSnapshot => this.snap;
  private publish() {
    this.snap = { invites: [...this.invites.values()].map(i => i.view), guest: this.guestView };
    this.listeners.forEach(l => l());
  }
  private setInvite(i: HostInvite, patch: Partial<InviteView>) { i.view = { ...i.view, ...patch }; this.publish(); }
  private setGuest(patch: Partial<GuestView>) { this.guestView = { ...this.guestView, ...patch }; this.publish(); }

  // ---- host ------------------------------------------------------------------------------------------------------

  /** Makes a new invite for one more player. */
  async createInvite(): Promise<Outcome> {
    if (this.closed) return { ok: false, error: "This game is closed." };
    const open = [...this.invites.values()].filter(i => i.view.state !== "failed" && i.view.state !== "connected").length;
    if (open >= MAX_INVITES) return { ok: false, error: "Finish or cancel the invites you already have first." };
    const id = randomId();
    let pc: PeerConnectionLike;
    try { pc = this.factory(); } catch { return { ok: false, error: "This browser cannot make direct connections." }; }
    const dc = pc.createDataChannel("ludo", { ordered: true });
    const invite: HostInvite = { view: { id, state: "creating", text: "", label: id.slice(0, 4).toUpperCase() }, pc, dc };
    this.invites.set(id, invite);
    this.publish();
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc, this.timing.gatherMs);
      const sig = pc.localDescription ? signalFromSdp(pc.localDescription.sdp, "offer", id) : null;
      if (!sig) throw new Error("no address");
      this.setInvite(invite, { state: "waiting", text: encodeSignal(sig) });
      invite.timer = setTimeout(() => this.failInvite(invite, "No reply came back. Make a new invite."), this.timing.replyWaitMs);
      return { ok: true };
    } catch {
      this.failInvite(invite, NO_ADDRESS);
      return { ok: false, error: NO_ADDRESS };
    }
  }

  /** The guest's reply, scanned or pasted. */
  async acceptReply(text: string): Promise<Outcome> {
    const r = decodeSignal(text, "answer");
    if (!r.ok) return { ok: false, error: DECODE_MESSAGE[r.reason] };
    const invite = this.invites.get(r.signal.id);
    if (!invite || invite.view.state !== "waiting") return { ok: false, error: "That reply is for a different invite. Check the four-character code matches." };
    clearTimeout(invite.timer);
    this.setInvite(invite, { state: "connecting" });
    const { pc, dc } = invite;
    invite.timer = setTimeout(() => this.failInvite(invite, NOT_REACHED), this.timing.connectMs);
    dc.onopen = () => {
      clearTimeout(invite.timer);
      const link = new DataLink(`guest-${invite.view.id}`, false, dc, () => { try { pc.close(); } catch { /* ignore */ } });
      this.setInvite(invite, { state: "connected" });
      if (this.incoming) this.incoming(link); else this.queued.push(link);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" && invite.view.state === "connecting") this.failInvite(invite, NOT_REACHED); };
    try {
      await pc.setRemoteDescription({ type: "answer", sdp: sdpFromSignal(r.signal) });
      return { ok: true };
    } catch {
      this.failInvite(invite, "This browser could not use that reply. Make a new invite.");
      return { ok: false, error: "This browser could not use that reply. Make a new invite." };
    }
  }

  cancelInvite(id: string) {
    const i = this.invites.get(id);
    if (!i) return;
    clearTimeout(i.timer);
    if (i.view.state !== "connected") { try { i.pc.close(); } catch { /* ignore */ } }
    this.invites.delete(id);
    this.publish();
  }

  private failInvite(i: HostInvite, error: string) {
    clearTimeout(i.timer);
    if (i.view.state === "connected") return;
    try { i.pc.close(); } catch { /* ignore */ }
    this.setInvite(i, { state: "failed", error });
  }

  // ---- guest -----------------------------------------------------------------------------------------------------

  /** The host's invite, scanned or pasted. Resolves with the reply to show the host. */
  async acceptInvite(text: string): Promise<Outcome> {
    if (this.closed) return { ok: false, error: "This game is closed." };
    const r = decodeSignal(text, "offer");
    if (!r.ok) return { ok: false, error: DECODE_MESSAGE[r.reason] };
    this.dropGuestPeer();
    this.setGuest({ stage: "reading", reply: "", label: noteLabel(r.signal), error: undefined, lost: false });
    let pc: PeerConnectionLike;
    try { pc = this.factory(); } catch { this.setGuest({ stage: "failed", error: "This browser cannot make direct connections." }); return { ok: false, error: "This browser cannot make direct connections." }; }
    this.guestPc = pc;
    pc.ondatachannel = ({ channel }) => {
      channel.onopen = () => {
        clearTimeout(this.guestTimer);
        const link = new DataLink(`host-${r.signal.id}`, true, channel, () => {
          try { pc.close(); } catch { /* ignore */ }
          if (this.guestPc === pc) { this.guestPc = null; this.readyLink = null; this.setGuest({ stage: "idle", reply: "", lost: true }); }
        });
        this.setGuest({ stage: "connected" });
        this.deliverToGuest(link);
      };
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" && this.guestView.stage !== "connected") this.guestFailed(NOT_REACHED); };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: sdpFromSignal(r.signal) });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc, this.timing.gatherMs);
      const sig = pc.localDescription ? signalFromSdp(pc.localDescription.sdp, "answer", r.signal.id) : null;
      if (!sig) throw new Error("no address");
      this.setGuest({ stage: "reply", reply: encodeSignal(sig) });
      this.guestTimer = setTimeout(() => this.guestFailed(NOT_REACHED), this.timing.replyWaitMs);
      return { ok: true };
    } catch {
      this.guestFailed(NO_ADDRESS);
      return { ok: false, error: NO_ADDRESS };
    }
  }

  /** The reply has been shown; from here the guest is waiting for the host to enter it. */
  replyShown() { if (this.guestView.stage === "reply") this.setGuest({ stage: "connecting" }); }

  resetGuest() {
    this.dropGuestPeer();
    this.setGuest({ stage: "idle", reply: "", label: "", error: undefined });
  }

  private dropGuestPeer() {
    clearTimeout(this.guestTimer);
    if (this.guestPc) { const pc = this.guestPc; this.guestPc = null; try { pc.close(); } catch { /* ignore */ } }
    this.readyLink = null;
  }

  private guestFailed(error: string) {
    clearTimeout(this.guestTimer);
    this.dropGuestPeer();
    this.setGuest({ stage: "failed", error });
  }

  private deliverToGuest(link: Link) {
    const w = this.waiters.shift();
    if (w) { clearTimeout(w.timer); w.resolve(link); } else this.readyLink = link;
  }

  // ---- used by the endpoint --------------------------------------------------------------------------------------

  /** The next link to open on the guest side. */
  nextLink(timeoutMs: number): Promise<Link> {
    if (this.readyLink?.open) { const l = this.readyLink; this.readyLink = null; return Promise.resolve(l); }
    return new Promise<Link>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w.timer !== timer);
        reject(new TransportError(this.guestView.stage === "failed" ? "blocked" : "timeout"));
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  setIncoming(cb: (link: Link) => void) {
    this.incoming = cb;
    for (const l of this.queued.splice(0)) cb(l);
  }

  close() {
    this.closed = true;
    for (const i of this.invites.values()) { clearTimeout(i.timer); try { i.pc.close(); } catch { /* ignore */ } }
    this.dropGuestPeer();
    for (const w of this.waiters.splice(0)) { clearTimeout(w.timer); w.reject(new TransportError("closed")); }
    this.invites.clear();
    this.publish();
  }
}

class ManualEndpoint implements Endpoint {
  private status?: (s: EndpointStatus) => void;
  private closed = false;
  constructor(private desk: NearbyDesk, readonly id: string) {}
  dial(_remoteId: string, timeoutMs = 15 * 60_000): Promise<Link> {
    if (this.closed) return Promise.reject(new TransportError("closed"));
    return this.desk.nextLink(timeoutMs);
  }
  onIncoming(cb: (link: Link) => void) { this.desk.setIncoming(cb); }
  onStatus(cb: (s: EndpointStatus) => void) { this.status = cb; setTimeout(() => { if (!this.closed) cb("open"); }, 0); }
  close() { if (this.closed) return; this.closed = true; this.status?.("closed"); }
}

export class ManualNetwork implements Network {
  readonly desk: NearbyDesk;
  constructor(factory?: PeerFactory, timing?: Partial<DeskTiming>) { this.desk = new NearbyDesk(factory, timing); }
  async open(id: string): Promise<Endpoint> {
    return new ManualEndpoint(this.desk, id);
  }
}

export type { Signal };
