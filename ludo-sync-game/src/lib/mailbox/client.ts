import { apiUrl } from "../native";
import { randomBytes, toB64 } from "../net/crypto";
import type { FMsg } from "../friends/protocol";
import { FRIEND_PROTOCOL } from "../friends/protocol";
import type { FriendsStore } from "../friends/store";

export interface MailApi { post(body: unknown): Promise<{ status: number; body: unknown } | null> }
export type QueueResult = "queued" | "unknown" | "refused" | "failed";

/** What the friends service needs from a mailbox. */
export interface MailboxLike {
  ensure(): Promise<boolean>;
  setAllowed(codes: string[]): Promise<void>;
  send(to: string, msg: FMsg): Promise<QueueResult>;
  fetch(): Promise<unknown[] | null>;
}

export const fetchMailApi = (url = apiUrl("/api/mailbox")): MailApi => ({
  post: async body => {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      let b: unknown = null;
      try { b = await r.json(); } catch { /* no body */ }
      return { status: r.status, body: b };
    } catch { return null; }
  },
});

const newKey = () => toB64(randomBytes(24)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Talks to the mailbox on the server. If the server has no Blob store set up, or does not know this code, it turns itself off and the app works as before. */
export class MailboxClient implements MailboxLike {
  private state: "unknown" | "on" | "off" = "unknown";
  constructor(private api: MailApi, private store: FriendsStore, private code: string) {}

  private key(): string {
    const saved = this.store.get<string | null>("mailbox-key", null);
    if (typeof saved === "string" && saved.length >= 16) return saved;
    const k = newKey();
    this.store.set("mailbox-key", k);
    return k;
  }

  get enabled() { return this.state === "on"; }

  async ensure(): Promise<boolean> {
    if (this.state !== "unknown") return this.state === "on";
    const r = await this.api.post({ op: "register", code: this.code, key: this.key() });
    if (!r) return false; // no connection yet: try again later
    this.state = r.status === 200 ? "on" : "off";
    return this.state === "on";
  }

  async setAllowed(codes: string[]) { if (this.state === "on") await this.api.post({ op: "allow", code: this.code, key: this.key(), from: codes }); }

  async send(to: string, msg: FMsg): Promise<QueueResult> {
    if (!(await this.ensure())) return "failed";
    const r = await this.api.post({ op: "send", to, msg: { v: FRIEND_PROTOCOL, ...msg } });
    return !r ? "failed" : r.status === 200 ? "queued" : r.status === 404 ? "unknown" : r.status === 403 ? "refused" : "failed";
  }

  async fetch(): Promise<unknown[] | null> {
    if (!(await this.ensure())) return null;
    const r = await this.api.post({ op: "fetch", code: this.code, key: this.key() });
    const msgs = (r?.body as { msgs?: unknown } | null)?.msgs;
    return r?.status === 200 && Array.isArray(msgs) ? msgs : null;
  }
}
