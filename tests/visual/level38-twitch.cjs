// Optional headless Chrome QA; uses the same local PostgreSQL + fake Twitch as integration tests.
// Requires the Playwright installation documented in tests/visual/level38.cjs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../dist/phase3-qa-tools/node_modules/playwright");
const { setup } = require("../integration/twitch-support.cjs");
const { payload, signed, origin } = require("../twitch-fake.cjs");

test("Twitch owner/moderator controls work in Chrome at desktop and phone sizes", { timeout: 90000 }, async (t) => {
  const f = await setup(t); await f.map(f.games[1], "100"); await f.twitch.run("ensure");
  const browser = await chromium.launch({ channel: "chrome", headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // This legacy suite asserts English labels; production control defaults to Spanish.
  await context.addInitScript(() => localStorage.setItem("level38:language", "en"));
  const cookie = f.owner.cookie.split("="); await context.addCookies([{ name: cookie[0], value: cookie[1], url: f.url }]);
  const page = await context.newPage(); const errors = [];
  const openConfiguration = async () => {
    if (!await page.locator(".l38-config-panel").evaluate(el => el.open)) await page.locator(".l38-config-panel > summary").click();
  };
  page.on("pageerror", (e) => errors.push(e.message));
  // Test HTTP origin differs from configured public HTTPS origin; only adapt the CSRF Origin header.
  await page.route("**/level38/api/**", async (route) => {
    const response = await route.fetch({ headers: { ...route.request().headers(), ...(route.request().method() === "POST" ? { origin } : {}) } });
    await route.fulfill({ response });
  });
  const out = path.resolve("dist/phase4-visual-qa"); fs.mkdirSync(out, { recursive: true });
  await page.goto(f.url + "/control");
  await page.waitForFunction(() => !document.getElementById("operator-controls").disabled && document.getElementById("twitch-connection").textContent === "Connected");
  await openConfiguration();
  await page.locator("#twitch-heading").evaluate((el) => el.scrollIntoView({ block: "start" })); await page.screenshot({ path: path.join(out, "1440-twitch-auto.png") });
  await page.locator("#twitch-mapping summary").click();
  const form = page.locator("#twitch-mapping-forms form").first();
  await form.locator("input").nth(0).fill("200"); await form.locator("input").nth(1).fill("Mapped from Twitch");
  const saved = page.waitForResponse((res) => res.url().endsWith(`/games/${f.games[0].id}/twitch`));
  await form.getByRole("button", { name: "Save mapping" }).click();
  const response = await saved; assert.equal(response.status(), 200, await response.text());
  await page.waitForFunction(() => !document.getElementById("operator-controls").disabled);
  assert.equal((await f.db.game.findUnique({ where: { id: f.games[0].id } })).twitchCategoryId, "200");
  await page.setViewportSize({ width: 390, height: 844 }); await form.evaluate((el) => el.scrollIntoView({ block: "start" }));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(out, "390-owner-mapping.png") });
  // Unsaved inputs persist through status and vote-independent revisions.
  await form.locator("input").nth(1).fill("Unsaved label");
  const quest = (await f.db.quest.findMany({ where: { status: "AVAILABLE" }, take: 1 }))[0];
  await f.service.changeQuest(f.mod.id, quest.id, "activate", await f.revision());
  await page.waitForTimeout(150); assert.equal(await form.locator("input").nth(1).inputValue(), "Unsaved label");
  const modCookie = f.mod.cookie.split("="); await context.addCookies([{ name: modCookie[0], value: modCookie[1], url: f.url }]);
  await page.reload(); await page.waitForFunction(() => !document.getElementById("operator-controls").disabled);
  assert.equal(await page.locator("#twitch-mapping").count(), 0); assert.equal(await page.locator("#twitch-sync").count(), 0);
  await page.locator("#game").selectOption(f.games[2].id); await page.locator("#game-form button").click();
  await page.waitForFunction(() => document.getElementById("twitch-source").textContent.includes("Manual Override by Isma"));
  const update = payload(); update.event.category_id = "200"; update.event.category_name = "Category from webhook";
  assert.equal((await f.webhook(signed(update))).status, 204);
  await page.reload(); await page.waitForFunction(() => !document.getElementById("operator-controls").disabled);
  await openConfiguration();
  await page.locator("#twitch-heading").evaluate((el) => el.scrollIntoView({ block: "start" })); await page.screenshot({ path: path.join(out, "390-manual-override.png") });
  assert.equal((await f.service.state()).event.currentGameId, f.games[2].id);
  await openConfiguration();
  await page.locator("#twitch-auto").focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("twitch-source").textContent === "Game source: Twitch Auto");
  assert.equal((await f.service.state()).event.currentGameId, f.games[0].id);
  await page.locator("#twitch-heading").scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, "390-twitch-auto.png") });
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ browser: browser.version(), widths: [1440, 390], errors, fakeTwitch: true }, null, 2));
});
