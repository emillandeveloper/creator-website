const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { ChaosAgentBridge } = require('../dist/services/chaos-agent');

function fakeDb() {
  let agent = null;
  let nextCommandId = 0;
  const commands = [];
  const activity = [];
  function matches(command, where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'expiresAt') return command.expiresAt > value.gt;
      if (key === 'status' && typeof value === 'object') return value.in.includes(command.status);
      return command[key] === value;
    });
  }
  const db = {
    commands,
    activity,
    $transaction: async callback => callback(db),
    get agent() { return agent; },
    chaosAgent: {
      findUnique: async ({ where }) => agent?.id === where.id ? agent : null,
      upsert: async ({ where, create, update }) => {
        agent = agent?.id === where.id ? { ...agent, ...update } : { ...create, gameRunning: false, livePotionArmed: false, lastSeenAt: null };
        return agent;
      },
      updateMany: async ({ where, data }) => {
        if (!agent || agent.id !== where.id || agent.tokenHash !== where.tokenHash) return { count: 0 };
        Object.assign(agent, data);
        return { count: 1 };
      },
    },
    chaosCommand: {
      create: async ({ data }) => {
        const command = { id: 'cmd_' + ++nextCommandId, status: 'PENDING', mode: 'DRY_RUN', createdAt: new Date(), ...data };
        commands.push(command);
        return command;
      },
      findFirst: async ({ where }) => commands
        .filter(command => matches(command, where))
        .sort((a, b) => a.createdAt - b.createdAt)[0] || null,
      findUnique: async ({ where }) => commands.find(command => command.id === where.id) || null,
      updateMany: async ({ where, data }) => {
        const eligible = commands.filter(item => matches(item, where));
        eligible.forEach(command => Object.assign(command, data));
        return { count: eligible.length };
      },
    },
    chaosActivity: {
      create: async ({ data }) => {
        const event = { id: 'act_' + (activity.length + 1), occurredAt: new Date(), ...data };
        activity.push(event);
        return event;
      },
    },
  };
  return db;
}

test('FFX agent pairs without storing raw token and requires authenticated heartbeat', async () => {
  const db = fakeDb();
  const bridge = new ChaosAgentBridge(db);
  assert.deepEqual(await bridge.status(), { paired: false, connected: false, gameRunning: false, livePotionArmed: false, lastSeenAt: null });
  const token = await bridge.pair();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(db.agent.tokenHash, createHash('sha256').update(token).digest('hex'));
  assert.equal(JSON.stringify(db.agent).includes(token), false);
  assert.equal((await bridge.status()).connected, false);
  await assert.rejects(bridge.heartbeat(undefined, { gameRunning: true }), { status: 401 });
  await assert.rejects(bridge.heartbeat('Bearer ' + token, { gameRunning: 'true' }), { status: 400 });
  await assert.rejects(bridge.heartbeat('Bearer ' + token, { gameRunning: true, livePotionArmed: 'true' }), { status: 400 });
  await bridge.heartbeat('Bearer ' + token, { gameRunning: true });
  assert.equal((await bridge.status()).connected, true);
  assert.equal((await bridge.status()).gameRunning, true);
  assert.equal((await bridge.status()).livePotionArmed, false);
  await assert.rejects(bridge.queueLivePotion(), { status: 409 });
  db.agent.lastSeenAt = new Date(Date.now() - 20_000);
  assert.equal((await bridge.status()).connected, false);
  assert.equal((await bridge.status()).gameRunning, false);
  await assert.rejects(bridge.queueTest('give-potion'), { status: 409 });
});

