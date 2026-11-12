const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const ejs = require('ejs');
const { startSite } = require('./helpers.cjs');
const { CHAOS_REWARDS, ChaosStore, validateChaosRewardUpdate } = require('../dist/services/chaos');
const { CHALLENGES } = require('../dist/models/challenges');

test('Chaos reward defaults are unique, safe and require strict owner input', () => {
  assert.equal(CHAOS_REWARDS.length, 5);
  assert.equal(new Set(CHAOS_REWARDS.map(reward => reward.id)).size, CHAOS_REWARDS.length);
  assert.deepEqual(validateChaosRewardUpdate({ enabled: true, cost: 300, cooldownSeconds: 60 }), {
    enabled: true, cost: 300, cooldownSeconds: 60,
  });
  for (const data of [
    {}, null, [], { enabled: 'true', cost: 300, cooldownSeconds: 60 },
    { enabled: true, cost: 0, cooldownSeconds: 60 },
    { enabled: true, cost: 3.1, cooldownSeconds: 60 },
    { enabled: true, cost: 300, cooldownSeconds: -1 },
    { enabled: true, cost: 300, cooldownSeconds: Infinity },
  ]) assert.throws(() => validateChaosRewardUpdate(data));
});

test('Chaos test events are explicitly simulated and rewards are disabled by default', async () => {
  const saved = [];
  const activity = [];
  const db = {
    chaosReward: {
      findMany: async () => saved,
      upsert: async ({ create, update }) => { saved.splice(0, saved.length, { ...create, ...update }); },
    },
    chaosActivity: {
      findMany: async () => activity,
      create: async ({ data }) => {
        const event = { id: 'test-1', ...data, occurredAt: new Date() }; activity.unshift(event); return event;
      },
      findFirst: async () => activity[0] || null,
    },
  };
  const store = new ChaosStore(db);
  const initial = await store.state();
  assert.ok(initial.rewards.every(reward => reward.enabled === false));
  assert.equal(initial.gameConnected, false);
  assert.equal(initial.twitchConnected, false);
  await store.saveReward('give-potion', { cost: 450, cooldownSeconds: 90, enabled: true });
  const updated = await store.state();
  assert.equal(updated.rewards.find(reward => reward.id === 'give-potion').cost, 450);
  const event = await store.simulate('give-potion');
  assert.equal(event.source, 'TEST');
  assert.equal(event.viewer, 'Leo · prueba');
  assert.equal((await store.currentOverlay()).source, 'TEST');
  await assert.rejects(store.simulate('unknown-reward'));
  await assert.rejects(store.saveReward('unknown-reward', { cost: 1, cooldownSeconds: 0, enabled: false }));
});

test('Discreet admin button is available in home, challenge and portfolio', async (t) => {
  const site = await startSite({ TWITCH_LIVE_ENABLED: 'false' });
  t.after(() => site.stop());
  for (const route of ['/', '/portfolio', `/challenges/${CHALLENGES[0].slug}`]) {
    const response = await fetch(site.origin + route);
    assert.equal(response.status, 200, route);
    const dom = new JSDOM(await response.text());
    const link = dom.window.document.querySelector('.footer-admin-link');
    assert.equal(link?.getAttribute('href'), '/admin');
    assert.match(link?.getAttribute('aria-label') || '', /admin/i);
    dom.window.close();
  }
  const overlay = await fetch(site.origin + '/chaos/overlay');
  assert.equal(overlay.status, 200);
  assert.match(await overlay.text(), /MODO PRUEBA/);
  const feed = await fetch(site.origin + '/chaos/api/latest');
  assert.equal(feed.status, 200);
  assert.deepEqual(await feed.json(), { event: null });
});

test('Owner panel offers both sections and laboratory status without a Twitch connection', async () => {
  const admin = await ejs.renderFile('src/views/admin.ejs', { configured: true, authenticated: true });
  const chaos = await ejs.renderFile('src/views/chaos-admin.ejs');
  const mainDom = new JSDOM(admin); const chaosDom = new JSDOM(chaos);
  assert.equal(mainDom.window.document.querySelector('a[href="/admin/chaos"]')?.textContent.trim(), '⚡ Twitch Chaos');
  assert.equal(chaosDom.window.document.querySelector('a[href="/admin"]')?.textContent.trim(), '🎮 Juegos');
  assert.match(chaosDom.window.document.body.textContent, /No gastan puntos de canal/);
  mainDom.window.close(); chaosDom.window.close();
});
