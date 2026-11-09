import { collect, owns, register, send, setAllowed, type MailStore } from "./server";
import { dropSub, notifyInvite, parseSub, saveSub, vapidPublicKey, type PushSender } from "./push";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** One endpoint, four operations. Without a Blob store the mailbox is simply off and the app carries on without it. */
export async function handleMailbox(req: Request, s: MailStore | null, pusher: () => Promise<PushSender | null> = async () => null): Promise<Response> {
  if (!s) return json({ error: "disabled" }, 503);
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4096) return json({ error: "too large" }, 413);
    body = JSON.parse(text);
  } catch { return json({ error: "bad request" }, 400); }
  try {
    switch (body.op) {
      case "register": { const r = await register(s, String(body.code), body.key); return json({ result: r }, r === "ok" ? 200 : r === "taken" ? 409 : 400); }
      case "allow": { const r = await setAllowed(s, String(body.code), body.key, body.from); return json({ result: r }, r === "ok" ? 200 : r === "denied" ? 403 : 400); }
      case "vapid": return json({ key: vapidPublicKey() });
      case "push": {
        if (!(await owns(s, String(body.code), body.key))) return json({ error: "denied" }, 403);
        const sub = parseSub(body.sub);
        if (!sub) return json({ error: "bad subscription" }, 400);
        await saveSub(s, String(body.code), sub);
        return json({ result: "ok" });
      }
      case "unpush": {
        if (!(await owns(s, String(body.code), body.key))) return json({ error: "denied" }, 403);
        await dropSub(s, String(body.code));
        return json({ result: "ok" });
      }
      case "send": {
        const r = await send(s, body.to, body.msg, Date.now());
        // the invite is safely queued; now wake the friend's device if it has asked to be woken
        if (r === "ok") {
          const m = body.msg as { t?: string; name?: string; game?: string } | undefined;
          if (m?.t === "invite") await notifyInvite(s, await pusher().catch(() => null), String(body.to), { name: String(m.name ?? ""), game: String(m.game ?? "") }).catch(() => undefined);
        }
        return json({ result: r }, r === "ok" ? 200 : r === "unknown" ? 404 : r === "refused" ? 403 : r === "full" ? 429 : 400);
      }
      case "fetch": { const r = await collect(s, String(body.code), body.key, Date.now()); return r.ok ? json({ msgs: r.msgs }) : json({ error: "denied" }, 403); }
      default: return json({ error: "unknown operation" }, 400);
    }
  } catch { return json({ error: "mailbox unavailable" }, 502); }
}
