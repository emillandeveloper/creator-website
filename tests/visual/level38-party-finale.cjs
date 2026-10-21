// Real installed Chromium, real Socket.IO and disposable PostgreSQL schemas.
// Instrumentation observes the existing renderer/effect; it never starts a fake animation.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { io } = require('socket.io-client');
const { chromium } = require('../../dist/phase3-qa-tools/node_modules/playwright');
const { fixture } = require('../integration/support.cjs');
const { newToken, hashToken } = require('../../dist/modules/level38/auth');
const manifest = require('../../public/level38/classes/manifest.json');

function observe() {
  window.finaleQA = { starts: [], packets: [], frames: [], sockets: 0 };
  let effects, sprites, socketFactory;
  Object.defineProperty(window, 'Level38PartyFireworks', { get: () => effects, set: value => {
    const create = value.create;
    value.create = (...args) => {
      const effect = create(...args), start = effect.start.bind(effect);
      effect.start = (now, quiet) => { window.finaleQA.starts.push({ at: now, quiet }); return start(now, quiet); };
      return effect;
    };
    effects = value;
  } });
  Object.defineProperty(window, 'Level38Sprites', { get: () => sprites, set: value => {
    const render = value.render;
    value.render = (root, ...args) => {
      const renderer = render(root, ...args), paint = renderer.paint.bind(renderer); let previous;
      renderer.paint = (action, elapsed, mirrored) => {
        const selected = paint(action, elapsed, mirrored), signature = `${selected?.action}:${selected?.index}`;
        if (signature !== previous) {
          window.finaleQA.frames.push({ id: root.parentElement.dataset.presenceId, at: performance.now(), requested: action,
            selected: selected?.action, index: selected?.index, image: root.querySelector('img')?.getAttribute('src') });
          previous = signature;
        }
        return selected;
      };
      return renderer;
    };
    sprites = value;
  } });
  Object.defineProperty(window, 'io', { configurable: true, get: () => socketFactory, set: original => {
    socketFactory = Object.assign((...args) => {
      const socket = original(...args); window.finaleQA.sockets++;
      socket.onAny((name, payload) => window.finaleQA.packets.push({ name, payload })); return socket;
    }, original);
  } });
}
async function inspect(page) {
  return page.evaluate(() => ({ elapsed: performance.now() - window.finaleQA.starts.at(-1).at,
    stageZ: getComputedStyle(document.getElementById('party-stage')).zIndex,
    fireworksZ: getComputedStyle(document.getElementById('party-fireworks')).zIndex,
    fireworks: !document.getElementById('party-fireworks').hidden,
    avatars: [...document.querySelectorAll('.party-avatar')].map(node => {
      const image = node.querySelector('.party-art img'), art = node.querySelector('.party-art'), label = node.querySelector('.party-name');
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform), bounds = image.getBoundingClientRect();
      return { id: node.dataset.presenceId, action: node.dataset.action, direction: node.dataset.direction, lane: node.dataset.lane,
        x: matrix.m41, y: matrix.m42, name: label.textContent, nameHidden: label.hidden, nameOpacity: getComputedStyle(label).opacity,
        image: image.getAttribute('src'), fallback: art.dataset.spriteFallback, naturalWidth: image.naturalWidth,
        imageVisible: !image.hidden && getComputedStyle(image).display !== 'none' && getComputedStyle(image).visibility === 'visible' && getComputedStyle(node).opacity === '1',
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
    }) }));
}
async function waitAge(page, age) {
  await page.waitForFunction(age => window.finaleQA.starts.length && performance.now() - window.finaleQA.starts.at(-1).at >= age, age);
}
function stable(avatars) { return avatars.map(({ id, name, lane, direction, x, y }) => ({ id, name, lane, direction, x, y })); }
function eventProgress({ revision, controlRevision, updatedAt, ...event }) { return event; }

