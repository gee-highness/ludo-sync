import { describe, expect, it } from "vitest";
import {
  MAX_CANDIDATES, base32Decode, base32Encode, decodeSignal, encodeSignal, extractSignalText, isLocalHost, sdpFromSignal, signalFromSdp, validateSignal, type Signal,
} from "./offerCodec";

const FP = Array.from({ length: 32 }, (_, i) => ((i * 37 + 11) & 255).toString(16).padStart(2, "0")).join(":");
const offer = (over: Partial<Signal> = {}): Signal => ({
  type: "offer", id: "0a1b2c3d", ufrag: "AbCd", pwd: "abcdefghijklmnopqrstuv", fingerprint: FP,
  candidates: [{ host: "192.168.43.1", port: 51234 }, { host: "fe80:0:0:0:a:b:c:d", port: 40000 }, { host: "3f2a9c1e-77aa-4c3d-9b2e-1a2b3c4d5e6f.local", port: 4242 }], ...over,
});

describe("local addresses", () => {
  it("accepts private ranges, link-local and .local names only", () => {
    for (const h of ["192.168.1.5", "10.0.0.2", "172.16.5.9", "172.31.255.1", "169.254.3.4", "100.64.1.1", "192.0.2.2", "fe80::1", "fd12:3456::1", "abc-123.local"]) expect(isLocalHost(h), h).toBe(true);
    for (const h of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "1.1.1.1", "192.0.3.2", "2001:4860:4860::8888", "example.com", "192.168.1.256", "evil.local.com", "", "999.1.1.1"]) expect(isLocalHost(h), h).toBe(false);
  });
});

describe("pairing note", () => {
  it("round trips an offer and an answer", () => {
    for (const type of ["offer", "answer"] as const) {
      const s = offer({ type });
      const text = encodeSignal(s);
      expect(text.startsWith("LS")).toBe(true);
      const back = decodeSignal(text);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.signal.type).toBe(type);
        expect(back.signal.id).toBe(s.id);
        expect(back.signal.ufrag).toBe(s.ufrag);
        expect(back.signal.pwd).toBe(s.pwd);
        expect(back.signal.fingerprint).toBe(s.fingerprint);
        expect(back.signal.candidates.map(c => c.port)).toEqual([51234, 40000, 4242]);
        expect(back.signal.candidates[0].host).toBe("192.168.43.1");
        expect(back.signal.candidates[2].host).toBe(s.candidates[2].host);
      }
    }
  });
  it("is short enough for a small QR code", () => {
    expect(encodeSignal(offer()).length).toBeLessThan(400);
    expect(encodeSignal(offer({ candidates: [{ host: "192.168.1.2", port: 5000 }] })).length).toBeLessThan(200);
  });
  it("copes with links, spaces, line breaks and lower case", () => {
    const text = encodeSignal(offer());
    const spaced = text.toLowerCase().replace(/(.{8})/g, "$1 \n");
    expect(decodeSignal(spaced).ok).toBe(true);
    expect(decodeSignal(`https://example.com/nearby?invite=${text}`).ok).toBe(true);
    expect(decodeSignal(`Join me! ${text} see you`).ok).toBe(true);
    expect(extractSignalText("nothing here")).toBeNull();
  });
  it("rejects damaged, truncated, wrong or hostile notes", () => {
    const text = encodeSignal(offer());
    const flip = text.slice(0, 30) + (text[30] === "A" ? "B" : "A") + text.slice(31);
    expect(decodeSignal(flip)).toEqual({ ok: false, reason: "checksum" });
    expect(decodeSignal(text.slice(0, text.length - 9)).ok).toBe(false);
    expect(decodeSignal("hello world")).toEqual({ ok: false, reason: "format" });
    expect(decodeSignal("")).toEqual({ ok: false, reason: "format" });
    expect(decodeSignal("x".repeat(5000))).toEqual({ ok: false, reason: "size" });
    expect(decodeSignal(encodeSignal(offer()), "answer")).toEqual({ ok: false, reason: "wrong-kind" });
    expect(decodeSignal(encodeSignal(offer({ type: "answer" })), "offer")).toEqual({ ok: false, reason: "wrong-kind" });
  });
  it("will not encode public addresses or too many candidates", () => {
    expect(() => encodeSignal(offer({ candidates: [{ host: "8.8.8.8", port: 3478 }] }))).toThrow();
    expect(() => encodeSignal(offer({ candidates: Array.from({ length: MAX_CANDIDATES + 1 }, (_, i) => ({ host: `192.168.1.${i + 2}`, port: 4000 + i })) }))).toThrow();
    expect(validateSignal(offer({ candidates: [] }))).toBe(false);
    expect(validateSignal(offer({ fingerprint: "zz" }))).toBe(false);
    expect(validateSignal(offer({ id: "nope" }))).toBe(false);
  });
  it("base32 round trips", () => {
    const b = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 7, 8, 9, 10]);
    expect(Array.from(base32Decode(base32Encode(b))!)).toEqual(Array.from(b));
    expect(base32Decode("not base 32!")).toBeNull();
  });
});

describe("session descriptions", () => {
  const REAL = [
    "v=0", "o=- 4611731400430051336 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0", "a=extmap-allow-mixed", "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
    "a=candidate:842163049 1 udp 1677729535 203.0.113.9 51234 typ srflx raddr 0.0.0.0 rport 0",
    "a=candidate:1 1 udp 2122260223 192.168.43.1 51234 typ host generation 0 network-id 1",
    "a=candidate:2 1 tcp 1518280447 192.168.43.1 9 typ host tcptype active",
    "a=candidate:3 1 udp 2122194687 10.1.2.3 40000 typ host generation 0",
    "a=ice-ufrag:AbCd", "a=ice-pwd:abcdefghijklmnopqrstuv", "a=ice-options:trickle",
    `a=fingerprint:sha-256 ${FP.toUpperCase()}`, "a=setup:actpass", "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144", "",
  ].join("\r\n");
  it("keeps only local UDP host candidates, in a form the other side can rebuild", () => {
    const s = signalFromSdp(REAL, "offer", "0a1b2c3d")!;
    expect(s.candidates.map(c => `${c.host}:${c.port}`)).toEqual(["192.168.43.1:51234", "10.1.2.3:40000"]);
    expect(s.fingerprint).toBe(FP);
    const rebuilt = sdpFromSignal(s);
    expect(rebuilt).toContain("a=candidate:1 1 udp");
    expect(rebuilt).toContain("192.168.43.1 51234 typ host");
    expect(rebuilt).toContain("a=setup:actpass");
    expect(rebuilt).not.toContain("203.0.113.9");
    expect(sdpFromSignal({ ...s, type: "answer" })).toContain("a=setup:active");
    const again = signalFromSdp(rebuilt, "offer", "0a1b2c3d")!;
    expect(again.candidates).toEqual(s.candidates);
  });
  it("gives up on descriptions with nothing usable", () => {
    expect(signalFromSdp("v=0", "offer", "0a1b2c3d")).toBeNull();
    expect(signalFromSdp(REAL.replace(/a=candidate:.*typ host.*\r\n/g, ""), "offer", "0a1b2c3d")).toBeNull();
  });
});
