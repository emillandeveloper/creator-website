const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { nativeFixture } = require("./twitch-polls-support.cjs");

const ok = (response) => { assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data; };
function next(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`No ${name} event`)); }, 8000);
    function receive(data) { clearTimeout(timer); resolve(data); }
    socket.once(name, receive);
  });
}

test("final catalog runtime preserves secret privacy, eligible choices, single completion and the 38-quest finale", { timeout: 120000 }, async (t) => {
  const f = await nativeFixture(t);
  const owner = await f.operator("Leo catalog", "OWNER"), mod = await f.operator("Catalog moderator", "MODERATOR");
  const viewer = await f.viewer("Catalog viewer");
  const control = async (cookie = mod.cookie) => ok(await f.call("/api/control/state", undefined, cookie));
  const publicState = async () => ok(await f.call("/api/state"));
  const op = async (path, body, cookie = mod.cookie) => f.call(`/api/control/${path}`, { ...body, controlRevision: (await control()).event.controlRevision }, cookie);
  const initial = await control(), ownerState = await control(owner.cookie);
  assert.equal(initial.quests.length, 60); assert.equal(ownerState.quests.length, 60);
  assert.deepEqual(initial.quests.map((quest) => quest.number), Array.from({ length: 60 }, (_, index) => index + 1));
  for (const [category, count] of Object.entries({ MULTI_GAME: 20, GAME_SPECIFIC: 28, COOPERATIVE: 6, SECRET: 6 })) {
    assert.equal(initial.quests.filter((quest) => quest.category === category).length, count);
  }
  assert.equal(initial.event.target, 38);
  const secrets = initial.quests.filter((quest) => quest.hidden);
  assert.deepEqual(secrets.map((quest) => quest.number), [55, 56, 57, 58, 59, 60]);
  const firstGeneration = initial.games.find((game) => game.slug === "ff1-8bit"); assert.ok(firstGeneration);
  const socket = io(`${f.origin}/level38`, { path: "/level38/socket.io", transports: ["websocket"], autoConnect: false, reconnection: false });
  t.after(() => socket.disconnect());
  const snapshot = next(socket, "level38:state"); socket.connect();
  function privateSecrets(state) {
    assert.equal(state.quests.length, 60);
    assert.equal(state.secretCount, 6);
    for (const secret of secrets) {
      const placeholder = state.quests.find((quest) => quest.number === secret.number);
      assert.equal(placeholder.title, "???"); assert.equal(placeholder.description, "");
      assert.equal(placeholder.gameId, null); assert.deepEqual(placeholder.eligibleGameIds, []);
      assert.equal(placeholder.status, "SECRET"); assert.equal(placeholder.category, "SECRET");
      assert.deepEqual(placeholder.translations, { en: { title: "???", description: "" }, es: { title: "???", description: "" } });
      for (const text of [secret.title, secret.description, secret.translations.es.title, secret.translations.es.description]) {
        assert.ok(text); assert.equal(JSON.stringify(state).includes(text), false, `Private text leaked for quest ${secret.number}`);
      }
    }
    assert.equal(JSON.stringify(state).includes("catalogKey"), false);
  }
  privateSecrets(await snapshot); privateSecrets(await publicState());
  assert.equal((await publicState()).games.some((game) => game.id === firstGeneration.id), false, "A secret-exclusive game is not a roster hint");
  const html = (await f.call("/")).data;
  for (const secret of secrets) assert.equal(html.includes(secret.title), false);
  for (const operatorState of [initial, ownerState]) {
    for (const secret of operatorState.quests.filter((quest) => quest.hidden)) {
      assert.notEqual(secret.title, "???"); assert.ok(secret.description); assert.ok(secret.eligibleGameIds.length);
    }
  }

  const multi = initial.quests.find((quest) => quest.category === "MULTI_GAME");
  const [gameA, gameB, outside] = initial.games.filter((game) => game.enabled && game.id !== firstGeneration.id);
  assert.ok(gameA && gameB && outside);
  assert.equal((await op(`quests/${multi.id}/games`, { gameIds: [gameA.id, gameB.id] }, viewer)).status, 401);
  assert.equal((await op(`quests/${multi.id}/games`, { gameIds: [] })).status, 400);
  ok(await op(`quests/${multi.id}/games`, { gameIds: [gameA.id, gameB.id] }));
  assert.equal((await op(`quests/${multi.id}/game`, { gameId: outside.id })).status, 409);
  const beforeChoice = (await control()).quests.find((quest) => quest.id === multi.id);
  const selected = beforeChoice.gameId === gameB.id ? gameA.id : gameB.id;
  const broadcast = next(socket, "level38:state");
  privateSecrets(ok(await op(`quests/${multi.id}/game`, { gameId: selected })));
  privateSecrets(await broadcast);
  const selectedState = await control();
  assert.equal(selectedState.quests.find((quest) => quest.id === multi.id).gameId, selected);
  assert.equal(selectedState.polls.length, 0, "A manual game choice does not require a poll");
  ok(await op("undo", { auditId: selectedState.undo.auditId }));
  assert.equal((await control()).quests.find((quest) => quest.id === multi.id).gameId, beforeChoice.gameId);
  ok(await op(`quests/${multi.id}/game`, { gameId: selected }));
  ok(await op(`quests/${multi.id}`, { action: "activate" }));
  ok(await op(`quests/${multi.id}`, { action: "complete" }));
  assert.equal((await publicState()).event.completed, 1);
  assert.equal((await op(`quests/${multi.id}`, { action: "complete" })).status, 409);
  assert.equal((await op(`quests/${multi.id}/game`, { gameId: beforeChoice.gameId })).status, 409);
  assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: multi.id } })).gameId, selected);

  const pollQuest = initial.quests.find((quest) => !quest.hidden && quest.id !== multi.id);
  ok(await op(`quests/${pollQuest.id}/games`, { gameIds: [gameA.id, gameB.id] }));
  const pollBody = { title: "Choose this quest's game", type: "NEXT_GAME", contextQuestId: pollQuest.id, options: [{ gameId: gameA.id }, { gameId: gameB.id }] };
  assert.equal((await op("polls", { ...pollBody, contextQuestId: secrets[0].id })).status, 409);
  assert.equal((await op("polls", { ...pollBody, options: [{ gameId: gameA.id }, { gameId: outside.id }] })).status, 409);
  ok(await op("polls", pollBody));
  const poll = (await control()).polls[0]; assert.equal(poll.contextQuestId, pollQuest.id);
  assert.equal((await f.db.poll.findUniqueOrThrow({ where: { id: poll.id } })).contextQuestId, pollQuest.id);
  ok(await op(`quests/${pollQuest.id}/games`, { gameIds: [gameA.id] }));
  assert.equal((await op(`polls/${poll.id}/status`, { action: "open" })).status, 409, "Opening rechecks changed eligibility");
  ok(await op(`quests/${pollQuest.id}/games`, { gameIds: [gameA.id, gameB.id] }));
  ok(await op(`polls/${poll.id}/status`, { action: "open" }));
  assert.equal((await op(`quests/${pollQuest.id}/games`, { gameIds: [gameA.id] })).status, 409);
  assert.equal((await f.call(`/api/polls/${poll.id}/vote`, { optionId: poll.options[1].id }, viewer)).status,409);
  const remote = f.fake.polls.at(-1);
  assert.equal((await f.sendPoll('channel.poll.progress',remote,{votes:[0,1]})).status,204);
  ok(await op(`polls/${poll.id}/status`, { action: "close" }));
  assert.equal((await control()).polls.find(item=>item.id===poll.id).effectiveWinnerId,poll.options[1].id);
  assert.equal((await control()).quests.find((quest) => quest.id === pollQuest.id).gameId, gameB.id);
  assert.equal((await publicState()).event.completed, 1, "Selecting a game never awards completion");
  ok(await op("polls", { ...pollBody, contextQuestId: null }));
  const global = (await control()).polls[0];
  assert.equal(global.contextQuestId, null); ok(await op(`polls/${global.id}/status`, { action: "open" }));
  ok(await op(`polls/${global.id}/status`, { action: "close" }));
  ok(await op("game", { gameId: firstGeneration.id }));
  assert.equal((await publicState()).games.some((game) => game.id === firstGeneration.id), true, "An explicitly selected current game remains public");
  ok(await op("game", { gameId: initial.event.currentGameId }));
  assert.equal((await publicState()).games.some((game) => game.id === firstGeneration.id), false);
  ok(await op("polls", { title: "Choose a roster game", type: "NEXT_GAME", options: [{ gameId: firstGeneration.id }, { gameId: gameA.id }] }));
  const rosterPoll = (await control()).polls[0];
  assert.equal((await publicState()).games.some((game) => game.id === firstGeneration.id), false, "Draft game options remain private");
  ok(await op(`polls/${rosterPoll.id}/status`, { action: "open" }));
  assert.equal((await publicState()).games.some((game) => game.id === firstGeneration.id), true, "An intentionally published global game option is public");
  ok(await op(`polls/${rosterPoll.id}/status`, { action: "close" }));

  const revealBroadcast = next(socket, "level38:state");
  ok(await op(`quests/${secrets[0].id}`, { action: "reveal" }));
  const revealed = await revealBroadcast;
  assert.equal(revealed.secretCount, 5);
  assert.equal(revealed.quests.find((quest) => quest.id === secrets[0].id).title, secrets[0].title);
  for (const secret of secrets.slice(1)) assert.equal(JSON.stringify(revealed).includes(secret.title), false);

  const generations = initial.quests.find((quest) => quest.number === 58);
  ok(await op(`quests/${generations.id}`, { action: "reveal" }));
  const generationQuest = (await publicState()).quests.find((quest) => quest.number === 58);
  assert.match(generationQuest.translations.en.description, /THREE different JRPGs/);
  assert.match(generationQuest.translations.es.description, /TRES JRPG distintos/);
  assert.equal(generationQuest.eligibleGameIds.length, 3);
  ok(await op(`quests/${generations.id}`, { action: "activate" }));
  for (const gameId of generationQuest.eligibleGameIds) {
    const current = (await control()).quests.find((quest) => quest.number === 58);
    if (current.gameId !== gameId) ok(await op(`quests/${generations.id}/game`, { gameId }));
    assert.equal((await publicState()).event.completed, 1, "Each generation context awards zero automatic completions");
  }
  ok(await op(`quests/${generations.id}`, { action: "complete" }));
  assert.equal((await publicState()).event.completed, 2, "The operator confirms the whole three-game objective once");
  assert.equal((await op(`quests/${generations.id}`, { action: "complete" })).status, 409);

  const event = await f.db.event.findFirstOrThrow();
  const retired = await f.db.quest.create({ data: { eventId: event.id, gameId: gameA.id, number: 1001, title: "Retired placeholder", description: "Historical completion", status: "COMPLETED", completedAt: new Date(), retiredAt: new Date() } });
  assert.equal((await publicState()).event.completed, 2);
  assert.equal((await control()).quests.some((quest) => quest.id === retired.id), false);
  assert.equal((await op(`quests/${retired.id}`, { action: "activate" })).status, 404);
  assert.equal((await op("polls", { title: "Retired quest", type: "NEXT_QUEST", options: [{ questId: retired.id }, { questId: pollQuest.id }] })).status, 409);
  const active = await f.db.quest.findMany({ where: { retiredAt: null, isSecret: false, status: { not: "COMPLETED" } }, orderBy: { number: "asc" } });
  await f.db.quest.updateMany({ where: { id: { in: active.slice(0, 35).map((quest) => quest.id) } }, data: { status: "COMPLETED", completedAt: new Date() } });
  const last = active[35]; assert.ok(last);
  await f.db.quest.update({ where: { id: last.id }, data: { status: "ACTIVE" } });
  assert.equal((await publicState()).event.completed, 37);
  const unlock = next(socket, "level38:unlocked");
  ok(await op(`quests/${last.id}`, { action: "complete" }));
  const finale = await unlock;
  assert.equal(finale.completed, 38); assert.equal(finale.target, 38);
  assert.equal((await publicState()).event.completed, 38);
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence, 1);
});
