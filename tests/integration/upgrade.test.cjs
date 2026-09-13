const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./support.cjs");

test("Phase 1 upgrade preserves state, identities, votes and audit history", { timeout: 60000 }, async (t) => {
  const f = await fixture(t, { migrate: false, seed: false });
  // Create the schema through Prisma first, then apply only the original SQL migration.
  const url = new URL(f.databaseUrl); const schema = url.searchParams.get("schema");
  assert.match(schema, /^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  f.cli("db", "execute", "--file", "prisma/migrations/202609130001_level38_foundation/migration.sql", "--schema", "prisma/schema.prisma");
  f.cli("migrate", "resolve", "--applied", "202609130001_level38_foundation");
  await f.db.$executeRaw`INSERT INTO "Event" (id, slug, title, revision, "updatedAt") VALUES ('old-event', 'level38', 'LEVEL 38', 7, NOW())`;
  await f.db.$executeRaw`INSERT INTO "Game" (id, "eventId", slug, title) VALUES ('old-game', 'old-event', 'old-game', 'Original game')`;
  await f.db.$executeRaw`INSERT INTO "Quest" (id, "eventId", "gameId", number, title, description, status, "isSecret", "updatedAt") VALUES ('old-secret', 'old-event', 'old-game', 1, 'Secret legacy quest', 'Hidden legacy description', 'AVAILABLE', true, NOW()), ('old-completed', 'old-event', 'old-game', 2, 'Completed legacy quest', 'Keep this completion', 'COMPLETED', false, NOW())`;
  await f.db.$executeRaw`INSERT INTO "Operator" (id, name, role, "keyHash") VALUES ('old-operator', 'ISMA', 'MODERATOR', 'legacy-key-hash')`;
  await f.db.$executeRaw`INSERT INTO "Participant" (id, "tokenHash", nickname, "expiresAt") VALUES ('old-participant', 'legacy-token-hash', 'Viewer', NOW() + interval '1 year')`;
  await f.db.$executeRaw`INSERT INTO "Poll" (id, "eventId", title, status, "createdById", "closedAt") VALUES ('old-poll', 'old-event', 'Historical round', 'CLOSED', 'old-operator', NOW())`;
  await f.db.$executeRaw`INSERT INTO "PollOption" (id, "pollId", "eventId", "questId", label, position) VALUES ('old-option', 'old-poll', 'old-event', 'old-completed', 'Original label', 0)`;
  await f.db.$executeRaw`INSERT INTO "Vote" (id, "pollId", "optionId", "participantId", "updatedAt") VALUES ('old-vote', 'old-poll', 'old-option', 'old-participant', NOW())`;
  await f.db.$executeRaw`INSERT INTO "AuditLog" (id, "eventId", "operatorId", "operatorName", action, "entityId", before, after, "eventRevision") VALUES ('old-audit', 'old-event', 'old-operator', 'ISMA', 'quest:completed', 'old-completed', '{"status":"ACTIVE"}', '{"status":"COMPLETED"}', 7)`;
  f.cli("migrate", "deploy");
  const event = await f.db.event.findUniqueOrThrow({ where: { id: "old-event" } });
  assert.equal(event.revision, 7); assert.equal(event.controlRevision, 7);
  assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: "old-secret" } })).status, "SECRET");
  assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: "old-completed" } })).status, "COMPLETED");
  assert.equal((await f.db.vote.findUniqueOrThrow({ where: { id: "old-vote" } })).optionId, "old-option");
  assert.equal((await f.db.poll.findUniqueOrThrow({ where: { id: "old-poll" } })).status, "CLOSED");
  assert.equal((await f.db.participant.findUniqueOrThrow({ where: { id: "old-participant" } })).nickname, "Viewer");
  assert.equal((await f.db.auditLog.findUniqueOrThrow({ where: { id: "old-audit" } })).metadata, null);
  const { Level38Service } = require("../../dist/modules/level38/service");
  const state = await new Level38Service(f.db).state(true);
  assert.equal(state.undo.available, false); assert.match(state.undo.reason, /older action/);
  assert.equal(state.event.completed, 1);
});
