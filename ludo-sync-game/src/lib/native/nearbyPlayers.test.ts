import { describe, expect, it } from "vitest";
import { NearbyPlayers, type NearbyPluginLike } from "./nearbyPlayers";
import type { Link } from "../net/transport";

type Cb = (e: Record<string, string>) => void;
/** Two fake phones whose plugins talk to each other, found over both Wi-Fi and Bluetooth. */
const world = () => {
  const phones: FakePlugin[] = [];
  let n = 0;
  class FakePlugin implements NearbyPluginLike {
    ls = new Map<string, Cb[]>();
    me = { device: "", name: "", code: "" };
    conns = new Map<string, { peer: FakePlugin; cid: string }>();
    pending = new Map<string, { from: FakePlugin; resolve: (cid: string) => void; reject: (e: Error) => void; cid: string }>();
    declineVia = new Set<string>();
    constructor() { phones.push(this); }
    emit(ev: string, e: Record<string, string>) { (this.ls.get(ev) ?? []).forEach(cb => cb(e)); }
    addListener(ev: string, cb: Cb) { this.ls.set(ev, [...(this.ls.get(ev) ?? []), cb]); return { remove() {} }; }
    async status() { return { granted: true, google: true }; }
    async access() { return { granted: true }; }
    async start(o: { device: string; name: string; code: string }) {
      this.me = o;
      for (const p of phones) if (p !== this && p.me.device) {
        for (const via of ["lan", "google"]) {
          p.emit("found", { rid: `${via[0]}:${this.me.device}`, via, device: o.device, name: o.name, code: o.code });
          this.emit("found", { rid: `${via[0]}:${p.me.device}`, via, device: p.me.device, name: p.me.name, code: p.me.code });
        }
      }
      return { google: true };
    }
    async stop() {}
    invite(o: { rid: string; info: string }) {
      const target = phones.find(p => p.me.device === o.rid.slice(2))!;
      if (target.declineVia.has(o.rid[0])) return Promise.reject(new Error("unreachable"));
      return new Promise<{ cid: string }>((resolve, reject) => {
        const cid = `c${++n}`;
        target.pending.set(cid, { from: this, resolve: c => resolve({ cid: c }), reject, cid });
        target.emit("invited", { cid, via: o.rid[0] === "l" ? "lan" : "google", info: o.info });
      });
    }
    async accept(o: { cid: string }) {
      const p = this.pending.get(o.cid)!; this.pending.delete(o.cid);
      const back = `c${++n}`;
      this.conns.set(o.cid, { peer: p.from, cid: back });
      p.from.conns.set(back, { peer: this, cid: o.cid });
      p.resolve(back);
    }
    async decline(o: { cid: string }) { const p = this.pending.get(o.cid); this.pending.delete(o.cid); p?.reject(new Error("declined")); }
    async send(o: { cid: string; data: string }) { const c = this.conns.get(o.cid); if (c) setTimeout(() => c.peer.emit("message", { cid: c.cid, data: o.data }), 0); }
    async close(o: { cid: string }) { const c = this.conns.get(o.cid); this.conns.delete(o.cid); if (c) setTimeout(() => c.peer.emit("closed", { cid: c.cid }), 0); }
  }
  return { FakePlugin };
};

const until = async (f: () => boolean) => { for (let i = 0; i < 400 && !f(); i++) await new Promise(r => setTimeout(r, 5)); if (!f()) throw new Error("timed out"); };

describe("NearbyPlayers", () => {
  const setup = async () => {
    const { FakePlugin } = world();
    const pa = new FakePlugin(), pb = new FakePlugin();
    const a = new NearbyPlayers(pa), b = new NearbyPlayers(pb);
    await a.start({ device: "A", name: "Ana", code: "FRIENDA1" });
    await b.start({ device: "B", name: "Ben", code: "FRIENDB1" });
    return { a, b, pa, pb };
  };

  it("lists each person once, even when found over Wi-Fi and Bluetooth", async () => {
    const { a } = await setup();
    expect(a.get().peers).toHaveLength(1);
    expect(a.get().peers[0]).toMatchObject({ device: "B", name: "Ben", code: "FRIENDB1" });
    expect(Object.keys(a.get().peers[0].routes).sort()).toEqual(["google", "lan"]);
  });

  it("invites, accepts, and carries big text and bytes both ways", async () => {
    const { a, b } = await setup();
    const out = a.invite(a.get().peers[0], { k: "party", p: "ABC123" });
    await until(() => b.get().invites.length === 1);
    const inv = b.get().invites[0];
    expect(inv.kind).toEqual({ k: "party", p: "ABC123" });
    expect(inv.from.name).toBe("Ana");
    const [la, lb] = await Promise.all([out, b.accept(inv)]) as [Link, Link];
    const big = "x".repeat(70_000);
    const got = new Promise(r => lb.onMessage(r));
    la.send(big);
    expect(await got).toBe(big);
    const back = new Promise(r => la.onMessage(r));
    lb.send(new Uint8Array([9, 8, 7]));
    expect(Array.from(await back as Uint8Array)).toEqual([9, 8, 7]);
    const closed = new Promise<void>(r => lb.onClose(r));
    la.close();
    await closed;
  });

  it("falls back to Bluetooth when the Wi-Fi route fails, and reports a no", async () => {
    const { a, b, pb } = await setup();
    pb.declineVia.add("l");
    const out = a.invite(a.get().peers[0], { k: "ludo" });
    await until(() => b.get().invites.length === 1);
    expect(b.get().invites[0].via).toBe("google");
    b.decline(b.get().invites[0]);
    await expect(out).rejects.toThrow("declined");
  });
});
