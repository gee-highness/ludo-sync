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
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

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
