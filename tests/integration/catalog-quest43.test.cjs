const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support.cjs');
const { syncQuestCatalog } = require('../../dist/modules/level38/quest-content-update');
const { QUEST_CONTENT, questTextData } = require('../../dist/modules/level38/quest-content');

const oldText = {
  title: 'Play It Again, Cloud!', titleEs: '¡Toca otra, Cloud!',
  description: 'Achieve at least rank A on any available piano song. Unlimited retries are allowed.',
  descriptionEs: 'Consigue al menos rango A en cualquier canción disponible del piano. Se permiten reintentos ilimitados.',
};
const ordered = { orderBy: { id: 'asc' } };
const snapshot = async db => ({
  events: await db.event.findMany(ordered), games: await db.game.findMany(ordered), quests: await db.quest.findMany(ordered),
  links: await db.questGame.findMany({ orderBy: [{ questId: 'asc' }, { gameId: 'asc' }] }),
  polls: await db.poll.findMany(ordered), options: await db.pollOption.findMany(ordered), votes: await db.vote.findMany(ordered),
  participants: await db.participant.findMany(ordered), operators: await db.operator.findMany(ordered),
  sessions: await db.operatorSession.findMany(ordered), audits: await db.auditLog.findMany(ordered),
  twitchStates: await db.twitchState.findMany({ orderBy: { eventId: 'asc' } }), twitchMessages: await db.twitchMessage.findMany(ordered),
});

async function oldFixture(t, { removeReplacement = true } = {}) {
  const f = await fixture(t);
  const quest = await f.db.quest.findFirstOrThrow({ where: { number: 43, retiredAt: null } });
  const previous = await f.db.game.findFirstOrThrow({ where: { slug: 'ff7-rebirth' } });
  const replacement = await f.db.game.findFirstOrThrow({ where: { slug: 'ff7-remake-intergrade' } });
  await f.db.questGame.deleteMany({ where: { questId: quest.id } });
  await f.db.questGame.create({ data: { eventId: quest.eventId, questId: quest.id, gameId: previous.id } });
  await f.db.quest.update({ where: { id: quest.id }, data: { ...oldText, gameId: previous.id } });
  if (removeReplacement) await f.db.game.delete({ where: { id: replacement.id } });
  return Object.assign(f, { quest: await f.db.quest.findUniqueOrThrow({ where: { id: quest.id } }), previous, replacement });
}

async function blockedWithoutWrites(f) {
  const before = await snapshot(f.db), plan = await syncQuestCatalog(f.db);
  assert.equal(plan.canApply, false); assert.ok(plan.blocked.some(reason => reason.includes('#43')));
  assert.deepEqual(await snapshot(f.db), before);
  await assert.rejects(syncQuestCatalog(f.db, true), /BLOCKED/);
  assert.deepEqual(await snapshot(f.db), before);
  return plan;
}

