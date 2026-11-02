import { afterEach, describe, expect, it } from "vitest";
import { MemoryNetwork } from "../net/transport";
import { FriendsService, MAIL_TTL_MS } from "../friends/service";
import { macOf, textFor } from "../friends/protocol";
import { memoryStore, type FriendsStore } from "../friends/store";
import { MailboxClient, type MailApi } from "./client";
import { handleMailbox } from "./handler";
import { MAILBOX, collect, memoryMailStore, register, send, setAllowed } from "./server";

const KEY = "k".repeat(24), OTHER = "o".repeat(24);
const invite = (from: string, room = "ABC234", ts = 1000) => ({ v: 1, t: "invite", code: from, name: "Ann", game: "casino", room, ts, mac: "mac" });

describe("mailbox server", () => {
  it("a device claims its code once; the same key can claim it again, another key cannot", async () => {
    const s = memoryMailStore();
    expect(await register(s, "BBBBBBBB", KEY)).toBe("ok");
    expect(await register(s, "BBBBBBBB", KEY)).toBe("ok");
    expect(await register(s, "BBBBBBBB", OTHER)).toBe("taken");
    expect(await register(s, "nope", KEY)).toBe("bad");
    expect(await register(s, "BBBBBBBB", "short")).toBe("bad");
    expect([...s.files.values()].join("")).not.toContain(KEY); // only a hash is kept
  });
  it("only accepts mail for registered owners, from the friends they listed", async () => {
    const s = memoryMailStore();
    expect(await send(s, "BBBBBBBB", invite("AAAAAAAA"), 5)).toBe("unknown");
    await register(s, "BBBBBBBB", KEY);
    expect(await send(s, "BBBBBBBB", invite("AAAAAAAA"), 5)).toBe("refused"); // nobody listed yet
    expect(await setAllowed(s, "BBBBBBBB", OTHER, ["AAAAAAAA"])).toBe("denied");
    expect(await setAllowed(s, "BBBBBBBB", KEY, ["AAAAAAAA"])).toBe("ok");
    expect(await send(s, "BBBBBBBB", invite("AAAAAAAA"), 5)).toBe("ok");
    expect(await send(s, "BBBBBBBB", invite("CCCCCCCC"), 5)).toBe("refused"); // a stranger
  });
  it("refuses anything but invites and accepts, and oversized or malformed mail", async () => {
    const s = memoryMailStore();
    await register(s, "BBBBBBBB", KEY); await setAllowed(s, "BBBBBBBB", KEY, ["AAAAAAAA"]);
    expect(await send(s, "BBBBBBBB", { v: 1, t: "req", code: "AAAAAAAA", name: "A", secret: "s".repeat(24) }, 5)).toBe("bad"); // requests carry a secret: never through here
    expect(await send(s, "BBBBBBBB", { v: 1, t: "ping", code: "AAAAAAAA", name: "A", ts: 1, mac: "m" }, 5)).toBe("bad");
    expect(await send(s, "BBBBBBBB", { ...invite("AAAAAAAA"), name: "x".repeat(2000) }, 5)).toBe("bad");
    expect(await send(s, "BBBBBBBB", "junk", 5)).toBe("bad");
    expect(await send(s, 42, invite("AAAAAAAA"), 5)).toBe("bad");
  });
  it("keeps one invite per friend and room, and a limited number waiting", async () => {
    const s = memoryMailStore();
    await register(s, "BBBBBBBB", KEY); await setAllowed(s, "BBBBBBBB", KEY, ["AAAAAAAA"]);
    await send(s, "BBBBBBBB", invite("AAAAAAAA", "ABC234", 1), 5);
    await send(s, "BBBBBBBB", invite("AAAAAAAA", "ABC234", 2), 6);
    expect(s.files.size).toBe(3); // key, allow list, one message
    const rooms = ["ABCDEF", "ABCDEG", "ABCDEH", "ABCDEJ", "ABCDEK", "ABCDEL", "ABCDEM", "ABCDEN", "ABCDEP", "ABCDEQ"];
    let full = false;
    for (let i = 0; i < MAILBOX.maxPending + 3; i++) { const r = await send(s, "BBBBBBBB", invite("AAAAAAAA", rooms[i % 10] + "" , i), 7); void r; }
    for (let i = 0; i < 40; i++) { const room = `${String.fromCharCode(65 + (i % 8))}${String.fromCharCode(65 + Math.floor(i / 8))}2345`.slice(0, 6); const r = await send(s, "BBBBBBBB", invite("AAAAAAAA", room.padEnd(6, "2"), i), 8); if (r === "full") full = true; }
    expect(full).toBe(true);
  });
  it("hands the owner their mail once, deletes it, drops expired mail, and rejects the wrong key", async () => {
    const s = memoryMailStore();
    await register(s, "BBBBBBBB", KEY); await setAllowed(s, "BBBBBBBB", KEY, ["AAAAAAAA"]);
    await send(s, "BBBBBBBB", invite("AAAAAAAA", "ABC234"), 1000);
    expect(await collect(s, "BBBBBBBB", OTHER, 2000)).toEqual({ ok: false });
    const got = await collect(s, "BBBBBBBB", KEY, 2000);
    expect(got.ok && got.msgs.length).toBe(1);
    const again = await collect(s, "BBBBBBBB", KEY, 3000);
    expect(again.ok && again.msgs.length).toBe(0);
    await send(s, "BBBBBBBB", invite("AAAAAAAA", "ABC234"), 1000);
    const late = await collect(s, "BBBBBBBB", KEY, 1000 + MAILBOX.ttlMs + 1);
    expect(late.ok && late.msgs.length).toBe(0);
  });
});

