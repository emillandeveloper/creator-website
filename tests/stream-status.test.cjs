const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { getScheduledSpotlight, getMadridDayIndex, getTimeZoneLabel } = require("../dist/services/stream-schedule");
const { TwitchLiveStatus } = require("../dist/services/twitch-live");

test("Madrid schedule handles start/end boundaries, midnight and seasonal offsets", () => {
  const before = getScheduledSpotlight("es", new Date("2026-11-09T17:59:00Z"));
  assert.equal(before.mode, "upcoming");
  assert.match(before.game, /Randomizer/);
  assert.match(before.detail, /Hoy · 19:00–22:00 · Madrid · UTC\+1/);
  assert.equal(getScheduledSpotlight("es", new Date("2026-11-09T18:00:00Z")).mode, "scheduled");
  const after = getScheduledSpotlight("es", new Date("2026-11-09T21:00:00Z"));
  assert.equal(after.mode, "upcoming");
  assert.match(after.game, /Ocarina/);
  assert.match(after.detail, /Mañana/);
  assert.equal(getMadridDayIndex(new Date("2026-11-08T23:30:00Z")), 0);
  assert.match(getScheduledSpotlight("en", new Date("2026-11-08T23:30:00Z")).detail, /Today/);
  assert.match(getTimeZoneLabel(new Date("2027-03-28T12:00:00Z")), /UTC\+2/);
  assert.equal(getScheduledSpotlight("en", new Date("2027-03-28T17:00:00Z")).mode, "scheduled");
  assert.equal(getScheduledSpotlight("en", new Date("2026-10-25T17:00:00Z")).mode, "upcoming");
  assert.equal(getScheduledSpotlight("en", new Date("2026-10-25T18:00:00Z")).mode, "scheduled");
});

test("Twitch live checks are cached, coalesced and recover without retaining stale LIVE", async () => {
  let now = 0, requests = 0, fail = false;
  const api = { request: async (url) => {
    requests++;
    assert.equal(url, "streams?user_login=leonifelheim&first=1");
    if (fail) throw new Error("upstream private error");
    return { data: [{ user_login: "leonifelheim", type: "live", game_name: "Final Fantasy VII", title: "Randomizer", access_token: "must-not-leak" }] };
  } };
  const service = new TwitchLiveStatus(api, () => now);
  const values = await Promise.all([service.get(), service.get(), service.get()]);
  assert.equal(requests, 1);
  assert.deepEqual(values[0], { game: "Final Fantasy VII", title: "Randomizer" });
  now = 59000;
  await service.get();
  assert.equal(requests, 1);
  now = 60001; fail = true;
  assert.equal(await service.get(), null);
  assert.equal(requests, 2);
  now = 120002; fail = false;
  assert.deepEqual(await service.get(), values[0]);
  assert.equal(requests, 3);
});

test("missing credentials, offline, malformed responses and other channels never report LIVE", async () => {
  assert.equal(await new TwitchLiveStatus(null).get(), null);
  for (const response of [{ data: [] }, {}, { data: null }, { data: [{ type: "live", user_login: "someone_else", game_name: "RPG", title: "Other" }] }]) {
    const service = new TwitchLiveStatus({ request: async () => response });
    assert.equal(await service.get(), null);
  }
});

test("browser escapes Twitch text and restores schedule when status refresh fails", async () => {
  const schedule = { mode: "upcoming", label: "Next scheduled stream", game: "Suikoden I", detail: "Today · 19:00–22:00 · Madrid", linkLabel: "Watch on Twitch" };
  const dom = new JSDOM('<html lang="en"><div id="stream-spotlight" data-mode="upcoming"><p data-stream-label>Next scheduled stream</p><p data-stream-game>Suikoden I</p><p data-stream-detail>Today</p><a data-stream-link>Watch on Twitch</a></div></html>', { url: "https://example.test", runScripts: "outside-only", pretendToBeVisual: true });
  let fail = false;
  dom.window.fetch = async () => {
    if (fail) throw new Error("Network error");
    return { ok: true, json: async () => ({ mode: "live", label: "Live now", game: "Final Fantasy VII", detail: '<img src=x onerror="alert(1)">', linkLabel: "Watch live", schedule }) };
  };
  dom.window.eval(await fs.readFile(path.join(__dirname, "../public/js/stream-status.js"), "utf8"));
  await new Promise(setImmediate);
  const root = dom.window.document.getElementById("stream-spotlight");
  assert.equal(root.dataset.mode, "live");
  assert.equal(root.querySelector("img"), null);
  assert.match(root.querySelector("[data-stream-detail]").textContent, /<img/);
  fail = true;
  dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
  await new Promise(setImmediate);
  assert.equal(root.dataset.mode, "upcoming");
  assert.equal(root.querySelector("[data-stream-game]").textContent, "Suikoden I");
  dom.window.close();
});
