const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { fixture } = require('./support.cjs');
const { syncQuestCatalog, prepareLegacyHistoryReview } = require('../../dist/modules/level38/quest-content-update');
const legacy = require('../../src/modules/level38/legacy-quest-content.json');
const backupSha256 = 'a'.repeat(64);

async function historicalFixture(t) {
  const f = await fixture(t, { seed: false });
  const event = await f.db.event.create({ data: { slug: 'level38', title: 'LEVEL 38', target: 38, revision: 106, controlRevision: 103, resetSequence: 3, unlockSequence: 1 } });
  const games = {};
  for (const slug of ['ff5', 'ff6', 'ff9']) games[slug] = await f.db.game.create({ data: { eventId: event.id, slug, title: 'Final Fantasy ' + { ff5: 'V', ff6: 'VI', ff9: 'IX' }[slug] } });
  for (const source of legacy) {
    const quest = await f.db.quest.create({ data: { eventId: event.id, gameId: games[source.gameSlug].id, number: source.number,
      title: source.title.en, description: source.description.en, titleEs: source.title.es, descriptionEs: source.description.es,
      isSecret: source.isSecret, status: source.isSecret ? 'SECRET' : 'AVAILABLE', initialStatus: source.isSecret ? 'SECRET' : 'AVAILABLE' } });
    await f.db.questGame.create({ data: { eventId: event.id, questId: quest.id, gameId: quest.gameId } });
  }
  await f.db.event.update({ where: { id: event.id }, data: { currentGameId: games.ff5.id } });
  const operator = await f.db.operator.create({ data: { name: 'History owner', role: 'OWNER', keyHash: 'history-review-local-test' } });
  const participant = await f.db.participant.create({ data: { tokenHash: 'history-review-local-viewer', nickname: 'Local viewer', expiresAt: new Date('2030-01-01') } });
  await f.db.operatorSession.create({ data: { operatorId: operator.id, tokenHash: 'history-review-local-session', expiresAt: new Date('2030-01-01') } });
  const poll = await f.db.poll.create({ data: { eventId: event.id, title: 'Historical game choice', type: 'NEXT_GAME', status: 'CLOSED',
    createdById: operator.id, closedAt: new Date('2026-10-01'), archivedAt: new Date('2026-10-02'), options: { create: [
      { position: 0, label: games.ff5.title, gameId: games.ff5.id }, { position: 1, label: games.ff6.title, gameId: games.ff6.id },
    ] } }, include: { options: { orderBy: { position: 'asc' } } } });
  await f.db.vote.create({ data: { pollId: poll.id, optionId: poll.options[0].id, participantId: participant.id } });
  const quest = await f.db.quest.findFirstOrThrow({ where: { number: 1 } });
  await f.db.auditLog.createMany({ data: Array.from({ length: 102 }, (_, index) => ({ eventId: event.id, operatorId: operator.id, operatorName: operator.name,
    entityId: index < 80 ? quest.id : event.id, action: index < 39 ? 'quest:completed' : index < 80 ? 'quest:activated' : index < 82 ? 'owner:prepare' : index === 82 ? 'owner:progress' : 'game:changed',
    before: { historical: true }, after: { preserved: true }, metadata: { version: 2 }, eventRevision: index + 1 })) });
  return Object.assign(f, { event, games, operator, participant, poll, quest });
}

async function snapshot(db) {
  const ordered = { orderBy: { id: 'asc' } };
  return { events: await db.event.findMany(ordered), quests: await db.quest.findMany(ordered), games: await db.game.findMany(ordered),
    links: await db.questGame.findMany({ orderBy: [{ questId: 'asc' }, { gameId: 'asc' }] }), polls: await db.poll.findMany(ordered),
    options: await db.pollOption.findMany(ordered), votes: await db.vote.findMany(ordered), audits: await db.auditLog.findMany(ordered),
    participants: await db.participant.findMany(ordered), operators: await db.operator.findMany(ordered), sessions: await db.operatorSession.findMany(ordered) };
}

async function blockedWithoutWrites(f, review) {
  const before = await snapshot(f.db), plan = await syncQuestCatalog(f.db, false, review);
  assert.equal(plan.canApply, false); assert.ok(plan.blocked.length); assert.equal(plan.reviewedHistory, undefined);
  assert.deepEqual(await snapshot(f.db), before);
  await assert.rejects(syncQuestCatalog(f.db, true, review), /BLOCKED/);
  assert.deepEqual(await snapshot(f.db), before);
  return plan;
}

