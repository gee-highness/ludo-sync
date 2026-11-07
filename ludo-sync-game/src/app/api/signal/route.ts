import { handleSignal } from "@/lib/signal/handler";
import { signalStoreFromEnv } from "@/lib/signal/server";
import { preflight, withCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

export async function POST(req: Request) {
  return withCors(req, await handleSignal(req, signalStoreFromEnv()));
}

/** Lets the app (and you) see whether pairing is switched on, without changing anything. */
export async function GET(req: Request) {
  return withCors(req, new Response(JSON.stringify({ enabled: signalStoreFromEnv() !== null }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
}
