const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const { seedLevel38 } = require("../../dist/modules/level38/seed");
const { hashToken, newToken } = require("../../dist/modules/level38/auth");
const { startSite } = require("../helpers.cjs");

async function fixture(t, { migrate = true, seed = true } = {}) {
  assert.ok(process.env.LEVEL38_TEST_DATABASE_URL, "Set LEVEL38_TEST_DATABASE_URL to a disposable PostgreSQL test database.");
  const url = new URL(process.env.LEVEL38_TEST_DATABASE_URL);
  assert.match(url.pathname, /test/i);
  const schema = `level38_test_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  const databaseUrl = url.toString();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let site;
  const cli = (...args) => execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), ...args], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe", windowsHide: true });
  t.after(async () => {
    if (site) await site.stop();
    assert.match(schema, /^level38_test_[a-f0-9]{32}$/);
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  });
  if (migrate) cli("migrate", "deploy");
  if (seed) await seedLevel38(db);
  const context = {
    db, cli, databaseUrl,
    get origin() { return site.origin; },
    async start() { site = await startSite({ LEVEL38_ENABLED: "true", DATABASE_URL: databaseUrl }); },
    async call(path, body, cookie, extraHeaders = {}) {
      const response = await fetch(`${site.origin}/level38${path}`, { method: body === undefined ? "GET" : "POST",
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: site.origin, "X-Level38-Request": "1" }), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, data: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
    },
    async operator(name, role) {
      const key = newToken();
      const operator = await db.operator.create({ data: { name, role, keyHash: hashToken(key) } });
      const login = await context.call("/api/control/login", { key });
      assert.equal(login.status, 200);
      return { ...operator, cookie: login.cookie, key };
    },
    async viewer(nickname) {
      const session = await context.call("/api/session");
      if (nickname) assert.equal((await context.call("/api/join", { nickname }, session.cookie)).status, 200);
      return session.cookie;
    },
  };
  return context;
}
module.exports = { fixture };
