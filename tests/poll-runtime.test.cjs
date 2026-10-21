const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PollRuntime } = require("../dist/modules/level38/poll-runtime");
const { pollInput, pollSeconds, pollAction } = require("../dist/modules/level38/validation");

const state = (revision, endsAt = null) => ({ event: { revision }, polls: endsAt === null ? [] : [
  { id: "poll", status: "OPEN", cancelledAt: null, endsAt: new Date(endsAt).toISOString() },
] });
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

test("poll duration accepts only bounded whole seconds and defaults to sixty", () => {
  assert.equal(pollInput({ title: "Next quest", type: "NEXT_QUEST", options: [] }).durationSeconds, 60);
  assert.equal(pollInput({ title: "Next game", type: "NEXT_GAME", durationSeconds: 125, options: [] }).durationSeconds, 125);
  for (const value of [0, -1, 1.5, 3601, "60", null, Infinity, NaN]) assert.throws(() => pollSeconds(value));
  assert.equal(pollSeconds(1), 1); assert.equal(pollSeconds(3600), 3600);
  assert.equal(pollAction("cancel"), "cancel"); assert.throws(() => pollAction("reset"));
});

test("the runtime recovers persisted deadlines, reschedules extensions, and stays idle after closure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 });
  let calls = 0;
  const runtime = new PollRuntime({ expirePolls: async () => { calls++; return calls === 1 ? state(1, 160000) : state(3); } });
  t.after(() => runtime.close());
  runtime.start(); await settle(); assert.equal(calls, 1);
  t.mock.timers.tick(30000);
  runtime.update(state(2, 190000));
  t.mock.timers.tick(30000); await settle(); assert.equal(calls, 1, "the original timer was cancelled");
  t.mock.timers.tick(29999); await settle(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await settle(); assert.equal(calls, 2);
  t.mock.timers.tick(3600000); await settle(); assert.equal(calls, 2, "no database interval remains after closure");
});

test("a deadline arriving during an in-flight read is reconciled after that read", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 });
  let resolveFirst, calls = 0;
  const runtime = new PollRuntime({ expirePolls: () => {
    calls++;
    return calls === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(state(3));
  } });
  t.after(() => runtime.close());
  runtime.start();
  runtime.update(state(2, 100000));
  t.mock.timers.tick(0); assert.equal(calls, 1);
  resolveFirst(state(1)); await settle();
  t.mock.timers.tick(0); await settle();
  assert.equal(calls, 2, "the wake-up cannot be lost when a stale read finishes");
  t.mock.timers.tick(100000); await settle(); assert.equal(calls, 2);
});

test("startup errors retry with bounded backoff and shutdown cancels the retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 });
  t.mock.method(console, "error", () => {});
  let calls = 0;
  const runtime = new PollRuntime({ expirePolls: async () => { calls++; throw new Error("private database error"); } });
  runtime.start(); await settle(); assert.equal(calls, 1);
  t.mock.timers.tick(1999); await settle(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await settle(); assert.equal(calls, 2);
  await runtime.close();
  t.mock.timers.tick(3600000); await settle(); assert.equal(calls, 2);
  assert.ok(console.error.mock.calls.every(call => !call.arguments.join(" ").includes("private database error")));
});

test("shutdown waits for the pending transaction and does not schedule its returned deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 });
  let finish, calls = 0;
  const runtime = new PollRuntime({ expirePolls: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  runtime.start();
  let closed = false;
  const closing = runtime.close().then(() => { closed = true; });
  await settle(); assert.equal(closed, false);
  finish(state(1, 100001)); await closing; assert.equal(closed, true);
  t.mock.timers.tick(100000); await settle(); assert.equal(calls, 1);
});
