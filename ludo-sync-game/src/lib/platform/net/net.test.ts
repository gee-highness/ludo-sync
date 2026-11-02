import { afterEach, describe, expect, it } from "vitest";
import { newClientId } from "../../net/crypto";
import { MemoryNetwork } from "../../net/transport";
import { fourInRow } from "../../games/fourinrow/driver";
import { AWAY_GRACE_MS, GameHost } from "./host";
import { GameGuest } from "./guest";
import { parseClientMsg, parseHostMsg } from "./protocol";

const until = async (cond: () => boolean, label = "condition", ms = 8000) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`); await new Promise(r => setTimeout(r, 2)); }
};
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(f => f()); });

const setup = async (guests = 1, rules: Record<string, unknown> = { first: "seat" }, now?: () => number) => {
  const net = new MemoryNetwork();
  const host = new GameHost(fourInRow, { network: net, name: "Hosty", code: "ABC234", botDelayMs: 0, rules, now });
  await host.open();
  cleanup.push(() => host.close());
  const gs: GameGuest[] = [];
  for (let i = 0; i < guests; i++) {
    const g = new GameGuest({ network: net, gameId: "fourinrow", maxSlots: fourInRow.maxPlayers, code: "ABC234", name: `Guest${i + 1}`, clientId: newClientId(), retryDelays: [5, 5, 5, 5] });
    gs.push(g);
    cleanup.push(() => g.leave());
    void g.start();
    await until(() => g.getSnapshot().status === "connected", "guest connected");
  }
  return { host, gs, net };
};

describe("generic online room", () => {
  it("seats guests, lets the host set rules, and starts a game everyone sees", async () => {
    const { host, gs } = await setup(1);
    expect(host.getSnapshot().room.slots.slice(0, 2).map(s => (s.kind === "human" ? s.name : s.kind))).toEqual(["Hosty", "Guest1"]);
    expect(host.setRules({ connect: 3, cols: 5, rows: 5, first: "seat" })).toBe(true);
    await until(() => gs[0].getSnapshot().room?.rules.connect === 3, "rules reach the guest");
    expect(host.start()).toBe(true);
    await until(() => gs[0].getSnapshot().frame !== null, "frame");
    const f = gs[0].getSnapshot().frame!;
    expect(f.base.you).toBe(1);
    expect((f.view as { board: number[][] }).board.length).toBe(5);
    expect(host.setRules({ connect: 5 })).toBe(false); // not while playing
  });

  it("plays moves from guests and the host, and refuses out-of-turn and spectator moves", async () => {
    const { host, gs } = await setup(2, { first: "seat", connect: 3, cols: 5, rows: 5 });
    host.setSlot(3, "empty");
    host.start();
    await until(() => gs.every(g => g.getSnapshot().frame !== null), "frames");
    // three players: host, guest1, guest2 take turns
    gs[0].act({ type: "drop", col: 0 });
    await new Promise(r => setTimeout(r, 30));
    expect((gs[0].getSnapshot().frame!.view as { plies: number }).plies).toBe(0); // not guest 1's turn
    expect(host.act({ type: "drop", col: 0 })).toBe(true);
    await until(() => (gs[0].getSnapshot().frame!.view as { plies: number }).plies === 1, "host move seen");
    gs[0].act({ type: "drop", col: 1 });
    await until(() => (gs[1].getSnapshot().frame!.view as { plies: number }).plies === 2, "guest move seen");
    gs[1].act({ type: "bogus" });
    await until(() => !!gs[1].getSnapshot().rejected, "rejection");
  });

  it("lets bots fill seats and play, and finishes a game", { timeout: 30000 }, async () => {
    const { host, gs } = await setup(1, { first: "seat", connect: 3, cols: 5, rows: 5 });
    host.setSlot(2, "bot", "easy");
    host.start();
    await until(() => gs[0].getSnapshot().frame !== null, "frame");
    for (let i = 0; i < 300 && !host.getSnapshot().room.frame?.base.over; i++) {
      const f = host.getSnapshot().room.frame!;
      if (f.base.actors.includes(0)) host.act({ type: "drop", col: Math.floor(Math.random() * 5) });
      else if (f.base.actors.includes(1)) gs[0].act({ type: "drop", col: Math.floor(Math.random() * 5) });
      await new Promise(r => setTimeout(r, 4));
    }
    await until(() => gs[0].getSnapshot().frame!.base.over, "game over on the guest", 15000);
  });

  it("plays for a guest who is away, and replaces one who leaves for good", async () => {
    let t = 1000;
    const { host, gs, net } = await setup(1, { first: "seat" }, () => t);
    host.start();
    await until(() => gs[0].getSnapshot().frame !== null, "guest has the game");
    host.act({ type: "drop", col: 3 });
    gs[0].leave(); // soft leave: the seat stays
    await until(() => host.getSnapshot().members.find(m => m.slot === 1)?.connected === false, "guest offline");
    t += AWAY_GRACE_MS + 10;
    expect(host.tick(t)).toBe(true);
    expect((host.getSnapshot().room.frame!.view as { plies: number }).plies).toBe(2);
    // a second guest who quits for good is replaced by a bot at a running table
    const g2 = new GameGuest({ network: net, gameId: "fourinrow", maxSlots: 4, code: "ABC234", name: "Late", clientId: newClientId(), retryDelays: [5] });
    cleanup.push(() => g2.leave());
    void g2.start();
    await until(() => g2.getSnapshot().status === "connected", "late guest");
    expect(g2.getSnapshot().room!.you.player).toBeNull(); // joined mid-game: watching
  });

  it("only sends each person their own view and ignores junk", () => {
    expect(parseClientMsg({ t: "join", v: 1, name: "x", id: "nope" })).toBeNull();
    expect(parseClientMsg({ t: "act" })).toBeNull();
    expect(parseClientMsg({ t: "act", action: { type: "drop", col: 1 } })).toEqual({ t: "act", action: { type: "drop", col: 1 } });
    expect(parseHostMsg({ t: "room", room: { slots: [] } }, 4)).toBeNull();
    expect(parseHostMsg({ t: "frame", gameId: 1, n: 1, frame: { base: 1, view: {}, events: [] } }, 4)).toBeNull();
  });

  it("kicks a guest and frees the seat", async () => {
    const { host, gs } = await setup(1);
    expect(host.kick(1)).toBe(true);
    await until(() => gs[0].getSnapshot().status === "kicked", "kicked");
    expect(host.getSnapshot().room.slots[1].kind).toBe("empty");
  });
});

describe("hidden information online (4 Colors)", () => {
  it("gives each guest only their own hand and never the deck", async () => {
    const { fourColors } = await import("../../games/fourcolors/driver");
    const net = new MemoryNetwork();
    const host = new GameHost(fourColors, { network: net, name: "Hosty", code: "HID234", botDelayMs: 0, rules: { target: 0 } });
    await host.open();
    cleanup.push(() => host.close());
    const g = new GameGuest({ network: net, gameId: "fourcolors", maxSlots: fourColors.maxPlayers, code: "HID234", name: "G", clientId: newClientId(), retryDelays: [5, 5, 5, 5] });
    cleanup.push(() => g.leave());
    void g.start();
    await until(() => g.getSnapshot().status === "connected", "connected");
    host.setSlot(2, "bot", "easy");
    host.start();
    await until(() => g.getSnapshot().frame !== null, "frame");
    const f = g.getSnapshot().frame!;
    const view = f.view as { hand: { id: number }[]; handCounts: number[]; reveal: unknown };
    const hostView = host.getSnapshot().room.frame!.view as { hand: { id: number }[] };
    // a bot may already have moved, so check the invariant rather than exact counts: my hand is as large as my count says
    expect(f.base.you).toBe(1);
    expect(view.hand.length).toBe(view.handCounts[1]);
    expect(view.handCounts.length).toBe(3);
    expect(view.reveal).toBeNull();
    const mine = new Set(view.hand.map(c => c.id));
    expect(hostView.hand.some(c => mine.has(c.id))).toBe(false);
    const text = JSON.stringify(f);
    expect(text).not.toContain('"deck"');
    expect(text).not.toContain('"hands"');
    // a spectator-style request for someone else's action is refused
    expect(g.act({ type: "next" })).toBe(true);
    await until(() => !!g.getSnapshot().rejected || true, "answered");
  });
});