test('preview crowds and live Test Finale visibly hold authored victory sprites throughout the genuine finale path', { timeout: 180000 }, async t => {
  const f = await fixture(t); await f.start(); const owner = await f.operator('Finale Chrome owner', 'OWNER');
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const out = path.resolve('dist/level38-finale-qa'); fs.mkdirSync(out, { recursive: true });
  const admin = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-ES' });
  const [name, value] = owner.cookie.split('='); await admin.addCookies([{ name, value, url: f.origin }]);
  await admin.addInitScript(observe);
  const publicContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-ES' });
  await publicContext.addInitScript(observe);
  const preview = await admin.newPage(), live = await publicContext.newPage(), control = await admin.newPage();
  const errors = [], csp = [], checks = [];
  for (const page of [preview, live, control]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) csp.push(message.text()); });
  }
  async function capture(page, label, age, count, previous) {
    await waitAge(page, age);
    // Frame 00 is identical to idle for most authored sprites. Capture the visible
    // raised-arm frame 01, as well as asserting both actual frames in the trace.
    try {
      await page.waitForFunction(count => [...document.querySelectorAll('.party-avatar img')].filter(img => img.getAttribute('src')?.endsWith('/victory/01.png') && img.complete && img.naturalWidth > 0).length === count, count, { timeout: 4000 });
    } catch (error) {
      fs.writeFileSync(path.join(out, `${label}-failure.json`), JSON.stringify(await page.evaluate(() => ({ hidden: document.hidden, qa: window.finaleQA,
        nodes: [...document.querySelectorAll('.party-avatar')].map(node => ({ action: node.dataset.action, src: node.querySelector('img')?.getAttribute('src'), complete: node.querySelector('img')?.complete, naturalWidth: node.querySelector('img')?.naturalWidth })) })), null, 2));
      await page.screenshot({ path: path.join(out, `${label}-failure.png`), omitBackground: true }); throw error;
    }
    const sample = await inspect(page); assert.equal(sample.avatars.length, count); assert.equal(sample.fireworks, true);
    assert.ok(Number(sample.stageZ) > Number(sample.fireworksZ), 'characters must composite above the fireworks canvas');
    for (const avatar of sample.avatars) {
      assert.equal(avatar.action, 'celebration'); assert.match(avatar.image, /\/victory\/01\.png$/);
      assert.equal(avatar.fallback, 'false'); assert.ok(avatar.naturalWidth > 0); assert.equal(avatar.imageVisible, true);
      assert.equal(avatar.nameHidden, false); assert.equal(avatar.nameOpacity, '1');
      assert.ok(avatar.bounds.y >= 0 && avatar.bounds.y + avatar.bounds.height <= 1080);
    }
    if (previous) assert.deepEqual(stable(sample.avatars), stable(previous.avatars), 'all names, lanes, directions and positions stay frozen throughout the finale');
    await page.screenshot({ path: path.join(out, `${label}.png`), omitBackground: true });
    await page.screenshot({ path: path.join(out, `${label}-party.png`), clip: { x: 0, y: 880, width: 1920, height: 200 }, omitBackground: true });
    checks.push({ label, ...sample }); return sample;
  }
  async function fullFinale(page, label, count, trigger) {
    const startCount = await page.evaluate(() => window.finaleQA.starts.length);
    await trigger(); await page.waitForFunction(before => window.finaleQA.starts.length > before, startCount);
    const first = await capture(page, `${label}-01-start`, 350, count);
    await capture(page, `${label}-02-middle`, 5350, count, first);
    await capture(page, `${label}-03-end`, 9350, count, first);
    await page.locator('#party-fireworks').waitFor({ state: 'hidden', timeout: 2500 });
    await page.waitForFunction(() => [...document.querySelectorAll('.party-avatar')].every(node => ['walk', 'idle'].includes(node.dataset.action) && !node.querySelector('img').getAttribute('src').includes('/victory/')));
    const after = await inspect(page); assert.ok(after.elapsed >= 9900 && after.elapsed < 11000, `finale finished after ${after.elapsed}ms`);
    assert.deepEqual(after.avatars.map(({ id, name, lane }) => ({ id, name, lane })), first.avatars.map(({ id, name, lane }) => ({ id, name, lane })));
    const trace = await page.evaluate(() => {
      const started = window.finaleQA.starts.at(-1).at;
      return window.finaleQA.frames.filter(frame => frame.at >= started && frame.at < started + 9900);
    });
    for (const avatar of first.avatars) {
      const frames = trace.filter(frame => frame.id === avatar.id);
      assert.equal(frames.every(frame => frame.requested === 'celebration' && frame.selected === 'celebration' && /\/victory\/\d{2}\.png$/.test(frame.image)), true,
        'the shared renderer must never fall back to idle/walk during the effect');
      assert.deepEqual([...new Set(frames.map(frame => frame.index))].sort(), [0, 1]);
      assert.ok(frames.some(frame => frame.at > first.elapsed - 500 + (frames[0]?.at || 0) + 7000), 'victory frames must still alternate near the finale end');
    }
    await page.screenshot({ path: path.join(out, `${label}-04-normal.png`), omitBackground: true });
    checks.push({ label: `${label}-normal`, ...after, actualVictorySelections: trace.length });
    return first;
  }

  // A real empty OBS source stays empty; use the isolated OWNER preview for a safe visual crowd.
  await live.goto(`${f.origin}/level38/overlay/party`);
  await live.waitForFunction(() => window.finaleQA.packets.some(packet => packet.name === 'party:snapshot'));
  assert.equal(await live.locator('.party-avatar').count(), 0);
  await control.goto(`${f.origin}/level38/control`); await control.locator('#owner-tools > summary').click();
  await control.locator('[data-owner-tool="preview"]').waitFor({ state: 'visible' });
  const testFinale = async () => {
    // The control page's existing celebration is intentionally modal until its
    // local dismiss button is pressed; dismiss it before issuing another test.
    if (await control.locator('#level-up').isVisible()) await control.locator('#celebration-dismiss').click();
    control.once('dialog', dialog => dialog.accept());
    const [response] = await Promise.all([
      control.waitForResponse(response => response.url().endsWith('/api/owner/tools/preview') && response.request().method() === 'POST'),
      control.locator('[data-owner-tool="preview"]').click(),
    ]);
    assert.equal(response.status(), 200);
  };
  await testFinale(); await live.locator('#party-fireworks').waitFor({ state: 'visible' });
  assert.equal(await live.locator('.party-avatar').count(), 0); assert.equal(await f.db.participant.count(), 0);
  await live.screenshot({ path: path.join(out, 'real-empty-party-no-invented-members.png'), omitBackground: true });
  await live.reload(); await live.waitForFunction(() => window.finaleQA.packets.some(packet => packet.name === 'party:snapshot'));
  assert.equal(await live.locator('#party-fireworks').isVisible(), false, 'preview does not replay on reload');

  const beforeIsolated = await f.db.event.findFirstOrThrow(), auditBeforeIsolated = await f.db.auditLog.count();
  for (const count of [1, 15, 30]) {
    await preview.bringToFront();
    await preview.goto(`${f.origin}/level38/overlay/party?preview=${count}`);
    await preview.waitForFunction(count => document.querySelectorAll('.party-avatar').length === count, count);
    await preview.locator('#preview-finale').click(); await capture(preview, `isolated-${count}-victory`, 350, count);
    assert.equal(await preview.evaluate(() => window.finaleQA.sockets), 0);
  }
  await preview.goto(`${f.origin}/level38/overlay/party?preview=5`);
  await preview.waitForFunction(() => document.querySelectorAll('.party-avatar').length === 5);
  await fullFinale(preview, 'isolated-5', 5, () => preview.locator('#preview-finale').click());
  assert.equal(await preview.evaluate(() => window.finaleQA.sockets), 0);
  assert.deepEqual(await f.db.event.findFirstOrThrow(), beforeIsolated); assert.equal(await f.db.auditLog.count(), auditBeforeIsolated);
  assert.equal(await f.db.participant.count(), 0);

  const choices = manifest.classes.flatMap(job => job.variants.map(variant => ({ classId: job.classId, variantId: variant.variantId })));
  const viewers = [], identities = []; t.after(() => viewers.forEach(viewer => viewer.disconnect()));
  const heartbeat = setInterval(() => viewers.forEach(viewer => viewer.emit('party:heartbeat', {})), 15000); t.after(() => clearInterval(heartbeat));
  for (let index = 0; index < 16; index++) {
    const token = newToken(); identities.push(await f.db.participant.create({ data: { tokenHash: hashToken(token), nickname: `Finale ${index + 1}`,
      expiresAt: new Date('2030-01-01'), ...choices[index * 7 % choices.length] } }));
    const viewer = io(`${f.origin}/level38-party`, { path: '/level38/socket.io', transports: ['websocket'], forceNew: true,
      auth: { kind: 'viewer' }, extraHeaders: { Origin: f.origin, Cookie: `level38_viewer=${token}` } });
    viewer.on('connect', () => viewer.emit('party:register', {})); viewers.push(viewer);
  }
  await live.waitForFunction(() => document.querySelectorAll('.party-avatar').length === 16);
  const beforeTest = await f.db.event.findFirstOrThrow(), questsBefore = await f.db.quest.findMany({ orderBy: { number: 'asc' } });
  const testSample = await fullFinale(live, 'real-test-16', 16, testFinale);
  assert.deepEqual([...new Set(testSample.avatars.map(avatar => avatar.lane))].sort(), ['0', '1']);
  assert.equal(await live.evaluate(() => window.finaleQA.packets.filter(packet => packet.name === 'level38:celebration-preview').length), 1);
  assert.deepEqual(eventProgress(await f.db.event.findFirstOrThrow()), eventProgress(beforeTest));
  assert.deepEqual(await f.db.quest.findMany({ orderBy: { number: 'asc' } }), questsBefore);
  assert.deepEqual(await f.db.participant.findMany({ orderBy: { createdAt: 'asc' } }), identities);
  assert.equal(await f.db.poll.count(), 0); assert.equal(await f.db.vote.count(), 0);
  assert.equal(await live.evaluate(() => sessionStorage.getItem('level38:party:last-unlock')), null);
  for (const avatar of testSample.avatars) {
    const identity = identities.find(identity => identity.nickname === avatar.name);
    assert.ok(avatar.image.startsWith(`/level38/classes/${identity.classId}/${identity.variantId}/victory/`), 'actual sprites retain their server-assigned class and variant');
  }

  // The real 38th completion must traverse the same renderer/effect as Test Finale.
  const quests = questsBefore.filter(quest => !quest.isSecret && !quest.retiredAt);
  await f.db.quest.updateMany({ where: { id: { in: quests.slice(0, 37).map(quest => quest.id) } }, data: { status: 'COMPLETED', completedAt: new Date() } });
  const op = async action => {
    const controlRevision = (await f.db.event.findFirstOrThrow()).controlRevision;
    const result = await f.call(`/api/control/quests/${quests[37].id}`, { action, controlRevision }, owner.cookie); assert.equal(result.status, 200, JSON.stringify(result.data));
  };
  await op('activate');
  const genuineSample = await fullFinale(live, 'genuine-38th-16', 16, () => op('complete'));
  assert.deepEqual(genuineSample.avatars.map(avatar => avatar.image), testSample.avatars.map(avatar => avatar.image));
  assert.equal(await live.evaluate(() => window.finaleQA.packets.filter(packet => packet.name === 'level38:unlocked').length), 1);
  assert.equal(await live.evaluate(() => sessionStorage.getItem('level38:party:last-unlock')), '1');
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence, 1);
  assert.equal(await f.db.quest.count({ where: { status: 'COMPLETED', retiredAt: null } }), 38);

  await preview.emulateMedia({ reducedMotion: 'reduce' });
  await preview.locator('#preview-finale').click(); const reduced = await capture(preview, 'reduced-5-static-victory', 350, 5);
  const quietCanvas = await preview.locator('#party-fireworks').evaluate(canvas => canvas.toDataURL());
  const lateReduced = await capture(preview, 'reduced-5-static-near-end', 3350, 5, reduced);
  assert.equal(await preview.locator('#party-fireworks').evaluate(canvas => canvas.toDataURL()), quietCanvas);
  assert.deepEqual(lateReduced.avatars.map(avatar => avatar.image), reduced.avatars.map(avatar => avatar.image));
  await preview.locator('#party-fireworks').waitFor({ state: 'hidden', timeout: 1500 });
  await preview.waitForFunction(() => [...document.querySelectorAll('.party-avatar')].every(node => node.dataset.action === 'idle' && !node.querySelector('img').getAttribute('src').includes('/victory/')));
  const reducedAfter = await inspect(preview); assert.ok(reducedAfter.elapsed >= 3900 && reducedAfter.elapsed < 4700);
  await preview.screenshot({ path: path.join(out, 'reduced-5-normal.png'), omitBackground: true });
  assert.deepEqual(await f.db.participant.findMany({ orderBy: { createdAt: 'asc' } }), identities);
  assert.equal(await f.db.quest.count({ where: { retiredAt: null } }), 60); assert.equal((await f.db.event.findFirstOrThrow()).target, 38);
  assert.equal(await f.db.poll.count(), 0); assert.deepEqual(errors, []); assert.deepEqual(csp, []);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: browser.version(), actualOBS: false, productionAccess: false,
    isolatedCounts: [1, 5, 15, 30], liveMemberCount: 16, liveLanes: 2, realEmptyOverlayInventedMembers: false,
    genuineAndTestShareAuthoredVictoryFrames: true, ownerTestChangesGameplayProgress: false,
    reducedMotionStaticRaisedArmPose: true, reducedDurationMs: reducedAfter.elapsed, checks, errors, csp }, null, 2));
});
