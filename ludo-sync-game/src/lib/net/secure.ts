import {
  SecureReceiver, SecureSender, ecdh, frame, fromUtf8, generateKeyPair, hkdf, importAesKey, utf8, validPub,
} from "./crypto";
import type { Link } from "./transport";

export type Role = "guest" | "host";

const HANDSHAKE_MS = 15_000;
const MAX_MESSAGE_BYTES = 256 * 1024;

/**
 * An encrypted, ordered message pipe over a raw link. The guest sends its fresh public key, the host answers with
 * its own, and both derive the same keys plus six check digits to read out loud. Everything after that is AES-GCM.
 */
export class SecureChannel {
  /** Six digits both players should see; set once the handshake finishes. */
  check = "";
  private onMsg?: (m: unknown) => void;
  private onShut?: () => void;
  private sender?: SecureSender;
  private receiver?: SecureReceiver;
  private ready?: () => void;
  private failed?: (e: Error) => void;
  private myKeys?: Awaited<ReturnType<typeof generateKeyPair>>;
  private inChain: Promise<void> = Promise.resolve();
  private outChain: Promise<void> = Promise.resolve();
  private shut = false;

  constructor(readonly link: Link, readonly role: Role) {
    link.onMessage(data => {
      this.inChain = this.inChain.then(() => this.handle(data)).catch(() => this.close());
    });
    // a close that arrives behind queued messages must not overtake them
    link.onClose(() => { this.inChain = this.inChain.then(() => this.shutdown()); });
  }

  get open() { return !this.shut && this.link.open; }
  get established() { return !!this.sender; }

  onMessage(cb: (m: unknown) => void) { this.onMsg = cb; }
  onClose(cb: () => void) { this.onShut = cb; if (this.shut) cb(); }

  /** Resolves once keys are agreed; rejects on timeout or a bad peer. */
  handshake(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error("handshake timeout")); this.close(); }, HANDSHAKE_MS);
      this.ready = () => { clearTimeout(timer); resolve(); };
      this.failed = e => { clearTimeout(timer); reject(e); this.close(); };
      if (this.role === "guest") {
        generateKeyPair().then(k => {
          this.myKeys = k;
          this.link.send(JSON.stringify({ t: "hello", pub: k.pub }));
        }).catch(e => this.failed?.(e));
      }
    });
  }

  private async handle(data: Uint8Array | string) {
    if (this.shut) return;
    if (typeof data === "string") {
      if (this.sender) return this.close();
      let msg: { t?: unknown; pub?: unknown };
      try { msg = JSON.parse(data); } catch { return this.failed?.(new Error("bad handshake")); }
      if (!validPub(msg.pub)) return this.failed?.(new Error("bad key"));
      if (this.role === "host" && msg.t === "hello" && !this.myKeys) {
        this.myKeys = await generateKeyPair();
        this.link.send(JSON.stringify({ t: "welcome", pub: this.myKeys.pub }));
        await this.derive(this.myKeys.pub, msg.pub);
      } else if (this.role === "guest" && msg.t === "welcome" && this.myKeys) {
        await this.derive(msg.pub, this.myKeys.pub);
      } else {
        this.failed?.(new Error("unexpected handshake"));
      }
      return;
    }
    if (!this.receiver) return this.close();
    if (data.length > MAX_MESSAGE_BYTES) return this.close();
    const plain = await this.receiver.open(data);
    this.onMsg?.(JSON.parse(fromUtf8(plain)));
  }

  private async derive(hostPub: string, guestPub: string) {
    const shared = await ecdh(this.myKeys!.priv, this.role === "host" ? guestPub : hostPub);
    const salt = frame(hostPub, guestPub);
    const keys = await hkdf(shared, salt, "ludo-keys", 64);
    const guestToHost = await importAesKey(keys.slice(0, 32));
    const hostToGuest = await importAesKey(keys.slice(32));
    const digits = new DataView((await hkdf(shared, salt, "ludo-check", 4)).buffer).getUint32(0) % 1_000_000;
    this.check = String(digits).padStart(6, "0");
    if (this.role === "guest") {
      this.sender = new SecureSender(guestToHost, 1);
      this.receiver = new SecureReceiver(hostToGuest, 2);
    } else {
      this.sender = new SecureSender(hostToGuest, 2);
      this.receiver = new SecureReceiver(guestToHost, 1);
    }
    this.ready?.();
  }

  /** Queues a message; order is kept even though encryption is asynchronous. */
  send(msg: unknown) {
    if (!this.open || !this.sender) return;
    const sender = this.sender;
    const bytes = utf8(JSON.stringify(msg));
    this.outChain = this.outChain.then(async () => {
      if (!this.open) return;
      this.link.send(await sender.seal(bytes));
    }).catch(() => this.close());
  }

  /** Lets queued messages go out, then closes. */
  closeAfterSend() {
    this.outChain = this.outChain.then(() => this.close());
  }

  close() {
    if (this.shut) return;
    try { this.link.close(); } catch { /* already gone */ }
    this.shutdown();
  }

  private shutdown() {
    if (this.shut) return;
    this.shut = true;
    this.failed?.(new Error("closed"));
    this.onShut?.();
  }
}
