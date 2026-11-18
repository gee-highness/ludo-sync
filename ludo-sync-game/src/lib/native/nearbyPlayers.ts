import { registerPlugin } from "@capacitor/core";
import { fromB64, toB64 } from "../net/crypto";
import type { Bytes, Link } from "../net/transport";

/**
 * People nearby with the app open, found by the Android app with no internet (Google Nearby over Bluetooth and Wi-Fi Direct,
 * plus a beacon on the shared Wi-Fi or hotspot). One tap invites them; the connection that comes back is an ordinary `Link`,
 * so parties and nearby games use it exactly like any other.
 */

export type Via = "google" | "lan";
export interface NearbyPeer { device: string; name: string; code: string; routes: Partial<Record<Via, string>> }
/** What an invite is for. `p` is the party's code, which the joining phone must present. */
export type InviteKind = { k: "party"; p: string } | { k: "ludo" } | { k: "skipbo" };
export interface IncomingInvite { cid: string; via: Via; kind: InviteKind; from: { device: string; name: string; code: string }; at: number }
export interface NearbyState {
  supported: boolean;
  /** This phone can be found, and looks for others. */
  visible: boolean;
  /** Bluetooth / nearby devices permission (Wi-Fi works without it). */
  granted: boolean;
  /** Google Play services are there, so Bluetooth / Wi-Fi Direct can be used. */
  google: boolean;
  peers: NearbyPeer[];
  invites: IncomingInvite[];
}
export interface Identity { device: string; name: string; code: string }

type Ev = "found" | "lost" | "invited" | "closed" | "message";
export interface NearbyPluginLike {
  status(): Promise<{ granted: boolean; google: boolean }>;
  access(): Promise<{ granted: boolean }>;
  start(o: Identity): Promise<{ google: boolean }>;
  stop(): Promise<void>;
  invite(o: { rid: string; info: string }): Promise<{ cid: string }>;
  accept(o: { cid: string }): Promise<void>;
  decline(o: { cid: string }): Promise<void>;
  send(o: { cid: string; data: string }): Promise<void>;
  close(o: { cid: string }): Promise<void>;
  addListener(ev: Ev, cb: (e: Record<string, string>) => void): Promise<{ remove: () => void }> | { remove: () => void };
}

/** Google Nearby carries at most 32 KB per message, so bigger ones go in pieces. Byte 0: bit 1 more pieces follow, bit 2 binary. */
const CHUNK = 30_000;
const INVITE_TTL_MS = 60_000;
const enc = new TextEncoder(), dec = new TextDecoder();

class NativeLink implements Link {
  open = true;
  private msg?: (d: Bytes) => void;
  private shut?: () => void;
  private queue: Bytes[] = [];
  private parts: Uint8Array[] = [];
  constructor(private plugin: NearbyPluginLike, readonly cid: string, readonly remoteId: string, readonly initiator: boolean, private gone: () => void) {}

  send(data: Bytes) {
    if (!this.open) return;
    const binary = typeof data !== "string";
    const body = binary ? data : enc.encode(data);
    for (let i = 0; i === 0 || i < body.length; i += CHUNK) {
      const piece = body.subarray(i, i + CHUNK);
      const f = new Uint8Array(piece.length + 1);
      f[0] = (i + CHUNK < body.length ? 1 : 0) | (binary ? 2 : 0);
      f.set(piece, 1);
      void this.plugin.send({ cid: this.cid, data: toB64(f) }).catch(() => this.ended());
    }
  }

  /** A piece arrived from the plugin. */
  receive(b64: string) {
    if (!this.open) return;
    let f: Uint8Array;
    try { f = fromB64(b64); } catch { return; }
    if (!f.length) return;
    this.parts.push(f.subarray(1));
    if (f[0] & 1) return;
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const whole = new Uint8Array(total);
    let o = 0;
    for (const p of this.parts.splice(0)) { whole.set(p, o); o += p.length; }
    const d: Bytes = f[0] & 2 ? whole : dec.decode(whole);
    if (this.msg) this.msg(d); else this.queue.push(d);
  }

