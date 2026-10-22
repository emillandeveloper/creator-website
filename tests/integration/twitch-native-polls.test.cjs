const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nativeFixture, ok } = require('./twitch-polls-support.cjs');

const progress = event => ({ completed: event.completed, target: event.target, unlockedAt: event.unlockedAt, currentGameId: event.currentGameId });

test('all native poll types preserve mappings, use signed Twitch tallies and leave operator control of quests/games', { timeout: 90000 }, async t => {
  const f = await nativeFixture(t);
  const viewerSession = await f.call('/api/session');
  ok(await f.call('/api/join', { nickname: 'Native QA viewer' }, viewerSession.cookie));
  const before = await f.service.state();
  const questsBefore = await f.db.quest.findMany({ orderBy: { id: 'asc' } });
  const eligibleQuest = before.quests.find(quest => !quest.hidden && quest.status === 'AVAILABLE' && quest.eligibleGameIds.length >= 2);
  const contextGames = [...eligibleQuest.eligibleGameIds.filter(id => id !== eligibleQuest.gameId), eligibleQuest.gameId].slice(0, 2);
  const questOptions = before.quests.filter(quest => !quest.hidden && quest.status === 'AVAILABLE').slice(0, 2);
  const variants = [
    { type: 'NEXT_QUEST', options: questOptions.map(quest => ({ questId: quest.id })) },
    { type: 'NEXT_GAME', options: before.games.slice(0, 2).map(game => ({ gameId: game.id })) },
    { type: 'NEXT_GAME', contextQuestId: eligibleQuest.id, options: contextGames.map(gameId => ({ gameId })) },
    { type: 'YES_NO', options: [{ label: 'Yes' }, { label: 'No' }] },
    { type: 'CUSTOM', options: [{ label: 'A custom choice' }, { label: 'Another choice' }] },
  ];
  for (const [index, input] of variants.entries()) {
    const poll = await f.create({ ...input, title: `Native type ${index + 1}` });
    assert.equal(poll.source, 'TWITCH'); assert.equal(poll.status, 'DRAFT');
    ok(await f.op(`polls/${poll.id}/status`, { action: 'open' }));
    const opened = await f.dbPoll(poll.id), upstream = f.fake.polls.find(item => item.id === opened.twitchPollId);
    assert.ok(upstream, 'opening must POST a genuine Helix poll to the simulated server');
    assert.equal(upstream.choices.length, 2); assert.ok(upstream.choices.every(choice => [...choice.title].length <= 25));
    assert.ok(opened.options.every(option => upstream.choices.some(choice => choice.id === option.twitchChoiceId)));
    assert.equal((await f.sendPoll('channel.poll.begin', upstream)).status, 204);
    assert.equal((await f.sendPoll('channel.poll.progress', upstream, { votes: [7, 3] })).status, 204);
    let state = await f.statePoll(poll.id);
    assert.equal(state.totalVotes, 10); assert.deepEqual(state.options.map(option => option.votes), [7, 3]);
    upstream.choices.reverse();
    assert.equal((await f.sendPoll('channel.poll.progress', upstream, { votes: [3, 7] })).status, 204);
    assert.deepEqual((await f.statePoll(poll.id)).options.map(option => option.votes), [7, 3], 'Twitch choice IDs, rather than array order, preserve internal quest/game mappings');
    upstream.choices.reverse();
    assert.equal(state.effectiveWinnerId, null, 'a current leader must not be announced before final results');
    const earlyWinner = await f.op(`polls/${poll.id}/winner`, { optionId: opened.options[0].id }); assert.equal(earlyWinner.status, 409);
    const voteResponse = await f.call(`/api/polls/${poll.id}/vote`, { optionId: opened.options[1].id }, viewerSession.cookie);
    assert.ok([403, 409, 410].includes(voteResponse.status), 'the website must not accept a parallel vote');
    assert.equal(await f.db.vote.count(), 0);
    assert.equal((await f.sendPoll('channel.poll.progress', upstream, { votes: [9, 3] })).status, 204);
    ok(await f.op(`polls/${poll.id}/status`, { action: 'close' }));
    assert.ok(f.fake.pollCalls.some(call => call.method === 'PATCH' && call.body.id === upstream.id && call.body.status === 'TERMINATED'));
    assert.equal((await f.sendPoll('channel.poll.end', upstream, { votes: [9, 3], status: 'terminated' })).status, 204);
    state = await f.statePoll(poll.id);
    assert.equal(state.status, 'CLOSED'); assert.equal(state.resultsFinal, true); assert.equal(state.totalVotes, 12);
    if (!state.effectiveWinnerId) ok(await f.op(`polls/${poll.id}/winner`, { optionId: opened.options[0].id }));
    state = await f.statePoll(poll.id); assert.equal(state.effectiveWinnerId, opened.options[0].id);
    assert.deepEqual(progress((await f.service.state()).event), progress(before.event), 'poll results must not activate a quest, change the active game, or alter progress');
    if (input.contextQuestId) {
      assert.notEqual(opened.options[0].gameId, eligibleQuest.gameId, 'the winner must exercise a real context assignment change');
      assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: input.contextQuestId } })).gameId, opened.options[0].gameId);
    }
  }
  const questsAfter = await f.db.quest.findMany({ orderBy: { id: 'asc' } });
  for (let index = 0; index < questsAfter.length; index++) {
    const { gameId: beforeGame, updatedAt: beforeTime, ...old } = questsBefore[index];
    const { gameId: afterGame, updatedAt: afterTime, ...current } = questsAfter[index];
    assert.deepEqual(current, old, 'polling preserves authored content and every quest status');
    if (old.id !== eligibleQuest.id) assert.equal(afterGame, beforeGame);
  }
  assert.equal(await f.db.quest.count({ where: { retiredAt: null } }), 60);
  assert.equal(await f.db.participant.count(), 1, 'only the explicit test viewer exists; native polls add nobody');
});

