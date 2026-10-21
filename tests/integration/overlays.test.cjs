const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { io } = require('socket.io-client');
const { fixture } = require('./support.cjs');
const { startSite } = require('../helpers.cjs');
const { hashToken, newToken } = require('../../dist/modules/level38/auth');
const fs = require('node:fs');
const path = require('node:path');

const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data; };
async function until(read, predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let value;
  do { value = await read(); if (predicate(value)) return value; await delay(50); } while (Date.now() < deadline);
  assert.fail(`State did not settle: ${JSON.stringify(value)}`);
}
function next(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Missing ${name}`)); }, 8000);
    function receive(value) { clearTimeout(timer); resolve(value); }
    socket.once(name, receive);
  });
}
async function setup(t) {
  const f = await fixture(t); await f.start();
  const operator = await f.operator('Overlay moderator', 'MODERATOR');
  const viewer = await f.viewer('Overlay voter');
  const state = async () => ok(await f.call('/api/state'));
  const op = async (route, body, cookie = operator.cookie, revision) => f.call(`/api/control/${route}`, {
    ...body, controlRevision: revision ?? (await f.db.event.findFirstOrThrow()).controlRevision,
  }, cookie);
  const draft = async ({ type = 'NEXT_QUEST', durationSeconds, contextQuestId, options } = {}) => {
    const before = await state();
    options ??= before.quests.filter(quest => !quest.hidden && quest.status === 'AVAILABLE').slice(0, 2).map(quest => ({ questId: quest.id }));
    ok(await op('polls', { title: 'Choose the next adventure', type, options,
      ...(durationSeconds === undefined ? {} : { durationSeconds }), ...(contextQuestId ? { contextQuestId } : {}),
    }));
    // Drafts are intentionally absent from public state.
    return (await f.db.poll.findMany({ include: { options: { orderBy: { position: 'asc' } } }, orderBy: { number: 'desc' } }))[0];
  };
  const open = async poll => ok(await op(`polls/${poll.id}/status`, { action: 'open' }));
  const vote = (poll, index = 0, cookie = viewer) => f.call(`/api/polls/${poll.id}/vote`, { optionId: poll.options[index].id }, cookie);
  const row = poll => f.db.poll.findUniqueOrThrow({ where: { id: poll.id } });
  return Object.assign(f, { operator, viewerCookie: viewer, state, op, draft, open, vote, row });
}

test('OBS timing migration adds deadlines while preserving existing participants, progress, rounds, votes and audits', { timeout: 120000 }, async t => {
  const f = await fixture(t, { migrate: false, seed: false });
  const schema = new URL(f.databaseUrl).searchParams.get('schema'); assert.match(schema, /^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  // One CLI process creates the prior schema; the separate upgrade below is what is under test.
  const beforeNames = fs.readdirSync('prisma/migrations').filter(name => /^\d/.test(name) && name < '202610210012').sort();
  const upgradeDirectory = fs.mkdtempSync(path.resolve('dist/overlays-upgrade-'));
  const beforeSql = path.join(upgradeDirectory, 'before-overlays.sql');
  fs.writeFileSync(beforeSql, beforeNames.map(name => fs.readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8')).join('\n'));
  f.cli('db', 'execute', '--file', beforeSql, '--schema', 'prisma/schema.prisma');
  const event = await f.db.event.create({ data: { slug: 'level38', title: 'LEVEL 38', revision: 42, controlRevision: 20, unlockSequence: 2, resetSequence: 3 } });
  const game = await f.db.game.create({ data: { eventId: event.id, slug: 'test-game', title: 'Preserved game' } });
  const quest = await f.db.quest.create({ data: { eventId: event.id, gameId: game.id, number: 43, title: 'Preserved progress', description: 'Do not reset', status: 'COMPLETED', completedAt: new Date('2026-10-20T12:00:00Z') } });
  const participant = await f.db.participant.create({ data: { tokenHash: 'overlay-upgrade-viewer', nickname: 'Preserved viewer', classId: 'thief', variantId: 'faris', expiresAt: new Date('2030-01-01') } });
  const operator = await f.db.operator.create({ data: { name: 'Preserved owner', role: 'OWNER', keyHash: 'overlay-upgrade-owner' } });
  const openedAt = new Date();
  await f.db.$executeRaw`INSERT INTO "Poll" (id,"eventId",title,type,status,"createdById","openedAt") VALUES ('legacy-open',${event.id},'Keep open round','YES_NO','OPEN',${operator.id},${openedAt})`;
  await f.db.$executeRaw`INSERT INTO "Poll" (id,"eventId",title,type,status,"createdById","closedAt") VALUES ('legacy-closed',${event.id},'Keep closed round','YES_NO','CLOSED',${operator.id},${openedAt})`;
  await f.db.pollOption.create({ data: { id: 'legacy-option', eventId: event.id, pollId: 'legacy-open', label: 'Keep this vote', position: 0 } });
  const vote = await f.db.vote.create({ data: { pollId: 'legacy-open', optionId: 'legacy-option', participantId: participant.id } });
  const audit = await f.db.auditLog.create({ data: { eventId: event.id, operatorId: operator.id, operatorName: operator.name, action: 'quest:completed', entityId: quest.id, before: {}, after: {}, eventRevision: 42 } });
  const pollsBefore = await f.db.$queryRaw`SELECT * FROM "Poll" ORDER BY id`;
  f.cli('db', 'execute', '--file', 'prisma/migrations/202610210012_level38_obs_overlays/migration.sql', '--schema', 'prisma/schema.prisma');
  assert.deepEqual(await f.db.event.findUniqueOrThrow({ where: { id: event.id } }), event);
  assert.deepEqual(await f.db.quest.findUniqueOrThrow({ where: { id: quest.id } }), quest);
  assert.deepEqual(await f.db.participant.findUniqueOrThrow({ where: { id: participant.id } }), participant);
  assert.deepEqual(await f.db.vote.findUniqueOrThrow({ where: { id: vote.id } }), vote);
  assert.deepEqual(await f.db.auditLog.findUniqueOrThrow({ where: { id: audit.id } }), audit);
  const polls = await f.db.poll.findMany({ orderBy: { id: 'asc' } });
  assert.deepEqual(polls.map(({ durationSeconds, endsAt, cancelledAt, closeReason, ...unchanged }) => unchanged), pollsBefore);
  for (const poll of polls) { assert.equal(poll.durationSeconds, 60); assert.equal(poll.cancelledAt, null); assert.equal(poll.closeReason, null); }
  assert.equal(polls.find(poll => poll.id === 'legacy-open').endsAt.getTime(), pollsBefore.find(poll => poll.id === 'legacy-open').openedAt.getTime() + 60000);
  assert.equal(polls.find(poll => poll.id === 'legacy-closed').endsAt, null);
});

test('OBS routes are anonymous, read-only, localized and redact every unrevealed secret without changing catalog or party', { timeout: 60000 }, async t => {
  const f = await setup(t);
  const quests = await f.db.quest.findMany({ orderBy: { number: 'asc' } });
  const secrets = quests.filter(quest => quest.isSecret);
  const participantCount = await f.db.participant.count();
  const event = await f.db.event.findFirstOrThrow();
  const state = await f.state();
  assert.equal(quests.length, 60); assert.equal(secrets.length, 6); assert.equal(state.event.target, 38);
  const q43 = quests.find(quest => quest.number === 43);
  assert.equal(q43.title, 'Stop Hitting It, Tifa!'); assert.equal(q43.titleEs, '¡Deja de pegarle, Tifa!');
  assert.equal((await f.db.game.findUniqueOrThrow({ where: { id: q43.gameId } })).slug, 'ff7-remake-intergrade');
  for (const route of ['/overlay/poll', '/overlay/quest', '/overlay/poll?lang=en', '/overlay/quest?lang=en']) {
    const response = await f.call(route); assert.equal(response.status, 200);
    assert.match(response.data, /data-overlay="(?:poll|quest)"/);
    assert.match(response.data, route.includes('lang=en') ? /data-overlay-lang="en"/ : /data-overlay-lang="es"/);
    assert.doesNotMatch(response.data, /name="key"|id="operator-controls"|id="owner-tools"/);
    for (const secret of secrets) for (const field of ['title', 'titleEs', 'description', 'descriptionEs']) {
      assert.ok(!response.data.includes(secret[field]), `HTML leaked ${field} for #${secret.number}`);
    }
  }
  const socket = io(`${f.origin}/level38`, { path: '/level38/socket.io', transports: ['websocket'], autoConnect: false, reconnection: false });
  t.after(() => socket.disconnect()); const snapshot = next(socket, 'level38:state'); socket.connect();
  for (const payload of [state, await snapshot]) {
    for (const secret of secrets) for (const field of ['title', 'titleEs', 'description', 'descriptionEs']) {
      assert.ok(!JSON.stringify(payload).includes(secret[field]), `Snapshot leaked ${field} for #${secret.number}`);
    }
    assert.equal(payload.quests.filter(quest => quest.hidden).length, 6);
    assert.equal(payload.overlayQuestCompletion, null);
  }
  assert.equal(await f.db.participant.count(), participantCount, 'OBS must not create viewer identities or party members');
  assert.deepEqual(await f.db.event.findFirstOrThrow(), event);
  assert.deepEqual(await f.db.quest.findMany({ orderBy: { number: 'asc' } }), quests);
  assert.equal((await f.call('/api/control/state')).status, 401);
  assert.equal((await f.op('polls', { title: 'Forbidden', type: 'YES_NO', options: [] }, f.viewerCookie)).status, 401);
});