test('quest43 correction changes only its prose/game/link, retains stable identities and event data, and reruns without writes', { timeout: 60000 }, async t => {
  const f = await oldFixture(t);
  const other = await f.db.quest.findFirstOrThrow({ where: { number: 1 }, include: { eligibleGames: true } });
  const chosen = other.eligibleGames.find(link => link.gameId !== other.gameId).gameId;
  await f.db.quest.update({ where: { id: other.id }, data: { gameId: chosen, status: 'COMPLETED', completedAt: new Date('2026-10-20T12:00:00Z') } });
  await f.db.questGame.deleteMany({ where: { questId: other.id, gameId: { not: chosen } } });
  const operator = await f.db.operator.create({ data: { name: 'Quest43 owner', role: 'OWNER', keyHash: 'q43-owner-hash' } });
  await f.db.operatorSession.create({ data: { operatorId: operator.id, tokenHash: 'q43-session-hash', expiresAt: new Date('2027-01-01T00:00:00Z') } });
  const participant = await f.db.participant.create({ data: { tokenHash: 'q43-participant-hash', nickname: 'Preserve me', expiresAt: new Date('2027-01-01T00:00:00Z') } });
  const poll = await f.db.poll.create({ data: { eventId: f.quest.eventId, createdById: operator.id, title: 'Unrelated archived poll', status: 'CLOSED', archivedAt: new Date(),
    options: { create: [{ position: 0, label: other.title, questId: other.id }] } }, include: { options: true } });
  await f.db.vote.create({ data: { pollId: poll.id, optionId: poll.options[0].id, participantId: participant.id } });
  await f.db.auditLog.create({ data: { eventId: f.quest.eventId, operatorId: operator.id, operatorName: operator.name, action: 'quest:completed', entityId: other.id, before: {}, after: {}, eventRevision: 0 } });
  const before = await snapshot(f.db), dry = await syncQuestCatalog(f.db);
  assert.equal(dry.canApply, true); assert.deepEqual(dry.update, [43]); assert.equal(dry.unchanged.length, 59);
  assert.deepEqual(dry.create, []); assert.deepEqual(dry.retire, []); assert.deepEqual(dry.createGames, ['ff7-remake-intergrade']);
  assert.deepEqual(dry.gameChanges, [{ id: f.quest.id, number: 43, fromSlug: 'ff7-rebirth', toSlug: 'ff7-remake-intergrade', correctionVersion: 1 }]);
  assert.deepEqual(await snapshot(f.db), before);
  const apply = await syncQuestCatalog(f.db, true);
  assert.deepEqual({ ...apply, apply: false }, dry);
  const after = await snapshot(f.db), next = after.quests.find(quest => quest.id === f.quest.id);
  const replacement = after.games.find(game => game.slug === 'ff7-remake-intergrade');
  assert.equal(next.id, f.quest.id); assert.equal(next.catalogKey, 'q43-play-it-again-cloud'); assert.equal(next.number, 43);
  assert.equal(next.gameId, replacement.id); assert.deepEqual(Object.fromEntries(Object.keys(oldText).map(field => [field, next[field]])), questTextData(QUEST_CONTENT[42]));
  const { gameId, title, titleEs, description, descriptionEs, updatedAt, ...stableNext } = next;
  const { gameId: oldGameId, title: oldTitle, titleEs: oldTitleEs, description: oldDescription, descriptionEs: oldDescriptionEs, updatedAt: oldUpdatedAt, ...stableBefore } = f.quest;
  assert.deepEqual(stableNext, stableBefore);
  assert.deepEqual(after.quests.filter(quest => quest.id !== next.id), before.quests.filter(quest => quest.id !== next.id));
  assert.deepEqual(after.links.filter(link => link.questId !== next.id), before.links.filter(link => link.questId !== next.id));
  assert.deepEqual(after.links.filter(link => link.questId === next.id), [{ eventId: f.quest.eventId, questId: next.id, gameId: replacement.id }]);
  assert.deepEqual(after.games.filter(game => game.id !== replacement.id), before.games);
  for (const table of ['polls', 'options', 'votes', 'participants', 'operators', 'sessions', 'twitchStates', 'twitchMessages']) assert.deepEqual(after[table], before[table], table);
  assert.deepEqual(after.audits.filter(audit => audit.action !== 'catalog:synchronized'), before.audits);
  const audit = after.audits.find(row => row.action === 'catalog:synchronized');
  assert.deepEqual(audit.metadata.quest43Correction, { version: 1, questId: next.id, catalogKey: next.catalogKey, fromSlug: 'ff7-rebirth', toSlug: 'ff7-remake-intergrade' });
  const { revision, controlRevision, updatedAt: eventUpdatedAt, ...stableEvent } = after.events[0];
  const { revision: oldRevision, controlRevision: oldControlRevision, updatedAt: oldEventUpdatedAt, ...oldStableEvent } = before.events[0];
  assert.equal(revision, oldRevision + 1); assert.equal(controlRevision, oldControlRevision + 1); assert.deepEqual(stableEvent, oldStableEvent);
  assert.equal(after.quests.filter(quest => !quest.retiredAt).length, 60); assert.equal(after.events[0].target, 38);
  const again = await syncQuestCatalog(f.db, true);
  assert.equal(again.unchanged.length, 60); assert.deepEqual(again.gameChanges, []); assert.deepEqual(again.update, []);
  assert.deepEqual(await snapshot(f.db), after);
  // An explicit later operator choice survives an ordinary catalog rerun.
  await f.db.questGame.create({ data: { eventId: f.quest.eventId, questId: next.id, gameId: f.previous.id } });
  await f.db.quest.update({ where: { id: next.id }, data: { gameId: f.previous.id } });
  await f.db.questGame.delete({ where: { questId_gameId: { questId: next.id, gameId: replacement.id } } });
  const operatorChoice = await snapshot(f.db);
  assert.equal((await syncQuestCatalog(f.db, true)).canApply, true);
  assert.deepEqual(await snapshot(f.db), operatorChoice);
});

