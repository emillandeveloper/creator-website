// Installed Chrome + disposable PostgreSQL schemas. This does not operate OBS or production.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../dist/phase3-qa-tools/node_modules/playwright');
const { fixture } = require('../integration/support.cjs');

const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data; };
const intersects = (a, b) => !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('OBS poll and quest overlays render bilingually, preserve transparency/reload timing, coexist with party and follow real operator transitions', { timeout: 150000 }, async t => {
  const f = await fixture(t); await f.start();
  const owner = await f.operator('Overlay visual owner', 'OWNER');
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const out = path.resolve('dist/level38-overlays-visual-qa'); fs.mkdirSync(out, { recursive: true });
  const errors = [], csp = [], requests = [], checks = [];
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-ES' });
  const watch = (page, trackRequests = true) => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) csp.push(message.text()); });
    if (trackRequests) page.on('request', request => requests.push(new URL(request.url()).pathname));
  };
  const pollPage = await context.newPage(), questPage = await context.newPage(), partyPage = await context.newPage();
  for (const page of [pollPage, questPage, partyPage]) watch(page);
  await Promise.all([
    pollPage.goto(`${f.origin}/level38/overlay/poll?lang=es`),
    questPage.goto(`${f.origin}/level38/overlay/quest?lang=es`),
    partyPage.goto(`${f.origin}/level38/overlay/party`),
  ]);
  for (const [page, selector] of [[pollPage, '#poll-overlay'], [questPage, '#quest-overlay']]) {
    await page.locator(selector).waitFor({ state: 'hidden' });
    const transparent = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
    assert.deepEqual(transparent, { html: 'rgba(0, 0, 0, 0)', body: 'rgba(0, 0, 0, 0)' });
    await page.screenshot({ path: path.join(out, `${selector.slice(1)}-empty.png`), omitBackground: true });
  }
  const state = ok(await f.call('/api/state'));
  const quest = state.quests.find(item => item.number === 43);
  const other = state.quests.find(item => !item.hidden && item.id !== quest.id);
  const revision = async () => (await f.db.event.findFirstOrThrow()).controlRevision;
  const op = async (route, body) => ok(await f.call(`/api/control/${route}`, { ...body, controlRevision: await revision() }, owner.cookie));
  await op(`quests/${quest.id}`, { action: 'activate' });
  await questPage.locator(`#quest-overlay[data-quest-id="${quest.id}"][data-overlay-mode="active"]`).waitFor({ state: 'visible' });
  assert.equal(await questPage.locator('#quest-title').textContent(), '¡Deja de pegarle, Tifa!');
  assert.match(await questPage.locator('#quest-game').textContent(), /Final Fantasy VII Remake Intergrade/);
  assert.equal(await questPage.locator('#quest-objective').textContent(), quest.translations.es.description);
  // Keep the active quest independent of the next-quest poll choices.
  const options = state.quests.filter(item => !item.hidden && item.id !== quest.id).slice(0, 2).map(item => ({ questId: item.id }));
  await op('polls', { title: 'Choose the next quest', type: 'NEXT_QUEST', options });
  const poll = await f.db.poll.findFirstOrThrow({ include: { options: { orderBy: { position: 'asc' } } } });
  await op(`polls/${poll.id}/status`, { action: 'open' });
  await pollPage.locator(`#poll-overlay[data-poll-id="${poll.id}"][data-overlay-mode="open"]`).waitFor({ state: 'visible' });
  assert.equal(await pollPage.locator('#poll-options').locator('li').count(), 2);
  assert.match(await pollPage.locator('#poll-overlay').textContent(), /leonifelheim\.tv\/level38/);
  assert.match(await pollPage.locator('#poll-countdown').textContent(), /^0[01]:[0-5]\d$/);
  const persisted = await f.db.poll.findUniqueOrThrow({ where: { id: poll.id } });
  assert.equal(persisted.endsAt - persisted.openedAt, 60000);
  const remaining = async () => {
    const text = (await pollPage.locator('#poll-countdown').textContent()).trim();
    const [minutes, seconds] = text.split(':').map(Number); return minutes * 60 + seconds;
  };
  let seconds = await remaining();
  assert.ok(Math.abs(seconds - Math.ceil((persisted.endsAt.getTime() - Date.now()) / 1000)) <= 1);
  await pollPage.waitForTimeout(1100); await pollPage.reload();
  await pollPage.locator('#poll-overlay[data-overlay-mode="open"]').waitFor({ state: 'visible' });
  assert.ok(await remaining() < seconds, 'OBS refresh must retain the server deadline');
  assert.equal((await f.db.poll.findUniqueOrThrow({ where: { id: poll.id } })).endsAt.getTime(), persisted.endsAt.getTime());

  // A normal public viewer owns party membership. Overlay tabs never register it.
  const viewerContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto(`${f.origin}/level38`); await viewerPage.locator('#join-open').click();
  await viewerPage.locator('#nickname').fill('Overlay Viewer'); await viewerPage.locator('#nickname').press('Enter');
  await partyPage.waitForFunction(() => document.querySelectorAll('.party-avatar').length === 1);
  const viewerCookie = (await viewerContext.cookies()).find(cookie => cookie.name === 'level38_viewer');
  assert.ok(viewerCookie);
  ok(await f.call(`/api/polls/${poll.id}/vote`, { optionId: poll.options[0].id }, `${viewerCookie.name}=${viewerCookie.value}`));
  await pollPage.waitForFunction(() => document.querySelector('#poll-options').textContent.includes('1'));
  assert.equal(await f.db.participant.count(), 1, 'only the viewer page joins the party');

  async function capture(page, selector, label) {
    // Visibility precedes the stepped entrance animation; wait for the painted frame.
    await page.waitForFunction(selector => {
      const root = document.querySelector(selector);
      return root && !root.hidden && Number(getComputedStyle(root).opacity) === 1 && getComputedStyle(root).transform === 'none';
    }, selector);
    const layout = await page.evaluate(selector => {
      const root = document.querySelector(selector), rect = root.getBoundingClientRect();
      return { html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
        width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hidden: root.hidden };
    }, selector);
    assert.equal(layout.html, 'rgba(0, 0, 0, 0)'); assert.equal(layout.body, 'rgba(0, 0, 0, 0)');
    assert.equal(layout.hidden, false); assert.ok(layout.scrollWidth <= layout.width); assert.ok(layout.scrollHeight <= layout.height);
    assert.ok(layout.bounds.x >= 0 && layout.bounds.y >= 0 && layout.bounds.x + layout.bounds.width <= layout.width && layout.bounds.y + layout.bounds.height <= layout.height);
    checks.push({ label, ...layout }); await page.screenshot({ path: path.join(out, `${label}.png`), omitBackground: true });
    return layout.bounds;
  }
  for (const language of ['es', 'en']) {
    await Promise.all([pollPage.goto(`${f.origin}/level38/overlay/poll?lang=${language}`), questPage.goto(`${f.origin}/level38/overlay/quest?lang=${language}`)]);
    await pollPage.locator('#poll-overlay[data-overlay-mode="open"]').waitFor({ state: 'visible' });
    await questPage.locator('#quest-overlay[data-overlay-mode="active"]').waitFor({ state: 'visible' });
    assert.equal(await questPage.locator('#quest-title').textContent(), quest.translations[language].title);
    assert.equal(await questPage.locator('#quest-objective').textContent(), quest.translations[language].description);
    const questBounds = await capture(questPage, '#quest-overlay', `quest-${language}-1920`);
    const pollBounds = await capture(pollPage, '#poll-overlay', `poll-${language}-1920`);
    const partyBounds = await partyPage.locator('.party-avatar').first().boundingBox();
    assert.ok(!intersects(pollBounds, questBounds), 'independent poll and quest panels overlap at native OBS dimensions');
    assert.ok(!intersects(pollBounds, partyBounds) && !intersects(questBounds, partyBounds), 'new panels overlap the existing party lane');
  }
  for (const [width, height] of [[1280, 720], [768, 600]]) {
    await Promise.all([pollPage.setViewportSize({ width, height }), questPage.setViewportSize({ width, height })]);
    await capture(pollPage, '#poll-overlay', `poll-en-${width}`); await capture(questPage, '#quest-overlay', `quest-en-${width}`);
  }

  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' });
  const [name, value] = owner.cookie.split('='); await admin.addCookies([{ name, value, url: f.origin }]);
  const control = await admin.newPage(); watch(control, false); await control.goto(`${f.origin}/level38/control`);
  await control.locator(`[data-poll-id="${poll.id}"] [data-poll-countdown]`).waitFor({ state: 'visible' });
  assert.equal(await control.locator('#poll-duration').inputValue(), '60');
  assert.ok(await control.locator('[data-poll-countdown]').count() > 0);
  for (const action of ['close', 'cancel', 'extend']) assert.ok(await control.locator(`[data-poll-action="${action}"]`).count() > 0);
  await control.locator('#poll-duration').fill('75');
  for (const language of ['es', 'en']) {
    await control.evaluate(language => window.Level38I18n.setLanguage(language), language);
    await control.locator('#poll-duration').scrollIntoViewIfNeeded();
    await control.screenshot({ path: path.join(out, `control-${language}-duration.png`) });
  }
  await control.locator('#poll-type').selectOption('NEXT_GAME');
  await control.locator('#poll-title').fill('Visual duration draft');
  await control.locator('#poll-options select').nth(0).selectOption(state.games[0].id);
  await control.locator('#poll-options select').nth(1).selectOption(state.games[1].id);
  await control.locator('#save-poll').click();
  await control.waitForFunction(() => document.getElementById('poll-title').value === '' && !document.getElementById('operator-controls').disabled);
  const customDraft = await f.db.poll.findFirstOrThrow({ where: { title: 'Visual duration draft' } });
  assert.equal(customDraft.durationSeconds, 75, 'the actual editor submits the configured duration');
  await control.locator(`[data-poll-id="${poll.id}"] [data-poll-action="extend"]`).click();
  await control.waitForFunction(({id, endsAt}) => document.querySelector(`[data-poll-id="${id}"] [data-poll-countdown]`)?.dataset.endsAt === endsAt,
    { id: poll.id, endsAt: new Date(persisted.endsAt.getTime() + 30000).toISOString() });
  assert.equal((await f.db.poll.findUniqueOrThrow({ where: { id: poll.id } })).endsAt.getTime(), persisted.endsAt.getTime() + 30000);
  control.on('dialog', dialog => dialog.accept());
  await control.locator(`[data-poll-id="${poll.id}"] [data-poll-action="close"]`).click();
  await pollPage.locator('#poll-overlay').waitFor({ state: 'hidden' });
  await op(`polls/${poll.id}/winner`, { optionId: poll.options[0].id });
  await pollPage.locator('#poll-overlay[data-overlay-mode="winner"]').waitFor({ state: 'visible' });
  await capture(pollPage, '#poll-overlay', 'winner-en');
  await pollPage.reload(); await pollPage.locator('#poll-overlay[data-overlay-mode="winner"]').waitFor({ state: 'visible' });
  await pollPage.locator('#poll-overlay').waitFor({ state: 'hidden', timeout: 12000 });
  await op(`quests/${quest.id}`, { action: 'complete' });
  await questPage.locator('#quest-overlay[data-overlay-mode="complete"]').waitFor({ state: 'visible' });
  assert.match(await questPage.locator('#quest-complete').textContent(), /QUEST COMPLETE!/);
  await capture(questPage, '#quest-overlay', 'quest-complete-en');
  await questPage.locator('#quest-overlay').waitFor({ state: 'hidden', timeout: 6000 });
  await op(`quests/${other.id}`, { action: 'activate' });
  await questPage.locator(`#quest-overlay[data-quest-id="${other.id}"][data-overlay-mode="active"]`).waitFor({ state: 'visible' });
  await op(`quests/${other.id}`, { action: 'skip' }); await questPage.locator('#quest-overlay').waitFor({ state: 'hidden' });
  const cancelled = customDraft;
  await op(`polls/${cancelled.id}/status`, { action: 'open' });
  await pollPage.locator(`#poll-overlay[data-poll-id="${cancelled.id}"][data-overlay-mode="open"]`).waitFor({ state: 'visible' });
  await control.locator(`[data-poll-id="${cancelled.id}"] [data-poll-action="cancel"]`).click();
  await pollPage.locator('#poll-overlay').waitFor({ state: 'hidden' });
  assert.equal((await f.db.poll.findUniqueOrThrow({ where: { id: cancelled.id } })).closeReason, 'CANCELLED');
  for (const secret of await f.db.quest.findMany({ where: { isSecret: true } })) {
    for (const page of [pollPage, questPage]) {
      const html = await page.content(); assert.ok(!html.includes(secret.title)); assert.ok(!html.includes(secret.description));
    }
  }
  assert.equal(await f.db.quest.count({ where: { retiredAt: null } }), 60);
  assert.equal((await f.db.event.findFirstOrThrow()).target, 38);
  const overlayRequests = requests.filter(route => route.startsWith('/level38/api/'));
  assert.equal(overlayRequests.includes('/level38/api/session'), false);
  assert.equal(overlayRequests.some(route => route.startsWith('/level38/api/control/')), false);
  assert.deepEqual(errors, []); assert.deepEqual(csp, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: browser.version(), actualOBS: false, checks, errors, csp, overlayRequests }, null, 2));
});