test('explicit frozen history review preserves every historical row while replacing only the active catalog; rerun is a no-op', { timeout: 60000 }, async t => {
  const f = await historicalFixture(t), before = await snapshot(f.db);
  assert.equal((await syncQuestCatalog(f.db)).blocked.length, 54);
  const review = await prepareLegacyHistoryReview(f.db, backupSha256);
  assert.equal(review.version, 1); assert.equal(review.eventId, f.event.id); assert.equal(review.legacyQuestIds.length, 54);
  assert.equal(review.revision, 106); assert.equal(review.controlRevision, 103);
  assert.match(review.catalogSha256, /^[a-f0-9]{64}$/); assert.match(review.scopeSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await prepareLegacyHistoryReview(f.db, backupSha256), review);
  assert.deepEqual(await snapshot(f.db), before);
  const dry = await syncQuestCatalog(f.db, false, review);
  assert.equal(dry.canApply, true); assert.equal(dry.retire.length, 54); assert.equal(dry.create.length, 60);
  assert.deepEqual(dry.reviewedHistory, { allowed: true, audits: 102, polls: 1, votes: 1, backupSha256, scopeSha256: review.scopeSha256 });
  assert.deepEqual(await snapshot(f.db), before);
  const applied = await syncQuestCatalog(f.db, true, review);
  assert.deepEqual({ ...applied, apply: false }, dry);
  const after = await snapshot(f.db);
  for (const old of before.quests) {
    const next = after.quests.find(quest => quest.id === old.id);
    assert.ok(next.retiredAt);
    const { retiredAt, updatedAt, ...rest } = next, { retiredAt: oldRetired, updatedAt: oldUpdated, ...prior } = old;
    assert.deepEqual(rest, prior);
  }
  for (const table of ['polls', 'options', 'votes', 'participants', 'operators', 'sessions']) assert.deepEqual(after[table], before[table], table);
  assert.deepEqual(after.audits.filter(log => log.action !== 'catalog:synchronized'), before.audits);
  for (const link of before.links) assert.ok(after.links.some(next => JSON.stringify(next) === JSON.stringify(link)));
  assert.equal(after.quests.filter(quest => !quest.retiredAt).length, 60); assert.equal(after.quests.length, 114);
  const oldEvent = before.events[0], nextEvent = after.events[0];
  assert.equal(nextEvent.revision, oldEvent.revision + 1); assert.equal(nextEvent.controlRevision, oldEvent.controlRevision + 1);
  const { revision, controlRevision, updatedAt, ...stableEvent } = nextEvent;
  const { revision: previousRevision, controlRevision: previousControlRevision, updatedAt: previousUpdatedAt, ...previousEvent } = oldEvent;
  assert.deepEqual(stableEvent, previousEvent);
  const syncAudit = after.audits.find(log => log.action === 'catalog:synchronized');
  assert.deepEqual(syncAudit.metadata.reviewedHistory, dry.reviewedHistory); assert.equal(syncAudit.metadata.catalogSha256, review.catalogSha256);
  const again = await syncQuestCatalog(f.db, true, review);
  assert.equal(again.canApply, true); assert.equal(again.unchanged.length, 60);
  assert.equal(again.create.length + again.update.length + again.retire.length + again.createGames.length, 0);
  assert.deepEqual(await snapshot(f.db), after);
  const canonical = after.quests.find(quest => !quest.retiredAt && quest.number === 1);
  await f.db.quest.update({ where: { id: canonical.id }, data: { description: 'Later canonical text drift' } });
  const stale = await blockedWithoutWrites(f, review);
  assert.ok(stale.blocked.some(reason => reason.includes('unchanged, already synchronized')));
});

test('review identity, catalog, backup and scope changes reject atomically; default guards remain intact', { timeout: 60000 }, async t => {
  const f = await historicalFixture(t), review = await prepareLegacyHistoryReview(f.db, backupSha256);
  for (const patch of [
    { eventId: 'other-event' }, { revision: review.revision + 1 }, { controlRevision: review.controlRevision + 1 },
    { legacyQuestIds: review.legacyQuestIds.slice(1) }, { legacyQuestIds: [...review.legacyQuestIds.slice(1), review.legacyQuestIds[1]] },
    { catalogSha256: 'b'.repeat(64) }, { backupSha256: 'invalid' }, { backupSha256: 'c'.repeat(64) }, { scopeSha256: 'd'.repeat(64) },
  ]) await blockedWithoutWrites(f, { ...review, ...patch });
  await assert.rejects(prepareLegacyHistoryReview(f.db, 'invalid'), /verified backup/);
  await blockedWithoutWrites(f, undefined);
});

test('stale event, audit, eligibility, chosen game, content, poll and vote snapshots cannot be approved', { timeout: 60000 }, async t => {
  const f = await historicalFixture(t);
  const mutations = [
    () => f.db.event.update({ where: { id: f.event.id }, data: { revision: { increment: 1 } } }),
    async () => { const audit = await f.db.auditLog.findFirstOrThrow(); await f.db.auditLog.update({ where: { id: audit.id }, data: { metadata: { changedAfterReview: true } } }); },
    () => f.db.questGame.create({ data: { eventId: f.event.id, questId: f.quest.id, gameId: f.games.ff6.id } }),
    () => f.db.quest.update({ where: { id: f.quest.id }, data: { gameId: f.games.ff6.id } }),
    () => f.db.quest.update({ where: { id: f.quest.id }, data: { title: 'Changed after approval' } }),
    () => f.db.poll.update({ where: { id: f.poll.id }, data: { title: 'Changed historical question' } }),
    () => f.db.vote.updateMany({ data: { optionId: f.poll.options[1].id } }),
  ];
  for (const mutate of mutations) {
    const review = await prepareLegacyHistoryReview(f.db, backupSha256);
    await mutate();
    const plan = await blockedWithoutWrites(f, review);
    assert.ok(plan.blocked.some(reason => reason.includes('scope changed') || reason.includes('review does not match')), 'Each changed scope is independently rejected');
  }
});