const api = (store: ReturnType<typeof memoryMailStore> | null): MailApi => ({
  post: async body => { const r = await handleMailbox(new Request("http://x/api/mailbox", { method: "POST", body: JSON.stringify(body) }), store); return { status: r.status, body: await r.json() }; },
});

describe("mailbox endpoint", () => {
  it("is off (503) with no store, and answers 400 to junk", async () => {
    expect((await api(null).post({ op: "register", code: "AAAAAAAA", key: KEY }))!.status).toBe(503);
    const s = memoryMailStore();
    expect((await api(s).post({ op: "nope" }))!.status).toBe(400);
    const r = await handleMailbox(new Request("http://x", { method: "POST", body: "{not json" }), s);
    expect(r.status).toBe(400);
    const big = await handleMailbox(new Request("http://x", { method: "POST", body: "x".repeat(5000) }), s);
    expect(big.status).toBe(413);
  });
  it("client registers, and turns itself off when the server has no store", async () => {
    const on = new MailboxClient(api(memoryMailStore()), memoryStore(), "AAAAAAAA");
    expect(await on.ensure()).toBe(true);
    const off = new MailboxClient(api(null), memoryStore(), "AAAAAAAA");
    expect(await off.ensure()).toBe(false);
    expect(await off.send("BBBBBBBB", { t: "seen" })).toBe("failed");
    const down = new MailboxClient({ post: async () => null }, memoryStore(), "AAAAAAAA");
    expect(await down.ensure()).toBe(false);
    expect(down.enabled).toBe(false);
  });
});

