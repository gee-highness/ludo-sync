import { handleSignal } from "@/lib/signal/handler";
import { signalStoreFromEnv } from "@/lib/signal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleSignal(req, signalStoreFromEnv());
}

/** Lets the app (and you) see whether pairing is switched on, without changing anything. */
export async function GET() {
  return new Response(JSON.stringify({ enabled: signalStoreFromEnv() !== null }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
