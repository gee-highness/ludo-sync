import { afterEach, describe, expect, it } from "vitest";
import { autoAction } from "../ludo/bot";
import { currentPlayer } from "../ludo/engine";
import { newClientId, cleanRoomCode, isRoomCode, newRoomCode } from "./crypto";
import { GuestClient } from "./guest";
import { AWAY_GRACE_MS, HostSession, type Reaction } from "./host";
import { MemoryNetwork } from "./transport";

const until = async (cond: () => boolean, label = "condition", ms = 8000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`);
    await new Promise(r => setTimeout(r, 2));
  }
};

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(f => f()); });

const setup = async (opts: { guests?: number; retry?: number[]; now?: () => number } = {}) => {
  const net = new MemoryNetwork();
  const host = new HostSession({ network: net, name: "Hosty", code: "ABC234", now: opts.now });
  await host.open();
  cleanup.push(() => host.close());
  const guests: GuestClient[] = [];
  const ids: string[] = [];
  for (let i = 0; i < (opts.guests ?? 1); i++) {
    const id = newClientId();
    const g = new GuestClient({ network: net, code: "ABC234", name: `Guest${i + 1}`, clientId: id, retryDelays: opts.retry ?? [5, 5, 5, 5] });
    ids.push(id);
    guests.push(g);
    cleanup.push(() => g.leave());
    void g.start();
    // one at a time, so seats are handed out in a known order
    await until(() => g.getSnapshot().status === "connected", "guest connected");
  }
  return { net, host, guests, ids };
};

const hostState = (h: HostSession) => h.getSnapshot().room.state;

const playOut = async (host: HostSession, g: GuestClient) => {
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
};

describe("room codes", () => {
  it("cleans typed input", () => {
    expect(cleanRoomCode("abc-2o4")).toBe("ABC204");
    expect(isRoomCode(newRoomCode())).toBe(true);
  });
});

describe("lobby and handshake", () => {
  it("seats the guest and shows the same check digits on both sides", async () => {
    const { host, guests } = await setup();
    const snap = host.getSnapshot();
    const guestMember = snap.members.find(m => !m.host)!;
    expect(guestMember.seat).toBe(1);
    expect(guestMember.check).toMatch(/^\d{6}$/);
    expect(guests[0].getSnapshot().check).toBe(guestMember.check);
    expect(guests[0].getSnapshot().room?.you.seat).toBe(1);
  });

  it("host adds bots, changes rules and starts; the guest sees it", async () => {
    const { host, guests } = await setup();
    expect(host.setSlot(2, "bot", "hard")).toBe(true);
    host.setRules({ ...host.getSnapshot().room.rules, twoDice: true });
    await until(() => guests[0].getSnapshot().room?.slots[2].kind === "bot", "bot visible");
    expect(host.start()).toBe(true);
    await until(() => guests[0].getSnapshot().room?.phase === "playing" && !!guests[0].getSnapshot().state, "game visible");
    expect(guests[0].getSnapshot().state?.rules.twoDice).toBe(true);
    expect(guests[0].getSnapshot().state?.players.map(p => p.kind)).toEqual(["human", "human", "bot"]);
  });

  it("cannot start alone", async () => {
    const { host } = await setup({ guests: 0 });
    expect(host.canStart()).toBe(false);
    expect(host.start()).toBe(false);
  });
});

describe("play", () => {
  it("plays a full two-person game to a winner, host and guest taking their own turns", async () => {
    const { host, guests } = await setup();
    const g = guests[0];
    host.start();
    await until(() => !!g.getSnapshot().state, "guest has state");
    await playOut(host, g);
    expect(g.getSnapshot().state?.winner).toBe(hostState(host)!.winner);
  }, 60_000);

  it("plays a Tycoon game over the wire, including buy/pass decisions", async () => {
    const { host, guests } = await setup();
    const g = guests[0];
    host.setRules({ ...host.getSnapshot().room.rules, tycoon: true });
    host.start();
    await until(() => !!g.getSnapshot().state, "state");
    expect(g.getSnapshot().state?.rules.tycoon).toBe(true);
    await playOut(host, g);
    expect(g.getSnapshot().state?.winner).toBe(hostState(host)!.winner);
  }, 90_000);

  it("rematch starts a fresh game on both sides, and is refused mid-game", async () => {
    const { host, guests } = await setup();
    const g = guests[0];
    host.start();
    await until(() => !!g.getSnapshot().state, "state");
    expect(host.rematch()).toBe(false);
    await playOut(host, g);
    const firstId = g.getSnapshot().room!.gameId;
    expect(host.rematch()).toBe(true);
    await until(() => g.getSnapshot().room?.gameId !== firstId && g.getSnapshot().state?.phase === "roll", "fresh game on guest");
    expect(g.getSnapshot().state?.seq).toBe(0);
    expect(g.getSnapshot().room?.you.seat).toBe(1);
  }, 60_000);

  it("refuses out-of-turn, illegal and spectator actions", async () => {
    const { host, guests } = await setup({ guests: 2 });
    const [g1, g2] = guests;
    expect(g2.getSnapshot().room?.you.seat).toBe(2);
    host.start();
    await until(() => !!g1.getSnapshot().state && !!g2.getSnapshot().state, "state");
    // seat 0 (host) is up first
    const before = hostState(host)!.seq;
    g1.act({ type: "roll" });
    await until(() => g1.getSnapshot().rejected === "not-your-turn", "out of turn rejected");
    expect(hostState(host)!.seq).toBe(before);

    // host rolls, then a guest tries to move for the host
    host.act({ type: "roll" });
    await until(() => g1.getSnapshot().state?.seq === hostState(host)!.seq, "sync");
    g2.act({ type: "move", token: 0, die: 6 });
    await until(() => g2.getSnapshot().rejected === "not-your-turn", "g2 rejected");

    // a late joiner is a spectator and cannot act
    const net = (host as unknown as { opts: { network: MemoryNetwork } }).opts.network;
    const spec = new GuestClient({ network: net, code: "ABC234", name: "Watcher", clientId: newClientId(), retryDelays: [5] });
    cleanup.push(() => spec.leave());
    void spec.start();
    await until(() => spec.getSnapshot().status === "connected" && !!spec.getSnapshot().state, "spectator in");
    expect(spec.getSnapshot().room?.you.seat).toBeNull();
    spec.act({ type: "roll" });
    await until(() => spec.getSnapshot().rejected === "spectator", "spectator rejected");
  });

  it("sends reactions to everyone", async () => {
    const { host, guests } = await setup();
    const got: Reaction[] = [];
    host.onReaction(r => got.push(r));
    guests[0].react("🎉");
    await until(() => got.length === 1, "host got reaction", 1500);
    expect(got[0]).toMatchObject({ emoji: "🎉", seat: 1, name: "Guest1" });
    const back: Reaction[] = [];
    guests[0].onReaction(r => back.push(r));
    host.sendReaction("👍");
    await until(() => back.length === 1, "guest got reaction", 1500);
  });

  it("auto-plays for an idle guest and for one who is away", async () => {
    let clock = 1_000;
    const { host, guests, net } = await setup({ now: () => clock, retry: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20] });
    host.start();
    await until(() => !!guests[0].getSnapshot().state, "state");
    host.act({ type: "roll" });
    const s0 = hostState(host)!;
    // the host's roll may pass the turn straight to the guest; force the issue by playing until it is the guest's turn
    let s = s0;
    while (currentPlayer(s).seat === 0 && s.phase !== "over") { host.act(autoAction(s)!); s = hostState(host)!; }
    expect(currentPlayer(s).seat).toBe(1);
    expect(host.tick(clock + 1000)).toBe(false); // not out of time yet
    const seq = s.seq;
    expect(host.tick(clock + 60_000)).toBe(true); // idle guest: host plays for them
    expect(hostState(host)!.seq).toBeGreaterThanOrEqual(seq);

    // away: cut the link and the grace period is short
    await until(() => currentPlayer(hostState(host)!).seat === 1 || hostState(host)!.phase === "over", "guest turn again", 100).catch(() => undefined);
    net.cutLinks();
    await until(() => !host.getSnapshot().members.find(m => !m.host)!.connected, "marked away");
    clock += AWAY_GRACE_MS + 1;
    // whichever seat is up, only the guest's seat is auto-played
    const cur = currentPlayer(hostState(host)!);
    expect(host.tick(clock)).toBe(cur.seat === 1);
  }, 30_000);
});

describe("reconnect, kick, leave", () => {
  it("returns to the same seat after the connection drops mid-game", async () => {
    const { host, guests, net } = await setup();
    const g = guests[0];
    host.start();
    await until(() => !!g.getSnapshot().state, "state");
    net.cutLinks();
    await until(() => g.getSnapshot().status === "reconnecting", "reconnecting");
    await until(() => g.getSnapshot().status === "connected", "reconnected");
    expect(g.getSnapshot().room?.you.seat).toBe(1);
    expect(host.getSnapshot().members.filter(m => !m.host)).toHaveLength(1);
    // game still works: host acts, guest follows
    host.act({ type: "roll" });
    await until(() => g.getSnapshot().state?.seq === hostState(host)!.seq, "guest follows after reconnect");
  });

  it("catches up on moves missed while away", async () => {
    const { host, guests, net } = await setup({ retry: [200, 200, 200] });
    const g = guests[0];
    host.setSlot(2, "bot", "normal");
    host.start();
    await until(() => !!g.getSnapshot().state, "state");
    net.cutLinks();
    await until(() => g.getSnapshot().status === "reconnecting", "dropped");
    host.act({ type: "roll" });
    await until(() => g.getSnapshot().status === "connected", "back");
    await until(() => g.getSnapshot().state?.seq === hostState(host)!.seq, "caught up");
  });

  it("kicks a guest, frees the seat and refuses their return", async () => {
    const { host, guests, ids, net } = await setup();
    expect(host.kick(1)).toBe(true);
    await until(() => guests[0].getSnapshot().status === "kicked", "kicked");
    expect(host.getSnapshot().room.slots[1].kind).toBe("empty");
    const again = new GuestClient({ network: net, code: "ABC234", name: "Back", clientId: ids[0], retryDelays: [5] });
    cleanup.push(() => again.leave());
    void again.start();
    await until(() => again.getSnapshot().status === "error", "refused");
    expect(host.getSnapshot().members.some(m => m.id === ids[0])).toBe(false);
  });

  it("a guest who leaves a running game forfeits and the other player wins", async () => {
    const { host, guests } = await setup();
    host.start();
    await until(() => !!guests[0].getSnapshot().state, "state");
    guests[0].leave();
    await until(() => hostState(host)?.phase === "over", "game over");
    expect(hostState(host)!.winner).toBe(0);
  });

  it("tells guests when the host leaves", async () => {
    const { host, guests } = await setup();
    host.close();
    await until(() => guests[0].getSnapshot().status === "host-left", "host-left");
  });

  it("detects a host that vanished without saying goodbye", async () => {
    const { host, guests, net } = await setup({ retry: [5, 5, 5] });
    net.endpoints.get("ludosync-ABC234")!.close();
    net.cutLinks();
    await until(() => guests[0].getSnapshot().status === "host-left", "host-left");
    host.close();
  });

  it("reports an unknown room code", async () => {
    const net = new MemoryNetwork();
    const g = new GuestClient({ network: net, code: "ZZZZZZ", name: "X", clientId: newClientId() });
    await g.start();
    expect(g.getSnapshot().status).toBe("error");
    expect(g.getSnapshot().error).toMatch(/No room/);
  });

  it("rejects tampered traffic without crashing", async () => {
    const { host, guests, net } = await setup();
    let flip = false;
    net.intercept = (_f, _t, data) => {
      if (flip && data instanceof Uint8Array) { const c = new Uint8Array(data); c[c.length - 1] ^= 1; return c; }
      return data;
    };
    flip = true;
    guests[0].react("👍");
    await until(() => host.getSnapshot().members.find(m => !m.host)!.connected === false, "link dropped by host");
    flip = false;
  });
});

describe("piece designs", () => {
  it("shows each player's own pieces to everyone, cleaned of bad values", async () => {
    const { host, guests } = await setup();
    const g = guests[0];
    const crowns = Array.from({ length: 4 }, () => ({ shape: "crown", primary: "#112233", mark: "♛", size: 99 }));
    g.setPieces(crowns as never);
    const stars = Array.from({ length: 4 }, () => ({ shape: "star", pattern: "dots" }));
    host.setPieces(stars as never);

    await until(() => {
      const slot = host.getSnapshot().room.slots[1];
      return slot.kind === "human" && !!slot.pieces;
    }, "host sees the guest's pieces");
    const seen = host.getSnapshot().room.slots[1];
    expect(seen.kind === "human" && seen.pieces?.[0]).toMatchObject({ shape: "crown", primary: "#112233", mark: "♛", size: 1.5 });

    await until(() => {
      const s = g.getSnapshot().room?.slots[0];
      return s?.kind === "human" && !!s.pieces;
    }, "guest sees the host's pieces");
    const hostSlot = g.getSnapshot().room!.slots[0];
    expect(hostSlot.kind === "human" && hostSlot.pieces?.[3]).toMatchObject({ shape: "star", pattern: "dots" });
  });

  it("ignores a pieces message that is not exactly four designs", async () => {
    const { host, guests } = await setup();
    guests[0].setPieces([{ shape: "crown" }] as never);
    await new Promise(r => setTimeout(r, 60));
    const slot = host.getSnapshot().room.slots[1];
    expect(slot.kind === "human" && slot.pieces).toBeFalsy();
  });
});

describe("chat", () => {
  const chatOf = (g: GuestClient) => g.getSnapshot().chat;

  it("delivers a message to everyone, sender included, with the seat and name", async () => {
    const { host, guests } = await setup({ guests: 2 });
    expect(guests[0].sendChat("hello there")).toBe(true);
    await until(() => chatOf(guests[0]).length === 1 && chatOf(guests[1]).length === 1 && host.getSnapshot().chat.length === 1, "everyone has it");
    expect(chatOf(guests[1])[0]).toMatchObject({ text: "hello there", name: "Guest1", seat: 1 });
    expect(host.getSnapshot().chat[0].text).toBe("hello there");
    expect(host.sendChat("hi from the host")).toBe(true);
    await until(() => chatOf(guests[1]).length === 2, "host message arrives");
    expect(chatOf(guests[1])[1]).toMatchObject({ text: "hi from the host", seat: 0 });
  });

  it("sends the history to someone who joins late", async () => {
    const { net, host } = await setup({ guests: 1 });
    host.sendChat("one");
    host.sendChat("two");
    const late = new GuestClient({ network: net, code: "ABC234", name: "Late", clientId: newClientId(), retryDelays: [5, 5, 5] });
    cleanup.push(() => late.leave());
    void late.start();
    await until(() => chatOf(late).length === 2, "history arrives");
    expect(chatOf(late).map(c => c.text)).toEqual(["one", "two"]);
  });

  it("cleans messages: control characters, whitespace, empty and oversize", async () => {
    const { host, guests } = await setup();
    expect(guests[0].sendChat("   ")).toBe(false);
    expect(guests[0].sendChat("a\u0000b\u0007\n\n  c\t d")).toBe(true);
    await until(() => host.getSnapshot().chat.length === 1, "cleaned message");
    expect(host.getSnapshot().chat[0].text).toBe("a b c d");
    expect(host.sendChat("\u0001\u0002")).toBe(false);
    expect(host.sendChat("x".repeat(500))).toBe(true);
    expect(host.getSnapshot().chat[1].text).toHaveLength(200);
  });

  it("silently drops messages sent too fast", async () => {
    let t = 1_000_000;
    const { host, guests } = await setup({ now: () => t });
    for (let i = 0; i < 8; i++) guests[0].sendChat(`m${i}`);
    await until(() => host.getSnapshot().chat.length >= 5, "burst arrives");
    await new Promise(r => setTimeout(r, 80));
    expect(host.getSnapshot().chat).toHaveLength(5);
    t += 6000;
    guests[0].sendChat("later");
    await until(() => host.getSnapshot().chat.length === 6, "allowed again");
  });

  it("lets a spectator chat, and keeps only the last 50", async () => {
    let t = 2_000_000;
    const { host, guests } = await setup({ guests: 4, now: () => t });
    // seats 1-3 are taken by the first three guests, so the fourth only watches
    expect(host.getSnapshot().members.find(m => m.name === "Guest4")?.seat).toBeNull();
    guests[3].sendChat("watching from here");
    await until(() => host.getSnapshot().chat.length === 1, "spectator message");
    expect(host.getSnapshot().chat[0]).toMatchObject({ seat: null, name: "Guest4" });
    for (let i = 0; i < 60; i++) { t += 1100; host.sendChat(`n${i}`); }
    expect(host.getSnapshot().chat).toHaveLength(50);
    expect(host.getSnapshot().chat[49].text).toBe("n59");
  });

  it("does not let a removed guest chat", async () => {
    const { host, guests } = await setup();
    host.kick(1);
    await until(() => guests[0].getSnapshot().status === "kicked", "kicked");
    expect(guests[0].sendChat("let me back")).toBe(false);
    expect(host.getSnapshot().chat).toHaveLength(0);
  });
});
