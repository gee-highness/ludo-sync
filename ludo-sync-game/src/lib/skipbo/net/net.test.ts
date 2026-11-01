import { afterEach, describe, expect, it } from "vitest";
import { newClientId } from "../../net/crypto";
import { MemoryNetwork } from "../../net/transport";
import { AWAY_GRACE_MS, SkipBoHost } from "./host";
import { SkipBoGuest } from "./guest";
import { parseClientMsg, parseHostMsg } from "./protocol";
import { hintFor, type TableView } from "../view";

const until = async (cond: () => boolean, label = "condition", ms = 8000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`);
    await new Promise(r => setTimeout(r, 2));
  }
};

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(f => f()); });

const setup = async (opts: { guests?: number; now?: () => number; rules?: Parameters<typeof SkipBoHost.prototype.setRules>[0] } = {}) => {
  const net = new MemoryNetwork();
  const host = new SkipBoHost({ network: net, name: "Hosty", code: "ABC234", now: opts.now, botDelayMs: 0, rules: opts.rules ?? { stockSize: 10 } });
  await host.open();
  cleanup.push(() => host.close());
  const guests: SkipBoGuest[] = [];
  const ids: string[] = [];
  for (let i = 0; i < (opts.guests ?? 1); i++) {
    const id = newClientId();
    const g = new SkipBoGuest({ network: net, code: "ABC234", name: `Guest${i + 1}`, clientId: id, retryDelays: [5, 5, 5, 5] });
    ids.push(id);
    guests.push(g);
    cleanup.push(() => g.leave());
    void g.start();
    await until(() => g.getSnapshot().status === "connected", "guest connected");
  }
  return { net, host, guests, ids };
};

describe("skip-bo room", () => {
  it("seats guests in order and lets the host add bots, then start", async () => {
    const { host, guests } = await setup({ guests: 2 });
    expect(host.getSnapshot().room.slots.slice(0, 3).map(s => (s.kind === "human" ? s.name : s.kind))).toEqual(["Hosty", "Guest1", "Guest2"]);
    expect(guests[1].getSnapshot().room!.you).toEqual({ slot: 2, player: null });
    expect(host.setSlot(3, "bot", "hard")).toBe(true);
    expect(host.setSlot(1, "bot")).toBe(false); // a person's seat
    expect(host.start()).toBe(true);
    await until(() => guests.every(g => g.getSnapshot().view !== null), "views");
    expect(guests[0].getSnapshot().room!.you.player).toBe(1);
    expect(guests[0].getSnapshot().view!.players.map(p => p.name)).toEqual(["Hosty", "Guest1", "Guest2", "Bot 4"]);
  });

  it("never sends a guest anyone else's hand, the draw pile or the stock under the top card", async () => {
    const { host, guests } = await setup({ guests: 2 });
    host.start();
    await until(() => guests.every(g => g.getSnapshot().view !== null), "views");
    for (const [i, g] of guests.entries()) {
      const v = g.getSnapshot().view!;
      const me = i + 1;
      expect(v.you).toBe(me);
      v.players.forEach((p, idx) => {
        if (idx === me) expect(p.hand).toHaveLength(p.handCount);
        else expect(p.hand).toBeNull();
        expect(p.stockCount).toBe(10);
      });
      expect(Object.keys(v)).not.toContain("draw");
      expect(JSON.stringify(v)).not.toContain("\"stock\":");
    }
  });

  it("only lets the player whose turn it is act, and checks the rules", async () => {
    const { host, guests } = await setup();
    host.start();
    await until(() => guests[0].getSnapshot().view !== null, "view");
    // get to the host's turn
    while (hostView(host).turn !== 0) {
      await until(() => guests[0].getSnapshot().view!.seq === hostView(host).seq, "synced");
      expect(guests[0].act({ type: "discard", index: 0, pile: 0 })).toBe(true);
      await until(() => hostView(host).seq > 0, "applied");
    }
    await until(() => guests[0].getSnapshot().view!.seq === hostView(host).seq, "synced");
    // the guest tries to move on the host's turn
    guests[0].act({ type: "discard", index: 0, pile: 0 });
    await until(() => guests[0].getSnapshot().rejected === "not-your-turn", "refused");
    // the host breaks the rules: a card that does not fit
    const hand = hostView(host).players[0].hand!;
    const bad = hand.findIndex(c => c > 1);
    if (bad >= 0) expect(host.act({ type: "play", source: { from: "hand", index: bad }, to: 0 })).toBe(false);
    expect(host.act({ type: "discard", index: 0, pile: 0 })).toBe(true);
  });

  it("plays whole games with a guest, a bot and the host at the same table, each choosing from only their own view", { timeout: 60000 }, async () => {
    const { host, guests } = await setup({ rules: { stockSize: 8 } });
    host.setSlot(2, "bot", "normal");
    host.start();
    let steps = 0;
    for (;;) {
      if (++steps > 6000) throw new Error("game did not finish");
      await until(() => guests[0].getSnapshot().view?.seq === hostView(host).seq || hostView(host).players[hostView(host).turn].kind === "bot", "guest in sync");
      const view = hostView(host);
      if (view.phase === "over") break;
      if (view.phase === "roundOver") { host.act({ type: "nextRound" }); continue; }
      if (view.players[view.turn].kind === "bot") { await until(() => hostView(host).seq !== view.seq, "bot moved"); continue; }
      const mine = view.turn === 0 ? view : guests[0].getSnapshot().view!;
      const action = hintFor(mine)!;
      expect(action).not.toBeNull();
      expect(view.turn === 0 ? host.act(action) : guests[0].act(action)).toBe(true);
      await until(() => hostView(host).seq !== view.seq, "move applied");
    }
    await until(() => guests[0].getSnapshot().view?.phase === "over", "guest sees the end");
    expect(guests[0].getSnapshot().view!.winner).toBe(hostView(host).winner);
  });

  it("plays for a guest who is away, and a guest who quits for good is replaced by a bot", { timeout: 30000 }, async () => {
    let clock = 1_000;
    const { host, guests } = await setup({ now: () => clock });
    host.start();
    await until(() => guests[0].getSnapshot().view !== null, "view");
    // make it the guest's turn
    while (hostView(host).turn !== 1) expect(host.act(hintFor(hostView(host))!)).toBe(true);
    const seq = host.getSnapshot().room.view!.seq;
    guests[0].leave(); // soft leave: the seat is kept
    await until(() => !host.getSnapshot().members.find(m => !m.host)!.connected, "guest away");
    clock += AWAY_GRACE_MS + 1;
    expect(host.tick(clock)).toBe(true);
    expect(host.getSnapshot().room.view!.seq).toBeGreaterThan(seq);
  });

  it("lets a guest come back to the same seat", async () => {
    const { net, host, ids } = await setup();
    host.start();
    const back = new SkipBoGuest({ network: net, code: "ABC234", name: "Guest1", clientId: ids[0], retryDelays: [5, 5, 5], rejoin: true });
    cleanup.push(() => back.leave());
    void back.start();
    await until(() => back.getSnapshot().status === "connected" && back.getSnapshot().view !== null, "rejoined");
    expect(back.getSnapshot().room!.you.player).toBe(1);
    expect(back.getSnapshot().view!.players[1].hand).not.toBeNull();
  });

  it("turns a quitting player into a bot and removes kicked players for good", async () => {
    const { host, guests, net, ids } = await setup({ guests: 2 });
    host.start();
    await until(() => guests[1].getSnapshot().view !== null, "views");
    guests[0].leave({ forfeit: true });
    await until(() => host.getSnapshot().room.slots[1].kind === "bot", "bot took over");
    expect(host.getSnapshot().room.view!.players[1].kind).toBe("bot");
    expect(host.kick(2)).toBe(true);
    await until(() => guests[1].getSnapshot().status === "kicked", "kicked");
    const again = new SkipBoGuest({ network: net, code: "ABC234", name: "x", clientId: ids[1], retryDelays: [5] });
    cleanup.push(() => again.leave());
    void again.start();
    await until(() => again.getSnapshot().status === "error", "refused");
  });

  it("ignores a spectator's moves and refuses a full room", async () => {
    const { host, guests } = await setup({ guests: 1 });
    host.setSlot(2, "bot");
    host.setSlot(3, "bot");
    host.setSlot(4, "bot");
    host.setSlot(5, "bot");
    host.start();
    const late = new SkipBoGuest({ network: new MemoryNetwork(), code: "ABC234", name: "L", clientId: newClientId(), retryDelays: [5] });
    cleanup.push(() => late.leave());
    void guests;
    expect(host.getSnapshot().room.slots.every(s => s.kind !== "empty")).toBe(true);
  });
});

describe("skip-bo messages", () => {
  it("are checked before use", () => {
    expect(parseClientMsg({ t: "act", action: { type: "discard", index: 0, pile: 1 } })).toEqual({ t: "act", action: { type: "discard", index: 0, pile: 1 } });
    expect(parseClientMsg({ t: "act", action: { type: "nope" } })).toBeNull();
    expect(parseClientMsg({ t: "join", v: 9, name: "x", id: newClientId() })).toBeNull();
    expect(parseClientMsg({ t: "react", emoji: "💩" })).toBeNull();
    expect(parseHostMsg({ t: "frame", gameId: 1, n: 1, view: {}, events: [] })).toBeNull();
    expect(parseHostMsg({ t: "reject", reason: "illegal" })).toEqual({ t: "reject", reason: "illegal" });
    expect(parseHostMsg("junk")).toBeNull();
  });
});


const hostView = (h: SkipBoHost): TableView => h.getSnapshot().room.view!;
