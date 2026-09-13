const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TwitchApi } = require("../dist/modules/level38/twitch/api");
const { readTwitchConfig } = require("../dist/modules/level38/twitch/config");
const { verifyWebhook } = require("../dist/modules/level38/twitch/webhook");
const { config, fakeTwitch, signed, payload } = require("./twitch-fake.cjs");

test("Twitch tokens coalesce, cache, expire, validate hourly and refresh once on 401 without leaking credentials", async () => {
  const fake = fakeTwitch(); let now = Date.now(); const api = new TwitchApi(config(), fake.fetch, () => now);
  assert.deepEqual(await Promise.all(Array.from({ length: 12 }, () => api.token())), Array(12).fill("private-token-1"));
  assert.equal(fake.tokens, 1); assert.equal(await api.broadcaster(), "1234");
  assert.equal((await api.channel("1234")).game_id, "100"); assert.equal(fake.tokens, 1);
  now += 3600001; await api.token(); assert.equal(fake.calls.filter((c) => c.path.endsWith("validate")).length, 2);
  now += 7200001; await api.token(); assert.equal(fake.tokens, 2);
  fake.unauthorized = 1; await api.channel("1234"); assert.equal(fake.tokens, 3);
  fake.unauthorized = 2; await assert.rejects(api.channel("1234"), /HTTP 401/); assert.equal(fake.tokens, 4);
  fake.failure = "network"; await assert.rejects(api.channel("1234"), (e) => !/private|credential|token-/.test(e.message));
  api.close();
});

test("Twitch config fails closed locally without throwing and disabled integration needs no credentials", () => {
  assert.equal(readTwitchConfig({}).enabled, false); assert.equal(readTwitchConfig({ TWITCH_ENABLED: "true" }).error !== null, true);
  assert.equal(config().error, null);
  for (const callback of ["http://level38.example/level38/twitch/eventsub", "https://elsewhere.example/level38/twitch/eventsub", "https://level38.example/level38/twitch/eventsub?secret=x"]) {
    assert.ok(readTwitchConfig({ TWITCH_ENABLED: "true", TWITCH_EVENTSUB_CALLBACK_URL: callback }).error);
  }
});

test("Webhook HMAC uses exact bytes, timing-safe comparison, bounded timestamp window and supported message types", () => {
  const invoke = (msg) => verifyWebhook({ body: Buffer.from(msg.raw), get: (key) => msg.headers[key] }, config().secret);
  assert.equal(invoke(signed()).body.event.category_id, "100");
  const valid = signed(payload(), { raw: JSON.stringify(payload(), null, 2) }); assert.equal(invoke(valid).type, "notification");
  assert.throws(() => invoke({ ...valid, raw: valid.raw + " " }), /signature/);
  assert.throws(() => invoke(signed({}, { at: new Date(Date.now() - 600001).toISOString() })), /Expired/);
  assert.throws(() => invoke(signed({}, { at: new Date(Date.now() + 120000).toISOString() })), /Expired/);
  assert.throws(() => invoke(signed({}, { secret: "wrong" })), /signature/);
  assert.throws(() => invoke(signed({}, { type: "other" })), /Unsupported/);
  assert.throws(() => invoke(signed({}, { raw: "{broken" })), /JSON/);
  const invalid = signed({}, { raw: "{broken", secret: "wrong" }); assert.throws(() => invoke(invalid), /signature/);
});

test("Broadcaster IDs avoid lookup and subscription pagination is complete", async () => {
  const fake = fakeTwitch(); const api = new TwitchApi({ ...config(), broadcasterId: "9876" }, fake.fetch);
  assert.equal(await api.broadcaster(), "9876"); assert.equal(fake.calls.length, 0);
  let pages = 0;
  const paged = new TwitchApi(config(), async (url, init) => {
    if (!url.includes("eventsub/subscriptions")) return fake.fetch(url, init);
    pages++; return new Response(JSON.stringify({ data: [{ id: String(pages) }], pagination: pages === 1 ? { cursor: "next" } : {} }));
  });
  assert.equal((await paged.subscriptions()).length, 2); assert.equal(pages, 2); api.close(); paged.close();
});
