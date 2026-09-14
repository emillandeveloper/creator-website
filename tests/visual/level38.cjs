// Optional real-browser QA. Uses a separately installed Playwright and local Chrome.
// npm install --prefix dist/phase3-qa-tools --no-save --no-package-lock playwright
// Set LEVEL38_TEST_DATABASE_URL to a disposable PostgreSQL database, then:
// node --test tests/visual/level38.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../dist/phase3-qa-tools/node_modules/playwright");
const { fixture } = require("../integration/support.cjs");
const { hashToken, newToken } = require("../../dist/modules/level38/auth");

test("Chrome visual and interaction QA at desktop, tablet, phone and landscape sizes", { timeout: 180000 }, async (t) => {
  const f = await fixture(t); await f.start(); const mod = await f.operator("Isma", "MODERATOR");
  const quests = await f.db.quest.findMany({ where: { isSecret: false }, orderBy: { number: "asc" } });
  await f.db.quest.updateMany({ where: { id: { in: quests.slice(0, 27).map((q) => q.id) } }, data: { status: "COMPLETED", completedAt: new Date() } });
  const active = quests[27];
  await f.db.quest.update({ where: { id: active.id }, data: { status: "ACTIVE", title: "Win without a single healing item", description: "Keep the party standing. Defeat the next boss without using restorative items." } });
  // Presentation stress cases: real saved content, including paragraphs and an unbroken word.
  const longQuest = quests[31];
  await f.db.quest.update({ where: { id: longQuest.id }, data: { title: "Follow the forgotten path beyond the northern mountains", description: "Speak to every traveller in the mountain village before entering the ruins. Keep a record of the clues they share, then guide the party through the old watchtower and back to camp.\n\nThe objective is complete when every party member returns safely. Optional treasure can wait: take your time, read the inscriptions, and check the side passages before approaching the final gate.\n\nJournal reference: " + "NorthernWatchtower".repeat(8) } });
  for (const [i, status] of ["FAILED", "SKIPPED", "LOCKED"].entries()) await f.db.quest.update({ where: { id: quests[28+i].id }, data: { status } });
  await f.db.event.updateMany({ data: { currentGameId: active.gameId } });
  const control = async () => (await f.call("/api/control/state", undefined, mod.cookie)).data;
  const op = async (route, body) => { const r = await f.call(`/api/control/${route}`, { ...body, controlRevision: (await control()).event.controlRevision }, mod.cookie); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
  await op("polls", { type: "CUSTOM", title: "Which road should we follow?", options: [{ label: "The mountain pass" }, { label: "The forest trail" }] });
  const previousPoll = (await control()).polls[0];
  await op(`polls/${previousPoll.id}/status`, { action: "open" });
  await op(`polls/${previousPoll.id}/status`, { action: "close" });
  await op("polls", { type: "CUSTOM", title: "Where should the adventure take us next?", options: [{ label: "Explore the ancient ruins beyond the northern mountains and return to camp" }, { label: "Challenge the optional boss" }, { label: "Hunt for rare treasure" }] });
  const poll = (await control()).polls[0]; await op(`polls/${poll.id}/status`, { action: "open" });
  for(let i=0;i<7;i++) {
    const participant = await f.db.participant.create({ data: { tokenHash: hashToken(newToken()), nickname: `Test voter ${i}`, expiresAt: new Date(Date.now()+60000) } });
    await f.db.vote.create({ data: { pollId: poll.id, optionId: poll.options[i%3].id, participantId: participant.id } });
  }
  const out = path.resolve(process.env.LEVEL38_VISUAL_OUTPUT || "dist/phase3-visual-qa"); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); const errors = []; const csp = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (/Content Security Policy|Refused to/.test(message.text())) csp.push(message.text()); });
  await page.goto(`${f.origin}/level38`); await page.locator("#join-open").waitFor();
  await page.waitForFunction(() => !document.getElementById("join-open").disabled && document.getElementById("connection").textContent.includes("connected"));
  await page.evaluate(() => document.fonts.ready);
  const overflowChecks = [];
  async function checkOverflow(label) {
    const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(size.document <= size.viewport && size.body <= size.viewport, `no overflow: ${label} ${JSON.stringify(size)}`);
    overflowChecks.push({ label, ...size });
  }
  for(const [width, height] of [[1440,1000], [1024,1000], [768,1000], [390,844], [844,390]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(() => window.scrollTo(0,0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no overflow at ${width}`);
    await page.screenshot({ path: path.join(out, `${width}-overview.png`) });
    for (const [section, selector] of [["objectives", "#active-quests"], ["poll", "#voting"], ["party", "#party"], ["footer", ".l38-footer"]]) {
      await page.locator(selector).evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: path.join(out, `${width}-${section}.png`) });
    }
    await page.locator("#join-open").click();
    await checkOverflow(`${width} join`);
    await page.screenshot({ path: path.join(out, `${width}-join-form.png`) });
    await page.locator("#nickname").press("Escape");
    assert.equal(await page.locator("#join-open").evaluate((el) => el === document.activeElement), true);
    await page.locator("#quest-status").selectOption("AVAILABLE"); await page.locator("#quest-log").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: path.join(out, `${width}-journal.png`) });
    await page.locator("#quest-search").fill("Journal reference:");
    const longCard = page.locator("#quest-board .l38-card");
    assert.equal(await longCard.count(), 1);
    await longCard.screenshot({ path: path.join(out, `${width}-long-description.png`) });
    await checkOverflow(`${width} long quest`);
    const description = await longCard.locator("p:not(.l38-meta)").evaluate((el) => ({ font: getComputedStyle(el).fontFamily, overflow: el.scrollWidth > el.clientWidth, clipped: el.scrollHeight > el.clientHeight }));
    assert.ok(!description.font.includes("Silkscreen") && !description.overflow && !description.clipped);
    await page.locator("#quest-search").fill("");
    await page.locator("#quest-status").selectOption("all");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-vote-id]").first().click(); await page.locator("#join-form").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(out, "390-join.png") });
  await page.locator("#nickname").fill("Garnet"); await page.locator("#nickname").press("Enter");
  await page.locator('[aria-pressed="true"]').waitFor(); await page.locator("#party-welcome").waitFor({ state: "visible" });
  const job = await page.locator("#viewer-class").textContent();
  await page.locator("#party").scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, "390-class-assigned.png") });
  await checkOverflow("390 class reveal");
  await page.locator("#welcome-sprite img").waitFor();
  assert.equal(await page.locator("#welcome-sprite img").getAttribute("src"), await page.locator("#viewer-sprite img").getAttribute("src"));
  await page.locator("#join-open").click(); await page.locator("#nickname").fill("Garnet Moon"); await page.locator("#nickname").press("Enter");
  await page.waitForFunction(() => document.getElementById("viewer-name").textContent === "Garnet Moon");
  await page.locator("#join-open").click();
  await page.locator("#nickname").fill("WanderingAdventurer".repeat(2).slice(0,24)); await page.locator("#nickname").press("Enter");
  await page.waitForFunction(() => document.getElementById("viewer-name").textContent === "WanderingAdventurer".repeat(2).slice(0,24));
  await checkOverflow("390 long player name");
  await page.locator("#party").screenshot({ path: path.join(out, "390-long-player-name.png") });
  await page.locator("#join-open").click(); await page.locator("#nickname").fill("Garnet Moon"); await page.locator("#nickname").press("Enter");
  await page.waitForFunction(() => document.getElementById("viewer-name").textContent === "Garnet Moon");
  assert.equal(await page.locator("#viewer-class").textContent(), job);
  await page.reload(); await page.waitForFunction(() => document.getElementById("viewer-name").textContent === "Garnet Moon");
  assert.equal(await page.locator("#viewer-class").textContent(), job); assert.equal(await page.locator("#party-welcome").isVisible(), false);
  await page.locator("[data-vote-id]").nth(1).focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll('[data-vote-id]')[1].getAttribute('aria-pressed') === 'true');
  await page.locator("#voting").scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, "390-voting.png") });
  await op(`polls/${poll.id}/status`, { action: "close" });
  await op(`polls/${poll.id}/winner`, { optionId: poll.options[1].id });
  await page.locator(".l38-result").waitFor(); await page.screenshot({ path: path.join(out, "390-closed-poll.png") });
  for (const [width,height] of [[1440,1000], [1024,1000], [768,1000], [390,844], [844,390]]) {
    await page.setViewportSize({ width, height });
    await page.locator(".l38-poll-history summary").click();
    await page.locator("#voting").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await checkOverflow(`${width} closed poll and history`);
    await page.screenshot({ path: path.join(out, `${width}-poll-history.png`) });
    await page.locator(".l38-poll-history summary").click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for(const status of ["COMPLETED", "ACTIVE", "LOCKED", "FAILED", "SKIPPED", "SECRET"]) {
    await page.locator("#quest-status").selectOption(status); await page.locator("#quest-log").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `390-${status.toLowerCase()}.png`) });
  }
  await page.locator("#quest-status").selectOption("all");
  const secret = await f.db.quest.findFirstOrThrow({ where: { isSecret: true } });
  assert.equal((await page.content()).includes(secret.id), false); assert.equal((await page.content()).includes(secret.title), false);
  // Real server transition, no client-side mock celebration.
  const completeIds = quests.filter((q) => q.id !== active.id).slice(0,37).map((q) => q.id);
  await f.db.quest.updateMany({ where: { id: { in: completeIds } }, data: { status: "COMPLETED", completedAt: new Date() } });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload(); await page.waitForFunction(() => document.getElementById("connection").textContent.includes("connected"));
  await op(`quests/${active.id}`, { action: "complete" }); await page.locator("#level-up").waitFor({ state: "visible" });
  await page.waitForTimeout(1400); await page.screenshot({ path: path.join(out, "1440-celebration.png") });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, "390-celebration.png") });
  await page.keyboard.press("Escape"); assert.equal(await page.locator("#level-up").isVisible(), false);
  await page.reload(); await page.waitForFunction(() => document.getElementById("connection").textContent.includes("connected"));
  assert.equal(await page.locator("#level-up").isVisible(), false);
  const undo = await control(); await op("undo", { auditId: undo.undo.auditId });
  await page.emulateMedia({ reducedMotion: "reduce" }); await op(`quests/${active.id}`, { action: "complete" });
  await page.locator("#level-up").waitFor({ state: "visible" });
  assert.equal(await page.locator("#fireworks").isVisible(), false);
  await page.screenshot({ path: path.join(out, "390-reduced-motion.png") }); await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 844, height: 390 }); await page.evaluate(() => window.scrollTo(0,0));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(out, "844-landscape.png") });
  await page.route("**/img/level38/classes/**", (route) => route.abort());
  await page.reload(); await page.waitForFunction(() => document.getElementById("viewer-name").textContent === "Garnet Moon");
  await page.waitForFunction(() => document.querySelector("#viewer-sprite .l38-sprite").hidden);
  assert.equal(await page.locator("#viewer-sprite .l38-sprite-fallback").isVisible(), true);
  await page.locator("#party").screenshot({ path: path.join(out, "844-sprite-fallback.png") });
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const [cookieName, cookieValue] = mod.cookie.split("="); await admin.addCookies([{ name: cookieName, value: cookieValue, url: f.origin }]);
  const panel = await admin.newPage(); await panel.goto(`${f.origin}/level38/control`); await panel.locator("#quest-board button").first().waitFor();
  await panel.waitForFunction(() => !document.getElementById("operator-controls").disabled);
  await panel.screenshot({ path: path.join(out, "1440-control.png") });
  assert.equal(await panel.locator('link[href="/css/level38-public.css"]').count(), 0);
  await panel.setViewportSize({ width: 390, height: 844 });
  assert.ok(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await panel.screenshot({ path: path.join(out, "390-control.png") });
  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await noScript.newPage(); await staticPage.goto(`${f.origin}/level38`);
  await staticPage.locator("#voting").scrollIntoViewIfNeeded();
  assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await staticPage.screenshot({ path: path.join(out, "390-no-javascript.png") });
  await noScript.close();
  // Empty public states still use the same windows and retain useful guidance.
  await f.db.poll.updateMany({ data: { status: "DRAFT" } });
  await f.db.event.updateMany({ data: { currentGameId: null } });
  await page.unroute("**/img/level38/classes/**");
  await page.reload(); await page.waitForFunction(() => document.getElementById("current-game").textContent === "Between adventures");
  for (const [width,height] of [[1440,1000], [1024,1000], [768,1000], [390,844], [844,390]]) {
    await page.setViewportSize({ width, height });
    await page.locator(".l38-current-game").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await checkOverflow(`${width} empty states`);
    await page.screenshot({ path: path.join(out, `${width}-empty-states.png`) });
  }
  assert.deepEqual(errors, []); assert.deepEqual(csp, []);
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ browser: await browser.version(), widths: [1440,1024,768,390], landscape: [844,390], overflowChecks, errors, csp, screenshots: fs.readdirSync(out).filter((file) => file.endsWith('.png')) }, null, 2));
});