test('poll duration defaults to a persisted server deadline; custom duration, extension, manual close and cancel retain votes', { timeout: 60000 }, async t => {
  const f = await setup(t);
  const initial = await f.draft(); assert.equal(initial.durationSeconds, 60); assert.equal(initial.endsAt, null);
  await f.open(initial);
  const opened = await f.row(initial);
  assert.equal(opened.endsAt.getTime() - opened.openedAt.getTime(), 60000);
  const published = (await f.state()).polls.find(poll => poll.id === initial.id);
  assert.equal(published.durationSeconds, 60); assert.equal(published.endsAt, opened.endsAt.toISOString());
  assert.ok(Math.abs((await f.state()).serverTime - Date.now()) < 3000);
  ok(await f.vote(initial));
  assert.equal((await f.op(`polls/${initial.id}/extend`, { seconds: 30 }, f.viewerCookie)).status, 401);
  for (const seconds of [0, -1, 3601, 1.5, '30']) assert.equal((await f.op(`polls/${initial.id}/extend`, { seconds })).status, 400);
  ok(await f.op(`polls/${initial.id}/extend`, { seconds: 30 }));
  assert.equal((await f.row(initial)).endsAt.getTime(), opened.endsAt.getTime() + 30000);
  assert.equal((await f.op(`polls/${initial.id}/extend`, { seconds: 3600 })).status, 409);
  ok(await f.op(`polls/${initial.id}/status`, { action: 'close' }));
  let closed = await f.row(initial); assert.equal(closed.closeReason, 'MANUAL'); assert.equal(closed.winnerAcceptedAt, null);
  assert.equal(closed.winningOptionId, null, 'early close keeps the established explicit acceptance workflow');
  ok(await f.op(`polls/${initial.id}/winner`, { optionId: initial.options[0].id }));
  closed = await f.row(initial); assert.equal(closed.winningOptionId, initial.options[0].id); assert.ok(closed.winnerAcceptedAt);
  assert.equal((await f.vote(initial)).status, 409);
  assert.equal(await f.db.vote.count({ where: { pollId: initial.id } }), 1);
  const custom = await f.draft({ durationSeconds: 125 }); await f.open(custom);
  const customOpen = await f.row(custom); assert.equal(customOpen.endsAt - customOpen.openedAt, 125000);
  ok(await f.vote(custom)); ok(await f.op(`polls/${custom.id}/status`, { action: 'cancel' }));
  const cancelled = await f.row(custom);
  assert.equal(cancelled.status, 'CLOSED'); assert.equal(cancelled.closeReason, 'CANCELLED'); assert.ok(cancelled.cancelledAt);
  assert.equal(cancelled.winningOptionId, null); assert.equal(cancelled.winnerAcceptedAt, null);
  assert.equal((await f.op(`polls/${custom.id}/winner`, { optionId: custom.options[0].id })).status, 409);
  assert.equal((await f.op(`polls/${custom.id}/extend`, { seconds: 10 })).status, 409);
  assert.equal(await f.db.vote.count({ where: { pollId: custom.id } }), 1, 'cancellation preserves the original votes');
  for (const durationSeconds of [0, -1, 3601, 1.25, '60', null]) {
    assert.equal((await f.op('polls', { title: 'Invalid duration', type: 'YES_NO', options: [], durationSeconds })).status, 400);
  }
});

