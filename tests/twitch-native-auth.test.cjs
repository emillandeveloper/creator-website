const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TwitchApi } = require('../dist/modules/level38/twitch/api');
const { readTwitchConfig } = require('../dist/modules/level38/twitch/config');

function setup(overrides = {}) {
  const cfg = readTwitchConfig({ TWITCH_ENABLED: 'true', TWITCH_POLLS_ENABLED: 'true',
    TWITCH_CLIENT_ID: 'test-native-client', TWITCH_CLIENT_SECRET: 'test-only-client-secret',
    TWITCH_BROADCASTER_ID: '1234', TWITCH_BROADCASTER_LOGIN: 'testchannel',
    TWITCH_EVENTSUB_SECRET: 'a'.repeat(64), TWITCH_POLL_TOKEN_KEY: 'b'.repeat(64),
    LEVEL38_ORIGIN: 'https://level38.example', TWITCH_EVENTSUB_CALLBACK_URL: 'https://level38.example/level38/twitch/eventsub',
    TWITCH_USER_ACCESS_TOKEN: 'test-only-initial-access', TWITCH_USER_REFRESH_TOKEN: 'test-only-initial-refresh', ...overrides });
  let now = 1700000000000, saved = null;
  const mock = { calls: [], validations: 0, refreshes: 0, saves: 0, invalid: new Set(), identity: {}, rejectPostOnce: false };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const store = { async load() { return saved; }, async save(value) { mock.saves++; saved = value; } };
  const fetcher = async (url, init = {}) => {
    const method = init.method || 'GET';
    mock.calls.push({ url, method });
    if (url.endsWith('/oauth2/validate')) {
      mock.validations++;
      const access = init.headers.Authorization.replace(/^OAuth /, '');
      if (mock.invalid.has(access)) return json({ message: cfg.userAccessToken }, 401);
      return json({ client_id: cfg.clientId, user_id: cfg.broadcasterId, scopes: ['channel:manage:polls'], expires_in: 0, ...mock.identity });
    }
    if (url.endsWith('/oauth2/token')) {
      mock.refreshes++;
      assert.equal(init.body.get('grant_type'), 'refresh_token');
      assert.equal(init.body.get('client_id'), cfg.clientId);
      assert.equal(init.body.get('client_secret'), cfg.clientSecret);
      return json({ access_token: `test-only-rotated-access-${mock.refreshes}`, refresh_token: `test-only-rotated-refresh-${mock.refreshes}` });
    }
    assert.equal(new URL(url).origin, 'https://api.twitch.tv');
    assert.equal(init.headers['Client-Id'], cfg.clientId);
    if (method === 'POST' && mock.rejectPostOnce) { mock.rejectPostOnce = false; return json({ message: cfg.userAccessToken }, 401); }
    return json({ data: [] });
  };
  const create = (config = cfg) => { const api = new TwitchApi(config, fetcher, () => now); api.setUserTokenStore(store); return api; };
  return { cfg, mock, create, store, advance(ms) { now += ms; }, get envelope() { return saved; }, set envelope(value) { saved = value; } };
}

test('native OAuth validates the actual broadcaster, client and manage-polls scope before any Helix request', async t => {
  for (const identity of [{ user_id: '9999' }, { client_id: 'other-app' }, { scopes: ['channel:read:polls'] }, { expires_in: -1 }]) {
    const f = setup(); f.mock.identity = identity; const api = f.create(); t.after(() => api.close());
    await assert.rejects(api.userRequest('polls'), error => {
      assert.equal(error.status, 403);
      for (const secret of [f.cfg.userAccessToken, f.cfg.userRefreshToken, f.cfg.clientSecret]) assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(f.mock.calls.some(call => call.url.startsWith('https://api.twitch.tv')), false);
  }
});

test('valid legacy expires-in-zero grants coalesce and are validated again hourly without creating polls', async t => {
  const f = setup(), api = f.create(); t.after(() => api.close());
  const values = await Promise.all(Array.from({ length: 12 }, () => api.userToken()));
  assert.equal(values.every(value => value === f.cfg.userAccessToken), true);
  assert.equal(f.mock.validations, 1); assert.equal(f.mock.refreshes, 0);
  f.advance(3599000); await api.userToken(); assert.equal(f.mock.validations, 1);
  f.advance(2000); await api.userToken(); assert.equal(f.mock.validations, 2);
  assert.equal(f.mock.calls.some(call => call.method === 'POST'), false);
  api.close(); await assert.rejects(api.userToken());
});

test('refresh is single-flight and rotating grants survive restart only as authenticated encrypted envelopes', async t => {
  const f = setup(), api = f.create(); t.after(() => api.close());
  f.mock.invalid.add(f.cfg.userAccessToken);
  const access = await Promise.all(Array.from({ length: 12 }, () => api.userToken()));
  assert.equal(new Set(access).size, 1); assert.equal(access[0], 'test-only-rotated-access-1');
  assert.equal(f.mock.refreshes, 1); assert.equal(f.mock.validations, 2); assert.equal(f.mock.saves, 1);
  assert.equal(typeof f.envelope, 'string');
  for (const secret of [f.cfg.userAccessToken, f.cfg.userRefreshToken, 'test-only-rotated-access-1', 'test-only-rotated-refresh-1']) assert.equal(f.envelope.includes(secret), false);
  api.close();
  const restarted = f.create(); t.after(() => restarted.close());
  assert.equal(await restarted.userToken(), 'test-only-rotated-access-1');
  assert.equal(f.mock.refreshes, 1, 'restart must reuse the rotated grant, not the stale environment seed');
  const tampered = f.envelope.split('.'); tampered[1] = Buffer.alloc(16).toString('base64'); f.envelope = tampered.join('.');
  const broken = f.create(); t.after(() => broken.close());
  await assert.rejects(broken.userToken(), /encrypted broadcaster authorization/);
});

test('a newly configured broadcaster grant supersedes the saved authorization without modifying another application', async t => {
  const f = setup(), old = f.create(); t.after(() => old.close());
  f.mock.invalid.add(f.cfg.userAccessToken); await old.userToken(); old.close();
  const replacement = f.create({ ...f.cfg, userAccessToken: 'test-only-manual-new-access', userRefreshToken: 'test-only-manual-new-refresh' });
  t.after(() => replacement.close());
  assert.equal(await replacement.userToken(), 'test-only-manual-new-access');
  assert.equal(f.mock.refreshes, 1);
});

test('revoked grants without refresh fail privately and a rejected creation is never blindly replayed', async t => {
  const f = setup({ TWITCH_USER_REFRESH_TOKEN: '' }), expired = f.create(); t.after(() => expired.close());
  f.mock.invalid.add(f.cfg.userAccessToken);
  await assert.rejects(expired.userRequest('polls'), error => error.status === 401 && !error.message.includes(f.cfg.userAccessToken));
  assert.equal(f.mock.refreshes, 0);
  const g = setup(), api = g.create(); t.after(() => api.close());
  g.mock.rejectPostOnce = true;
  await assert.rejects(api.userRequest('polls', 'POST', { title: 'Test only' }));
  assert.equal(g.mock.calls.filter(call => new URL(call.url).pathname === '/helix/polls' && call.method === 'POST').length, 1);
  assert.equal(g.mock.refreshes, 1);
  await api.userRequest('polls');
});
