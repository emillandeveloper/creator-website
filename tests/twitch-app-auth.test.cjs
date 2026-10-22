const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TwitchApi } = require('../dist/modules/level38/twitch/api');
const { TwitchIntegration } = require('../dist/modules/level38/twitch/integration');
const { config, fakeTwitch, signed } = require('./twitch-fake.cjs');

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const cfg = () => ({ ...config(), broadcasterId: '1234', pollsEnabled: true, pollError: null, userAccessToken: 'test-broadcaster-access', userRefreshToken: '', pollTokenKey: 'b'.repeat(64) });

test('Client Credentials uses the official form request, independent user grant and coalesced bounded retries', async t => {
  const configuration = cfg(); let now = 1700000000000, tokenCalls = 0, reject = true;
  const api = new TwitchApi(configuration, async (url, init = {}) => {
    if (url.endsWith('/oauth2/token')) {
      tokenCalls++; assert.equal(url, 'https://id.twitch.tv/oauth2/token');
      assert.equal(init.method, 'POST'); assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.equal(init.body.get('client_id'), configuration.clientId); assert.equal(init.body.get('client_secret'), configuration.clientSecret);
      assert.equal(init.body.get('grant_type'), 'client_credentials'); assert.equal(init.body.has('access_token'), false);
      return reject ? json({ message: 'invalid client secret', private: configuration.clientSecret }, 403) : json({ access_token: 'test-only-app-grant', expires_in: 7200 });
    }
    if (url.endsWith('/oauth2/validate')) return json({ client_id: configuration.clientId, user_id: configuration.broadcasterId, scopes: ['channel:manage:polls'], expires_in: 7200 });
    assert.equal(init.headers.Authorization, `Bearer ${configuration.userAccessToken}`); return json({ data: [] });
  }, () => now); t.after(() => api.close());
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => api.token()));
  assert.ok(attempts.every(result => result.status === 'rejected')); assert.equal(tokenCalls, 1);
  let state = api.appAuthStatus(); assert.equal(state.httpStatus, 403); assert.equal(state.reason, 'invalid_client_secret');
  assert.match(state.error, /same existing Twitch application/); assert.equal(Date.parse(state.retryAt) - now, 60000);
  assert.doesNotMatch(JSON.stringify(state), /test-client-secret|test-broadcaster-access|test-only-app-grant/);
  await api.userRequest('polls'); assert.equal(tokenCalls, 1, 'a valid user grant must remain usable while the app grant fails');
  await assert.rejects(api.token()); assert.equal(tokenCalls, 1);
  now += 60001; await assert.rejects(api.token()); assert.equal(tokenCalls, 2);
  assert.equal(Date.parse(api.appAuthStatus().retryAt) - now, 120000);
  reject = false; now += 120001; assert.equal(await api.token(), 'test-only-app-grant');
  assert.equal(tokenCalls, 3); state = api.appAuthStatus(); assert.equal(state.status, 'ready'); assert.equal(state.error, null); assert.equal(state.retryAt, null);
});

test('unknown HTTP 403 bodies never diagnose a specific wrong credential or expose upstream content', async t => {
  const api = new TwitchApi(cfg(), async () => json({ message: 'proxy denied test-broadcaster-access test-client-secret', error: 'private response' }, 403));
  t.after(() => api.close());
  await assert.rejects(api.token(), error => error.status === 403 && /does not prove/.test(error.message));
  assert.equal(api.appAuthStatus().reason, 'forbidden');
  assert.doesNotMatch(JSON.stringify(api.appAuthStatus()), /test-broadcaster-access|test-client-secret|proxy denied|private response/);
});

test('broadcaster Get Polls rate limits expose bounded retry timing without replaying a request', async t => {
  const now = 1700000000000; let reads = 0;
  const api = new TwitchApi(cfg(), async (url) => {
    if (url.endsWith('/validate')) return json({ client_id: cfg().clientId, user_id: '1234', scopes: ['channel:manage:polls'], expires_in: 7200 });
    reads++; return json({ message: 'private rate limit response' }, 429, { 'Retry-After': '10', 'Ratelimit-Reset': String(now / 1000 + 30) });
  }, () => now); t.after(() => api.close());
  await assert.rejects(api.polls('test-poll'), error => error.status === 429 && error.retryAfterMs === 30000 && !error.message.includes('private'));
  assert.equal(reads, 1);
});

