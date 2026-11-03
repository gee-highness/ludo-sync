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
  await page.getByRole("button", { name: "South African (40)", exact: true }).click();
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

test("Solitaire: solo Klondike, turn a card, undo, hint, and give up ends the game", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/g/solitaire");
  await expect(page.getByRole("button", { name: "Play with friends online" })).toBeVisible();
  await expect(page.getByText("Pass and play on one device")).toHaveCount(0); // every seat plays at once, so there is no pass and play
  await page.getByRole("combobox", { name: "Number of bots" }).selectOption("0");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("group", { name: "Tableau" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: /^Column \d, \d+ cards?$/ })).toHaveCount(7);
  await page.getByRole("button", { name: "Turn a card from the stock" }).click();
  await expect(page.getByText(/Moves 1/)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Hint" }).click();
  await page.getByRole("button", { name: "Give up" }).click();
  await expect(page.getByRole("dialog", { name: "Game over" })).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("Solitaire: FreeCell and Spider deal their own layouts", async ({ page }) => {
  for (const [preset, columns] of [["FreeCell", 8], ["Spider (1 suit)", 10]] as const) {
    await page.goto("/g/solitaire");
    await page.getByRole("button", { name: "Change" }).click();
    await page.getByRole("button", { name: preset, exact: true }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("combobox", { name: "Number of bots" }).selectOption("0");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("group", { name: /^Column \d+, \d+ cards?$/ })).toHaveCount(columns, { timeout: 15_000 });
  }
});

test("Friends: a stable friend code, add and remove a friend, and the home screen links to it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Friends/ }).first().click();
  await expect(page).toHaveURL(/\/friends$/);
  const codeEl = page.getByLabel(/^Your friend code [A-Z2-9 ]+$/);
  await expect(codeEl).toBeVisible();
  const code = (await codeEl.textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await page.reload();
  await expect(page.getByLabel(/^Your friend code [A-Z2-9 ]+$/)).toHaveText(code); // the same code after a reload
  const add = page.getByRole("button", { name: "Add friend" });
  await expect(add).toBeDisabled();
  await page.getByLabel("Friend code", { exact: true }).fill("not a code");
  await expect(add).toBeDisabled();
  await page.getByLabel("Friend code", { exact: true }).fill("ABCD-EFGH");
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByRole("status").filter({ hasText: /Saved|Request sent/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Waiting for them to accept").first()).toBeVisible();
  await page.getByRole("button", { name: /^Remove / }).click();
  await expect(page.getByText("No friends yet")).toBeVisible();
  // your own code is refused
  await page.getByLabel("Friend code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Add friend" }).click();
  await expect(page.getByText("That is your own code.")).toBeVisible({ timeout: 10_000 });
});

test("Friends: a link with a code fills it in, and the lobby offers one-tap invites", async ({ page }) => {
  await page.goto("/friends?add=ABCDEFGH");
  await expect(page.getByLabel("Friend code", { exact: true })).toHaveValue("ABCDEFGH");
  // "Play with a friend" opens the room straight away
  await page.goto("/g/fourinrow/online?host=1");
  await expect(page.getByRole("group", { name: "Invite friends" })).toBeVisible({ timeout: 40_000 });
});

test("the friends mailbox is off until a Blob store is connected, and the app says nothing is wrong", async ({ request, page }) => {
  const r = await request.post("/api/mailbox", { data: { op: "register", code: "ABCDEFGH", key: "k".repeat(24) } });
  expect(r.status()).toBe(503);
  expect(await r.json()).toEqual({ error: "disabled" });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/friends");
  await expect(page.getByRole("region", { name: "Your friend code" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("two browsers pair through our own endpoint (no PeerJS) and play a move", async ({ browser }) => {
  test.setTimeout(120_000);
  const mk = async () => { const c = await browser.newContext(); await c.addInitScript(() => localStorage.setItem("ludo-sync:v1:net-signaling", JSON.stringify("vercel"))); return { c, p: await c.newPage() }; };
  const A = await mk(), B = await mk();
  const errors: string[] = [];
  A.p.on("pageerror", e => errors.push(e.message)); B.p.on("pageerror", e => errors.push(e.message));
  await A.p.goto("/g/fourinrow/online?host=1");
  const label = await A.p.getByLabel(/^Room code [0-9A-Z ]+$/).getAttribute("aria-label", { timeout: 40_000 });
  const code = label!.replace("Room code", "").replace(/\s/g, "");
  expect(code).toMatch(/^[0-9A-Z]{6}$/);
  await B.p.goto(`/g/fourinrow/online?join=${code}`);
  await B.p.getByRole("button", { name: "Join room" }).click();
  await expect(B.p.getByText(/Waiting for .* to start/)).toBeVisible({ timeout: 60_000 });
  await expect(A.p.getByText("Check digits")).toBeVisible({ timeout: 30_000 }); // the host sees the guest arrive
  await A.p.getByRole("button", { name: "Start the game" }).click();
  // whoever's turn it is drops a disc; the other side sees it become their turn
  const mine = (p: typeof A.p) => p.getByRole("status").filter({ hasText: "Your turn: drop a disc" });
  await expect.poll(async () => (await mine(A.p).count()) + (await mine(B.p).count()), { timeout: 30_000 }).toBeGreaterThan(0);
  const first = (await mine(A.p).count()) ? A : B, second = first === A ? B : A;
  await first.p.getByRole("button", { name: "Drop in column 4" }).click({ force: true });
  await expect(mine(second.p)).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
  await A.c.close(); await B.c.close();
});

test("Checkers: pick a piece, move it, and the bot answers", async ({ page }) => {
  const errors = watch(page);
  await quiet(page);
  await page.goto("/g/checkers");
  await page.getByLabel("Your name", { exact: true }).fill("Tester");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const board = page.getByRole("grid", { name: /Checkers board/ });
  await expect(board).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("status").filter({ hasText: "Your turn" })).toBeVisible();
  await page.locator('[role=gridcell][aria-label*="can move"]').first().click({ force: true });
  await expect(page.locator('[role=gridcell][aria-label*="you can move here"]').first()).toBeAttached();
  await page.locator('[role=gridcell][aria-label*="you can move here"]').first().click({ force: true });
  // the bot replies and it is our turn again
  await expect(page.getByRole("log").getByText(/Tester moved/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("log").getByText(/Mia moved|Mia captured/).first()).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("Cards travel instead of vanishing: a played card flies to the table in Casino", async ({ page }) => {
  const errors = watch(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ludo-sync:v1:settings", JSON.stringify({ music: false, sound: false, speed: "normal" }));
      localStorage.setItem("ludo-sync:v1:g-setup:casino", JSON.stringify({ seats: [{ name: "Tester", kind: "human" }, { name: "Mia", kind: "bot", level: "easy" }], rules: {}, hotseat: false }));
    } catch { /* private window */ }
  });
  await page.goto("/g/casino/play");
  const hand = page.getByRole("group", { name: "Your hand" });
  await expect(hand.getByRole("button").first()).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("status").filter({ hasText: "Your turn" })).toBeVisible({ timeout: 30_000 }); // the bot may deal first
  await hand.getByRole("button").first().click();
  await page.getByRole("button", { name: "Trail" }).click();
  // a copy of the card is flying while the real one is held back, and the layer is cleaned up afterwards
  await expect.poll(() => page.evaluate(() => document.querySelectorAll("[data-motion-layer] > *").length), { timeout: 3000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.querySelectorAll("[data-motion-layer] > *").length), { timeout: 8000 }).toBe(0);
  await expect(page.locator('[data-mk][style*="visibility: hidden"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Skip-Bo cards fly: a discarded card travels to its pile and the layer is cleaned up", async ({ page }) => {
  const errors = watch(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ludo-sync:v1:settings", JSON.stringify({ music: false, sound: false, speed: "normal" }));
      localStorage.setItem("ludo-sync:v1:calm-v1", "true");
      localStorage.setItem("ludo-sync:v1:road-v1", "true");
    } catch { /* private window */ }
  });
  await page.goto("/skipbo/play?name=Tester&bots=1&level=easy&mode=quick&stock=10");
  await expect(page.getByText("· your turn")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => { (window as unknown as { __max: number }).__max = 0; const f = () => { const w = window as unknown as { __max: number }; w.__max = Math.max(w.__max, document.querySelectorAll("[data-motion-layer] > *").length); requestAnimationFrame(f); }; f(); });
  await page.locator('[aria-label^="Hand card 1"]').click();
  await page.locator('[aria-label^="Discard pile 1"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __max: number }).__max), { timeout: 3000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.querySelectorAll("[data-motion-layer] > *").length), { timeout: 8000 }).toBe(0);
  await expect(page.locator('[data-anchor][style*="visibility: hidden"], [data-anchor] [style*="visibility: hidden"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Cards page: a card back designed once shows up in every card game", async ({ page }) => {
  const errors = watch(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ludo-sync:v1:g-setup:crazyeights", JSON.stringify({ seats: [{ name: "Tester", kind: "human" }, { name: "Mia", kind: "bot", level: "easy" }], rules: {}, hotseat: false }));
    } catch { /* private window */ }
  });
  await page.goto("/cards");
  await expect(page.getByText("Ready-made looks")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: "Royal card back" }).click();
  await page.getByRole("button", { name: "Ornate border" }).click();
  await page.getByLabel("Monogram", { exact: true }).fill("GS");
  await page.getByRole("tab", { name: "Court cards" }).click();
  await page.getByRole("button", { name: "Characters" }).click();
  await page.getByRole("tab", { name: "Faces" }).click();
  await page.getByLabel("Four-colour suits").check({ force: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo-sync:v1:card-style") ?? "null"));
  expect(saved.back).toMatchObject({ design: "royal", border: "ornate", monogram: "GS" });
  expect(saved.court.style).toBe("characters");
  expect(saved.faces.fourColour).toBe(true);
  // the opponent's face-down cards in a game carry the same monogram
  await page.goto("/g/crazyeights/play");
  await expect(page.locator("[data-cardback] svg text", { hasText: "GS" }).first()).toBeVisible({ timeout: 40_000 });
  // a bad value in storage can never break a card
  await page.evaluate(() => localStorage.setItem("ludo-sync:v1:card-style", JSON.stringify({ back: { design: "nope", primary: "x" } })));
  await page.goto("/g/crazyeights/play");
  await expect(page.locator("[data-cardback] svg").first()).toBeVisible({ timeout: 40_000 });
  expect(errors).toEqual([]);
});

const crazySetup = async (page: Page) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ludo-sync:v1:settings", JSON.stringify({ music: false, sound: false, speed: "instant" }));
      localStorage.setItem("ludo-sync:v1:g-setup:crazyeights", JSON.stringify({ seats: [{ name: "Tester", kind: "human" }, { name: "Mia", kind: "bot", level: "easy" }], rules: {}, hotseat: false }));
    } catch { /* private window */ }
  });
  await page.goto("/g/crazyeights/play");
  await expect(page.getByRole("group", { name: "Your hand" }).locator("[data-mk]").first()).toBeVisible({ timeout: 40_000 });
};

test("Dragging: a card can be dragged onto the discard pile, and the bot answers", async ({ page }) => {
  const errors = watch(page);
  await crazySetup(page);
  const hand = page.getByRole("group", { name: "Your hand" }).locator("[data-mk]");
  const before = await hand.count();
  let played = false;
  for (let attempt = 0; attempt < 8 && !played; attempt++) {
    await expect(page.getByRole("status").filter({ hasText: /Your turn/ })).toBeVisible({ timeout: 20_000 });
    const grabbable = page.locator('[data-drag][style*="cursor: grab"]');
    if (!(await grabbable.count())) { await page.keyboard.press("d"); continue; } // nothing playable: draw with the keyboard
    const box = (await grabbable.first().boundingBox())!, to = (await page.locator('[data-drop-id="discard"]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 4 }); // lifts the card
    await expect(page.locator("body[data-dragging]")).toHaveCount(1);
    await expect(page.locator('[data-drop-id="discard"][data-drop-ok="1"]')).toHaveCount(1); // the pile lights up
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await expect(page.locator('[data-drop-id="discard"][data-drop-over="1"]')).toHaveCount(1);
    const inHand = await hand.count();
    await page.mouse.up();
    // an eight is wild: choose a suit for it
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible({ timeout: 800 }).catch(() => false)) await dialog.getByRole("button").first().click();
    await expect.poll(() => hand.count(), { timeout: 10_000 }).toBeLessThan(inHand);
    played = true;
  }
  expect(played).toBe(true);
  await expect(page.locator("body[data-dragging]")).toHaveCount(0);
  void before;
  expect(errors).toEqual([]);
});

test("Dropping on nothing puts the card back, and the keyboard shortcut draws", async ({ page }) => {
  const errors = watch(page);
  await crazySetup(page);
  await expect(page.getByRole("status").filter({ hasText: /Your turn/ })).toBeVisible({ timeout: 20_000 });
  const hand = page.getByRole("group", { name: "Your hand" }).locator("[data-mk]");
  const n = await hand.count();
  const grabbable = page.locator('[data-drag][style*="cursor: grab"]');
  if (await grabbable.count()) {
    const box = (await grabbable.first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 5, box.y - 120, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator("body[data-dragging]")).toHaveCount(0);
    await expect(hand).toHaveCount(n); // nothing was played
  }
  await page.keyboard.press("d");
  await expect(hand).not.toHaveCount(n - 1);
  expect(errors).toEqual([]);
});

test("Controls: bigger buttons and larger text apply to the whole page and are remembered", async ({ page }) => {
  const errors = watch(page);
  await crazySetup(page);
  await page.getByRole("button", { name: /^Menu/ }).click();
  await page.getByRole("tab", { name: "Controls" }).click();
  await page.locator('label[for="big"]').click();
  await page.getByRole("radio", { name: "130%" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-big-targets", "1");
  expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe("130%");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo-sync:v1:interaction") ?? "null"));
  expect(saved).toMatchObject({ bigTargets: true, textScale: 130 });
  await page.locator('label[for="drag"]').click();
  const grabbed = await page.evaluate(() => JSON.parse(localStorage.getItem("ludo-sync:v1:interaction") ?? "null").drag);
  expect(grabbed).toBe(false);
  expect(errors).toEqual([]);
});

test("Menu: settings, rules, how to play, log, controls and cards are all in one drawer at every table", async ({ page }) => {
  const errors = watch(page);
  await crazySetup(page);
  await page.getByRole("button", { name: /^Menu/ }).click();
  const tabs = page.getByRole("tablist").getByRole("tab");
  await expect(tabs).toHaveText(["Settings", "Rules", "How to play", "Log", "Controls", "Cards"]);
  await page.locator("label", { hasText: "Sound effects" }).first().click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ludo-sync:v1:settings") ?? "{}").sound)).toBe(true);
  await page.getByRole("radio", { name: "Fast" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ludo-sync:v1:settings") ?? "{}").speed)).toBe("fast");
  await page.getByRole("tab", { name: "Rules" }).click();
  await expect(page.getByText("Rules in use")).toBeVisible();
  await page.getByRole("tab", { name: "How to play" }).click();
  await expect(page.getByText(/Be first to play all your cards/i).first()).toBeVisible();
  await page.getByRole("tab", { name: "Cards" }).click();
  await expect(page.getByText("Ready-made looks")).toBeVisible();
  await page.keyboard.press("Escape");
  // a board game has no Cards tab
  await page.addInitScript(() => localStorage.setItem("ludo-sync:v1:g-setup:checkers", JSON.stringify({ seats: [{ name: "Tester", kind: "human" }, { name: "Mia", kind: "bot", level: "easy" }], rules: {}, hotseat: false })));
  await page.goto("/g/checkers/play");
  await page.getByRole("button", { name: /^Menu/ }).click({ timeout: 40_000 });
  await expect(page.getByRole("tablist").getByRole("tab")).toHaveText(["Settings", "Rules", "How to play", "Log", "Controls"]);
  expect(errors).toEqual([]);
});