  onMessage(cb: (d: Bytes) => void) { this.msg = cb; this.queue.splice(0).forEach(cb); }
  onClose(cb: () => void) { this.shut = cb; if (!this.open) queueMicrotask(cb); }
  close() { if (!this.open) return; void this.plugin.close({ cid: this.cid }).catch(() => {}); this.ended(); }
  ended() { if (!this.open) return; this.open = false; this.gone(); queueMicrotask(() => this.shut?.()); }
}

const parseKind = (raw: unknown): InviteKind | null => {
  const k = (raw as { k?: unknown })?.k;
  if (k === "ludo" || k === "skipbo") return { k };
  const p = (raw as { p?: unknown }).p;
  if (k === "party" && typeof p === "string" && /^[A-Z0-9]{1,12}$/.test(p)) return { k, p };
  return null;
};
const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");

export class NearbyPlayers {
  private st: NearbyState;
  private subs = new Set<() => void>();
  private byRoute = new Map<string, string>(); // rid -> device
  private peers = new Map<string, NearbyPeer>();
  private links = new Map<string, NativeLink>();
  private early = new Map<string, string[]>(); // messages that beat their link
  private me: Identity | null = null;
  private running = false;
  private wired = false;

  constructor(private plugin: NearbyPluginLike | null, private now: () => number = Date.now) {
    this.st = { supported: !!plugin, visible: false, granted: false, google: false, peers: [], invites: [] };
  }

  get = () => this.st;
  subscribe = (cb: () => void) => { this.subs.add(cb); return () => { this.subs.delete(cb); }; };
  private set(p: Partial<NearbyState>) { this.st = { ...this.st, ...p }; this.subs.forEach(cb => cb()); }
  private publishPeers() {
    const list = [...this.peers.values()].filter(p => Object.keys(p.routes).length).sort((a, b) => a.name.localeCompare(b.name));
    this.set({ peers: list });
  }

  /** Starts being visible and looking, as `me`. Safe to call again with a new name. */
  async start(me: Identity) {
    if (!this.plugin) return;
    this.me = me;
    this.wire();
    try {
      const s = await this.plugin.status();
      const r = await this.plugin.start(me);
      this.running = true;
      this.set({ visible: true, granted: s.granted, google: r.google || s.google });
    } catch { /* plugin missing in an old build */ }
  }

  /** Stops being visible (app in the background, or switched off). Open connections stay up. */
  async stop() {
    if (!this.plugin || !this.running) return;
    this.running = false;
    try { await this.plugin.stop(); } catch { /* ignore */ }
    this.peers.clear(); this.byRoute.clear();
    this.set({ visible: false, peers: [] });
  }

  /** Asks for the Bluetooth permission; Google Nearby starts as soon as it is given. */
  async allow(): Promise<boolean> {
    if (!this.plugin) return false;
    try { const r = await this.plugin.access(); this.set({ granted: r.granted }); return r.granted; } catch { return false; }
  }

  /** Invites someone; resolves with the connection once they accept. Tries the shared Wi-Fi first (faster), then Bluetooth. */
  async invite(peer: NearbyPeer, kind: InviteKind): Promise<Link> {
    if (!this.plugin || !this.me) throw new Error("unsupported");
    const info = JSON.stringify({ ...kind, d: this.me.device, n: this.me.name, c: this.me.code });
    let lastError = "unreachable";
    for (const via of ["lan", "google"] as Via[]) {
      const rid = peer.routes[via];
      if (!rid) continue;
      try {
        const { cid } = await this.plugin.invite({ rid, info });
        return this.link(cid, peer.device, true);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (/declined/.test(lastError)) break; // they said no: don't ask twice
      }
    }
    throw new Error(/declined/.test(lastError) ? "declined" : "unreachable");
  }

  async accept(inv: IncomingInvite): Promise<Link> {
    this.dropInvite(inv.cid);
    if (!this.plugin) throw new Error("unsupported");
    await this.plugin.accept({ cid: inv.cid });
    return this.link(inv.cid, inv.from.device, false);
  }

