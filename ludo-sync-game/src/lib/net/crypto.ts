/**
 * Cryptography for rooms. Browser WebCrypto only. Each connection gets fresh P-256 keys, derives
 * per-direction AES-GCM keys, and both players see the same six check digits to confirm nobody sits between them.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const randomBytes = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const toB64 = (bytes: Uint8Array): string => {
  let s = "";
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64 = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const utf8 = (s: string) => enc.encode(s);
export const fromUtf8 = (b: Uint8Array) => dec.decode(b);

export const concat = (...parts: (Uint8Array | string)[]): Uint8Array => {
  const arrays = parts.map(p => (typeof p === "string" ? utf8(p) : p));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  arrays.forEach(a => { out.set(a, at); at += a.length; });
  return out;
};

/** Length-prefixed concatenation, so ("ab","c") can never be confused with ("a","bc"). */
export const frame = (...parts: (Uint8Array | string)[]): Uint8Array =>
  concat(...parts.flatMap(p => {
    const a = typeof p === "string" ? utf8(p) : p;
    return [new Uint8Array([a.length >> 8, a.length & 255]), a];
  }));

export const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: string, length = 32): Promise<Uint8Array> => {
  const k = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: utf8(info) }, k, length * 8));
};

export interface KeyPair { pub: string; priv: JsonWebKey }

export const generateKeyPair = async (): Promise<KeyPair> => {
  const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return {
    pub: toB64(new Uint8Array(await subtle().exportKey("raw", pair.publicKey))),
    priv: await subtle().exportKey("jwk", pair.privateKey),
  };
};

/** A well-formed uncompressed P-256 point, checked before any use. */
export const validPub = (pub: unknown): pub is string => {
  if (typeof pub !== "string" || pub.length < 80 || pub.length > 100) return false;
  try { const b = fromB64(pub); return b.length === 65 && b[0] === 4; } catch { return false; }
};

export const ecdh = async (priv: JsonWebKey, pub: string): Promise<Uint8Array> => {
  const theirs = await subtle().importKey("raw", fromB64(pub), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const mine = await subtle().importKey("jwk", priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: theirs }, mine, 256));
};

const AAD = utf8("ludo-sync-1");
const ivFor = (dir: number, counter: number): Uint8Array => {
  const iv = new Uint8Array(12);
  iv[0] = dir;
  let c = counter;
  for (let i = 11; i >= 4; i--) { iv[i] = c % 256; c = Math.floor(c / 256); }
  return iv;
};

export const importAesKey = (raw: Uint8Array) => subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

/** One direction of an encrypted connection. Counters make every nonce unique and expose replays. */
export class SecureSender {
  private n = 0;
  constructor(private key: CryptoKey, private dir: number) {}

  async seal(data: Uint8Array): Promise<Uint8Array> {
    const counter = ++this.n;
    const iv = ivFor(this.dir, counter);
    const body = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: AAD }, this.key, data));
    return concat(iv.slice(4), body);
  }
}

export class SecureReceiver {
  private n = 0;
  constructor(private key: CryptoKey, private dir: number) {}

  /** Throws on a forged, replayed, reordered or missing message. */
  async open(bytes: Uint8Array): Promise<Uint8Array> {
    if (bytes.length < 8 + 16) throw new Error("short frame");
    let counter = 0;
    for (let i = 0; i < 8; i++) counter = counter * 256 + bytes[i];
    if (counter !== this.n + 1) throw new Error("out of order");
    const plain = new Uint8Array(await subtle().decrypt(
      { name: "AES-GCM", iv: ivFor(this.dir, counter), additionalData: AAD }, this.key, bytes.slice(8),
    ));
    this.n = counter;
    return plain;
  }
}

// ---- Room codes and client ids --------------------------------------------------------------

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
export const ROOM_CODE_LENGTH = 6;

export const newRoomCode = (): string => {
  let out = "";
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
};

/** Accepts what people type or scan: any case, dashes or spaces, and the usual look-alike letters. */
export const cleanRoomCode = (input: string): string =>
  input.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1").replace(/[^0-9A-Z]/g, "").slice(0, ROOM_CODE_LENGTH);

export const isRoomCode = (code: string) => code.length === ROOM_CODE_LENGTH && [...code].every(c => ALPHABET.includes(c));
export const formatRoomCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;

/** A secret that proves a returning phone owns its seat; only ever sent over the encrypted channel. */
export const newClientId = (): string => toB64(randomBytes(18));
export const isClientId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{16,48}$/.test(v);
