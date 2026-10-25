/**
 * Nearby play has no server to introduce two phones, so the people pass a short note between them: this is that note.
 * A WebRTC offer or answer is boiled down to the few facts the other phone really needs (a username and password for the
 * link check, the device's certificate fingerprint, and where it can be reached on the local network), packed into
 * bytes, checksummed, and written as letters and digits that fit in a QR code or a text message.
 *
 * The other phone rebuilds a plain session description from those facts. It never feeds in raw text from outside,
 * and it only accepts local network addresses, so a doctored note cannot point a phone at the open internet.
 */

export type SignalType = "offer" | "answer";

export interface Candidate {
  /** An IPv4 or IPv6 address on the local network, or a `something.local` name. */
  host: string;
  port: number;
}

export interface Signal {
  type: SignalType;
  /** Ties an answer to the invite it replies to. Eight hex digits. */
  id: string;
  ufrag: string;
  pwd: string;
  /** SHA-256 certificate fingerprint as 32 lower-case hex pairs separated by colons. */
  fingerprint: string;
  candidates: Candidate[];
}

export type DecodeResult =
  | { ok: true; signal: Signal }
  | { ok: false; reason: "format" | "version" | "checksum" | "size" | "invalid" | "wrong-kind" };

export const SIGNAL_VERSION = 1;
export const MAX_CANDIDATES = 6;
const PREFIX = "LS";
const MAX_TEXT = 1400;

