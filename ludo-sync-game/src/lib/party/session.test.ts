import { describe, expect, it } from "vitest";
import { MemoryNetwork, type Link } from "../net/transport";
import { decide, settleVote } from "./decide";
import { PartyLeader, PartyMember, type Party } from "./session";

const until = async (cond: () => boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise(r => setTimeout(r, 5)); }
};

const party = async (n: number, opts: { settleMs?: number; voteMs?: number } = {}) => {
  const net = new MemoryNetwork();
  const leader = new PartyLeader({ id: "L", name: "Lee" }, "ABC123", { settleMs: 20, voteMs: 200, ...opts });
  const ep = await net.open("lsp-ABC123");
  ep.onIncoming(l => leader.addLink(l));
  const members: PartyMember[] = [];
  for (let i = 0; i < n; i++) {
    const me = await net.open(`m${i}`);
    const link: Link = await me.dial("lsp-ABC123");
    members.push(new PartyMember({ id: `M${i}`, name: `P${i}` }, link, "ABC123"));
  }
  await until(() => members.every(m => m.status === "ready") && leader.state!.members.length === n + 1);
  return { net, leader, members };
};
const target = (p: Party) => p.state?.target ?? null;

describe("decide", () => {
  it("picks the game with most players, ties go to a vote, nobody in a game is no choice", () => {
    expect(decide([{ id: "a", game: null }])).toEqual({ kind: "none" });
    expect(decide([{ id: "a", game: "ludo" }, { id: "b", game: "ludo" }, { id: "c", game: "skipbo" }])).toEqual({ kind: "game", game: "ludo" });
    expect(decide([{ id: "a", game: "ludo" }, { id: "b", game: "skipbo" }, { id: "c", game: null }])).toEqual({ kind: "tie", options: ["ludo", "skipbo"] });
  });
  it("settles a vote by most votes, then the leader", () => {
    expect(settleVote(["a", "b"], { x: "b", y: "b", L: "a" }, "L", null)).toBe("b");
    expect(settleVote(["a", "b"], { x: "b", L: "a" }, "L", null)).toBe("a");
    expect(settleVote(["a", "b"], {}, "L", "b")).toBe("b");
    expect(settleVote(["a", "b"], {}, "L", null)).toBe("a");
  });
});

describe("party", () => {
  it("members join without a game, and see each other", async () => {
    const { leader, members } = await party(2);
    await until(() => members[1].state!.members.length === 3);
    expect(members[0].state!.members.map(m => m.name).sort()).toEqual(["Lee", "P0", "P1"]);
    expect(leader.state!.target).toBeNull();
  });

  it("everyone in the same game: that game", async () => {
    const { leader, members } = await party(2);
    leader.setGame("ludo"); members.forEach(m => m.setGame("ludo"));
    await until(() => members.every(m => target(m) === "ludo"));
  });

  it("different games: the one with most players", async () => {
    const { leader, members } = await party(2);
    leader.setGame("skipbo"); members[0].setGame("ludo"); members[1].setGame("ludo");
    await until(() => target(leader) === "ludo" && members.every(m => target(m) === "ludo"));
  });

  it("a tie goes to a vote among the tied games", async () => {
    const { leader, members } = await party(1, { voteMs: 5000 });
    leader.setGame("ludo"); members[0].setGame("skipbo");
    await until(() => !!members[0].state?.vote);
    expect(members[0].state!.vote!.options).toEqual(["ludo", "skipbo"]);
    members[0].vote("skipbo"); leader.vote("skipbo");
    await until(() => target(members[0]) === "skipbo");
  });

  it("an unanswered vote still ends, with the leader breaking the tie", async () => {
    const { leader, members } = await party(1);
    leader.setGame("ludo"); members[0].setGame("skipbo");
    await until(() => target(members[0]) === "ludo");
  });

  it("a decided game stands while someone is in it, even if others wander off", async () => {
    const { leader, members } = await party(2);
    leader.setGame("ludo"); members.forEach(m => m.setGame("ludo"));
    await until(() => target(leader) === "ludo");
    members[0].setGame("skipbo"); members[1].setGame("skipbo");
    await new Promise(r => setTimeout(r, 80));
    expect(target(leader)).toBe("ludo");
  });

  it("the leader's room is announced, and members reach it through the party", async () => {
    const { leader, members } = await party(1);
    const room = await leader.network.open("g-ludo-XYZ789");
    const inc = new Promise<Link>(r => room.onIncoming(r));
    leader.setRoom({ game: "ludo", code: "XYZ789" });
    await until(() => members[0].state?.room?.code === "XYZ789");
    const link = await (await members[0].network.open("me")).dial("g-ludo-XYZ789");
    const host = await inc;
    const got = new Promise(r => host.onMessage(r));
    link.send("move");
    expect(await got).toBe("move");
  });

  it("a wrong code is refused, and leaving or ending is seen", async () => {
    const { net, leader, members } = await party(1);
    const me = await net.open("bad");
    const bad = new PartyMember({ id: "B", name: "Bad" }, await me.dial("lsp-ABC123"), "WRONG1");
    await until(() => bad.status === "closed");
    expect(bad.error).toMatch(/code/);
    leader.close();
    await until(() => members[0].status === "closed");
    expect(members[0].error).toMatch(/ended/);
  });
});