test('server expiry confirms the sole voted leader once, broadcasts results, and applies existing NEXT_GAME quest selection', { timeout: 60000 }, async t => {
  const f = await setup(t);
  const state = await f.state(), quest = state.quests.find(item => !item.hidden && item.eligibleGameIds.length >= 2);
  const gameIds = quest.eligibleGameIds.slice(0, 2);
  const poll = await f.draft({ type: 'NEXT_GAME', contextQuestId: quest.id, durationSeconds: 2, options: gameIds.map(gameId => ({ gameId })) });
  const socket = io(`${f.origin}/level38`, { path: '/level38/socket.io', transports: ['websocket'], autoConnect: false });
  t.after(() => socket.disconnect()); const connected = next(socket, 'level38:state'); socket.connect(); await connected;
  await f.open(poll);
  const notification = next(socket, 'poll:vote-updated'); ok(await f.vote(poll, 1)); await notification;
  const closed = await until(() => f.row(poll), row => row.status === 'CLOSED');
  assert.equal(closed.closeReason, 'TIMEOUT'); assert.equal(closed.winningOptionId, poll.options[1].id); assert.ok(closed.winnerAcceptedAt);
  assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: quest.id } })).gameId, gameIds[1]);
  const publicPoll = (await f.state()).polls.find(item => item.id === poll.id);
  assert.equal(publicPoll.totalVotes, 1); assert.equal(publicPoll.effectiveWinnerId, poll.options[1].id);
  assert.equal(publicPoll.winnerAcceptedAt, closed.winnerAcceptedAt.toISOString());
  const audits = await f.db.auditLog.findMany({ where: { entityId: poll.id } });
  const closeAudits = audits.filter(audit => ['poll:closed', 'poll:expired'].includes(audit.action));
  assert.equal(closeAudits.length, 1);
  await delay(200); assert.equal((await f.row(poll)).winnerAcceptedAt.getTime(), closed.winnerAcceptedAt.getTime());
  assert.equal((await f.vote(poll)).status, 409);
  assert.equal((await f.db.event.findFirstOrThrow()).target, 38);
});

