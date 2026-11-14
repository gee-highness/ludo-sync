import { describe, expect, it } from "vitest";
import { FallbackNetwork } from "./fallbackNetwork";
import { MemoryNetwork, TransportError } from "./transport";

describe("FallbackNetwork", () => {
  it("opens and connects when both services work", async () => {
    const a = new MemoryNetwork(), b = new MemoryNetwork();
    const net = new FallbackNetwork([a, b]);
    const host = await net.open("host");
    const got = new Promise<string | Uint8Array>(r => host.onIncoming(l => { l.onMessage(r); }));
    const guest = await net.open("guest");
    const link = await guest.dial("host");
    link.send("hi");
    expect(await got).toBe("hi");
  });

  it("still works when the first service is down", async () => {
    const a = new MemoryNetwork(), b = new MemoryNetwork();
    a.down = true;
    const net = new FallbackNetwork([a, b]);
    const host = await net.open("host");
    expect(b.endpoints.has("host")).toBe(true);
    const got = new Promise<string | Uint8Array>(r => host.onIncoming(l => { l.onMessage(r); }));
    const guest = await net.open("guest");
    (await guest.dial("host")).send("via b");
    expect(await got).toBe("via b");
  });

  it("falls back at dial time when the host is only on the second service", async () => {
    const a = new MemoryNetwork(), b = new MemoryNetwork();
    const hostEp = await b.open("host"); // host reachable only through b
    const got = new Promise<string | Uint8Array>(r => hostEp.onIncoming(l => { l.onMessage(r); }));
    const guest = await new FallbackNetwork([a, b]).open("guest");
    (await guest.dial("host")).send("x");
    expect(await got).toBe("x");
  });

  it("fails with a clear error when every service is down", async () => {
    const a = new MemoryNetwork(), b = new MemoryNetwork();
    a.down = b.down = true;
    await expect(new FallbackNetwork([a, b]).open("host")).rejects.toMatchObject({ kind: "network" });
  });

  it("reports an id that is already taken, so the caller can retry", async () => {
    const a = new MemoryNetwork(), b = new MemoryNetwork();
    await a.open("host");
    await expect(new FallbackNetwork([a, b]).open("host")).rejects.toBeInstanceOf(TransportError);
    expect(b.endpoints.has("host")).toBe(false);
  });

  it("says the peer is not there when no service has it", async () => {
    const net = new FallbackNetwork([new MemoryNetwork(), new MemoryNetwork()]);
    const guest = await net.open("guest");
    await expect(guest.dial("nobody")).rejects.toMatchObject({ kind: "peer-unavailable" });
  });

  it("closes every service when closed", async () => {
    const a = new MemoryNetwork(), b = new MemoryNetwork();
    const ep = await new FallbackNetwork([a, b]).open("host");
    ep.close();
    expect(a.endpoints.size + b.endpoints.size).toBe(0);
  });
});
