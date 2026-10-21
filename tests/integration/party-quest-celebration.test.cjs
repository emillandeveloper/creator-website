const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { setTimeout: delay } = require('node:timers/promises');
const { fixture } = require('./support.cjs');

async function until(check) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await check()) return; await delay(30); }
  throw new Error('Party quest event condition timed out');
}
function connect(t, f, kind = 'overlay', cookie) {
  const socket = io(`${f.origin}/level38-party`, { path: '/level38/socket.io', transports: ['websocket'], forceNew: true,
    autoConnect: false, auth: { kind }, extraHeaders: { Origin: f.origin, ...(cookie ? { Cookie: cookie } : {}) } });
  t.after(() => socket.disconnect()); return socket;
}
async function observe(t, f) {
  const socket = connect(t, f), events = [];
  socket.onAny((name, payload) => events.push({ name, payload })); socket.connect();
  await until(() => events.some(event => event.name === 'party:snapshot'));
  return { socket, events, quests: () => events.filter(event => event.name === 'party:action' && event.payload.action === 'quest') };
}
function controls(f, operator) {
  return async (path, body) => {
    const controlRevision = (await f.db.event.findFirstOrThrow()).controlRevision;
    const response = await f.call(`/api/control/${path}`, { ...body, controlRevision }, operator.cookie);
    assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data;
  };
}

test('a committed transition to COMPLETED emits one public quest reaction, never other transitions or snapshots', { timeout: 90000 }, async t => {
  const f = await fixture(t); await f.start();
  const operator = await f.operator('Party quest operator', 'OWNER'), op = controls(f, operator);
  const watcher = await observe(t, f);
  const initial = watcher.events.find(event => event.name === 'party:snapshot').payload;
  assert.equal(initial.revision, (await f.db.event.findFirstOrThrow()).revision);
  assert.ok(Number.isSafeInteger(initial.serverTime) && initial.serverTime > 0);
  assert.equal(watcher.quests().length, 0);

  const cookies = [await f.viewer('Party A'), await f.viewer('Party B'), await f.viewer('Party C')];
  for (const cookie of cookies) {
    const viewer = connect(t, f, 'viewer', cookie);
    viewer.on('connect', () => viewer.emit('party:register', {})); viewer.connect();
  }
  await until(() => watcher.events.filter(event => event.name === 'party:joined').length === 3);
  const quests = await f.db.quest.findMany({ where: { retiredAt: null, isSecret: false }, orderBy: { number: 'asc' }, include: { eligibleGames: true } });
  const [quest, failed, skipped, cancelled, selected] = quests;
  for (const [item, action] of [[quest, 'activate'], [failed, 'activate'], [failed, 'fail'], [skipped, 'activate'], [skipped, 'skip'], [cancelled, 'activate'], [cancelled, 'available']]) {
    await op(`quests/${item.id}`, { action });
  }
  const otherGame = selected.eligibleGames.find(game => game.gameId !== selected.gameId);
  assert.ok(otherGame, 'seeded multigame quest must permit a real selection change');
  await op(`quests/${selected.id}/game`, { gameId: otherGame.gameId });
  await delay(100); assert.equal(watcher.quests().length, 0);

  // Public sockets cannot forge the server reaction, including a correctly shaped payload.
  const forged = { action: 'quest', version: 1, id: 'level38:quest-completed:9999', revision: 9999, occurredAt: new Date().toISOString(), durationMs: 4000 };
  watcher.socket.emit('party:action', forged); await delay(100); assert.equal(watcher.quests().length, 0);
  const beforeRevision = (await f.db.event.findFirstOrThrow()).controlRevision;
  const requests = await Promise.all([0, 1].map(() => f.call(`/api/control/quests/${quest.id}`, { action: 'complete', controlRevision: beforeRevision }, operator.cookie)));
  assert.deepEqual(requests.map(response => response.status).sort(), [200, 409]);
  await until(() => watcher.quests().length === 1);
  const committed = await f.db.quest.findUniqueOrThrow({ where: { id: quest.id } }), event = await f.db.event.findFirstOrThrow();
  assert.equal(committed.status, 'COMPLETED');
  const reaction = watcher.quests()[0].payload;
  assert.deepEqual(reaction, { action: 'quest', version: 1,
    id: `level38:quest-completed:${event.revision}`, revision: event.revision, occurredAt: reaction.occurredAt, durationMs: 4000 });
  assert.equal(new Date(reaction.occurredAt).toISOString(), reaction.occurredAt);
  assert.ok(Date.parse(reaction.occurredAt) >= committed.completedAt.getTime());
  assert.ok(Date.parse(reaction.occurredAt) - committed.completedAt.getTime() < 1000);
  const retry = await f.call(`/api/control/quests/${quest.id}`, { action: 'complete', controlRevision: event.controlRevision }, operator.cookie);
  assert.equal(retry.status, 409); await delay(100); assert.equal(watcher.quests().length, 1);
  assert.equal(await f.db.auditLog.count({ where: { action: 'quest:completed', entityId: quest.id } }), 1);

  const newcomer = await observe(t, f);
  assert.equal(newcomer.quests().length, 0);
  assert.equal(newcomer.events.find(item => item.name === 'party:snapshot').payload.revision, event.revision);
  watcher.socket.disconnect(); watcher.socket.connect();
  await until(() => watcher.events.filter(item => item.name === 'party:snapshot').length === 2);
  await delay(100); assert.equal(watcher.quests().length, 1, 'reconnection receives a snapshot, never historical reactions');
  assert.equal(await f.db.quest.count({ where: { retiredAt: null } }), 60);
  assert.equal(event.target, 38);
  assert.equal(await f.db.poll.count(), 0);
  assert.doesNotMatch(JSON.stringify(watcher.quests()), /participantId|operatorId|tokenHash|questId|description|title/);
});

test('the 38th completion retains the stronger existing finale, without a competing small reaction', { timeout: 60000 }, async t => {
  const f = await fixture(t); await f.start();
  const operator = await f.operator('Party finale operator', 'OWNER'), op = controls(f, operator), watcher = await observe(t, f);
  const quests = await f.db.quest.findMany({ where: { retiredAt: null, isSecret: false }, orderBy: { number: 'asc' } });
  await f.db.quest.updateMany({ where: { id: { in: quests.slice(0, 37).map(quest => quest.id) } }, data: { status: 'COMPLETED', completedAt: new Date() } });
  await op(`quests/${quests[37].id}`, { action: 'activate' });
  await op(`quests/${quests[37].id}`, { action: 'complete' });
  await until(() => watcher.events.some(event => event.name === 'level38:unlocked'));
  assert.equal(watcher.quests().length, 0);
  const finale = watcher.events.find(event => event.name === 'level38:unlocked').payload;
  assert.equal(finale.id, 'level38:unlock:1'); assert.equal(finale.completed, 38); assert.equal(finale.target, 38);
  assert.ok(finale.durationMs > 4000);
  const newcomer = await observe(t, f); await delay(100);
  assert.equal(newcomer.events.some(event => event.name === 'level38:unlocked'), false);
  assert.equal(newcomer.quests().length, 0);
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence, 1);
});