test('quest43 correction refuses progress, custom/partial prose and unexpected game associations atomically', { timeout: 60000 }, async t => {
  const f = await oldFixture(t);
  for (const patch of [
    { status: 'ACTIVE' }, { status: 'COMPLETED', completedAt: new Date() }, { status: 'FAILED' }, { status: 'SKIPPED' },
    { completedAt: new Date() }, { revealedAt: new Date() }, { initialStatus: 'LOCKED' }, { isSecret: true }, { category: 'MULTI_GAME' },
    { title: 'Custom old objective' }, { titleEs: null }, { ...questTextData(QUEST_CONTENT[42]) },
  ]) {
    await f.db.quest.update({ where: { id: f.quest.id }, data: patch });
    await blockedWithoutWrites(f);
    const { id, createdAt, updatedAt, ...original } = f.quest;
    await f.db.quest.update({ where: { id }, data: original });
  }
  const different = await f.db.game.findFirstOrThrow({ where: { slug: 'ff5' } });
  await f.db.questGame.create({ data: { eventId: f.quest.eventId, questId: f.quest.id, gameId: different.id } });
  await blockedWithoutWrites(f);
  await f.db.quest.update({ where: { id: f.quest.id }, data: questTextData(QUEST_CONTENT[42]) });
  await blockedWithoutWrites(f);
  await f.db.quest.update({ where: { id: f.quest.id }, data: oldText });
  await f.db.questGame.deleteMany({ where: { questId: f.quest.id } });
  await f.db.questGame.create({ data: { eventId: f.quest.eventId, questId: f.quest.id, gameId: different.id } });
  await f.db.quest.update({ where: { id: f.quest.id }, data: { gameId: different.id } });
  await blockedWithoutWrites(f);
  await f.db.questGame.deleteMany({ where: { questId: f.quest.id } });
  await f.db.questGame.create({ data: { eventId: f.quest.eventId, questId: f.quest.id, gameId: f.previous.id } });
  await f.db.quest.update({ where: { id: f.quest.id }, data: { gameId: f.previous.id } });
  await f.db.auditLog.create({ data: { eventId: f.quest.eventId, operatorName: 'Owner', action: 'quest:completed', entityId: f.quest.id, before: {}, after: {}, eventRevision: 0 } });
  assert.ok((await blockedWithoutWrites(f)).blocked.some(reason => reason.includes('audit history')));
});

test('quest43 correction preserves and blocks direct and context-only poll references including archived polls', { timeout: 60000 }, async t => {
  const f = await oldFixture(t);
  const operator = await f.db.operator.create({ data: { name: 'Poll history owner', role: 'OWNER', keyHash: 'q43-history-owner' } });
  for (const archived of [false, true]) for (const contextOnly of [false, true]) {
    const poll = await f.db.poll.create({ data: { eventId: f.quest.eventId, createdById: operator.id, title: 'Quest43 history',
      status: archived ? 'CLOSED' : 'DRAFT', archivedAt: archived ? new Date() : null,
      ...(contextOnly ? { type: 'NEXT_GAME', contextQuestId: f.quest.id } : { options: { create: [{ position: 0, label: f.quest.title, questId: f.quest.id }] } }),
    } });
    assert.ok((await blockedWithoutWrites(f)).blocked.some(reason => reason.includes('poll references')));
    await f.db.pollOption.deleteMany({ where: { pollId: poll.id } });
    await f.db.poll.delete({ where: { id: poll.id } });
  }
});

test('fresh replacement catalog stays unchanged and preserves audited operator game selections', { timeout: 60000 }, async t => {
  const f = await fixture(t), before = await snapshot(f.db);
  assert.deepEqual((await syncQuestCatalog(f.db, true)).gameChanges, []);
  assert.deepEqual(await snapshot(f.db), before);
  const quest = await f.db.quest.findFirstOrThrow({ where: { number: 43 } });
  const previous = await f.db.game.findFirstOrThrow({ where: { slug: 'ff7-rebirth' } });
  await f.db.questGame.deleteMany({ where: { questId: quest.id } });
  await f.db.questGame.create({ data: { eventId: quest.eventId, questId: quest.id, gameId: previous.id } });
  await f.db.quest.update({ where: { id: quest.id }, data: { gameId: previous.id } });
  await f.db.auditLog.create({ data: { eventId: quest.eventId, operatorName: 'Owner', action: 'quest:games', entityId: quest.id, before: {}, after: {}, eventRevision: 0 } });
  const changed = await snapshot(f.db);
  assert.equal((await syncQuestCatalog(f.db, true)).canApply, true);
  assert.deepEqual(await snapshot(f.db), changed);
});
