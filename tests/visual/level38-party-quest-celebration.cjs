// Installed Chrome and real Socket.IO flows in isolated local PostgreSQL schemas.
// Browser callbacks are intercepted only by this test to replay a captured packet.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { io } = require('socket.io-client');
const { chromium } = require('../../dist/phase3-qa-tools/node_modules/playwright');
const { fixture } = require('../integration/support.cjs');
const { newToken, hashToken } = require('../../dist/modules/level38/auth');
const { SPRITE_MANIFEST } = require('../../dist/modules/level38/classes');

test('16 party members celebrate a real completed quest for four seconds, preserve identity and return to normal without replay', { timeout: 150000 }, async t => {
  const f = await fixture(t); await f.start(); const owner = await f.operator('Party Chrome owner', 'OWNER');
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-ES' });
  await context.addInitScript(() => {
    window.partyQA = { handlers: new Map(), events: [], snapshots: 0, nodes: [] };
    let socketFactory;
    Object.defineProperty(window, 'io', { configurable: true, get: () => socketFactory, set: original => {
      socketFactory = Object.assign((...args) => {
        const socket = original(...args), on = socket.on.bind(socket);
        socket.on = (name, callback) => {
          const callbacks = window.partyQA.handlers.get(name) || []; callbacks.push(callback); window.partyQA.handlers.set(name, callbacks);
          return on(name, callback);
        };
        socket.onAny((name, payload) => { window.partyQA.events.push({ name, payload, at: performance.now() }); if (name === 'party:snapshot') window.partyQA.snapshots++; });
        return socket;
      }, original);
    } });
  });
  const page = await context.newPage(), errors = [], csp = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) csp.push(message.text()); });
  const out = path.resolve('dist/party-quest-qa'); fs.mkdirSync(out, { recursive: true });
  await page.goto(`${f.origin}/level38/overlay/party`);
  await page.waitForFunction(() => window.partyQA.snapshots === 1);
  const sockets = [], identities = [], choices = SPRITE_MANIFEST.classes.flatMap(job => job.variants.map(variant => ({ classId: job.classId, variantId: variant.variantId })));
  t.after(() => sockets.forEach(socket => socket.disconnect()));
  const heartbeat = setInterval(() => sockets.forEach(socket => socket.emit('party:heartbeat', {})), 15000); t.after(() => clearInterval(heartbeat));
  for (let index = 0; index < 16; index++) {
    const token = newToken(); identities.push(await f.db.participant.create({ data: { tokenHash: hashToken(token),
      nickname: index === 1 ? '<b>Safe long party nickname</b>' : `Party ${index + 1}`, expiresAt: new Date('2030-01-01'), ...choices[index * 3 % choices.length] } }));
    const socket = io(`${f.origin}/level38-party`, { path: '/level38/socket.io', transports: ['websocket'], forceNew: true, auth: { kind: 'viewer' }, extraHeaders: { Origin: f.origin, Cookie: `level38_viewer=${token}` } });
    socket.on('connect', () => socket.emit('party:register', {})); sockets.push(socket);
  }
  await page.waitForFunction(() => document.querySelectorAll('.party-avatar').length === 16);
  await page.waitForTimeout(1700);
  const op = async (route, body) => {
    const controlRevision = (await f.db.event.findFirstOrThrow()).controlRevision;
    const response = await f.call(`/api/control/${route}`, { ...body, controlRevision }, owner.cookie);
    assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data;
  };
  const quests = await f.db.quest.findMany({ where: { isSecret: false, retiredAt: null }, orderBy: { number: 'asc' }, include: { eligibleGames: true } });
  const [quest, failed, skipped, cancelled, selected] = quests;
  const reactions = () => page.evaluate(() => window.partyQA.events.filter(event => event.name === 'party:action' && event.payload.action === 'quest').length);
  for (const [item, action] of [[failed, 'activate'], [failed, 'fail'], [skipped, 'activate'], [skipped, 'skip'], [cancelled, 'activate'], [cancelled, 'available']]) await op(`quests/${item.id}`, { action });
  await op(`quests/${selected.id}/game`, { gameId: selected.eligibleGames.find(game => game.gameId !== selected.gameId).gameId });
  await op(`quests/${quest.id}`, { action: 'activate' });
  await page.waitForTimeout(100); assert.equal(await reactions(), 0);
  assert.equal(await page.locator('.party-avatar[data-action="celebration"]').count(), 0);

  const inspect = () => page.evaluate(() => [...document.querySelectorAll('.party-avatar')].map(node => {
    const image = node.querySelector('.party-art img'), label = node.querySelector('.party-name');
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return { id: node.dataset.presenceId, lane: node.dataset.lane, action: node.dataset.action, x: matrix.m41, y: matrix.m42,
      name: label.textContent, nameHidden: label.hidden, nameOpacity: getComputedStyle(label).opacity,
      image: image?.getAttribute('src'), fallback: node.querySelector('.party-art').dataset.spriteFallback,
      naturalWidth: image?.naturalWidth, naturalHeight: image?.naturalHeight };
  }));
  const initial = await inspect(); assert.deepEqual([...new Set(initial.map(member => member.lane))].sort(), ['0', '1']);
  assert.equal(initial.every(member => member.nameHidden === false && member.nameOpacity === '1' && member.fallback === 'false'), true);
  assert.equal(await page.locator('.party-name b').count(), 0);
  await page.evaluate(() => { window.partyQA.nodes = [...document.querySelectorAll('.party-avatar')]; });
  await page.screenshot({ path: path.join(out, '01-active-before-completion.png'), omitBackground: true });
  await op(`quests/${quest.id}`, { action: 'complete' });
  await page.waitForFunction(() => document.querySelectorAll('.party-avatar[data-action="celebration"]').length === 16);
  await page.waitForTimeout(350);
  const first = await inspect();
  assert.equal(first.every(member => /\/victory\/\d{2}\.png$/.test(member.image) && member.naturalWidth > 0), true);
  assert.equal(await page.locator('.party-avatar.is-quest-celebrating').count(), 16);
  const sparks = await page.locator('.party-art').first().evaluate(node => ({ before: getComputedStyle(node, '::before').animationName, after: getComputedStyle(node, '::after').animationName }));
  assert.notEqual(sparks.before, 'none'); assert.notEqual(sparks.after, 'none');
  assert.equal(await page.locator('#party-fireworks').isVisible(), false);
  assert.equal(await page.locator('#party-celebration').isVisible(), false);
  assert.deepEqual(first.map(({ id, lane, name }) => ({ id, lane, name })), initial.map(({ id, lane, name }) => ({ id, lane, name })));
  assert.equal(await page.evaluate(() => window.partyQA.nodes.every((node, index) => node === document.querySelectorAll('.party-avatar')[index])), true);
  await page.screenshot({ path: path.join(out, '02-all-16-celebrate.png'), omitBackground: true });
  const packet = await page.evaluate(() => window.partyQA.events.find(event => event.name === 'party:action' && event.payload.action === 'quest').payload);
  // Replaying the same server packet must not restart or extend the four-second clock.
  await page.waitForTimeout(900);
  await page.evaluate(payload => window.partyQA.handlers.get('party:action').forEach(callback => callback(payload)), packet);
  await page.waitForTimeout(1500);
  const sustained = await inspect();
  assert.equal(sustained.every(member => member.action === 'celebration' && /\/victory\/\d{2}\.png$/.test(member.image)), true,
    'victory sprites must still animate beyond the old 1.5-second non-looping limit');
  for (let index = 0; index < sustained.length; index++) {
    assert.equal(sustained[index].x, first[index].x, 'celebration must retain each horizontal position');
    assert.equal(sustained[index].lane, first[index].lane);
    assert.equal(sustained[index].name, first[index].name);
  }
  await page.screenshot({ path: path.join(out, '03-victory-still-animated-after-2-seconds.png'), omitBackground: true });
  await page.waitForFunction(() => document.querySelectorAll('.party-avatar[data-action="celebration"]').length === 0, undefined, { timeout: 2500 });
  const elapsed = await page.evaluate(() => performance.now() - window.partyQA.events.find(event => event.name === 'party:action' && event.payload.action === 'quest').at);
  assert.ok(elapsed >= 3700 && elapsed < 4700, `quest reaction duration ${elapsed}ms`);
  const normal = await inspect();
  assert.equal(await page.locator('.party-avatar.is-quest-celebrating').count(), 0);
  assert.equal(normal.every(member => ['walk', 'idle'].includes(member.action) && !member.image.includes('/victory/')), true);
  assert.deepEqual(normal.map(({ id, lane, name }) => ({ id, lane, name })), initial.map(({ id, lane, name }) => ({ id, lane, name })));
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: path.join(out, '04-return-to-normal.png'), omitBackground: true });
  checks.push({ initial, first, sustained, normal, elapsedMs: elapsed });

  await page.evaluate(payload => window.partyQA.handlers.get('party:action').forEach(callback => callback(payload)), packet);
  await page.waitForTimeout(100); assert.equal(await page.locator('.party-avatar[data-action="celebration"]').count(), 0);
  const snapshotCount = await page.evaluate(() => window.partyQA.snapshots);
  await context.setOffline(true); await page.waitForFunction(() => document.getElementById('party-stage').hidden);
  await context.setOffline(false); await page.waitForFunction(before => window.partyQA.snapshots > before && !document.getElementById('party-stage').hidden, snapshotCount);
  assert.equal(await page.locator('.party-avatar[data-action="celebration"]').count(), 0);
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.party-avatar').length === 16);
  assert.equal(await reactions(), 0, 'fresh overlays get no replayed completion event');
  assert.equal(await page.locator('.party-avatar[data-action="celebration"]').count(), 0);
  await page.evaluate(payload => window.partyQA.handlers.get('party:action').forEach(callback => callback(payload)), packet);
  await page.waitForTimeout(100); assert.equal(await page.locator('.party-avatar[data-action="celebration"]').count(), 0);

  // Existing grand finale remains visibly separate and lasts longer than the quest reaction.
  const lastQuest = quests[37];
  await f.db.quest.updateMany({ where: { id: { in: quests.slice(0, 37).map(item => item.id) } }, data: { status: 'COMPLETED', completedAt: new Date() } });
  await op(`quests/${lastQuest.id}`, { action: 'activate' }); await op(`quests/${lastQuest.id}`, { action: 'complete' });
  await page.locator('#party-fireworks').waitFor({ state: 'visible' });
  await page.locator('#party-celebration').waitFor({ state: 'visible' });
  assert.equal(await reactions(), 0, '38th completion uses the existing unlock event alone');
  await page.waitForTimeout(600); await page.screenshot({ path: path.join(out, '05-level38-grand-finale.png'), omitBackground: true });
  await page.waitForTimeout(4100); assert.equal(await page.locator('#party-fireworks').isVisible(), true);
  await page.locator('#party-fireworks').waitFor({ state: 'hidden', timeout: 8000 });
  assert.deepEqual(await f.db.participant.findMany({ orderBy: { createdAt: 'asc' } }), identities);
  assert.equal(await f.db.quest.count({ where: { retiredAt: null } }), 60); assert.equal((await f.db.event.findFirstOrThrow()).target, 38);
  assert.equal(await f.db.poll.count(), 0); assert.deepEqual(errors, []); assert.deepEqual(csp, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: browser.version(), actualOBS: false,
    memberCount: 16, lanes: 2, checks, replayIgnored: true, refreshNoReplay: true, reconnectNoReplay: true,
    nonCompletionTransitionsQuiet: true, grandFinalePreserved: true, errors, csp }, null, 2));
});
