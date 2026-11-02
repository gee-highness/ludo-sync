import { close, open, poll, present, send, type SignalStore } from "./server";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** The pairing endpoint: open, poll, send, close, present. Off (503) until a store is connected. */
export async function handleSignal(req: Request, store: SignalStore | null): Promise<Response> {
  if (!store) return json({ error: "disabled" }, 503);
  let b: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 20_000) return json({ error: "too large" }, 413);
    b = JSON.parse(text);
  } catch { return json({ error: "bad request" }, 400); }
  try {
    switch (b.op) {
      case "open": { const r = await open(store, b.id, b.token); return json({ result: r }, r === "ok" ? 200 : r === "taken" ? 409 : 400); }
      case "poll": { const r = await poll(store, b.id, b.token); return r.ok ? json({ msgs: r.msgs }) : json({ error: "denied" }, 403); }
      case "send": { const r = await send(store, b.from, b.token, b.to, b.msg); return json({ result: r }, r === "ok" ? 200 : r === "gone" ? 404 : r === "denied" ? 403 : r === "limited" ? 429 : 400); }
      case "present": return json({ present: await present(store, b.id) });
      case "close": return json({ ok: await close(store, b.id, b.token) });
      default: return json({ error: "unknown operation" }, 400);
    }
  } catch { return json({ error: "pairing unavailable" }, 502); }
}
