import { blobConfigured, blobMailStore } from "@/lib/mailbox/blobStore";
import { handleMailbox } from "@/lib/mailbox/handler";
import { webPushSender } from "@/lib/mailbox/push";
import { preflight, withCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

export async function POST(req: Request) {
  return withCors(req, await handleMailbox(req, blobConfigured() ? blobMailStore() : null, webPushSender));
}
