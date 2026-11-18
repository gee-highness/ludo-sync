import { readJSON, removeKey, writeJSON } from "../client/storage";
import { newRoomCode } from "../net/crypto";
import { ManualNetwork, type NearbyDesk } from "../net/manualTransport";
import { defaultNetwork } from "../net/network";
import { TransportError, type Endpoint, type Link } from "../net/transport";
import { GAMES } from "../games";
import { PartyLeader, PartyMember, type Me, type Party } from "./session";

export type PartyMode = "online" | "nearby";
export interface PartyView {
  party: Party | null;
  mode: PartyMode | null;
  /** Starting or joining is under way. */
  busy: boolean;
  error: string;
  /** The nearby pairing desk while a nearby party is being set up. */
  desk: NearbyDesk | null;
  /** Bumped on every change, so screens re-render. */
  rev: number;
}

const SAVE_KEY = "party-online";
const SAVE_MAX_MS = 45 * 60_000;
export const partyAddress = (code: string) => `lsp-${code}`;

// ---- games and their screens ---------------------------------------------------------------------------------------

/** Which game a screen belongs to, so the party knows what each person has open. Menus, play and online screens all count. */
export const gameForPath = (path: string): string | null => {
  const g = /^\/g\/([a-z0-9-]+)/.exec(path)?.[1];
  if (g) return GAMES.some(x => x.id === g) ? g : null;
  if (/^\/skipbo(\/|$)/.test(path)) return "skipbo";
  if (/^\/(ludo|online|play|nearby)(\/|$)/.test(path)) return "ludo";
  return null;
};
export const onlinePathFor = (game: string) => (game === "ludo" ? "/online" : game === "skipbo" ? "/skipbo/online" : `/g/${game}/online`);
export const gameTitle = (id: string | null | undefined) => GAMES.find(g => g.id === id)?.name ?? "a game";
export const gameAccent = (id: string | null | undefined) => GAMES.find(g => g.id === id)?.accent ?? "#6366f1";

// ---- the store -----------------------------------------------------------------------------------------------------

/**
 * The one party this device is in, kept outside React so it survives moving between screens. A party stays up while
 * the app is open; an online party is picked up again after a reload.
 */
/** A party game kept running while its screen is closed, so leaving it never drops you out. */
export interface KeptGame { key: string; game: string; href: string; host: boolean }
interface KeptEntry extends KeptGame { obj: unknown; end: () => void; timer?: ReturnType<typeof setInterval> }

class PartyStore {
  private kept = new Map<string, KeptEntry>();
  private keptView: KeptGame | null = null;

  /**
   * The party game for `key`: the one already running, or a new one from `make`. Only one party game runs at a time, so
   * starting another ends the last. `tick` keeps a hosted game moving (bots, turn limits) while nobody is looking at it.
   */
  keep<T>(info: KeptGame, make: () => T, end: (t: T) => void, tick?: (t: T) => void): { obj: T; fresh: boolean } {
    const had = this.kept.get(info.key);
    if (had) return { obj: had.obj as T, fresh: false };
    for (const k of [...this.kept.keys()]) this.release(k);
    const obj = make();
    const entry: KeptEntry = { ...info, obj, end: () => end(obj), timer: tick ? setInterval(() => tick(obj), 1000) : undefined };
    this.kept.set(info.key, entry);
    this.keptView = { key: info.key, game: info.game, href: info.href, host: info.host };
    this.set({});
    return { obj, fresh: true };
  }

  /** Ends a kept game for good (the room was ended, the seat given up, or the party is over). */
  release(key: string) {
    const e = this.kept.get(key);
    if (!e) return;
    this.kept.delete(key);
    clearInterval(e.timer);
    try { e.end(); } catch { /* already gone */ }
    if (this.keptView?.key === key) this.keptView = null;
    // the leader's room is gone: members should not be sent to it any more
    const p = this.v.party;
    if (e.host && p?.leader && p.status !== "closed") (p as PartyLeader).setRoom(null);
    this.set({});
  }

  /** The party game running in the background, if any: where to go to get back to it. */
  keptGame = () => this.keptView;

  private v: PartyView = { party: null, mode: null, busy: false, error: "", desk: null, rev: 0 };
  private subs = new Set<() => void>();
  private ep: Endpoint | null = null;
  private offParty?: () => void;
  /** The room code the leader uses for each game, chosen once so members can be told it. */
  private rooms = new Map<string, string>();
  private restored = false;

  get = () => this.v;
  subscribe = (cb: () => void) => { this.subs.add(cb); return () => { this.subs.delete(cb); }; };
  private set(p: Partial<PartyView>) { this.v = { ...this.v, ...p, rev: this.v.rev + 1 }; this.subs.forEach(cb => cb()); }

  /** The room code the leader's game room uses for this game. */
  roomCodeFor(game: string) { let c = this.rooms.get(game); if (!c) { c = newRoomCode(); this.rooms.set(game, c); } return c; }

