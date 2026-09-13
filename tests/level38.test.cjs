const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readLevel38Config } = require("../dist/modules/level38/config");
const { nickname, revision, bodyObject, identifier, questAction } = require("../dist/modules/level38/validation");
const { canOperate, isOwner, newToken, hashToken } = require("../dist/modules/level38/auth");
const { startSite } = require("./helpers.cjs");

test("disabled LEVEL 38 needs no database; enabled production fails closed without HTTPS", () => {
  assert.equal(readLevel38Config({}).enabled, false);
  assert.throws(() => readLevel38Config({ LEVEL38_ENABLED: "true" }), /DATABASE_URL/);
  const env = { LEVEL38_ENABLED: "true", DATABASE_URL: "postgresql://unused", LEVEL38_ORIGIN: "http://localhost:3000" };
  assert.equal(readLevel38Config(env).secureCookies, false);
  assert.throws(() => readLevel38Config({ ...env, NODE_ENV: "production" }), /HTTPS/);
  assert.equal(readLevel38Config({ ...env, NODE_ENV: "production", LEVEL38_ORIGIN: "https://example.com" }).secureCookies, true);
  for (const origin of ["https://example.com/", "https://example.com/path", "https://user@example.com", "file:///tmp"]) {
    assert.throws(() => readLevel38Config({ ...env, LEVEL38_ORIGIN: origin }));
  }
  assert.throws(() => readLevel38Config({ ...env, LEVEL38_TRUST_PROXY_HOPS: "true" }));
});

test("untrusted names, commands, identifiers and revisions are validated", () => {
  assert.equal(nickname("  Isma  "), "Isma");
  assert.equal(nickname("Ｌｅｏ"), "Leo");
  for (const value of [null, {}, "a", "x".repeat(25), "<script>", "Leo\nAdmin", "Leo\u202e"]) assert.throws(() => nickname(value));
  for (const value of [-1, 1.5, "2", null, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => revision(value));
  for (const value of [null, [], "text"]) assert.throws(() => bodyObject(value));
  assert.throws(() => identifier("../control"));
  assert.throws(() => questAction("reset"));
  assert.equal(questAction("activate"), "activate");
});

test("display names cannot confer privileges; credentials are random and stored as hashes", () => {
  assert.equal(canOperate("VIEWER"), false);
  assert.equal(canOperate("Isma"), false);
  assert.equal(canOperate("MODERATOR"), true);
  assert.equal(isOwner("MODERATOR"), false);
  assert.equal(isOwner("OWNER"), true);
  const first = newToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, newToken());
  assert.notEqual(first, hashToken(first));
  assert.equal(hashToken(first).length, 64);
});

test("existing pages and assets still work with LEVEL 38 disabled", async (t) => {
  const site = await startSite({ DATABASE_URL: "" });
  t.after(site.stop);
  for (const path of ["/", "/?lang=es", "/portfolio", "/portfolio?lang=es", "/css/style.css", "/js/slider.js"]) {
    const response = await fetch(`${site.origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).length > 100);
  }
  const unavailable = await fetch(`${site.origin}/level38`);
  assert.equal(unavailable.status, 503);
  assert.match(await unavailable.text(), /being prepared/);
  assert.equal((await fetch(`${site.origin}/level38/api/state`)).status, 503);
});