test('native EventSub is idempotent, ignores stale progress, recovers after disconnection and handles ties/zero votes', { timeout: 90000 }, async t => {
  const f = await nativeFixture(t);
  for (const votes of [[4, 4], [0, 0]]) {
    const poll = await f.create({ title: votes[0] ? 'Tied native poll' : 'Unvoted native poll' });
    ok(await f.op(`polls/${poll.id}/status`, { action: 'open' }));
    const upstream = f.fake.polls.find(item => item.id === (f.fake.polls[0].id));
    const currentAt = new Date().toISOString();
    const update = await f.sendPoll('channel.poll.progress', upstream, { votes, at: currentAt }); assert.equal(update.status, 204);
    const revision = (await f.service.state()).event.revision;
    assert.equal((await f.webhook(update.message)).status, 204);
    assert.equal((await f.service.state()).event.revision, revision, 'repeated message must not mutate results or event revision');
    assert.equal((await f.sendPoll('channel.poll.progress', upstream, { votes: [0, 0], at: new Date(Date.parse(currentAt) - 1000).toISOString() })).status, 204);
    assert.deepEqual((await f.statePoll(poll.id)).options.map(option => option.votes), votes);
    assert.equal((await f.sendPoll('channel.poll.end', upstream, { votes, status: 'completed' })).status, 204);
    let final = await f.statePoll(poll.id);
    assert.equal(final.resultsFinal, true); assert.equal(final.effectiveWinnerId, null, 'ties and zero votes need an operator decision');
    assert.equal((await f.sendPoll('channel.poll.progress', upstream, { votes: [99, 1] })).status, 204);
    assert.deepEqual((await f.statePoll(poll.id)).options.map(option => option.votes), votes, 'late progress must never overwrite a final result');
    ok(await f.op(`polls/${poll.id}/winner`, { optionId: poll.options[0].id, ...(votes[0] ? {} : { overrideReason: 'Operator resolves the no-vote round' }) }));
    final = await f.statePoll(poll.id); assert.equal(final.effectiveWinnerId, poll.options[0].id);
  }
  const recovery = await f.create({ title: 'Recover the native result' });
  ok(await f.op(`polls/${recovery.id}/status`, { action: 'open' }));
  const upstream = f.fake.polls[0]; upstream.choices[0].votes = 8; upstream.choices[1].votes = 2;
  upstream.status = 'COMPLETED'; upstream.ended_at = new Date().toISOString();
  await f.twitch.run('sync');
  const recovered = await f.statePoll(recovery.id);
  assert.equal(recovered.status, 'CLOSED'); assert.equal(recovered.resultsFinal, true); assert.equal(recovered.totalVotes, 10);
});

