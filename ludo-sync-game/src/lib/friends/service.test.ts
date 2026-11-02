import { afterEach, describe, expect, it } from "vitest";
import { MemoryNetwork } from "../net/transport";
import { FriendsService } from "./service";
import { cleanFriendCode, cleanFriends, extractFriendCode, formatFriendCode, isFriendCode, memoryStore, newFriendCode, type FriendsStore } from "./store";
import { macOf, parseFMsg, verifyMac, textFor } from "./protocol";

const until = async (cond: () => boolean, label = "condition", ms = 6000) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`); await new Promise(r => setTimeout(r, 3)); }
};
const live: FriendsService[] = [];
afterEach(() => { live.splice(0).forEach(s => s.stop()); });

const device = async (net: MemoryNetwork, name: string, opts: { store?: FriendsStore; now?: () => number; listen?: boolean } = {}) => {
  const store = opts.store ?? memoryStore();
  if (opts.listen === false) store.set("friends-on", false);
  const s = new FriendsService({ network: net, store, name: () => name, now: opts.now, dialMs: 3000, replyMs: 4000 });
  live.push(s);
  await s.start();
  return s;
};

describe("friend codes", () => {
  it("are eight easy characters, cleaned and shown in two halves", () => {
    for (let i = 0; i < 50; i++) expect(isFriendCode(newFriendCode())).toBe(true);
    expect(cleanFriendCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(isFriendCode("ABCDEFG0")).toBe(false); // zero is not used
    expect(formatFriendCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(extractFriendCode("https://x.test/friends?add=abcdefgh&q=1")).toBe("ABCDEFGH");
    expect(extractFriendCode("ABCD EFGH")).toBe("ABCDEFGH");
    expect(extractFriendCode("nope")).toBeNull();
  });
  it("keeps a device's own code across restarts and cleans stored friends", () => {
    const store = memoryStore();
    const a = new FriendsService({ network: new MemoryNetwork(), store, name: () => "A" });
    const b = new FriendsService({ network: new MemoryNetwork(), store, name: () => "A" });
    expect(a.code).toBe(b.code);
    expect(cleanFriends([{ code: "ABCDEFGH", name: "x\ny", secret: "s".repeat(20) }, { code: "bad", secret: "s".repeat(20) }, { code: "ABCDEFGH", secret: "t".repeat(20) }, null]).map(f => [f.code, f.name])).toEqual([["ABCDEFGH", "x y"]]);
  });
});

describe("signed messages", () => {
  it("only verify with the right secret and the right text", async () => {
    const mac = await macOf("c2VjcmV0c2VjcmV0c2VjcmV0", textFor.invite("ABCDEFGH", "casino", "ABC234", 5));
    expect(await verifyMac("c2VjcmV0c2VjcmV0c2VjcmV0", textFor.invite("ABCDEFGH", "casino", "ABC234", 5), mac)).toBe(true);
    expect(await verifyMac("b3RoZXJvdGhlcm90aGVyb3RoZXI", textFor.invite("ABCDEFGH", "casino", "ABC234", 5), mac)).toBe(false);
    expect(await verifyMac("c2VjcmV0c2VjcmV0c2VjcmV0", textFor.invite("ABCDEFGH", "casino", "ABC235", 5), mac)).toBe(false);
    expect(await verifyMac("c2VjcmV0c2VjcmV0c2VjcmV0", textFor.ping("ABCDEFGH", 5), mac)).toBe(false);
  });
  it("parses only well-formed messages", () => {
    expect(parseFMsg({ v: 1, t: "invite", code: "ABCDEFGH", name: "Mia", game: "casino", room: "ABC234", ts: 1, mac: "x" })?.t).toBe("invite");
    expect(parseFMsg({ v: 1, t: "invite", code: "ABCDEFGH", name: "Mia", game: "../etc", room: "ABC234", ts: 1, mac: "x" })).toBeNull();
    expect(parseFMsg({ v: 1, t: "invite", code: "ABCDEFGH", name: "Mia", game: "casino", room: "nope", ts: 1, mac: "x" })).toBeNull();
    expect(parseFMsg({ v: 2, t: "seen" })).toBeNull();
    expect(parseFMsg({ v: 1, t: "req", code: "ABCDEFGH", name: "a", secret: "short" })).toBeNull();
  });
});

describe("becoming friends", () => {
  it("a request reaches the other device, and accepting makes you friends on both", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann"), bo = await device(net, "Bo");
    expect(await ann.request(bo.code)).toBe("sent");
    await until(() => bo.getSnapshot().requests.length === 1, "request arrives");
    const req = bo.getSnapshot().requests[0];
    expect(req.code).toBe(ann.code);
    expect(req.name).toBe("Ann");
    expect(req.check).toMatch(/^\d{6}$/);
    expect(ann.getSnapshot().friends[0]).toMatchObject({ code: bo.code, confirmed: false });
    expect(await bo.acceptRequest(ann.code)).toBe(true);
    await until(() => ann.getSnapshot().friends[0]?.confirmed === true, "Ann hears the answer");
    expect(ann.getSnapshot().friends[0].name).toBe("Bo");
    expect(bo.getSnapshot().friends[0]).toMatchObject({ code: ann.code, name: "Ann", confirmed: true });
    expect(ann.getSnapshot().friends[0].secret).toBe(bo.getSnapshot().friends[0].secret);
    expect(bo.getSnapshot().requests.length).toBe(0);
  });
  it("declining or blocking removes the request, and a blocked code cannot ask again", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann"), bo = await device(net, "Bo");
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    bo.declineRequest(ann.code);
    expect(bo.getSnapshot().requests.length).toBe(0);
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    bo.block(ann.code);
    expect(bo.getSnapshot().requests.length).toBe(0);
    await ann.request(bo.code);
    await new Promise(r => setTimeout(r, 60));
    expect(bo.getSnapshot().requests.length).toBe(0);
  });
  it("works when the other app was closed: the answer arrives the next time you look", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann");
    const boStore = memoryStore();
    const bo = await device(net, "Bo", { store: boStore });
    const boCode = bo.code;
    bo.stop();
    expect(await ann.request(boCode)).toBe("offline");
    expect(ann.getSnapshot().friends[0].confirmed).toBe(false);
    // Bo opens the app again; Ann tries again and is added once Bo has accepted
    const bo2 = await device(net, "Bo", { store: boStore });
    expect(bo2.code).toBe(boCode);
    expect(await ann.request(boCode)).toBe("sent");
    await until(() => bo2.getSnapshot().requests.length === 1);
    await bo2.acceptRequest(ann.code);
    await until(() => ann.getSnapshot().friends[0].confirmed);
  });
  it("asking yourself, a bad code or a blocked code is refused", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann");
    expect(await ann.request(ann.code)).toBe("self");
    expect(await ann.request("nope")).toBe("invalid");
    ann.block("ZZZZZZZZ");
    expect(await ann.request("ZZZZZZZZ")).toBe("blocked");
  });
  it("two people who ask each other at once end up as friends", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann"), bo = await device(net, "Bo");
    ann.block("QQQQQQQQ");
    // Ann has asked Bo while Bo was away; Bo then asks Ann too
    const boStore = memoryStore(); void boStore;
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    expect(await bo.request(ann.code)).toBe("added");
    await until(() => ann.getSnapshot().friends.find(f => f.code === bo.code)?.confirmed === true);
  });
});

describe("invites", () => {
  const friends = async (net: MemoryNetwork, opts: { now?: () => number } = {}) => {
    const ann = await device(net, "Ann", opts), bo = await device(net, "Bo", opts);
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    await bo.acceptRequest(ann.code);
    await until(() => ann.getSnapshot().friends[0].confirmed);
    return { ann, bo };
  };
  it("reach a friend whose app is open, with the game and the room", async () => {
    const { ann, bo } = await friends(new MemoryNetwork());
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("delivered");
    const inv = bo.getSnapshot().invites[0];
    expect(inv).toMatchObject({ code: ann.code, name: "Ann", game: "casino", room: "ABC234" });
    // the same room is not shown twice
    await ann.invite(bo.code, "casino", "ABC234");
    expect(bo.getSnapshot().invites.length).toBe(1);
    bo.dismissInvite(inv.id);
    expect(bo.getSnapshot().invites.length).toBe(0);
  });
  it("say 'offline' when the friend's app is closed, and 'not-friend' for strangers", async () => {
    const net = new MemoryNetwork();
    const { ann, bo } = await friends(net);
    bo.stop();
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("offline");
    expect(await ann.invite("ZZZZZZZZ", "casino", "ABC234")).toBe("not-friend");
  });
  it("are ignored from people who are not your friends, or who sign with the wrong secret", async () => {
    const net = new MemoryNetwork();
    const { ann, bo } = await friends(net);
    const cy = await device(net, "Cy");
    // Cy was never friends with Bo: an invite is refused ("unknown") and never shown
    cy["friends"].push({ code: bo.code, name: "Bo", secret: "x".repeat(32), since: 0, confirmed: true } as never);
    expect(await cy.invite(bo.code, "casino", "ABC234")).toBe("not-friend");
    // an impostor who knows Ann's code but not the secret
    const fake = await device(net, "Fake");
    fake["friends"].push({ code: bo.code, name: "Bo", secret: "y".repeat(32), since: 0, confirmed: true } as never);
    (fake as unknown as { code: string }).code = ann.code;
    expect(await fake.invite(bo.code, "casino", "ABC234")).toBe("offline"); // refused without an answer
    expect(bo.getSnapshot().invites.length).toBe(0);
  });
  it("old invites cannot be played back", async () => {
    const t = 1_000_000;
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann", { now: () => t }), boClock = { t };
    const bo = await device(net, "Bo", { now: () => boClock.t });
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    await bo.acceptRequest(ann.code);
    await until(() => ann.getSnapshot().friends[0].confirmed);
    boClock.t = t + 11 * 60_000; // Bo's clock is eleven minutes ahead: the invite is stale on arrival
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("offline");
    expect(bo.getSnapshot().invites.length).toBe(0);
  });
  it("expire after a while and stop arriving when the listener is switched off", async () => {
    let t = 5_000_000;
    const net = new MemoryNetwork();
    const { ann, bo } = await friends(net, { now: () => t });
    await ann.invite(bo.code, "casino", "ABC234");
    expect(bo.getSnapshot().invites.length).toBe(1);
    t += 11 * 60_000;
    bo["refresh"]();
    expect(bo.getSnapshot().invites.length).toBe(0);
    await bo.setListening(false);
    expect(await ann.invite(bo.code, "fourcolors", "XYZ234")).toBe("offline");
    await bo.setListening(true);
    expect(await ann.invite(bo.code, "fourcolors", "XYZ234")).toBe("delivered");
  });
});

describe("presence", () => {
  it("shows who has the app open and keeps names up to date", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann"), bo = await device(net, "Bo");
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    await bo.acceptRequest(ann.code);
    await until(() => ann.getSnapshot().friends[0].confirmed);
    expect(await ann.ping(bo.code)).toMatchObject({ online: true, known: true });
    bo.stop();
    expect(await ann.ping(bo.code)).toMatchObject({ online: false, known: true });
    expect(await ann.ping("ZZZZZZZZ")).toEqual({ online: false, known: false });
  });
  it("a removed friend answers 'not friends' rather than pretending", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, "Ann"), bo = await device(net, "Bo");
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    await bo.acceptRequest(ann.code);
    await until(() => ann.getSnapshot().friends[0].confirmed);
    bo.remove(ann.code);
    expect((await ann.ping(bo.code)).known).toBe(false);
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("not-friend");
  });
});
