import { afterEach, describe, expect, it } from "vitest";
import { fourInRow } from "../games/fourinrow/driver";
import { GameGuest } from "../platform/net/guest";
import { GameHost } from "../platform/net/host";
import { newClientId } from "../net/crypto";
import { SignalNetwork, type SignalApi } from "../net/signalTransport";
import { FakeRtcHub } from "../net/signalTransport.testing";
import { TransportError, type Endpoint, type Link } from "../net/transport";
import { handleSignal } from "./handler";
import { SIGNAL, close, memorySignalStore, open, poll, present, send } from "./server";

const T1 = "t".repeat(24), T2 = "u".repeat(24);

describe("pairing server", () => {
  it("a phone takes an id; its own token renews it, another token cannot take it while held, and it lapses", async () => {
    let now = 1_000_000;
    const s = memorySignalStore(() => now);
    expect(await open(s, "host-ABC", T1)).toBe("ok");
    expect(await open(s, "host-ABC", T1)).toBe("ok");
    expect(await open(s, "host-ABC", T2)).toBe("taken");
    now += (SIGNAL.holdSec + 1) * 1000;
    expect(await present(s, "host-ABC")).toBe(false);
    expect(await open(s, "host-ABC", T2)).toBe("ok"); // free again
    expect(await open(s, "no", T1)).toBe("bad");
    expect(await open(s, "host-ABC", "short")).toBe("bad");
  });
  it("delivers a message once, in order, only to the owner, and nobody can send as someone else", async () => {
    const s = memorySignalStore();
    await open(s, "alice", T1); await open(s, "bob", T2);
    expect(await send(s, "alice", T1, "bob", { t: "offer", n: 1 })).toBe("ok");
    expect(await send(s, "alice", T1, "bob", { t: "offer", n: 2 })).toBe("ok");
    expect(await send(s, "alice", T2, "bob", { t: "offer", n: 3 })).toBe("denied"); // wrong token for alice
    expect(await poll(s, "bob", T1)).toEqual({ ok: false });
    const got = await poll(s, "bob", T2);
    expect(got.ok && got.msgs).toEqual([{ from: "alice", t: "offer", n: 1 }, { from: "alice", t: "offer", n: 2 }]);
    const again = await poll(s, "bob", T2);
    expect(again.ok && again.msgs).toEqual([]);
  });
  it("says 'gone' for an id nobody holds, refuses oversized or non-object messages, and rate limits", async () => {
    const s = memorySignalStore();
    await open(s, "alice", T1);
    expect(await send(s, "alice", T1, "ghost", { t: "offer" })).toBe("gone");
    await open(s, "bob", T2);
    expect(await send(s, "alice", T1, "bob", { x: "y".repeat(SIGNAL.maxMsgBytes) })).toBe("bad");
    expect(await send(s, "alice", T1, "bob", "text")).toBe("bad");
    let limited = false;
    for (let i = 0; i < SIGNAL.rate.max + 5; i++) if ((await send(s, "alice", T1, "bob", { t: "x" })) === "limited") limited = true;
    expect(limited).toBe(true);
  });
  it("closing frees the id and drops its mail", async () => {
    const s = memorySignalStore();
    await open(s, "alice", T1); await open(s, "bob", T2);
    await send(s, "alice", T1, "bob", { t: "offer" });
    expect(await close(s, "bob", T1)).toBe(false);
    expect(await close(s, "bob", T2)).toBe(true);
    expect(await present(s, "bob")).toBe(false);
  });
  it("the endpoint is off (503) without a store and rejects junk", async () => {
    const post = (b: unknown, store = memorySignalStore()) => handleSignal(new Request("http://x/api/signal", { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b) }), store);
    expect((await handleSignal(new Request("http://x", { method: "POST", body: "{}" }), null)).status).toBe(503);
    expect((await post("{nope")).status).toBe(400);
    expect((await post("x".repeat(21_000))).status).toBe(413);
    expect((await post({ op: "wat" })).status).toBe(400);
    const store = memorySignalStore();
    expect((await post({ op: "open", id: "alice", token: T1 }, store)).status).toBe(200);
    expect((await post({ op: "open", id: "alice", token: T2 }, store)).status).toBe(409);
    expect((await post({ op: "send", from: "alice", token: T1, to: "nobody", msg: { t: "x" } }, store)).status).toBe(404);
    expect((await post({ op: "poll", id: "alice", token: T2 }, store)).status).toBe(403);
  });
});

