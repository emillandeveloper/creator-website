const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./support.cjs");
const { startSite } = require("../helpers.cjs");
const { seedLevel38 } = require("../../dist/modules/level38/seed");

async function health(origin, status) {
  const response = await fetch(`${origin}/healthz`);
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), { status: status === 200 ? "ok" : "unavailable" });
}

test("Render readiness supports disabled bootstrap and rejects missing schema/seed", { timeout: 60000 }, async (t) => {
  const disabled = await startSite({ DATABASE_URL: "" });
  t.after(disabled.stop);
  await health(disabled.origin, 200);

  const f = await fixture(t, { migrate: false, seed: false });
  await f.start();
  await health(f.origin, 503);
  assert.equal((await fetch(f.origin)).status, 200);
  f.cli("migrate", "deploy");
  await health(f.origin, 503);
  await seedLevel38(f.db);
  await health(f.origin, 200);
  assert.match(f.cli("migrate", "status").toString(), /up to date/i);
});

test("repeated production deploys preserve live state, votes and migration history", { timeout: 60000 }, async (t) => {
  const f = await fixture(t);
  await f.start();
  const operator = await f.operator("Production test", "MODERATOR");
  const viewer = await f.viewer("Viewer");
  let result = await f.call("/api/control/polls", { title: "Retain this round", type: "YES_NO", options: [], controlRevision: 0 }, operator.cookie);
  assert.equal(result.status, 200);
  const poll = await f.db.poll.findFirstOrThrow();
  result = await f.call(`/api/control/polls/${poll.id}/status`, { action: "open", controlRevision: 1 }, operator.cookie);
  assert.equal(result.status, 200);
  const option = await f.db.pollOption.findFirstOrThrow({ where: { pollId: poll.id } });
  assert.equal((await f.call(`/api/polls/${poll.id}/vote`, { optionId: option.id }, viewer)).status, 200);
  const snapshot = async () => ({
    event: await f.db.event.findFirstOrThrow(),
    polls: await f.db.poll.findMany(), votes: await f.db.vote.findMany(),
    audit: await f.db.auditLog.findMany({ orderBy: { eventRevision: "asc" } }),
    migrations: await f.db.$queryRaw`SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" ORDER BY migration_name`,
  });
  const before = await snapshot();
  assert.match(f.cli("migrate", "deploy").toString(), /No pending migrations/i);
  assert.match(f.cli("migrate", "status").toString(), /up to date/i);
  assert.deepEqual(await snapshot(), before);
  assert.equal(await seedLevel38(f.db), false);
  assert.deepEqual(await snapshot(), before);
  await health(f.origin, 200);
});

test("unsafe legacy data fails migration atomically and blocks retry until resolved", { timeout: 60000 }, async (t) => {
  const f = await fixture(t, { migrate: false, seed: false });
  const schema = new URL(f.databaseUrl).searchParams.get("schema");
  assert.match(schema, /^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  f.cli("db", "execute", "--file", "prisma/migrations/202609130001_level38_foundation/migration.sql", "--schema", "prisma/schema.prisma");
  f.cli("migrate", "resolve", "--applied", "202609130001_level38_foundation");
  await f.db.$executeRaw`INSERT INTO "Event" (id, slug, title, "updatedAt") VALUES ('legacy-event', 'level38', 'LEVEL 38', NOW())`;
  await f.db.$executeRaw`INSERT INTO "Operator" (id, name, role, "keyHash") VALUES ('legacy-operator', 'Operator', 'MODERATOR', 'test-hash')`;
  await f.db.$executeRaw`INSERT INTO "Poll" (id, "eventId", title, status, "createdById") VALUES ('first', 'legacy-event', 'First', 'OPEN', 'legacy-operator'), ('second', 'legacy-event', 'Second', 'OPEN', 'legacy-operator')`;
  assert.throws(() => f.cli("migrate", "deploy"), (error) => {
    // Prisma 6 can surface the aborted explicit transaction instead of P3018.
    assert.notEqual(error.status, 0);
    assert.match(error.stderr.toString(), /P3018|current transaction is aborted/); return true;
  });
  const columns = await f.db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'Event' AND column_name = 'controlRevision'`;
  assert.equal(columns.length, 0, "Phase 2 DDL rolled back");
  const polls = await f.db.$queryRaw`SELECT id FROM "Poll" WHERE status = 'OPEN'`;
  assert.equal(polls.length, 2, "historical polls were not altered or deleted");
  const failed = await f.db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  assert.deepEqual(failed, [{ migration_name: "202609130002_level38_live_control" }]);
  assert.throws(() => f.cli("migrate", "deploy"), (error) => {
    assert.match(error.stderr.toString(), /P3009/); return true;
  });
});