test('expiry leaves ties and zero-vote rounds for the operator; next-quest acceptance preserves manual activation', { timeout: 60000 }, async t => {
  const f = await setup(t), viewer2 = await f.viewer('Second overlay voter');
  for (const tie of [true, false]) {
    const poll = await f.draft({ durationSeconds: 2 }); await f.open(poll);
    if (tie) { ok(await f.vote(poll, 0)); ok(await f.vote(poll, 1, viewer2)); }
    const closed = await until(() => f.row(poll), row => row.status === 'CLOSED');
    assert.equal(closed.closeReason, 'TIMEOUT'); assert.equal(closed.winningOptionId, null); assert.equal(closed.winnerAcceptedAt, null);
    const options = (await f.state()).polls.find(item => item.id === poll.id);
    assert.equal(options.leadingOptionIds.length, tie ? 2 : 0);
    if (!tie) assert.equal((await f.op(`polls/${poll.id}/winner`, { optionId: poll.options[0].id })).status, 409);
    ok(await f.op(`polls/${poll.id}/winner`, { optionId: poll.options[0].id, ...(!tie ? { overrideReason: 'No votes; operator chooses the next challenge' } : {}) }));
    const questId = poll.options[0].questId;
    assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: questId } })).status, 'AVAILABLE');
    ok(await f.op(`quests/${questId}`, { action: 'activate' }));
    assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: questId } })).status, 'ACTIVE');
    ok(await f.op(`quests/${questId}`, { action: 'available' }));
  }
});