test('FFX bridge delivers a dry-run only once and logs it only after PC acknowledgement', async () => {
  const db = fakeDb();
  const bridge = new ChaosAgentBridge(db);
  const token = await bridge.pair();
  const bearer = 'Bearer ' + token;
  await bridge.heartbeat(bearer, { gameRunning: true });
  await assert.rejects(bridge.queueTest('not-a-reward'), { status: 404 });
  const queued = await bridge.queueTest('halve-hp');
  assert.equal(queued.status, 'PENDING');
  assert.equal(db.activity.length, 0);
  await assert.rejects(bridge.claim('Bearer wrong'), { status: 401 });
  const command = await bridge.claim(bearer);
  assert.deepEqual(command, { id: queued.id, rewardId: 'halve-hp', mode: 'DRY_RUN' });
  assert.equal(await bridge.claim(bearer), null);
  assert.equal(db.activity.length, 0);
  await assert.rejects(bridge.acknowledge(bearer, { id: '../../bad' }), { status: 400 });
  assert.deepEqual(await bridge.acknowledge(bearer, { id: command.id }), { ok: true });
  assert.equal(db.activity.length, 1);
  assert.equal(db.activity[0].source, 'TEST');
  assert.equal(db.activity[0].status, 'SIMULATED');
  assert.equal(db.activity[0].rewardId, 'halve-hp');
  await assert.rejects(bridge.acknowledge(bearer, { id: command.id }), { status: 409 });
});

test('FFX agent rotation revokes old key and expired commands never reach the PC', async () => {
  const db = fakeDb();
  const bridge = new ChaosAgentBridge(db);
  const first = await bridge.pair();
  await bridge.heartbeat('Bearer ' + first, { gameRunning: false });
  const command = await bridge.queueTest('give-potion');
  command.expiresAt = new Date(Date.now() - 1000);
  assert.equal(await bridge.claim('Bearer ' + first), null);
  const second = await bridge.pair();
  assert.notEqual(first, second);
  assert.equal((await bridge.status()).connected, false);
  await assert.rejects(bridge.heartbeat('Bearer ' + first, { gameRunning: true }), { status: 401 });
  await bridge.heartbeat('Bearer ' + second, { gameRunning: false });
  assert.equal((await bridge.status()).gameRunning, false);
  assert.equal(await bridge.claim('Bearer ' + second), null);
});

test('FFX live Potion needs explicit local arming, runs once and reports only acknowledged results', async () => {
  const db = fakeDb();
  const bridge = new ChaosAgentBridge(db);
  const token = await bridge.pair();
  const bearer = 'Bearer ' + token;
  await bridge.heartbeat(bearer, { gameRunning: true, livePotionArmed: true });
  assert.equal((await bridge.status()).livePotionArmed, true);
  const queued = await bridge.queueLivePotion();
  assert.equal(queued.mode, 'LIVE');
  assert.equal(queued.rewardId, 'give-potion');
  await assert.rejects(bridge.queueLivePotion(), { status: 409 });
  assert.equal(db.activity.length, 0);
  const command = await bridge.claim(bearer);
  assert.deepEqual(command, { id: queued.id, rewardId: 'give-potion', mode: 'LIVE' });
  assert.equal(await bridge.claim(bearer), null);
  await assert.rejects(bridge.acknowledge(bearer, { id: command.id }), { status: 400 });
  assert.equal(db.activity.length, 0);
  assert.deepEqual(await bridge.acknowledge(bearer, { id: command.id, result: 'APPLIED' }), { ok: true });
  assert.equal(db.activity[0].source, 'LOCAL');
  assert.equal(db.activity[0].status, 'APPLIED');
  await assert.rejects(bridge.acknowledge(bearer, { id: command.id, result: 'APPLIED' }), { status: 409 });
});

test('Failed live writes are not represented as applied and pairing cancels outstanding writes', async () => {
  const db = fakeDb();
  const bridge = new ChaosAgentBridge(db);
  const first = await bridge.pair();
  const bearer = 'Bearer ' + first;
  await bridge.heartbeat(bearer, { gameRunning: true, livePotionArmed: true });
  const failed = await bridge.queueLivePotion();
  const claim = await bridge.claim(bearer);
  assert.equal(claim.id, failed.id);
  await bridge.acknowledge(bearer, { id: claim.id, result: 'FAILED' });
  assert.equal(db.activity[0].status, 'FAILED');
  const pending = await bridge.queueLivePotion();
  const rotated = await bridge.pair();
  assert.notEqual(first, rotated);
  assert.equal(pending.status, 'CANCELLED');
  assert.equal((await bridge.status()).livePotionArmed, false);
  await assert.rejects(bridge.queueLivePotion(), { status: 409 });
  await assert.rejects(bridge.claim(bearer), { status: 401 });
});
