import { readdirSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

const listPublic = (dir: string): string[] => {
  try {
    return readdirSync(path.join(process.cwd(), "public", dir)).map(f => `/${dir}/${f}`);
  } catch { return []; }
};

/** Every script, style and font of this build, so a game opened for the first time with no connection still has all its code. */
const listBuilt = (): string[] => {
  const root = path.join(process.cwd(), ".next", "static");
  const out: string[] = [];
  const walk = (dir: string, url: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${url}/${e.name}`);
      else if (!e.name.endsWith(".map")) out.push(`${url}/${e.name}`);
    }
  };
  walk(root, "/_next/static");
  return out;
};

/** Every screen of the app: all of them are prerendered pages that need no server to show. */
const PAGES = ["/", "/ludo", "/play", "/online", "/nearby", "/garage", "/pieces", "/island", "/profile", "/skipbo", "/skipbo/play", "/skipbo/online", "/skipbo/nearby", "/skipbo/learn"];

/** The service worker, generated per build so its caches are versioned and the model list stays current. */
export function GET() {
  const version = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
  const shell = [...PAGES, "/manifest.json", "/icon.svg"];
  const assets = [...listBuilt(), ...listPublic("icons"), ...listPublic("models")];
  const body = `
const VERSION = ${JSON.stringify(version)};
const SHELL = "ludo-shell-" + VERSION;
const ASSETS = "ludo-assets-" + VERSION;
const SHELL_URLS = ${JSON.stringify(shell)};
const ASSET_URLS = ${JSON.stringify(assets)};

const tell = async msg => {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
};

/** Fetches a list in small groups, so a slow connection is not flooded and a game being played on the first visit is not slowed, counting as it goes. */
const fill = async (cache, urls, offset) => {
  let done = 0;
  for (let i = 0; i < urls.length; i += 4) {
    await Promise.all(urls.slice(i, i + 4).map(async u => {
      // one missing file must not break installation; a file that is already there is not fetched again
      try { if (!(await cache.match(u))) await cache.add(u); done++; } catch { /* retried when the app next opens */ }
    }));
    tell({ type: "OFFLINE_PROGRESS", done: offset + done, total: SHELL_URLS.length + ASSET_URLS.length });
  }
};

/** The app is complete offline when every page and every file of this build is in the caches. */
const status = async () => {
  const shell = await caches.open(SHELL), assets = await caches.open(ASSETS);
  let have = 0;
  for (const u of SHELL_URLS) if (await shell.match(u)) have++;
  for (const u of ASSET_URLS) if (await assets.match(u)) have++;
  const total = SHELL_URLS.length + ASSET_URLS.length;
  return { type: "OFFLINE_STATUS", have, total, ready: have === total };
};

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await fill(await caches.open(SHELL), SHELL_URLS, 0);
    // the page that is already open comes first; the rest of the app is stored a moment later
    await new Promise(r => setTimeout(r, 1500));
    await fill(await caches.open(ASSETS), ASSET_URLS, SHELL_URLS.length);
    tell(await status());
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
  if (data.type === "OFFLINE_CHECK") {
    // fill in anything that did not make it the first time (a dropped connection during install), then report
    event.waitUntil((async () => {
      const shell = await caches.open(SHELL), assets = await caches.open(ASSETS);
      await fill(shell, SHELL_URLS, 0);
      await fill(assets, ASSET_URLS, SHELL_URLS.length);
      tell(await status());
    })());
  }
  if (data.type === "OFFLINE_STATUS_REQUEST") event.waitUntil(status().then(tell));
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
        // a page that was never opened (or an old link) still gets the app, which then shows its own not-found screen
        return (await c.match(url.pathname)) || (await c.match(url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname))|| (await c.match("/")) || Response.error();
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
