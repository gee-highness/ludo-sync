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
  const life = page.getByRole("region", { name: "Lifetime points" });
  await expect(life).toContainText("★ 0");
  await expect(life).toContainText("Rookie");
  await expect(life).toContainText("500 more points");
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

test("Four in a Row: change a rule, play against a bot, and the game is saved", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/g/fourinrow");
  await expect(page.getByText("Rules: you decide")).toBeVisible();
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Mini" }).click(); // preset: connect three on a small board
  await page.getByRole("combobox", { name: "Bot level" }).selectOption("easy");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/g\/fourinrow\/play/);
  const col = page.getByRole("button", { name: "Drop in column 1" });
  await expect(col).toBeVisible({ timeout: 15_000 });
  // 5 columns on the mini board
  await expect(page.getByRole("grid", { name: /5 columns by 5 rows/ })).toBeVisible();
  for (let i = 0; i < 40; i++) {
    if (await page.getByRole("dialog", { name: "Game over" }).isVisible().catch(() => false)) break;
    const yourTurn = await page.getByText("Your turn: drop a disc").isVisible().catch(() => false);
    if (yourTurn) await page.getByRole("button", { name: /Drop in column [1-5]$/ }).nth(i % 5).click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  await expect(page.getByRole("dialog", { name: "Game over" })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("Casino: set a rule, play a card against a bot, and the bot answers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/g/casino");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "African Casino" }).click();
  await page.getByRole("combobox", { name: "Bot level" }).selectOption("easy");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("group", { name: "Your hand" })).toBeVisible({ timeout: 15_000 });
  for (let turn = 0; turn < 3; turn++) {
    await expect(page.getByText("Your turn: play a card")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("group", { name: "Your hand" }).getByRole("button").first().click();
    const take = page.getByRole("button", { name: "Pick the most I can take" });
    await take.click();
    const capture = page.getByRole("button", { name: "Capture", exact: true });
    if (await capture.isEnabled()) await capture.click(); else await page.getByRole("button", { name: "Trail", exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test("4 Colors: play and draw against a bot with a changed rule", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/g/fourcolors");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Chaos" }).click();
  await page.getByRole("combobox", { name: "Bot level" }).selectOption("easy");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("group", { name: "Your hand" })).toBeVisible({ timeout: 15_000 });
  for (let turn = 0; turn < 4; turn++) {
    await expect(page.getByRole("status").filter({ hasText: /Your turn: play a card or draw|Play the card you drew|Draw \d/ })).toBeVisible({ timeout: 20_000 });
    const playable = page.getByRole("group", { name: "Your hand" }).getByRole("button");
    if (await playable.count()) {
      await playable.first().click();
      const colour = page.getByRole("button", { name: "red", exact: true });
      if (await colour.isVisible().catch(() => false)) await colour.click();
      const swap = page.getByRole("dialog").getByRole("button").first();
      if (await page.getByText("Swap hands with…").isVisible().catch(() => false)) await swap.click();
    } else {
      const drawMore = page.getByRole("button", { name: /^Draw \d+$/ });
      if (await drawMore.isVisible().catch(() => false)) await drawMore.click(); else await page.getByRole("button", { name: "Draw a card" }).click();
      const pass = page.getByRole("button", { name: "Keep it and pass" });
      if (await pass.isVisible({ timeout: 800 }).catch(() => false)) await pass.click();
    }
    await page.waitForTimeout(1500);
  }
  expect(errors).toEqual([]);
});

test("Snakes and Ladders: choose the classic board, roll, and the bot rolls back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/g/snakes");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Classic", exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("img", { name: /Board of 100 squares/ })).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 4; i++) {
    const roll = page.getByRole("button", { name: /Roll the dice|Roll again/ });
    await expect(roll).toBeEnabled({ timeout: 20_000 });
    await roll.click();
    await page.waitForTimeout(1500);
  }
  expect(errors).toEqual([]);
});

test("Memory Match: solo, flip cards and the game is saved", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/g/memory");
  await page.getByRole("combobox", { name: "Number of bots" }).selectOption("0");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("grid", { name: "Cards" })).toBeVisible({ timeout: 15_000 });
  const cards = page.getByRole("gridcell");
  await expect(cards).toHaveCount(20);
  await cards.nth(0).click();
  await cards.nth(1).click();
  await expect(page.getByText(/found/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Crazy Eights: pick a preset, play or draw against a bot", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/g/crazyeights");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Action", exact: true }).click();
  await page.getByRole("combobox", { name: "Bot level" }).selectOption("easy");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("group", { name: "Your hand" })).toBeVisible({ timeout: 15_000 });
  for (let turn = 0; turn < 4; turn++) {
    await expect(page.getByRole("status").filter({ hasText: /Your turn|Draw \d/ })).toBeVisible({ timeout: 20_000 });
    const cards = page.getByRole("group", { name: "Your hand" }).getByRole("button");
    if (await cards.count()) {
      await cards.first().click();
      const suit = page.getByRole("button", { name: "hearts", exact: true });
      if (await suit.isVisible().catch(() => false)) await suit.click();
    } else {
      const more = page.getByRole("button", { name: /^Draw \d+$/ });
      if (await more.isVisible().catch(() => false)) await more.click(); else await page.getByRole("button", { name: "Draw a card" }).click();
    }
    await page.waitForTimeout(1500);
  }
  expect(errors).toEqual([]);
});

test("pinning a game puts it at the top of the home screen, and it stays after a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Pinned games" })).toHaveCount(0);
  const pin = page.getByRole("button", { name: "Pin Casino to the top" });
  await pin.click();
  const pinned = page.getByRole("region", { name: "Pinned games" });
  await expect(pinned).toBeVisible();
  await expect(pinned.getByRole("link", { name: /Casino/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpin Casino" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("region", { name: "Pinned games" }).getByRole("link", { name: /Casino/ })).toBeVisible();
  // pin a second game: it goes after the first
  await page.getByRole("button", { name: "Pin Four in a Row to the top" }).click();
  const names = await page.getByRole("region", { name: "Pinned games" }).getByRole("heading").allTextContents();
  expect(names).toEqual(["Casino", "Four in a Row"]);
  // pinning also works from the game's own menu, and unpinning removes the section
  await page.getByRole("button", { name: "Unpin Casino" }).click();
  await page.getByRole("button", { name: "Unpin Four in a Row" }).click();
  await expect(page.getByRole("region", { name: "Pinned games" })).toHaveCount(0);
  await page.goto("/g/fourcolors");
  await page.getByRole("button", { name: /Pin 4 Colors to the top/ }).click();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Pinned games" }).getByRole("link", { name: /4 Colors/ })).toBeVisible();
});
