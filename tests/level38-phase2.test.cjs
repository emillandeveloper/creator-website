const { test } = require("node:test");
const assert = require("node:assert/strict");
const { allowedQuestActions } = require("../dist/modules/level38/quest-domain");
const { pollInput } = require("../dist/modules/level38/validation");

test("quest action matrix keeps final states terminal and requires secret reveal", () => {
  const actions = (status, hidden = false) => allowedQuestActions({ status, isSecret: hidden, revealedAt: null });
  assert.deepEqual(actions("LOCKED"), ["available"]);
  assert.deepEqual(actions("AVAILABLE"), ["activate", "skip"]);
  assert.deepEqual(actions("ACTIVE"), ["complete", "fail", "skip", "available"]);
  for (const status of ["COMPLETED", "FAILED", "SKIPPED"]) assert.deepEqual(actions(status), []);
  assert.deepEqual(actions("SECRET"), ["reveal"]);
  assert.deepEqual(actions("AVAILABLE", true), ["reveal"]);
});

test("poll validation restricts types/options and ignores client-supplied reference labels", () => {
  assert.throws(() => pollInput({ title: "Question", type: "ADMIN", options: [] }));
  assert.throws(() => pollInput({ title: "Question", type: "CUSTOM", options: Array(9).fill({ label: "Choice" }) }));
  assert.throws(() => pollInput({ title: "Question", type: "CUSTOM", options: [{ label: "<script>" }] }));
  assert.deepEqual(pollInput({ title: "Go ahead?", type: "YES_NO", options: [] }).options, [{ label: "Yes" }, { label: "No" }]);
  assert.deepEqual(pollInput({ title: "Next quest?", type: "NEXT_QUEST", options: [{ questId: "quest1", label: "Forged", gameId: "other" }] }).options, [{ questId: "quest1" }]);
});

test("patched Prisma configuration merger handles cyclic graphs without stack exhaustion", async () => {
  const { deepmerge } = await import("deepmerge-ts");
  assert.deepEqual(deepmerge({ migrations: { path: "prisma/migrations" } }, { schema: "prisma/schema.prisma" }), { migrations: { path: "prisma/migrations" }, schema: "prisma/schema.prisma" });
  const left = {}; left.self = left;
  const right = {}; right.self = right;
  assert.doesNotThrow(() => deepmerge(left, right));
  const { loadConfigFromFile } = require("@prisma/config");
  const result = await loadConfigFromFile({ configFile: "tests/fixtures/prisma.config.cjs" });
  assert.equal(result.error, undefined);
  assert.match(result.config.schema, /schema\.prisma$/);
});
