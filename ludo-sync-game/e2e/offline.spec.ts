import { expect, test, type Locator, type Page } from "@playwright/test";

const ROUTES: { path: string; sees: RegExp | string | ((page: Page) => Locator) }[] = [
  { path: "/", sees: "Ludo Sync" },
  { path: "/ludo", sees: /Play vs bots/ },
  { path: "/play?preset=bot&quick=1", sees: p => p.getByRole("button", { name: "Roll the dice" }) },
  { path: "/play?preset=local", sees: /Start|Players|Play/ },
  { path: "/skipbo", sees: "Deal the cards" },
  { path: "/skipbo/play?name=Off&bots=1&level=easy&mode=quick&stock=10", sees: /your turn|thinking/ },
  { path: "/skipbo/learn", sees: "Step 1 of" },
  { path: "/profile", sees: "Your profile" },
  { path: "/pieces", sees: "Piece maker" },
  { path: "/island", sees: /Island/ },
  { path: "/garage", sees: /Garage|achievements/i },
  { path: "/nearby", sees: /Host a nearby game/ },
  { path: "/skipbo/nearby", sees: /Host a nearby game/ },
  { path: "/online", sees: "You are offline" },
  { path: "/skipbo/online", sees: "You are offline" },
  { path: "/g/fourinrow", sees: "Rules: you decide" },
  { path: "/g/fourinrow/online", sees: "You are offline" },
  { path: "/g/casino", sees: "Rules: you decide" },
  { path: "/g/fourcolors", sees: "Rules: you decide" },
  { path: "/g/snakes", sees: "Rules: you decide" },
  { path: "/g/memory", sees: "Rules: you decide" },
];

test("every game opens, and can be played, with no connection after one visit", async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ludo-sync:v1:settings", JSON.stringify({ music: false, sound: false, speed: "instant" }));
      localStorage.setItem("ludo-sync:v1:calm-v1", "true");
      localStorage.setItem("ludo-sync:v1:road-v1", "true");
    } catch { /* private window */ }
  });
  await page.goto("/");
  // the whole app is stored while the connection is still there
  await expect(page.getByTestId("offline-ready")).toBeVisible({ timeout: 120_000 });

  await context.setOffline(true);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  for (const r of ROUTES) {
    await page.goto(r.path, { waitUntil: "domcontentloaded" });
    const loc = typeof r.sees === "function" ? r.sees(page) : page.getByText(r.sees).first();
    await expect(loc, `${r.path} offline`).toBeVisible({ timeout: 30_000 });
  }

  // a Ludo bot game and a Skip-Bo game both take turns with no network
  await page.goto("/play?preset=bot&quick=1");
  await page.getByRole("button", { name: "Roll the dice" }).click();
  await page.goto("/skipbo/play?name=Off&bots=1&level=easy&mode=quick&stock=10");
  await expect(page.getByText("· your turn").or(page.getByText("is thinking"))).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 40; i++) {
    if (await page.getByText("· your turn").count()) break;
    await page.waitForTimeout(150);
  }
  await page.locator('[aria-label^="Hand card 1"]').click();
  await page.locator('[aria-label^="Discard pile 1"]').click();
  await expect(page.locator('[aria-label^="Discard pile 1, top card"]')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("the 3D tables load from the stored copy with no connection", async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ludo-sync:v1:settings", JSON.stringify({ music: false, sound: false, speed: "instant", renderer: "3d", quality: "medium", camera: "tilt" }));
      localStorage.setItem("ludo-sync:v1:calm-v1", "true");
      localStorage.setItem("ludo-sync:v1:road-v1", "true");
    } catch { /* private window */ }
  });
  await page.goto("/");
  await expect(page.getByTestId("offline-ready")).toBeVisible({ timeout: 120_000 });
  await context.setOffline(true);
  await page.goto("/skipbo/play?name=Off&bots=1&level=easy&mode=quick&stock=10");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 40_000 });
  await page.goto("/play?preset=bot&quick=1");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 40_000 });
});
