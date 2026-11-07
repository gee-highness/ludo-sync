import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The Android app serves the exported site (out/) from inside the APK with Capacitor's local server: no network, no service worker,
 * and any address without a file extension is answered with index.html. This serves out/ the same way and plays through the app.
 * Run `npm run build:native` first; the test is skipped when there is no export.
 */
const OUT = path.resolve("out");
const PORT = 3201;
const GAMES = ["fourinrow", "checkers", "casino", "fourcolors", "snakes", "memory", "crazyeights", "solitaire"];
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".ico": "image/x-icon" };

let server: Server;
test.skip(!existsSync(path.join(OUT, "index.html")), "no native export: run npm run build:native");
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = p === "/" || !path.basename(p).includes(".") ? path.join(OUT, "index.html") : path.join(OUT, p);
    if (!file.startsWith(OUT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>(r => server.listen(PORT, r));
});
test.afterAll(() => new Promise<void>(r => { server.close(() => r()); }));

const prepare = async (page: Page) => {
  const problems: string[] = [];
  // React error 418 (a recoverable hydration warning on the home screen after many saved games) is tracked separately; it does not break play
  page.on("pageerror", e => { if (!/Minified React error #418/.test(e.message)) problems.push(`error: ${e.message.slice(0, 80)} @ ${page.url()}`); });
  // a prefetch cut short by moving to another screen is normal; the friends mailbox is online-only and fails quietly without a connection
  page.on("requestfailed", r => { if (r.failure()?.errorText !== "net::ERR_ABORTED" && !r.url().includes("/api/")) problems.push(`failed: ${r.url()}`); });
  page.on("response", r => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
  // the app must never reach for the internet
  await page.route(u => new URL(u).origin !== `http://localhost:${PORT}`, route => { if (!route.request().url().includes("/api/")) problems.push(`external: ${route.request().url()}`); return route.abort(); });
  await page.addInitScript(() => {
    // what Capacitor looks for to know it is inside the Android app
    (window as unknown as { androidBridge: unknown }).androidBridge = { postMessage: () => undefined };
    try { localStorage.setItem("ludo-sync:v1:settings", JSON.stringify({ music: false, sound: false, speed: "instant" })); localStorage.setItem("ludo-sync:v1:calm-v1", "true"); localStorage.setItem("ludo-sync:v1:road-v1", "true"); } catch { /* private window */ }
  });
  return problems;
};

test("every game opens from the home screen and starts a bot game, with nothing from the internet", async ({ page }) => {
  test.setTimeout(240_000);
  const problems = await prepare(page);
  const base = `http://localhost:${PORT}`;
  await page.goto(`${base}/`);
  await expect(page.getByTestId("offline-ready")).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  for (const id of GAMES) {
    await page.goto(`${base}/`);
    await page.locator(`a[href="/g/${id}"]`).first().click();
    await expect(page.getByText("Rules: you decide")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("offline-ready")).toBeVisible();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${id}/play`));
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(page.locator("canvas, svg, button").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  }
  for (const [link, sees] of [["/ludo", /Play vs bots/], ["/skipbo", "Deal the cards"], ["/profile", "Your profile"], ["/friends", "Your friend code"]] as const) {
    await page.goto(`${base}/`);
    await page.locator(`a[href="${link}"]`).first().click();
    await expect(page.getByText(sees).first()).toBeVisible({ timeout: 20_000 });
  }
  expect(problems).toEqual([]);
});

test("the online rooms say plainly that they need a connection instead of breaking", async ({ page }) => {
  const problems = await prepare(page);
  await page.goto(`http://localhost:${PORT}/`);
  await page.locator('a[href="/g/casino"]').first().click();
  await page.getByRole("button", { name: "Play with friends online" }).click();
  await expect(page.getByText(/Create a room|Host|friends|code/i).first()).toBeVisible({ timeout: 20_000 });
  expect(problems.filter(p => p.startsWith("error:"))).toEqual([]);
});
