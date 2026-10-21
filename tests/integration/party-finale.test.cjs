const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { setTimeout: delay } = require('node:timers/promises');
const { fixture } = require('./support.cjs');

async function until(check) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await check()) return; await delay(30); }
  throw new Error('Party finale condition timed out');
}
function socket(t, f, namespace, auth, cookie) {
  const client = io(`${f.origin}/${namespace}`, { path: '/level38/socket.io', transports: ['websocket'], forceNew: true,
    autoConnect: false, ...(auth ? { auth } : {}), extraHeaders: { Origin: f.origin, ...(cookie ? { Cookie: cookie } : {}) } });
  t.after(() => client.disconnect()); return client;
}
async function overlay(t, f) {
  const client = socket(t, f, 'level38-party', { kind: 'overlay' }), events = [];
  client.onAny((name, payload) => events.push({ name, payload })); client.connect();
  await until(() => events.some(event => event.name === 'party:snapshot'));
  return { client, events };
}
function progress({ revision, controlRevision, updatedAt, ...event }) { return event; }

test('OWNER Test Finale reaches live party overlays without changing quests, participants, polls or durable unlock progress', { timeout: 90000 }, async t => {
  const f = await fixture(t); await f.start(); const owner = await f.operator('Finale owner', 'OWNER');
  const watcher = await overlay(t, f), publicEvents = [], publicClient = socket(t, f, 'level38');
  publicClient.onAny((name, payload) => publicEvents.push({ name, payload })); publicClient.connect();
  await until(() => publicEvents.some(event => event.name === 'level38:state'));
  const before = await f.db.event.findFirstOrThrow(), quests = await f.db.quest.findMany({ orderBy: { number: 'asc' } });
  assert.equal(await f.db.participant.count(), 0);
  assert.deepEqual(watcher.events.find(event => event.name === 'party:snapshot').payload.members, []);
  const preview = async () => {
    const controlRevision = (await f.db.event.findFirstOrThrow()).controlRevision;
    const response = await f.call('/api/owner/tools/preview', { confirmation: 'PREVIEW LEVEL 38', controlRevision }, owner.cookie);
    assert.equal(response.status, 200, JSON.stringify(response.data));
  };
  await preview();
  await until(() => watcher.events.some(event => event.name === 'level38:celebration-preview'));
  await until(() => publicEvents.some(event => event.name === 'level38:celebration-preview'));
  const packet = watcher.events.find(event => event.name === 'level38:celebration-preview').payload;
  assert.deepEqual(packet, publicEvents.find(event => event.name === 'level38:celebration-preview').payload);
  assert.equal(packet.version, 1); assert.equal(packet.target, 38); assert.ok(Number.isFinite(packet.startsAt));
  assert.equal(packet.sequence, undefined); assert.equal(packet.completed, undefined);
  assert.equal(watcher.events.some(event => event.name === 'party:joined'), false, 'an empty real overlay must not acquire fake members');
  assert.equal(await f.db.participant.count(), 0);
  const beforeOwnerPage = await f.db.event.findFirstOrThrow(), auditBeforeOwnerPage = await f.db.auditLog.count();
  for (const count of [1, 5, 15, 30]) assert.equal((await f.call(`/overlay/party?preview=${count}`, undefined, owner.cookie)).status, 200);
  assert.deepEqual(await f.db.event.findFirstOrThrow(), beforeOwnerPage);
  assert.equal(await f.db.auditLog.count(), auditBeforeOwnerPage);
  assert.equal(await f.db.participant.count(), 0, 'OWNER visual-only crowds never register participants');

  for (const name of ['Finale A', 'Finale B', 'Finale C', 'Finale D', 'Finale E']) {
    const cookie = await f.viewer(name), viewer = socket(t, f, 'level38-party', { kind: 'viewer' }, cookie);
    viewer.on('connect', () => viewer.emit('party:register', {})); viewer.connect();
  }
  await until(() => watcher.events.filter(event => event.name === 'party:joined').length === 5);
  const participants = await f.db.participant.findMany({ orderBy: { createdAt: 'asc' } });
  await preview(); await until(() => watcher.events.filter(event => event.name === 'level38:celebration-preview').length === 2);
  const packets = watcher.events.filter(event => event.name === 'level38:celebration-preview').map(event => event.payload);
  assert.notEqual(packets[0].id, packets[1].id);
  assert.equal(watcher.events.some(event => event.name === 'level38:unlocked'), false);
  assert.equal(watcher.events.some(event => event.name === 'party:action' && event.payload.action === 'quest'), false);
  assert.deepEqual(progress(await f.db.event.findFirstOrThrow()), progress(before));
  assert.deepEqual(await f.db.quest.findMany({ orderBy: { number: 'asc' } }), quests);
  assert.deepEqual(await f.db.participant.findMany({ orderBy: { createdAt: 'asc' } }), participants);
  assert.equal(await f.db.poll.count(), 0); assert.equal(await f.db.vote.count(), 0);
  assert.equal(await f.db.auditLog.count({ where: { action: 'owner:preview' } }), 2, 'the existing audit records only the intentional tests');
  const newcomer = await overlay(t, f); await delay(100);
  assert.equal(newcomer.events.some(event => event.name === 'level38:celebration-preview' || event.name === 'level38:unlocked'), false);
  assert.equal(newcomer.events.find(event => event.name === 'party:snapshot').payload.members.length, 5);
});
