import { readdirSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

const listPublic = (dir: string): string[] => {
  try {
    return readdirSync(path.join(process.cwd(), "public", dir)).map(f => `/${dir}/${f}`);
  } catch { return []; }
};

/** The service worker, generated per build so its caches are versioned and the model list stays current. */
export function GET() {
  const version = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
  const shell = ["/", "/play", "/manifest.json", "/icon.svg", ...listPublic("icons")];
  const models = listPublic("models");
  const body = `
const VERSION = ${JSON.stringify(version)};
const SHELL = "ludo-shell-" + VERSION;
const ASSETS = "ludo-assets-" + VERSION;
const SHELL_URLS = ${JSON.stringify(shell)};
const MODEL_URLS = ${JSON.stringify(models)};

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // one missing file must not break installation
    await Promise.all(SHELL_URLS.map(u => shell.add(u).catch(() => undefined)));
    const assets = await caches.open(ASSETS);
    await Promise.all(MODEL_URLS.map(u => assets.add(u).catch(() => undefined)));
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("ludo-") && key !== SHELL && key !== ASSETS) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "WARM" && Array.isArray(data.urls)) {
    event.waitUntil(caches.open(ASSETS).then(c => Promise.all(
      data.urls.filter(u => typeof u === "string" && u.startsWith("/")).map(u => c.match(u).then(hit => hit || c.add(u)).catch(() => undefined))
    )));
  }
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const c = await caches.open(SHELL); c.put(url.pathname, res.clone()).catch(() => undefined); }
        return res;
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match(url.pathname)) || (await c.match("/play")) || (await c.match("/")) || Response.error();
      }
    })());
    return;
  }

  // hashed build files, models and icons never change under the same URL: cache first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/models/") || url.pathname.startsWith("/icons/")) {
    event.respondWith((async () => {
      const c = await caches.open(ASSETS);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone()).catch(() => undefined);
      return res;
    })());
  }
});
`;
  return new Response(body, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
}
