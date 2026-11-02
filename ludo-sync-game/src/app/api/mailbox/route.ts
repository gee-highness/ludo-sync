import { blobConfigured, blobMailStore } from "@/lib/mailbox/blobStore";
import { handleMailbox } from "@/lib/mailbox/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleMailbox(req, blobConfigured() ? blobMailStore() : null);
}
