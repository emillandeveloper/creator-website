const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NativeTwitchPolls } = require('../dist/modules/level38/twitch/polls');
const { TwitchApiError } = require('../dist/modules/level38/twitch/api');

const settle = async () => { for (let index = 0; index < 16; index++) await Promise.resolve(); };
function backupFixture() {
  let rows = [{ id: 'local', status: 'OPEN', twitchStatus: 'ACTIVE', twitchPollId: 'remote' }];
  let fetches = 0, authorizations = 0, received = 0;
  let read = async () => [{ id: 'remote' }];
  const db = { poll: { findMany: async () => rows, findFirst: async () => rows.find(row => row.status === 'OPEN') ?? null,
    findUnique: async ({where}) => rows.find(row => row.id === where.id) ?? null, update: async () => ({}) } };
  const api = { setUserTokenStore() {}, userToken: async () => { authorizations++; return 'fake-user'; },
    token: async () => { throw new Error('App Access Token must never be needed'); },
    polls: async () => { fetches++; return read(); } };
  const polls = new NativeTwitchPolls(db, api, { enabled: true, error: null, pollsEnabled: true, pollError: null });
  polls.receive = async () => { received++; };
  return { polls, setRows: value => { rows = value; }, setRead: value => { read = value; },
    counts: () => ({ fetches, authorizations, received }) };
}

test('backup coalesces concurrent callers, uses only broadcaster auth and shares its five-second request budget', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = backupFixture(); t.after(() => f.polls.close());
  let finish;
  f.setRead(() => new Promise(resolve => { finish = resolve; }));
  const first = f.polls.reconcile(false); await settle();
  const second = f.polls.reconcile(false); await settle();
  assert.equal(f.counts().fetches, 1);
  finish([{ id: 'remote' }]); await Promise.all([first, second]);
  await f.polls.reconcile(false); assert.equal(f.counts().fetches, 1);
  assert.equal((await f.polls.status()).backup.status, 'healthy');
  t.mock.timers.tick(5000); f.setRead(async () => [{ id: 'remote' }]);
  await f.polls.reconcile(false); assert.equal(f.counts().fetches, 2);
  f.setRows([]); await f.polls.reconcile(false);
  assert.equal((await f.polls.status()).backup.status, 'idle');
  t.mock.timers.tick(60000); await f.polls.reconcile(false);
  assert.equal(f.counts().fetches, 2, 'no Helix reads remain once there is no native open poll');
});

test('a failed GET that races the definitive EventSub end cannot leave a completed round retrying', async t => {
  const f = backupFixture(); t.after(() => f.polls.close());
  let fail;
  f.setRead(() => new Promise((_resolve, reject) => { fail = reject; }));
  const reading = f.polls.reconcile(false); await settle();
  f.setRows([{id:'local',status:'CLOSED'}]);
  fail(new TwitchApiError(503, 'poll API request')); await reading;
  assert.equal((await f.polls.status()).backup.status, 'idle');
  assert.equal((await f.polls.status()).backup.error, null);
});

test('transient backup failures back off and HTTP 429 reset limits also apply to manual synchronization', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = backupFixture(); t.after(() => f.polls.close());
  f.setRead(async () => { throw new TwitchApiError(503, 'poll API request'); });
  await assert.rejects(f.polls.reconcile(false));
  await f.polls.reconcile(false); assert.equal(f.counts().fetches, 1);
  t.mock.timers.tick(5000); await assert.rejects(f.polls.reconcile(false));
  assert.equal((await f.polls.status()).backup.nextAttemptAt, new Date(115000).toISOString());
  t.mock.timers.tick(9999); await f.polls.reconcile(false); assert.equal(f.counts().fetches, 2);
  t.mock.timers.tick(1);
  f.setRead(async () => { throw new TwitchApiError(429, 'poll API request', undefined, 45000); });
  await assert.rejects(f.polls.reconcile(false));
  await f.polls.reconcile(true); assert.equal(f.counts().fetches, 3);
  t.mock.timers.tick(44999); await f.polls.reconcile(true); assert.equal(f.counts().fetches, 3);
  t.mock.timers.tick(1); f.setRead(async () => [{ id: 'remote' }]);
  await f.polls.reconcile(false);
  assert.equal(f.counts().fetches, 4); assert.equal((await f.polls.status()).backup.failures, 0);
  assert.equal((await f.polls.status()).available, true, 'transport errors never mislabel a valid broadcaster grant');
});