test('a late vote cannot pass a persisted deadline even before the originally scheduled timer fires', { timeout: 60000 }, async t => {
  const f = await setup(t), poll = await f.draft(); await f.open(poll);
  // Move only the persisted deadline: the process was originally scheduled for a minute later.
  await f.db.poll.update({ where: { id: poll.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  assert.equal((await f.vote(poll)).status, 409);
  const closed = await until(() => f.row(poll), row => row.status === 'CLOSED');
  assert.equal(closed.closeReason, 'TIMEOUT'); assert.equal(closed.winningOptionId, null);
  assert.equal(await f.db.vote.count({ where: { pollId: poll.id } }), 0);
});

test('persisted deadlines recover after a process restart and concurrent runtimes cannot close one round twice', { timeout: 90000 }, async t => {
  const f = await fixture(t); let site, second;
  t.after(async () => { if (site) await site.stop(); if (second) await second.stop(); });
  const call = async (path, body, cookie) => {
    const response = await fetch(`${site.origin}/level38${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: site.origin, 'X-Level38-Request': '1' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const launch = () => startSite({ LEVEL38_ENABLED: 'true', DATABASE_URL: f.databaseUrl });
  site = await launch();
  const key = newToken(); await f.db.operator.create({ data: { name: 'Restart owner', role: 'OWNER', keyHash: hashToken(key) } });
  const login = await call('/api/control/login', { key }); ok(login); const operatorCookie = login.cookie;
  const op = async (route, body) => ok(await call(`/api/control/${route}`, { ...body, controlRevision: (await f.db.event.findFirstOrThrow()).controlRevision }, operatorCookie));
  const make = async durationSeconds => {
    await op('polls', { title: 'Restart-resistant timer', type: 'YES_NO', options: [], durationSeconds });
    const poll = await f.db.poll.findFirstOrThrow({ orderBy: { number: 'desc' }, include: { options: { orderBy: { position: 'asc' } } } });
    await op(`polls/${poll.id}/status`, { action: 'open' }); return poll;
  };
  const poll = await make(30), before = await f.db.poll.findUniqueOrThrow({ where: { id: poll.id } });
  await site.stop(); site = undefined;
  // Expire while every application process is stopped; the durable row is the recovery source.
  await f.db.poll.update({ where: { id: poll.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  site = await launch();
  const recovered = await until(() => f.db.poll.findUniqueOrThrow({ where: { id: poll.id } }), row => row.status === 'CLOSED');
  assert.equal(recovered.closeReason, 'TIMEOUT'); assert.equal(recovered.winningOptionId, null);
  assert.equal(recovered.openedAt.getTime(), before.openedAt.getTime());
  const raced = await make(10);
  second = await launch();
  // Both process runtimes now recover the same still-open durable deadline.
  assert.equal((await f.db.poll.findUniqueOrThrow({ where: { id: raced.id } })).status, 'OPEN');
  const closed = await until(() => f.db.poll.findUniqueOrThrow({ where: { id: raced.id } }), row => row.status === 'CLOSED', 15000);
  assert.equal(closed.closeReason, 'TIMEOUT');
  await delay(250);
  assert.equal(await f.db.auditLog.count({ where: { entityId: raced.id, action: { in: ['poll:closed', 'poll:expired'] } } }), 1);
  assert.equal(await f.db.vote.count({ where: { pollId: raced.id } }), 0);
});

test('active and completed quest snapshots update without revealing secret details or forcing polls or party changes', { timeout: 60000 }, async t => {
  const f = await setup(t), before = await f.state();
  const quests = await f.db.quest.findMany({ orderBy: { number: 'asc' } });
  const quest = before.quests.find(item => item.number === 43);
  ok(await f.op(`quests/${quest.id}`, { action: 'activate' }));
  let state = await f.state(); assert.equal(state.quests.find(item => item.id === quest.id).status, 'ACTIVE');
  assert.equal(state.overlayActiveQuest.id, quest.id);
  assert.equal(state.overlayQuestCompletion, null);
  ok(await f.op(`quests/${quest.id}`, { action: 'complete' }));
  state = await f.state(); assert.equal(state.overlayQuestCompletion.id, quest.id); assert.ok(state.overlayQuestCompletion.completedAt);
  assert.equal(state.event.completed, 1); assert.equal(state.event.target, 38);
  const nextQuest = state.quests.find(item => !item.hidden && item.status === 'AVAILABLE');
  ok(await f.op(`quests/${nextQuest.id}`, { action: 'activate' }));
  ok(await f.op(`quests/${nextQuest.id}`, { action: 'skip' }));
  state = await f.state(); assert.equal(state.polls.length, 0); assert.deepEqual(state.party, before.party);
  for (const secret of quests.filter(item => item.isSecret)) {
    const publicQuest = state.quests.find(item => item.id === secret.id);
    assert.equal(publicQuest.hidden, true); assert.equal(publicQuest.title, '???'); assert.equal(publicQuest.completedAt, null);
    assert.ok(!JSON.stringify(state).includes(secret.title)); assert.ok(!JSON.stringify(state).includes(secret.description));
  }
  assert.equal(await f.db.quest.count({ where: { retiredAt: null } }), 60);
});