function integrationFixture(fetchOverride) {
  const fake = fakeTwitch(), configuration = cfg(), receipts = [];
  const api = new TwitchApi(configuration, (url, init) => fetchOverride?.(url, init, fake) ?? fake.fetch(url, init));
  let saved = { subscriptionStatus: 'unknown' };
  const store = { async initialize() {}, async state() { return saved; }, async subscription(id, status, hash) { saved = { ...saved, subscriptionId: id, subscriptionStatus: status, ...(hash ? { subscriptionSecretHash: hash } : {}) }; }, async category() {}, async cleanup() {} };
  const polls = { async status() { return { available: true, scopesValid: true, error: null }; }, subscription() {}, revoke() {}, async reconcile() {}, async close() {}, async receive(...args) { receipts.push(args); } };
  return { fake, api, receipts, polls, configuration, integration: new TwitchIntegration(configuration, api, store, polls) };
}

test('EventSub checks each poll stream and never treats channel.update as proof of poll progress health', async t => {
  let rejectProgress = true;
  const f = integrationFixture((raw, init) => {
    const url = new URL(raw);
    if (rejectProgress && url.pathname.endsWith('/eventsub/subscriptions') && url.searchParams.get('type') === 'channel.poll.progress') return json({ message: 'private progress service response' }, 503);
  }); t.after(() => f.integration.close());
  await assert.rejects(f.integration.run('ensure'));
  const state = await f.integration.status(); assert.equal(state.subscriptionStatus, 'enabled'); assert.equal(state.eventSub.available, false);
  assert.deepEqual(state.eventSub.subscriptions.map(sub => [sub.type, sub.status]), [ ['channel.poll.begin', 'enabled'], ['channel.poll.progress', 'unknown'], ['channel.poll.end', 'enabled'] ]);
  assert.match(state.eventSub.subscriptions[1].error, /HTTP 503/); assert.ok(state.eventSub.subscriptions.every(sub => sub.lastCheckAt));
  assert.doesNotMatch(JSON.stringify(state), /private progress service response|test-client-secret|test-broadcaster-access/);
  rejectProgress = false; await f.integration.run('ensure'); assert.equal((await f.integration.status()).eventSub.available, true);
});

test('signed progress receipts are reported after successful persistence without moving event time backwards', async t => {
  const f = integrationFixture(); t.after(() => f.integration.close()); await f.integration.run('ensure');
  const subscription = f.fake.subscriptions.find(sub => sub.type === 'channel.poll.progress');
  const body = { subscription, event: { broadcaster_user_id: '1234', id: 'test-native-poll', title: 'Test progress' } };
  const invoke = message => f.integration.webhook({ body: Buffer.from(message.raw), get: key => message.headers[key] }, { sendStatus(status) { assert.equal(status, 204); } });
  const firstAt = new Date(Date.now() - 1000).toISOString(); await invoke(signed(body, { at: firstAt }));
  let progress = (await f.integration.status()).eventSub.subscriptions.find(sub => sub.type === subscription.type);
  assert.equal(progress.lastEventAt, firstAt); assert.ok(progress.lastReceiptAt); assert.equal(f.receipts.length, 1);
  await invoke(signed(body, { at: new Date(Date.parse(firstAt) - 1000).toISOString() }));
  progress = (await f.integration.status()).eventSub.subscriptions.find(sub => sub.type === subscription.type); assert.equal(progress.lastEventAt, firstAt);
  f.polls.receive = async () => { throw new Error('test transaction failed'); };
  await assert.rejects(invoke(signed(body))); assert.deepEqual((await f.integration.status()).eventSub.subscriptions.find(sub => sub.type === subscription.type), progress);
  await assert.rejects(invoke(signed(body, { secret: 'wrong-secret' }))); assert.equal(f.receipts.length, 2);
});