  decline(inv: IncomingInvite) {
    this.dropInvite(inv.cid);
    void this.plugin?.decline({ cid: inv.cid }).catch(() => {});
  }

  // ---- internals -----------------------------------------------------------------------------------------------
  private link(cid: string, device: string, initiator: boolean): NativeLink {
    const l = new NativeLink(this.plugin!, cid, `nearby-${device}`, initiator, () => { if (this.links.get(cid) === l) this.links.delete(cid); });
    this.links.set(cid, l);
    for (const m of this.early.get(cid) ?? []) l.receive(m);
    this.early.delete(cid);
    return l;
  }

  private dropInvite(cid: string) { this.set({ invites: this.st.invites.filter(i => i.cid !== cid) }); }

  private wire() {
    if (this.wired || !this.plugin) return;
    this.wired = true;
    const p = this.plugin;
    void p.addListener("found", e => {
      const device = cleanText(e.device, 64);
      const via = e.via === "google" ? "google" : "lan";
      if (!device || !e.rid) return;
      const peer = this.peers.get(device) ?? { device, name: "", code: "", routes: {} };
      peer.name = cleanText(e.name, 24) || peer.name || "Player";
      peer.code = cleanText(e.code, 16) || peer.code;
      peer.routes = { ...peer.routes, [via]: e.rid };
      this.peers.set(device, peer);
      this.byRoute.set(e.rid, device);
      this.publishPeers();
    });
    void p.addListener("lost", e => {
      const device = this.byRoute.get(e.rid);
      this.byRoute.delete(e.rid);
      const peer = device ? this.peers.get(device) : undefined;
      if (!peer) return;
      peer.routes = Object.fromEntries(Object.entries(peer.routes).filter(([, r]) => r !== e.rid));
      if (!Object.keys(peer.routes).length) this.peers.delete(peer.device);
      this.publishPeers();
    });
    void p.addListener("invited", e => {
      let raw: Record<string, unknown> = {};
      try { raw = JSON.parse(e.info); } catch { /* junk */ }
      const kind = parseKind(raw);
      if (!kind || !e.cid) { void p.decline({ cid: e.cid }).catch(() => {}); return; }
      const inv: IncomingInvite = {
        cid: e.cid, via: e.via === "google" ? "google" : "lan", kind, at: this.now(),
        from: { device: cleanText(raw.d, 64), name: cleanText(raw.n, 24) || "Someone", code: cleanText(raw.c, 16) },
      };
      // one invite per person at a time: a fresh one replaces the old
      const stale = this.st.invites.filter(i => i.from.device === inv.from.device);
      stale.forEach(i => void p.decline({ cid: i.cid }).catch(() => {}));
      this.set({ invites: [...this.st.invites.filter(i => i.from.device !== inv.from.device), inv] });
      setTimeout(() => { if (this.st.invites.some(i => i.cid === inv.cid)) this.decline(inv); }, INVITE_TTL_MS);
    });
    void p.addListener("message", e => {
      const l = this.links.get(e.cid);
      if (l) l.receive(e.data);
      else { const q = this.early.get(e.cid) ?? []; if (q.length < 200) q.push(e.data); this.early.set(e.cid, q); }
    });
    void p.addListener("closed", e => {
      this.links.get(e.cid)?.ended();
      this.early.delete(e.cid);
      this.dropInvite(e.cid);
    });
  }
}

let shared: NearbyPlayers | null = null;
/** The one instance for the app; on the web (no native plugin) it reports `supported: false` and does nothing. */
export const nearbyPlayers = (): NearbyPlayers => {
  if (shared) return shared;
  let plugin: NearbyPluginLike | null = null;
  try {
    const g = globalThis as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } };
    if (g.Capacitor?.isNativePlatform?.()) plugin = registerPlugin<NearbyPluginLike>("NearbyPlayers");
  } catch { plugin = null; }
  shared = new NearbyPlayers(plugin);
  return shared;
};