// ---- small helpers ------------------------------------------------------------------------------------------------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (bytes: Uint8Array): string => {
  let out = "", bits = 0, acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (text: string): Uint8Array | null => {
  const out: number[] = [];
  let bits = 0, acc = 0;
  for (const ch of text) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v; bits += 5;
    if (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const ascii = (s: string) => Uint8Array.from(s, ch => ch.charCodeAt(0) & 127);
const fromAscii = (b: Uint8Array) => String.fromCharCode(...b);

// ---- addresses ----------------------------------------------------------------------------------------------------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MDNS = /^[a-z0-9]([a-z0-9-]{0,62})(\.[a-z0-9-]{1,63})*\.local$/i;

const parseV4 = (s: string): number[] | null => {
  const m = IPV4.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every(n => n >= 0 && n <= 255) ? p : null;
};

/**
 * Addresses that only exist on a local network: 10/8, 172.16/12, 192.168/16, link-local 169.254/16 and the carrier-grade range hotspots
 * sometimes use. The three documentation ranges (RFC 5737) are included too: they are never routed on the internet, and sandboxes and
 * test machines hand them out.
 */
export const privateV4 = (p: number[]): boolean =>
  p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
  || (p[0] === 192 && p[1] === 0 && p[2] === 2) || (p[0] === 198 && p[1] === 51 && p[2] === 100) || (p[0] === 203 && p[1] === 0 && p[2] === 113);

const parseV6 = (s: string): Uint8Array | null => {
  if (!/^[0-9a-f:]+$/i.test(s) || s.split("::").length > 2) return null;
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [], t = tail !== undefined && tail ? tail.split(":") : [];
  const missing = 8 - h.length - t.length;
  if ((tail === undefined && h.length !== 8) || missing < 0 || (tail !== undefined && missing < 1)) return null;
  const groups = [...h, ...Array(tail === undefined ? 0 : missing).fill("0"), ...t];
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const out = new Uint8Array(16);
  groups.forEach((g, i) => { const v = parseInt(g, 16); out[i * 2] = v >> 8; out[i * 2 + 1] = v & 255; });
  return out;
};
/** fe80::/10 (link-local) and fc00::/7 (unique local). */
const privateV6 = (b: Uint8Array) => (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) || (b[0] & 0xfe) === 0xfc;
const showV6 = (b: Uint8Array) => Array.from({ length: 8 }, (_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(":");

/** True for an address or name that is only reachable on the local network. */
export const isLocalHost = (host: string): boolean => {
  const v4 = parseV4(host);
  if (v4) return privateV4(v4);
  const v6 = parseV6(host);
  if (v6) return privateV6(v6);
  return MDNS.test(host);
};

// ---- session descriptions -----------------------------------------------------------------------------------------

/** Reads the facts out of an SDP a browser produced. Returns null if it is not a plain data-channel description. */
export const signalFromSdp = (sdp: string, type: SignalType, id: string): Signal | null => {
  const lines = sdp.split(/\r?\n/);
  const pick = (re: RegExp) => { for (const l of lines) { const m = re.exec(l); if (m) return m[1]; } return null; };
  const ufrag = pick(/^a=ice-ufrag:(\S+)/), pwd = pick(/^a=ice-pwd:(\S+)/);
  const fp = pick(/^a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/);
  if (!ufrag || !pwd || !fp) return null;
  const candidates: Candidate[] = [];
  for (const l of lines) {
    const m = /^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host\b/i.exec(l);
    if (!m) continue;
    const port = Number(m[2]);
    if (!isLocalHost(m[1]) || port < 1 || port > 65535) continue;
    if (!candidates.some(c => c.host === m[1] && c.port === port)) candidates.push({ host: m[1], port });
  }
  // IPv4 first: it is what hotspots hand out
  candidates.sort((a, b) => Number(!!parseV4(b.host)) - Number(!!parseV4(a.host)));
  const fingerprint = fp.toLowerCase();
  const signal: Signal = { type, id, ufrag, pwd, fingerprint, candidates: candidates.slice(0, MAX_CANDIDATES) };
  return validateSignal(signal) ? signal : null;
};

export const validateSignal = (s: Signal): boolean =>
  (s.type === "offer" || s.type === "answer") && /^[0-9a-f]{8}$/.test(s.id) && /^[A-Za-z0-9+/]{3,32}$/.test(s.ufrag) && /^[A-Za-z0-9+/]{16,64}$/.test(s.pwd)
  && /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/.test(s.fingerprint)
  && s.candidates.length >= 1 && s.candidates.length <= MAX_CANDIDATES
  && s.candidates.every(c => Number.isInteger(c.port) && c.port >= 1 && c.port <= 65535 && isLocalHost(c.host));

/** Builds the plain session description a browser needs from validated facts. */
export const sdpFromSignal = (s: Signal): string => {
  const lines = [
    "v=0", "o=- 1 1 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0", "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
    `a=ice-ufrag:${s.ufrag}`, `a=ice-pwd:${s.pwd}`, `a=fingerprint:sha-256 ${s.fingerprint.toUpperCase()}`,
    `a=setup:${s.type === "offer" ? "actpass" : "active"}`, "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144",
  ];
  s.candidates.forEach((c, i) => lines.push(`a=candidate:${i + 1} 1 udp ${2122260223 - i * 256} ${c.host} ${c.port} typ host`));
  lines.push("a=end-of-candidates");
  return lines.join("\r\n") + "\r\n";
};

// ---- bytes <-> text -----------------------------------------------------------------------------------------------

export const encodeSignal = (s: Signal): string => {
  if (!validateSignal(s)) throw new Error("not a valid signal");
  const parts: number[] = [SIGNAL_VERSION, (s.type === "answer" ? 1 : 0) | (s.candidates.length << 1)];
  for (let i = 0; i < 8; i += 2) parts.push(parseInt(s.id.slice(i, i + 2), 16));
  parts.push(s.ufrag.length, ...ascii(s.ufrag), s.pwd.length, ...ascii(s.pwd));
  parts.push(...s.fingerprint.split(":").map(h => parseInt(h, 16)));
  for (const c of s.candidates) {
    const v4 = parseV4(c.host), v6 = v4 ? null : parseV6(c.host);
    if (v4) parts.push(0, ...v4);
    else if (v6) parts.push(2, ...v6);
    else { const n = ascii(c.host.toLowerCase()); parts.push(1, n.length, ...n); }
    parts.push(c.port >> 8, c.port & 255);
  }
  const body = Uint8Array.from(parts);
  const sum = crc32(body);
  const all = new Uint8Array(body.length + 4);
  all.set(body);
  all.set([sum >>> 24, (sum >>> 16) & 255, (sum >>> 8) & 255, sum & 255], body.length);
  return PREFIX + base32Encode(all);
};

/** Accepts the bare note, a link containing it, or text with stray spaces, line breaks and lower case. */
export const extractSignalText = (input: string): string | null => {
  const fromLink = /[?&#](?:invite|reply)=([^&#\s]+)/i.exec(input)?.[1];
  const clean = (t: string) => t.replace(/[\s-]+/g, "").toUpperCase();
  const whole = clean(fromLink ?? input);
  if (/^LS[A-Z2-7]{20,}$/.test(whole)) return whole;
  // a note inside a message ("Join me! LS... see you"): take the one long word that looks like a note
  const word = input.split(/\s+/).map(w => w.toUpperCase()).find(w => /^LS[A-Z2-7]{20,}$/.test(w));
  if (word) return word;
  return /(LS[A-Z2-7]{20,})/.exec(whole)?.[1] ?? null;
};

export const decodeSignal = (input: string, expect?: SignalType): DecodeResult => {
  if (input.length > MAX_TEXT * 2) return { ok: false, reason: "size" };
  const text = extractSignalText(input);
  if (!text || text.length > MAX_TEXT) return { ok: false, reason: text ? "size" : "format" };
  const all = base32Decode(text.slice(PREFIX.length));
  if (!all || all.length < 12) return { ok: false, reason: "format" };
  const body = all.slice(0, all.length - 4);
  const want = ((all[all.length - 4] << 24) | (all[all.length - 3] << 16) | (all[all.length - 2] << 8) | all[all.length - 1]) >>> 0;
  if (crc32(body) !== want) return { ok: false, reason: "checksum" };
  if (body[0] !== SIGNAL_VERSION) return { ok: false, reason: "version" };
  let i = 1;
  const flags = body[i++];
  const type: SignalType = flags & 1 ? "answer" : "offer";
  const count = (flags >> 1) & 15;
  const need = (n: number) => i + n <= body.length;
  if (!need(4)) return { ok: false, reason: "format" };
  const id = Array.from(body.slice(i, i + 4), b => b.toString(16).padStart(2, "0")).join("");
  i += 4;
  const str = (): string | null => { if (!need(1)) return null; const n = body[i++]; if (!need(n)) return null; const s = fromAscii(body.slice(i, i + n)); i += n; return s; };
  const ufrag = str(), pwd = str();
  if (ufrag === null || pwd === null || !need(32)) return { ok: false, reason: "format" };
  const fingerprint = Array.from(body.slice(i, i + 32), b => b.toString(16).padStart(2, "0")).join(":");
  i += 32;
  const candidates: Candidate[] = [];
  for (let k = 0; k < count; k++) {
    if (!need(1)) return { ok: false, reason: "format" };
    const kind = body[i++];
    let host: string;
    if (kind === 0) { if (!need(4)) return { ok: false, reason: "format" }; host = Array.from(body.slice(i, i + 4)).join("."); i += 4; }
    else if (kind === 2) { if (!need(16)) return { ok: false, reason: "format" }; host = showV6(body.slice(i, i + 16)); i += 16; }
    else if (kind === 1) { const n = str(); if (n === null) return { ok: false, reason: "format" }; host = n; }
    else return { ok: false, reason: "format" };
    if (!need(2)) return { ok: false, reason: "format" };
    candidates.push({ host, port: (body[i] << 8) | body[i + 1] });
    i += 2;
  }
  if (i !== body.length) return { ok: false, reason: "format" };
  const signal: Signal = { type, id, ufrag, pwd, fingerprint, candidates };
  if (!validateSignal(signal)) return { ok: false, reason: "invalid" };
  if (expect && type !== expect) return { ok: false, reason: "wrong-kind" };
  return { ok: true, signal };
};

export const DECODE_MESSAGE: Record<Extract<DecodeResult, { ok: false }>["reason"], string> = {
  format: "That is not a Ludo Sync pairing note. Scan the QR code again, or paste the whole text.",
  version: "That note is from a different version of the app. Update both phones and try again.",
  checksum: "The note is damaged or cut short. Copy or scan it again.",
  size: "That text is too long to be a pairing note.",
  invalid: "That note has details this app will not use. Make a new one.",
  "wrong-kind": "That is the wrong kind of note. The host's invite goes to the guest, and the guest's reply goes back to the host.",
};

/** A short phrase to show next to a note so two people can check they are talking about the same one. */
export const noteLabel = (s: Signal) => s.id.slice(0, 4).toUpperCase();
