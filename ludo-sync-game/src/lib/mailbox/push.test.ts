import { describe, expect, it } from "vitest";
import { handleMailbox } from "./handler";
import { memoryMailStore } from "./server";
import { parseSub, type PushSender } from "./push";

const KEY_A = "a".repeat(24), KEY_B = "b".repeat(24);
const A = "ABCDEFGH", B = "JKLMNPQR";
const post = (store: ReturnType<typeof memoryMailStore>, body: unknown, pusher?: () => Promise<PushSender | null>) =>
  handleMailbox(new Request("http://x/api/mailbox", { method: "POST", body: JSON.stringify(body) }), store, pusher);
const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) } };
const invite = { v: 1, t: "invite", code: A, name: "Ann", game: "casino", room: "ABC123", ts: Date.now(), mac: "m".repeat(20) };

describe("waking a friend whose app is closed", () => {
  it("rejects bad subscriptions", () => {
    expect(parseSub({ endpoint: "http://insecure", keys: { p256dh: "x", auth: "y" } })).toBeNull();
    expect(parseSub({ endpoint: "https://ok", keys: {} })).toBeNull();
    expect(parseSub(sub)).toEqual(sub);
  });

  it("sends a notice when an invite is queued, and not for anyone else", async () => {
    const store = memoryMailStore();
    await post(store, { op: "register", code: A, key: KEY_A });
    await post(store, { op: "register", code: B, key: KEY_B });
    await post(store, { op: "allow", code: B, key: KEY_B, from: [A] });
    expect((await post(store, { op: "push", code: B, key: KEY_A, sub })).status).toBe(403); // not B's key
    expect((await post(store, { op: "push", code: B, key: KEY_B, sub })).status).toBe(200);
    const sent: { sub: unknown; payload: string }[] = [];
    const pusher = async (): Promise<PushSender> => async (s, payload) => { sent.push({ sub: s, payload }); return "sent"; };
    const r = await post(store, { op: "send", to: B, msg: invite }, pusher);
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].sub).toEqual(sub);
    expect(JSON.parse(sent[0].payload).body).toBe("Ann invited you to play Casino");
    // the invite is still waiting in the mailbox
    const got = await (await post(store, { op: "fetch", code: B, key: KEY_B })).json();
    expect(got.msgs).toHaveLength(1);
  });

  it("still queues the invite when push is not set up or the send fails, and forgets dead addresses", async () => {
    const store = memoryMailStore();
    await post(store, { op: "register", code: A, key: KEY_A });
    await post(store, { op: "register", code: B, key: KEY_B });
    await post(store, { op: "allow", code: B, key: KEY_B, from: [A] });
    await post(store, { op: "push", code: B, key: KEY_B, sub });
    expect((await post(store, { op: "send", to: B, msg: invite })).status).toBe(200); // no sender at all
    const gone = async (): Promise<PushSender> => async () => "gone";
    expect((await post(store, { op: "send", to: B, msg: { ...invite, room: "XYZ789" } }, gone)).status).toBe(200);
    expect([...store.files.keys()].some(k => k.endsWith("push.json"))).toBe(false);
  });

  it("reports the public key only when the server has one", async () => {
    const store = memoryMailStore();
    expect(await (await post(store, { op: "vapid" })).json()).toEqual({ key: null });
  });
});
