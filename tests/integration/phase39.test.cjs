const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { fixture } = require('./support.cjs');
const { joinParticipant } = require('../../dist/modules/level38/participants');
const { backfillParticipantVariants } = require('../../dist/modules/level38/variants');
const { CLASS_CATALOG, SPRITE_MANIFEST } = require('../../dist/modules/level38/classes');

test('Phase 3.9 additive upgrade leaves all old participant fields and null variants intact', { timeout: 180000 }, async t => {
  const f = await fixture(t, { migrate: false, seed: false });
  const schema = new URL(f.databaseUrl).searchParams.get('schema');
  assert.match(schema, /^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for (const name of fs.readdirSync('prisma/migrations').filter(n => /^\d/.test(n) && !n.endsWith('_variants')).sort()) {
    f.cli('db', 'execute', '--file', `prisma/migrations/${name}/migration.sql`, '--schema', 'prisma/schema.prisma');
    f.cli('migrate', 'resolve', '--applied', name);
  }
  await f.db.$executeRaw`INSERT INTO "Participant" (id, "tokenHash", nickname, "classId", "expiresAt") VALUES
    ('legacy-ffv', 'old-session-a', 'Legacy Mage', 'black-mage', NOW() + interval '1 year'),
    ('legacy-ffiv', 'old-session-b', 'Legacy Knight', 'dark-knight', NOW() + interval '1 year'),
    ('legacy-retired', 'old-session-c', 'Legacy Hero', 'retired', NOW() - interval '1 day')`;
  const before = await f.db.$queryRaw`SELECT * FROM "Participant" ORDER BY id`;
  f.cli('migrate', 'deploy');
  const after = await f.db.participant.findMany({ orderBy: { id: 'asc' } });
  assert.deepEqual(after, before.map(p => ({ ...p, variantId: null })));
  assert.match(f.cli('migrate', 'deploy').toString(), /No pending migrations/);
});

test('dry-run, paginated apply, rerun and concurrent backfills only fill supported null variants', { timeout: 90000 }, async t => {
  const f = await fixture(t);
  const eventBefore = await f.db.event.findMany(), questsBefore = await f.db.quest.findMany();
  await f.db.participant.createMany({ data: Array.from({ length: 270 }, (_, i) => ({
    id: `legacy-${String(i).padStart(3, '0')}`, tokenHash: `test-session-${i}`, nickname: `Viewer ${i}`,
    classId: CLASS_CATALOG[i % 24].id, expiresAt: new Date(i % 2 ? '2020-01-01' : '2030-01-01'),
  })) });
  await f.db.participant.createMany({ data: [
    { id: 'unknown', tokenHash: 'test-unknown', classId: 'retired', expiresAt: new Date('2030-01-01') },
    { id: 'preserve', tokenHash: 'test-preserve', classId: 'knight', variantId: 'unknown-legacy', expiresAt: new Date('2030-01-01') },
    { id: 'anonymous', tokenHash: 'test-anonymous', expiresAt: new Date('2030-01-01') },
  ] });
  const operator = await f.db.operator.create({ data: { name: 'History', role: 'MODERATOR', keyHash: 'test-hash' } });
  const poll = await f.db.poll.create({ data: { eventId: eventBefore[0].id, title: 'Historical poll', createdById: operator.id, status: 'CLOSED' } });
  const option = await f.db.pollOption.create({ data: { pollId: poll.id, eventId: eventBefore[0].id, label: 'Keep vote', position: 0 } });
  const vote = await f.db.vote.create({ data: { pollId: poll.id, optionId: option.id, participantId: 'legacy-000' } });
  const audit = await f.db.auditLog.create({ data: { eventId: eventBefore[0].id, operatorId: operator.id, operatorName: operator.name,
    action: 'test:history', entityId: poll.id, before: {}, after: {}, eventRevision: 1 } });
  const before = await f.db.participant.findMany({ orderBy: { id: 'asc' } });
  const dry = await backfillParticipantVariants(f.db);
  assert.equal(dry.eligible, 270); assert.equal(dry.assigned, 0); assert.equal(dry.unknownClass, 1);
  assert.deepEqual(await f.db.participant.findMany({ orderBy: { id: 'asc' } }), before);
  const results = await Promise.all([backfillParticipantVariants(f.db, true), backfillParticipantVariants(f.db, true)]);
  assert.equal(results.reduce((sum, r) => sum + r.assigned, 0), 270);
  const after = await f.db.participant.findMany({ orderBy: { id: 'asc' } });
  for (let i = 0; i < after.length; i++) {
    const { variantId, ...identity } = after[i], { variantId: oldVariant, ...oldIdentity } = before[i];
    assert.deepEqual(identity, oldIdentity);
    if (after[i].id.startsWith('legacy-')) assert.ok(CLASS_CATALOG.find(c => c.id === after[i].classId).variants.some(v => v.variantId === variantId));
    else assert.equal(variantId, oldVariant);
  }
  assert.equal((await backfillParticipantVariants(f.db, true)).assigned, 0);
  assert.deepEqual(await f.db.participant.findMany({ orderBy: { id: 'asc' } }), after);
  assert.deepEqual(await f.db.event.findMany(), eventBefore); assert.deepEqual(await f.db.quest.findMany(), questsBefore);
  assert.deepEqual(await f.db.poll.findUniqueOrThrow({ where: { id: poll.id } }), poll);
  assert.deepEqual(await f.db.vote.findUniqueOrThrow({ where: { id: vote.id } }), vote);
  assert.deepEqual(await f.db.auditLog.findUniqueOrThrow({ where: { id: audit.id } }), audit);
  for (const flags of [[], ['--apply']]) {
    const output = execFileSync(process.execPath, ['dist/modules/level38/commands.js', 'participant-variants', ...flags],
      { env: { ...process.env, DATABASE_URL: f.databaseUrl }, stdio: 'pipe', windowsHide: true });
    const report = JSON.parse(output.toString()); assert.equal(report.assigned, 0); assert.equal(report.mode, flags.length ? 'apply' : 'dry-run');
  }
});

test('PostgreSQL request races return only the persisted class/variant winner; refresh and rename preserve it', { timeout: 90000 }, async t => {
  const f = await fixture(t); await f.start();
  assert.deepEqual((await f.call('/api/classes')).data, SPRITE_MANIFEST);
  const cookie = await f.viewer();
  const row = await f.db.participant.findFirstOrThrow();
  const joins = await Promise.all(Array.from({ length: 12 }, () => joinParticipant(f.db, row.id, 'Mage')));
  const winner = await f.db.participant.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(joins.filter(j => j.classAssigned).length, 1);
  for (const j of joins) { assert.equal(j.participant.classId, winner.classId); assert.equal(j.participant.variantId, winner.variantId); }
  await f.db.participant.update({ where: { id: row.id }, data: { classId: 'black-mage', variantId: null } });
  const races = await Promise.all(Array.from({ length: 12 }, () => f.call('/api/session', undefined, cookie)));
  const assigned = await f.db.participant.findUniqueOrThrow({ where: { id: row.id } });
  for (const r of races) {
    assert.equal(r.status, 200); assert.equal(r.data.class.classId, 'black-mage');
    assert.equal(r.data.class.variantId, assigned.variantId); assert.equal(r.data.classAssigned, false);
  }
  const renamed = await f.call('/api/join', { nickname: 'New name', classId: 'hacked', variantId: 'hacked' }, cookie);
  assert.equal(renamed.status, 200); assert.deepEqual(renamed.data.class, races[0].data.class);
  for (let i = 0; i < 3; i++) assert.deepEqual((await f.call('/api/session', undefined, cookie)).data.class, renamed.data.class);
  const retained = await f.db.participant.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(retained.tokenHash, row.tokenHash); assert.deepEqual(retained.expiresAt, row.expiresAt); assert.equal(retained.id, row.id);
  await f.db.participant.update({ where: { id: row.id }, data: { classId: 'retired', variantId: null } });
  const unknown = await f.call('/api/session', undefined, cookie);
  assert.equal(unknown.data.class.classId, 'retired'); assert.equal(unknown.data.class.variantId, null); assert.equal(unknown.data.class.sprite, null);
});
