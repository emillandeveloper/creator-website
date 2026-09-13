const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

function page(t) {
  const dom = new JSDOM('<div id="progress-segments"></div><div id="event-toast" hidden></div><div id="level-up" hidden><canvas id="fireworks"></canvas><p id="celebration-progress"></p><button id="celebration-dismiss"></button></div>', { url: "https://level38.test", runScripts: "outside-only", pretendToBeVisual: true });
  t.after(() => dom.window.close());
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {} });
  dom.window.Level38 = { byId: (id) => dom.window.document.getElementById(id) };
  dom.window.eval(fs.readFileSync("public/js/level38/experience.js", "utf8"));
  const socket = new EventEmitter(); dom.window.Level38Experience.attach(socket); socket.emit("connect");
  return { window: dom.window, socket, observe: (revision, completed, unlockSequence) => dom.window.Level38Experience.observe({ event: { revision, completed, unlockSequence } }),
    visible: () => !dom.window.document.getElementById("level-up").hidden };
}
const event = (sequence, revision) => ({ version: 1, id: `level38:unlock:${sequence}`, sequence, revision, completed: 38, target: 38, startsAt: Date.now(), durationMs: 6500 });

test("celebration client suppresses refresh/reconnect/duplicates and supports a new crossing with reduced motion", async (t) => {
  const p = page(t); p.observe(4, 37, 0); p.observe(5, 38, 1);
  const first = event(1, 5); p.socket.emit("level38:unlocked", first); await delay(20);
  assert.equal(p.visible(), true); assert.equal(p.window.sessionStorage.getItem("level38:last-unlock"), "1");
  p.window.document.getElementById("celebration-dismiss").click();
  p.socket.emit("level38:unlocked", first); await delay(20); assert.equal(p.visible(), false);
  p.socket.emit("disconnect"); p.socket.emit("connect"); p.observe(5, 38, 1);
  p.socket.emit("level38:unlocked", first); await delay(20); assert.equal(p.visible(), false);
  const reload = page(t); reload.observe(5, 38, 1); reload.socket.emit("level38:unlocked", first); await delay(20); assert.equal(reload.visible(), false);
  p.observe(6, 37, 1); p.observe(7, 38, 2); p.socket.emit("level38:unlocked", event(2, 7)); await delay(20);
  assert.equal(p.visible(), true); assert.equal(p.window.document.getElementById("progress-segments").classList.contains("is-progressing"), false);
  p.window.document.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Escape" })); assert.equal(p.visible(), false);
  p.socket.emit("level38:unlocked", { ...event(3, 9), startsAt: Date.now() - 20000 }); await delay(20); assert.equal(p.visible(), false);
});

test("realtime notices coalesce and ignore initial history", async (t) => {
  const p = page(t); p.observe(10, 8, 0);
  p.socket.emit("quest:completed", { revision: 10 }); await delay(210);
  assert.equal(p.window.document.getElementById("event-toast").hidden, true);
  p.socket.emit("quest:activated", { revision: 11 }); p.socket.emit("game:changed", { revision: 12 });
  await delay(210); assert.match(p.window.document.getElementById("event-toast").textContent, /NEW ADVENTURE/);
});

test("server-time calibration tolerates a participant's device clock skew", async (t) => {
  const p = page(t); const serverTime = Date.now() - 600000;
  p.window.Level38Experience.observe({ serverTime, event: { revision: 1, completed: 37, unlockSequence: 0 } });
  p.socket.emit("level38:unlocked", { ...event(1, 2), startsAt: serverTime });
  await delay(20); assert.equal(p.visible(), true);
});