  async startOnline(me: Me) {
    if (this.v.party || this.v.busy) return;
    this.set({ busy: true, error: "", mode: "online" });
    const saved = readJSON<{ role: string; code: string; at: number } | null>(SAVE_KEY, null);
    const reuse = saved?.role === "leader" && Date.now() - saved.at < SAVE_MAX_MS ? saved.code : null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = attempt === 0 && reuse ? reuse : newRoomCode();
      try {
        const ep = await defaultNetwork().open(partyAddress(code));
        const leader = new PartyLeader(me, code);
        ep.onIncoming(l => leader.addLink(l));
        this.ep = ep;
        this.adopt(leader, "online");
        writeJSON(SAVE_KEY, { role: "leader", code, at: Date.now() });
        return;
      } catch (e) {
        // our own earlier party may still hold the address for a moment after a reload
        if (e instanceof TransportError && e.kind === "unavailable-id") { await new Promise(r => setTimeout(r, attempt === 0 && reuse ? 2500 : 200)); continue; }
        break;
      }
    }
    this.set({ busy: false, mode: null, error: "Could not start a party. Check your connection and try again." });
  }

  async joinOnline(me: Me, code: string) {
    if (this.v.party || this.v.busy) return;
    this.set({ busy: true, error: "", mode: "online" });
    try {
      const ep = await defaultNetwork().open(`${partyAddress(code)}-${me.id.slice(0, 10).replace(/[^A-Za-z0-9]/g, "")}${Math.floor(Math.random() * 1e4)}`);
      this.ep = ep;
      const link = await ep.dial(partyAddress(code));
      this.adopt(new PartyMember(me, link, code), "online");
      writeJSON(SAVE_KEY, { role: "member", code, at: Date.now() });
    } catch (e) {
      this.ep?.close(); this.ep = null;
      const msg = e instanceof TransportError && e.kind === "peer-unavailable"
        ? "No party with that code is open right now. Check the code, and that the leader still has the app open."
        : "Could not reach the party. Check your connection and try again.";
      this.set({ busy: false, mode: null, error: msg });
    }
  }

  async startNearby(me: Me) {
    if (this.v.party || this.v.busy) return;
    const net = new ManualNetwork();
    const leader = new PartyLeader(me, "NEARBY", { requireCode: false });
    const ep = await net.open("party");
    ep.onIncoming(l => leader.addLink(l));
    this.ep = ep;
    this.adopt(leader, "nearby", net.desk);
  }

  /** Shows the pairing screen; the party starts once the notes have been swapped with the leader. */
  async joinNearby(me: Me) {
    if (this.v.party || this.v.busy) return;
    const net = new ManualNetwork();
    const ep = await net.open("guest");
    this.ep = ep;
    this.set({ busy: true, error: "", mode: "nearby", desk: net.desk });
    ep.dial("party").then(link => { if (this.ep === ep) this.adopt(new PartyMember(me, link, "NEARBY"), "nearby", net.desk); })
      .catch(() => { if (this.ep === ep) this.set({ busy: false }); });
  }

  /** The leader adds someone who accepted a nearby invite (Android app, no QR codes needed). */
  addLink(link: Link) {
    const p = this.v.party;
    if (p?.leader && p.status !== "closed") (p as PartyLeader).addLink(link); else link.close();
  }

  /** Joins a party over a connection from an accepted nearby invite. Leaves any party this phone was in. */
  joinWithLink(me: Me, link: Link, code: string) {
    if (this.v.party) this.leave();
    this.adopt(new PartyMember(me, link, code), "nearby");
  }

  /** Leaves (or, for the leader, ends) the party. */
  leave() {
    for (const k of [...this.kept.keys()]) this.release(k);
    this.offParty?.(); this.offParty = undefined;
    this.v.party?.close();
    this.v.desk?.close();
    this.ep?.close(); this.ep = null;
    this.rooms.clear();
    removeKey(SAVE_KEY);
    this.set({ party: null, mode: null, busy: false, desk: null, error: "" });
  }

  /** Cancels a nearby join that is still pairing. */
  cancel() { if (!this.v.party) this.leave(); }

  /** After a reload: an online party this device was in a moment ago is opened or rejoined. */
  restore(me: Me) {
    if (this.restored || this.v.party) return;
    this.restored = true;
    const s = readJSON<{ role: string; code: string; at: number } | null>(SAVE_KEY, null);
    if (!s || Date.now() - s.at > SAVE_MAX_MS) return;
    if (s.role === "leader") void this.startOnline(me); else void this.joinOnline(me, s.code);
  }

  private adopt(p: Party, mode: PartyMode, desk: NearbyDesk | null = null) {
    this.offParty?.();
    this.offParty = p.subscribe(() => {
      if (p.status === "closed" && this.v.party === p) {
        const error = p.error ?? "";
        for (const k of [...this.kept.keys()]) this.release(k);
        this.offParty?.(); this.offParty = undefined;
        this.v.desk?.close(); this.ep?.close(); this.ep = null; this.rooms.clear();
        removeKey(SAVE_KEY);
        this.set({ party: null, mode: null, busy: false, desk: null, error });
        return;
      }
      if (mode === "online") writeJSON(SAVE_KEY, { role: p.leader ? "leader" : "member", code: (p as PartyLeader | PartyMember).code, at: Date.now() });
      this.set({});
    });
    this.set({ party: p, mode, busy: false, error: "", desk });
  }
}

export const partyStore = new PartyStore();
