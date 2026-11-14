import { readJSON } from "../client/storage";
import { PeerNetwork } from "./peerTransport";
import { SignalNetwork } from "./signalTransport";
import { FallbackNetwork } from "./fallbackNetwork";
import type { Network } from "./transport";

export type Signaling = "peerjs" | "vercel" | "auto";

/**
 * How rooms pair: through both the public PeerJS service and this app's own endpoint on Vercel at once ("auto", the default),
 * so one being down or over its limit does not stop play; or through just one of them.
 * The build variable NEXT_PUBLIC_SIGNALING can force "peerjs" or "vercel"; a device can override it (for trying it out) by storing "auto", "vercel" or "peerjs" under "net-signaling".
 */
export const signalingMode = (): Signaling => {
  const o = readJSON<string | null>("net-signaling", null);
  if (o === "vercel" || o === "peerjs" || o === "auto") return o;
  const v = process.env.NEXT_PUBLIC_SIGNALING;
  return v === "vercel" || v === "peerjs" ? v : "auto";
};

// One shared instance, so the memory of which service worked last carries from one room to the next.
let shared: Network | undefined;
export const defaultNetwork = (): Network => {
  const m = signalingMode();
  if (m === "vercel") return new SignalNetwork();
  if (m === "peerjs") return new PeerNetwork();
  return (shared ??= new FallbackNetwork([new PeerNetwork(), new SignalNetwork()]));
};
