// Browser UI + real Socket.IO + signed EventSub + simulated Helix. Never calls
// the broadcaster's channel or uses production credentials/data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../dist/phase3-qa-tools/node_modules/playwright');
const { nativeFixture } = require('../integration/twitch-polls-support.cjs');
const { origin } = require('../twitch-fake.cjs');

test('actual native poll editor and OBS overlay complete all types, including global/contextual NEXT_GAME', { timeout: 240000 }, async t => {
  const f = await nativeFixture(t);
  const before = await f.service.state(), checks = [], errors = [], csp = [];
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, locale: 'es-ES' });
  await context.addInitScript(() => localStorage.setItem('level38:language', 'en'));
  const [name, value] = f.owner.cookie.split('='); await context.addCookies([{ name, value, url: f.url }]);
  const control = await context.newPage(), overlay = await context.newPage(), publicPage = await context.newPage();
  const out = path.resolve('dist/level38-native-polls-qa'); fs.mkdirSync(out, { recursive: true });
  for (const page of [control, overlay, publicPage]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) csp.push(message.text()); });
  }
  // Fixture's ephemeral HTTP origin only needs the CSRF Origin header adapted
  // to the configured public HTTPS callback origin; no UI responses are mocked.
  await control.route('**/level38/api/**', async route => {
    const response = await route.fetch({ headers: { ...route.request().headers(), ...(route.request().method() === 'POST' ? { origin } : {}) } });
    await route.fulfill({ response });
  });
  await Promise.all([control.goto(f.url + '/control'), overlay.goto(f.url + '/overlay/poll?lang=en'), publicPage.goto(f.url)]);
  await control.waitForFunction(() => !document.getElementById('operator-controls').disabled);
  await publicPage.waitForFunction(() => !document.getElementById('join-open').disabled);
  const initialParticipants = await f.db.participant.count();
  const choices = before.quests.filter(quest => !quest.hidden && quest.status === 'AVAILABLE').slice(0, 2);
  const multi = before.quests.find(quest => !quest.hidden && quest.status === 'AVAILABLE' && quest.eligibleGameIds.length >= 2);
  const singles = before.quests.filter(quest => !quest.hidden && quest.eligibleGameIds.length === 1);
  const variants = [
    { name: 'next-quest', type: 'NEXT_QUEST', ids: choices.map(quest => quest.id) },
    { name: 'next-game-global', type: 'NEXT_GAME', ids: before.games.slice(0, 2).map(game => game.id) },
    { name: 'next-game-context', type: 'NEXT_GAME', context: multi.id, ids: multi.eligibleGameIds.slice(0, 2) },
    { name: 'yes-no', type: 'YES_NO' },
    { name: 'custom', type: 'CUSTOM', labels: ['A custom choice', 'Another custom choice'] },
  ];
  control.on('dialog', dialog => dialog.accept());
  async function idle() { await control.waitForFunction(() => !document.getElementById('operator-controls').disabled); }
  async function write(input, title) {
    await control.locator('#poll-type').selectOption(input.type);
    await control.locator('#poll-title').fill(title);
    await control.locator('#poll-duration').fill('60');
    if (input.type === 'NEXT_GAME') {
      const contexts = await control.locator('#poll-quest option').evaluateAll(options => options.map(option => option.value));
      for (const single of singles) assert.ok(!contexts.includes(single.id), 'single-game missions cannot be offered as two-choice game polls');
      await control.locator('#poll-quest').selectOption(input.context || '');
    }
    if (input.ids) {
      for (const select of await control.locator('#poll-options select').all()) await select.selectOption('');
      for (let index = 0; index < input.ids.length; index++) await control.locator('#poll-options select').nth(index).selectOption(input.ids[index]);
    }
    if (input.labels) for (let index = 0; index < input.labels.length; index++) await control.locator('#poll-options .l38-option-editor').nth(index).locator('input').first().fill(input.labels[index]);
  }
  for (const input of variants) {
    const title = `Twitch UI ${input.name}`;
    await write(input, title);
    const saving = control.waitForResponse(response => new URL(response.url()).pathname === '/level38/api/control/polls' && response.request().method() === 'POST');
    await control.locator('#save-poll').click();
    const saved = await saving; assert.equal(saved.status(), 200, await saved.text()); await idle();
    let poll = await f.db.poll.findFirstOrThrow({ where: { title }, include: { options: { orderBy: { position: 'asc' } } } });
    if (input.ids) assert.deepEqual(poll.options.map(option => input.type === 'NEXT_QUEST' ? option.questId : option.gameId), input.ids);
    assert.equal(poll.contextQuestId, input.context || null);
    // Reopen the actual draft editor, change its type, return to the original,
    // and reload it again. No stale quest context or mixed option IDs may leak.
    const card = control.locator(`[data-poll-id="${poll.id}"]`);
    await card.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await control.locator('#poll-type').selectOption(input.type === 'CUSTOM' ? 'NEXT_QUEST' : 'CUSTOM');
    await control.locator('#cancel-poll-edit').click();
    await card.getByRole('button', { name: 'Edit draft', exact: true }).click();
    assert.equal(await control.locator('#poll-type').inputValue(), input.type);
    assert.equal(await control.locator('#poll-quest').inputValue(), input.context || '');
    if (input.ids) assert.deepEqual(await control.locator('#poll-options select').evaluateAll(selects => selects.map(select => select.value)), input.ids);
    await control.locator('#cancel-poll-edit').click();
    const opening = control.waitForResponse(response => new URL(response.url()).pathname === `/level38/api/control/polls/${poll.id}/status` && response.request().method() === 'POST');
    await card.locator('[data-poll-action="open"]').click();
    const opened = await opening; assert.equal(opened.status(), 200, await opened.text()); await idle();
    poll = await f.dbPoll(poll.id); const upstream = f.fake.polls.find(remote => remote.id === poll.twitchPollId);
    assert.ok(upstream); assert.equal(upstream.title, title);
    await overlay.locator(`#poll-overlay[data-poll-id="${poll.id}"][data-overlay-mode="open"]`).waitFor({ state: 'visible' });
    assert.match(await overlay.locator('#poll-overlay').textContent(), /Twitch/i);
    assert.doesNotMatch(await overlay.locator('#poll-overlay').textContent(), /leonifelheim\.tv\/level38/i);
    assert.match(await overlay.locator('#poll-countdown').textContent(), /^0[01]:[0-5]\d$/);
    const begin = await f.sendPoll('channel.poll.begin', upstream); assert.equal(begin.status, 204);
    const update = await f.sendPoll('channel.poll.progress', upstream, { votes: [8, 2] }); assert.equal(update.status, 204);
    await overlay.waitForFunction(() => [...document.querySelectorAll('#poll-options .obs-option-votes')].map(node => node.textContent).join(',') === '8,2');
    assert.equal(await overlay.locator('#poll-options li').first().evaluate(node => node.style.getPropertyValue('--vote-percent')), '80%');
    await overlay.waitForFunction(() => { const node = document.getElementById('poll-overlay'); return getComputedStyle(node).opacity === '1' && getComputedStyle(node).transform === 'none'; });
    const publicCard = publicPage.locator(`[data-poll-id="${poll.id}"]`);
    await publicCard.waitFor({ state: 'visible' });
    assert.equal(await publicCard.locator('button').count(), 0, 'public website must not offer parallel voting buttons');
    assert.equal(await publicCard.getByRole('link', { name: 'Vote on Twitch', exact: true }).getAttribute('href'), 'https://www.twitch.tv/leonifelheim');
    await overlay.screenshot({ path: path.join(out, `${input.name}-live-votes.png`), omitBackground: true });
    await overlay.reload(); await overlay.locator(`#poll-overlay[data-poll-id="${poll.id}"][data-overlay-mode="open"]`).waitFor({ state: 'visible' });
    assert.deepEqual(await overlay.locator('#poll-options .obs-option-votes').allTextContents(), ['8', '2']);
    const closing = control.waitForResponse(response => new URL(response.url()).pathname === `/level38/api/control/polls/${poll.id}/status` && response.request().method() === 'POST');
    await card.locator('[data-poll-action="close"]').click();
    const closed = await closing; assert.equal(closed.status(), 200, await closed.text()); await idle();
    assert.equal((await f.sendPoll('channel.poll.end', upstream, { votes: [8, 2], status: 'terminated' })).status, 204);
    await overlay.locator(`#poll-overlay[data-poll-id="${poll.id}"][data-overlay-mode="winner"]`).waitFor({ state: 'visible' });
    const final = await f.statePoll(poll.id); assert.equal(final.effectiveWinnerId, poll.options[0].id); assert.equal(final.resultsFinal, true);
    assert.ok(f.fake.pollCalls.some(call => call.method === 'PATCH' && call.body.id === upstream.id));
    await overlay.screenshot({ path: path.join(out, `${input.name}-final-winner.png`), omitBackground: true });
    checks.push({ type: input.type, context: !!input.context, options: poll.options.length, finalVotes: final.totalVotes, winnerLinkedCorrectly: final.effectiveWinnerId === poll.options[0].id });
  }
  await control.setViewportSize({ width: 390, height: 844 }); await write(variants[1], 'NEXT_GAME narrow editor');
  await control.locator('#poll-editor').scrollIntoViewIfNeeded();
  assert.ok(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await control.screenshot({ path: path.join(out, 'next-game-editor-390.png') });
  const finalState = await f.service.state();
  assert.equal(finalState.event.completed, before.event.completed); assert.equal(finalState.event.currentGameId, before.event.currentGameId);
  assert.equal(finalState.event.target, 38); assert.equal(await f.db.quest.count({ where: { retiredAt: null } }), 60);
  assert.equal(await f.db.vote.count(), 0); assert.equal(await f.db.participant.count(), initialParticipants);
  assert.equal(await f.db.participant.count({ where: { nickname: { not: null } } }), 0, 'viewing results must never join a named party member');
  assert.deepEqual(errors, []); assert.deepEqual(csp, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: browser.version(), actualOBS: false, actualUI: true, fakeTwitch: true, checks, errors, csp, productionChanged: false }, null, 2));
});