const live: FriendsService[] = [];
afterEach(() => { live.splice(0).forEach(s => s.stop()); });
const until = async (cond: () => boolean, label = "condition", ms = 6000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`); await new Promise(r => setTimeout(r, 3)); } };

const device = async (net: MemoryNetwork, mail: ReturnType<typeof memoryMailStore> | null, name: string, store: FriendsStore = memoryStore(), now?: () => number) => {
  const probe = new FriendsService({ network: new MemoryNetwork(), store, name: () => name });
  const mailbox = new MailboxClient(api(mail), store, probe.code);
  const s = new FriendsService({ network: net, store, name: () => name, mailbox, pollMs: 0, now, dialMs: 3000, replyMs: 4000 });
  live.push(s);
  await s.start();
  await new Promise(r => setTimeout(r, 30)); // mailbox registration runs after start
  return s;
};

const befriend = async (net: MemoryNetwork, mail: ReturnType<typeof memoryMailStore> | null, ann: FriendsService, bo: FriendsService) => {
  await ann.request(bo.code);
  await until(() => bo.getSnapshot().requests.length === 1);
  await bo.acceptRequest(ann.code);
  await until(() => ann.getSnapshot().friends[0]?.confirmed === true);
  void net; void mail;
};

describe("friends with a mailbox", () => {
  it("an invite for a friend who is not online waits, and arrives when they open the app", async () => {
    const net = new MemoryNetwork(), mail = memoryMailStore();
    const boStore = memoryStore();
    const ann = await device(net, mail, "Ann"), bo = await device(net, mail, "Bo", boStore);
    await befriend(net, mail, ann, bo);
    await new Promise(r => setTimeout(r, 50));
    bo.stop();
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("queued");
    const bo2 = await device(net, mail, "Bo", boStore);
    await bo2.pollMailbox();
    const inv = bo2.getSnapshot().invites[0];
    expect(inv).toMatchObject({ code: ann.code, game: "casino", room: "ABC234", name: "Ann" });
    expect(inv.sentAt).toBeLessThanOrEqual(Date.now());
    expect(await bo2.pollMailbox()).toBe(0); // collected once
  });
  it("still says 'offline' when there is no mailbox", async () => {
    const net = new MemoryNetwork();
    const ann = await device(net, null, "Ann"), bo = await device(net, null, "Bo");
    await befriend(net, null, ann, bo);
    bo.stop();
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("offline");
  });
  it("accepting while the requester is away is still delivered, so they become friends later", async () => {
    const net = new MemoryNetwork(), mail = memoryMailStore();
    const annStore = memoryStore();
    const ann = await device(net, mail, "Ann", annStore), bo = await device(net, mail, "Bo");
    await ann.request(bo.code);
    await until(() => bo.getSnapshot().requests.length === 1);
    ann.stop();
    await bo.acceptRequest(ann.code);
    expect(bo.getSnapshot().friends[0].confirmed).toBe(true);
    const ann2 = await device(net, mail, "Ann", annStore);
    // opening the app collects the mail at once: nothing more to do
    await until(() => ann2.getSnapshot().friends[0]?.confirmed === true, "the accept arrives from the mailbox");
    expect(ann2.getSnapshot().friends[0]).toMatchObject({ confirmed: true, name: "Bo" });
  });
  it("mail is checked like a direct invite: stale, forged or from a stranger is ignored", async () => {
    let t = 10_000_000;
    const net = new MemoryNetwork(), mail = memoryMailStore();
    const boStore = memoryStore();
    const ann = await device(net, mail, "Ann", memoryStore(), () => t), bo = await device(net, mail, "Bo", boStore, () => t);
    await befriend(net, mail, ann, bo);
    await new Promise(r => setTimeout(r, 50));
    bo.stop();
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("queued");
    t += MAIL_TTL_MS + 60_000; // the invite is too old by the time Bo opens the app
    const bo2 = await device(net, mail, "Bo", boStore, () => t);
    await bo2.pollMailbox();
    expect(bo2.getSnapshot().invites.length).toBe(0);
    // a forged invite from a friend's code with the wrong signature
    const f = bo2.getSnapshot().friends[0];
    const mailbox = new MailboxClient(api(mail), memoryStore(), ann.code);
    await mailbox.ensure();
    const fake = { t: "invite" as const, code: f.code, name: "Ann", game: "casino", room: "XYZ234", ts: t, mac: await macOf("x".repeat(32), textFor.invite(f.code, "casino", "XYZ234", t)) };
    await (mail.put(`mail/${bo.code}/m/${f.code}-XYZ234.json`, JSON.stringify({ at: t, msg: { v: 1, ...fake } })));
    await bo2.pollMailbox();
    expect(bo2.getSnapshot().invites.length).toBe(0);
  });
  it("a removed friend can no longer leave mail", async () => {
    const net = new MemoryNetwork(), mail = memoryMailStore();
    const ann = await device(net, mail, "Ann"), bo = await device(net, mail, "Bo");
    await befriend(net, mail, ann, bo);
    await new Promise(r => setTimeout(r, 50));
    bo.remove(ann.code);
    await new Promise(r => setTimeout(r, 50));
    bo.stop();
    expect(await ann.invite(bo.code, "casino", "ABC234")).toBe("offline"); // refused by the mailbox
  });
});
