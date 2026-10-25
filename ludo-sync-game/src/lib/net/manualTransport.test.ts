import { afterEach, describe, expect, it } from "vitest";
import { autoAction } from "../ludo/bot";
import { currentPlayer } from "../ludo/engine";
import { newClientId } from "./crypto";
import { GuestClient } from "./guest";
import { HostSession } from "./host";
import { ManualNetwork, type DataChannelLike, type PeerConnectionLike, type PeerFactory } from "./manualTransport";
import { sdpFromSignal } from "./offerCodec";

const until = async (cond: () => boolean, label = "condition", ms = 8000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`);
    await new Promise(r => setTimeout(r, 2));
  }
};
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(f => f()); });

// ---- a stand-in for the browser's WebRTC: two phones in one room, no network ------------------------------------

class FakeDc implements DataChannelLike {
  readyState = "connecting";
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  peer?: FakeDc;
  open() { this.readyState = "open"; this.onopen?.(); }
  send(data: string | Uint8Array) {
    const copy = typeof data === "string" ? data : data.slice().buffer;
    const p = this.peer;
    if (this.readyState === "open" && p) queueMicrotask(() => p.readyState === "open" && p.onmessage?.({ data: copy }));
  }
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    queueMicrotask(() => this.onclose?.());
    const p = this.peer;
    if (p && p.readyState !== "closed") p.close();
  }
}

class Room {
  phones = new Map<string, FakePc>();
  serial = 0;
  /** Phones that can never reach each other, as on two different networks. */
  isolated = false;
  /** Leave local addresses out, as if the phone had no network. */
  noAddress = false;
  factory: PeerFactory = () => new FakePc(this);
}

class FakePc implements PeerConnectionLike {
  localDescription: { type: string; sdp: string } | null = null;
  iceGatheringState = "new";
  connectionState = "new";
  onicegatheringstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((e: { channel: DataChannelLike }) => void) | null = null;
  dc: FakeDc | null = null;
  closed = false;
  private n: number;
  private ufrag: string;
  constructor(private room: Room) {
    this.n = ++room.serial;
    this.ufrag = `uf${this.n.toString().padStart(4, "0")}`;
    room.phones.set(this.ufrag, this);
  }
  createDataChannel() { this.dc = new FakeDc(); return this.dc; }
  private sdp(type: "offer" | "answer") {
    if (this.room.noAddress) return "v=0\r\na=ice-ufrag:x\r\n";
    const fp = Array.from({ length: 32 }, (_, i) => ((i * 7 + this.n) & 255).toString(16).padStart(2, "0")).join(":");
    return sdpFromSignal({ type, id: "00000000", ufrag: this.ufrag, pwd: `pw${"x".repeat(20)}${this.n}`, fingerprint: fp, candidates: [{ host: `192.168.43.${this.n}`, port: 40000 + this.n }] });
  }
  async createOffer() { return { type: "offer", sdp: this.sdp("offer") }; }
  async createAnswer() { return { type: "answer", sdp: this.sdp("answer") }; }
  async setLocalDescription(d?: { type: string; sdp?: string }) {
    this.localDescription = { type: d?.type ?? "offer", sdp: d?.sdp ?? "" };
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.();
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    if (d.type !== "answer" || this.room.isolated) return;
    const remote = /a=ice-ufrag:(\S+)/.exec(d.sdp)?.[1];
    const other = remote ? this.room.phones.get(remote) : undefined;
    if (!other || !this.dc) return;
    const mine = this.dc, theirs = new FakeDc();
    mine.peer = theirs; theirs.peer = mine;
    setTimeout(() => { if (this.closed || other.closed) return; other.ondatachannel?.({ channel: theirs }); mine.open(); theirs.open(); }, 1);
  }
  close() { this.closed = true; this.dc?.close(); }
}

const noteOf = (net: ManualNetwork) => net.desk.getSnapshot().invites.at(-1)!;

/** One full pairing, the way two people do it: invite across, reply back. */
const pair = async (hostNet: ManualNetwork, guestNet: ManualNetwork) => {
  expect((await hostNet.desk.createInvite()).ok).toBe(true);
  const invite = noteOf(hostNet);
  expect(invite.state).toBe("waiting");
  const got = await guestNet.desk.acceptInvite(invite.text);
  expect(got.ok).toBe(true);
  const reply = guestNet.desk.getSnapshot().guest.reply;
  expect(reply.startsWith("LS")).toBe(true);
  return hostNet.desk.acceptReply(reply);
};

const setup = async (opts: { room?: Room; retry?: number[] } = {}) => {
  const room = opts.room ?? new Room();
  const hostNet = new ManualNetwork(room.factory, { gatherMs: 50, connectMs: 400, replyWaitMs: 5000 });
  const host = new HostSession({ network: hostNet, name: "Hosty", code: "ABC234" });
  await host.open();
  cleanup.push(() => { host.close(); hostNet.desk.close(); });
  const addGuest = async (name: string, id = newClientId()) => {
    const net = new ManualNetwork(room.factory, { gatherMs: 50, connectMs: 400, replyWaitMs: 5000 });
    const g = new GuestClient({ network: net, code: "NEARBY", name, clientId: id, retryDelays: opts.retry ?? [5, 5, 5, 5, 5, 5] });
    cleanup.push(() => { g.leave(); net.desk.close(); });
    void g.start();
    expect((await pair(hostNet, net)).ok).toBe(true);
    await until(() => g.getSnapshot().status === "connected", `${name} connected`);
    return { g, net, id };
  };
  return { room, hostNet, host, addGuest };
};

const hostState = (h: HostSession) => h.getSnapshot().room.state;

describe("nearby pairing", () => {
  it("seats a guest after one invite and one reply, with matching check digits", async () => {
    const { host, addGuest } = await setup();
    const { g } = await addGuest("Guest1");
    const member = host.getSnapshot().members.find(m => !m.host)!;
    expect(member.seat).toBe(2);
    expect(g.getSnapshot().check).toBe(member.check);
    expect(g.getSnapshot().room?.you.seat).toBe(2);
  });

  it("seats a second guest from a second invite", async () => {
    const { host, addGuest, hostNet } = await setup();
    await addGuest("Guest1");
    await addGuest("Guest2");
    expect(host.getSnapshot().members.filter(m => !m.host).map(m => m.seat).sort()).toEqual([1, 2]);
    expect(hostNet.desk.getSnapshot().invites.every(i => i.state === "connected")).toBe(true);
  });

  it("plays a whole game across a nearby link", async () => {
    const { host, addGuest } = await setup();
    const { g } = await addGuest("Guest1");
    host.start();
    await until(() => !!g.getSnapshot().state, "guest has state");
    let steps = 0;
    while (hostState(host)!.phase !== "over") {
      if (++steps > 4000) throw new Error("game did not finish");
      const s = hostState(host)!;
      await until(() => g.getSnapshot().state?.seq === s.seq && g.getSnapshot().state?.phase === s.phase, "guest in sync");
      const action = autoAction(s)!;
      if (currentPlayer(s).seat === 0) expect(host.act(action)).toBe(true);
      else {
        expect(g.act(action)).toBe(true);
        await until(() => hostState(host)!.seq !== s.seq || hostState(host)!.phase !== s.phase || hostState(host)!.turn !== s.turn, "host applied guest move");
      }
    }
    await until(() => g.getSnapshot().state?.phase === "over", "guest sees the end");
    expect(g.getSnapshot().state?.winner).toBe(hostState(host)!.winner);
  }, 60_000);

  it("brings a guest back to their seat after the link drops, with a fresh invite", { timeout: 20000 }, async () => {
    const { host, addGuest, hostNet } = await setup();
    const { g, net } = await addGuest("Guest1");
    host.start();
    await until(() => !!g.getSnapshot().state, "state");
    // the link dies: the host's phone goes out of range
    const first = [...(hostNet.desk as unknown as { invites: Map<string, { pc: FakePc }> }).invites.values()][0];
    first.pc.close();
    await until(() => g.getSnapshot().status === "reconnecting", "guest notices");
    expect(net.desk.getSnapshot().guest.lost).toBe(true);
    expect((await pair(hostNet, net)).ok).toBe(true);
    await until(() => g.getSnapshot().status === "connected" && !!g.getSnapshot().state, "guest back");
    expect(g.getSnapshot().room?.you.seat).toBe(2);
    expect(host.getSnapshot().members.filter(m => !m.host)).toHaveLength(1);
  });
});

describe("nearby pairing, when things go wrong", () => {
  it("says so when the phone has no local address", async () => {
    const room = new Room();
    room.noAddress = true;
    const net = new ManualNetwork(room.factory, { gatherMs: 20 });
    const r = await net.desk.createInvite();
    expect(r.ok).toBe(false);
    expect(net.desk.getSnapshot().invites[0].state).toBe("failed");
    expect(net.desk.getSnapshot().invites[0].error).toMatch(/local network address/);
    net.desk.close();
  });

  it("fails an invite that is answered but never connects, and lets the host try again", async () => {
    const room = new Room();
    room.isolated = true;
    const hostNet = new ManualNetwork(room.factory, { gatherMs: 20, connectMs: 120, replyWaitMs: 5000 });
    const guestNet = new ManualNetwork(room.factory, { gatherMs: 20, connectMs: 120, replyWaitMs: 5000 });
    await pair(hostNet, guestNet);
    expect(noteOf(hostNet).state).toBe("connecting");
    await until(() => noteOf(hostNet).state === "failed", "invite fails");
    expect(noteOf(hostNet).error).toMatch(/could not reach each other/);
    room.isolated = false;
    expect((await hostNet.desk.createInvite()).ok).toBe(true);
    expect(noteOf(hostNet).state).toBe("waiting");
    hostNet.desk.close(); guestNet.desk.close();
  });

  it("refuses junk, replies to nothing, the wrong kind of note, and a reply used twice", async () => {
    const room = new Room();
    const hostNet = new ManualNetwork(room.factory, { gatherMs: 20, connectMs: 300 });
    const guestNet = new ManualNetwork(room.factory, { gatherMs: 20, connectMs: 300 });
    expect((await hostNet.desk.acceptReply("hello")).ok).toBe(false);
    expect((await guestNet.desk.acceptInvite("hello")).ok).toBe(false);
    await hostNet.desk.createInvite();
    const invite = noteOf(hostNet);
    // an invite fed in where a reply belongs
    const wrongKind = await hostNet.desk.acceptReply(invite.text);
    expect(wrongKind.ok).toBe(false);
    // a reply to an invite this host never made
    const other = new ManualNetwork(room.factory, { gatherMs: 20 });
    await other.desk.createInvite();
    await guestNet.desk.acceptInvite(noteOf(other).text);
    const stray = await hostNet.desk.acceptReply(guestNet.desk.getSnapshot().guest.reply);
    expect(stray.ok).toBe(false);
    if (!stray.ok) expect(stray.error).toMatch(/different invite/);
    // the real thing, then the same reply again
    await guestNet.desk.acceptInvite(invite.text);
    const reply = guestNet.desk.getSnapshot().guest.reply;
    expect((await hostNet.desk.acceptReply(reply)).ok).toBe(true);
    expect((await hostNet.desk.acceptReply(reply)).ok).toBe(false);
    hostNet.desk.close(); guestNet.desk.close(); other.desk.close();
  });

  it("limits open invites and frees a slot when one is cancelled", async () => {
    const room = new Room();
    const net = new ManualNetwork(room.factory, { gatherMs: 10 });
    for (let i = 0; i < 3; i++) expect((await net.desk.createInvite()).ok).toBe(true);
    expect((await net.desk.createInvite()).ok).toBe(false);
    net.desk.cancelInvite(noteOf(net).id);
    expect((await net.desk.createInvite()).ok).toBe(true);
    net.desk.close();
  });

  it("closing the desk releases everyone waiting", async () => {
    const net = new ManualNetwork(new Room().factory);
    const ep = await net.open("x");
    const dial = ep.dial("y", 5000);
    net.desk.close();
    await expect(dial).rejects.toMatchObject({ kind: "closed" });
  });
});