test('reviewed CLI defaults to a zero-write dry-run and supports explicit apply/no-op while rejecting ambiguous arguments', { timeout: 60000 }, async t => {
  const f = await historicalFixture(t), review = await prepareLegacyHistoryReview(f.db, backupSha256);
  const directory = mkdtempSync(join(tmpdir(), 'level38-history-review-')), file = join(directory, 'review.json');
  writeFileSync(file, JSON.stringify(review));
  t.after(() => { unlinkSync(file); rmdirSync(directory); });
  const cli = (...args) => JSON.parse(execFileSync(process.execPath, ['dist/modules/level38/commands.js', 'quest-catalog', ...args], {
    env: { ...process.env, DATABASE_URL: f.databaseUrl }, encoding: 'utf8', stdio: 'pipe', windowsHide: true,
  }));
  const before = await snapshot(f.db), dry = cli('--reviewed-history', file);
  assert.equal(dry.apply, false); assert.equal(dry.canApply, true); assert.equal(dry.reviewedHistory.backupSha256, backupSha256);
  assert.deepEqual(await snapshot(f.db), before);
  for (const args of [
    ['--apply', '--dry-run'], ['--apply', '--apply'], ['--reviewed-history'], ['--reviewed-history', '--apply'],
    ['--reviewed-history', file, '--reviewed-history', file], ['--reviewed-history', file, 'unexpected'],
  ]) assert.throws(() => cli(...args));
  assert.deepEqual(await snapshot(f.db), before);
  assert.equal(cli('--apply', '--reviewed-history', file).apply, true);
  const settled = await snapshot(f.db), again = cli('--reviewed-history', file, '--apply');
  assert.equal(again.unchanged.length, 60); assert.equal(again.create.length + again.update.length + again.retire.length, 0);
  assert.deepEqual(await snapshot(f.db), settled);
});

test('reviewed retirement preserves archived quest-option and scalar-context references to the original legacy identities', { timeout: 60000 }, async t => {
  const f = await historicalFixture(t);
  const shared = { eventId: f.event.id, createdById: f.operator.id, status: 'CLOSED', closedAt: new Date('2026-10-01'), archivedAt: new Date('2026-10-02') };
  const questPoll = await f.db.poll.create({ data: { ...shared, type: 'NEXT_QUEST', title: 'Archived legacy quest choice',
    options: { create: [{ position: 0, label: f.quest.title, questId: f.quest.id }] } } });
  const contextPoll = await f.db.poll.create({ data: { ...shared, type: 'NEXT_GAME', title: 'Archived quest game context', contextQuestId: f.quest.id } });
  await blockedWithoutWrites(f, undefined);
  const review = await prepareLegacyHistoryReview(f.db, backupSha256), before = await snapshot(f.db);
  assert.equal((await syncQuestCatalog(f.db, false, review)).canApply, true);
  await syncQuestCatalog(f.db, true, review);
  const after = await snapshot(f.db);
  for (const table of ['polls', 'options', 'votes']) assert.deepEqual(after[table], before[table]);
  assert.equal((await f.db.poll.findUniqueOrThrow({ where: { id: contextPoll.id } })).contextQuestId, f.quest.id);
  const option = await f.db.pollOption.findFirstOrThrow({ where: { pollId: questPoll.id }, include: { quest: true } });
  assert.equal(option.questId, f.quest.id); assert.ok(option.quest.retiredAt);
  assert.notEqual((await f.db.quest.findFirstOrThrow({ where: { number: 1, retiredAt: null } })).id, f.quest.id);
});

test('fresh matching reviews never permit custom content, noninitial quests or any unarchived/open round', { timeout: 60000 }, async t => {
  const f = await historicalFixture(t);
  const scenarios = [
    { title: 'Custom authored content' }, { status: 'COMPLETED', completedAt: new Date('2026-10-03') },
    { status: 'ACTIVE' }, { initialStatus: 'LOCKED' }, { revealedAt: new Date('2026-10-03') },
  ];
  const original = await f.db.quest.findUniqueOrThrow({ where: { id: f.quest.id } });
  for (const data of scenarios) {
    await f.db.quest.update({ where: { id: f.quest.id }, data });
    await blockedWithoutWrites(f, await prepareLegacyHistoryReview(f.db, backupSha256));
    await f.db.quest.update({ where: { id: f.quest.id }, data: { title: original.title, status: original.status, initialStatus: original.initialStatus, completedAt: original.completedAt, revealedAt: original.revealedAt } });
  }
  for (const status of ['CLOSED', 'DRAFT', 'OPEN']) {
    await f.db.poll.update({ where: { id: f.poll.id }, data: { status, archivedAt: null } });
    await blockedWithoutWrites(f, await prepareLegacyHistoryReview(f.db, backupSha256));
  }
});
