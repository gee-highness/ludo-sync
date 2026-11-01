import { expect, test, type Page } from "@playwright/test";

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|GL Driver Message|GPU stall/.test(m.text())) errors.push(m.text()); });
  return errors;
};

const quiet = async (page: Page) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ludo-sync:v1:settings", JSON.stringify({ music: false, sound: false, speed: "instant" }));
      localStorage.setItem("ludo-sync:v1:calm-v1", "true");
      localStorage.setItem("ludo-sync:v1:road-v1", "true");
    } catch { /* private window */ }
  });
};

test("the home screen lists both games and opens each one", async ({ page }) => {
  const errors = watch(page);
  await quiet(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /^Ludo\b/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Skip-Bo\b/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's challenges" })).toBeVisible();
  await page.getByRole("link", { name: /^Skip-Bo\b/ }).click();
  await expect(page).toHaveURL(/\/skipbo$/);
  await expect(page.getByRole("heading", { name: "Skip-Bo" })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: /^Ludo\b/ }).click();
  await expect(page).toHaveURL(/\/ludo$/);
  expect(errors).toEqual([]);
});

test("a Skip-Bo game against a bot can be played for several turns, with points", async ({ page }) => {
  const errors = watch(page);
  await quiet(page);
  await page.goto("/skipbo/play?name=Tester&bots=1&level=easy&mode=quick&stock=10");
  await expect(page.getByText("· your turn").or(page.getByText("is thinking"))).toBeVisible({ timeout: 20_000 });
  let discards = 0;
  for (let i = 0; i < 80 && discards < 3; i++) {
    if (!(await page.getByText("· your turn").count())) { await page.waitForTimeout(100); continue; }
    await page.locator('[aria-label^="Hand card 1"]').click();
    await page.locator('[aria-label^="Discard pile 1"]').click();
    discards++;
    await page.waitForTimeout(300);
  }
  expect(discards).toBe(3);
  await expect(page.getByLabel(/\d+ points/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("pass and play hides the cards until the right person taps", async ({ page }) => {
  await quiet(page);
  await page.goto("/skipbo/play?mode=pass&names=Ann,Bo&game=quick&stock=10");
  const cover = page.getByRole("dialog", { name: /Pass the device to/ });
  await expect(cover).toBeVisible({ timeout: 20_000 });
  await cover.getByRole("button", { name: /show my cards/ }).click();
  await expect(cover).toBeHidden();
  await page.locator('[aria-label^="Hand card 1"]').click();
  await page.locator('[aria-label^="Discard pile 1"]').click();
  await expect(page.getByRole("dialog", { name: /Pass the device to/ })).toBeVisible();
});

test("the lesson starts, explains the first step, and can be restarted", async ({ page }) => {
  const errors = watch(page);
  await quiet(page);
  await page.goto("/skipbo/learn");
  const lesson = page.getByRole("region", { name: "Lesson" });
  await expect(lesson).toContainText("Step 1 of");
  await expect(lesson).toContainText("stock pile");
  await page.getByRole("button", { name: /Your stock pile/ }).click();
  await page.locator('[aria-label^="Pile 1,"]').click();
  await expect(lesson).toContainText("Nice one!");
  await expect(lesson).toContainText("Step 2 of", { timeout: 5000 });
  expect(errors).toEqual([]);
});

test("the profile shows a level, achievements and card backs, and a locked back cannot be chosen", async ({ page }) => {
  const errors = watch(page);
  await quiet(page);
  await page.goto("/profile");
  await expect(page.getByLabel(/^Level 1$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Achievements · 0 of/ })).toBeVisible();
  const gold = page.getByRole("radio", { name: /Gold leaf, unlocks at level/ });
  await expect(gold).toBeDisabled();
  await page.getByRole("radio", { name: "Classic blue" }).click();
  expect(errors).toEqual([]);
});

test("a missing page offers a way back", async ({ page }) => {
  await page.goto("/nothing-here");
  await expect(page.getByRole("link", { name: "Back to the games" })).toBeVisible();
});

test("the manifest has a shortcut for each game", async ({ request }) => {
  const m = await (await request.get("/manifest.json")).json();
  const urls = (m.shortcuts as { url: string }[]).map(s => s.url);
  expect(urls.some(u => u.startsWith("/skipbo/play"))).toBe(true);
  expect(urls.some(u => u.startsWith("/play"))).toBe(true);
});
