const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { io } = require("socket.io-client");
const { fixture } = require("./support.cjs");
const { CLASS_CATALOG } = require("../../dist/modules/level38/classes");

function next(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`No ${name} event`)); }, 7000);
    function receive(data) { clearTimeout(timer); resolve(data); }
    socket.once(name, receive);
  });
}
function socketFor(t, f) {
  const socket = io(`${f.origin}/level38`, { path: "/level38/socket.io", transports: ["websocket"], autoConnect: false, reconnection: false });
  t.after(() => socket.disconnect()); return socket;
}

test("additive Phase 3 migration preserves existing Phase 2 participants and does not backfill celebrations", { timeout: 60000 }, async (t) => {
  const f = await fixture(t, { migrate: false, seed: false });
  const schema = new URL(f.databaseUrl).searchParams.get("schema"); assert.match(schema, /^level38_test_[a-f0-9]{32}$/);
  await f.db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for (const name of ["202609130001_level38_foundation", "202609130002_level38_live_control", "202609130003_level38_state_backfill"]) {
    f.cli("db", "execute", "--file", `prisma/migrations/${name}/migration.sql`, "--schema", "prisma/schema.prisma");
    f.cli("migrate", "resolve", "--applied", name);
  }
  await f.db.$executeRaw`INSERT INTO "Participant" (id, "tokenHash", nickname, "expiresAt") VALUES ('legacy-viewer', 'keep-viewer-token', 'Garnet', NOW() + interval '1 year'), ('anonymous-viewer', 'keep-anonymous-token', NULL, NOW() + interval '1 year')`;
  await f.db.$executeRaw`INSERT INTO "Event" (id, slug, title, revision, "controlRevision", "updatedAt") VALUES ('legacy-event', 'level38', 'LEVEL 38', 87, 60, NOW())`;
  f.cli("migrate", "deploy");
  const participants = await f.db.participant.findMany(); assert.equal(participants.length, 2);
  assert.ok(participants.every((p) => p.classId === null));
  assert.equal(participants.find((p) => p.id === "legacy-viewer").tokenHash, "keep-viewer-token");
  const event = await f.db.event.findFirstOrThrow(); assert.equal(event.revision, 87); assert.equal(event.controlRevision, 60);
  assert.equal(event.unlockSequence, 0); assert.equal(event.lastUnlockedAt, null);
  assert.match(f.cli("migrate", "deploy").toString(), /No pending migrations/);
});

test("party classes are assigned once, survive concurrent joins/name changes and remain cosmetic/private", { timeout: 60000 }, async (t) => {
  const f = await fixture(t); await f.start();
  const initial = await f.call("/api/session"); const cookie = initial.cookie;
  assert.equal(initial.data.class, null); assert.equal(initial.data.classAssigned, false);
  const joins = await Promise.all(["Private Adventurer", "Other Player"].map((nickname) => f.call("/api/join", { nickname, classId: "administrator", role: "OWNER", class: { id: "knight" } }, cookie)));
  assert.ok(joins.every((r) => r.status === 200 && r.data.role === "VIEWER"));
  assert.equal(joins.filter((r) => r.data.classAssigned).length, 1);
  const job = joins[0].data.class;
  assert.deepEqual(joins[1].data.class, job);
  assert.ok(CLASS_CATALOG.some((entry) => entry.id === job.id));
  const renamed = await f.call("/api/join", { nickname: "Garnet", classId: "hacked" }, cookie);
  assert.equal(renamed.data.classAssigned, false); assert.deepEqual(renamed.data.class, job);
  for (let i = 0; i < 3; i++) {
    const session = await f.call("/api/session", undefined, cookie);
    assert.equal(session.data.nickname, "Garnet"); assert.deepEqual(session.data.class, job); assert.equal(session.data.classAssigned, false);
    assert.deepEqual(Object.keys(session.data).sort(), ["class", "classAssigned", "nickname", "role", "streamVisible", "votes"]);
  }
  assert.equal((await f.call("/api/control/state", undefined, cookie)).status, 401);
  const publicState = (await f.call("/api/state")).data;
  assert.doesNotMatch(JSON.stringify(publicState), /Garnet|Private Adventurer|tokenHash|classId|expiresAt/);
  const socket = socketFor(t, f); const snapshot = next(socket, "level38:state"); socket.connect();
  assert.doesNotMatch(JSON.stringify(await snapshot), /Garnet|tokenHash|classId|expiresAt/);
  const record = await f.db.participant.findFirstOrThrow();
  assert.equal(record.classId, job.id);
  // A named Phase 2 identity is backfilled lazily, once, without replacing its row/token.
  await f.db.participant.update({ where: { id: record.id }, data: { classId: null, variantId: null } });
  const backfill = await Promise.all([f.call("/api/session", undefined, cookie), f.call("/api/session", undefined, cookie)]);
  assert.equal(backfill.filter((r) => r.data.classAssigned).length, 1);
  assert.deepEqual(backfill[0].data.class, backfill[1].data.class);
  const retained = await f.db.participant.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(retained.tokenHash, record.tokenHash); assert.equal(retained.nickname, "Garnet");
});

