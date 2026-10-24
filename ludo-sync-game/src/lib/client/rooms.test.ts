import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostSession } from "../net/host";
import { MemoryNetwork } from "../net/transport";
import { clearRoomRecord, loadRoomRecord, saveRoomRecord } from "./rooms";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
  });
});
afterEach(() => vi.unstubAllGlobals());

const raw = () => [...store.values()][0];

describe("room record", () => {
  it("round-trips a guest record", () => {
    saveRoomRecord({ role: "guest", code: "ABC234", name: "Zed" });
    expect(loadRoomRecord()).toMatchObject({ role: "guest", code: "ABC234", name: "Zed" });
    clearRoomRecord();
    expect(loadRoomRecord()).toBeNull();
  });

  it("drops stale, junk and future-dated records", () => {
    saveRoomRecord({ role: "guest", code: "ABC234", name: "Zed", savedAt: Date.now() - 7 * 3600e3 });
    expect(loadRoomRecord()).toBeNull();
    expect(store.size).toBe(0);
    store.set("ludo-sync:v1:room", JSON.stringify({ role: "guest", code: "nope", name: "Z", savedAt: Date.now() }));
    expect(loadRoomRecord()).toBeNull();
    store.set("ludo-sync:v1:room", JSON.stringify({ role: "admin", code: "ABC234", name: "Z", savedAt: Date.now() }));
    expect(loadRoomRecord()).toBeNull();
    saveRoomRecord({ role: "guest", code: "ABC234", name: "Z", savedAt: Date.now() + 3600e3 });
    expect(loadRoomRecord()).toBeNull();
  });

  it("keeps a valid host record and rejects one whose resume is bad or for another code", async () => {
    const net = new MemoryNetwork();
    const host = new HostSession({ network: net, name: "H", code: "ABC234" });
    await host.open();
    host.setSlot(1, "bot");
    host.start();
    const resume = host.exportResume()!;
    host.close();
    saveRoomRecord({ role: "host", code: "ABC234", name: "H", host: resume });
    const rec = loadRoomRecord()!;
    expect(rec.role).toBe("host");
    expect(rec.host!.state?.players).toHaveLength(2);

    saveRoomRecord({ role: "host", code: "XYZ234", name: "H", host: resume });
    expect(loadRoomRecord()).toBeNull();
    saveRoomRecord({ role: "host", code: "ABC234", name: "H", host: { ...resume, v: 9 } as never });
    expect(loadRoomRecord()).toBeNull();
    void raw;
  });

  it("still offers a finished game: the host may start a rematch", async () => {
    const net = new MemoryNetwork();
    const host = new HostSession({ network: net, name: "H", code: "ABC234" });
    await host.open();
    host.setSlot(1, "bot");
    host.start();
    const resume = JSON.parse(JSON.stringify(host.exportResume()));
    host.close();
    resume.state.phase = "over"; resume.state.winner = 0;
    saveRoomRecord({ role: "host", code: "ABC234", name: "H", host: resume });
    expect(loadRoomRecord()?.host?.state?.phase).toBe("over");
  });
});
