import { expect, test } from "@playwright/test";

test("manifest and service worker are served", async ({ request }) => {
  const manifest = await request.get("/manifest.json");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe("Ludo Sync");
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("ludo-shell-");
});

test("menu loads and a quick bot game can be played for a few turns", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|GL Driver Message|GPU stall/.test(m.text())) errors.push(m.text()); });

  await page.goto("/");
  await expect(page.getByText("Ludo Sync").first()).toBeVisible();

  await page.goto("/play?preset=bot&quick=1");
  const roll = page.getByRole("button", { name: "Roll the dice" });
  await expect(roll).toBeVisible({ timeout: 20_000 });

  let rolls = 0;
  const movable = page.getByRole("button", { name: /token \d, can move/ });
  for (let i = 0; i < 60 && rolls < 3; i++) {
    if (await roll.isVisible().catch(() => false)) {
      await roll.click();
      rolls++;
    } else {
      // 3D tokens are visually hidden accessibility buttons; activate them by keyboard
      const token = movable.first();
      if (await token.count()) { await token.focus().catch(() => undefined); await page.keyboard.press("Enter"); }
    }
    await page.waitForTimeout(1000);
  }
  expect(rolls).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test("piece maker edits a piece and saves it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/pieces");
  await page.getByRole("button", { name: "Crown", exact: true }).click();
  await expect(page.getByRole("img", { name: "2D preview of the piece" })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem("ludo-sync:v1:pieces"));
  expect(saved).toContain("crown");
  expect(errors).toEqual([]);
});

test("pressing Back asks before leaving a game, and the game stays saved", async ({ page }) => {
  await page.goto("/play?preset=bot&quick=1");
  await expect(page.getByRole("button", { name: "Roll the dice" })).toBeVisible({ timeout: 20_000 });
  await page.goBack();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Leave this game?");
  await expect(page).toHaveURL(/\/play/);
  // the leave button is locked for a moment, so a second tap cannot confirm by accident
  await expect(dialog.getByRole("button", { name: /^Leave for now \(\d\)$/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Keep playing" }).click();
  await expect(page.getByRole("button", { name: "Roll the dice" })).toBeVisible();
  // leaving on purpose lands on the menu with the game waiting to be resumed
  await page.getByRole("button", { name: "Leave game" }).click();
  const leave = dialog.getByRole("button", { name: "Leave for now" });
  await expect(leave).toBeEnabled({ timeout: 4000 });
  await leave.click();
  await expect(page.getByRole("button", { name: /Resume game/ })).toBeVisible({ timeout: 10_000 });
});

test("an online game that was left can be rejoined from the menu, and forgotten", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("ludo-sync:v1:room", JSON.stringify({ role: "guest", code: "ABC234", name: "Pat", savedAt: Date.now() }));
    }
  });
  await page.goto("/");
  const rejoin = page.getByRole("button", { name: /Rejoin online game/ });
  await expect(rejoin).toBeVisible();
  await expect(rejoin).toContainText("ABC-234");
  await page.getByRole("button", { name: "Forget this online game" }).click();
  await expect(rejoin).toHaveCount(0);
  // with nothing saved, the rejoin link explains instead of failing
  await page.goto("/online?rejoin=1");
  await expect(page.getByText("There is no game to rejoin")).toBeVisible();
});

test("colours chosen in setup reach the game and are remembered", async ({ page }) => {
  await page.goto("/play?preset=bot");
  await page.getByRole("button", { name: /Choose Red player colours/ }).click();
  await page.getByRole("tab", { name: "Home" }).click();
  await page.getByRole("button", { name: "Use #319795" }).click();
  await page.getByRole("tab", { name: "Pieces" }).click();
  await page.getByRole("button", { name: "Use #d53f8c" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByRole("button", { name: "Roll the dice" })).toBeVisible({ timeout: 20_000 });
  const palette = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo-sync:v1:settings")!).palette);
  expect(palette["0"]).toEqual({ main: "#d53f8c", home: "#319795", path: null });
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo-sync:v1:save")!).palette);
  expect(save["0"].main).toBe("#d53f8c");
});
