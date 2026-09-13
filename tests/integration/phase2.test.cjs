const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { fixture } = require("./support.cjs");

const ok = (response) => { assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data; };

test("Phase 2 moderator, voting, undo and concurrency workflows", { timeout: 120000 }, async (t) => {
  const f = await fixture(t); await f.start();
  const mod = await f.operator("ISMA", "MODERATOR");
  const owner = await f.operator("LEO", "OWNER");
  const viewer = await f.viewer("Viewer One");
  const viewer2 = await f.viewer("Viewer Two");
  const unnamed = await f.viewer();
  const control = async () => ok(await f.call("/api/control/state", undefined, mod.cookie));
  const publicState = async () => ok(await f.call("/api/state"));
  const op = async (path, body, revision, cookie = mod.cookie) => f.call(`/api/control/${path}`, { ...body, controlRevision: revision ?? (await control()).event.controlRevision }, cookie);
  const quest = async (id, action, revision) => op(`quests/${id}`, { action }, revision);
  const undo = async () => { const state = await control(); assert.equal(state.undo.available, true, state.undo.reason); return ok(await op("undo", { auditId: state.undo.auditId }, state.event.controlRevision)); };
  const draft = async (type = "CUSTOM", options = [{ label: "Alpha" }, { label: "Beta" }]) => {
    ok(await op("polls", { title: "Choose the next adventure", type, options }));
    return (await control()).polls[0];
  };
  const open = async (poll) => ok(await op(`polls/${poll.id}/status`, { action: "open" }));
  const close = async (poll) => ok(await op(`polls/${poll.id}/status`, { action: "close" }));
  const vote = (poll, index, cookie = viewer) => f.call(`/api/polls/${poll.id}/vote`, { optionId: poll.options[index].id }, cookie);
  const initial = await control(); const quests = initial.quests.filter((q) => !q.hidden);

  await t.test("viewers cannot run controls; moderators cannot configure owner-only games", async () => {
    for (const [path, body] of [["polls", { title: "Question", type: "YES_NO", options: [] }], ["undo", { auditId: "unknown" }], [`quests/${quests[0].id}`, { action: "reveal" }]]) {
      assert.equal((await op(path, body, 0, viewer)).status, 401);
    }
    const game = initial.games.find((game) => game.id !== initial.event.currentGameId);
    const body = { displayName: game.title, enabled: true, imagePath: "/img/logos/ff6.png", sortOrder: 2, controlRevision: 0 };
    assert.equal((await f.call(`/api/owner/games/${game.id}`, body, viewer)).status, 401);
    assert.equal((await f.call(`/api/owner/games/${game.id}`, body, mod.cookie)).status, 403);
    ok(await f.call(`/api/owner/games/${game.id}`, body, owner.cookie));
    assert.equal((await control()).undo.available, false);
    assert.equal((await f.call(`/api/owner/games/${game.id}`, { ...body, controlRevision: 1, imagePath: "https://attacker.invalid/a.svg" }, owner.cookie)).status, 400);
  });

  await t.test("all quest transitions and explicit undo restore timestamps and retain audit rows", async () => {
    const id = quests[0].id;
    assert.equal((await quest(id, "complete")).status, 409);
    ok(await quest(id, "activate"));
    await undo(); assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id } })).status, "AVAILABLE");
    ok(await quest(id, "activate"));
    for (const action of ["complete", "fail", "skip", "available"]) {
      const before = await f.db.auditLog.count();
      ok(await quest(id, action));
      const actionLog = (await control()).undo.auditId;
      await undo();
      const restored = await f.db.quest.findUniqueOrThrow({ where: { id } });
      assert.equal(restored.status, "ACTIVE"); assert.equal(restored.completedAt, null);
      assert.equal(await f.db.auditLog.count(), before + 2);
      assert.equal((await f.db.auditLog.findFirstOrThrow({ where: { undoOfId: actionLog } })).action, "action:undone");
      assert.equal((await control()).undo.available, false);
    }
    ok(await quest(id, "skip"));
    assert.equal((await quest(id, "available")).status, 409);
    await undo();
    const lockedId = quests[1].id;
    await f.db.quest.update({ where: { id: lockedId }, data: { status: "LOCKED" } });
    assert.equal((await quest(lockedId, "activate")).status, 409);
    ok(await quest(lockedId, "available")); await undo();
    assert.equal((await f.db.quest.findUniqueOrThrow({ where: { id: lockedId } })).status, "LOCKED");
  });

  await t.test("secrets stay out of HTML, API, polls and sockets until reveal, including after undo", async () => {
    const secret = initial.quests.find((q) => q.hidden);
    const socket = io(`${f.origin}/level38`, { path: "/level38/socket.io", transports: ["websocket"], autoConnect: false });
    t.after(() => socket.disconnect());
    function snapshot() { return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("No socket snapshot")), 8000); socket.once("level38:state", (state) => { clearTimeout(timer); resolve(state); }); }); }
    const first = snapshot(); socket.connect();
    for (const payload of [await first, await publicState(), (await f.call("/")).data]) assert.equal(JSON.stringify(payload).includes(secret.title), false);
    assert.equal((await op("polls", { title: "Secret poll", type: "NEXT_QUEST", options: [{ questId: secret.id }, { questId: quests[2].id }] })).status, 409);
    const revealed = snapshot(); ok(await quest(secret.id, "reveal"));
    assert.equal((await revealed).quests.some((q) => q.id === secret.id && !q.hidden), true);
    assert.match((await control()).audit[0].description, /revealed quest/);
    const hidden = snapshot(); await undo();
    assert.equal(JSON.stringify(await hidden).includes(secret.title), false);
    assert.equal(JSON.stringify(await publicState()).includes(secret.id), false);
    assert.equal((await f.call("/")).data.includes(secret.title), false);
  });

  await t.test("double completion and a racing undo cannot double-count or remove history", async () => {
    const id = quests[2].id;
    ok(await quest(id, "activate"));
    const before = await control();
    const results = await Promise.all([quest(id, "complete", before.event.controlRevision), quest(id, "complete", before.event.controlRevision)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal((await publicState()).event.completed, before.event.completed + 1);
    await undo();
    ok(await quest(id, "available")); ok(await quest(id, "activate"));
    const race = await control();
    const racing = await Promise.all([quest(id, "complete", race.event.controlRevision), op("undo", { auditId: race.undo.auditId }, race.event.controlRevision)]);
    assert.deepEqual(racing.map((result) => result.status).sort(), [200, 409]);
    const row = await f.db.quest.findUniqueOrThrow({ where: { id } });
    assert.ok(["AVAILABLE", "COMPLETED"].includes(row.status));
    assert.equal((await publicState()).event.completed, await f.db.quest.count({ where: { status: "COMPLETED" } }));
  });

  await t.test("manual game changes undo safely and subsequent operator actions block older undo", async () => {
    const before = await control();
    const gameId = before.games.find((g) => g.id !== before.event.currentGameId).id;
    ok(await op("game", { gameId })); await undo();
    assert.equal((await publicState()).event.currentGameId, before.event.currentGameId);
    ok(await op("game", { gameId })); const oldUndo = (await control()).undo.auditId;
    await draft("YES_NO", []);
    assert.equal((await op("undo", { auditId: oldUndo })).status, 409);
    assert.equal((await control()).undo.available, false);
  });

  await t.test("draft editing supports types/references; opening validates current options", async () => {
    const poll = await draft("NEXT_QUEST", [{ questId: quests[3].id }, { questId: quests[4].id }]);
    assert.equal((await publicState()).polls.some((p) => p.id === poll.id), false);
    ok(await op(`polls/${poll.id}/edit`, { title: "Pick a quest", type: "NEXT_QUEST", options: [{ questId: quests[3].id }, { questId: quests[5].id }] }));
    ok(await quest(quests[3].id, "activate"));
    assert.equal((await op(`polls/${poll.id}/status`, { action: "open" })).status, 409);
    ok(await quest(quests[3].id, "available")); await open(poll);
    assert.equal((await quest(quests[3].id, "activate")).status, 409);
    assert.equal((await op(`polls/${poll.id}/edit`, { title: "Change options", type: "CUSTOM", options: [{ label: "One" }, { label: "Two" }] })).status, 409);
    await close(poll);
    const games = await draft("NEXT_GAME", initial.games.slice(0, 2).map((game) => ({ gameId: game.id })));
    assert.ok(games.options.every((option) => option.gameId)); await open(games); await close(games);
    assert.equal((await op("polls", { title: "Duplicate", type: "CUSTOM", options: [{ label: "One" }, { label: "one" }] })).status, 400);
    const empty = await draft("CUSTOM", []);
    assert.equal((await op(`polls/${empty.id}/status`, { action: "open" })).status, 409);
  });

  await t.test("vote identity is session-based, rapid changes upsert once, totals broadcast, controls stay usable", async () => {
    const poll = await draft(); await open(poll);
    assert.equal((await vote(poll, 0, unnamed)).status, 403);
    assert.equal((await f.call(`/api/polls/${poll.id}/vote`, { optionId: poll.options[0].id })).status, 401);
    const initialControl = (await control()).event.controlRevision;
    const socket = io(`${f.origin}/level38`, { path: "/level38/socket.io", transports: ["websocket"] });
    t.after(() => socket.disconnect());
    await new Promise((resolve) => socket.once("connect", resolve));
    const notification = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("No vote event")), 8000); socket.once("poll:vote-updated", (payload) => { clearTimeout(timer); resolve(payload); }); });
    const concurrent = await Promise.all([vote(poll, 0), vote(poll, 1, viewer2)]);
    concurrent.forEach(ok); assert.deepEqual(Object.keys(await notification), ["revision"]);
    const rapid = await Promise.all(Array.from({ length: 8 }, (_, index) => vote(poll, index % 2)));
    rapid.forEach(ok);
    assert.equal(await f.db.vote.count({ where: { pollId: poll.id } }), 2);
    assert.equal((await publicState()).polls.find((p) => p.id === poll.id).totalVotes, 2);
    assert.equal((await control()).event.controlRevision, initialControl);
    ok(await vote(poll, 1));
    const session = ok(await f.call("/api/session", undefined, viewer));
    assert.equal(session.votes.find((v) => v.pollId === poll.id).optionId, poll.options[1].id);
    const undoState = await control(); assert.equal(undoState.undo.available, false);
    assert.equal((await op("undo", { auditId: undoState.undo.auditId })).status, 409);
    ok(await op(`polls/${poll.id}/status`, { action: "close" }, initialControl));
    assert.equal((await vote(poll, 0)).status, 409);
    await undo(); assert.equal((await publicState()).polls.find((p) => p.id === poll.id).totalVotes, 2);
    await close(poll);
  });

  await t.test("closing during in-flight votes yields a closed poll with exact persisted totals", async () => {
    const poll = await draft("YES_NO", []); await open(poll);
    const rev = (await control()).event.controlRevision;
    const results = await Promise.all([vote(poll, 0), op(`polls/${poll.id}/status`, { action: "close" }, rev), vote(poll, 1, viewer2)]);
    assert.equal(results[1].status, 200);
    assert.ok([200, 409].includes(results[0].status)); assert.ok([200, 409].includes(results[2].status));
    const published = (await publicState()).polls.find((p) => p.id === poll.id);
    assert.equal(published.status, "CLOSED");
    assert.equal(published.totalVotes, [results[0], results[2]].filter((r) => r.status === 200).length);
    assert.equal((await vote(poll, 1)).status, 409);
    assert.equal(await f.db.vote.count({ where: { pollId: poll.id } }), published.totalVotes);
  });

  await t.test("winner acceptance, ties, overrides and next rounds preserve previous votes", async () => {
    const poll = await draft(); await open(poll);
    ok(await vote(poll, 0)); ok(await vote(poll, 1, viewer2)); await close(poll);
    assert.deepEqual(new Set((await publicState()).polls.find((p) => p.id === poll.id).leadingOptionIds), new Set(poll.options.map((o) => o.id)));
    ok(await op(`polls/${poll.id}/winner`, { optionId: poll.options[0].id }));
    assert.equal((await control()).undo.available, false);
    ok(await op(`polls/${poll.id}/winner`, { optionId: poll.options[1].id, overrideReason: "The streamer needs a different game" }));
    const result = (await publicState()).polls.find((p) => p.id === poll.id);
    assert.equal(result.winningOptionId, poll.options[0].id); assert.equal(result.overrideOptionId, poll.options[1].id);
    assert.equal("overrideReason" in result, false);
    assert.match((await control()).audit[0].description, /overrode poll.*from Alpha to Beta/);
    const next = await draft(); assert.notEqual(next.id, poll.id); await open(next);
    ok(await vote(next, 0)); assert.equal(await f.db.vote.count({ where: { pollId: poll.id } }), 2);
    assert.equal(await f.db.vote.count({ where: { pollId: next.id } }), 1); await close(next);
    assert.equal((await op(`polls/${next.id}/winner`, { optionId: next.options[1].id })).status, 409);
    ok(await op(`polls/${next.id}/winner`, { optionId: next.options[0].id }));
  });

  await t.test("undo open is allowed only before voting; database enforces open and winner scope", async () => {
    const poll = await draft(); await open(poll); await undo();
    assert.equal((await control()).polls.find((p) => p.id === poll.id).status, "DRAFT");
    await open(poll);
    const other = await draft();
    assert.equal((await op(`polls/${other.id}/status`, { action: "open" })).status, 409);
    await assert.rejects(f.db.poll.update({ where: { id: other.id }, data: { status: "OPEN" } }), { code: "P2002" });
    await assert.rejects(f.db.poll.update({ where: { id: poll.id }, data: { winningOptionId: other.options[0].id, winningPollId: other.id } }));
    await close(poll);
    const noVotes = await draft(); await open(noVotes); await close(noVotes);
    assert.equal((await op(`polls/${noVotes.id}/winner`, { optionId: noVotes.options[0].id })).status, 409);
    ok(await op(`polls/${noVotes.id}/winner`, { optionId: noVotes.options[0].id, overrideReason: "No votes received" }));
  });
});
