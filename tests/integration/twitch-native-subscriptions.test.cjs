const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nativeFixture } = require("./twitch-polls-support.cjs");
const { signed } = require("../twitch-fake.cjs");

test("all owned EventSub subscriptions rotate together and revoked native streams recover without touching Hebe", { timeout: 60000 }, async t => {
  const f = await nativeFixture(t);
  const types = ["channel.update", "channel.poll.begin", "channel.poll.progress", "channel.poll.end"];
  assert.equal(f.fake.subscriptions.length, 4);
  const old = new Map(f.fake.subscriptions.map(sub => [sub.type, sub.id]));
  const hebe = { ...f.fake.subscriptions[0], id: "hebe-owned-subscription", transport: { method: "webhook", callback: "https://hebe.example/eventsub" } };
  f.fake.subscriptions.push(hebe);
  f.cfg.secret = "b".repeat(64);
  await f.twitch.run("ensure");
  for (const type of types) {
    const sub = f.fake.subscriptions.find(sub => sub.type === type && sub.transport.callback === f.cfg.callback);
    assert.ok(sub); assert.notEqual(sub.id, old.get(type), `${type} must rotate its signing secret`);
  }
  assert.deepEqual(f.fake.subscriptions.find(sub => sub.id === hebe.id), hebe);
  const pollEnd = f.fake.subscriptions.find(sub => sub.type === "channel.poll.end");
  pollEnd.status = "notification_failures_exceeded";
  const revoke = signed({ subscription: pollEnd }, { type: "revocation", secret: f.cfg.secret });
  assert.equal((await f.webhook(revoke)).status, 204);
  assert.equal((await f.native.status()).available, false);
  assert.match((await f.native.status()).error, /revoked/);
  await f.twitch.run("ensure");
  assert.equal((await f.native.status()).available, true);
  assert.notEqual(f.fake.subscriptions.find(sub => sub.type === "channel.poll.end").id, pollEnd.id);
  assert.deepEqual(f.fake.subscriptions.find(sub => sub.id === hebe.id), hebe);
  // A delayed revocation for the retired subscription cannot revoke its replacement.
  assert.equal((await f.webhook(signed({ subscription: pollEnd }, { type: "revocation", secret: f.cfg.secret }))).status, 204);
  assert.equal((await f.native.status()).available, true);
  const beforeDisable = new Set(f.fake.subscriptions.filter(sub => sub.type.startsWith("channel.poll.")).map(sub => sub.id));
  f.cfg.pollsEnabled = false; f.cfg.secret = "c".repeat(64);
  await f.twitch.run("ensure");
  assert.equal(f.fake.subscriptions.some(sub => sub.type.startsWith("channel.poll.")), false);
  assert.deepEqual(f.fake.subscriptions.find(sub => sub.id === hebe.id), hebe);
  f.cfg.pollsEnabled = true;
  await f.twitch.run("ensure");
  const restored = f.fake.subscriptions.filter(sub => sub.type.startsWith("channel.poll."));
  assert.equal(restored.length, 3); assert.ok(restored.every(sub => !beforeDisable.has(sub.id)));
  assert.equal((await f.native.status()).available, true);
  assert.deepEqual(f.fake.subscriptions.find(sub => sub.id === hebe.id), hebe);
});
