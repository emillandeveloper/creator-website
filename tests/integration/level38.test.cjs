const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const { io } = require("socket.io-client");
const { seedLevel38 } = require("../../dist/modules/level38/seed");
const { newToken, hashToken } = require("../../dist/modules/level38/auth");
const { startSite } = require("../helpers.cjs");

function nextState(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("level38:state", onState); reject(new Error("Realtime state did not arrive.")); }, 8000);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      socket.off("level38:state", onState);
      resolve(state);
    }
    socket.on("level38:state", onState);
  });
}

test("LEVEL 38 PostgreSQL and HTTP/Socket.IO integration", { timeout: 90000 }, async (t) => {
  assert.ok(process.env.LEVEL38_TEST_DATABASE_URL, "Set LEVEL38_TEST_DATABASE_URL to a disposable PostgreSQL database whose name contains test.");
  const url = new URL(process.env.LEVEL38_TEST_DATABASE_URL);
  assert.match(url.pathname, /test/i, "Use a dedicated test database.");
  const schema = `level38_test_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  const databaseUrl = url.toString();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let site;
  const sockets = [];
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    if (site) await site.stop();
    // Only the random schema created by this test is removed, never an existing schema.
    assert.match(schema, /^level38_test_[a-f0-9]{32}$/);
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  });
  execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe", windowsHide: true,
  });
  site = await startSite({ LEVEL38_ENABLED: "true", DATABASE_URL: databaseUrl });
  const request = async (path, { body, cookie, origin, headers = {} } = {}) => {
    const response = await fetch(`${site.origin}/level38${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json", "X-Level38-Request": "1", Origin: origin ?? site.origin }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, data, cookie: response.headers.get("set-cookie"), headers: response.headers };
  };
  let operator, operatorCookie, viewerCookie, initialState;
  const key = newToken();

  await t.test("unseeded event is unavailable while existing site stays up", async () => {
    assert.equal((await request("/api/state")).status, 503);
    assert.equal((await fetch(`${site.origin}/portfolio`)).status, 200);
  });

  await t.test("seed creates a larger quest pool once and public views filter secrets", async () => {
    assert.equal(await seedLevel38(db), true);
    assert.equal(await seedLevel38(db), false);
    assert.equal(await db.quest.count(), 54);
    initialState = (await request("/api/state")).data;
    assert.equal(initialState.quests.length, 48);
    assert.equal(initialState.secretCount, 6);
    assert.equal(initialState.event.target, 38);
    assert.equal("audit" in initialState, false);
    assert.equal((await request("/")).status, 200);
    assert.doesNotMatch((await request("/")).data, /Secret treasure hunt/);
  });

  await t.test("anonymous identity persists, nicknames are nonunique and cannot grant a role", async () => {
    const first = await request("/api/session");
    viewerCookie = first.cookie.split(";")[0];
    assert.match(first.cookie, /HttpOnly/);
    assert.match(first.cookie, /SameSite=Lax/);
    assert.match(first.cookie, /Path=\/level38/);
    assert.equal(first.data.nickname, null);
    assert.equal((await request("/api/join", { cookie: viewerCookie, body: { nickname: "Isma", role: "OWNER" } })).data.role, "VIEWER");
    const second = await request("/api/session");
    assert.notEqual(second.cookie.split(";")[0], viewerCookie);
    assert.equal((await request("/api/join", { cookie: second.cookie.split(";")[0], body: { nickname: "Isma" } })).status, 200);
    assert.equal(await db.participant.count({ where: { nickname: "Isma" } }), 2);
    assert.equal((await request("/api/session", { cookie: viewerCookie })).data.nickname, "Isma");
    assert.equal((await request("/api/control/state", { cookie: viewerCookie })).status, 401);
    assert.equal((await request(`/api/control/quests/${initialState.quests[0].id}`, { cookie: viewerCookie, body: { action: "activate", revision: 0, role: "OWNER" } })).status, 401);
    assert.equal((await request("/api/join", { cookie: viewerCookie, body: { nickname: "<script>" } })).status, 400);
    assert.equal((await request("/api/join", { cookie: viewerCookie, origin: "https://attacker.invalid", body: { nickname: "Changed" } })).status, 403);
  });

  await t.test("operator credentials are checked server-side and cross-origin commands fail", async () => {
    operator = await db.operator.create({ data: { name: "ISMA", role: "MODERATOR", keyHash: hashToken(key) } });
    const login = await request("/api/control/login", { body: { key } });
    assert.equal(login.status, 200);
    operatorCookie = login.cookie.split(";")[0];
    assert.match(login.cookie, /HttpOnly/);
    assert.match(login.cookie, /SameSite=Strict/);
    const token = operatorCookie.slice(operatorCookie.indexOf("=") + 1);
    assert.equal(await db.operatorSession.count({ where: { tokenHash: hashToken(token) } }), 1);
    assert.equal((await request("/api/control/state", { cookie: operatorCookie })).data.quests.length, 54);
    const controlPage = await request("/control", { cookie: operatorCookie });
    assert.equal(controlPage.status, 200);
    assert.match(controlPage.data, /Signed in as/);
    assert.match(controlPage.headers.get("content-security-policy"), /script-src 'self'/);
    assert.equal((await request("/api/control/login", { body: { key: newToken() } })).status, 401);
    assert.equal((await request("/api/control/game", { cookie: operatorCookie, origin: "https://attacker.invalid", body: { gameId: null, revision: 0 } })).status, 403);
    assert.equal((await request("/api/control/game", { cookie: operatorCookie, body: { gameId: null, revision: 0 }, headers: { "X-Level38-Request": "" } })).status, 403);
    assert.equal((await request("/api/control/game", { cookie: operatorCookie, body: { gameId: null, revision: "0" } })).status, 400);
    assert.equal((await request("/api/control/game", { cookie: operatorCookie, body: { gameId: null, revision: 0 }, headers: { Origin: "" } })).status, 403);
    assert.equal((await request("/api/control/game", { cookie: operatorCookie, body: { gameId: "x".repeat(5000), revision: 0 } })).status, 413);
  });

  await t.test("two public sockets receive committed state and cannot write state", async () => {
    for (let index = 0; index < 2; index++) {
      const socket = io(`${site.origin}/level38`, { path: "/level38/socket.io", transports: ["websocket"], autoConnect: false, reconnection: false });
      sockets.push(socket);
      const snapshot = nextState(socket);
      socket.connect();
      assert.equal((await snapshot).event.revision, 0);
      socket.emit("quest:completed", { questId: initialState.quests[0].id });
    }
    const snapshots = sockets.map((socket) => nextState(socket, (state) => state.event.revision === 1));
    const result = await request(`/api/control/quests/${initialState.quests[0].id}`, { cookie: operatorCookie, body: { action: "activate", revision: 0 } });
    assert.equal(result.status, 200);
    for (const state of await Promise.all(snapshots)) {
      assert.equal(state.quests[0].status, "ACTIVE");
      assert.equal(state.event.completed, 0);
      assert.equal("audit" in state, false);
      assert.equal(state.quests.some((quest) => quest.hidden), false);
    }
    assert.equal(await db.auditLog.count(), 1);
  });

  await t.test("concurrent clicks produce one completion, one audit entry and a conflict", async () => {
    const quest = initialState.quests[0];
    const results = await Promise.all([1, 2].map(() => request(`/api/control/quests/${quest.id}`, { cookie: operatorCookie, body: { action: "complete", revision: 1 } })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const state = (await request("/api/control/state", { cookie: operatorCookie })).data;
    assert.equal(state.event.completed, 1);
    assert.equal(state.event.revision, 2);
    assert.equal(state.audit.length, 2);
    assert.equal(state.audit[0].before.completed, 0);
    assert.equal(state.audit[0].after.completed, 1);
    assert.equal((await request(`/api/control/quests/${quest.id}`, { cookie: operatorCookie, body: { action: "complete", revision: 2 } })).status, 409);
    const hidden = await db.quest.findFirst({ where: { isSecret: true } });
    assert.equal((await request(`/api/control/quests/${hidden.id}`, { cookie: operatorCookie, body: { action: "activate", revision: 2 } })).status, 409);
    assert.equal((await request("/api/state")).data.event.revision, 2);
  });

  await t.test("current game changes are audited and seed reruns preserve live state", async () => {
    const nextGame = initialState.games.find((game) => game.id !== initialState.event.currentGameId);
    assert.equal((await request("/api/control/game", { cookie: operatorCookie, body: { gameId: nextGame.id, revision: 2 } })).status, 200);
    assert.equal(await seedLevel38(db), false);
    const state = (await request("/api/state")).data;
    assert.equal(state.event.currentGameId, nextGame.id);
    assert.equal(state.event.completed, 1);
    assert.equal(state.event.revision, 3);
  });

  await t.test("database enforces one vote per participant/round and matching poll options", async () => {
    const event = await db.event.findUniqueOrThrow({ where: { slug: "level38" } });
    const participant = await db.participant.findFirstOrThrow();
    const poll = await db.poll.create({ data: { eventId: event.id, title: "Round one", status: "OPEN", createdById: operator.id } });
    const other = await db.poll.create({ data: { eventId: event.id, title: "Round two", createdById: operator.id } });
    const option = await db.pollOption.create({ data: { eventId: event.id, pollId: poll.id, questId: initialState.quests[0].id, label: "First quest", position: 0 } });
    const secondOption = await db.pollOption.create({ data: { eventId: event.id, pollId: poll.id, questId: initialState.quests[1].id, label: "Second quest", position: 1 } });
    const otherOption = await db.pollOption.create({ data: { eventId: event.id, pollId: other.id, questId: initialState.quests[0].id, label: "First quest", position: 0 } });
    const vote = await db.vote.create({ data: { pollId: poll.id, optionId: option.id, participantId: participant.id } });
    await assert.rejects(db.vote.create({ data: { pollId: poll.id, optionId: option.id, participantId: participant.id } }), { code: "P2002" });
    await assert.rejects(db.vote.update({ where: { id: vote.id }, data: { optionId: otherOption.id } }), { code: "P2003" });
    await db.vote.update({ where: { id: vote.id }, data: { optionId: secondOption.id } });
    await db.poll.update({ where: { id: poll.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await db.vote.create({ data: { pollId: other.id, optionId: otherOption.id, participantId: participant.id } });
    assert.equal(await db.vote.count(), 2);
    await assert.rejects(db.poll.delete({ where: { id: poll.id } }), { code: "P2003" });
  });

  await t.test("restart recovers progress, audit history and both session types", async () => {
    const oldPort = site.port;
    sockets.forEach((socket) => socket.disconnect());
    await site.stop();
    site = await startSite({ LEVEL38_ENABLED: "true", DATABASE_URL: databaseUrl }, oldPort);
    const state = (await request("/api/state")).data;
    assert.equal(state.event.completed, 1);
    assert.equal(state.event.revision, 3);
    assert.equal((await request("/api/session", { cookie: viewerCookie })).data.nickname, "Isma");
    assert.equal((await request("/api/control/state", { cookie: operatorCookie })).data.audit.length, 3);
    const snapshot = nextState(sockets[0]);
    sockets[0].connect();
    assert.equal((await snapshot).event.completed, 1);
  });

  await t.test("disabled operators and expired sessions cannot act; logout revokes access", async () => {
    await db.operator.update({ where: { id: operator.id }, data: { disabled: true } });
    assert.equal((await request("/api/control/state", { cookie: operatorCookie })).status, 401);
    assert.equal((await request("/api/control/game", { cookie: operatorCookie, body: { gameId: null, revision: 3 } })).status, 401);
    await db.operator.update({ where: { id: operator.id }, data: { disabled: false } });
    await db.operatorSession.updateMany({ data: { expiresAt: new Date(0) } });
    assert.equal((await request("/api/control/state", { cookie: operatorCookie })).status, 401);
    const login = await request("/api/control/login", { cookie: operatorCookie, body: { key } });
    operatorCookie = login.cookie.split(";")[0];
    assert.equal((await request("/api/control/logout", { cookie: operatorCookie, body: {} })).status, 200);
    assert.equal((await request("/api/control/state", { cookie: operatorCookie })).status, 401);
    await db.participant.updateMany({ data: { expiresAt: new Date(0) } });
    assert.equal((await request("/api/join", { cookie: viewerCookie, body: { nickname: "Leo" } })).status, 401);
    assert.notEqual((await request("/api/session", { cookie: viewerCookie })).cookie.split(";")[0], viewerCookie);
  });

  await t.test("operator CLI provisions, rotates and disables keys without resetting event data", async () => {
    const cli = (...args) => execFileSync(process.execPath, ["dist/modules/level38/commands.js", ...args], {
      env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    const createdKey = cli("operator", "create", "CLI Owner", "OWNER").trim().split("\n").at(-1);
    assert.match(createdKey, /^[A-Za-z0-9_-]{43}$/);
    const owner = await db.operator.findUniqueOrThrow({ where: { name: "CLI Owner" } });
    assert.equal(owner.keyHash, hashToken(createdKey));
    assert.equal(owner.role, "OWNER");
    const login = await request("/api/control/login", { body: { key: createdKey } });
    assert.equal(login.status, 200);
    const ownerCookie = login.cookie.split(";")[0];
    const rotatedKey = cli("operator", "rotate", "CLI Owner").trim().split("\n").at(-1);
    assert.notEqual(rotatedKey, createdKey);
    assert.equal((await request("/api/control/state", { cookie: ownerCookie })).status, 401);
    assert.equal((await request("/api/control/login", { body: { key: createdKey } })).status, 401);
    cli("operator", "disable", "CLI Owner");
    assert.equal((await db.operator.findUniqueOrThrow({ where: { name: "CLI Owner" } })).disabled, true);
    assert.equal((await request("/api/control/login", { body: { key: rotatedKey } })).status, 401);
    assert.match(cli("seed"), /no event data changed/);
    assert.equal((await request("/api/state")).data.event.completed, 1);
  });
});