test('native upstream failures do not open local voting and historical web rounds remain intact', { timeout: 90000 }, async t => {
  const f = await nativeFixture(t);
  const event = await f.db.event.findFirstOrThrow();
  const historyRound = await f.db.poll.create({ data: { eventId: event.id, createdById: f.owner.id, source: 'WEB', title: 'Historical round remains unchanged', type: 'CUSTOM', status: 'OPEN', openedAt: new Date(Date.now() - 120000), endsAt: new Date(Date.now() - 60000) } });
  await f.db.pollOption.createMany({ data: [{ pollId: historyRound.id, eventId: event.id, label: 'Old first', position: 0 }, { pollId: historyRound.id, eventId: event.id, label: 'Old second', position: 1 }] });
  const historicalViewer = await f.db.participant.create({ data: { tokenHash: 'historical-fixture-hash', nickname: 'Historical voter', expiresAt: new Date(Date.now() - 60000) } });
  const historicalChoice = await f.db.pollOption.findFirstOrThrow({ where: { pollId: historyRound.id }, orderBy: { position: 'asc' } });
  await f.db.vote.create({ data: { pollId: historyRound.id, optionId: historicalChoice.id, participantId: historicalViewer.id } });
  const historical = await f.db.poll.findUniqueOrThrow({ where: { id: historyRound.id }, include: { options: true, votes: true } });
  const poll = await f.create({ title: 'Safe native open failure' });
  f.fake.pollFailure = 503;
  const failure = await f.op(`polls/${poll.id}/status`, { action: 'open' });
  assert.ok([409, 502, 503].includes(failure.status));
  assert.notEqual((await f.dbPoll(poll.id)).status, 'OPEN');
  assert.equal((await f.statePoll(poll.id)).effectiveWinnerId, null);
  assert.ok(!JSON.stringify(failure.data).includes('Private poll upstream response'));
  f.fake.pollFailure = null;
  await f.native.reconcile();
  assert.equal((await f.dbPoll(poll.id)).status, 'OPEN', 'a recovered preparing intent may safely complete its single create request');
  ok(await f.op(`polls/${poll.id}/status`, { action: 'cancel' }));
  const missing = await f.create({ title: 'Uncertain request before Twitch acceptance' });
  f.fake.pollPostBeforeAccept = true;
  const missingPosts = f.fake.pollCalls.filter(call => call.method === 'POST').length;
  assert.equal((await f.op(`polls/${missing.id}/status`, { action: 'open' })).status, 503);
  assert.notEqual((await f.dbPoll(missing.id)).status, 'OPEN');
  assert.equal((await f.op(`polls/${missing.id}/status`, { action: 'open' })).status, 503);
  assert.equal(f.fake.pollCalls.filter(call => call.method === 'POST').length, missingPosts + 1, 'retry must reconcile an uncertain POST without issuing another');
  ok(await f.op(`polls/${missing.id}/status`, { action: 'cancel' }));
  assert.equal((await f.dbPoll(missing.id)).closeReason, 'CANCELLED');
  assert.equal(f.fake.polls.some(remote => remote.title === missing.title), false);
  // An uncertain POST may already have created the Twitch poll. Recovery must
  // attach that poll, rather than retrying POST and creating a duplicate.
  const uncertain = await f.create({ title: 'An accepted request with a lost response' });
  f.fake.pollPostUncertain = true;
  const postCount = f.fake.pollCalls.filter(call => call.method === 'POST').length;
  ok(await f.op(`polls/${uncertain.id}/status`, { action: 'open' }));
  assert.equal(f.fake.pollCalls.filter(call => call.method === 'POST').length, postCount + 1);
  assert.equal((await f.dbPoll(uncertain.id)).status, 'OPEN');
  assert.equal(f.fake.polls.filter(remote => remote.title === uncertain.title).length, 1);
  ok(await f.op(`polls/${uncertain.id}/status`, { action: 'cancel' }));
  assert.equal((await f.dbPoll(uncertain.id)).closeReason, 'CANCELLED');
  assert.equal((await f.statePoll(uncertain.id)).effectiveWinnerId, null);
  assert.ok([409, 410].includes((await f.op(`polls/${historical.id}/status`, { action: 'open' })).status));
  await f.service.expirePolls();
  assert.deepEqual(await f.db.poll.findUnique({ where: { id: historical.id }, include: { options: true, votes: true } }), historical);
  assert.equal((await f.statePoll(historical.id)).readOnly, true);
  assert.equal((await f.statePoll(historical.id)).totalVotes, 1);
  assert.deepEqual(await f.db.participant.findUnique({ where: { id: historicalViewer.id } }), historicalViewer);
  assert.equal(await f.db.participant.count(), 1); assert.equal(await f.db.vote.count(), 1);
});
