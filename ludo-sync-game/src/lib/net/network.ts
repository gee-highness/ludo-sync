import { readJSON } from "../client/storage";
import { PeerNetwork } from "./peerTransport";
import { SignalNetwork } from "./signalTransport";
import type { Network } from "./transport";

export type Signaling = "peerjs" | "vercel";

/**
 * How rooms pair: through the public PeerJS service (the default), or through this app's own endpoint on Vercel.
 * Switched on by the build variable NEXT_PUBLIC_SIGNALING=vercel; a device can override it (for trying it out) by storing "vercel" or "peerjs" under "net-signaling".
 */
export const signalingMode = (): Signaling => {
  const o = readJSON<string | null>("net-signaling", null);
  if (o === "vercel" || o === "peerjs") return o;
  return process.env.NEXT_PUBLIC_SIGNALING === "vercel" ? "vercel" : "peerjs";
};

export const defaultNetwork = (): Network => (signalingMode() === "vercel" ? new SignalNetwork() : new PeerNetwork());