test("unlock broadcasts only committed threshold crossings with durable sequence and no connection replay", { timeout: 60000 }, async (t) => {
  const f = await fixture(t); await f.start(); const mod = await f.operator("Isma", "MODERATOR");
  const quests = await f.db.quest.findMany({ where: { isSecret: false }, orderBy: { number: "asc" } });
  await f.db.quest.updateMany({ where: { id: { in: quests.slice(0, 37).map((q) => q.id) } }, data: { status: "COMPLETED", completedAt: new Date() } });
  const last = quests[37]; await f.db.quest.update({ where: { id: last.id }, data: { status: "ACTIVE" } });
  const sockets = [socketFor(t, f), socketFor(t, f)]; const received = [];
  for (const socket of sockets) { socket.on("level38:unlocked", (event) => received.push(event)); const snapshot = next(socket, "level38:state"); socket.connect(); assert.equal((await snapshot).event.unlockSequence, 0); }
  const notices = sockets.map((socket) => next(socket, "level38:unlocked"));
  const complete = (revision) => f.call(`/api/control/quests/${last.id}`, { action: "complete", controlRevision: revision }, mod.cookie);
  const results = await Promise.all([complete(0), complete(0)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const [first, second] = await Promise.all(notices);
  assert.deepEqual(first, second); assert.equal(first.sequence, 1); assert.equal(first.completed, 38); assert.equal(first.id, "level38:unlock:1");
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence, 1, "event was committed before broadcast");
  assert.deepEqual(Object.keys(first).sort(), ["completed", "durationMs", "id", "occurredAt", "revision", "sequence", "startsAt", "target", "version"]);
  const refresh = await f.call("/api/state"); assert.equal(refresh.data.event.completed, 38);
  const newcomer = socketFor(t, f); let replays = 0; newcomer.on("level38:unlocked", () => replays++);
  const fresh = next(newcomer, "level38:state"); newcomer.connect(); assert.equal((await fresh).event.unlockSequence, 1);
  await delay(100); assert.equal(replays, 0); assert.equal(received.length, 2);
  const control = (await f.call("/api/control/state", undefined, mod.cookie)).data;
  assert.equal((await f.call("/api/control/undo", { auditId: control.undo.auditId, controlRevision: 1 }, mod.cookie)).status, 200);
  assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence, 1);
  const again = next(sockets[0], "level38:unlocked"); assert.equal((await complete(2)).status, 200);
  const secondCrossing = await again; assert.equal(secondCrossing.sequence, 2); assert.equal(secondCrossing.id, "level38:unlock:2");
  const extra = quests[38];
  await f.call(`/api/control/quests/${extra.id}`, { action: "activate", controlRevision: 3 }, mod.cookie);
  assert.equal((await f.call(`/api/control/quests/${extra.id}`, { action: "complete", controlRevision: 4 }, mod.cookie)).data.event.completed, 39);
  await delay(100); assert.equal(received.length, 4); assert.equal((await f.db.event.findFirstOrThrow()).unlockSequence, 2);
});