const apiFor = (store = memorySignalStore()): SignalApi & { store: ReturnType<typeof memorySignalStore> } => ({
  store,
  post: async body => { const r = await handleSignal(new Request("http://x/api/signal", { method: "POST", body: JSON.stringify(body) }), store); return { status: r.status, body: await r.json() }; },
});
const until = async (cond: () => boolean, label = "condition", ms = 6000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`); await new Promise(r => setTimeout(r, 3)); } };

const net = (api: SignalApi, hub: FakeRtcHub) => new SignalNetwork({ api, rtc: hub.create, idleMs: 8, busyMs: 4, gatherMs: 50 });

const live: (Endpoint | { close(): void })[] = [];
afterEach(() => { live.splice(0).forEach(e => e.close()); });

describe("pairing over the endpoint", () => {
  it("connects two phones directly and passes messages both ways", async () => {
    const api = apiFor(), hub = new FakeRtcHub(), n = net(api, hub);
    const host = await n.open("room-host"); live.push(host);
    const guest = await n.open("room-guest"); live.push(guest);
    let hostSide: Link | null = null;
    host.onIncoming(l => { hostSide = l; });
    const link = await guest.dial("room-host", 3000);
    await until(() => hostSide !== null, "host gets the link");
    expect(link.initiator).toBe(true);
    expect(hostSide!.remoteId).toBe("room-guest");
    const heard: unknown[] = [];
    hostSide!.onMessage(d => heard.push(d));
    link.send("hello");
    link.send(new Uint8Array([1, 2, 3]));
    await until(() => heard.length === 2, "messages");
    expect(heard[0]).toBe("hello");
    expect([...(heard[1] as Uint8Array)]).toEqual([1, 2, 3]);
    const back: unknown[] = [];
    link.onMessage(d => back.push(d));
    hostSide!.send("hi back");
    await until(() => back.length === 1);
    link.close();
    await until(() => !hostSide!.open, "the other end sees it close");
  });
  it("says peer-unavailable for an id nobody holds, unavailable-id for a taken one, and blocked when no direct route exists", async () => {
    const api = apiFor(), hub = new FakeRtcHub(), n = net(api, hub);
    const a = await n.open("a-phone"); live.push(a);
    await expect(a.dial("nobody-here", 1500)).rejects.toMatchObject({ kind: "peer-unavailable" });
    // the same id from another phone is refused while the first holds it
    const taken = await n.open("a-phone").catch(e => e);
    expect(taken).toBeInstanceOf(TransportError);
    expect((taken as TransportError).kind).toBe("unavailable-id");
    const b = await n.open("b-phone"); live.push(b);
    b.onIncoming(() => undefined);
    hub.blocked = true;
    await expect(a.dial("b-phone", 600)).rejects.toMatchObject({ kind: "blocked" });
  });
  it("is unsupported while the server has no store, and a network error with no connection", async () => {
    const off: SignalApi = { post: async body => { const r = await handleSignal(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), null); return { status: r.status, body: null }; } };
    await expect(new SignalNetwork({ api: off }).open("x-phone")).rejects.toMatchObject({ kind: "unsupported" });
    await expect(new SignalNetwork({ api: { post: async () => null } }).open("x-phone")).rejects.toMatchObject({ kind: "network" });
  });
  it("closing an endpoint frees its id", async () => {
    const api = apiFor(), hub = new FakeRtcHub(), n = net(api, hub);
    const a = await n.open("room-x");
    a.close();
    await until(() => !api.store.held.has("room-x"), "id freed");
    const again = await n.open("room-x"); live.push(again);
    expect(again.id).toBe("room-x");
  });
  it("runs a whole online game: host and guest pair through the endpoint, play and see each other's moves", async () => {
    const api = apiFor(), hub = new FakeRtcHub(), network = net(api, hub);
    const host = new GameHost(fourInRow, { network, name: "Hosty", code: "SIG234", botDelayMs: 0, rules: { first: "seat" } });
    await host.open();
    live.push(host);
    const guest = new GameGuest({ network, gameId: "fourinrow", maxSlots: fourInRow.maxPlayers, code: "SIG234", name: "Guesty", clientId: newClientId(), retryDelays: [20, 20, 20, 20] });
    live.push({ close: () => guest.leave() });
    void guest.start();
    await until(() => guest.getSnapshot().status === "connected", "guest connected over the endpoint");
    expect(host.getSnapshot().room.slots[1]).toMatchObject({ kind: "human", name: "Guesty" });
    host.start();
    await until(() => guest.getSnapshot().frame !== null, "frame");
    expect(host.act({ type: "drop", col: 3 })).toBe(true);
    await until(() => (guest.getSnapshot().frame!.view as { plies: number }).plies === 1, "guest sees the host's move");
    guest.act({ type: "drop", col: 4 });
    await until(() => (host.getSnapshot().room.frame!.view as { plies: number }).plies === 2, "host sees the guest's move");
  });
});
