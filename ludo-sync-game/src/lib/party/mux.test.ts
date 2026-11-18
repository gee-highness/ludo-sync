import { describe, expect, it } from "vitest";
import { MemoryNetwork, type Link } from "../net/transport";
import { Mux, PartyNetwork } from "./mux";

const pair = async () => {
  const net = new MemoryNetwork();
  const a = await net.open("leader"), b = await net.open("member");
  const inc = new Promise<Link>(r => a.onIncoming(r));
  const toLeader = await b.dial("leader");
  const fromMember = await inc;
  return { net, leader: new Mux(fromMember, false), member: new Mux(toLeader, true) };
};
const next = (l: Link) => new Promise<string | Uint8Array>(r => l.onMessage(r));

describe("Mux", () => {
  it("carries the control channel both ways", async () => {
    const { leader, member } = await pair();
    const got = next(leader.control);
    member.control.send("hello");
    expect(await got).toBe("hello");
    const back = next(member.control);
    leader.control.send("hi");
    expect(await back).toBe("hi");
  });

  it("opens game connections to an address on the leader, text and bytes", async () => {
    const { leader, member } = await pair();
    const ln = new PartyNetwork(), mn = new PartyNetwork();
    ln.add(leader); mn.add(member);
    const room = await ln.open("g-ludo-ABC123");
    const inc = new Promise<Link>(r => room.onIncoming(r));
    const me = await mn.open("me");
    const link = await me.dial("g-ludo-ABC123");
    const host = await inc;
    const got = next(host);
    link.send(new Uint8Array([1, 2, 3]));
    expect(Array.from(await got as Uint8Array)).toEqual([1, 2, 3]);
    const back = next(link);
    host.send("ok");
    expect(await back).toBe("ok");
  });

  it("refuses an address nobody opened", async () => {
    const { leader, member } = await pair();
    const ln = new PartyNetwork(), mn = new PartyNetwork();
    ln.add(leader); mn.add(member);
    const me = await mn.open("me");
    await expect(me.dial("g-x-NOPE00")).rejects.toMatchObject({ kind: "peer-unavailable" });
  });

  it("closes a game connection on both ends, and everything when the party connection drops", async () => {
    const { net, leader, member } = await pair();
    const ln = new PartyNetwork(), mn = new PartyNetwork();
    ln.add(leader); mn.add(member);
    const room = await ln.open("r");
    const inc = new Promise<Link>(r => room.onIncoming(r));
    const link = await (await mn.open("me")).dial("r");
    const host = await inc;
    const closed = new Promise<void>(r => host.onClose(r));
    link.close();
    await closed;
    expect(host.open).toBe(false);
    const link2 = await (await mn.open("me2")).dial("r");
    const gone = new Promise<void>(r => link2.onClose(r));
    const ctl = new Promise<void>(r => member.control.onClose(r));
    net.cutLinks();
    await gone; await ctl;
    expect(member.open).toBe(false);
  });
});
